import { getAutomatonBestAction } from './Core';
import { GameState } from '../types';
import { AIConfig } from './AIConfig';

self.onmessage = (e: MessageEvent<{ state: GameState; config: AIConfig }>) => {
  const { state, config } = e.data;
  console.log('AI Worker received task:', state.turnNumber, 'Player:', state.currentPlayerIndex);
  try {
    const action = getAutomatonBestAction(state, config);
    self.postMessage({ action });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
