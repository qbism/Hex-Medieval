import { 
  GameState, 
  TerrainType, 
  UnitType, 
  Player, 
  axialToCube, 
  getDistance, 
  getNeighbors, 
  HexCoord,
  Unit,
  HexTile,
  UNIT_STATS,
  SETTLEMENT_INCOME,
  UPGRADE_COSTS
} from './types';
import { LoopSafety } from './utils';

const BOARD_RADIUS = 10;
const COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2'];

export function createInitialState(playerConfigs: { name: string; isAutomaton: boolean }[]): GameState {
  const players: Player[] = playerConfigs.map((config, i) => ({
    id: i,
    name: config.name,
    color: COLORS[i],
    isAutomaton: config.isAutomaton,
    gold: 500,
    isEliminated: false,
    incomeHistory: [],
    strengthHistory: [],
  }));

  // Add Barbarian player
  const barbarianId = players.length;
  players.push({
    id: barbarianId,
    name: 'Barbarians',
    color: '#444444',
    isAutomaton: true,
    gold: 0,
    isEliminated: true,
    incomeHistory: [],
    strengthHistory: [],
    isOriginalBarbarian: true,
  });

  // Place starting castles and units for each player
  const spawnPoints = getSpawnPoints(BOARD_RADIUS, playerConfigs.length);

  const board = generateBoard(BOARD_RADIUS, spawnPoints);
  const units: Unit[] = [];
  
  players.forEach((player, i) => {
    if (player.id === barbarianId) return;

    const spawn = spawnPoints[i];
    // Find the tile at spawn and make it a castle
    const tile = board.find(t => t.coord.q === spawn.q && t.coord.r === spawn.r);
    if (tile) {
      tile.terrain = TerrainType.CASTLE;
      tile.ownerId = player.id;
    }

    // Add starting unit
    const stats = UNIT_STATS[UnitType.INFANTRY];
    units.push({
      id: `unit-${player.id}-start`,
      type: UnitType.INFANTRY,
      ownerId: player.id,
      movesLeft: stats.moves,
      hasAttacked: false,
      hasActed: false,
      coord: axialToCube(spawn.q, spawn.r),
    });
  });

  return {
    board,
    units,
    players,
    currentPlayerIndex: 0,
    turnNumber: 1,
    selectedHex: null,
    selectedUnitId: null,
    possibleMoves: [],
    possibleAttacks: [],
    attackRange: [],
    winnerId: null,
    history: [],
    animations: [],
  };
}

export function checkWinner(state: GameState): number | null {
  if (state.isBarbarianInvasion) {
    const activePlayers = state.players.filter(p => !p.isEliminated);
    if (activePlayers.length === 1) {
      return activePlayers[0].id;
    }
    return null;
  }

  const activePlayers = state.players.filter(p => !p.isEliminated && p.name !== 'Barbarians');
  if (activePlayers.length === 1) {
    return activePlayers[0].id;
  }
  if (activePlayers.length === 0) {
    // Should not happen, but handle it
    return -1;
  }
  return null;
}

