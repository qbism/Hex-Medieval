import { 
  GameState, 
  TerrainType, 
  UNIT_STATS, 
  getDistance, 
  UnitType,
  HexCoord,
  TileEvaluation
} from '../types';
import { ThreatInfo } from './threatAnalysis';
import { 
  IMMEDIATE_CAPTURE_BONUS,
  UNCLAIMED_VILLAGE_PRIORITY_BONUS,
  THREAT_PENALTY_L1_MULT,
  TERRAIN_FOREST_PENALTY,
  TERRAIN_MOUNTAIN_BONUS,
  TERRAIN_PLAINS_NEUTRAL_BONUS,
  TERRAIN_PLAINS_OWNED_BONUS
} from './constants';

/**
 * Calculates a comprehensive Opportunity and Peril matrix for the entire board.
 * Peril: Based on enemy threat, damage potential, and proximity.
 * Opportunity: Based on unclaimed resources, weak enemies, and strategic value.
 */
export function calculateOpportunityPerilMatrix(
  state: GameState, 
  currentPlayerId: number, 
  threatMatrix: Map<string, ThreatInfo>
): TileEvaluation[] {
  const evaluations: TileEvaluation[] = [];

  for (const tile of state.board) {
    const key = `${tile.coord.q},${tile.coord.r}`;
    const reasons: string[] = [];
    let peril = 0;
    let opportunity = 0;

    // 1. Calculate Peril
    const threat = threatMatrix.get(key);
    if (threat) {
      // Peril is strictly defined as tiles that can be attacked in the next turn
      if (threat.eminentAttackerCount > 0) {
        // Peril increases with the number of attackers and their total threat value
        peril += threat.eminentThreatValue * THREAT_PENALTY_L1_MULT;
        
        // Bonus peril for multiple attackers (Lethal Threat)
        if (threat.eminentAttackerCount >= 2) {
          peril *= 1.5; 
        }

        reasons.push(`Eminent peril: ${threat.eminentAttackerCount} enemy units can attack next turn`);
        reasons.push("Moving here is a sacrifice unless strategic value is extreme");
      }
    }

    // 2. Calculate Opportunity
    
    // A. Unclaimed Settlements
    if (tile.ownerId === null) {
      if (tile.terrain === TerrainType.VILLAGE) {
        opportunity += UNCLAIMED_VILLAGE_PRIORITY_BONUS * 10;
        reasons.push("Unclaimed Village");
      } else if (tile.terrain === TerrainType.GOLD_MINE) {
        opportunity += UNCLAIMED_VILLAGE_PRIORITY_BONUS * 15;
        reasons.push("Unclaimed Gold Mine");
      }
    } else if (tile.ownerId !== currentPlayerId) {
      // Enemy Settlements
      if (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE) {
        opportunity += IMMEDIATE_CAPTURE_BONUS * 5;
        reasons.push("Enemy Settlement (Capture Opportunity)");
      }
    }

    // B. Enemy Units (Kill Opportunities)
    const unitAtTile = state.units.find(u => u.coord.q === tile.coord.q && u.coord.r === tile.coord.r);
    if (unitAtTile && unitAtTile.ownerId !== currentPlayerId) {
      const stats = UNIT_STATS[unitAtTile.type];
      // Opportunity to kill a unit is proportional to its cost and inversely to its health
      const killValue = (stats.cost * 2); // Simplified for now
      opportunity += killValue;
      reasons.push(`Enemy ${unitAtTile.type} (Kill Opportunity)`);
      
      if (unitAtTile.type === UnitType.CATAPULT) {
        opportunity += 20; // High value target
        reasons.push("High Value Target: Catapult");
      }
    }

    // C. Strategic Terrain
    if (tile.terrain === TerrainType.FOREST) {
      opportunity += TERRAIN_FOREST_PENALTY;
      reasons.push("Forest Penalty (Slow, No Villages)");
    } else if (tile.terrain === TerrainType.MOUNTAIN) {
      opportunity += TERRAIN_MOUNTAIN_BONUS;
      reasons.push("Strategic Mountain");
    } else if (tile.terrain === TerrainType.PLAINS) {
      const bonus = tile.ownerId === null ? TERRAIN_PLAINS_NEUTRAL_BONUS : TERRAIN_PLAINS_OWNED_BONUS;
      opportunity += bonus;
      reasons.push("Strategic Plains (Development Potential)");
    }

    // D. Proximity to friendly settlements (Consolidation)
    const mySettlements = state.board.filter(t => t.ownerId === currentPlayerId && (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE));
    let minDistToSettlement = Infinity;
    for (const s of mySettlements) {
      const d = getDistance(tile.coord, s.coord);
      if (d < minDistToSettlement) minDistToSettlement = d;
    }
    
    if (minDistToSettlement <= 2) {
      opportunity += 5; // Buffer zone
      reasons.push("Empire Buffer Zone");
    }

    evaluations.push({
      q: tile.coord.q,
      r: tile.coord.r,
      peril,
      opportunity,
      score: opportunity - peril,
      reasons
    });
  }

  return evaluations;
}

/**
 * Finds the tile with the highest opportunity score that is within a reasonable distance.
 */
export function findBestOpportunity(matrix: TileEvaluation[], currentCoord: HexCoord, maxDist: number): TileEvaluation | null {
  let bestEval: TileEvaluation | null = null;
  let maxScore = -Infinity;

  for (const eval_ of matrix) {
    const dist = getDistance(currentCoord, { q: eval_.q, r: eval_.r, s: -eval_.q - eval_.r });
    
    if (dist <= maxDist) {
      // Score is weighted by distance
      const weightedScore = eval_.score / (dist + 1);
      if (weightedScore > maxScore) {
        maxScore = weightedScore;
        bestEval = eval_;
      }
    }
  }

  return bestEval;
}
