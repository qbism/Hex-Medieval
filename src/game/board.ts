import { 
  TerrainType, 
  axialToCube, 
  getDistance, 
  getNeighbors, 
  HexCoord,
  HexTile,
} from '../types';
import { LoopSafety } from '../utils';

export const BOARD_RADIUS = 10;

export function generateBoard(radius: number, spawnPoints: HexCoord[]) {
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
  const tileMap = new Map<string, HexTile>();
  coords.forEach(coord => {
    const tile: HexTile = {
      coord,
      terrain: TerrainType.PLAINS,
      ownerId: null,
    };
    tiles.push(tile);
    tileMap.set(`${coord.q},${coord.r}`, tile);
  });

  // Helper to get tile by coord
  const getTile = (q: number, r: number) => tileMap.get(`${q},${r}`);
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

  // A. Generate Lakes (evenly distributed)
  const numLakes = 4 + Math.floor(Math.random() * 2); // 4 to 5 lakes
  const selectedLakeSeeds = distributeEvenly(coords, numLakes, radius - 1, spawnPoints);
  
  selectedLakeSeeds.forEach(seed => {
    const lakeSize = 2 + Math.floor(Math.random() * 3);
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
  selectedLakeSeeds.forEach(lakeCenter => {
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

  // Then fill more perimeter until target reached, but do it evenly
  const perimeterTilesSorted = [...perimeterTiles].sort((a, b) => {
    const angleA = Math.atan2(a.r, a.q);
    const angleB = Math.atan2(b.r, b.q);
    return angleA - angleB;
  });
  
  const waterNeeded = Math.max(0, targetWaterCount - currentWaterCount);
  if (waterNeeded > 0) {
    const step = perimeterTilesSorted.length / waterNeeded;
    for (let i = 0; i < waterNeeded; i++) {
      const idx = Math.floor(i * step) % perimeterTilesSorted.length;
      setWater(perimeterTilesSorted[idx]);
    }
  }

  // 4. Generate Villages and Mountains first so forests can avoid them
  const numVillages = 12 + Math.floor(Math.random() * 9); // 12 to 20
  const villageCoords = distributeEvenly(coords, numVillages, radius, [...spawnPoints]);
  villageCoords.forEach(vCoord => {
    const tile = getTile(vCoord.q, vCoord.r);
    if (tile && tile.terrain === TerrainType.PLAINS) {
      tile.terrain = TerrainType.VILLAGE;
    }
  });

  const numMountains = 12 + Math.floor(Math.random() * 9); // 12 to 20
  const mountainCoords = distributeEvenly(coords, numMountains, radius, [...spawnPoints, ...villageCoords]);
  mountainCoords.forEach(mCoord => {
    const tile = getTile(mCoord.q, mCoord.r);
    if (tile && tile.terrain === TerrainType.PLAINS) {
      tile.terrain = TerrainType.MOUNTAIN;
    }
  });

  // 5. Generate Trees (Evenly Distributed Patches) - Spare villages and mountains
  const numForestPatches = 12 + Math.floor(Math.random() * 6); // 12 to 18 patches
  const forestSeeds = distributeEvenly(coords, numForestPatches, radius - 1, [...spawnPoints, ...selectedLakeSeeds, ...villageCoords, ...mountainCoords]);
  forestSeeds.forEach(seed => {
    const tile = getTile(seed.q, seed.r);
    if (!tile || tile.terrain !== TerrainType.PLAINS) return;
    
    tile.terrain = TerrainType.FOREST;
    
    // Small chance to spread to immediate neighbors for a natural look
    getNeighbors(seed).forEach(n => {
      const nt = getTile(n.q, n.r);
      if (nt && nt.terrain === TerrainType.PLAINS && Math.random() < 0.45) {
        nt.terrain = TerrainType.FOREST;
        
        // Occasional second-degree spread
        getNeighbors(n).forEach(nn => {
          const nnt = getTile(nn.q, nn.r);
          if (nnt && nnt.terrain === TerrainType.PLAINS && Math.random() < 0.2) {
            nnt.terrain = TerrainType.FOREST;
          }
        });
      }
    });
  });

  // 6. Final cleanup
  // No longer forcing full perimeter water here, as it's handled in step 3
  
  return tiles;
}

export function distributeEvenly(coords: HexCoord[], targetCount: number, radius: number, existingPoints: HexCoord[] = []): HexCoord[] {
  // We want to avoid the very edge
  const validCoords = coords.filter(c => {
    const d = (Math.abs(c.q) + Math.abs(c.r) + Math.abs(c.s)) / 2;
    return d < radius - 1;
  });

  if (validCoords.length === 0) return [];

  const points: HexCoord[] = [];
  const safety = new LoopSafety('distributeEvenly', 1000);
  
  while (points.length < targetCount && !safety.tick()) {
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

export function getSpawnPoints(radius: number, playerCount: number) {
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

export function getPointsAtDistance(center: HexCoord, d: number): HexCoord[] {
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
export function poissonDiskSampling(coords: HexCoord[], minDist: number, radius: number, k: number = 30): HexCoord[] {
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