export function triggerBarbarianInvasion(state: GameState): GameState {
  const newState = { ...state, isBarbarianInvasion: true, winnerId: null };
  const barbarianIndex = newState.players.findIndex(p => p.isOriginalBarbarian);
  if (barbarianIndex === -1) return state;

  const barbarian = { ...newState.players[barbarianIndex] };
  barbarian.gold += 3000;
  barbarian.isEliminated = false;
  
  const newPlayers = [...newState.players];
  newPlayers[barbarianIndex] = barbarian;
  newState.players = newPlayers;

  const newBoard = [...newState.board];
  const newUnits = [...newState.units];

  // Find vacant plains or mountains
  const vacantTiles = newBoard.filter(t => 
    (t.terrain === TerrainType.PLAINS || t.terrain === TerrainType.MOUNTAIN) &&
    t.ownerId === null &&
    !newUnits.some(u => u.coord.q === t.coord.q && u.coord.r === t.coord.r)
  );

  // Sort by distance from center (descending) to favor edges
  vacantTiles.sort((a, b) => {
    const distA = (Math.abs(a.coord.q) + Math.abs(a.coord.r) + Math.abs(a.coord.s)) / 2;
    const distB = (Math.abs(b.coord.q) + Math.abs(b.coord.r) + Math.abs(b.coord.s)) / 2;
    // Add randomness to the sort
    return distB - distA + (Math.random() - 0.5) * 4;
  });

  const numVillages = Math.min(30, vacantTiles.length);
  for (let i = 0; i < numVillages; i++) {
    const tile = vacantTiles[i];
    const tileIndex = newBoard.findIndex(t => t.coord.q === tile.coord.q && t.coord.r === tile.coord.r);
    
    newBoard[tileIndex] = {
      ...tile,
      terrain: TerrainType.VILLAGE,
      ownerId: barbarian.id
    };

    const unitTypes = [UnitType.INFANTRY, UnitType.ARCHER, UnitType.KNIGHT, UnitType.CATAPULT];
    const randomType = unitTypes[Math.floor(Math.random() * unitTypes.length)];

    newUnits.push({
      id: `barbarian-invasion-${i}-${Date.now()}`,
      type: randomType,
      ownerId: barbarian.id,
      movesLeft: 0,
      hasAttacked: true,
      hasActed: true,
      coord: { ...tile.coord },
    });
  }

  newState.board = newBoard;
  newState.units = newUnits;
  
  return newState;
}

