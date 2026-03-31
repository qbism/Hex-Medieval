import { 
  GameState, 
  Player, 
  TerrainType, 
  UnitType, 
  UNIT_STATS, 
  HexCoord, 
  getDistance, 
  HexTile,
  UPGRADE_COSTS,
  SETTLEMENT_INCOME
} from '../types';
import { findNearestTarget, getChokepointScore, findNearestEnemySettlement } from './utils';
import { calculateIncome } from '../gameEngine';
import { BASE_REWARD } from './constants';
import { LoopSafety } from '../utils';
import { ThreatInfo } from './threatAnalysis';

export function getRecruitmentAction(
  state: GameState, 
  currentPlayer: Player, 
  threatMatrix: Map<string, ThreatInfo>,
  influenceMap: Map<string, number>,
  eminentThreatBases: HexTile[],
  possibleThreatBases: HexTile[],
  isUnderThreat: boolean,
  isEarlyGame: boolean,
  isSavingForMine: boolean,
  isSavingForVillage: boolean,
  isLaggingStrength: boolean,
  isLaggingIncome: boolean,
  isBarbarian: boolean = false
) {
  const recruitmentTiles = state.board.filter(t => 
    t.ownerId === currentPlayer.id && 
    (t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.VILLAGE) &&
    !state.units.some(u => u.coord.q === t.coord.q && u.coord.r === t.coord.r)
  );

  if (recruitmentTiles.length === 0) return null;

  const myUnitCount = state.units.filter(u => u.ownerId === currentPlayer.id).length;
  const income = calculateIncome(currentPlayer, state.board);

  // Economic Horizon: How many turns we care about
  const HORIZON = 10;

  // Savings Account Logic: If we are saving for a high-reward item, we might skip recruitment
  const savingsTarget = isSavingForMine ? UPGRADE_COSTS[TerrainType.GOLD_MINE] : (isSavingForVillage ? UPGRADE_COSTS[TerrainType.VILLAGE] : 0);
  let currentGold = currentPlayer.gold;
  
  // Barbarians spend roughly 1/3 on expansion and 2/3 on infantry
  // We implement this by making them "save" 1/3 of their gold during recruitment
  if (isBarbarian) {
    const expansionBudget = Math.floor(currentPlayer.gold / 3);
    currentGold = currentPlayer.gold - expansionBudget;
  }
  
  // If we are under threat, defense is priority 1, skip savings
  const effectiveSavingsTarget = isUnderThreat ? 0 : savingsTarget;
  
  // Potential targets for evaluation
  const targets = [
    ...state.board.filter(t => 
      (t.ownerId === null || t.ownerId !== currentPlayer.id) && 
      (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
    ).map(t => ({ 
      coord: t.coord, 
      value: SETTLEMENT_INCOME[t.terrain] * HORIZON, 
      isSettlement: true, 
      ownerId: t.ownerId,
      unitType: undefined 
    })),
    ...state.units.filter(u => u.ownerId !== currentPlayer.id).map(u => ({ 
      coord: u.coord, 
      value: UNIT_STATS[u.type].cost, 
      isSettlement: false, 
      ownerId: u.ownerId,
      unitType: u.type 
    }))
  ];

  let bestAction: { type: UnitType, coord: HexCoord, score: number } | null = null;

  const recruitSafety = new LoopSafety('getAutomatonBestAction-recruit-economic', 2000);
  
  for (const t of recruitmentTiles) {
    if (recruitSafety.tick()) break;

    const allowedUnitTypes = isBarbarian ? [UnitType.INFANTRY] : (Object.keys(UNIT_STATS) as UnitType[]);

    for (const unitType of allowedUnitTypes) {
      const stats = UNIT_STATS[unitType];
      if (currentGold < stats.cost) continue;
      
      // Check if buying this unit puts us too far from our savings target
      if (effectiveSavingsTarget > 0 && (currentGold - stats.cost) < effectiveSavingsTarget * 0.5 && !isLaggingStrength) {
        // Only allow if it's a very cheap unit and we are not desperate
        if (stats.cost > 50) continue;
      }

      let bestUnitScore = -Infinity;
      
      // Evaluate this unit type against all targets from this tile
      for (const target of targets) {
        const dist = getDistance(t.coord, target.coord);
        
        // Calculate turns to act
        let turnsToAct: number;
        if (dist <= stats.range) {
          turnsToAct = 1; // Can act next turn (recruited units can't act same turn)
        } else {
          // turns = 1 (spawn) + ceil((dist - range) / moves)
          turnsToAct = 1 + Math.ceil((dist - stats.range) / stats.moves);
        }

        if (turnsToAct > 8) continue; // Too far to care

        // Economic Value of Action
        // ROI = (Target Value - Unit Cost) / turnsToAct
        let actionValue = target.value;
        
        // Bonus for defending own territory
        const isNearMyBase = eminentThreatBases.some(b => getDistance(t.coord, b.coord) <= 3);

        // Knight Specific Logic
        if (unitType === UnitType.KNIGHT) {
          // Knights are great at sniping squishy targets
          if (!target.isSettlement && (target.unitType === UnitType.ARCHER || target.unitType === UnitType.CATAPULT)) {
            actionValue += BASE_REWARD * 1.5;
          }
          // Knights are great at rapid expansion/harassment
          // Bonus only if the settlement is unclaimed, within one move (turnsToAct <= 2), and unthreatened
          const threat = threatMatrix.get(`${target.coord.q},${target.coord.r}`);
          const targetThreatLevel = threat ? threat.minTurns : Infinity;
          if (target.isSettlement && target.ownerId === null && turnsToAct <= 2 && targetThreatLevel > 2) {
            actionValue += BASE_REWARD * 2.0;
          }
          // Knights are expensive; ensure we have decent income to sustain them
          if (income < 40 && !isUnderThreat) {
            actionValue -= BASE_REWARD * 2.0;
          }
        }

        // Catapult Specific Logic
        if (unitType === UnitType.CATAPULT) {
          // Catapults are siege engines
          if (target.isSettlement && target.ownerId !== null) {
            // High bonus for attacking enemy settlements
            actionValue += BASE_REWARD * 2.0;
            if (target.value > 400) { // High value settlements (Castles)
              actionValue += BASE_REWARD * 1.0;
            }
          }
          
          // Catapults are great for defense if placed correctly
          if (isNearMyBase && turnsToAct <= 2) {
            actionValue += BASE_REWARD * 1.5;
          }

          // Catapults are very expensive and slow
          // Penalty if income is low
          if (income < 50 && !isUnderThreat) {
            actionValue -= BASE_REWARD * 3.0;
          }

          // Mobility penalty: Catapults are useless if the front line is too far
          if (turnsToAct > 5) {
            actionValue -= BASE_REWARD * 2.0;
          }
        }
        
        // Bonus for capturing neutral settlements
        if (target.isSettlement && target.ownerId === null) {
          actionValue += BASE_REWARD * 0.5;
        }
        
        if (isNearMyBase) {
          actionValue += BASE_REWARD * 3.0; // Increased from 1.0 to 3.0
        }

        const score = (actionValue - stats.cost) / turnsToAct;
        
        // Influence Bonus: Recruit where we are losing control
        const influence = influenceMap.get(`${t.coord.q},${t.coord.r}`) || 0;
        const influenceBonus = influence < 0 ? Math.abs(influence) * 0.2 : 0;
        
        if (score + influenceBonus > bestUnitScore) {
          bestUnitScore = score + influenceBonus;
        }
      }

      // Penalize spawning in danger unless it's for defense
      const threat = threatMatrix.get(`${t.coord.q},${t.coord.r}`);
      const threatLevel = threat ? threat.minTurns : Infinity;
      if (threatLevel <= 2 && !isBarbarian) {
        // If it's an eminent threat base, we still penalize but less, 
        // because we might need to block or defend.
        const isDefensive = eminentThreatBases.some(b => b.coord.q === t.coord.q && b.coord.r === t.coord.r);
        const penalty = isDefensive ? stats.cost * 1.0 : stats.cost * 5.0; // Increased from 0.5/2.5 to 1.0/5.0
        bestUnitScore -= penalty;
      }

      if (bestUnitScore > (bestAction?.score ?? -Infinity)) {
        bestAction = { type: unitType, coord: t.coord, score: bestUnitScore };
      }
    }
  }

  // Minimum score threshold to actually recruit
  let minThreshold = isUnderThreat ? -50 : 10;
  
  // Interior Recruitment Penalty: If the recruitment tile is far from any enemy, increase the threshold
  if (bestAction) {
    const { dist: distToEnemy } = findNearestTarget(bestAction.coord, state, currentPlayer.id);
    if (distToEnemy > 6) {
      // For every tile beyond 6, increase threshold significantly
      minThreshold += (distToEnemy - 6) * 15;
    }
    
    // Also consider total unit count vs income
    const unitMaintenanceBuffer = income / 10; // Simple heuristic: 1 unit per 10 income
    if (myUnitCount > unitMaintenanceBuffer && !isUnderThreat) {
      minThreshold += (myUnitCount - unitMaintenanceBuffer) * 5;
    }
  }
  
  if (bestAction && bestAction.score > minThreshold) {
    return { type: 'recruit' as const, payload: { type: bestAction.type, coord: bestAction.coord } };
  }

  return null;
}
