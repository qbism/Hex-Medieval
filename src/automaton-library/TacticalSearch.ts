import { 
  GameState, 
  UNIT_STATS
} from '../types';
import { calculateThreatMatrix } from './threatAnalysis';
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
 */
export function evaluateState(state: GameState, playerId: number): number {
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.isEliminated) return -1000000;

  let score = 0;

  // 1. Kingdom Strength (Units + Settlements)
  score += calculateKingdomStrength(player, state);

  // 2. Gold / Income (weighted highly for long-term power)
  score += player.gold * 0.1;
  const lastIncome = player.incomeHistory[player.incomeHistory.length - 1] || 0;
  score += lastIncome * 5.0;

  // 3. Threat Assessment (Minimax flavor: how much peril are we in?)
  const threatMatrix = calculateThreatMatrix(state, playerId);
  let totalPeril = 0;
  
  for (const unit of state.units) {
    if (unit.ownerId === playerId) {
      const threat = threatMatrix.get(`${unit.coord.q},${unit.coord.r}`);
      if (threat) {
        // High penalty for units about to be destroyed (turnsToHit == 1)
        if (threat.minTurns === 1) {
          totalPeril += UNIT_STATS[unit.type].cost * 1.5;
        } else if (threat.minTurns === 2) {
          totalPeril += UNIT_STATS[unit.type].cost * 0.4;
        }
      }
    }
  }
  
  // High penalty for settlements under threat
  for (const tile of state.board) {
    if (tile.ownerId === playerId) {
      const threat = threatMatrix.get(`${tile.coord.q},${tile.coord.r}`);
      if (threat && threat.minTurns === 1) {
        score -= 200; // Base value of a settlement
      }
    }
  }

  return score - totalPeril;
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
    const targetKey = `${action.payload.target.q},${action.payload.target.r}`;
    const newState = {
      ...state,
      units: state.units.filter(u => `${u.coord.q},${u.coord.r}` !== targetKey),
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
  const activeUnit = simulatedState.units.find(u => u.id === action.payload.unitId);
  
  if (!activeUnit) return { score: -1000, risk: 1000, isSafe: false, bestResponseValue: 0 };

  // Calculate the threat to the unit at its NEW position
  const opponentThreatMatrix = calculateThreatMatrix(simulatedState, playerId);
  const threatAtNewPos = opponentThreatMatrix.get(`${activeUnit.coord.q},${activeUnit.coord.r}`);
  
  let riskValue = 0;
  let isSafe = true;
  let bestResponseValue = 0;

  if (threatAtNewPos && threatAtNewPos.minTurns === 1) {
    riskValue = UNIT_STATS[activeUnit.type].cost;
    bestResponseValue = threatAtNewPos.eminentThreatValue;

    // One-hit kill awareness: If we can be hit next turn, we are effectively dead
    // Unless we took out something of equal or greater value, it's a BAD move.
    const killedUnitKey = action.type === 'attack' ? `${action.payload.target.q},${action.payload.target.r}` : null;
    const killedUnit = killedUnitKey ? state.units.find(u => `${u.coord.q},${u.coord.r}` === killedUnitKey) : null;
    const killedUnitValue = killedUnit ? UNIT_STATS[killedUnit.type].cost : 0;

    // High-value units (Knight/Catapult) should never trade down
    if (UNIT_STATS[activeUnit.type].cost >= 150) {
      if (bestResponseValue > killedUnitValue * 0.9) {
        isSafe = false;
      }
    } else {
      // Even low value units shouldn't just suicide for nothing
      if (killedUnitValue < 50 && bestResponseValue > 100) {
        isSafe = false;
      }
    }
  }

  // Deeper search if requested (checking for 2-turn traps)
  if (depth > 1 && isSafe) {
    // We simulate a simplified "Greedy Response" from the opponent
    // Focus on: "Can the opponent hit me next turn if I stay here?"
    // This is already covered by minTurns === 1 in the threat matrix.
    // For depth 2, we should check if they can shift their army to entrap us.
  }

  const score = evaluateState(simulatedState, playerId) - riskValue;

  return { score, risk: riskValue, isSafe, bestResponseValue };
}
