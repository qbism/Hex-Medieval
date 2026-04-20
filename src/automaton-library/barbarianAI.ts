import { GameState, TerrainType, HexCoord, getNeighbors, getDistance } from '../types';
import { AutomatonAction } from './types';
import { getValidMoves, getValidAttacks } from '../game/units';

export function getBarbarianAction(state: GameState, currentPlayer: any, cachedData: any): AutomatonAction {
  const barbarianPlayer = currentPlayer;
  
  if (!barbarianPlayer.isAutomaton) {
    return { type: 'endTurn' };
  }

  // Find a barbarian unit that can act
  for (const unit of state.units) {
    if (unit.ownerId === barbarianPlayer.id && !unit.hasActed) {
      // Check attacks
      const attacks = getValidAttacks(unit, state.board, state.units);
      if (attacks.length > 0) {
        return {
          type: 'attack',
          payload: { unitId: unit.id, target: attacks[0] }
        };
      }
      
      // Move towards nearest non-barbarian unit or settlement
      const moves = getValidMoves(unit, state.board, state.units);
      if (moves.length > 0) {
        let bestMove = moves[0];
        let minDiff = Infinity;
        
        for (const t of state.board) {
          if ((t.ownerId !== null && t.ownerId !== barbarianPlayer.id) || 
              (state.units.some(u => u.ownerId !== barbarianPlayer.id && u.coord.q === t.coord.q && u.coord.r === t.coord.r))) {
            const distToTarget = getDistance(unit.coord, t.coord);
            for (const m of moves) {
               const d = getDistance(m, t.coord);
               if (d < minDiff) {
                 minDiff = d;
                 bestMove = m;
               }
            }
          }
        }
        
        return {
          type: 'move',
          payload: { unitId: unit.id, target: bestMove }
        };
      } else {
        return { type: 'skipUnit', payload: { unitId: unit.id } };
      }
    }
  }

  return { type: 'endTurn' };
}
