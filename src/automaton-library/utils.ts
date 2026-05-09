import { GameState, HexCoord, TerrainType, HexTile, getNeighbors, getDistance, UnitType } from '../types';

export function calculateKingdomStrength(player: any, state: GameState): number {
  const playerId = player.id;
  let strength = 0;
  if (state.units) {
    state.units.forEach(u => {
      if (u.ownerId === playerId) {
        if (u.type === UnitType.INFANTRY) strength += 1;
        else if (u.type === UnitType.ARCHER) strength += 2;
        else if (u.type === UnitType.KNIGHT) strength += 4;
        else if (u.type === UnitType.CATAPULT) strength += 6;
      }
    });
  }
  if (state.board) {
    state.board.forEach(t => {
      if (t.ownerId === playerId && (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE)) {
        strength += 5; // Balanced with units
      }
    });
  }
  return strength;
}

export function findNearestTarget(
  start: HexCoord,
  state: GameState,
  myPlayerId: number
): { target: HexTile | null, dist: number } {
  let nearest: HexTile | null = null;
  let minDiff = Infinity;
  for (const t of state.board) {
    if (t.ownerId !== null && t.ownerId !== myPlayerId) {
      const dist = getDistance(start, t.coord, state.board);
      if (dist < minDiff) {
        minDiff = dist;
        nearest = t;
      }
    }
  }
  // Check units as well
  for (const u of state.units) {
    if (u.ownerId !== myPlayerId) {
      const dist = getDistance(start, u.coord, state.board);
      if (dist < minDiff) {
        minDiff = dist;
        const tile = state.board.find(t => t.coord.q === u.coord.q && t.coord.r === u.coord.r);
        if (tile) {
          nearest = tile;
        }
      }
    }
  }
  
  return { target: nearest, dist: minDiff };
}

export function getChokepointScore(state: GameState, coord: HexCoord): number {
  const neighbors = getNeighbors(coord);
  let impassableCount = 0;
  for (const n of neighbors) {
    const tile = state.board.find(t => t.coord.q === n.q && t.coord.r === n.r);
    if (!tile || tile.terrain === TerrainType.MOUNTAIN || tile.terrain === TerrainType.WATER) {
      impassableCount++;
    }
  }
  if (impassableCount >= 4) return 10;
  if (impassableCount === 3) return 5;
  return 0;
}

export function findNearestEnemySettlement(start: HexCoord, state: GameState, myPlayerId: number): { target: HexTile | null, dist: number } {
  let nearest: HexTile | null = null;
  let minDiff = Infinity;
  for (const t of state.board) {
    if (t.ownerId !== null && t.ownerId !== myPlayerId && 
       (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)) {
       const dist = getDistance(start, t.coord, state.board);
       if (dist < minDiff) {
         minDiff = dist;
         nearest = t;
       }
    }
  }
  return { target: nearest, dist: minDiff };
}
