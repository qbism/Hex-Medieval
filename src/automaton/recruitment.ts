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
import { findNearestTarget, getChokepointScore as _getChokepointScore, findNearestEnemySettlement as _findNearestEnemySettlement } from './utils';
import { calculateIncome } from '../gameEngine';
import { 
  BASE_REWARD,
  HORIZON,
  BARBARIAN_EXPANSION_BUDGET_RATIO,
  SAVINGS_THRESHOLD_RATIO,
  CHEAP_UNIT_THRESHOLD,
  MAX_TURNS_TO_ACT,
  DEFENSE_DISTANCE_THRESHOLD,
  KNIGHT_SNIPE_BONUS,
  KNIGHT_EXPANSION_BONUS,
  KNIGHT_INCOME_THRESHOLD,
  KNIGHT_INCOME_PENALTY,
  KNIGHT_APPEAL_BOOST,
  CATAPULT_SIEGE_BONUS,
  CATAPULT_CASTLE_BONUS,
  CATAPULT_DEFENSE_BONUS,
  CATAPULT_INCOME_THRESHOLD,
  CATAPULT_INCOME_PENALTY,
  CATAPULT_MOBILITY_PENALTY_FAR,
  CATAPULT_MOBILITY_PENALTY_VERY_FAR,
  CATAPULT_APPEAL_BOOST,
  CATAPULT_PROXIMITY_BONUS_L1,
  CATAPULT_PROXIMITY_BONUS_L2,
  NEUTRAL_CAPTURE_BONUS,
  NEAR_BASE_BONUS,
  INFLUENCE_BONUS_RATIO,
  COMPOSITION_RATIO_THRESHOLD,
  COMPOSITION_PENALTY_FACTOR,
  EMINENT_PERIL_BONUS,
  SACRIFICIAL_DEFENSE_BONUS,
  EMINENT_PERIL_PENALTY_RATIO,
  DANGER_PENALTY_RATIO,
  MIN_RECRUIT_THRESHOLD_THREAT,
  MIN_RECRUIT_THRESHOLD_NORMAL,
  INTERIOR_DISTANCE_THRESHOLD,
  INTERIOR_PENALTY_FACTOR,
  MAINTENANCE_RATIO,
  MAINTENANCE_PENALTY_FACTOR
} from './constants';
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

  // Savings Account Logic: If we are saving for a high-reward item, we might skip recruitment
  const savingsTarget = isSavingForMine ? UPGRADE_COSTS[TerrainType.GOLD_MINE] : (isSavingForVillage ? UPGRADE_COSTS[TerrainType.VILLAGE] : 0);
  let currentGold = currentPlayer.gold;
  
  // Barbarians spend roughly 1/3 on expansion and 2/3 on infantry
  // We implement this by making them "save" 1/3 of their gold during recruitment
  if (isBarbarian) {
    const expansionBudget = Math.floor(currentPlayer.gold * BARBARIAN_EXPANSION_BUDGET_RATIO);
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

    const { dist: distToNearestEnemy } = findNearestTarget(t.coord, state, currentPlayer.id);

    const allowedUnitTypes = (Object.keys(UNIT_STATS) as UnitType[]);

    const typeSafety = new LoopSafety('getRecruitmentAction-types', 100);
    for (const unitType of allowedUnitTypes) {
      if (typeSafety.tick()) break;
      const stats = UNIT_STATS[unitType];
      if (currentGold < stats.cost) continue;
      
      // Check if buying this unit puts us too far from our savings target
      if (effectiveSavingsTarget > 0 && (currentGold - stats.cost) < effectiveSavingsTarget * SAVINGS_THRESHOLD_RATIO && !isLaggingStrength) {
        // Only allow if it's a very cheap unit and we are not desperate
        if (stats.cost > CHEAP_UNIT_THRESHOLD) continue;
      }

      let bestUnitScore = -Infinity;
      
      // Evaluate this unit type against all targets from this tile
      const targetSafety = new LoopSafety('getRecruitmentAction-targets', 1000);
      for (const target of targets) {
        if (targetSafety.tick()) break;
        const dist = getDistance(t.coord, target.coord);
        
        // Calculate turns to act
        let turnsToAct: number;
        if (dist <= stats.range) {
          turnsToAct = 1; // Can act next turn (recruited units can't act same turn)
        } else {
          // turns = 1 (spawn) + ceil((dist - range) / moves)
          turnsToAct = 1 + Math.ceil((dist - stats.range) / stats.moves);
        }

        if (turnsToAct > MAX_TURNS_TO_ACT) continue; // Too far to care

        // Economic Value of Action
        // ROI = (Target Value - Unit Cost) / turnsToAct
        let actionValue = target.value;
        
        // Bonus for defending own territory
        const isNearMyBase = eminentThreatBases.some(b => getDistance(t.coord, b.coord) <= DEFENSE_DISTANCE_THRESHOLD);

        // Knight Specific Logic
        if (unitType === UnitType.KNIGHT) {
          // Knights are great at sniping squishy targets
          if (!target.isSettlement && (target.unitType === UnitType.ARCHER || target.unitType === UnitType.CATAPULT)) {
            actionValue += BASE_REWARD * KNIGHT_SNIPE_BONUS;
          }
          // Knights are great at rapid expansion/harassment
          // Bonus only if the settlement is unclaimed, within one move (turnsToAct <= 2), and unthreatened
          const threat = threatMatrix.get(`${target.coord.q},${target.coord.r}`);
          const targetThreatLevel = threat ? threat.minTurns : Infinity;
          if (target.isSettlement && target.ownerId === null && turnsToAct <= 2 && targetThreatLevel > 2) {
            actionValue += BASE_REWARD * KNIGHT_EXPANSION_BONUS;
          }
          // Knights are expensive; ensure we have decent income to sustain them
          if (income < KNIGHT_INCOME_THRESHOLD && !isUnderThreat) {
            actionValue -= BASE_REWARD * KNIGHT_INCOME_PENALTY;
          }
          
          // General Knight appeal boost
          actionValue += BASE_REWARD * KNIGHT_APPEAL_BOOST;
        }

        // Catapult Specific Logic
        if (unitType === UnitType.CATAPULT) {
          // Catapults are siege engines
          if (target.isSettlement && target.ownerId !== null) {
            // High bonus for attacking enemy settlements
            actionValue += BASE_REWARD * CATAPULT_SIEGE_BONUS;
            if (target.value > 400) { // High value settlements (Castles)
              actionValue += BASE_REWARD * CATAPULT_CASTLE_BONUS;
            }
          }
          
          // Catapults are great for defense if placed correctly
          if (isNearMyBase && turnsToAct <= 2) {
            actionValue += BASE_REWARD * CATAPULT_DEFENSE_BONUS;
          }

          // Catapults are very expensive and slow
          // Penalty if income is low
          if (income < CATAPULT_INCOME_THRESHOLD && !isUnderThreat) {
            actionValue -= BASE_REWARD * CATAPULT_INCOME_PENALTY;
          }

          // Mobility penalty: Catapults are useless if the front line is too far
          if (turnsToAct > 5 && !isNearMyBase) {
            actionValue -= BASE_REWARD * CATAPULT_MOBILITY_PENALTY_FAR;
          } else if (turnsToAct > 6) {
            actionValue -= BASE_REWARD * CATAPULT_MOBILITY_PENALTY_VERY_FAR;
          }

          // General Catapult appeal boost
          actionValue += BASE_REWARD * CATAPULT_APPEAL_BOOST;

          // Proximity Bonus: Encourage catapults if enemies are close to the spawning settlement
          if (distToNearestEnemy <= 3) {
            actionValue += BASE_REWARD * CATAPULT_PROXIMITY_BONUS_L1;
          } else if (distToNearestEnemy <= 4) {
            actionValue += BASE_REWARD * CATAPULT_PROXIMITY_BONUS_L2;
          }
        }
        
        // Bonus for capturing neutral settlements
        if (target.isSettlement && target.ownerId === null) {
          actionValue += BASE_REWARD * NEUTRAL_CAPTURE_BONUS;
        }
        
        if (isNearMyBase) {
          actionValue += BASE_REWARD * NEAR_BASE_BONUS;
        }

        const score = (actionValue - stats.cost) / turnsToAct;
        
        // Influence Bonus: Recruit where we are losing control
        const influence = influenceMap.get(`${t.coord.q},${t.coord.r}`) || 0;
        const influenceBonus = influence < 0 ? Math.abs(influence) * INFLUENCE_BONUS_RATIO : 0;
        
        if (score + influenceBonus > bestUnitScore) {
          let finalScore = score + influenceBonus;
          
          // Composition Penalty: Avoid over-spamming one unit type
          const sameTypeCount = state.units.filter(u => u.ownerId === currentPlayer.id && u.type === unitType).length;
          const totalCount = state.units.filter(u => u.ownerId === currentPlayer.id).length;
          if (totalCount > 3) {
            const ratio = sameTypeCount / totalCount;
            if (ratio > COMPOSITION_RATIO_THRESHOLD) {
              finalScore -= BASE_REWARD * COMPOSITION_PENALTY_FACTOR * (ratio - COMPOSITION_RATIO_THRESHOLD);
            }
          }

          if (finalScore > bestUnitScore) {
            bestUnitScore = finalScore;
          }
        }
      }

      // Penalize spawning in danger unless it's for defense
      const threat = threatMatrix.get(`${t.coord.q},${t.coord.r}`);
      const threatLevel = threat ? threat.minTurns : Infinity;
      
      // Check if this specific tile is in eminent peril
      const isTileInEminentPeril = eminentThreatBases.some(b => b.coord.q === t.coord.q && b.coord.r === t.coord.r);
      
      if (isTileInEminentPeril) {
        // User's rule: Only sacrifice if reinforcements can arrive within 3 turns.
        // Otherwise, it's a "remote settlement" and we shouldn't waste units.
        const otherFriendlyUnits = state.units.filter(u => u.ownerId === currentPlayer.id);
        const canReinforce = otherFriendlyUnits.some(u => {
            const stats = UNIT_STATS[u.type];
            const dist = getDistance(u.coord, t.coord);
            // Can reach within 3 turns? (3 * moves + range)
            return dist <= 3 * stats.moves + stats.range;
        });

        if (canReinforce) {
          // Massive bonus for recruiting ANY unit at a tile in eminent peril to act as a blocker/defender
          bestUnitScore += BASE_REWARD * EMINENT_PERIL_BONUS;
          
          // Favor cheaper units for "sacrificial" defense to buy time
          if (stats.cost <= 100) {
            bestUnitScore += BASE_REWARD * SACRIFICIAL_DEFENSE_BONUS;
          }
        } else {
          // Remote settlement - don't waste units on a lost cause
          bestUnitScore -= BASE_REWARD * 10.0;
        }
      }

      if (threatLevel <= 2 && !isBarbarian) {
        // If it's an eminent threat base, we still penalize but less, 
        // because we might need to block or defend.
        const penalty = isTileInEminentPeril ? stats.cost * EMINENT_PERIL_PENALTY_RATIO : stats.cost * DANGER_PENALTY_RATIO;
        bestUnitScore -= penalty;
      }

      if (bestUnitScore > (bestAction?.score ?? -Infinity)) {
        bestAction = { type: unitType, coord: t.coord, score: bestUnitScore };
      }
    }
  }

  // Minimum score threshold to actually recruit
  let minThreshold = isUnderThreat ? MIN_RECRUIT_THRESHOLD_THREAT : MIN_RECRUIT_THRESHOLD_NORMAL;
  
  // Interior Recruitment Penalty: If the recruitment tile is far from any enemy, increase the threshold
  if (bestAction) {
    const { dist: distToEnemy } = findNearestTarget(bestAction.coord, state, currentPlayer.id);
    if (distToEnemy > INTERIOR_DISTANCE_THRESHOLD) {
      // For every tile beyond threshold, increase threshold significantly
      minThreshold += (distToEnemy - INTERIOR_DISTANCE_THRESHOLD) * INTERIOR_PENALTY_FACTOR;
    }
    
    // Also consider total unit count vs income
    const unitMaintenanceBuffer = income / MAINTENANCE_RATIO;
    if (myUnitCount > unitMaintenanceBuffer && !isUnderThreat) {
      minThreshold += (myUnitCount - unitMaintenanceBuffer) * MAINTENANCE_PENALTY_FACTOR;
    }
  }
  
  if (bestAction && bestAction.score > minThreshold) {
    return { type: 'recruit' as const, payload: { type: bestAction.type, coord: bestAction.coord } };
  }

  return null;
}
