import { 
  GameState, 
  HexCoord, 
  UnitType, 
  Unit, 
  TerrainType, 
  UNIT_STATS 
} from '../types';

export function applyMove(state: GameState, unitId: string, target: HexCoord): GameState {
  const unit = state.units.find(u => u.id === unitId);
  if (!unit) return state;

  const newBoard = state.board.map(tile => {
    if (tile.coord.q === target.q && tile.coord.r === target.r) {
      if (tile.ownerId === null && (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE)) {
        return { ...tile, ownerId: state.players[state.currentPlayerIndex].id };
      }
    }
    return tile;
  });

  const newUnits = state.units.map(u => {
    if (u.id === unitId) {
      return { ...u, coord: target, movesLeft: 0, hasAttacked: true, hasActed: true };
    }
    return u;
  });

  return {
    ...state,
    units: newUnits,
    board: newBoard,
    selectedUnitId: null,
    possibleMoves: [],
    possibleAttacks: [],
  };
}

export function applyAttack(state: GameState, attackerId: string, targetCoord: HexCoord): GameState {
  const currentAttacker = state.units.find(u => u.id === attackerId);
  if (!currentAttacker) return state;

  const currentDefender = state.units.find(u => u.coord.q === targetCoord.q && u.coord.r === targetCoord.r);

  const newUnits = state.units.map(u => {
    if (u.id === attackerId) return { ...u, hasAttacked: true, movesLeft: 0, hasActed: true };
    return u;
  }).filter(u => !(currentDefender && u.id === currentDefender.id));

  const newBoard = state.board.map(tile => {
    if (tile.coord.q === targetCoord.q && tile.coord.r === targetCoord.r && tile.ownerId !== currentAttacker.ownerId) {
      const isSettlement = tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE;
      if (isSettlement && !currentDefender) {
        if (tile.terrain === TerrainType.CASTLE) {
          return { ...tile, terrain: TerrainType.FORTRESS };
        } else if (tile.terrain === TerrainType.FORTRESS) {
          return { ...tile, terrain: TerrainType.VILLAGE };
        } else {
          return { ...tile, ownerId: null };
        }
      }
    }
    return tile;
  });

  return {
    ...state,
    units: newUnits,
    board: newBoard,
    selectedUnitId: null,
    possibleMoves: [],
    possibleAttacks: [],
  };
}

export function applyRecruitment(state: GameState, type: UnitType, coord: HexCoord): GameState {
  const player = state.players[state.currentPlayerIndex];
  const stats = UNIT_STATS[type];
  
  if (player.gold < stats.cost) return state;

  const unitAtHex = state.units.find(u => u.coord.q === coord.q && u.coord.r === coord.r);
  if (unitAtHex) return state;

  const newUnit: Unit = {
    id: `unit-${Date.now()}-${Math.random()}`,
    type,
    ownerId: player.id,
    movesLeft: 0,
    hasAttacked: true,
    hasActed: true,
    coord: coord,
  };

  const newPlayers = state.players.map(p => 
    p.id === player.id ? { ...p, gold: p.gold - stats.cost } : p
  );

  return {
    ...state,
    units: [...state.units, newUnit],
    players: newPlayers,
  };
}
