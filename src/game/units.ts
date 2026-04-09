import { 
  GameState, 
  TerrainType, 
  UnitType, 
  getDistance, 
  getNeighbors, 
  HexCoord,
  Unit,
  UNIT_STATS,
} from '../types';
import { LoopSafety, getBoardMap, getUnitsMap } from '../utils';

export function getValidMoves(unit: Unit, board: GameState['board'], units: Unit[]): HexCoord[] {
  if (unit.hasActed) return [];
  const moves: HexCoord[] = [];
  const minCosts = new Map<string, number>();
  const queue: { coord: HexCoord; cost: number }[] = [{ coord: unit.coord, cost: 0 }];
  const safety = new LoopSafety('getValidMoves', 5000);
  
  const boardMap = getBoardMap(board);
  const unitsMap = getUnitsMap(units);

  // Starting terrain check: reduced range when starting on a forest tile
  const startTile = boardMap.get(`${unit.coord.q},${unit.coord.r}`);
  let maxMoves = unit.movesLeft;
  if (startTile?.terrain === TerrainType.FOREST) {
    if (unit.type === UnitType.INFANTRY || unit.type === UnitType.ARCHER) {
      maxMoves = Math.min(maxMoves, 1);
    } else if (unit.type === UnitType.KNIGHT) {
      maxMoves = Math.min(maxMoves, 2);
    }
  }

  while (queue.length > 0) {
    if (safety.tick()) break;
    const { coord, cost } = queue.shift()!;
    
    const neighbors = getNeighbors(coord);
    for (const neighbor of neighbors) {
      const tile = boardMap.get(`${neighbor.q},${neighbor.r}`);
      if (!tile) continue;

      const unitOnTile = unitsMap.get(`${neighbor.q},${neighbor.r}`);
      
      const isEnemySettlement = (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || 
                                 tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE) && 
                                 tile.ownerId !== null && tile.ownerId !== unit.ownerId;
      
      let isPassable = (!unitOnTile || unitOnTile.ownerId === unit.ownerId) && !isEnemySettlement;

      // Catapults cannot enter forests
      if (tile.terrain === TerrainType.FOREST && unit.type === UnitType.CATAPULT) {
        isPassable = false;
      }

      // Water rule: impassable unless adjacent to a village/settlement OR moving from another water tile
      if (tile.terrain === TerrainType.WATER) {
        const currentTile = boardMap.get(`${coord.q},${coord.r}`);
        const isMovingFromWater = currentTile?.terrain === TerrainType.WATER;
        
        if (!isMovingFromWater) {
          const tileNeighbors = getNeighbors(tile.coord);
          const hasAdjacentSettlement = tileNeighbors.some(n => {
            const nt = boardMap.get(`${n.q},${n.r}`);
            return nt && (nt.terrain === TerrainType.VILLAGE || nt.terrain === TerrainType.FORTRESS || 
                          nt.terrain === TerrainType.CASTLE || nt.terrain === TerrainType.GOLD_MINE);
          });
          if (!hasAdjacentSettlement) {
            isPassable = false;
          }
        }
      }
      
      if (isPassable) {
        // Forest tiles cost 2, others cost 1
        const moveCost = (tile.terrain === TerrainType.FOREST) ? 2 : 1;
        const nextCost = cost + moveCost;

        // Prorated entry: can enter a tile if we have at least 1 movement point left
        if (cost < maxMoves) {
          const key = `${neighbor.q},${neighbor.r}`;
          if (!minCosts.has(key) || minCosts.get(key)! > nextCost) {
            minCosts.set(key, nextCost);
            
            // Add to moves if no unit is there
            if (!unitOnTile) {
              moves.push(neighbor);
            }
            
            // Can only move further if we have enough moves left AFTER this step
            if (nextCost < maxMoves) {
              queue.push({ coord: neighbor, cost: nextCost });
            }
          }
        }
      }
    }
  }

  // Filter out duplicates (though minCosts handles it, moves array might have duplicates if we aren't careful)
  const uniqueMoves = Array.from(new Set(moves.map(m => `${m.q},${m.r}`))).map(key => {
    const [q, r] = key.split(',').map(Number);
    return { q, r, s: -q - r };
  });

  // Enforce supply range: unit cannot move further from a friendly settlement than its movement range
  const friendlySettlements = board.filter(t => t.ownerId === unit.ownerId && (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE));
  const maxRange = UNIT_STATS[unit.type].moves;

  const settlementSafety = new LoopSafety('getValidMoves-settlements', 1000);
  return uniqueMoves.filter(m => {
    if (settlementSafety.tick()) return false;
    let minSettlementDist = Infinity;
    for (const s of friendlySettlements) {
      const d = getDistance(m, s.coord);
      if (d < minSettlementDist) minSettlementDist = d;
    }
    return minSettlementDist <= maxRange;
  });
}

