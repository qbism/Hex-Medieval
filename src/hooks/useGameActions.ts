import { useCallback } from 'react';
import { GameState, HexCoord, UnitType, Unit, TerrainType, UNIT_STATS, getDistance } from '../types';
import { 
  upgradeSettlement, 
  processTurnTransition, 
  createInitialState,
  getValidMoves,
  getValidAttacks,
  getAttackRange,
  calculateStrategicAnalysis
} from '../gameEngine';
import { triggerEffect } from '../services/effectEngine';

export interface GameActions {
  startGame: (playerConfigs: { name: string; isAutomaton: boolean }[], existingBoard?: GameState['board']) => void;
  moveUnit: (unitId: string, target: HexCoord) => void;
  finalizeMove: (unitId: string, target: HexCoord) => void;
  attackUnit: (attackerId: string, targetCoord: HexCoord) => void;
  finalizeAttack: (attackerId: string, targetCoord: HexCoord) => void;
  recruitUnit: (type: UnitType, coord: HexCoord) => void;
  upgradeSettlement: (coord: HexCoord) => void;
  updateAIMatrix: (matrix: GameState['opportunityPerilMatrix']) => void;
  endTurn: () => void;
  undoMove: () => void;
  clearAnimation: (animId: string) => void;
  skipUnit: (unitId: string) => void;
  concedeGame: () => void;
  barbarianSurrender: () => void;
}

