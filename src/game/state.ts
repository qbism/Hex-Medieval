import { 
  GameState, 
  TerrainType, 
  UnitType, 
  Player, 
  axialToCube, 
  HexCoord,
  Unit,
  UNIT_STATS,
  SETTLEMENT_INCOME,
  UPGRADE_COSTS
} from '../types';
import { LoopSafety } from '../utils';
import { BOARD_RADIUS, generateBoard, getSpawnPoints } from './board';

const COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2'];

export function createInitialState(playerConfigs: { name: string; isAutomaton: boolean }[]): GameState {
  const players: Player[] = playerConfigs.map((config, i) => ({
    id: i,
    name: config.name,
    color: COLORS[i],
    isAutomaton: config.isAutomaton,
    gold: 500,
    isEliminated: false,
    incomeHistory: [],
    strengthHistory: [],
  }));

  // Add Barbarian player
  const barbarianId = players.length;
  players.push({
    id: barbarianId,
    name: 'Barbarians',
    color: '#444444',
    isAutomaton: true,
    gold: 0,
    isEliminated: true,
    incomeHistory: [],
    strengthHistory: [],
    isOriginalBarbarian: true,
  });

  // Place starting castles and units for each player
  const spawnPoints = getSpawnPoints(BOARD_RADIUS, playerConfigs.length);

  const board = generateBoard(BOARD_RADIUS, spawnPoints);
  const units: Unit[] = [];
  
  players.forEach((player, i) => {
    if (player.id === barbarianId) return;

    const spawn = spawnPoints[i];
    // Find the tile at spawn and make it a castle
    const tile = board.find(t => t.coord.q === spawn.q && t.coord.r === spawn.r);
    if (tile) {
      tile.terrain = TerrainType.CASTLE;
      tile.ownerId = player.id;
    }

    // Add starting unit
    const stats = UNIT_STATS[UnitType.INFANTRY];
    units.push({
      id: `unit-${player.id}-start`,
      type: UnitType.INFANTRY,
      ownerId: player.id,
      movesLeft: stats.moves,
      hasAttacked: false,
      hasActed: false,
      coord: axialToCube(spawn.q, spawn.r),
    });
  });

  return {
    board,
    units,
    players,
    currentPlayerIndex: 0,
    turnNumber: 1,
    selectedHex: null,
    selectedUnitId: null,
    possibleMoves: [],
    possibleAttacks: [],
    attackRange: [],
    winnerId: null,
    history: [],
    animations: [],
  };
}

export function checkWinner(state: GameState): number | null {
  const activePlayers = state.players.filter(p => !p.isEliminated);
  
  if (state.isBarbarianInvasion) {
    // In invasion mode, if all human players are eliminated, Barbarians win
    const humanPlayers = activePlayers.filter(p => !p.isOriginalBarbarian);
    if (humanPlayers.length === 0) {
      const barbarian = state.players.find(p => p.isOriginalBarbarian);
      return barbarian ? barbarian.id : -1;
    }
    // If only one player (could be Barbarian or a human) is left, they win
    if (activePlayers.length === 1) {
      return activePlayers[0].id;
    }
    return null;
  }

  const activeNonBarbarians = activePlayers.filter(p => p.name !== 'Barbarians');
  if (activeNonBarbarians.length === 1) {
    return activeNonBarbarians[0].id;
  }
  if (activePlayers.length === 0) {
    return -1; // Draw or error state
  }
  return null;
}