function generateBoard(radius: number, spawnPoints: HexCoord[]) {
  const tiles: HexTile[] = [];
  const coords: HexCoord[] = [];
  
  // 1. Create all coordinates
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      coords.push(axialToCube(q, r));
    }
  }

  // 2. Initialize with Plains
  coords.forEach(coord => {
    tiles.push({
      coord,
      terrain: TerrainType.PLAINS,
      ownerId: null,
    });
  });

  // Helper to get tile by coord
  const getTile = (q: number, r: number) => tiles.find(t => t.coord.q === q && t.coord.r === r);
  const getDistanceFromEdge = (coord: HexCoord, r: number) => {
    return r - Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(coord.s));
  };

  // 3. Generate Water (Lakes and Rivers)
  const totalTiles = tiles.length;
  const targetWaterCount = Math.floor(totalTiles * (0.15 + Math.random() * 0.05));
  let currentWaterCount = 0;

  const setWater = (coord: HexCoord) => {
    const tile = getTile(coord.q, coord.r);
    if (tile && tile.terrain !== TerrainType.WATER) {
      tile.terrain = TerrainType.WATER;
      currentWaterCount++;
      return true;
    }
    return false;
  };

  // A. Generate Lakes (evenly distributed using Poisson Disk Sampling)
  // minDist of 6 hexes, avoid the very edge
  const lakeSeeds = poissonDiskSampling(coords, 6, radius - 1, 15).slice(0, 3);
  lakeSeeds.forEach(seed => {
    const lakeSize = 3 + Math.floor(Math.random() * 4);
    const current = [seed];
    setWater(seed);
    for (let j = 0; j < lakeSize; j++) {
      const target = current[Math.floor(Math.random() * current.length)];
      const neighbors = getNeighbors(target).filter(n => getTile(n.q, n.r));
      if (neighbors.length > 0) {
        const next = neighbors[Math.floor(Math.random() * neighbors.length)];
        if (setWater(next)) {
          current.push(next);
        }
      }
    }
  });

  // B. Generate Rivers (connecting lakes to sea)
  lakeSeeds.forEach(lakeCenter => {
    let curr = lakeCenter;
    const safety = new LoopSafety('riverGeneration', 50);
    while (getDistanceFromEdge(curr, radius) > 0 && !safety.tick()) {
      const neighbors = getNeighbors(curr).filter(n => getTile(n.q, n.r));
      // Bias towards the edge
      neighbors.sort((a, b) => getDistanceFromEdge(a, radius) - getDistanceFromEdge(b, radius));
      // Pick one of the best 2 neighbors to add some wiggle
      curr = neighbors[Math.floor(Math.random() * Math.min(2, neighbors.length))];
      setWater(curr);
    }
  });

  // C. Add "Sea" (Perimeter water)
  const perimeterTiles = coords.filter(c => getDistanceFromEdge(c, radius) === 0);
  
  // First, ensure tiles where rivers hit are water, and their neighbors on perimeter for a "mouth"
  tiles.filter(t => t.terrain === TerrainType.WATER && getDistanceFromEdge(t.coord, radius) === 0).forEach(t => {
     getNeighbors(t.coord).filter(n => getDistanceFromEdge(n, radius) === 0).forEach(n => setWater(n));
  });

  // Then fill more perimeter until target reached
  const shuffledPerimeter = [...perimeterTiles].sort(() => Math.random() - 0.5);
  for (const pCoord of shuffledPerimeter) {
    if (currentWaterCount >= targetWaterCount) break;
    setWater(pCoord);
  }

  // 4. Generate Trees (Clustered)
  coords.forEach(coord => {
    const tile = getTile(coord.q, coord.r);
    if (!tile || tile.terrain !== TerrainType.PLAINS) return;
    
    // Probability increases if neighbors are trees
    const neighbors = getNeighbors(coord);
    const treeNeighbors = neighbors.filter(n => getTile(n.q, n.r)?.terrain === TerrainType.FOREST).length;
    const prob = 0.05 + (treeNeighbors * 0.2);
    if (Math.random() < prob) {
      tile.terrain = TerrainType.FOREST;
    }
  });

  // 5. Generate Mountains and Villages
  const numMountains = 12 + Math.floor(Math.random() * 9); // 12 to 20
  const mountainCoords = distributeEvenly(coords, numMountains, radius, spawnPoints);
  mountainCoords.forEach(mCoord => {
    const tile = tiles.find(t => t.coord.q === mCoord.q && t.coord.r === mCoord.r);
    // Only place on Plains or Forest
    if (tile && (tile.terrain === TerrainType.PLAINS || tile.terrain === TerrainType.FOREST)) {
      tile.terrain = TerrainType.MOUNTAIN;
    }
  });

  const numVillages = 12 + Math.floor(Math.random() * 9); // 12 to 20
  const villageCoords = distributeEvenly(coords, numVillages, radius, [...spawnPoints, ...mountainCoords]);
  villageCoords.forEach(vCoord => {
    const tile = tiles.find(t => t.coord.q === vCoord.q && t.coord.r === vCoord.r);
    // Only place on Plains or Forest (Forest becomes Village)
    // Also avoid placing a village on a mountain we just placed
    if (tile && (tile.terrain === TerrainType.PLAINS || tile.terrain === TerrainType.FOREST)) {
      tile.terrain = TerrainType.VILLAGE;
    }
  });

  // 6. Final cleanup
  // No longer forcing full perimeter water here, as it's handled in step 3
  
  return tiles;
}

