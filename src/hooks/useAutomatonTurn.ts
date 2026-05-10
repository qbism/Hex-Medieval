import { useEffect, useRef, useMemo } from 'react';
import { GameState } from '../types';
import { GameActions } from './useGameActions';
// @ts-expect-error - Vite specific worker import
import AIWorker from '../automaton-library/worker?worker&inline';
import { getAutomatonBestAction } from '../automaton-library/Core';

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
  const workerRef = useRef<Worker | null>(null);
  const workerIsBrokenRef = useRef(false);

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

  const executeSyncFallback = (meaningfulState: any) => {
    console.warn('AI turn: Running synchronous execution fallback.');
    try {
      const prunedBoard = meaningfulState.board.map((t: any) => ({
        coord: t.coord,
        terrain: t.terrain,
        ownerId: t.ownerId
      }));
      
      const workerState = {
        ...meaningfulState,
        board: prunedBoard
      };

      const config = (gameState as any).config || undefined;
      const action = getAutomatonBestAction(workerState as any, config);
      
      // Execute action
      handleAction(action, meaningfulState);
    } catch (err) {
      console.error("AI Sync Fallback failed:", err);
      actions.endTurn();
      isProcessingRef.current = false;
    }
  };

  useEffect(() => {
    // Initialize worker once
    try {
      workerRef.current = new AIWorker();
      console.log('AI worker initialized successfully via Vite plugin');

      workerRef.current.onerror = (e: any) => {
        console.error('CRITICAL: Worker initialization/runtime error:', e);
        workerIsBrokenRef.current = true;
      };
    } catch (err) {
      console.error('Failed to create AIWorker instance:', err);
      workerIsBrokenRef.current = true;
    }
    
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

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
    
    if (!workerRef.current || workerIsBrokenRef.current) {
      if (!workerRef.current) {
        console.warn('AI turn started but worker is not initialized!');
      } else {
        console.warn('AI turn started but worker is marked as broken!');
      }
      executeSyncFallback(meaningfulState);
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

    if (actionsTakenRef.current > 500) {
      console.warn('Automaton exceeded action limit, ending turn.');
      setAutomatonStatus("Ending turn (limit reached)...");
      actions.endTurn();
      return;
    }

    // Only process if no animations are running
    if (meaningfulState.animations && meaningfulState.animations.length > 0) return;

    isProcessingRef.current = true;
    const worker = workerRef.current;
    console.log(`AI Turn beginning for player ${meaningfulState.currentPlayerIndex} (Action #${actionsTakenRef.current})`);
    let active = true;

    const handleMessage = (e: MessageEvent) => {
      if (!active) {
        isProcessingRef.current = false;
        return;
      }
      
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);

      if (!gameState) {
        isProcessingRef.current = false;
        return;
      }

      if (e.data.error) {
        console.error('Automaton worker error:', e.data.error);
        actions.endTurn();
        isProcessingRef.current = false;
        return;
      }

      handleAction(e.data.action, meaningfulState);
    };

    const handleError = (error: ErrorEvent) => {
      if (!active) {
        isProcessingRef.current = false;
        return;
      }
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      console.error('Worker failed during execution:', error);
      
      // Mark as broken and fallback
      workerIsBrokenRef.current = true;
      executeSyncFallback(meaningfulState);
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    // Post message to worker with a timeout delay to allow the status to render
    timerRef.current = setTimeout(() => {
      if (!active) return;
      try {
        // Only clone the necessary data, avoid structuredClone if the object is too deep/complex
        // or if we can just take a snapshot of the raw data.
        // We also prune the board to minimize transfer size.
        const prunedBoard = meaningfulState.board.map(t => ({
          coord: t.coord,
          terrain: t.terrain,
          ownerId: t.ownerId
        }));
        
        const workerState = {
          ...meaningfulState,
          board: prunedBoard
        };
        
        worker.postMessage({ state: workerState, config: (gameState as any).config || undefined });
      } catch {
        // Last resort fallback
        try {
          const workerState = JSON.parse(JSON.stringify(meaningfulState));
          worker.postMessage({ state: workerState, config: (gameState as any).config || undefined });
        } catch (innerE) {
          console.error("Failed to post to worker:", innerE);
          isProcessingRef.current = false;
        }
      }
    }, 150);

    return () => {
      active = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      // Reset processing flag so next effect run can start
      isProcessingRef.current = false;
    };

  }, [meaningfulState, setupMode, actions, setAutomatonStatus, gameState]);
}