export function triggerBarbarianInvasion(state: GameState): GameState {
  const newState = { ...state, isBarbarianInvasion: true, winnerId: null };
  const barbarianIndex = newState.players.findIndex(p => p.isOriginalBarbarian);
  if (barbarianIndex === -1) return state;

  const barbarian = { ...newState.players[barbarianIndex] };
  barbarian.gold += 3000;
  barbarian.isEliminated = false;
  
  const newPlayers = [...newState.players];
  newPlayers[barbarianIndex] = barbarian;
  newState.players = newPlayers;

  const newBoard = [...newState.board];
  const newUnits = [...newState.units];

  // Find vacant plains or mountains
  const vacantTiles = newBoard.filter(t => 
    (t.terrain === TerrainType.PLAINS || t.terrain === TerrainType.MOUNTAIN) &&
    t.ownerId === null &&
    !newUnits.some(u => u.coord.q === t.coord.q && u.coord.r === t.coord.r)
  );

  // Sort by distance from center (descending) to favor edges
  vacantTiles.sort((a, b) => {
    const distA = (Math.abs(a.coord.q) + Math.abs(a.coord.r) + Math.abs(a.coord.s)) / 2;
    const distB = (Math.abs(b.coord.q) + Math.abs(b.coord.r) + Math.abs(b.coord.s)) / 2;
    // Add randomness to the sort
    return distB - distA + (Math.random() - 0.5) * 4;
  });

  const numVillages = Math.min(30, vacantTiles.length);
  for (let i = 0; i < numVillages; i++) {
    const tile = vacantTiles[i];
    const tileIndex = newBoard.findIndex(t => t.coord.q === tile.coord.q && t.coord.r === tile.coord.r);
    
    newBoard[tileIndex] = {
      ...tile,
      terrain: TerrainType.VILLAGE,
      ownerId: barbarian.id
    };

    const unitTypes = [UnitType.INFANTRY, UnitType.ARCHER, UnitType.KNIGHT, UnitType.CATAPULT];
    const randomType = unitTypes[Math.floor(Math.random() * unitTypes.length)];

    newUnits.push({
      id: `barbarian-invasion-${i}-${Date.now()}`,
      type: randomType,
      ownerId: barbarian.id,
      movesLeft: 0,
      hasAttacked: true,
      hasActed: true,
      coord: { ...tile.coord },
    });
  }

  newState.board = newBoard;
  newState.units = newUnits;
  
  return newState;
}

export function calculateIncome(player: Player, board: GameState['board']): number {
  const ownedTiles = board.filter(t => t.ownerId === player.id);
  let income = 0;
  ownedTiles.forEach(tile => {
    income += SETTLEMENT_INCOME[tile.terrain];
  });
  return income;
}

export function upgradeSettlement(state: GameState, coord: HexCoord): GameState {
  const tileIndex = state.board.findIndex(t => t.coord.q === coord.q && t.coord.r === coord.r);
  if (tileIndex === -1) return state;
  
  const tile = state.board[tileIndex];
  const player = state.players[state.currentPlayerIndex];
  let cost = 0;
  let nextTerrain: TerrainType | null = null;
  
  const unitOnTile = state.units.find(u => u.coord.q === coord.q && u.coord.r === coord.r && u.ownerId === player.id);

  if (tile.terrain === TerrainType.PLAINS && tile.ownerId !== player.id) {
    if (!unitOnTile || unitOnTile.hasActed) return state;
    cost = UPGRADE_COSTS[TerrainType.VILLAGE];
    nextTerrain = TerrainType.VILLAGE;
  } else if (tile.terrain === TerrainType.MOUNTAIN && tile.ownerId !== player.id) {
    if (!unitOnTile || unitOnTile.hasActed) return state;
    cost = UPGRADE_COSTS[TerrainType.GOLD_MINE];
    nextTerrain = TerrainType.GOLD_MINE;
  } else if (tile.terrain === TerrainType.VILLAGE && tile.ownerId === player.id) {
    cost = UPGRADE_COSTS[TerrainType.FORTRESS];
    nextTerrain = TerrainType.FORTRESS;
  } else if (tile.terrain === TerrainType.FORTRESS && tile.ownerId === player.id) {
    cost = UPGRADE_COSTS[TerrainType.CASTLE];
    nextTerrain = TerrainType.CASTLE;
  }

  if (nextTerrain && player.gold >= cost) {
    const newBoard = [...state.board];
    newBoard[tileIndex] = { ...tile, terrain: nextTerrain, ownerId: player.id };
    
    const newPlayers = state.players.map(p => 
      p.id === player.id ? { ...p, gold: p.gold - cost } : p
    );

    const newUnits = state.units.map(u => {
      if (unitOnTile && u.id === unitOnTile.id && (nextTerrain === TerrainType.VILLAGE || nextTerrain === TerrainType.GOLD_MINE)) {
        return { ...u, movesLeft: 0, hasAttacked: true, hasActed: true };
      }
      return u;
    });

    const { history = [], animations: _animations, ...stateWithoutHistory } = state;

    return {
      ...state,
      history: [...history, stateWithoutHistory],
      board: newBoard,
      players: newPlayers,
      units: newUnits,
      selectedUnitId: null,
      selectedHex: coord,
      possibleMoves: [],
      possibleAttacks: [],
      attackRange: []
    };
  }
  
  return state;
}

