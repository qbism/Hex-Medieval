import { 
  GameState, 
  Unit, 
  UNIT_STATS, 
  getDistance, 
  Player, 
  TerrainType, 
  HexTile,
  HexCoord,
  UnitType,
  getNeighbors,
  UPGRADE_COSTS,
  SETTLEMENT_INCOME,
  ThreatInfo
} from '../types';
export type { ThreatInfo };
import { getUnitRange } from '../game/units';
import { calculateKingdomStrength } from './utils';
import { 
  BASE_REWARD,
  INFLUENCE_POWER_EXPONENT,
  INFLUENCE_DECAY_EXPONENT,
  SETTLEMENT_INFLUENCE_MULT,
  LAGGING_THRESHOLD,
  DOMINATING_THRESHOLD,
  HVT_CATAPULT_MULT,
  HVT_DISTANCE_FACTOR,
  HVT_SCORE_MULT,
  SAVING_VILLAGE_BASE_SCORE,
  SAVING_VILLAGE_ISOLATION_BONUS,
  SAVING_VILLAGE_CLUSTERING_PENALTY,
  SAVING_VILLAGE_MOUNTAIN_BONUS,
  SAVING_VILLAGE_FOREST_BONUS,
  SAVING_VILLAGE_WATER_PENALTY,
  SAVING_VILLAGE_MAP_EDGE_PENALTY
} from './constants';
import { calculateIncome } from '../gameEngine';
import { LoopSafety, getBoardMap } from '../utils';

/**
 * Influence Map: A mathematical representation of board control.
 * Uses a decay function: Strength / (distance + 1)^1.5
 * Positive values = Friendly control, Negative = Enemy control.
 */
export function calculateInfluenceMap(state: GameState, currentPlayerId: number): Map<string, number> {
  const influenceMap = new Map<string, number>();
  const safety = new LoopSafety('calculateInfluenceMap', 50000);
  
  for (const tile of state.board) {
    if (safety.tick()) break;
    let influence = 0;
    const key = `${tile.coord.q},${tile.coord.r}`;

    for (const unit of state.units) {
      const stats = UNIT_STATS[unit.type];
      const dist = getDistance(unit.coord, tile.coord, state.board);
      
      // Lanchester-inspired power: Square of cost (quality) scaled by distance decay
      const power = Math.pow(stats.cost, INFLUENCE_POWER_EXPONENT) / Math.pow(dist + 1, INFLUENCE_DECAY_EXPONENT);
      
      if (unit.ownerId === currentPlayerId) {
        influence += power;
      } else {
        influence -= power;
      }
    }

    // Settlement influence (Static control)
    if (tile.ownerId !== null) {
      const settlementPower = (SETTLEMENT_INCOME[tile.terrain] || 0) * SETTLEMENT_INFLUENCE_MULT;
      if (tile.ownerId === currentPlayerId) {
        influence += settlementPower;
      } else {
        influence -= settlementPower;
      }
    }

    influenceMap.set(key, influence);
  }

  return influenceMap;
}

export function getThreatAtCoord(coord: HexCoord, state: GameState, currentPlayerId: number, boardMap?: Map<string, HexTile>): ThreatInfo {
  const tKey = `${coord.q},${coord.r}`;
  // We should ideally use a cached matrix, but for individual lookups (like in TacticalSearch),
  // we do a quick check.
  let eminentThreatValue = 0;
  let eminentAttackerCount = 0;
  let totalThreatValue = 0;
  let attackerCount = 0;
  let minTurns = Infinity;

  const statsCache = new Map<UnitType, any>();
  const internalBoardMap = boardMap || getBoardMap(state.board);

  for (const u of state.units) {
    if (u.ownerId === currentPlayerId) continue;
    
    let stats = statsCache.get(u.type);
    if (!stats) {
      stats = UNIT_STATS[u.type];
      statsCache.set(u.type, stats);
    }
    
    const dist = getDistance(u.coord, coord, state.board);
    const range = getUnitRange(u, state.board);
    const moves = stats.moves;

    // Can hit this turn
    if (dist <= range) {
      if (u.type === UnitType.CATAPULT) {
        const targetTile = internalBoardMap.get(tKey);
        if (targetTile?.terrain === TerrainType.FOREST) continue;
      }
      
      eminentThreatValue += stats.cost;
      eminentAttackerCount++;
      minTurns = 1;
    } 
    // Can hit next turn (move + range)
    // For traps, we check if they can reach an ADJACENT tile and then hit
    else if (dist <= moves + range) {
      // Basic terrain check: if distance is moves+range, and there's forest, they probably can't reach
      // This is a heuristic to avoid full BFS here
      let effectiveMoves = moves;
      const targetTile = internalBoardMap.get(tKey);
      if (targetTile?.terrain === TerrainType.FOREST) effectiveMoves = Math.max(1, moves - 1);
      
      if (dist <= effectiveMoves + range) {
        totalThreatValue += stats.cost;
        attackerCount++;
        if (minTurns > 1) minTurns = 2;
      }
    }
  }

  return {
    minTurns: minTurns === Infinity ? 0 : minTurns,
    totalThreatValue: totalThreatValue + eminentThreatValue,
    attackerCount: attackerCount + eminentAttackerCount,
    eminentThreatValue,
    eminentAttackerCount
  };
}

