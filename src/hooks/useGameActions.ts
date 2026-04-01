import { useCallback } from 'react';
import { GameState, HexCoord, UnitType, Unit, TerrainType, UNIT_STATS } from '../types';
import { 
  upgradeSettlement, 
  processTurnTransition, 
  createInitialState 
} from '../gameEngine';
import { triggerEffect } from '../services/effectEngine';

export interface GameActions {
  startGame: (playerConfigs: { name: string; isAutomaton: boolean }[]) => void;
  moveUnit: (unitId: string, target: HexCoord) => void;
  finalizeMove: (unitId: string, target: HexCoord) => void;
  attackUnit: (attackerId: string, targetCoord: HexCoord) => void;
  finalizeAttack: (attackerId: string, targetCoord: HexCoord) => void;
  recruitUnit: (type: UnitType, coord: HexCoord) => void;
  upgradeSettlement: (coord: HexCoord) => void;
  endTurn: () => void;
  undoMove: () => void;
  clearAnimation: (animId: string) => void;
  skipUnit: (unitId: string) => void;
  concedeGame: () => void;
}

export function useGameActions(
  gameState: GameState | null,
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>,
  setSetupMode: (val: boolean) => void
): GameActions {

  const startGame = useCallback((playerConfigs: { name: string; isAutomaton: boolean }[]) => {
    triggerEffect('victory');
    const state = createInitialState(playerConfigs);
    setGameState(state);
    setSetupMode(false);
  }, [setGameState, setSetupMode]);

  const moveUnit = useCallback((unitId: string, target: HexCoord) => {
    setGameState(prev => {
      if (!prev) return prev;
      const unit = prev.units.find(u => u.id === unitId);
      if (unit) {
        triggerEffect('move', { unitId, unitType: unit.type, to: target }, setGameState as any);
      }
      
      const { history = [], animations: _animations, ...stateWithoutHistory } = prev;
      return {
        ...prev,
        history: [...history, stateWithoutHistory],
      };
    });
  }, [setGameState]);

  const finalizeMove = useCallback((unitId: string, target: HexCoord) => {
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

      const newUnits = prev.units.map(u => {
        if (u.id === unitId) {
          return { ...u, coord: target, movesLeft: 0, hasAttacked: true, hasActed: true };
        }
        return u;
      });

      const isAutomaton = prev.players[prev.currentPlayerIndex].isAutomaton;

      return {
        ...prev,
        units: newUnits,
        board: newBoard,
        selectedUnitId: null,
        selectedHex: isAutomaton ? prev.selectedHex : target,
        possibleMoves: [],
        possibleAttacks: [],
        animations: prev.animations.filter(a => a.unitId !== unitId)
      };
    });
  }, [setGameState]);

  const attackUnit = useCallback((attackerId: string, targetCoord: HexCoord) => {
    setGameState(prev => {
      if (!prev) return prev;
      const attacker = prev.units.find(u => u.id === attackerId);
      if (attacker) {
        triggerEffect('attack', { unitId: attackerId, unitType: attacker.type, to: targetCoord }, setGameState as any);
      }

      const { history = [], animations: _animations, ...stateWithoutHistory } = prev;
      return {
        ...prev,
        history: [...history, stateWithoutHistory],
      };
    });
  }, [setGameState]);

  const finalizeAttack = useCallback((attackerId: string, targetCoord: HexCoord) => {
    triggerEffect('damage', { 
      unitId: `tile-${targetCoord.q}-${targetCoord.r}`, 
      to: targetCoord, 
      value: -1 
    }, setGameState as any);

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
            if (tile.ownerId === null) {
              // Unclaimed settlements are still captured by the attacker
              return { ...tile, ownerId: currentAttacker.ownerId };
            } else {
              // Enemy settlements become neutral when defeated
              if (tile.terrain === TerrainType.CASTLE) {
                return { ...tile, terrain: TerrainType.FORTRESS };
              } else if (tile.terrain === TerrainType.FORTRESS) {
                return { ...tile, terrain: TerrainType.VILLAGE };
              } else {
                return { ...tile, ownerId: null };
              }
            }
          }
        }
        return tile;
      });

      const isAutomaton = prev.players[prev.currentPlayerIndex].isAutomaton;

      return {
        ...prev,
        units: newUnits,
        board: newBoard,
        selectedUnitId: null,
        selectedHex: isAutomaton ? prev.selectedHex : targetCoord,
        possibleMoves: [],
        possibleAttacks: [],
        animations: prev.animations.filter(a => a.unitId !== attackerId)
      };
    });
  }, [setGameState]);

  const recruitUnit = useCallback((type: UnitType, coord: HexCoord) => {
    triggerEffect('recruit');
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

      return {
        ...prev,
        history: [...history, stateWithoutHistory],
        units: [...prev.units, newUnit],
        players: newPlayers,
        selectedHex: null,
        possibleMoves: [],
        possibleAttacks: [],
        attackRange: []
      };
    });
  }, [setGameState]);

  const handleUpgradeSettlement = useCallback((coord: HexCoord) => {
    triggerEffect('upgrade');
    setGameState(prev => prev ? upgradeSettlement(prev, coord) : prev);
  }, [setGameState]);

  const endTurn = useCallback(() => {
    triggerEffect('click');
    setGameState(prev => prev ? processTurnTransition(prev) : prev);
  }, [setGameState]);

  const undoMove = useCallback(() => {
    setGameState(prev => {
      if (!prev || !prev.history || prev.history.length === 0) return prev;
      const lastState = prev.history[prev.history.length - 1];
      
      return {
        ...lastState,
        history: prev.history.slice(0, -1),
        animations: []
      };
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
      return { 
        ...prev, 
        units: newUnits,
        selectedUnitId: null,
        possibleMoves: [],
        possibleAttacks: [],
        attackRange: []
      };
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

  return {
    startGame,
    moveUnit,
    finalizeMove,
    attackUnit,
    finalizeAttack,
    recruitUnit,
    upgradeSettlement: handleUpgradeSettlement,
    endTurn,
    undoMove,
    clearAnimation,
    skipUnit,
    concedeGame
  };
}
