import { 
  GameState, 
  TerrainType,
} from '../types';
import { AutomatonAction } from './types';
import { getBarbarianAction } from './barbarianAI';
import { 
  calculateThreatMatrix, 
  calculateInfluenceMap,
  assessThreats, 
  identifyThreatenedSettlements, 
  getEmpireCenter, 
  getHVT,
  isSavingForMine,
  isSavingForVillage,
  calculateHeatMap
} from './threatAnalysis';
import { calculateOpportunityPerilMatrix } from './opportunityPeril';
import { getUpgradeAction } from './upgrades';
import { getRecruitmentAction } from './recruitment';
import { getUnitAction } from './unitActions';

// Cache for expensive calculations within the same GameState
const actionCache = new WeakMap<GameState, any>();

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

  // --- Barbarian AI Movement Behavior moved to unit action phase ---
  const isBarbarian = currentPlayer.name === 'Barbarians';

  const { playerStrengths, myStrength, focusOnLeader, leaderId, isLaggingStrength, isLaggingIncome, isCriticallyLaggingLargeEconomy, isLagging } = cachedData.threatAssessment;
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
  
  const activeStats = playerStrengths
    .filter(ps => ps.id !== currentPlayer.id && state.players[ps.id].name !== 'Barbarians' && !state.players[ps.id].isEliminated);
  
  if (state.turnNumber > 10 && activeStats.length >= 1) {
    const maxCompetitorStrength = Math.max(...activeStats.map(s => s.strength));
    const maxCompetitorIncome = Math.max(...cachedData.threatAssessment.playerIncomes.map((inc: any, id: number) => id === currentPlayer.id || state.players[id].name === 'Barbarians' ? 0 : inc));
    
    const myIncome = cachedData.threatAssessment.playerIncomes[currentPlayer.id];
    
    // Barbarian Team only considers surrender when only one other player remains.
    // If there are 2 or more other players, it will never surrender.
    const isBarbarianWaitRuleMet = !isBarbarian || activeStats.length === 1;

    // User's New Rule: Convert to Barbarian if < 25% of top player's strength AND < 25% of top player's income
    const isCriticallyWeak = myStrength < maxCompetitorStrength * 0.25;
    const isCriticallyPoor = myIncome < maxCompetitorIncome * 0.25;

    // Legacy stagnant logic as a secondary fallback
    const isWeakAndStagnant = myStrength < maxCompetitorStrength * 0.6 && isIncomeStagnant;
    
    if (isBarbarianWaitRuleMet && ((isCriticallyWeak && isCriticallyPoor) || isWeakAndStagnant)) {
      return { type: 'goRogue' as const, matrix: opportunityPerilMatrix };
    }
  }

  // Identify threatened settlements
  const { eminentThreatBases, possibleThreatBases, isUnderThreat } = identifyThreatenedSettlements(state, currentPlayer.id, threatMatrix);

  const isEarlyGame = state.turnNumber <= 15;
  const numSettlements = mySettlements.length;

  const savingForMine = isSavingForMine(state, currentPlayer, isLaggingIncome);
  const savingForVillage = isSavingForVillage(state, currentPlayer, isCriticallyLaggingLargeEconomy);

  // 1. Try to upgrade settlements (Civilized players only)
  const upgradeAction = !isBarbarian ? getUpgradeAction(state, currentPlayer, isUnderThreat, isEarlyGame, numSettlements, isLaggingIncome, isCriticallyLaggingLargeEconomy, threatMatrix) : null;
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
    isCriticallyLaggingLargeEconomy,
    heatMap,
    isBarbarian
  );
  if (recruitmentAction) return { ...recruitmentAction, matrix: opportunityPerilMatrix };

  // 3. Move/Attack with units
  if (isBarbarian) {
    return { ...getBarbarianAction(state, currentPlayer, cachedData), matrix: opportunityPerilMatrix };
  }

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
    isLagging,
    isCriticallyLaggingLargeEconomy,
    false,
    cachedData
  );
  if (unitAction) return { ...unitAction, matrix: opportunityPerilMatrix };

  return { type: 'endTurn' as const, matrix: opportunityPerilMatrix };
}