export function calculateThreatMatrix(state: GameState, currentPlayerId: number): Map<string, ThreatInfo> {
  const threatMatrix = new Map<string, ThreatInfo>();
  const boardMap = getBoardMap(state.board);
  const enemies = state.units.filter(u => u.ownerId !== currentPlayerId);
  if (enemies.length === 0) return threatMatrix;

  const safety = new LoopSafety('calculateThreatMatrix', 50000);

  // Pre-calculate reach for each enemy unit to build the matrix efficiently
  for (const u of enemies) {
    if (safety.tick()) break;
    const stats = UNIT_STATS[u.type];
    const range = getUnitRange(u, state.board);
    const moves = stats.moves;

    // 1. Eminent threat (Range reach from current pos)
    // Using a simple radius check is faster than board.filter
    const eminentRadius = range;
    for (let q = -eminentRadius; q <= eminentRadius; q++) {
      for (let r = Math.max(-eminentRadius, -q - eminentRadius); r <= Math.min(eminentRadius, -q + eminentRadius); r++) {
        const tCoord = { q: u.coord.q + q, r: u.coord.r + r };
        const tKey = `${tCoord.q},${tCoord.r}`;
        const tile = boardMap.get(tKey);
        if (!tile) continue;

        if (u.type === UnitType.CATAPULT && tile.terrain === TerrainType.FOREST) continue;

        const current = threatMatrix.get(tKey) || { minTurns: 0, totalThreatValue: 0, attackerCount: 0, eminentThreatValue: 0, eminentAttackerCount: 0 };
        current.eminentThreatValue += stats.cost;
        current.eminentAttackerCount++;
        current.totalThreatValue += stats.cost;
        current.attackerCount++;
        current.minTurns = 1;
        threatMatrix.set(tKey, current);
      }
    }

    // 2. Potential threat (Reachable tiles + Range)
    // We use a small BFS for movement
    const reachable = new Set<string>();
    const queue: { q: number, r: number, cost: number }[] = [{ q: u.coord.q, r: u.coord.r, cost: 0 }];
    const visited = new Map<string, number>();
    visited.set(`${u.coord.q},${u.coord.r}`, 0);

    let head = 0;
    while (head < queue.length) {
      const { q, r, cost } = queue[head++];
      const neighbors = getNeighbors({ q, r, s: -q - r });
      for (const n of neighbors) {
        const nKey = `${n.q},${n.r}`;
        const nTile = boardMap.get(nKey);
        if (!nTile || nTile.terrain === TerrainType.MOUNTAIN || nTile.terrain === TerrainType.WATER) continue;
        
        const stepCost = nTile.terrain === TerrainType.FOREST ? 2 : 1;
        const total = cost + stepCost;
        if (total <= moves) {
          if (!visited.has(nKey) || total < visited.get(nKey)!) {
            visited.set(nKey, total);
            reachable.add(nKey);
            queue.push({ q: n.q, r: n.r, cost: total });
          }
        }
      }
    }

    // For every reachable tile, mark everything in range as threatened (minTurns=2)
    for (const rKey of reachable) {
      const rc = rKey.split(',').map(Number);
      for (let q = -range; q <= range; q++) {
        for (let r = Math.max(-range, -q - range); r <= Math.min(range, -q + range); r++) {
          const tCoord = { q: rc[0] + q, r: rc[1] + r };
          const tKey = `${tCoord.q},${tCoord.r}`;
          if (threatMatrix.get(tKey)?.minTurns === 1) continue; // Already eminent

          const tile = boardMap.get(tKey);
          if (!tile) continue;

          const current = threatMatrix.get(tKey) || { minTurns: 0, totalThreatValue: 0, attackerCount: 0, eminentThreatValue: 0, eminentAttackerCount: 0 };
          current.totalThreatValue += stats.cost;
          current.attackerCount++;
          if (current.minTurns === 0 || current.minTurns > 2) current.minTurns = 2;
          threatMatrix.set(tKey, current);
        }
      }
    }
  }

  return threatMatrix;
}

