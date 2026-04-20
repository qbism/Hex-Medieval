import { 
  GameState, 
  TerrainType, 
  UNIT_STATS, 
  getDistance, 
  UnitType,
  HexCoord,
  getNeighbors
} from '../types';
import { getValidAttacks } from '../game/units';
import { ThreatInfo } from './threatAnalysis';
import { TileEvaluation } from './types';
import { 
  IMMEDIATE_CAPTURE_BONUS,
  UNCLAIMED_VILLAGE_PRIORITY_BONUS,
  THREAT_PENALTY_L1_MULT,
  TERRAIN_FOREST_PENALTY,
  TERRAIN_MOUNTAIN_BONUS,
  TERRAIN_PLAINS_NEUTRAL_BONUS,
  TERRAIN_PLAINS_OWNED_BONUS,
  EDGE_OF_PERIL_BONUS
} from './constants';

/**
 * Calculates a comprehensive Opportunity and Peril matrix for the entire board.
 * Peril: Based on enemy threat, damage potential, and proximity.
 * Opportunity: Based on unclaimed resources, weak enemies, and strategic value.
 */
export function calculateOpportunityPerilMatrix(
  state: GameState, 
  playerId: number, 
  threatMatrix: Map<string, ThreatInfo>
): TileEvaluation[] {
  const matrix: TileEvaluation[] = [];

  for (const tile of state.board) {
    const key = `${tile.coord.q},${tile.coord.r}`;
    const peril = threatMatrix.get(key)?.totalThreatValue || 0;
    let opportunity = 0;
    const reasons: string[] = [];

    // Evaluate terrain
    if (tile.terrain === TerrainType.PLAINS) {
      if (tile.ownerId === null) {
        opportunity += TERRAIN_PLAINS_NEUTRAL_BONUS;
        reasons.push("Unclaimed Plains");
      } else if (tile.ownerId === playerId) {
        opportunity += TERRAIN_PLAINS_OWNED_BONUS;
      }
    } else if (tile.terrain === TerrainType.MOUNTAIN) {
      opportunity += TERRAIN_MOUNTAIN_BONUS;
      reasons.push("Mountain Defense");
    } else if (tile.terrain === TerrainType.FOREST) {
      opportunity -= TERRAIN_FOREST_PENALTY;
    }

    // Evaluate proximity to enemy/unclaimed settlements
    if (tile.ownerId !== playerId) {
      if (tile.terrain === TerrainType.VILLAGE) {
        opportunity += tile.ownerId === null ? UNCLAIMED_VILLAGE_PRIORITY_BONUS : IMMEDIATE_CAPTURE_BONUS;
        reasons.push("Valuable Settlement target");
      } else if (tile.terrain === TerrainType.GOLD_MINE) {
        opportunity += IMMEDIATE_CAPTURE_BONUS * 1.5;
        reasons.push("Gold Mine target");
      }
    }

    // Edge of peril bonus
    if (peril > 0 && peril < 50) {
      opportunity += EDGE_OF_PERIL_BONUS;
      reasons.push("Edge of peril");
    }

    const score = opportunity - (peril * THREAT_PENALTY_L1_MULT);

    matrix.push({
      q: tile.coord.q,
      r: tile.coord.r,
      peril,
      opportunity,
      score,
      reasons
    });
  }

  return matrix;
}
