import { useEffect, useRef, useMemo } from 'react';
import { GameState } from '../types';
import { GameActions } from './useGameActions';
import { getAutomatonBestAction } from '../automaton-library/Core';
import { AIConfig } from '../automaton-library/AIConfig';

interface UseAutomatonTurnProps {
  gameState: GameState | null;
  setupMode: boolean;
  actions: GameActions;
  setAutomatonStatus: (status: string) => void;
  aiConfig?: AIConfig;
}

export function useAutomatonTurn({
  gameState,
  setupMode,
  actions,
  setAutomatonStatus,
  aiConfig
}: UseAutomatonTurnProps) {
  const isProcessingRef = useRef(false);
  const lastStateRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const actionsTakenRef = useRef(0);
  const lastPlayerKeyRef = useRef("");

  const handleAction = (action: any, meaningfulState: any) => {
    try {
      // Update the shared opportunity/peril matrix if provided
      if (action.matrix) {
        actions.updateAIMatrix(action.matrix);
      }

      // Mark this state as processed to avoid loops
      lastStateRef.current = meaningfulState;
      actionsTakenRef.current++;

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
          const isBarbarian = (gameState as any).players[(gameState as any).currentPlayerIndex].name === 'Barbarians';
          setAutomatonStatus(isBarbarian ? "Barbarian forces surrendering!" : "Empire collapsing! Going rogue...");
          actions.concedeGame();
          break;
        }
        case 'barbarianSurrender':
          setAutomatonStatus("Barbarian forces surrendering!");
          actions.barbarianSurrender();
          break;
      }
    } catch (error) {
      console.error('Automaton error handling action:', error);
      actions.endTurn();
    }
    
    isProcessingRef.current = false;
  };

  const executeSyncAI = (meaningfulState: any) => {
    // Small timeout to break the React update depth limit chain and allow UI updates
    timerRef.current = setTimeout(() => {
      try {
        const prunedBoard = meaningfulState.board.map((t: any) => ({
          coord: t.coord,
          terrain: t.terrain,
          ownerId: t.ownerId
        }));
        
        const aiState = {
          ...meaningfulState,
          board: prunedBoard
        };

        const config = aiConfig || (gameState as any).config || undefined;
        const action = getAutomatonBestAction(aiState as any, config);
        
        // Execute action
        handleAction(action, meaningfulState);
      } catch (err) {
        console.error("AI execution failed:", err);
        actions.endTurn();
        isProcessingRef.current = false;
      }
    }, 150);
  };

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
    if (!meaningfulState) return;
    if (setupMode) return;
    if (meaningfulState.winnerId !== null) return;
    if (gameState?.isPlaybackMode) return;
    
    const currentPlayer = meaningfulState.players[meaningfulState.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.isEliminated || !currentPlayer.isAutomaton) {
      isProcessingRef.current = false;
      return;
    }

    // Reset action counter if player or turn changed
    const playerKey = `${meaningfulState.turnNumber}-${meaningfulState.currentPlayerIndex}`;
    if (playerKey !== lastPlayerKeyRef.current) {
      actionsTakenRef.current = 0;
      lastPlayerKeyRef.current = playerKey;
    }

    if (actionsTakenRef.current > 100) {
      console.warn('Automaton exceeded action limit, ending turn.');
      setAutomatonStatus("Ending turn (limit reached)...");
      actions.endTurn();
      return;
    }

    // Prevent redundant processing if state hasn't changed since last action
    if (meaningfulState === lastStateRef.current) return;

    if (isProcessingRef.current) return;
    
    // Only process if no animations are running
    if (meaningfulState.animations && meaningfulState.animations.length > 0) return;

    isProcessingRef.current = true;
    console.log(`AI Turn: Player ${meaningfulState.currentPlayerIndex}, Action #${actionsTakenRef.current + 1}`);
    
    executeSyncAI(meaningfulState);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      isProcessingRef.current = false;
    };
  }, [meaningfulState, setupMode, actions, setAutomatonStatus, gameState]);
}