export function getUnitRange(unit: Unit, board: GameState['board']): number {
  const baseRange = UNIT_STATS[unit.type].range;
  const boardMap = getBoardMap(board);
  const currentTile = boardMap.get(`${unit.coord.q},${unit.coord.r}`);
  
  if (!currentTile) return baseRange;
  
  let modifiedRange = baseRange;
  
  if (unit.type === UnitType.ARCHER) {
    if (currentTile.terrain === TerrainType.FOREST) {
      modifiedRange = Math.max(1, modifiedRange - 1);
    }
  } else if (unit.type === UnitType.CATAPULT) {
    // No terrain bonuses for catapults
  }
  
  return modifiedRange;
}

export function getValidAttacks(unit: Unit, board: GameState['board'], units: Unit[], ignoreActed: boolean = false): HexCoord[] {
  if (unit.hasActed && !ignoreActed) return [];
  
  const range = getUnitRange(unit, board);
  const attacks: HexCoord[] = [];
  const safety = new LoopSafety('getValidAttacks', 2000);
  const boardMap = getBoardMap(board);

  // Attack units
  units.forEach(other => {
    if (safety.tick()) return;
    if (other.ownerId !== unit.ownerId) {
      const dist = getDistance(unit.coord, other.coord);
      if (dist <= range) {
        // Catapults cannot target units in forests
        const targetTile = boardMap.get(`${other.coord.q},${other.coord.r}`);
        if (unit.type === UnitType.CATAPULT && targetTile?.terrain === TerrainType.FOREST) {
          return;
        }
        attacks.push(other.coord);
      }
    }
  });

  // Attack settlements (only if owned by an enemy, not unclaimed)
  const settlementSafety = new LoopSafety('getValidAttacks-settlements', 2000);
  
  // Optimization: only check tiles within range instead of the whole board
  for (let dq = -range; dq <= range; dq++) {
    for (let dr = Math.max(-range, -dq - range); dr <= Math.min(range, -dq + range); dr++) {
      if (settlementSafety.tick()) break;
      const targetCoord = { q: unit.coord.q + dq, r: unit.coord.r + dr, s: unit.coord.s - dq - dr };
      const tile = boardMap.get(`${targetCoord.q},${targetCoord.r}`);
      
      if (tile) {
        const isSettlement = tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE;
        if (isSettlement && tile.ownerId !== null && tile.ownerId !== unit.ownerId) {
          const dist = getDistance(unit.coord, tile.coord);
          if (dist <= range) {
            if (!attacks.some(a => a.q === tile.coord.q && a.r === tile.coord.r)) {
              attacks.push(tile.coord);
            }
          }
        }
      }
    }
  }

  return attacks;
}

export function getAttackRange(unit: Unit, board: GameState['board'], units: Unit[]): HexCoord[] {
  const range = getUnitRange(unit, board);
  const inRange: HexCoord[] = [];
  const safety = new LoopSafety('getAttackRange', 2000);
  const boardMap = getBoardMap(board);
  const unitsMap = getUnitsMap(units);
  
  for (let dq = -range; dq <= range; dq++) {
    for (let dr = Math.max(-range, -dq - range); dr <= Math.min(range, -dq + range); dr++) {
      if (safety.tick()) break;
      const targetCoord = { q: unit.coord.q + dq, r: unit.coord.r + dr, s: unit.coord.s - dq - dr };
      const tile = boardMap.get(`${targetCoord.q},${targetCoord.r}`);
      
      if (tile) {
        const dist = getDistance(unit.coord, tile.coord);
        if (dist <= range && dist > 0) {
          // Check if there is an enemy unit or enemy settlement here
          const unitOnTile = unitsMap.get(`${targetCoord.q},${targetCoord.r}`);
          const hasEnemyUnit = unitOnTile && unitOnTile.ownerId !== unit.ownerId;
          const isEnemySettlement = (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE) && tile.ownerId !== null && tile.ownerId !== unit.ownerId;
          
          if (hasEnemyUnit || isEnemySettlement) {
            inRange.push(tile.coord);
          }
        }
      }
    }
  }
  
  return inRange;
}
