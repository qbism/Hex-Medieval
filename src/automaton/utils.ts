import { 
  GameState, 
  TerrainType, 
  UnitType, 
  getDistance, 
  getNeighbors, 
  HexCoord, 
  Unit, 
  UNIT_STATS, 
  Player, 
  HexTile 
} from '../types';
import { calculateIncome } from '../gameEngine';
import { LoopSafety } from '../utils';

export function findNearestTarget(coord: HexCoord, state: GameState, playerId: number) {
  let nearestPriorityDist = Infinity;
  let nearestActualDist = Infinity;
  let nearestCoord: HexCoord | null = null;
  let nearestIsSettlement = false;
  const safety = new LoopSafety('findNearestTarget', 10000);

  // Check enemy units
  for (const u of state.units) {
    if (safety.tick()) break;
    if (u.ownerId !== playerId) {
      const d = getDistance(coord, u.coord);
      if (d < nearestPriorityDist) {
        nearestPriorityDist = d;
        nearestActualDist = d;
        nearestCoord = u.coord;
        nearestIsSettlement = false;
      }
    }
  }

  // Check settlements (unclaimed or enemy)
  for (const t of state.board) {
    if (safety.tick()) break;
    if (t.ownerId !== playerId && (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)) {
      const actualDist = getDistance(coord, t.coord);
      // Settlements are prioritized by giving them a slight distance advantage
      let priorityDist = actualDist - 0.1;
      
      // Massive priority to vacant settlements to ensure AI grabs them
      if (t.ownerId === null) {
        priorityDist -= 5.0; // Effectively makes them look 5 hexes closer than they are
      }
      
      if (priorityDist < nearestPriorityDist) {
        nearestPriorityDist = priorityDist;
        nearestActualDist = actualDist;
        nearestCoord = t.coord;
        nearestIsSettlement = true;
      }
    }
  }

  return { 
    coord: nearestCoord, 
    dist: nearestActualDist, 
    priorityDist: nearestPriorityDist, 
    isSettlement: nearestIsSettlement 
  };
}

export function calculateKingdomStrength(player: Player, state: GameState) {
  const income = calculateIncome(player, state.board);
  const unitValue = state.units
    .filter(u => u.ownerId === player.id)
    .reduce((acc, u) => acc + UNIT_STATS[u.type].cost, 0);
  
  // Strength is a combination of current assets and economic power
  return unitValue + (income * 10);
}

export function calculateStrength(playerId: number, units: Unit[]) {
  return units
    .filter(u => u.ownerId === playerId)
    .reduce((acc, u) => acc + UNIT_STATS[u.type].cost, 0);
}

export function getChokepointScore(coord: HexCoord, board: HexTile[]): number {
  const neighbors = getNeighbors(coord);
  let traversableNeighbors = 0;
  const traversableIndices: number[] = [];
  
  neighbors.forEach((n, index) => {
    const tile = board.find(t => t.coord.q === n.q && t.coord.r === n.r);
    if (tile && tile.terrain !== TerrainType.WATER) {
      traversableNeighbors++;
      traversableIndices.push(index);
    }
  });

  // A chokepoint in a hex grid is most effective when it has 2 or 3 traversable neighbors
  // that are not all adjacent to each other (forming a bridge or a narrow pass).
  if (traversableNeighbors === 2) {
    const diff = Math.abs(traversableIndices[0] - traversableIndices[1]);
    // If neighbors are not adjacent (diff > 1 and diff < 5), it's a bridge/pass
    if (diff > 1 && diff < 5) return 2;
    return 1; // It's a corner
  }
  
  if (traversableNeighbors === 3) {
    // Check if they are all adjacent
    let allAdjacent = true;
    for (let i = 0; i < traversableIndices.length; i++) {
      const current = traversableIndices[i];
      const next = traversableIndices[(i + 1) % traversableIndices.length];
      const diff = Math.abs(current - next);
      if (diff !== 1 && diff !== 5) {
        allAdjacent = false;
        break;
      }
    }
    if (!allAdjacent) return 1.5;
    return 0.5;
  }

  return 0;
}

export function findNearestEnemySettlement(coord: HexCoord, state: GameState, playerId: number) {
  let nearestDist = Infinity;
  let nearestCoord: HexCoord | null = null;
  const safety = new LoopSafety('findNearestEnemySettlement', 10000);

  for (const t of state.board) {
    if (safety.tick()) break;
    if (t.ownerId !== null && t.ownerId !== playerId && (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)) {
      const d = getDistance(coord, t.coord);
      if (d < nearestDist) {
        nearestDist = d;
        nearestCoord = t.coord;
      }
    }
  }

  return { coord: nearestCoord, dist: nearestDist };
}
