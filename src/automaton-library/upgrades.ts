import { 
  GameState, 
  Player, 
  TerrainType, 
  UNIT_STATS, 
  UPGRADE_COSTS, 
  HexCoord, 
  getDistance, 
  getNeighbors 
} from '../types';
import { findNearestTarget } from './utils';
import { ThreatInfo } from './threatAnalysis';
import { 
  BASE_REWARD,
  UPGRADE_GOLD_MINE_BONUS,
  UPGRADE_LAGGING_INCOME_BONUS,
  UPGRADE_VILLAGE_BONUS,
  UPGRADE_VILLAGE_LAGGING_INCOME_BONUS,
  UPGRADE_FORTRESS_BONUS,
  UPGRADE_CASTLE_BONUS,
  GOLD_MINE_FRONTLINE_DISTANCE,
  GOLD_MINE_FRONTLINE_PENALTY,
  GOLD_MINE_BACKLINE_DISTANCE,
  GOLD_MINE_BACKLINE_BONUS,
  GOLD_MINE_BUFFER,
  FORTRESS_FRONTLINE_DISTANCE,
  FORTRESS_FRONTLINE_BONUS,
  FORTRESS_BACKLINE_BONUS,
  CASTLE_BUFFER,
  FORTRESS_BUFFER,
  VILLAGE_BASE_SCORE,
  VILLAGE_ISOLATION_BONUS,
  VILLAGE_CLUSTERING_PENALTY,
  VILLAGE_CLUSTERING_SETTLEMENT_THRESHOLD_HIGH,
  VILLAGE_CLUSTERING_SETTLEMENT_THRESHOLD_MED,
  VILLAGE_CLUSTERING_PENALTY_MED_MULT,
  VILLAGE_MOUNTAIN_RESOURCE_BONUS,
  VILLAGE_FOREST_RESOURCE_BONUS,
  VILLAGE_WATER_RESOURCE_PENALTY,
  VILLAGE_MAP_EDGE_PENALTY,
  VILLAGE_MIN_SCORE_THRESHOLD,
  STRATEGIC_FORTIFICATION_BONUS,
  DEFENSIVE_SUPPORT_VILLAGE_BONUS,
  EDGE_OF_PERIL_BONUS
} from './constants';
import { LoopSafety } from '../utils';

