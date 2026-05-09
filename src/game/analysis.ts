import { 
  GameState, 
  UNIT_STATS, 
  TerrainType, 
  StrategicAnalysis,
  ThreatInfo,
  getDistance,
  getNeighbors,
  UnitType
} from '../types';
import { getUnitRange } from './units';
import { getBoardMap } from '../utils';

export function calculateStrategicAnalysis(state: GameState, playerId: number): StrategicAnalysis {
  const threatMap: Record<string, ThreatInfo> = {};
  const opportunityMap: Record<string, number> = {};
  const influenceMap: Record<string, number> = {};
  
  const boardMap = getBoardMap(state.board);
  const unitsByCoord = new Map<string, any>();
  state.units.forEach(u => unitsByCoord.set(`${u.coord.q},${u.coord.r}`, u));

  const selectedUnit = state.selectedUnitId ? state.units.find(u => u.id === state.selectedUnitId) : null;

  // Initialize maps
  for (const tile of state.board) {
    const key = `${tile.coord.q},${tile.coord.r}`;
    threatMap[key] = {
      minTurns: Infinity,
      totalThreatValue: 0,
      attackerCount: 0,
      eminentThreatValue: 0,
      eminentAttackerCount: 0
    };
    opportunityMap[key] = 0;
    influenceMap[key] = 0;
  }

  // Step 0: Pre-calculate settlement locations
  const enemySettlements: any[] = [];
  const neutralSettlements: any[] = [];
  const friendlySettlements: any[] = [];
  for (const t of state.board) {
    const isSettlement = [TerrainType.VILLAGE, TerrainType.FORT, TerrainType.CASTLE, TerrainType.GOLD_MINE].includes(t.terrain as any);
    if (!isSettlement) continue;
    if (t.ownerId === playerId) friendlySettlements.push(t);
    else if (t.ownerId === null) neutralSettlements.push(t);
    else enemySettlements.push(t);
  }

  // Step 0.2: Pre-calculate enemy capacity
  const enemyCapacityMap = new Map<string, number>();
  for (const enemy of state.units) {
    if (enemy.ownerId !== playerId) {
      const range = getUnitRange(enemy, state.board);
      let targetsInReach = 0;
      for (const friendly of state.units) {
        if (friendly.ownerId === playerId) {
          const d = getDistance(enemy.coord, friendly.coord);
          if (d <= range) targetsInReach++;
        }
      }
      enemyCapacityMap.set(enemy.id, Math.max(1, targetsInReach));
    }
  }

  // Step 0.5: Chokepoint (Movement Gravity) detection
  const chokepointMap = new Map<string, number>();
  for (const tile of state.board) {
    if (tile.terrain === TerrainType.WATER || tile.terrain === TerrainType.MOUNTAIN) continue;
    
    const neighbors = getNeighbors(tile.coord);
    const landNeighbors = neighbors.filter(n => {
      const nt = boardMap.get(`${n.q},${n.r}`);
      return nt && nt.terrain !== TerrainType.WATER && nt.terrain !== TerrainType.MOUNTAIN;
    });

    // Heuristic: If a tile has exactly 2 land neighbors, it's likely a bridge or narrow passage
    if (landNeighbors.length === 2) {
      chokepointMap.set(`${tile.coord.q},${tile.coord.r}`, 1.5);
    } else if (landNeighbors.length === 1) {
      chokepointMap.set(`${tile.coord.q},${tile.coord.r}`, 0.5);
    }
  }

  // 1. Calculate Threat Map & Influence Map
  // NOTE: Threat and influence strictly originate from units. 
  // Enemy settlements do NOT contribute to the threat map.
  for (const u of state.units) {
    const stats = UNIT_STATS[u.type];
    const range = getUnitRange(u, state.board);
    const moves = stats.moves;
    const power = stats.cost;

    // Influence Map (Optimized radius)
    const iRadius = 10;
    const basePower = power;
    for (let dq = -iRadius; dq <= iRadius; dq++) {
      for (let dr = Math.max(-iRadius, -dq - iRadius); dr <= Math.min(iRadius, -dq + iRadius); dr++) {
        const tKey = `${u.coord.q + dq},${u.coord.r + dr}`;
        if (!(tKey in influenceMap)) continue;
        const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
        const influenceValue = basePower / Math.pow(dist + 1, 1.5);
        if (u.ownerId === playerId) influenceMap[tKey] += influenceValue;
        else influenceMap[tKey] -= influenceValue;
      }
    }

    // Threat Map: Enemies to Player
    if (u.ownerId !== playerId) {
      const capacity = enemyCapacityMap.get(u.id) || 1;
      const basePower = 100; // Uniform power base for threats
      const effectivePower = basePower / capacity;

      // Small optimization: only check relevant radius
      const radiusLimit = moves + range + 1;
      for (let dq = -radiusLimit; dq <= radiusLimit; dq++) {
        for (let dr = Math.max(-radiusLimit, -dq - radiusLimit); dr <= Math.min(radiusLimit, -dq + radiusLimit); dr++) {
          const tKey = `${u.coord.q + dq},${u.coord.r + dr}`;
          const current = threatMap[tKey];
          if (!current) continue; 
          
          const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
          const threatLevel = dist <= range ? 1 : (dist <= range + moves ? 2 : 3);
          
          if (threatLevel <= 2) {
            current.minTurns = Math.min(current.minTurns, threatLevel);
            
            // Level 1 (now) is 5x, Level 2 (potential) is 3x lower (0.33x)
            // Settlements themselves are zero-threat; only units carry threat value.
            const weightedPower = threatLevel === 1 ? effectivePower * 5 : effectivePower / 3;
            
            current.totalThreatValue += weightedPower;
            current.attackerCount += 1;
            if (threatLevel === 1) {
              current.eminentThreatValue += weightedPower;
              current.eminentAttackerCount += 1;
            }
          }
        }
      }
    }
  }

  // 2. Calculate Raw Opportunity Map
  const rawOpportunityMap: Record<string, number> = {};
  for (const tile of state.board) {
    const key = `${tile.coord.q},${tile.coord.r}`;
    let opportunity = 0;

    // Settlements
    if (tile.ownerId !== playerId) {
      const isUnclaimed = tile.ownerId === null;
      
      const multipliers: Record<string, number> = {
        [TerrainType.VILLAGE]: isUnclaimed ? 1500 : 1200,
        [TerrainType.GOLD_MINE]: isUnclaimed ? 3000 : 2500,
        [TerrainType.FORT]: 1800,
        [TerrainType.CASTLE]: 3000,
      };

      if (multipliers[tile.terrain]) {
        let settlementValue = multipliers[tile.terrain];
        const unitAtSettlement = unitsByCoord.get(key);
        if (!unitAtSettlement) settlementValue += 500;
        opportunity += settlementValue;
      }
    }

    // B: Enemy units
    const unitOnTile = unitsByCoord.get(key);
    if (unitOnTile && unitOnTile.ownerId !== playerId) {
      opportunity += 200 + UNIT_STATS[unitOnTile.type].cost;
    }

    // C: Terrain Modifiers (Optimized check)
    const isNavigableWater = tile.terrain === TerrainType.WATER && (
      neutralSettlements.some(s => getDistance(tile.coord, s.coord) <= 1) ||
      enemySettlements.some(s => getDistance(tile.coord, s.coord) <= 1) ||
      friendlySettlements.some(s => getDistance(tile.coord, s.coord) <= 1)
    );

    if (tile.terrain === TerrainType.WATER) {
      opportunity = isNavigableWater ? (opportunity / 5) * 10 : 0; 
    } else if (tile.terrain === TerrainType.PLAINS) {
      opportunity += 50; 
      opportunity /= 5; 
      
      const threat = threatMap[key];
      if (threat.eminentAttackerCount === 0 && threat.attackerCount > 0) {
        opportunity *= 2;
      }
      
      opportunity *= 10; 
    } else if (tile.terrain === TerrainType.FOREST) {
      let isAdjacentToEnemyCatapult = false;
      const neighbors = getNeighbors(tile.coord);
      for (const nb of neighbors) {
        const u = unitsByCoord.get(`${nb.q},${nb.r}`);
        if (u && u.ownerId !== playerId && u.type === UnitType.CATAPULT) {
          isAdjacentToEnemyCatapult = true;
          break;
        }
      }
      
      if (isAdjacentToEnemyCatapult) {
        opportunity += 50; 
      }
    }

    // D: Settlement Attack Range Tactical Bonus (Triple bonus for tiles in range 1-2 of enemy settlements)
    const isNearEnemySettlement = enemySettlements.some(s => getDistance(tile.coord, s.coord) <= 2);
    if (isNearEnemySettlement) {
      opportunity *= 3;
    }

    // E: Movement Gravity (Chokepoint) Bonus
    const chokepointValue = chokepointMap.get(key) || 0;
    if (chokepointValue > 0) {
      opportunity += 200 * chokepointValue;
    }

    // F: Counter-Unit Intelligence (Selection Sensitivity)
    if (selectedUnit) {
      if (selectedUnit.type === UnitType.INFANTRY) {
        if (tile.terrain === TerrainType.FOREST) {
          const neighbors = getNeighbors(tile.coord);
          const enemyCatapultNearby = neighbors.some(n => {
            const u = unitsByCoord.get(`${n.q},${n.r}`);
            return u && u.ownerId !== playerId && u.type === UnitType.CATAPULT;
          });
          if (enemyCatapultNearby) {
            opportunity *= 2.5; 
          }
        }
      } else if (selectedUnit.type === UnitType.CATAPULT) {
        if (tile.terrain === TerrainType.FOREST) {
          opportunity *= 0.2; 
        }
      } else if (selectedUnit.type === UnitType.KNIGHT) {
        if (tile.terrain === TerrainType.PLAINS) {
          opportunity *= 1.5;
        }
      }
    }

    rawOpportunityMap[key] = opportunity;
  }

  // 3. Diffuse Opportunity Map
  const topOpportunities = Object.entries(rawOpportunityMap)
    .filter(([_, val]) => val > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  for (const tile of state.board) {
    const key = `${tile.coord.q},${tile.coord.r}`;
    
    // Hard check: non-navigable water has zero opportunity
    const isNavigableWater = tile.terrain === TerrainType.WATER && (
      neutralSettlements.some(s => getDistance(tile.coord, s.coord) <= 1) ||
      enemySettlements.some(s => getDistance(tile.coord, s.coord) <= 1) ||
      friendlySettlements.some(s => getDistance(tile.coord, s.coord) <= 1)
    );

    if (tile.terrain === TerrainType.WATER && !isNavigableWater) {
      opportunityMap[key] = 0;
      threatMap[key].totalThreatValue = 0;
      threatMap[key].eminentThreatValue = 0;
      continue;
    }

    let diffusedScore = rawOpportunityMap[key];
    
    for (const [tKey, tVal] of topOpportunities) {
      if (tKey === key) continue;
      const tTile = boardMap.get(tKey)!;
      const dist = (Math.abs(tile.coord.q - tTile.coord.q) + Math.abs(tile.coord.r - tTile.coord.r) + Math.abs(tile.coord.s - tTile.coord.s)) / 2;
      // High exponent (10) for extremely local influence
      diffusedScore += tVal / Math.pow(dist + 1, 10);
    }

    // Apply global 5x reduction, but threats are modified x 600% (was 200%)
    opportunityMap[key] = diffusedScore / 5;
    threatMap[key].totalThreatValue = (threatMap[key].totalThreatValue / 5) * 6;
    threatMap[key].eminentThreatValue = (threatMap[key].eminentThreatValue / 5) * 6;
  }

  return { threatMap, opportunityMap, influenceMap };
}
