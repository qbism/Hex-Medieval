import { useEffect, useRef, useMemo } from 'react';
import { GameState } from '../types';
import { getAutomatonBestAction } from '../automaton-library';
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
  const lastStateRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const actionsTakenRef = useRef(0);
  const lastPlayerKeyRef = useRef("");

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
    if (!meaningfulState || setupMode || meaningfulState.winnerId !== null || gameState?.isPlaybackMode) {
      isProcessingRef.current = false;
      return;
    }

    const currentPlayer = meaningfulState.players[meaningfulState.currentPlayerIndex];
    if (currentPlayer.isAutomaton) {
      // Prevent redundant processing if state hasn't changed since last action
      if (meaningfulState === lastStateRef.current) {
        // If we've already tried to take an action and the state didn't change, 
        // we might be in a no-op loop or stuck.
        if (actionsTakenRef.current > 0 && !isProcessingRef.current) {
          console.warn('AI stuck on state, forcing end turn');
          actions.endTurn();
        }
        return;
      }
    } else {
      isProcessingRef.current = false;
      return;
    }

    if (isProcessingRef.current) return;
    
    // Reset action counter if player or turn changed
    const playerKey = `${meaningfulState.turnNumber}-${meaningfulState.currentPlayerIndex}`;
    if (playerKey !== lastPlayerKeyRef.current) {
      actionsTakenRef.current = 0;
      lastPlayerKeyRef.current = playerKey;
    }

    if (actionsTakenRef.current > 200) {
      console.warn('Automaton exceeded action limit, ending turn.');
      setAutomatonStatus("Ending turn (limit reached)...");
      actions.endTurn();
      return;
    }

    // Only process if no animations are running
    if (meaningfulState.animations && meaningfulState.animations.length > 0) return;

    isProcessingRef.current = true;

    // Use a Web Worker to keep the UI responsive during heavy AI computation
    const worker = new Worker(new URL('../automaton-library/worker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (e) => {
      if (!gameState) {
        isProcessingRef.current = false;
        worker.terminate();
        return;
      }

      if (e.data.error) {
        console.error('Automaton worker error:', e.data.error);
        actions.endTurn();
        isProcessingRef.current = false;
        worker.terminate();
        return;
      }

      const action = e.data.action;
      
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
            const isBarbarian = gameState.players[gameState.currentPlayerIndex].name === 'Barbarians';
            setAutomatonStatus(isBarbarian ? "Barbarian forces surrendering!" : "Empire collapsing! Going rogue...");
            actions.concedeGame();
            break;
          }
          case 'barbarianSurrender':
            setAutomatonStatus("Barbarian forces surrendering to your might!");
            actions.barbarianSurrender();
            break;
        }
      } catch (error) {
        console.error('Automaton error post-worker:', error);
        actions.endTurn();
      }
      
      isProcessingRef.current = false;
      worker.terminate();
    };

    worker.onerror = (error) => {
      console.error('Worker failed to initialize:', error);
      // Fallback to synchronous if worker fails
      try {
        const action = getAutomatonBestAction(gameState as GameState);
        if (action.matrix) actions.updateAIMatrix(action.matrix);
        actions.endTurn(); 
      } catch (e) {
        actions.endTurn();
      }
      isProcessingRef.current = false;
      worker.terminate();
    };

    // Post message to worker with a timeout delay to allow the "Analyzing battlefield..." status to render
    timerRef.current = setTimeout(() => {
      worker.postMessage({ state: meaningfulState, config: (gameState as any).config || undefined });
    }, 150);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      worker.terminate();
      isProcessingRef.current = false;
    };

  }, [meaningfulState, setupMode, actions, setAutomatonStatus, gameState]);
}