export function calculateHeatMap(state: GameState, currentPlayerId: number): Map<string, number> {
  const heatMap = new Map<string, number>();
  const safety = new LoopSafety('calculateHeatMap', 50000);
  
  for (const tile of state.board) {
    if (safety.tick()) break;
    let heat = 0;
    const key = `${tile.coord.q},${tile.coord.r}`;

    for (const unit of state.units) {
      if (unit.ownerId !== currentPlayerId) {
        const dist = getDistance(unit.coord, tile.coord, state.board);
        // Heat decays with distance: Strength / (dist + 1)
        const stats = UNIT_STATS[unit.type];
        heat += stats.cost / (dist + 1);
      }
    }
    heatMap.set(key, heat);
  }
  return heatMap;
}

export function assessThreats(state: GameState, currentPlayer: Player) {
  // Calculate strengths and incomes for all active players
  const playerStats = state.players.map(p => ({
    id: p.id,
    strength: p.isEliminated ? 0 : calculateKingdomStrength(p, state),
    income: p.isEliminated ? 0 : calculateIncome(p, state.board)
  }));
  
  const myStats = playerStats.find(ps => ps.id === currentPlayer.id) || { id: currentPlayer.id, strength: 0, income: 0 };

  const activeStats = playerStats.filter(ps => ps.strength > 0 || ps.income > 0);
  
  // Find the highest competitor in strength and income (excluding self)
  const competitors = activeStats.filter(ps => ps.id !== currentPlayer.id);
  
  const maxCompetitorStrength = competitors.length > 0 ? Math.max(...competitors.map(c => c.strength)) : 0;
  const maxCompetitorIncome = competitors.length > 0 ? Math.max(...competitors.map(c => c.income)) : 0;

  // Be more lenient early on about strength lag to prioritize initial growth
  const dynamicLagThreshold = state.turnNumber < 20 ? 0.65 : LAGGING_THRESHOLD;
  const isLaggingStrength = myStats.strength < maxCompetitorStrength * dynamicLagThreshold;
  const isLaggingIncome = myStats.income < maxCompetitorIncome * LAGGING_THRESHOLD;
  const isLagging = isLaggingStrength || isLaggingIncome;

  // New Rule: AI detects if it has a large economy (> 1000 income) but is still lagging significantly behind the leader.
  const isCriticallyLaggingLargeEconomy = myStats.income >= 1000 && myStats.income < maxCompetitorIncome * 0.85;

  const activeStrengths = playerStats.filter(ps => ps.strength > 0).sort((a, b) => b.strength - a.strength);
  let leaderId = -1;
  let isLeaderDominating = false;
  if (activeStrengths.length >= 2) {
    const leader = activeStrengths[0];
    const runnerUp = activeStrengths[1];
    leaderId = leader.id;
    // A player is dominating if they are 15% stronger than the runner-up
    isLeaderDominating = leader.strength > runnerUp.strength * DOMINATING_THRESHOLD;
  }
  
  // If someone else is dominating, we focus on them.
  const focusOnLeader = isLeaderDominating && leaderId !== currentPlayer.id;

  return { 
    playerStrengths: playerStats.map(p => ({ id: p.id, strength: p.strength })), 
    playerIncomes: playerStats.map(p => p.income),
    myStrength: myStats.strength, 
    focusOnLeader, 
    leaderId,
    isLaggingStrength,
    isLaggingIncome,
    isCriticallyLaggingLargeEconomy,
    isLagging
  };
}

