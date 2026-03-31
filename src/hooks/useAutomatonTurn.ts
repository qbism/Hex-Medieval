import { useEffect, useRef, useMemo } from 'react';
import { GameState } from '../types';
import { getAutomatonBestAction } from '../automatonEngine';
import { GameActions } from './useGameActions';

interface UseAutomatonTurnProps {
  gameState: GameState | null;
  setupMode: boolean;
  actions: GameActions;
  setAutomatonStatus: (status: string) => void;
}

export function useAutomatonTurn({
  gameState,
  setupMode,
  actions,
  setAutomatonStatus
}: UseAutomatonTurnProps) {
  const isProcessingRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Memoize the parts of the state that actually matter for AI decisions
  const meaningfulState = useMemo(() => {
    if (!gameState) return null;
    return {
      board: gameState.board,
      units: gameState.units,
      players: gameState.players,
      currentPlayerIndex: gameState.currentPlayerIndex,
      turnNumber: gameState.turnNumber,
      winnerId: gameState.winnerId,
      animations: gameState.animations
    };
  }, [
    gameState?.board, 
    gameState?.units, 
    gameState?.players, 
    gameState?.currentPlayerIndex, 
    gameState?.turnNumber, 
    gameState?.winnerId,
    gameState?.animations
  ]);

  useEffect(() => {
    if (!meaningfulState || setupMode || meaningfulState.winnerId !== null) {
      isProcessingRef.current = false;
      return;
    }

    const currentPlayer = meaningfulState.players[meaningfulState.currentPlayerIndex];
    if (!currentPlayer.isAutomaton) {
      isProcessingRef.current = false;
      return;
    }

    if (isProcessingRef.current) return;
    
    // Only process if no animations are running
    if (meaningfulState.animations && meaningfulState.animations.length > 0) return;

    isProcessingRef.current = true;

    timerRef.current = setTimeout(() => {
      // Use the latest gameState from props here to ensure we have the full state
      if (!gameState) return;
      const action = getAutomatonBestAction(gameState);

      switch (action.type) {
        case 'endTurn':
          setAutomatonStatus("Ending turn...");
          actions.endTurn();
          break;
        case 'skipUnit':
          setAutomatonStatus("Unit holding position...");
          actions.skipUnit(action.payload.unitId);
          break;
        case 'move':
          setAutomatonStatus("Moving unit...");
          actions.moveUnit(action.payload.unitId, action.payload.target);
          break;
        case 'attack':
          setAutomatonStatus("Attacking!");
          actions.attackUnit(action.payload.unitId, action.payload.target);
          break;
        case 'recruit':
          setAutomatonStatus(`Recruiting ${action.payload.type}...`);
          actions.recruitUnit(action.payload.type, action.payload.coord);
          break;
        case 'upgrade':
          setAutomatonStatus("Upgrading settlement...");
          actions.upgradeSettlement(action.payload.coord);
          break;
        case 'goRogue': {
          const isBarbarian = gameState.players[gameState.currentPlayerIndex].name === 'Barbarians';
          setAutomatonStatus(isBarbarian ? "Barbarian forces surrendering!" : "Empire collapsing! Going rogue...");
          actions.concedeGame();
          break;
        }
      }
      isProcessingRef.current = false;
    }, 500); // Delay for visual pacing

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      isProcessingRef.current = false;
    };
  }, [meaningfulState, setupMode, actions, setAutomatonStatus]);
}
