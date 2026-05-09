import { TerrainType } from '../types';

export const COLOR_NAMES: Record<string, string> = {
  '#ff2222': 'Red',
  '#3333ff': 'Blue',
  '#ffff00': 'Yellow',
  '#ff8800': 'Orange',
  '#bf00ff': 'Purple',
  '#00ffcc': 'Cyan',
  '#444444': 'Barbarian',
};

export const PLAYER_COLORS = Object.keys(COLOR_NAMES);

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
