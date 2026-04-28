import { TerrainType } from '../types';

export const PLAYER_COLORS = ['#ff0000', '#0000ff', '#ffff00', '#ff8800', '#bf00ff', '#00ffff'];
export const BARBARIAN_COLOR = '#444444';

export const COLOR_NAMES: Record<string, string> = {
  '#ff0000': 'Red',
  '#0000ff': 'Blue',
  '#ffff00': 'Yellow',
  '#ff8800': 'Orange',
  '#bf00ff': 'Purple',
  '#00ffff': 'Cyan',
  [BARBARIAN_COLOR]: 'Barbarian',
};

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  [TerrainType.WATER]: '#7495be',
  [TerrainType.PLAINS]: '#7ca54a',
  [TerrainType.FOREST]: '#26894b',
  [TerrainType.MOUNTAIN]: '#676767',
  [TerrainType.VILLAGE]: '#a99573',
  [TerrainType.FORTRESS]: '#9ca3af',
  [TerrainType.CASTLE]: '#4b5563',
  [TerrainType.GOLD_MINE]: '#676767',
};