export function identifyThreatenedSettlements(state: GameState, currentPlayerId: number, threatMatrix: Map<string, ThreatInfo>) {
  const mySettlements = state.board.filter(t => 
    t.ownerId === currentPlayerId && 
    (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
  );

  const threatenedBases = mySettlements.map(s => {
    const threat = threatMatrix.get(`${s.coord.q},${s.coord.r}`);
    return { settlement: s, threat };
  }).filter(t => t.threat !== undefined && t.threat.minTurns <= 2);

  const eminentThreatBases = threatenedBases.filter(t => t.threat!.minTurns <= 1).map(t => t.settlement);
  
  // Identify which players are the primary aggressors
  const attackerUnitCounts = new Map<number, number>();
  threatenedBases.forEach(tb => {
    // Find units of other players that can hit this base
    (state.units || []).forEach(u => {
      if (u.ownerId !== currentPlayerId && getDistance(u.coord, tb.settlement.coord, state.board) <= (UNIT_STATS[u.type].moves + getUnitRange(u, state.board))) {
        attackerUnitCounts.set(u.ownerId, (attackerUnitCounts.get(u.ownerId) || 0) + 1);
      }
    });
  });

  let primaryAggressorId = -1;
  let maxAttacks = 0;
  attackerUnitCounts.forEach((count, id) => {
    if (count > maxAttacks) {
      maxAttacks = count;
      primaryAggressorId = id;
    }
  });

  const possibleThreatBases: any[] = []; 
  const isUnderThreat = eminentThreatBases.length > 0;

  return { mySettlements, eminentThreatBases, possibleThreatBases, isUnderThreat, primaryAggressorId, threatenedBasesCount: threatenedBases.length };
}

export function getEmpireCenter(mySettlements: HexTile[]): HexCoord {
  if (mySettlements.length === 0) return { q: 0, r: 0, s: 0 };
  const qAvg = Math.round(mySettlements.reduce((acc, s) => acc + s.coord.q, 0) / mySettlements.length);
  const rAvg = Math.round(mySettlements.reduce((acc, s) => acc + s.coord.r, 0) / mySettlements.length);
  return { q: qAvg, r: rAvg, s: -qAvg - rAvg };
}

export function getHVT(state: GameState, currentPlayerId: number, empireCenter: HexCoord): Unit | null {
  let hvt: Unit | null = null;
  let maxHvtScore = -Infinity;
  const safety = new LoopSafety('getHVT', 1000);
  
  for (const u of state.units) {
    if (safety.tick()) break;
    if (u.ownerId !== currentPlayerId) {
      const stats = UNIT_STATS[u.type];
      const distToEmpire = getDistance(u.coord, empireCenter, state.board);
      
      let score = stats.cost;
      if (u.type === UnitType.CATAPULT) score *= HVT_CATAPULT_MULT;
      score += (HVT_DISTANCE_FACTOR - Math.min(HVT_DISTANCE_FACTOR, distToEmpire)) * HVT_SCORE_MULT;
      
      if (score > maxHvtScore) {
        maxHvtScore = score;
        hvt = u;
      }
    }
  }
  return hvt;
}

export function isSavingForMine(state: GameState, currentPlayer: Player, isLaggingIncome: boolean, isLaggingStrength: boolean = false): boolean {
  // If military is weak, we MUST NOT save for a mine - survival first!
  // BUT: if we have a healthy unit count-to-settlement ratio, we can afford to save for growth.
  const myUnits = state.units.filter(u => u.ownerId === currentPlayer.id);
  const mySettlements = state.board.filter(t => t.ownerId === currentPlayer.id && [TerrainType.VILLAGE, TerrainType.FORTRESS, TerrainType.CASTLE, TerrainType.GOLD_MINE].includes(t.terrain));
  const ratio = myUnits.length / Math.max(1, mySettlements.length);
  
  if (isLaggingStrength && ratio < 0.5 && currentPlayer.gold < 300) return false;
  
  const cost = UPGRADE_COSTS[TerrainType.GOLD_MINE];
  if (currentPlayer.gold >= cost) return false;
  
  // Only "save" if we can afford it within a reasonable timeframe
  // NEW: Up to 1/3 of income over a max of 3 turns planning
  const income = calculateIncome(currentPlayer, state.board);
  const turnsToAffordFull = (cost - currentPlayer.gold) / income;
  
  // If we can reach the goal in 3 turns by saving 1/3 income, or we are generally lagging income
  const canAffordSoonWithSaving = (currentPlayer.gold + (income * 0.33 * 3)) >= cost;
  
  if (!canAffordSoonWithSaving && !isLaggingIncome && turnsToAffordFull > 10) return false;

  const boardMap = getBoardMap(state.board);
  
  // Check if we have any units on or near mountains that we own or are neutral
  return state.units.some(u => {
    if (u.ownerId !== currentPlayer.id) return false;
    const tile = boardMap.get(`${u.coord.q},${u.coord.r}`);
    if (tile?.terrain === TerrainType.MOUNTAIN && (tile.ownerId === null || tile.ownerId === currentPlayer.id)) return true;
    
    const neighbors = getNeighbors(u.coord);
    return neighbors.some(n => {
      const nTile = boardMap.get(`${n.q},${n.r}`);
      return nTile?.terrain === TerrainType.MOUNTAIN && (nTile.ownerId === null || nTile.ownerId === currentPlayer.id);
    });
  });
}

export function isSavingForVillage(state: GameState, currentPlayer: Player, isCriticallyLaggingLargeEconomy: boolean, isLaggingStrength: boolean = false): boolean {
  // If military is weak, we MUST NOT save for a village - survival first!
  // BUT: if we have a healthy unit count-to-settlement ratio, we can afford to save for growth.
  const myUnits = state.units.filter(u => u.ownerId === currentPlayer.id);
  const mySettlements = state.board.filter(t => t.ownerId === currentPlayer.id && [TerrainType.VILLAGE, TerrainType.FORTRESS, TerrainType.CASTLE, TerrainType.GOLD_MINE].includes(t.terrain));
  const ratio = myUnits.length / Math.max(1, mySettlements.length);
  
  if (isLaggingStrength && ratio < 0.5 && currentPlayer.gold < 200) return false;

  const cost = UPGRADE_COSTS[TerrainType.VILLAGE];
  if (currentPlayer.gold >= cost) return false;

  // Only "save" if we can afford it soon (e.g. 8 turns - income priority!)
  const income = currentPlayer.incomeHistory?.[currentPlayer.incomeHistory.length - 1] || 10;
  const turnsToAfford = (cost - currentPlayer.gold) / income;
  
  let turnsThreshold = 8;
  if (isCriticallyLaggingLargeEconomy) turnsThreshold = 15; // Be more patient to grow large economies

  if (turnsToAfford > turnsThreshold) return false;

  const boardMap = getBoardMap(state.board);
  const safety = new LoopSafety('isSavingForVillage', 1000);
  return state.units.some(u => {
    if (safety.tick()) return false;
    if (u.ownerId !== currentPlayer.id) return false;
    const tile = boardMap.get(`${u.coord.q},${u.coord.r}`);
    
    let canCatapultBuild = true;
    if (u.type === UnitType.CATAPULT) {
        let nearestFriendlySettlementDist = Infinity;
        for (const t of state.board) {
          if (t.ownerId === currentPlayer.id && (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)) {
            const d = getDistance(t.coord, u.coord, state.board);
            if (d < nearestFriendlySettlementDist) nearestFriendlySettlementDist = d;
          }
        }
        canCatapultBuild = nearestFriendlySettlementDist >= 2;
    }

    if (tile?.terrain !== TerrainType.PLAINS || (tile.ownerId !== null && tile.ownerId !== currentPlayer.id)) return false;
    if (!canCatapultBuild) return false;

    let score = BASE_REWARD * SAVING_VILLAGE_BASE_SCORE;
    const nearbyFriendlySettlements = state.board.filter(t => 
      t.ownerId === currentPlayer.id && 
      (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE) &&
      getDistance(t.coord, tile.coord, state.board) <= 2 &&
      !(t.coord.q === tile.coord.q && t.coord.r === tile.coord.r)
    ).length;

    if (nearbyFriendlySettlements === 0) {
      score += BASE_REWARD * SAVING_VILLAGE_ISOLATION_BONUS;
    } else if (nearbyFriendlySettlements >= 2) {
      score -= BASE_REWARD * SAVING_VILLAGE_CLUSTERING_PENALTY;
    }

    const neighbors = getNeighbors(tile.coord);
    let resourceBonus = 0;
    const neighborSafety = new LoopSafety('isSavingForVillage-neighbors', 10);
    for (const n of neighbors) {
      if (neighborSafety.tick()) break;
      const nTile = boardMap.get(`${n.q},${n.r}`);
      if (nTile) {
        if (nTile.terrain === TerrainType.MOUNTAIN) resourceBonus += BASE_REWARD * SAVING_VILLAGE_MOUNTAIN_BONUS;
        if (nTile.terrain === TerrainType.FOREST) resourceBonus += BASE_REWARD * SAVING_VILLAGE_FOREST_BONUS;
        if (nTile.terrain === TerrainType.WATER) resourceBonus -= BASE_REWARD * SAVING_VILLAGE_WATER_PENALTY;
      } else {
        resourceBonus -= BASE_REWARD * SAVING_VILLAGE_MAP_EDGE_PENALTY;
      }
    }
    score += resourceBonus;

    return score > 0;
  });
}