export function useGameActions(
  gameState: GameState | null,
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>,
  setSetupMode: (val: boolean) => void
): GameActions {

  const startGame = useCallback((playerConfigs: { name: string; isAutomaton: boolean }[], existingBoard?: GameState['board']) => {
    triggerEffect('victory');
    const state = createInitialState(playerConfigs, existingBoard);
    setGameState(state);
    setSetupMode(false);
  }, [setGameState, setSetupMode]);

  const moveUnit = useCallback((unitId: string, target: HexCoord) => {
    const unit = gameState?.units.find(u => u.id === unitId);
    if (unit) {
      triggerEffect('move', { unitId, unitType: unit.type, to: target }, setGameState as any);
    }

    setGameState(prev => {
      if (!prev) return prev;
      
      const { history = [], animations: _animations, ...stateWithoutHistory } = prev;
      const newHistory = [...history, stateWithoutHistory];
      return {
        ...prev,
        history: newHistory,
      };
    });
  }, [gameState, setGameState]);

  const finalizeMove = useCallback((unitId: string, target: HexCoord) => {
    const tile = gameState?.board.find(t => t.coord.q === target.q && t.coord.r === target.r);
    if (tile && tile.ownerId === null) {
      const isSettlement = tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE;
      if (isSettlement) {
        if (tile.terrain === TerrainType.GOLD_MINE) {
          triggerEffect('goldMine');
        } else {
          triggerEffect('conquest');
        }
      }
    }

    setGameState(prev => {
      if (!prev) return prev;
      const unit = prev.units.find(u => u.id === unitId);
      if (!unit) {
        return {
          ...prev,
          animations: prev.animations.filter(a => a.unitId !== unitId)
        };
      }

      const newBoard = prev.board.map(tile => {
        if (tile.coord.q === target.q && tile.coord.r === target.r) {
          if (tile.ownerId === null && (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE)) {
            return { ...tile, ownerId: prev.players[prev.currentPlayerIndex].id };
          }
        }
        return tile;
      });

      const targetTile = prev.board.find(t => t.coord.q === target.q && t.coord.r === target.r);
      const isCapturingSettlement = targetTile && targetTile.ownerId === null && (
        targetTile.terrain === TerrainType.VILLAGE || 
        targetTile.terrain === TerrainType.FORTRESS || 
        targetTile.terrain === TerrainType.CASTLE || 
        targetTile.terrain === TerrainType.GOLD_MINE
      );

      const cost = getDistance(unit.coord, target, prev.board);
      const newMovesLeft = isCapturingSettlement ? 0 : Math.max(0, unit.movesLeft - cost);
      const hasActuallyActed = newMovesLeft <= 0;

      const newUnits = prev.units.map(u => {
        if (u.id === unitId) {
          return { ...u, coord: target, movesLeft: newMovesLeft, hasActed: hasActuallyActed };
        }
        return u;
      });

      const isAutomaton = prev.players[prev.currentPlayerIndex].isAutomaton;
      const updatedUnit = newUnits.find(u => u.id === unitId)!;

      const newState: GameState = {
        ...prev,
        units: newUnits,
        board: newBoard,
        selectedUnitId: (!isAutomaton && !hasActuallyActed) ? unitId : null,
        selectedHex: isAutomaton ? prev.selectedHex : target,
        possibleMoves: (!isAutomaton && !hasActuallyActed) ? getValidMoves(updatedUnit, newBoard, newUnits) : [],
        possibleAttacks: (!isAutomaton && !hasActuallyActed) ? getValidAttacks(updatedUnit, newBoard, newUnits, true) : [],
        attackRange: (!isAutomaton && !hasActuallyActed) ? getAttackRange(updatedUnit, newBoard, newUnits) : [],
        animations: prev.animations.filter(a => a.unitId !== unitId)
      };

      newState.strategicAnalysis = calculateStrategicAnalysis(newState, prev.players[prev.currentPlayerIndex].id);
      return newState;
    });
  }, [setGameState, gameState]);

  const attackUnit = useCallback((attackerId: string, targetCoord: HexCoord) => {
    const attacker = gameState?.units.find(u => u.id === attackerId);
    if (attacker) {
      triggerEffect('attack', { unitId: attackerId, unitType: attacker.type, to: targetCoord }, setGameState as any);
    }

    setGameState(prev => {
      if (!prev) return prev;

      const { history = [], animations: _animations, ...stateWithoutHistory } = prev;
      const newHistory = [...history, stateWithoutHistory];
      return {
        ...prev,
        history: newHistory,
      };
    });
  }, [gameState, setGameState]);

  const finalizeAttack = useCallback((attackerId: string, targetCoord: HexCoord) => {
    const defender = gameState?.units.find(u => u.coord.q === targetCoord.q && u.coord.r === targetCoord.r);
    if (defender) {
      triggerEffect('defeat', { unitType: defender.type });
    } else {
      triggerEffect('damage', { 
        unitId: `tile-${targetCoord.q}-${targetCoord.r}`, 
        to: targetCoord, 
        value: -1 
      }, setGameState as any);
    }

    setGameState(prev => {
      if (!prev) return prev;
      const currentAttacker = prev.units.find(u => u.id === attackerId);
      if (!currentAttacker) {
        return {
          ...prev,
          animations: prev.animations.filter(a => a.unitId !== attackerId)
        };
      }

      const currentDefender = prev.units.find(u => u.coord.q === targetCoord.q && u.coord.r === targetCoord.r);

      const newUnits = prev.units.map(u => {
        if (u.id === attackerId) return { ...u, hasAttacked: true, movesLeft: 0, hasActed: true };
        return u;
      }).filter(u => !(currentDefender && u.id === currentDefender.id));

      const newBoard = prev.board.map(tile => {
        if (tile.coord.q === targetCoord.q && tile.coord.r === targetCoord.r && tile.ownerId !== currentAttacker.ownerId) {
          const isSettlement = tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE;
          if (isSettlement && !currentDefender) {
            // Enemy settlements become neutral or downgraded when defeated
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

      const isAutomaton = prev.players[prev.currentPlayerIndex].isAutomaton;

      const newState: GameState = {
        ...prev,
        units: newUnits,
        board: newBoard,
        selectedUnitId: null,
        selectedHex: isAutomaton ? prev.selectedHex : targetCoord,
        possibleMoves: [],
        possibleAttacks: [],
        animations: prev.animations.filter(a => a.unitId !== attackerId)
      };

      newState.strategicAnalysis = calculateStrategicAnalysis(newState, prev.players[prev.currentPlayerIndex].id);
      return newState;
    });
  }, [setGameState, gameState]);

  const recruitUnit = useCallback((type: UnitType, coord: HexCoord) => {
    triggerEffect('recruit', { unitType: type });
    setGameState(prev => {
      if (!prev) return prev;
      const player = prev.players[prev.currentPlayerIndex];
      const stats = UNIT_STATS[type];
      
      if (player.gold < stats.cost) return prev;

      const unitAtHex = prev.units.find(u => u.coord.q === coord.q && u.coord.r === coord.r);
      if (unitAtHex) return prev;

      const newUnit: Unit = {
        id: `unit-${Date.now()}-${Math.random()}`,
        type,
        ownerId: player.id,
        movesLeft: 0,
        hasAttacked: true,
        hasActed: true,
        coord: coord,
      };

      const newPlayers = prev.players.map(p => 
        p.id === player.id ? { ...p, gold: p.gold - stats.cost } : p
      );

      const { history = [], animations: _animations, ...stateWithoutHistory } = prev;
      const newHistory = [...history, stateWithoutHistory];

      const newState: GameState = {
        ...prev,
        history: newHistory,
        units: [...prev.units, newUnit],
        players: newPlayers,
        selectedHex: null,
        possibleMoves: [],
        possibleAttacks: [],
        attackRange: []
      };
      
      newState.strategicAnalysis = calculateStrategicAnalysis(newState, player.id);
      return newState;
    });
  }, [setGameState]);

  const handleUpgradeSettlement = useCallback((coord: HexCoord) => {
    const tile = gameState?.board.find(t => t.coord.q === coord.q && t.coord.r === coord.r);
    if (tile) {
      const player = gameState?.players[gameState.currentPlayerIndex];
      if (player && tile.terrain === TerrainType.MOUNTAIN && tile.ownerId !== player.id) {
        triggerEffect('goldMine');
      } else {
        triggerEffect('upgrade');
      }
    }
    setGameState(prev => {
      if (!prev) return prev;
      const newState = upgradeSettlement(prev, coord);
      newState.strategicAnalysis = calculateStrategicAnalysis(newState, prev.players[prev.currentPlayerIndex].id);
      return newState;
    });
  }, [setGameState, gameState]);

  const updateAIMatrix = useCallback((matrix: GameState['opportunityPerilMatrix']) => {
    setGameState(prev => {
      if (!prev) return prev;
      return { ...prev, opportunityPerilMatrix: matrix };
    });
  }, [setGameState]);

  const endTurn = useCallback(() => {
    triggerEffect('click');
    setGameState(prev => prev ? processTurnTransition(prev) : prev);
  }, [setGameState]);

  const undoMove = useCallback(() => {
    setGameState(prev => {
      if (!prev || !prev.history || prev.history.length === 0) return prev;
      const lastState = prev.history[prev.history.length - 1];
      
      const newState: GameState = {
        ...lastState,
        history: prev.history.slice(0, -1),
        animations: [],
        selectedUnitId: null,
        selectedHex: null,
        possibleMoves: [],
        possibleAttacks: [],
        attackRange: []
      };
      
      newState.strategicAnalysis = calculateStrategicAnalysis(newState, newState.players[newState.currentPlayerIndex].id);
      return newState;
    });
  }, [setGameState]);

  const clearAnimation = useCallback((animId: string) => {
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        animations: prev.animations.filter(a => a.id !== animId)
      };
    });
  }, [setGameState]);

  const skipUnit = useCallback((unitId: string) => {
    setGameState(prev => {
      if (!prev) return prev;
      const newUnits = prev.units.map(u => 
        u.id === unitId ? { ...u, hasActed: true, movesLeft: 0, hasAttacked: true } : u
      );
      const newState: GameState = { 
        ...prev, 
        units: newUnits,
        selectedUnitId: null,
        possibleMoves: [],
        possibleAttacks: [],
        attackRange: []
      };
      
      newState.strategicAnalysis = calculateStrategicAnalysis(newState, prev.players[prev.currentPlayerIndex].id);
      return newState;
    });
  }, [setGameState]);

  const concedeGame = useCallback(() => {
    setGameState(prev => {
      if (!prev) return prev;
      const currentPlayer = prev.players[prev.currentPlayerIndex];
      const barbarianId = prev.players.length - 1;
      const isBarbarian = currentPlayer.id === barbarianId;

      // Convert units to barbarian, or remove if barbarian is surrendering
      const newUnits = isBarbarian 
        ? prev.units.filter(u => u.ownerId !== currentPlayer.id)
        : prev.units.map(u => u.ownerId === currentPlayer.id ? { ...u, ownerId: barbarianId } : u);

      // Convert settlements to barbarian, or clear if barbarian is surrendering
      const newBoard = isBarbarian
        ? prev.board.map(tile => tile.ownerId === currentPlayer.id ? { ...tile, ownerId: null } : tile)
        : prev.board.map(tile => tile.ownerId === currentPlayer.id ? { ...tile, ownerId: barbarianId } : tile);

      // Mark player as eliminated and reactivate barbarian if needed
      const newPlayers = prev.players.map(p => {
        if (p.id === currentPlayer.id) return { ...p, isEliminated: true };
        if (p.id === barbarianId && !isBarbarian) return { ...p, isEliminated: false };
        return p;
      });

      // Transition to next player
      return processTurnTransition({
        ...prev,
        units: newUnits,
        board: newBoard,
        players: newPlayers,
        selectedHex: null,
        selectedUnitId: null,
        possibleMoves: [],
        possibleAttacks: []
      });
    });
  }, [setGameState]);

  const barbarianSurrender = useCallback(() => {
    setGameState(prev => {
      if (!prev) return prev;
      const barbarianPlayer = prev.players[prev.currentPlayerIndex];
      // Find the first non-barbarian player to surrender to
      const targetPlayer = prev.players.find(p => !p.isOriginalBarbarian && !p.isEliminated);
      if (!targetPlayer) return prev;

      // Transfer units to target player
      const newUnits = prev.units.map(u => 
        u.ownerId === barbarianPlayer.id ? { ...u, ownerId: targetPlayer.id } : u
      );

      // Transfer settlements to target player
      const newBoard = prev.board.map(tile => 
        tile.ownerId === barbarianPlayer.id ? { ...tile, ownerId: targetPlayer.id } : tile
      );

      // Mark barbarian as eliminated
      const newPlayers = prev.players.map(p => 
        p.id === barbarianPlayer.id ? { ...p, isEliminated: true } : p
      );

      // Transition to next player
      return processTurnTransition({
        ...prev,
        units: newUnits,
        board: newBoard,
        players: newPlayers,
        selectedHex: null,
        selectedUnitId: null,
        possibleMoves: [],
        possibleAttacks: []
      });
    });
  }, [setGameState]);

  return {
    startGame,
    moveUnit,
    finalizeMove,
    attackUnit,
    finalizeAttack,
    recruitUnit,
    upgradeSettlement: handleUpgradeSettlement,
    updateAIMatrix,
    endTurn,
    undoMove,
    clearAnimation,
    skipUnit,
    concedeGame,
    barbarianSurrender
  };
}
