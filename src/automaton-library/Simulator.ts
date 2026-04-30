import { createInitialState, processTurnTransition } from '../game/state';
import { applyMove, applyAttack, applyRecruitment } from '../game/actions';
import { upgradeSettlement } from '../game/state';
import { getAutomatonBestAction } from './Core';
import { AIConfig, DEFAULT_AI_CONFIG } from './AIConfig';

export interface SimulationResult {
  winnerId: number | null;
  turns: number;
  playerStats: {
    id: number;
    finalGold: number;
    finalStrength: number;
    finalIncome: number;
  }[];
}

export async function runSimulation(configs: AIConfig[], maxTurns: number = 200): Promise<SimulationResult> {
  const playerConfigs = configs.map((c, i) => ({ name: `AI-${i}`, isAutomaton: true }));
  let state = createInitialState(playerConfigs);
  
  // Tag players with their configs
  const aiConfigs = new Map<number, AIConfig>();
  configs.forEach((c, i) => aiConfigs.set(i, c));

  let actionCount = 0;
  while (state.winnerId === null && state.turnNumber < maxTurns) {
    actionCount++;
    const currentPlayer = state.players[state.currentPlayerIndex];
    const config = aiConfigs.get(currentPlayer.id) || DEFAULT_AI_CONFIG;
    
    const bestAction = (getAutomatonBestAction as any)(state, config);

    if (bestAction.type === 'endTurn') {
      state = processTurnTransition(state);
    } else if (bestAction.type === 'move') {
      state = applyMove(state, bestAction.payload.unitId, bestAction.payload.target);
    } else if (bestAction.type === 'attack') {
      state = applyAttack(state, bestAction.payload.unitId, bestAction.payload.target);
    } else if (bestAction.type === 'recruit') {
      state = applyRecruitment(state, bestAction.payload.type, bestAction.payload.coord);
    } else if (bestAction.type === 'upgrade') {
      state = upgradeSettlement(state, bestAction.payload.coord);
    } else if (bestAction.type === 'skipUnit') {
      state = {
        ...state,
        units: state.units.map(u => u.id === bestAction.payload.unitId ? { ...u, hasActed: true } : u)
      };
    } else {
      state = processTurnTransition(state);
    }

    // Yield every 10 actions to prevent UI freezing without slowing down too much
    if (actionCount % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  const finalState = state;
  return {
    winnerId: finalState.winnerId,
    turns: finalState.turnNumber,
    playerStats: finalState.players.map(p => ({
      id: p.id,
      finalGold: p.gold,
      finalStrength: finalState.units.filter(u => u.ownerId === p.id).length * 100, // simplified strength
      finalIncome: p.incomeHistory[p.incomeHistory.length - 1] || 0
    }))
  };
}
