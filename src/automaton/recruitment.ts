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

export function getRecruitmentAction(
  state: GameState, 
  currentPlayer: Player, 
  threatMatrix: Map<string, number>,
  influenceMap: Map<string, number>,
  eminentThreatBases: HexTile[],
  possibleThreatBases: HexTile[],
  isUnderThreat: boolean,
  isEarlyGame: boolean,
  isSavingForMine: boolean,
  isSavingForVillage: boolean,
  isLaggingStrength: boolean,
  isLaggingIncome: boolean
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
  const currentGold = currentPlayer.gold;
  
  // If we are under threat, defense is priority 1, skip savings
  const effectiveSavingsTarget = isUnderThreat ? 0 : savingsTarget;
  
  // Potential targets for evaluation
  const targets = [
    ...state.board.filter(t => 
      (t.ownerId === null || t.ownerId !== currentPlayer.id) && 
      (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
    ).map(t => ({ coord: t.coord, value: SETTLEMENT_INCOME[t.terrain] * HORIZON, isSettlement: true, ownerId: t.ownerId })),
    ...state.units.filter(u => u.ownerId !== currentPlayer.id).map(u => ({ coord: u.coord, value: UNIT_STATS[u.type].cost, isSettlement: false, ownerId: u.ownerId }))
  ];

  let bestAction: { type: UnitType, coord: HexCoord, score: number } | null = null;

  const recruitSafety = new LoopSafety('getAutomatonBestAction-recruit-economic', 2000);
  
  for (const t of recruitmentTiles) {
    if (recruitSafety.tick()) break;

    for (const unitType of Object.keys(UNIT_STATS) as UnitType[]) {
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
        let turnsToAct = 0;
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
        
        // Bonus for capturing neutral settlements
        if (target.isSettlement && target.ownerId === null) {
          actionValue += BASE_REWARD * 0.5;
        }
        
        // Bonus for defending own territory
        const isNearMyBase = eminentThreatBases.some(b => getDistance(t.coord, b.coord) <= 3);
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
      const threatLevel = threatMatrix.get(`${t.coord.q},${t.coord.r}`) || Infinity;
      if (threatLevel <= 2 && !eminentThreatBases.some(b => b.coord.q === t.coord.q && b.coord.r === t.coord.r)) {
        // Significantly increased penalty to avoid sacrificial spawns
        bestUnitScore -= BASE_REWARD * 2.0; 
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
