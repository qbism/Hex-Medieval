import JSZip from 'jszip';
import { GameState } from '../types';

const FILE_EXTENSION = 'hexd';

export const saveDemo = async (state: GameState) => {
  const zip = new JSZip();
  
  // We need the full history plus the current state to form the complete timeline
  const timeline = [...(state.history || []), {
    ...state,
    selectedHex: null,
    selectedUnitId: null,
    possibleMoves: [],
    possibleAttacks: [],
    attackRange: [],
    animations: [],
    history: []
  }];

  const jsonString = JSON.stringify(timeline);
  zip.file('demo.json', jsonString);

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `demo_${new Date().toISOString().slice(0, 10)}.${FILE_EXTENSION}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const loadDemo = async (file: File): Promise<Omit<GameState, 'history' | 'animations'>[]> => {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);
  const jsonFile = loadedZip.file('demo.json');
  
  if (!jsonFile) {
    throw new Error('Invalid demo file: demo.json not found');
  }

  const jsonString = await jsonFile.async('string');
  const timeline = JSON.parse(jsonString) as Omit<GameState, 'history' | 'animations'>[];
  
  if (!Array.isArray(timeline) || timeline.length === 0) {
    throw new Error('Invalid demo file: timeline is empty or invalid');
  }

  return timeline;
};