function distributeEvenly(coords: HexCoord[], targetCount: number, radius: number, existingPoints: HexCoord[] = []): HexCoord[] {
  // We want to avoid the very edge
  const validCoords = coords.filter(c => {
    const d = (Math.abs(c.q) + Math.abs(c.r) + Math.abs(c.s)) / 2;
    return d < radius - 1;
  });

  if (validCoords.length === 0) return [];

  const points: HexCoord[] = [];
  
  while (points.length < targetCount) {
    let bestCandidate = validCoords[0];
    let maxDist = -1;
    
    // Generate candidates and pick the one furthest from existing points
    const numCandidates = 30; // higher = more even
    for (let i = 0; i < numCandidates; i++) {
      const candidate = validCoords[Math.floor(Math.random() * validCoords.length)];
      
      // Skip if already in points
      if (points.some(p => p.q === candidate.q && p.r === candidate.r)) continue;
      
      let minDistToExisting = Infinity;
      
      for (const p of points) {
        const d = getDistance(candidate, p);
        if (d < minDistToExisting) minDistToExisting = d;
      }
      
      for (const p of existingPoints) {
        const d = getDistance(candidate, p);
        if (d < minDistToExisting) minDistToExisting = d;
      }
      
      if (minDistToExisting === Infinity) {
        bestCandidate = candidate;
        break;
      }
      
      // Add slight randomness to the distance score
      const score = minDistToExisting + Math.random() * 0.5;
      
      if (score > maxDist) {
        maxDist = score;
        bestCandidate = candidate;
      }
    }
    
    points.push(bestCandidate);
  }

  return points;
}

function getSpawnPoints(radius: number, playerCount: number) {
  const inset = 3;
  const dist = radius - inset;
  
  // The 6 corners of the map, 3 tiles inboard.
  // We order them starting from bottom-right (5 o'clock) and going clockwise.
  // Index 0 is bottom-right, Index 1 is bottom-left (7 o'clock).
  // If we want Red (Player 0) at 6 o'clock, we can assign them to the bottom-right or bottom-left.
  // We'll use the bottom-right corner for Player 0.
  const corners = [
    { q: 0, r: dist, s: -dist },       // Bottom-right (5 o'clock)
    { q: -dist, r: dist, s: 0 },       // Bottom-left (7 o'clock)
    { q: -dist, r: 0, s: dist },       // Left (9 o'clock)
    { q: 0, r: -dist, s: dist },       // Top-left (11 o'clock)
    { q: dist, r: -dist, s: 0 },       // Top-right (1 o'clock)
    { q: dist, r: 0, s: -dist }        // Right (3 o'clock)
  ];
  
  const points = [];
  const step = 6 / playerCount;
  for (let i = 0; i < playerCount; i++) {
    const index = Math.round(i * step) % 6;
    points.push(corners[index]);
  }
  return points;
}

function getPointsAtDistance(center: HexCoord, d: number): HexCoord[] {
  const points: HexCoord[] = [];
  let curr = { q: center.q + d, r: center.r, s: center.s - d };
  const dirs = [
    { q: 0, r: 1, s: -1 }, { q: -1, r: 1, s: 0 }, { q: -1, r: 0, s: 1 },
    { q: 0, r: -1, s: 1 }, { q: 1, r: -1, s: 0 }, { q: 1, r: 0, s: -1 }
  ];
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < d; j++) {
      points.push(curr);
      curr = { q: curr.q + dirs[i].q, r: curr.r + dirs[i].r, s: curr.s + dirs[i].s };
    }
  }
  return points;
}

/**
 * Poisson Disk Sampling for hex grid to generate blue noise distribution.
 */
function poissonDiskSampling(coords: HexCoord[], minDist: number, radius: number, k: number = 30): HexCoord[] {
  const points: HexCoord[] = [];
  const active: HexCoord[] = [];
  
  // We want to avoid the very edge
  const validCoords = coords.filter(c => {
    const d = (Math.abs(c.q) + Math.abs(c.r) + Math.abs(c.s)) / 2;
    return d < radius - 1;
  });

  if (validCoords.length === 0) return [];

  // Start with a random point
  const start = validCoords[Math.floor(Math.random() * validCoords.length)];
  points.push(start);
  active.push(start);

  const safety = new LoopSafety('poissonDiskSampling', 2000);

  while (active.length > 0 && !safety.tick()) {
    const idx = Math.floor(Math.random() * active.length);
    const p = active[idx];
    let found = false;

    for (let i = 0; i < k; i++) {
      // Random distance between minDist and 2*minDist
      const d = minDist + Math.floor(Math.random() * minDist);
      const ring = getPointsAtDistance(p, d);
      const candidate = ring[Math.floor(Math.random() * ring.length)];

      // Check if candidate is in validCoords
      const inGrid = validCoords.find(c => c.q === candidate.q && c.r === candidate.r);
      if (inGrid) {
        if (points.every(pt => getDistance(pt, candidate) >= minDist)) {
          points.push(candidate);
          active.push(candidate);
          found = true;
          break;
        }
      }
    }

    if (!found) {
      active.splice(idx, 1);
    }
  }

  return points;
}

