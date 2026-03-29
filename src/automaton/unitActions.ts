import { 
  GameState, 
  Player, 
  Unit, 
  UnitType, 
  TerrainType, 
  UNIT_STATS, 
  getDistance, 
  getNeighbors, 
  HexCoord, 
  UPGRADE_COSTS,
  SETTLEMENT_INCOME
} from '../types';
import { getValidAttacks, getValidMoves } from '../gameEngine';
import { findNearestTarget, getChokepointScore } from './utils';
import { BASE_REWARD } from './constants';
import { LoopSafety } from '../utils';

export function getUnitAction(
  state: GameState, 
  currentPlayer: Player, 
  threatMatrix: Map<string, number>,
  influenceMap: Map<string, number>,
  eminentThreatBases: any[],
  possibleThreatBases: any[],
  playerStrengths: any[],
  myStrength: number,
  focusOnLeader: boolean,
  leaderId: number,
  empireCenter: HexCoord,
  hvt: Unit | null,
  isSavingForMine: boolean,
  isSavingForVillage: boolean,
  isLagging: boolean
) {
  const myUnits = state.units.filter(u => u.ownerId === currentPlayer.id && !u.hasActed);
  const unitToAct = myUnits[0];
  
  if (!unitToAct) return null;

  const stats = UNIT_STATS[unitToAct.type];
  const myValue = stats.cost;
  const HORIZON = 10;

  // 1. Evaluate Attacks
  const attacks = getValidAttacks(unitToAct, state.board, state.units);
  if (attacks.length > 0) {
    let bestAttack = attacks[0];
    let maxPriority = -Infinity;

    const attackSafety = new LoopSafety('getAutomatonBestAction-attacks-economic', 1000);
    for (const a of attacks) {
      if (attackSafety.tick()) break;
      
      const targetUnit = state.units.find(u => u.coord.q === a.q && u.coord.r === a.r);
      const targetTile = state.board.find(t => t.coord.q === a.q && t.coord.r === a.r);

      let priority = 0;

      if (targetUnit) {
        const targetValue = UNIT_STATS[targetUnit.type].cost;
        
        // Economic Trade: Target Value - My Risk
        const myThreatLevel = threatMatrix.get(`${unitToAct.coord.q},${unitToAct.coord.r}`) || Infinity;
        const risk = myThreatLevel <= 2 ? myValue : 0;
        
        priority = targetValue - risk;

        // Strategic Bonuses
        if (targetUnit.type === UnitType.CATAPULT) priority += BASE_REWARD * 1.0;
        if (focusOnLeader && targetUnit.ownerId === leaderId) priority += BASE_REWARD * 0.5;
        
        // Defense Bonus
        const isThreateningBase = eminentThreatBases.some(b => getDistance(a, b.coord) <= 3);
        if (isThreateningBase) priority += BASE_REWARD * 1.5;

        // Counterattack Bonus
        const isOccupyingMySettlement = targetTile && targetTile.ownerId === currentPlayer.id && (targetTile.terrain === TerrainType.VILLAGE || targetTile.terrain === TerrainType.FORTRESS || targetTile.terrain === TerrainType.CASTLE || targetTile.terrain === TerrainType.GOLD_MINE);
        if (isOccupyingMySettlement) priority += BASE_REWARD * 2.0;

      } else if (targetTile && targetTile.ownerId !== null && targetTile.ownerId !== currentPlayer.id) {
        // Attacking an empty settlement
        const settlementValue = SETTLEMENT_INCOME[targetTile.terrain] * HORIZON;
        priority = settlementValue * 0.2; // Settlements are high value but units are immediate threats
        
        if (focusOnLeader && targetTile.ownerId === leaderId) priority += BASE_REWARD * 0.4;
      }

      if (priority > maxPriority) {
        maxPriority = priority;
        bestAttack = a;
      }
    }

    // Only attack if it's not a suicidal bad trade (unless defending)
    if (maxPriority > -myValue * 0.5 || eminentThreatBases.length > 0) {
      return { type: 'attack' as const, payload: { unitId: unitToAct.id, target: bestAttack } };
    }
  }

  // 2. Evaluate Moves
  const moves = getValidMoves(unitToAct, state.board, state.units);
  moves.push(unitToAct.coord); // Staying put is an option
  
  if (moves.length > 0) {
    let bestMove = moves[0];
    let maxScore = -Infinity;

    const moveSafety = new LoopSafety('getAutomatonBestAction-moves-economic', 5000);
    
    // Potential move targets
    const moveTargets = [
      ...state.board.filter(t => 
        (t.ownerId === null || t.ownerId !== currentPlayer.id) && 
        (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
      ).map(t => ({ coord: t.coord, value: SETTLEMENT_INCOME[t.terrain] * HORIZON, isSettlement: true, ownerId: t.ownerId })),
      ...state.units.filter(u => u.ownerId !== currentPlayer.id).map(u => ({ coord: u.coord, value: UNIT_STATS[u.type].cost, isSettlement: false, ownerId: u.ownerId }))
    ];

    for (const m of moves) {
      if (moveSafety.tick()) break;
      
      let score = 0;
      const tile = state.board.find(t => t.coord.q === m.q && t.coord.r === m.r)!;

      // Immediate Capture Bonus
      if (tile.ownerId === null && (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE)) {
        score += (SETTLEMENT_INCOME[tile.terrain] * HORIZON) + BASE_REWARD * 1.0;
      }

      // Evaluate proximity to all targets
      for (const target of moveTargets) {
        const dist = getDistance(m, target.coord);
        const currentDist = getDistance(unitToAct.coord, target.coord);
        
        if (dist < currentDist) {
          // Moving closer to a target
          // ROI = Value / turnsToReach
          const turnsToReach = Math.ceil((dist - (target.isSettlement ? 0 : stats.range)) / stats.moves) + 1;
          score += target.value / (turnsToReach + 1);
        }
      }

      // Defense Scoring
      const isDefendingBase = eminentThreatBases.some(b => getDistance(m, b.coord) <= 2) || possibleThreatBases.some(b => getDistance(m, b.coord) <= 2);
      if (isDefendingBase) score += BASE_REWARD * 2.5; // Increased from 1.0 to 2.5

      // Influence Scoring (Potential Fields)
      // We want to move toward areas where we have low influence (expansion)
      // or areas where the enemy has high influence (contestation)
      const influence = influenceMap.get(`${m.q},${m.r}`) || 0;
      
      // If influence is very negative, it's a dangerous enemy zone
      // If influence is slightly negative or zero, it's a good place to expand
      if (influence < -50) {
        score -= 20; // Too dangerous
      } else if (influence < 0) {
        score += Math.abs(influence) * 0.5; // High contestation value
      } else {
        score += 5; // General expansion
      }

      // Threat Penalty
      const threatLevel = threatMatrix.get(`${m.q},${m.r}`) || Infinity;
      if (threatLevel <= 2) {
        // Significantly increased penalty to avoid sacrificial moves
        score -= myValue * 2.0; 
      } else if (threatLevel <= 3) {
        score -= myValue * 0.8;
      }

      // Upgrade Path Scoring: Prioritize moving to or staying on tiles we want to upgrade
      if (isSavingForMine && tile.terrain === TerrainType.MOUNTAIN) {
        score += 40;
        if (m.q === unitToAct.coord.q && m.r === unitToAct.coord.r) score += 20; // Extra bonus to stay put
      } else if (isSavingForVillage && tile.terrain === TerrainType.PLAINS) {
        score += 30;
        if (m.q === unitToAct.coord.q && m.r === unitToAct.coord.r) score += 15; // Extra bonus to stay put
      } else {
        // Only apply generic terrain bonuses if we aren't specifically looking for an upgrade tile
        if (tile.terrain === TerrainType.FOREST) score += 5;
        if (tile.terrain === TerrainType.MOUNTAIN) score += 10;
      }

      if (score > maxScore) {
        maxScore = score;
        bestMove = m;
      }
    }

    if (bestMove.q === unitToAct.coord.q && bestMove.r === unitToAct.coord.r) {
      return { type: 'skipUnit' as const, payload: { unitId: unitToAct.id } };
    }

    return { type: 'move' as const, payload: { unitId: unitToAct.id, target: bestMove } };
  }

  return { type: 'skipUnit' as const, payload: { unitId: unitToAct.id } };
}
