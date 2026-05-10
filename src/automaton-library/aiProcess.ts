import { getAutomatonBestAction } from './Core';
import { GameState } from '../types';
import { AIConfig } from './AIConfig';

console.log('AI Worker script loaded and initializing...');

self.onmessage = (e: MessageEvent<{ state: GameState; config: AIConfig }>) => {
  const { state, config } = e.data;
  
  // Heartbeat check
  if (!state || state.turnNumber === -1) {
    console.log('AI Worker: Heartbeat/Validation check passed');
    return;
  }

  console.log('AI Worker: Processing turn', state.turnNumber, 'for player', state.currentPlayerIndex);
  try {
    const action = getAutomatonBestAction(state, config);
    self.postMessage({ action });
  } catch (error) {
    console.error('AI Worker: Runtime error during processing:', error);
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
