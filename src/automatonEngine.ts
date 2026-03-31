import { 
  GameState, 
  TerrainType as _TerrainType
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
  ThreatInfo as _ThreatInfo
} from './automaton/threatAnalysis';
import { getUpgradeAction } from './automaton/upgrades';
import { getRecruitmentAction } from './automaton/recruitment';
import { getUnitAction } from './automaton/unitActions';

export { findNearestTarget, calculateKingdomStrength, getChokepointScore } from './automaton/utils';

export function getAutomatonBestAction(state: GameState): { type: 'recruit' | 'attack' | 'move' | 'endTurn' | 'skipUnit' | 'upgrade' | 'surrender' | 'goRogue'; payload?: any } {
  const currentPlayer = state.players[state.currentPlayerIndex];
  
  if (currentPlayer.isEliminated) {
    return { type: 'endTurn' as const };
  }
  
  // --- Barbarian AI Behavior ---
  if (currentPlayer.name === 'Barbarians') {
    return getBarbarianAction(state, currentPlayer);
  }

  // --- Threat Assessment (Kingmaking Awareness) ---
  const { playerStrengths, myStrength, focusOnLeader, leaderId, isLaggingStrength, isLaggingIncome, isLagging } = assessThreats(state, currentPlayer);

  // --- Threat Matrix (Enemy Attack Range) ---
  const threatMatrix = calculateThreatMatrix(state, currentPlayer.id);

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
        return { type: 'goRogue' as const };
      }
    }
  }

  // Identify threatened settlements
  const { mySettlements, eminentThreatBases, possibleThreatBases, isUnderThreat } = identifyThreatenedSettlements(state, currentPlayer.id, threatMatrix);

  // Calculate Influence Map
  const influenceMap = calculateInfluenceMap(state, currentPlayer.id);

  const isEarlyGame = state.turnNumber <= 15;
  const numSettlements = mySettlements.length;

  const empireCenter = getEmpireCenter(mySettlements);
  const hvt = getHVT(state, currentPlayer.id, empireCenter);

  const savingForMine = isSavingForMine(state, currentPlayer);
  const savingForVillage = isSavingForVillage(state, currentPlayer);

  // 1. Try to upgrade settlements
  const upgradeAction = getUpgradeAction(state, currentPlayer, isUnderThreat, isEarlyGame, numSettlements, isLaggingIncome);
  if (upgradeAction) return upgradeAction;

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
    isLaggingIncome
  );
  if (recruitmentAction) return recruitmentAction;

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
  if (unitAction) return unitAction;

  return { type: 'endTurn' as const };
}
