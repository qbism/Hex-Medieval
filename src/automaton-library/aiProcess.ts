import { getAutomatonBestAction } from './Core';
import { GameState } from '../types';
import { AIConfig } from './AIConfig';

console.log('AI Worker script loaded and initializing...');

self.onmessage = (e: MessageEvent<{ state: GameState; config: AIConfig }>) => {
  const { state, config } = e.data;
  console.log('AI Worker received task for turn:', state.turnNumber, 'Player:', state.currentPlayerIndex);
  try {
    const action = getAutomatonBestAction(state, config);
    self.postMessage({ action });
  } catch (error) {
    console.error('AI Worker processing error:', error);
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
