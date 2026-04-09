import { TerrainType } from '../types';

export const PLAYER_COLORS = ['#e11d48', '#0044ff', '#facc15', '#d97706', '#7c3aed', '#00bbcc'];
export const BARBARIAN_COLOR = '#444444';

export const COLOR_NAMES: Record<string, string> = {
  '#e11d48': 'Red',
  '#0044ff': 'Blue',
  '#facc15': 'Yellow',
  '#d97706': 'Orange',
  '#7c3aed': 'Purple',
  '#00bbcc': 'Cyan',
  [BARBARIAN_COLOR]: 'Barbarian',
};

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  [TerrainType.WATER]: '#7495be',
  [TerrainType.PLAINS]: '#8db52d',
  [TerrainType.FOREST]: '#15803d',
  [TerrainType.MOUNTAIN]: '#57534e',
  [TerrainType.VILLAGE]: '#fcd34d',
  [TerrainType.FORTRESS]: '#9ca3af',
  [TerrainType.CASTLE]: '#4b5563',
  [TerrainType.GOLD_MINE]: '#fbbf24',
};
