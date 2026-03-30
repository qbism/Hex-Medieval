import { 
  GameState, 
  Player, 
  TerrainType, 
  UPGRADE_COSTS, 
  HexCoord, 
  getDistance, 
  getNeighbors 
} from '../types';
import { findNearestTarget } from './utils';
import { BASE_REWARD } from './constants';
import { LoopSafety } from '../utils';

export function getUpgradeAction(
  state: GameState, 
  currentPlayer: Player, 
  isUnderThreat: boolean, 
  isEarlyGame: boolean, 
  numSettlements: number,
  isLaggingIncome: boolean,
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
      if (isBarbarian) continue;
      cost = UPGRADE_COSTS[TerrainType.GOLD_MINE];
      baseScore = BASE_REWARD * 2.5; // Priority 1: Maximize income (increased significantly)
      if (isLaggingIncome) baseScore += BASE_REWARD * 2.0; // Extra priority if lagging income
    } else if (tile.terrain === TerrainType.PLAINS && state.units.some(u => u.ownerId === currentPlayer.id && u.coord.q === tile.coord.q && u.coord.r === tile.coord.r)) {
      cost = UPGRADE_COSTS[TerrainType.VILLAGE];
      baseScore = isBarbarian ? BASE_REWARD * 0.5 : BASE_REWARD * 1.5; // Lower priority for barbarians
      if (isLaggingIncome && !isBarbarian) baseScore += BASE_REWARD * 1.0; // Extra priority if lagging income
    } else if (tile.terrain === TerrainType.VILLAGE && tile.ownerId === currentPlayer.id) {
      if (isBarbarian) continue;
      cost = UPGRADE_COSTS[TerrainType.FORTRESS];
      baseScore = BASE_REWARD * 0.1; // Priority 1: Defendable settlements
    } else if (tile.terrain === TerrainType.FORTRESS && tile.ownerId === currentPlayer.id) {
      if (isBarbarian) continue;
      cost = UPGRADE_COSTS[TerrainType.CASTLE];
      baseScore = BASE_REWARD * 0.15; // Priority 1: Defendable settlements
    }

    if (cost > 0 && currentPlayer.gold >= cost) {
      // Calculate distance to nearest enemy
      const { dist: distToEnemy } = findNearestTarget(tile.coord, state, currentPlayer.id);
      let score = baseScore;

      // Targeted Upgrades (Economy vs. Frontline)
      if (cost === UPGRADE_COSTS[TerrainType.GOLD_MINE]) {
        // Gold Mines are an investment. They are great in the backline, terrible on the frontline.
        if (distToEnemy <= 3) {
          score -= BASE_REWARD * 1.5; // Do not build a gold mine right next to an enemy
        } else if (distToEnemy >= 6) {
          score += BASE_REWARD * 1.0; // Very safe, great investment
        }
        
        // Priority 2: In balance with expansion. Keep a buffer of 50 gold for units/villages
        const buffer = (isUnderThreat) ? 50 : 0;
        if (currentPlayer.gold < cost + buffer && distToEnemy < 8) {
           score = -Infinity; // Can't afford the buffer
        }
      } else if (cost === UPGRADE_COSTS[TerrainType.FORTRESS] || cost === UPGRADE_COSTS[TerrainType.CASTLE]) {
        // Defensive structures are great on the frontline, but also serve as massive economic boosts in the backline.
        if (distToEnemy <= 3) {
          score += BASE_REWARD * 0.6; // Frontline defense!
        } else {
          score += BASE_REWARD * 0.4; // Backline economic investment
        }
        
        // Buffer check
        const buffer = isEarlyGame ? 0 : (cost === UPGRADE_COSTS[TerrainType.CASTLE] ? 200 : 100);
        if (currentPlayer.gold < cost + buffer) {
           score = -Infinity;
        }
      } else if (cost === UPGRADE_COSTS[TerrainType.VILLAGE]) {
        // Villages are good everywhere for income and recruitment
        const buffer = 0;
        if (currentPlayer.gold < cost + buffer) {
           score = -Infinity;
        } else {
           // Base score for building a village (income is always good)
           score += BASE_REWARD * 0.2;

           // Expansion bonus: Reward spreading settlements thin, penalize clustering
           const nearbyFriendlySettlements = state.board.filter(t => 
             t.ownerId === currentPlayer.id && 
             (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE) &&
             getDistance(t.coord, tile.coord) <= 2 &&
             !(t.coord.q === tile.coord.q && t.coord.r === tile.coord.r) // exclude self
           ).length;

           if (nearbyFriendlySettlements === 0) {
             score += BASE_REWARD * 1.0; // Priority 1: Huge bonus for expanding into isolated areas
           } else if (nearbyFriendlySettlements >= 2) {
             // Relax clustering penalty based on settlement count
             let penaltyMult = 0.4;
             if (numSettlements >= 15) {
               penaltyMult = 0;
             } else if (numSettlements >= 10) {
               penaltyMult = 0.2; // 50% of 0.4
             }
             score -= BASE_REWARD * penaltyMult;
           }

           // Economic Heatmap: Bonus for being near mountains or forests
           const neighbors = getNeighbors(tile.coord);
           let resourceBonus = 0;
           for (const n of neighbors) {
             const nTile = state.board.find(t => t.coord.q === n.q && t.coord.r === n.r);
             if (nTile) {
               if (nTile.terrain === TerrainType.MOUNTAIN) resourceBonus += isBarbarian ? 0 : BASE_REWARD * 0.5; // High value for future gold mines
               if (nTile.terrain === TerrainType.FOREST) resourceBonus += BASE_REWARD * 0.15; // Good defensive terrain nearby
               if (nTile.terrain === TerrainType.WATER) resourceBonus -= BASE_REWARD * 0.05; // Less land to build on
             } else {
               resourceBonus -= BASE_REWARD * 0.1; // Map edge
             }
           }
           score += resourceBonus;

           // If the village is in a bad location (score <= 0), don't build it!
           // But be more lenient as we expand
           const minScore = numSettlements >= 10 ? -BASE_REWARD * 0.2 : 0;
           if (score <= minScore) {
             score = -Infinity;
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
