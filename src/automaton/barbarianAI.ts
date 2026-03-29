import { 
  GameState, 
  Player, 
  getDistance 
} from '../types';
import { getValidAttacks, getValidMoves } from '../gameEngine';
import { findNearestTarget } from './utils';
import { LoopSafety } from '../utils';

export function getBarbarianAction(state: GameState, currentPlayer: Player) {
  const myUnits = state.units.filter(u => u.ownerId === currentPlayer.id && !u.hasActed);
  const barbarianSafety = new LoopSafety('BarbarianAI-units', 1000);
  
  for (const unitToAct of myUnits) {
    if (barbarianSafety.tick()) break;
    
    const attacks = getValidAttacks(unitToAct, state.board, state.units);
    if (attacks.length > 0) {
      // Barbarians attack the nearest thing with no mercy
      return { type: 'attack' as const, payload: { unitId: unitToAct.id, target: attacks[0] } };
    } else {
      const moves = getValidMoves(unitToAct, state.board, state.units);
      if (moves.length > 0) {
        // Barbarians move towards the nearest target
        const { coord } = findNearestTarget(unitToAct.coord, state, currentPlayer.id);
        if (coord) {
          let bestMove = moves[0];
          let minDist = getDistance(moves[0], coord);
          for (const m of moves) {
            const d = getDistance(m, coord);
            if (d < minDist) {
              minDist = d;
              bestMove = m;
            }
          }
          return { type: 'move' as const, payload: { unitId: unitToAct.id, target: bestMove } };
        }
      }
      return { type: 'skipUnit' as const, payload: { unitId: unitToAct.id } };
    }
  }
  return null;
}