export function getValidMoves(unit: Unit, board: GameState['board'], units: Unit[]): HexCoord[] {
  if (unit.hasActed) return [];
  const moves: HexCoord[] = [];
  const visited = new Set<string>();
  const queue: { coord: HexCoord; dist: number }[] = [{ coord: unit.coord, dist: 0 }];
  const safety = new LoopSafety('getValidMoves', 5000);

  while (queue.length > 0) {
    if (safety.tick()) break;
    const { coord, dist } = queue.shift()!;
    const key = `${coord.q},${coord.r}`;
    
    if (visited.has(key)) continue;
    visited.add(key);

    if (dist > 0 && dist <= unit.movesLeft) {
      const unitOnTile = units.find(u => u.coord.q === coord.q && u.coord.r === coord.r);
      if (!unitOnTile) {
        moves.push(coord);
      }
    }

    if (dist < unit.movesLeft) {
      const neighbors = getNeighbors(coord);
      for (const neighbor of neighbors) {
        const tile = board.find(t => t.coord.q === neighbor.q && t.coord.r === neighbor.r);
        const unitOnTile = units.find(u => u.coord.q === neighbor.q && u.coord.r === neighbor.r);
        
        // Movement rules: can't move through enemy units or enemy settlements
        if (tile) {
          const isEnemySettlement = tile.ownerId !== null && tile.ownerId !== unit.ownerId && 
            (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || 
             tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE);
          
          let isPassable = !isEnemySettlement && (!unitOnTile || unitOnTile.ownerId === unit.ownerId);

          // Water rule: impassable unless adjacent to a village/settlement OR moving from another water tile
          if (tile.terrain === TerrainType.WATER) {
            const currentTile = board.find(t => t.coord.q === coord.q && t.coord.r === coord.r);
            const isMovingFromWater = currentTile?.terrain === TerrainType.WATER;
            
            if (!isMovingFromWater) {
              const tileNeighbors = getNeighbors(tile.coord);
              const hasAdjacentSettlement = board.some(t => 
                (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || 
                 t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE) &&
                tileNeighbors.some(n => n.q === t.coord.q && n.r === t.coord.r)
              );
              if (!hasAdjacentSettlement) {
                isPassable = false;
              }
            }
          }
          
          if (isPassable) {
            queue.push({ coord: neighbor, dist: dist + 1 });
          }
        }
      }
    }
  }

  // Filter out moves that end on a friendly unit
  const validMoves = moves.filter(m => !units.some(u => u.id !== unit.id && u.coord.q === m.q && u.coord.r === m.r));

  // Enforce supply range: unit cannot move further from a friendly settlement than its movement range
  const friendlySettlements = board.filter(t => t.ownerId === unit.ownerId && (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE));
  const maxRange = UNIT_STATS[unit.type].moves;

  return validMoves.filter(m => {
    let minSettlementDist = Infinity;
    for (const s of friendlySettlements) {
      const d = getDistance(m, s.coord);
      if (d < minSettlementDist) minSettlementDist = d;
    }
    return minSettlementDist <= maxRange;
  });
}

