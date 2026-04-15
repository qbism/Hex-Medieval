import { 
  GameState, 
  Player
} from '../types';
import { 
  calculateKingdomStrength,
} from './utils';
import { 
  calculateThreatMatrix, 
  calculateInfluenceMap,
  assessThreats, 
  identifyThreatenedSettlements, 
  getEmpireCenter, 
  getHVT,
  calculateHeatMap
} from './threatAnalysis';
import { getUpgradeAction } from './upgrades';
import { getRecruitmentAction } from './recruitment';
import { getUnitAction } from './unitActions';

export function getBarbarianAction(
  state: GameState, 
  currentPlayer: Player,
  cachedData?: {
    threatAssessment: any,
    threatMatrix: any,
    influenceMap: any,
    heatMap: any,
    mySettlements: any,
    empireCenter: any,
    hvt: any
  }
) {
  // --- Use Cached Data or Calculate ---
  const { playerStrengths, myStrength, focusOnLeader, leaderId, isLaggingStrength, isLaggingIncome, isLagging } = 
    cachedData?.threatAssessment || assessThreats(state, currentPlayer);

  const threatMatrix = cachedData?.threatMatrix || calculateThreatMatrix(state, currentPlayer.id);
  const influenceMap = cachedData?.influenceMap || calculateInfluenceMap(state, currentPlayer.id);
  const heatMap = cachedData?.heatMap || calculateHeatMap(state, currentPlayer.id);
  const mySettlements = cachedData?.mySettlements || identifyThreatenedSettlements(state, currentPlayer.id, threatMatrix).mySettlements;
  const { eminentThreatBases, possibleThreatBases, isUnderThreat } = identifyThreatenedSettlements(state, currentPlayer.id, threatMatrix);

  const isEarlyGame = state.turnNumber <= 15;
  const numSettlements = mySettlements.length;

  const empireCenter = cachedData?.empireCenter || getEmpireCenter(mySettlements);
  const hvt = cachedData?.hvt || getHVT(state, currentPlayer.id, empireCenter);

  // Barbarians never save for upgrades
  const savingForMine = false;
  const savingForVillage = false;

  // --- Surrender Condition (Invasion Mode only) ---
  if (state.isBarbarianInvasion) {
    const incomeHistory = currentPlayer.incomeHistory || [];
    const strengthHistory = currentPlayer.strengthHistory || [];
    
    if (incomeHistory.length >= 4 && strengthHistory.length >= 4) {
      const len = incomeHistory.length;
      const slen = strengthHistory.length;
      
      // Surrender condition: strictly declining over 4 turns
      const isIncomeDeclining = 
        incomeHistory[len - 1] < incomeHistory[len - 2] &&
        incomeHistory[len - 2] < incomeHistory[len - 3] &&
        incomeHistory[len - 3] < incomeHistory[len - 4];
      
      const isStrengthDeclining = 
        strengthHistory[slen - 1] < strengthHistory[slen - 2] &&
        strengthHistory[slen - 2] < strengthHistory[slen - 3] &&
        strengthHistory[slen - 3] < strengthHistory[slen - 4];

      if (isIncomeDeclining && isStrengthDeclining) {
        const humanPlayer = state.players.find(p => !p.isOriginalBarbarian && !p.isEliminated);
        if (humanPlayer) {
          const playerStrength = calculateKingdomStrength(humanPlayer, state);
          const myStrengthValue = calculateKingdomStrength(currentPlayer, state);
          
          // Surrender if strength is less than 1/3 of a human player
          if (myStrengthValue < playerStrength / 3) {
            return { type: 'barbarianSurrender' as const };
          }
        }
      }
      
      // Absolute surrender: No income and very low strength
      if (incomeHistory[len - 1] === 0 && strengthHistory[slen - 1] < 100) {
         return { type: 'barbarianSurrender' as const };
      }
    } else if (state.turnNumber > 15 && numSettlements === 0 && myStrength < 100) {
      // If we've been around for a while, have no settlements, and almost no units, just give up
      return { type: 'barbarianSurrender' as const };
    }
  }

  // 1. Try to recruit (Barbarians only recruit infantry)
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
    heatMap,
    true
  );
  if (recruitmentAction) return recruitmentAction;

  // 2. Try to upgrade settlements (Barbarians never upgrade, only build new villages)
  const upgradeAction = getUpgradeAction(state, currentPlayer, isUnderThreat, isEarlyGame, numSettlements, isLaggingIncome, true);
  if (upgradeAction) return upgradeAction;

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
