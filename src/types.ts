import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface Point {
  x: number;
  y: number;
}

export interface HexCoord {
  q: number;
  r: number;
  s: number;
}

export enum TerrainType {
  PLAINS = 'Plains',
  FOREST = 'Forest',
  MOUNTAIN = 'Mountain',
  WATER = 'Water',
  VILLAGE = 'Village',
  FORTRESS = 'Fortress',
  CASTLE = 'Castle',
  GOLD_MINE = 'Gold mine',
}

export const SETTLEMENT_INCOME: Record<TerrainType, number> = {
  [TerrainType.PLAINS]: 0,
  [TerrainType.FOREST]: 0,
  [TerrainType.MOUNTAIN]: 0,
  [TerrainType.WATER]: 0,
  [TerrainType.VILLAGE]: 20,
  [TerrainType.FORTRESS]: 40,
  [TerrainType.CASTLE]: 80,
  [TerrainType.GOLD_MINE]: 100,
};

export const UPGRADE_COSTS: Record<string, number> = {
  [TerrainType.VILLAGE]: 100,
  [TerrainType.GOLD_MINE]: 400,
  [TerrainType.FORTRESS]: 150,
  [TerrainType.CASTLE]: 200,
};

export enum UnitType {
  INFANTRY = 'Infantry',
  ARCHER = 'Archer',
  KNIGHT = 'Knight',
  CATAPULT = 'Catapult',
}

export const UNIT_STATS: Record<UnitType, { cost: number; range: number; moves: number }> = {
  [UnitType.INFANTRY]: { cost: 50, range: 1, moves: 2 },
  [UnitType.ARCHER]: { cost: 100, range: 2, moves: 2 },
  [UnitType.KNIGHT]: { cost: 200, range: 1, moves: 4 },
  [UnitType.CATAPULT]: { cost: 300, range: 3, moves: 1 },
};

export interface Unit {
  id: string;
  type: UnitType;
  ownerId: number;
  movesLeft: number;
  hasAttacked: boolean;
  hasActed: boolean;
  coord: HexCoord;
}

export interface HexTile {
  coord: HexCoord;
  terrain: TerrainType;
  ownerId: number | null; // For villages/castles
}

export interface Player {
  id: number;
  name: string;
  color: string;
  isAutomaton: boolean;
  gold: number;
  isEliminated: boolean;
  incomeHistory: number[];
  strengthHistory: number[];
  isOriginalBarbarian?: boolean;
  isBarbarian?: boolean;
}

export interface TileEvaluation {
  q: number;
  r: number;
  peril: number;
  opportunity: number;
  score: number;
  reasons: string[];
  isAvailableTarget?: boolean;
}

export interface ThreatInfo {
  minTurns: number;
  totalThreatValue: number;
  attackerCount: number;
  eminentThreatValue: number; // Value from 1-turn attackers only
  eminentAttackerCount: number; // Count of 1-turn attackers only
}

export interface StrategicAnalysis {
  threatMap: Record<string, ThreatInfo>;
  opportunityMap: Record<string, number>;
  influenceMap: Record<string, number>;
}

export interface GameState {
  board: HexTile[];
  units: Unit[];
  players: Player[];
  currentPlayerIndex: number;
  turnNumber: number;
  selectedHex: HexCoord | null;
  selectedUnitId: string | null;
  possibleMoves: HexCoord[];
  possibleAttacks: HexCoord[];
  attackRange: HexCoord[];
  winnerId: number | null;
  isBarbarianInvasion?: boolean;
  opportunityPerilMatrix?: TileEvaluation[];
  strategicAnalysis?: StrategicAnalysis;
  history: Omit<GameState, 'history' | 'animations'>[];
  animations: {
    id: string;
    unitId: string;
    type: 'move' | 'attack' | 'damage' | 'miss';
    from?: HexCoord;
    to?: HexCoord;
    value?: number;
  }[];
  // Demo Playback State
  isPlaybackMode?: boolean;
  demoTimeline?: Omit<GameState, 'history' | 'animations'>[];
  playbackIndex?: number;
  isPlayingDemo?: boolean;
  playbackSpeed?: number;
}

// Hex Math Utilities (Pointy-top)
export const HEX_SIZE = 1;

export const UNIT_ICONS: Record<UnitType, string> = {
  [UnitType.INFANTRY]: '⚔️',
  [UnitType.ARCHER]: '🏹',
  [UnitType.KNIGHT]: '🐎',
  [UnitType.CATAPULT]: '🪨',
};

export function axialToCube(q: number, r: number): HexCoord {
  return { q, r, s: -q - r };
}

export function cubeToAxial(q: number, r: number, _s: number): { q: number; r: number } {
  return { q, r };
}

export function hexToPixel(q: number, r: number): Point {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
  const y = HEX_SIZE * (3 / 2) * r;
  return { x, y };
}

export function pixelToHex(x: number, y: number): { q: number; r: number } {
  const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / HEX_SIZE;
  const r = (2 / 3 * y) / HEX_SIZE;
  return hexRound(q, r);
}

function hexRound(q: number, r: number): { q: number; r: number } {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);

  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);

  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }

  return { q: rq, r: rr };
}

export function getDistance(a: HexCoord, b: HexCoord, _board?: HexTile[]): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
}

export function getNeighbors(coord: HexCoord): HexCoord[] {
  const directions = [
    { q: 1, r: 0, s: -1 }, { q: 1, r: -1, s: 0 }, { q: 0, r: -1, s: 1 },
    { q: -1, r: 0, s: 1 }, { q: -1, r: 1, s: 0 }, { q: 0, r: 1, s: -1 }
  ];
  return directions.map(d => ({
    q: coord.q + d.q,
    r: coord.r + d.r,
    s: coord.s + d.s
  }));
}
