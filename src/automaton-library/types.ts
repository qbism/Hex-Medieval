export interface TileEvaluation {
  q: number;
  r: number;
  peril: number;
  opportunity: number;
  score: number;
  reasons: string[];
  isAvailableTarget?: boolean;
}

export interface AutomatonAction {
  type: 'recruit' | 'attack' | 'move' | 'endTurn' | 'skipUnit' | 'upgrade' | 'surrender' | 'goRogue' | 'barbarianSurrender';
  payload?: any;
  matrix?: TileEvaluation[];
}
