import { 
  GameState, 
  TerrainType,
  TileEvaluation
} from './types';
import { getBarbarianAction } from './automaton/barbarianAI';
import { 
  calculateThreatMatrix, 
  calculateInfluenceMap,
  assessThreats, 
  identifyThreatenedSettlements, 
  getEmpireCenter, 
  getHVT,
  isSavingForMine,
  isSavingForVillage,
  calculateHeatMap,
  ThreatInfo as _ThreatInfo
} from './automaton/threatAnalysis';
import { calculateOpportunityPerilMatrix } from './automaton/opportunityPeril';
import { getUpgradeAction } from './automaton/upgrades';
import { getRecruitmentAction } from './automaton/recruitment';
import { getUnitAction } from './automaton/unitActions';

export { findNearestTarget, calculateKingdomStrength, getChokepointScore } from './automaton/utils';

// Cache for expensive calculations within the same GameState
const actionCache = new WeakMap<GameState, any>();

export interface AutomatonAction {
  type: 'recruit' | 'attack' | 'move' | 'endTurn' | 'skipUnit' | 'upgrade' | 'surrender' | 'goRogue' | 'barbarianSurrender';
  payload?: any;
  matrix?: TileEvaluation[];
}

export function getAutomatonBestAction(state: GameState): AutomatonAction {
  const currentPlayer = state.players[state.currentPlayerIndex];
  
  if (currentPlayer.isEliminated) {
    return { type: 'endTurn' as const };
  }
  
  // Use a local cache for this specific state to avoid recalculating within this function call
  // and potentially across multiple calls if the state is identical.
  let cachedData = actionCache.get(state);
  if (!cachedData) {
    const threatAssessment = assessThreats(state, currentPlayer);
    const threatMatrix = calculateThreatMatrix(state, currentPlayer.id);
    const influenceMap = calculateInfluenceMap(state, currentPlayer.id);
    const heatMap = calculateHeatMap(state, currentPlayer.id);
    const opportunityPerilMatrix = calculateOpportunityPerilMatrix(state, currentPlayer.id, threatMatrix);
    const mySettlements = state.board.filter(t => 
      t.ownerId === currentPlayer.id && 
      (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
    );
    const empireCenter = getEmpireCenter(mySettlements);
    const hvt = getHVT(state, currentPlayer.id, empireCenter);

    cachedData = {
      threatAssessment,
      threatMatrix,
      influenceMap,
      heatMap,
      opportunityPerilMatrix,
      mySettlements,
      empireCenter,
      hvt
    };
    actionCache.set(state, cachedData);
  }

  const { opportunityPerilMatrix } = cachedData;

  // --- Barbarian AI Behavior ---
  if (currentPlayer.name === 'Barbarians') {
    return { ...getBarbarianAction(state, currentPlayer, cachedData), matrix: opportunityPerilMatrix };
  }

  const { playerStrengths, myStrength, focusOnLeader, leaderId, isLaggingStrength, isLaggingIncome, isLagging } = cachedData.threatAssessment;
  const threatMatrix = cachedData.threatMatrix;
  const influenceMap = cachedData.influenceMap;
  const heatMap = cachedData.heatMap;
  const mySettlements = cachedData.mySettlements;
  const empireCenter = cachedData.empireCenter;
  const hvt = cachedData.hvt;

  // Check surrender conditions (Go Rogue logic)
  const incomeHistory = currentPlayer.incomeHistory || [];
  const len = incomeHistory.length;
  const isIncomeStagnant = len >= 4 && incomeHistory[len - 1] <= incomeHistory[len - 4];
  
  const activeNonBarbarianStrengths = playerStrengths
    .filter(ps => ps.strength > 0 && state.players[ps.id].name !== 'Barbarians')
    .sort((a, b) => a.strength - b.strength);

  if (state.turnNumber > 10 && activeNonBarbarianStrengths.length >= 2) {
    const lowest = activeNonBarbarianStrengths[0];
    const secondLowest = activeNonBarbarianStrengths[1];
    
    if (lowest.id === currentPlayer.id) {
      // If critically weak (less than 40% of second lowest), go rogue regardless of income
      const isCriticallyWeak = lowest.strength < secondLowest.strength * 0.4;
      // If weak (less than 60% of second lowest) and not growing, go rogue
      const isWeakAndStagnant = lowest.strength < secondLowest.strength * 0.6 && isIncomeStagnant;
      
      if (isCriticallyWeak || isWeakAndStagnant) {
        return { type: 'goRogue' as const, matrix: opportunityPerilMatrix };
      }
    }
  }

  // Identify threatened settlements
  const { eminentThreatBases, possibleThreatBases, isUnderThreat } = identifyThreatenedSettlements(state, currentPlayer.id, threatMatrix);

  const isEarlyGame = state.turnNumber <= 15;
  const numSettlements = mySettlements.length;

  const savingForMine = isSavingForMine(state, currentPlayer, isLaggingIncome);
  const savingForVillage = isSavingForVillage(state, currentPlayer);

  // 1. Try to upgrade settlements
  const upgradeAction = getUpgradeAction(state, currentPlayer, isUnderThreat, isEarlyGame, numSettlements, isLaggingIncome, threatMatrix);
  if (upgradeAction) return { ...upgradeAction, matrix: opportunityPerilMatrix };

  // 2. Try to recruit
  const recruitmentAction = getRecruitmentAction(
    state, 
    currentPlayer, 
    threatMatrix, 
    influenceMap,
    eminentThreatBases, 
    possibleThreatBases, 
    isUnderThreat, 
    isEarlyGame, 
    savingForMine, 
    savingForVillage,
    isLaggingStrength,
    isLaggingIncome,
    heatMap
  );
  if (recruitmentAction) return { ...recruitmentAction, matrix: opportunityPerilMatrix };

  // 3. Move/Attack with units
  const unitAction = getUnitAction(
    state,
    currentPlayer,
    threatMatrix,
    influenceMap,
    eminentThreatBases,
    possibleThreatBases,
    playerStrengths,
    myStrength,
    focusOnLeader,
    leaderId,
    empireCenter,
    hvt,
    savingForMine,
    savingForVillage,
    isLagging
  );
  if (unitAction) return { ...unitAction, matrix: opportunityPerilMatrix };

  return { type: 'endTurn' as const, matrix: opportunityPerilMatrix };
}
