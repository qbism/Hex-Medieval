import { 
  GameState, 
  UNIT_STATS,
  ThreatInfo
} from '../types';
import { getThreatAtCoord } from './threatAnalysis';
import { calculateKingdomStrength } from './utils';

/**
 * TacticalSearch provides deep-lookahead capabilities for high-value units.
 * It simulates potential outcomes 1-2 responses deep to assess risk.
 */

export interface SearchResult {
  score: number;
  risk: number;
  isSafe: boolean;
  bestResponseValue: number;
}

/**
 * Evaluates the "quality" of a game state from a specific player's perspective.
 * Optimized: Takes optional threat info to avoid massive recalculation overhead.
 */
export function evaluateState(state: GameState, playerId: number, activeUnitId?: string, threatAtNewPos?: ThreatInfo): number {
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.isEliminated) return -1000000;

  let score = 0;

  // 1. Kingdom Strength (Units + Settlements)
  score += calculateKingdomStrength(player, state);

  // 2. Gold / Income (weighted highly for long-term power)
  score += (player.gold || 0) * 0.1;
  const lastIncome = (player.incomeHistory && player.incomeHistory.length > 0) 
    ? player.incomeHistory[player.incomeHistory.length - 1] 
    : 0;
  score += lastIncome * 5.0;

  // 3. Selective Threat Assessment (Optimization: Only consider the active unit's peril change)
  if (activeUnitId && threatAtNewPos) {
    if (threatAtNewPos.minTurns === 1) {
      const activeUnit = state.units.find(u => u.id === activeUnitId);
      if (activeUnit) {
        score -= UNIT_STATS[activeUnit.type].cost * 1.5;
      }
    } else if (threatAtNewPos.minTurns === 2) {
      const activeUnit = state.units.find(u => u.id === activeUnitId);
      if (activeUnit) {
        score -= UNIT_STATS[activeUnit.type].cost * 0.4;
      }
    }
  }

  return score;
}

/**
 * Simulates an action on a CLONED state.
 */
function simulateAction(state: GameState, action: { type: 'move' | 'attack', payload: any }): GameState {
  if (action.type === 'move') {
    return {
      ...state,
      units: state.units.map(u => {
        if (u.id === action.payload.unitId) {
          return { ...u, coord: { ...action.payload.target }, hasActed: true, movesLeft: 0 };
        }
        return u;
      })
    };
  } else {
    const targetQ = action.payload?.target?.q;
    const targetR = action.payload?.target?.r;
    const targetKey = (targetQ !== undefined && targetR !== undefined) ? `${targetQ},${targetR}` : 'invalid';
    const newState = {
      ...state,
      units: state.units.filter(u => `${u.coord?.q},${u.coord?.r}` !== targetKey),
    };
    
    newState.units = newState.units.map(u => {
      if (u.id === action.payload.unitId) {
        return { ...u, hasActed: true, movesLeft: 0, hasAttacked: true };
      }
      return u;
    });

    return newState;
  }
}

/**
 * Minimax-style tactical check.
 * "If I perform this action, what is the best counter-move the enemy has?"
 */
export function evaluateActionSafety(
  state: GameState, 
  action: { type: 'move' | 'attack', payload: any },
  playerId: number,
  depth: number = 1
): SearchResult {
  const simulatedState = simulateAction(state, action);
  const activeUnitId = action.payload.unitId;
  const activeUnit = simulatedState.units.find(u => u.id === activeUnitId);
  
  if (!activeUnit) return { score: -1000, risk: 1000, isSafe: false, bestResponseValue: 0 };

  // Optimized: Calculate threat only for the target coordinate
  const threatAtNewPos = getThreatAtCoord(activeUnit.coord, simulatedState, playerId);
  
  let riskValue = 0;
  let isSafe = true;
  let bestResponseValue = 0;

  if (threatAtNewPos && threatAtNewPos.minTurns > 0) {
    if (threatAtNewPos.minTurns === 1) {
      riskValue = UNIT_STATS[activeUnit.type].cost;
      bestResponseValue = threatAtNewPos.eminentThreatValue;
    } else if (threatAtNewPos.minTurns === 2) {
      // Potential trap/range threat awareness
      riskValue = UNIT_STATS[activeUnit.type].cost * 0.3;
      bestResponseValue = threatAtNewPos.totalThreatValue * 0.5;
    }

    const tQ = action.payload?.target?.q;
    const tR = action.payload?.target?.r;
    const killedUnitKey = (action.type === 'attack' && tQ !== undefined && tR !== undefined) ? `${tQ},${tR}` : null;
    const killedUnit = killedUnitKey ? state.units.find(u => `${u.coord?.q},${u.coord?.r}` === killedUnitKey) : null;
    const killedUnitValue = killedUnit ? UNIT_STATS[killedUnit.type].cost : 0;

    // High-value units (Knight/Catapult) should never trade down
    if (UNIT_STATS[activeUnit.type].cost >= 150) {
      if (bestResponseValue > killedUnitValue * 0.9) {
        if (threatAtNewPos.minTurns === 1) isSafe = false;
        else riskValue += 100; // Extra penalty for walking into potential knight range
      }
    } else {
      // Low value units suicide awareness
      if (killedUnitValue < 50 && bestResponseValue > 100 && threatAtNewPos.minTurns === 1) {
        isSafe = false;
      }
    }
  }

  // Optimized evaluateState call
  const score = evaluateState(simulatedState, playerId, activeUnitId, threatAtNewPos) - riskValue;

  return { score, risk: riskValue, isSafe, bestResponseValue };
}