export function getValidAttacks(unit: Unit, board: GameState['board'], units: Unit[], ignoreActed: boolean = false): HexCoord[] {
  if (unit.hasActed && !ignoreActed) return [];
  
  const range = UNIT_STATS[unit.type].range;
  const attacks: HexCoord[] = [];

  // Attack units
  units.forEach(other => {
    if (other.ownerId !== unit.ownerId) {
      const dist = getDistance(unit.coord, other.coord);
      if (dist <= range) {
        attacks.push(other.coord);
      }
    }
  });

  // Attack settlements (only if owned by an enemy, not unclaimed)
  board.forEach(tile => {
    const isSettlement = tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE;
    if (isSettlement && tile.ownerId !== null && tile.ownerId !== unit.ownerId) {
      const dist = getDistance(unit.coord, tile.coord);
      if (dist <= range) {
        // Only add if not already in attacks (though coords are unique)
        if (!attacks.some(a => a.q === tile.coord.q && a.r === tile.coord.r)) {
          attacks.push(tile.coord);
        }
      }
    }
  });

  return attacks;
}

export function getAttackRange(unit: Unit, board: GameState['board'], units: Unit[]): HexCoord[] {
  const range = UNIT_STATS[unit.type].range;
  const inRange: HexCoord[] = [];
  
  board.forEach(tile => {
    const dist = getDistance(unit.coord, tile.coord);
    if (dist <= range && dist > 0) {
      // Check if there is an enemy unit or enemy settlement here
      const hasEnemyUnit = units.some(u => u.coord.q === tile.coord.q && u.coord.r === tile.coord.r && u.ownerId !== unit.ownerId);
      const isEnemySettlement = (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE) && tile.ownerId !== null && tile.ownerId !== unit.ownerId;
      
      if (hasEnemyUnit || isEnemySettlement) {
        inRange.push(tile.coord);
      }
    }
  });
  
  return inRange;
}

export function calculateIncome(player: Player, board: GameState['board']): number {
  const ownedTiles = board.filter(t => t.ownerId === player.id);
  let income = 0;
  ownedTiles.forEach(tile => {
    income += SETTLEMENT_INCOME[tile.terrain];
  });
  return income;
}

export function upgradeSettlement(state: GameState, coord: HexCoord): GameState {
  const tileIndex = state.board.findIndex(t => t.coord.q === coord.q && t.coord.r === coord.r);
  if (tileIndex === -1) return state;
  
  const tile = state.board[tileIndex];
  const player = state.players[state.currentPlayerIndex];
  let cost = 0;
  let nextTerrain: TerrainType | null = null;
  
  const unitOnTile = state.units.find(u => u.coord.q === coord.q && u.coord.r === coord.r && u.ownerId === player.id);

  if (tile.terrain === TerrainType.PLAINS && tile.ownerId !== player.id) {
    if (!unitOnTile || unitOnTile.hasActed) return state;
    cost = UPGRADE_COSTS[TerrainType.VILLAGE];
    nextTerrain = TerrainType.VILLAGE;
  } else if (tile.terrain === TerrainType.MOUNTAIN && tile.ownerId !== player.id) {
    if (!unitOnTile || unitOnTile.hasActed) return state;
    cost = UPGRADE_COSTS[TerrainType.GOLD_MINE];
    nextTerrain = TerrainType.GOLD_MINE;
  } else if (tile.terrain === TerrainType.VILLAGE && tile.ownerId === player.id) {
    cost = UPGRADE_COSTS[TerrainType.FORTRESS];
    nextTerrain = TerrainType.FORTRESS;
  } else if (tile.terrain === TerrainType.FORTRESS && tile.ownerId === player.id) {
    cost = UPGRADE_COSTS[TerrainType.CASTLE];
    nextTerrain = TerrainType.CASTLE;
  }

  if (nextTerrain && player.gold >= cost) {
    const newBoard = [...state.board];
    newBoard[tileIndex] = { ...tile, terrain: nextTerrain, ownerId: player.id };
    
    const newPlayers = state.players.map(p => 
      p.id === player.id ? { ...p, gold: p.gold - cost } : p
    );

    const newUnits = state.units.map(u => {
      if (u.id === unitOnTile?.id && (nextTerrain === TerrainType.VILLAGE || nextTerrain === TerrainType.GOLD_MINE)) {
        return { ...u, movesLeft: 0, hasAttacked: true, hasActed: true };
      }
      return u;
    });

    const { history = [], animations, ...stateWithoutHistory } = state;

    return {
      ...state,
      history: [...history, stateWithoutHistory],
      board: newBoard,
      players: newPlayers,
      units: newUnits
    };
  }
  
  console.log("upgradeSettlement failed:", {
    coord,
    tile,
    playerGold: player.gold,
    cost,
    nextTerrain,
    unitOnTile
  });
  return state;
}