export function getUpgradeAction(
  state: GameState, 
  currentPlayer: Player, 
  isUnderThreat: boolean, 
  isEarlyGame: boolean, 
  numSettlements: number,
  isLaggingIncome: boolean,
  isCriticallyLaggingLargeEconomy: boolean,
  threatMatrix: Map<string, ThreatInfo>,
  isBarbarian: boolean = false
) {
  // Barbarians only build villages if they have enough gold
  // The 1/3 expansion budget is managed in getRecruitmentAction
  if (isBarbarian && currentPlayer.gold < UPGRADE_COSTS[TerrainType.VILLAGE]) return null;

  const upgradeableTiles = state.board.filter(t => {
    if (t.ownerId === currentPlayer.id) return true;
    const unitOnTile = state.units.find(u => u.ownerId === currentPlayer.id && u.coord.q === t.coord.q && u.coord.r === t.coord.r);
    if (!unitOnTile) return false;
    return !unitOnTile.hasActed;
  });
  
  let bestUpgrade: { coord: HexCoord, score: number } | null = null;
  const upgradeSafety = new LoopSafety('getAutomatonBestAction-upgrades', 1000);
  
  for (const tile of upgradeableTiles) {
    if (upgradeSafety.tick()) break;
    let cost = 0;
    let baseScore = 0;

    if (tile.terrain === TerrainType.MOUNTAIN && state.units.some(u => u.ownerId === currentPlayer.id && u.coord.q === tile.coord.q && u.coord.r === tile.coord.r)) {
      cost = UPGRADE_COSTS[TerrainType.GOLD_MINE];
      baseScore = BASE_REWARD * UPGRADE_GOLD_MINE_BONUS; // Priority 1: Maximize income (increased significantly)
      if (isLaggingIncome) baseScore += BASE_REWARD * UPGRADE_LAGGING_INCOME_BONUS; // Extra priority if lagging income
      if (isCriticallyLaggingLargeEconomy) baseScore += BASE_REWARD * UPGRADE_LAGGING_INCOME_BONUS * 6; // Extreme priority for large economy gaps
       } else if (tile.terrain === TerrainType.PLAINS && state.units.some(u => u.ownerId === currentPlayer.id && u.coord.q === tile.coord.q && u.coord.r === tile.coord.r)) {
      cost = UPGRADE_COSTS[TerrainType.VILLAGE];
      baseScore = BASE_REWARD * UPGRADE_VILLAGE_BONUS; // Same priority for barbarians
      if (isLaggingIncome && !isBarbarian) baseScore += BASE_REWARD * UPGRADE_VILLAGE_LAGGING_INCOME_BONUS; // Extra priority if lagging income
      if (isCriticallyLaggingLargeEconomy && !isBarbarian) baseScore += BASE_REWARD * UPGRADE_VILLAGE_LAGGING_INCOME_BONUS * 4;
      
      // Wealthy Expansionism: If we are rich, we have a biological imperative to expand
      if (currentPlayer.gold > 1000 && !isBarbarian) {
        baseScore += BASE_REWARD * 5.0;
      }
    } else if (tile.terrain === TerrainType.VILLAGE && tile.ownerId === currentPlayer.id) {
      cost = UPGRADE_COSTS[TerrainType.FORTRESS];
      baseScore = BASE_REWARD * UPGRADE_FORTRESS_BONUS; // Priority 1: Defendable settlements
    } else if (tile.terrain === TerrainType.FORTRESS && tile.ownerId === currentPlayer.id) {
      cost = UPGRADE_COSTS[TerrainType.CASTLE];
      baseScore = BASE_REWARD * UPGRADE_CASTLE_BONUS; // Priority 1: Defendable settlements
    }

    if (cost > 0 && currentPlayer.gold >= cost) {
      // Calculate distance to nearest enemy
      const { dist: distToEnemy } = findNearestTarget(tile.coord, state, currentPlayer.id);
      let score = baseScore;

      // Targeted Upgrades (Economy vs. Frontline)
      
      if (cost === UPGRADE_COSTS[TerrainType.GOLD_MINE]) {
        // Gold Mines are an investment. They are great in the backline, terrible on the frontline.
        if (distToEnemy <= GOLD_MINE_FRONTLINE_DISTANCE) { // Reduced threshold from 3 to 2
          score -= BASE_REWARD * GOLD_MINE_FRONTLINE_PENALTY; // Increased penalty for very close enemies
        } else if (distToEnemy >= GOLD_MINE_BACKLINE_DISTANCE) { // Reduced threshold from 6 to 4
          score += BASE_REWARD * GOLD_MINE_BACKLINE_BONUS; // Increased bonus for safe investment
        }
        
        // Priority 2: In balance with expansion. Keep a buffer of 50 gold for units/villages only if very close to enemy
        // If we are critically lagging in income despite a large economy, bypass the buffer to prioritize growth.
        const buffer = (isUnderThreat && distToEnemy <= 4 && !isCriticallyLaggingLargeEconomy) ? GOLD_MINE_BUFFER : 0;
        if (currentPlayer.gold < cost + buffer) {
           score = -Infinity; // Can't afford the buffer
        }
      } else if (cost === UPGRADE_COSTS[TerrainType.FORTRESS] || cost === UPGRADE_COSTS[TerrainType.CASTLE]) {
        // Defensive structures are great on the frontline, but also serve as massive economic boosts in the backline.
        if (distToEnemy <= FORTRESS_FRONTLINE_DISTANCE) {
          score += BASE_REWARD * FORTRESS_FRONTLINE_BONUS; // Frontline defense!
          
          // Strategic Fortification: Normal AI prioritizes Fortress if enemies are within 3 tiles
          if (!isBarbarian && distToEnemy <= 3 && cost === UPGRADE_COSTS[TerrainType.FORTRESS]) {
            score += BASE_REWARD * STRATEGIC_FORTIFICATION_BONUS;
          }
        } else {
          score += BASE_REWARD * FORTRESS_BACKLINE_BONUS; // Backline economic investment
        }
        
        // Buffer check
        const buffer = isEarlyGame ? 0 : (cost === UPGRADE_COSTS[TerrainType.CASTLE] ? CASTLE_BUFFER : FORTRESS_BUFFER);
        if (currentPlayer.gold < cost + buffer) {
           score = -Infinity;
        }
      } else if (cost === UPGRADE_COSTS[TerrainType.VILLAGE]) {
        // Villages are good everywhere for income and recruitment
        // Wealthy Expansionism: If we are rich, we have a biological imperative to expand
        // "Never stop" - remove satisfied state and enforce minimum growth
        if (currentPlayer.gold >= cost) {
           score += BASE_REWARD * VILLAGE_BASE_SCORE;
           
           // Expansion Bonus Scaling: If we haven't reached our 15% growth target yet,
           // give a massive boost to the best village candidate.
           score += BASE_REWARD * 15.0; 

           // Expansion bonus: Reward spreading settlements thin, penalize clustering
           const nearbyFriendlySettlements = state.board.filter(t => 
             t.ownerId === currentPlayer.id && 
             (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE) &&
             getDistance(t.coord, tile.coord, state.board) <= 2 &&
             !(t.coord.q === tile.coord.q && t.coord.r === tile.coord.r) // exclude self
           ).length;

           // Supply Edge Leapfrog Bonus:
           // If we are building this village exactly at our current supply limit, it's a critical expansion anchor.
           let nearestSettlementDist = Infinity;
           for (const s of state.board.filter(t => t.ownerId === currentPlayer.id && (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE))) {
             const d = getDistance(tile.coord, s.coord, state.board);
             if (d < nearestSettlementDist) nearestSettlementDist = d;
           }
           
           // We find the unit on this tile to check its specific movespeed
           const unitOnTile = state.units.find(u => u.ownerId === currentPlayer.id && u.coord.q === tile.coord.q && u.coord.r === tile.coord.r);
           if (unitOnTile && nearestSettlementDist >= UNIT_STATS[unitOnTile.type].moves) {
             score += BASE_REWARD * 15.0; // Huge bonus to leapfrog
           }

           if (nearbyFriendlySettlements === 0) {
             score += BASE_REWARD * VILLAGE_ISOLATION_BONUS; // Priority 1: Huge bonus for expanding into isolated areas
           } else if (nearbyFriendlySettlements >= 2) {
             // Relax clustering penalty based on settlement count
             let penaltyMult = VILLAGE_CLUSTERING_PENALTY;
             if (numSettlements >= VILLAGE_CLUSTERING_SETTLEMENT_THRESHOLD_HIGH) {
               penaltyMult = 0;
             } else if (numSettlements >= VILLAGE_CLUSTERING_SETTLEMENT_THRESHOLD_MED) {
               penaltyMult = VILLAGE_CLUSTERING_PENALTY * VILLAGE_CLUSTERING_PENALTY_MED_MULT;
             }
             score -= BASE_REWARD * penaltyMult;
           }

           // Economic Heatmap: Bonus for being near mountains or forests
           const neighbors = getNeighbors(tile.coord);
           let resourceBonus = 0;
           for (const n of neighbors) {
             const nTile = state.board.find(t => t.coord.q === n.q && t.coord.r === n.r);
             if (nTile) {
               if (nTile.terrain === TerrainType.MOUNTAIN) resourceBonus += BASE_REWARD * VILLAGE_MOUNTAIN_RESOURCE_BONUS; // High value for future gold mines
               if (nTile.terrain === TerrainType.FOREST) resourceBonus += BASE_REWARD * VILLAGE_FOREST_RESOURCE_BONUS; // Good defensive terrain nearby
               if (nTile.terrain === TerrainType.WATER) resourceBonus -= BASE_REWARD * VILLAGE_WATER_RESOURCE_PENALTY; // Less land to build on
             } else {
               resourceBonus -= BASE_REWARD * VILLAGE_MAP_EDGE_PENALTY; // Map edge
             }
           }
           score += resourceBonus;
            
           // Defensive Support: Bonus for building villages near threatened settlements
           const neighborTilesForDefense = neighbors.map(n => state.board.find(t => t.coord.q === n.q && t.coord.r === n.r)).filter(Boolean);
           const isHelpingThreatenedBase = neighborTilesForDefense.some(nt => {
              if (!nt || nt.ownerId !== currentPlayer.id) return false;
              if (nt.terrain !== TerrainType.VILLAGE && nt.terrain !== TerrainType.FORTRESS && nt.terrain !== TerrainType.CASTLE && nt.terrain !== TerrainType.GOLD_MINE) return false;
              const ntThreat = threatMatrix.get(`${nt.coord.q},${nt.coord.r}`);
              return ntThreat && ntThreat.eminentAttackerCount > 0;
           });
           if (isHelpingThreatenedBase) {
              score += BASE_REWARD * DEFENSIVE_SUPPORT_VILLAGE_BONUS;
           }

           // Edge of peril bonus
           const tileThreatVal = threatMatrix.get(`${tile.coord.q},${tile.coord.r}`);
           const isTileInPeril = tileThreatVal && tileThreatVal.eminentAttackerCount > 0;
           if (!isTileInPeril) {
             let isAdjacentToPeril = false;
             for (const n of neighbors) {
               const nThreat = threatMatrix.get(`${n.q},${n.r}`);
               if (nThreat && nThreat.eminentAttackerCount > 0) {
                 isAdjacentToPeril = true;
                 break;
               }
             }
             if (isAdjacentToPeril) {
               score += BASE_REWARD * EDGE_OF_PERIL_BONUS;
             }
           }

           // If the village is in a bad location (score <= 0), don't build it!
           // But be more lenient as we expand - the priority is INCOME.
           const minScoreThreshold = numSettlements >= 10 ? VILLAGE_MIN_SCORE_THRESHOLD : -10.0;
           const minScore = BASE_REWARD * minScoreThreshold;
           if (score <= minScore) {
             score = minScore + 0.1; // Barely over threshold to ensure we don't block growth
           }
        }
      }

      if (score > -Infinity && (!bestUpgrade || score > bestUpgrade.score)) {
        bestUpgrade = { coord: tile.coord, score };
      }
    }
  }

  if (bestUpgrade) {
    return { type: 'upgrade' as const, payload: { coord: bestUpgrade.coord } };
  }
  return null;
}
