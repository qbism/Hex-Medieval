import { 
  GameState, 
  Player
} from '../types';
import { 
  calculateThreatMatrix, 
  calculateInfluenceMap,
  assessThreats, 
  identifyThreatenedSettlements, 
  getEmpireCenter, 
  getHVT
} from './threatAnalysis';
import { getUpgradeAction } from './upgrades';
import { getRecruitmentAction } from './recruitment';
import { getUnitAction } from './unitActions';

export function getBarbarianAction(state: GameState, currentPlayer: Player) {
  // --- Threat Assessment ---
  const { playerStrengths, myStrength, focusOnLeader, leaderId, isLaggingStrength, isLaggingIncome, isLagging } = assessThreats(state, currentPlayer);

  // --- Threat Matrix ---
  const threatMatrix = calculateThreatMatrix(state, currentPlayer.id);

  // Identify threatened settlements
  const { mySettlements, eminentThreatBases, possibleThreatBases, isUnderThreat } = identifyThreatenedSettlements(state, currentPlayer.id, threatMatrix);

  // Calculate Influence Map
  const influenceMap = calculateInfluenceMap(state, currentPlayer.id);

  const isEarlyGame = state.turnNumber <= 15;
  const numSettlements = mySettlements.length;

  const empireCenter = getEmpireCenter(mySettlements);
  const hvt = getHVT(state, currentPlayer.id, empireCenter);

  // Barbarians never save for upgrades
  const savingForMine = false;
  const savingForVillage = false;

  // 1. Try to upgrade settlements (Barbarians never upgrade)
  const upgradeAction = getUpgradeAction(state, currentPlayer, isUnderThreat, isEarlyGame, numSettlements, isLaggingIncome, true);
  if (upgradeAction) return upgradeAction;

  // 2. Try to recruit (Barbarians only recruit infantry)
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
    true
  );
  if (recruitmentAction) return recruitmentAction;

  // 3. Move/Attack with units (Barbarians ignore safety)
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
    true
  );
  if (unitAction) return unitAction;

  return { type: 'endTurn' as const };
}
