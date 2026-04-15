import JSZip from 'jszip';
import { GameState } from '../types';

const FILE_EXTENSION = 'hexm';

export const saveGame = async (state: GameState) => {
  const zip = new JSZip();
  
  // Create a clean version of the state for saving (remove transient data if needed)
  const saveData = {
    ...state,
    selectedHex: null,
    selectedUnitId: null,
    possibleMoves: [],
    possibleAttacks: [],
    attackRange: [],
    animations: [],
    history: [], // We don't save undo history to keep file size small
    isPlaybackMode: undefined,
    demoTimeline: undefined,
    playbackIndex: undefined,
    isPlayingDemo: undefined,
    playbackSpeed: undefined
  };

  const jsonString = JSON.stringify(saveData);
  zip.file('game.json', jsonString);

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `save_${new Date().toISOString().slice(0, 10)}.${FILE_EXTENSION}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const loadGame = async (file: File): Promise<GameState> => {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);
  const jsonFile = loadedZip.file('game.json');
  
  if (!jsonFile) {
    throw new Error('Invalid save file: game.json not found');
  }

  const jsonString = await jsonFile.async('string');
  const state = JSON.parse(jsonString) as GameState;
  
  // Basic validation could be added here
  if (!state.board || !state.players || !state.units) {
    throw new Error('Invalid save file: missing core game data');
  }

  return state;
};
