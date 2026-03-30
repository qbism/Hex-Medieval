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
  SETTLEMENT_INCOME
} from '../types';
import { calculateKingdomStrength } from './utils';
import { BASE_REWARD } from './constants';
import { calculateIncome } from '../gameEngine';

/**
 * Influence Map: A mathematical representation of board control.
 * Uses a decay function: Strength / (distance + 1)^1.5
 * Positive values = Friendly control, Negative = Enemy control.
 */
export function calculateInfluenceMap(state: GameState, currentPlayerId: number): Map<string, number> {
  const influenceMap = new Map<string, number>();
  
  for (const tile of state.board) {
    let influence = 0;
    const key = `${tile.coord.q},${tile.coord.r}`;

    for (const unit of state.units) {
      const stats = UNIT_STATS[unit.type];
      const dist = getDistance(unit.coord, tile.coord);
      
      // Lanchester-inspired power: Square of cost (quality) scaled by distance decay
      const power = Math.pow(stats.cost, 1.2) / Math.pow(dist + 1, 1.5);
      
      if (unit.ownerId === currentPlayerId) {
        influence += power;
      } else {
        influence -= power;
      }
    }

    // Settlement influence (Static control)
    if (tile.ownerId !== null) {
      const settlementPower = (SETTLEMENT_INCOME[tile.terrain] || 0) * 5;
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

export interface ThreatInfo {
  minTurns: number;
  totalThreatValue: number;
  attackerCount: number;
}

export function calculateThreatMatrix(state: GameState, currentPlayerId: number): Map<string, ThreatInfo> {
  const threatMatrix = new Map<string, ThreatInfo>();
  for (const u of state.units) {
    if (u.ownerId !== currentPlayerId) {
      const stats = UNIT_STATS[u.type];
      const threatValue = stats.cost;
      
      for (const t of state.board) {
        const dist = getDistance(u.coord, t.coord);
        let turns = Infinity;
        if (dist <= stats.range) turns = 1;
        else if (dist <= stats.moves + stats.range) turns = 2;
        else if (dist <= 2 * stats.moves + stats.range) turns = 3;
        
        if (turns <= 3) {
          const key = `${t.coord.q},${t.coord.r}`;
          const current = threatMatrix.get(key) || { minTurns: Infinity, totalThreatValue: 0, attackerCount: 0 };
          
          threatMatrix.set(key, {
            minTurns: Math.min(current.minTurns, turns),
            totalThreatValue: current.totalThreatValue + (threatValue / turns),
            attackerCount: current.attackerCount + 1
          });
        }
      }
    }
  }
  return threatMatrix;
}

export function assessThreats(state: GameState, currentPlayer: Player) {
  // Calculate strengths and incomes for all active players
  const playerStats = state.players.map(p => ({
    id: p.id,
    strength: (p.isEliminated || p.name === 'Barbarians') ? 0 : calculateKingdomStrength(p, state),
    income: (p.isEliminated || p.name === 'Barbarians') ? 0 : calculateIncome(p, state.board)
  }));
  
  const myStats = playerStats.find(ps => ps.id === currentPlayer.id) || { id: currentPlayer.id, strength: 0, income: 0 };

  const activeStats = playerStats.filter(ps => ps.strength > 0 || ps.income > 0);
  
  // Find the highest competitor in strength and income (excluding self)
  const competitors = activeStats.filter(ps => ps.id !== currentPlayer.id);
  
  const maxCompetitorStrength = competitors.length > 0 ? Math.max(...competitors.map(c => c.strength)) : 0;
  const maxCompetitorIncome = competitors.length > 0 ? Math.max(...competitors.map(c => c.income)) : 0;

  const isLaggingStrength = myStats.strength < maxCompetitorStrength;
  const isLaggingIncome = myStats.income < maxCompetitorIncome;
  const isLagging = isLaggingStrength || isLaggingIncome;

  const activeStrengths = playerStats.filter(ps => ps.strength > 0).sort((a, b) => b.strength - a.strength);
  let leaderId = -1;
  let isLeaderDominating = false;
  if (activeStrengths.length >= 2) {
    const leader = activeStrengths[0];
    const runnerUp = activeStrengths[1];
    leaderId = leader.id;
    // A player is dominating if they are 15% stronger than the runner-up
    isLeaderDominating = leader.strength > runnerUp.strength * 1.15;
  }
  
  // If someone else is dominating, we focus on them.
  const focusOnLeader = isLeaderDominating && leaderId !== currentPlayer.id;

  return { 
    playerStrengths: playerStats.map(p => ({ id: p.id, strength: p.strength })), 
    myStrength: myStats.strength, 
    focusOnLeader, 
    leaderId,
    isLaggingStrength,
    isLaggingIncome,
    isLagging
  };
}

export function identifyThreatenedSettlements(state: GameState, currentPlayerId: number, threatMatrix: Map<string, ThreatInfo>) {
  const mySettlements = state.board.filter(t => 
    t.ownerId === currentPlayerId && 
    (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
  );

  const eminentThreatBases = mySettlements.filter(s => {
    const threat = threatMatrix.get(`${s.coord.q},${s.coord.r}`);
    return threat !== undefined && threat.minTurns <= 2;
  });

  const possibleThreatBases = mySettlements.filter(s => {
    const threat = threatMatrix.get(`${s.coord.q},${s.coord.r}`);
    return threat !== undefined && threat.minTurns === 3;
  });

  const isUnderThreat = eminentThreatBases.length > 0 || possibleThreatBases.length > 0;

  return { mySettlements, eminentThreatBases, possibleThreatBases, isUnderThreat };
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
  
  for (const u of state.units) {
    if (u.ownerId !== currentPlayerId) {
      const stats = UNIT_STATS[u.type];
      const distToEmpire = getDistance(u.coord, empireCenter);
      
      let score = stats.cost;
      if (u.type === UnitType.CATAPULT) score *= 2;
      score += (20 - Math.min(20, distToEmpire)) * 10;
      
      if (score > maxHvtScore) {
        maxHvtScore = score;
        hvt = u;
      }
    }
  }
  return hvt;
}

export function isSavingForMine(state: GameState, currentPlayer: Player): boolean {
  if (currentPlayer.gold >= UPGRADE_COSTS[TerrainType.GOLD_MINE]) return false;
  
  return state.units.some(u => {
    if (u.ownerId !== currentPlayer.id) return false;
    const tile = state.board.find(t => t.coord.q === u.coord.q && t.coord.r === u.coord.r);
    if (tile?.terrain === TerrainType.MOUNTAIN) return true;
    const neighbors = getNeighbors(u.coord);
    return neighbors.some(n => {
      const nTile = state.board.find(t => t.coord.q === n.q && t.coord.r === n.r);
      return nTile?.terrain === TerrainType.MOUNTAIN && (nTile.ownerId === null || nTile.ownerId === currentPlayer.id);
    });
  }) ||
  state.board.some(t => t.ownerId === currentPlayer.id && t.terrain === TerrainType.MOUNTAIN);
}

export function isSavingForVillage(state: GameState, currentPlayer: Player): boolean {
  if (currentPlayer.gold >= UPGRADE_COSTS[TerrainType.VILLAGE]) return false;

  return state.units.some(u => {
    if (u.ownerId !== currentPlayer.id) return false;
    const tile = state.board.find(t => t.coord.q === u.coord.q && t.coord.r === u.coord.r);
    
    let canCatapultBuild = false;
    if (u.type === UnitType.CATAPULT) {
        let nearestFriendlySettlementDist = Infinity;
        for (const t of state.board) {
          if (t.ownerId === currentPlayer.id && (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)) {
            const d = getDistance(t.coord, u.coord);
            if (d < nearestFriendlySettlementDist) nearestFriendlySettlementDist = d;
          }
        }
        canCatapultBuild = nearestFriendlySettlementDist >= 2;
    }

    if (tile?.terrain !== TerrainType.PLAINS || (tile.ownerId !== null && tile.ownerId !== currentPlayer.id)) return false;
    if (u.type === UnitType.CATAPULT && !canCatapultBuild) return false;

    let score = BASE_REWARD * 0.2;
    const nearbyFriendlySettlements = state.board.filter(t => 
      t.ownerId === currentPlayer.id && 
      (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE) &&
      getDistance(t.coord, tile.coord) <= 2 &&
      !(t.coord.q === tile.coord.q && t.coord.r === tile.coord.r)
    ).length;

    if (nearbyFriendlySettlements === 0) {
      score += BASE_REWARD * 0.6;
    } else if (nearbyFriendlySettlements >= 2) {
      score -= BASE_REWARD * 0.2;
    }

    const neighbors = getNeighbors(tile.coord);
    let resourceBonus = 0;
    for (const n of neighbors) {
      const nTile = state.board.find(t => t.coord.q === n.q && t.coord.r === n.r);
      if (nTile) {
        if (nTile.terrain === TerrainType.MOUNTAIN) resourceBonus += BASE_REWARD * 0.3;
        if (nTile.terrain === TerrainType.FOREST) resourceBonus += BASE_REWARD * 0.1;
        if (nTile.terrain === TerrainType.WATER) resourceBonus -= BASE_REWARD * 0.05;
      } else {
        resourceBonus -= BASE_REWARD * 0.1;
      }
    }
    score += resourceBonus;

    return score > 0;
  });
}
