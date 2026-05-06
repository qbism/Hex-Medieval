import { 
  GameState, 
  TerrainType,
  getNeighbors,
  UNIT_STATS,
  StrategicAnalysis,
  UnitType
} from '../types';
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
  threatMatrix: Map<string, ThreatInfo>,
  strategicAnalysis?: StrategicAnalysis
): TileEvaluation[] {
  const matrix: TileEvaluation[] = [];
  const boardMap = new Map(state.board.map(t => [`${t.coord.q},${t.coord.r}`, t]));
  const unitMap = new Map(state.units.map(u => [`${u.coord.q},${u.coord.r}`, u]));

  for (const tile of state.board) {
    const key = `${tile.coord.q},${tile.coord.r}`;
    
    // Use pre-calculated values if available
    if (strategicAnalysis) {
      const opportunity = strategicAnalysis.opportunityMap[key] || 0;
      const threatInfo = strategicAnalysis.threatMap[key] || { eminentThreatValue: 0, totalThreatValue: 0 };
      const peril = threatInfo.eminentThreatValue;
      const potentialPeril = threatInfo.totalThreatValue - peril;
      const score = opportunity - (peril * THREAT_PENALTY_L1_MULT) - (potentialPeril * 0.05);

      matrix.push({
        q: tile.coord.q,
        r: tile.coord.r,
        peril,
        opportunity,
        score,
        reasons: ["Global Strategic Map"]
      });
      continue;
    }

    const peril = threatMatrix.get(key)?.eminentThreatValue || 0;
    const potentialPeril = (threatMatrix.get(key)?.totalThreatValue || 0) - peril;
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
      let isAdjacentToEnemyCatapult = false;
      const neighbors = getNeighbors(tile.coord);
      for (const n of neighbors) {
        const u = unitMap.get(`${n.q},${n.r}`);
        if (u && u.ownerId !== playerId && u.type === UnitType.CATAPULT) {
          isAdjacentToEnemyCatapult = true;
          break;
        }
      }
      if (isAdjacentToEnemyCatapult) {
        opportunity += 50;
        reasons.push("Forest cover adjacent to enemy catapult");
      }
    }

    // Evaluate proximity to enemy/unclaimed settlements
    if (tile.ownerId !== playerId) {
      const unitAtSettlement = unitMap.get(`${tile.coord.q},${tile.coord.r}`);
      // LARGE bonus for undefended settlements
      const undefendedBonus = (!unitAtSettlement) ? 150 : 0; 

      if (tile.terrain === TerrainType.VILLAGE) {
        opportunity += tile.ownerId === null ? (UNCLAIMED_VILLAGE_PRIORITY_BONUS + undefendedBonus) : (IMMEDIATE_CAPTURE_BONUS * 5 + undefendedBonus);
        reasons.push(unitAtSettlement ? "Valuable Settlement target" : "Undefended Settlement! Capture now!");
      } else if (tile.terrain === TerrainType.GOLD_MINE) {
        opportunity += (IMMEDIATE_CAPTURE_BONUS * 8 + undefendedBonus);
        reasons.push("Gold Mine target");
      }
    }

    // Evaluate enemy units as opportunities
    const unitOnTile = unitMap.get(key);
    if (unitOnTile && unitOnTile.ownerId !== playerId) {
      const unitValue = 50 + (UNIT_STATS[unitOnTile.type].cost / 2);
      opportunity += unitValue;
      reasons.push(`Target: ${unitOnTile.type}`);
    }

    // Opportunity nearby enemy settlements (The "Bonus" the user requested)
    const neighbors = getNeighbors(tile.coord);
    for (const nb of neighbors) {
      const nTile = boardMap.get(`${nb.q},${nb.r}`);
      if (nTile && nTile.ownerId !== null && nTile.ownerId !== playerId) {
        const isSettlement = [TerrainType.VILLAGE, TerrainType.FORTRESS, TerrainType.CASTLE, TerrainType.GOLD_MINE].includes(nTile.terrain);
        if (isSettlement) {
          const unitAtSettlement = unitMap.get(`${nTile.coord.q},${nTile.coord.r}`);
          // Increased bonus for being NEAR an undefended enemy base
          const undefendedBonus = unitAtSettlement ? 0 : 80;
          opportunity += 50 + undefendedBonus;
          reasons.push(unitAtSettlement ? "Proximity to enemy settlement" : "Near undefended enemy settlement");
        }
      }
    }

    // Edge of peril bonus (rewards being close but not in immediate danger)
    if (peril === 0 && potentialPeril > 0) {
      opportunity += EDGE_OF_PERIL_BONUS;
      reasons.push("Tactical proximity");
    }

    // Final score calculation
    // Peril is eminent threat only (as requested: "Peril is only what enemy units can attack WITHOUT moving")
    const adjustedPeril = peril; 
    const score = opportunity - (adjustedPeril * THREAT_PENALTY_L1_MULT) - (potentialPeril * 0.05);

    matrix.push({
      q: tile.coord.q,
      r: tile.coord.r,
      peril: adjustedPeril,
      opportunity,
      score,
      reasons
    });
  }

  return matrix;
}