export function processTurnTransition(state: GameState): GameState {
  if (state.winnerId !== null) return state;

  // 1. Check for eliminated players
  const updatedPlayers = state.players.map(p => {
    if (p.isEliminated) return p;
    
    const hasUnits = state.units.some(u => u.ownerId === p.id);
    const hasSettlements = state.board.some(t => 
      t.ownerId === p.id && 
      (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
    );
    
    if (!hasUnits && !hasSettlements) {
      return { ...p, isEliminated: true };
    }
    return p;
  });

  // 2. Check for winner
  const winnerId = checkWinner({ ...state, players: updatedPlayers });
  if (winnerId !== null) {
    return { ...state, players: updatedPlayers, winnerId };
  }

  // 3. Find next player
  let nextIndex = (state.currentPlayerIndex + 1) % updatedPlayers.length;
  const safety = new LoopSafety('processTurnTransition', updatedPlayers.length + 1);
  
  // If everyone is eliminated, safety will kick in
  while (updatedPlayers[nextIndex].isEliminated && !safety.tick()) {
    nextIndex = (nextIndex + 1) % updatedPlayers.length;
  }

  // If we couldn't find a non-eliminated player, the game should have ended
  if (updatedPlayers[nextIndex].isEliminated) {
    return { ...state, players: updatedPlayers, winnerId: -1 };
  }

  const nextPlayer = updatedPlayers[nextIndex];

  // 4. Action phase for NEXT player
  const newUnits = state.units.map(u => {
    return {
      ...u,
      movesLeft: u.ownerId === nextPlayer.id ? UNIT_STATS[u.type].moves : u.movesLeft,
      hasAttacked: u.ownerId === nextPlayer.id ? false : u.hasAttacked,
      hasActed: u.ownerId === nextPlayer.id ? false : u.hasActed,
    };
  });

  const isNewRound = nextIndex === 0;
  const nextTurnNumber = isNewRound ? state.turnNumber + 1 : state.turnNumber;

  // 5. Income phase
  const income = nextTurnNumber === 1 ? 0 : calculateIncome(nextPlayer, state.board);
  const nextPlayerStrength = state.units
    .filter(u => u.ownerId === nextPlayer.id)
    .reduce((acc, u) => acc + UNIT_STATS[u.type].cost, 0);

  const finalPlayers = updatedPlayers.map(p => {
    if (p.id === nextPlayer.id) {
      return { 
        ...p, 
        gold: p.gold + income,
        incomeHistory: [...p.incomeHistory, income].slice(-4),
        strengthHistory: [...p.strengthHistory, nextPlayerStrength].slice(-4)
      };
    }
    return p;
  });

  return {
    ...state,
    players: finalPlayers,
    units: newUnits,
    currentPlayerIndex: nextIndex,
    turnNumber: nextTurnNumber,
    selectedHex: null,
    selectedUnitId: null,
    possibleMoves: [],
    possibleAttacks: [],
    attackRange: [],
  };
}
