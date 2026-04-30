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

export function calculateThreatMatrix(state: GameState, currentPlayerId: number): Map<string, ThreatInfo> {
  const threatMatrix = new Map<string, ThreatInfo>();
  const boardMap = getBoardMap(state.board);
  const unitsByCoord = new Map<string, Unit>();
  state.units.forEach(un => unitsByCoord.set(`${un.coord.q},${un.coord.r}`, un));
  
  const safety = new LoopSafety('calculateThreatMatrix', 100000);

  for (const u of state.units) {
    if (safety.tick()) break;
    // Only calculate threats FROM enemies TO the player
    // IMPORTANT: Settlements do not contribute threat. Only units are processed here.
    if (u.ownerId === currentPlayerId) continue;

    const stats = UNIT_STATS[u.type];
    const range = getUnitRange(u, state.board);
    const moves = stats.moves;
    const threatValue = stats.cost;

    // 1. Precise Eminent Targets (tiles hit THIS turn from CURRENT standing position)
    const eminentTargetKeys = new Set<string>();
    for (let dq = -range; dq <= range; dq++) {
      for (let dr = Math.max(-range, -dq - range); dr <= Math.min(range, -dq + range); dr++) {
        const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
        if (dist > range) continue; // Hex distance check
        
        const tKey = `${u.coord.q + dq},${u.coord.r + dr}`;
        const tTile = boardMap.get(tKey);
        if (!tTile) continue;
        if (u.type === UnitType.CATAPULT && tTile.terrain === TerrainType.FOREST) continue;
        eminentTargetKeys.add(tKey);
      }
    }

    // 2. Potential Threat (Movement + Range reach for strategic scoring)
    const reachable = new Set<string>();
    const queue: { q: number, r: number, cost: number }[] = [{ q: u.coord.q, r: u.coord.r, cost: 0 }];
    const visited = new Map<string, number>();
    const startKey = `${u.coord.q},${u.coord.r}`;
    visited.set(startKey, 0);
    reachable.add(startKey);

    let head = 0;
    while (head < queue.length) {
      if (safety.tick()) break;
      const { q, r, cost } = queue[head++];
      const neighbors = getNeighbors({ q, r, s: -q - r });
      
      for (const n of neighbors) {
        const nKey = `${n.q},${n.r}`;
        const nTile = boardMap.get(nKey);
        if (!nTile) continue;
        
        if (nTile.terrain === TerrainType.WATER) {
           const currentTile = boardMap.get(`${q},${r}`);
           if (currentTile && currentTile.terrain !== TerrainType.WATER) {
             const hasAdj = getNeighbors(n).some(nn => {
               const nt = boardMap.get(`${nn.q},${nn.r}`);
               return nt && [TerrainType.VILLAGE, TerrainType.FORTRESS, TerrainType.CASTLE, TerrainType.GOLD_MINE].includes(nt.terrain);
             });
             if (!hasAdj) continue;
           }
        }
        
        const blocker = unitsByCoord.get(nKey);
        if (blocker && blocker.ownerId === currentPlayerId) continue;

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

    const potentialRadius = range + moves + 1;
    for (let dq = -potentialRadius; dq <= potentialRadius; dq++) {
      for (let dr = Math.max(-potentialRadius, -dq - potentialRadius); dr <= Math.min(potentialRadius, -dq + potentialRadius); dr++) {
        const tKey = `${u.coord.q + dq},${u.coord.r + dr}`;
        const tTile = boardMap.get(tKey);
        if (!tTile) continue;

        const isEminent = eminentTargetKeys.has(tKey);
        const current = threatMatrix.get(tKey) || {
          minTurns: 2,
          totalThreatValue: 0,
          attackerCount: 0,
          eminentThreatValue: 0,
          eminentAttackerCount: 0
        };

        threatMatrix.set(tKey, {
          minTurns: isEminent ? 1 : Math.min(current.minTurns, 2),
          totalThreatValue: current.totalThreatValue + threatValue,
          attackerCount: current.attackerCount + 1,
          eminentThreatValue: current.eminentThreatValue + (isEminent ? threatValue : 0),
          eminentAttackerCount: current.eminentAttackerCount + (isEminent ? 1 : 0)
        });
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

  const isLaggingStrength = myStats.strength < maxCompetitorStrength * LAGGING_THRESHOLD;
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

export function isSavingForMine(state: GameState, currentPlayer: Player, isLaggingIncome: boolean): boolean {
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

export function isSavingForVillage(state: GameState, currentPlayer: Player, isCriticallyLaggingLargeEconomy: boolean): boolean {
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