export function processTurnTransition(state: GameState): GameState {
  if (state.winnerId !== null) return state;

  // 1. Check for eliminated players
  const updatedPlayers = state.players.map(p => {
    if (p.isEliminated) return p;
    
    const hasUnits = state.units.some(u => u.ownerId === p.id);
    const hasSettlements = state.board.some(t => 
      t.ownerId === p.id && 
      (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
    );
    
    // Barbarians are only eliminated if they have no units AND no settlements
    // We allow them to be eliminated even if it's not an invasion yet, 
    // because rogue factions might have activated them.
    if (!hasUnits && !hasSettlements) {
      // If it's the original barbarian and they haven't been activated yet, 
      // we might want to keep them around for invasion, but actually 
      // triggerBarbarianInvasion un-eliminates them anyway.
      return { ...p, isEliminated: true };
    }
    return p;
  });

  // 2. Check for winner
  const winnerId = checkWinner({ ...state, players: updatedPlayers });
  if (winnerId !== null) {
    return { ...state, players: updatedPlayers, winnerId };
  }

  // 3. Find next player
  let nextIndex = (state.currentPlayerIndex + 1) % updatedPlayers.length;
  let loopCount = 0;
  const safety = new LoopSafety('processTurnTransition', updatedPlayers.length + 1);
  while (updatedPlayers[nextIndex].isEliminated && !safety.tick()) {
    nextIndex = (nextIndex + 1) % updatedPlayers.length;
    loopCount++;
  }

  // If all players are somehow eliminated, just end the game with a draw (no winner)
  if (loopCount >= updatedPlayers.length) {
    return { ...state, players: updatedPlayers, winnerId: state.players[state.currentPlayerIndex].id };
  }

  const nextPlayer = updatedPlayers[nextIndex];

  // 4. Action phase for NEXT player
  const newUnits = state.units.map(u => {
    return {
      ...u,
      movesLeft: u.ownerId === nextPlayer.id ? UNIT_STATS[u.type].moves : u.movesLeft,
      hasAttacked: u.ownerId === nextPlayer.id ? false : u.hasAttacked,
      hasActed: u.ownerId === nextPlayer.id ? false : u.hasActed,
    };
  });

  const isNewRound = nextIndex === 0;
  const nextTurnNumber = isNewRound ? state.turnNumber + 1 : state.turnNumber;

  // 5. Income phase
  // No player should receive gold revenue on turn 1
  const income = nextTurnNumber === 1 ? 0 : calculateIncome(nextPlayer, state.board);
  const nextPlayerStrength = state.units
    .filter(u => u.ownerId === nextPlayer.id)
    .reduce((acc, u) => acc + UNIT_STATS[u.type].cost, 0);

  const finalPlayers = updatedPlayers.map(p => {
    if (p.id === nextPlayer.id) {
      return { 
        ...p, 
        gold: p.gold + income,
        incomeHistory: [...p.incomeHistory, income].slice(-4), // Keep last 4 to check 3 declining/static transitions
        strengthHistory: [...p.strengthHistory, nextPlayerStrength].slice(-4)
      };
    }
    return p;
  });

  return {
    ...state,
    currentPlayerIndex: nextIndex,
    turnNumber: nextTurnNumber,
    units: newUnits,
    players: finalPlayers,
    selectedUnitId: null,
    possibleMoves: [],
    possibleAttacks: [],
    history: [], // Clear history at start of turn
    animations: [],
  };
}
