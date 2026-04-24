import { 
  GameState, 
  Player, 
  Unit, 
  UnitType, 
  TerrainType, 
  UNIT_STATS, 
  HexCoord, 
  SETTLEMENT_INCOME
} from '../types';
import { getValidAttacks, getValidMoves } from '../gameEngine';
import { UnitActionContext, evaluateAttacks, evaluateMoves } from './unit-actions/evaluators';
import { ThreatInfo } from './threatAnalysis';

/**
 * getUnitAction: The core decision-making engine for individual unit tactics.
 * Refactored to use separated evaluators for better maintainability.
 */
export function getUnitAction(
  state: GameState, 
  currentPlayer: Player, 
  threatMatrix: Map<string, ThreatInfo>,
  influenceMap: Map<string, number>,
  eminentThreatBases: any[],
  possibleThreatBases: any[],
  playerStrengths: any[],
  myStrength: number,
  focusOnLeader: boolean,
  leaderId: number,
  empireCenter: HexCoord,
  hvt: Unit | null,
  isSavingForMine: boolean,
  isSavingForVillage: boolean,
  isLagging: boolean,
  isCriticallyLaggingLargeEconomy: boolean,
  isBarbarian: boolean = false,
  cachedData: any = {},
  primaryAggressorId: number = -1,
  threatenedBasesCount: number = 0
) {
  const myUnits = state.units.filter(u => u.ownerId === currentPlayer.id && !u.hasActed);
  const unitToAct = myUnits[0];
  
  if (!unitToAct) return null;
  
  // 1. Prepare Context & Cached Data
  if (!cachedData.unitsMap) {
    cachedData.unitsMap = new Map<string, Unit>();
    state.units.forEach(u => cachedData.unitsMap.set(`${u.coord.q},${u.coord.r}`, u));
  }
  
  if (!cachedData.boardMap) {
    cachedData.boardMap = new Map<string, any>();
    state.board.forEach(t => cachedData.boardMap.set(`${t.coord.q},${t.coord.r}`, t));
  }

  const mySettlements = state.board.filter(t => 
    t.ownerId === currentPlayer.id && 
    (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
  );

  const enemySettlements = state.board.filter(t => 
    t.ownerId !== null && t.ownerId !== currentPlayer.id && 
    (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
  );

  if (!cachedData.globalAggression) {
    const myUnitsCount = state.units.filter(u => u.ownerId === currentPlayer.id).length;
    const enemyUnitsCount = state.units.filter(u => u.ownerId !== currentPlayer.id).length;
    const globalUnitRatio = enemyUnitsCount > 0 ? myUnitsCount / enemyUnitsCount : 10.0;
    
    const myIncome = mySettlements.reduce((sum, s) => sum + SETTLEMENT_INCOME[s.terrain as TerrainType], 0);
    const isRichLocal = currentPlayer.gold > 500 || myIncome > 200;
    
    let aggression = 1.0;
    if (threatenedBasesCount > 0) aggression = 0.5;
    else {
      if (globalUnitRatio >= 2.0 && isRichLocal) aggression = 2.0; 
      else if (globalUnitRatio >= 1.5) aggression = 1.3;
    }
    
    cachedData.globalAggression = aggression;
    cachedData.globalUnitRatio = globalUnitRatio;
    cachedData.isRich = isRichLocal;
  }

  const otherFriendlyUnits = state.units.filter(u => u.ownerId === currentPlayer.id && u.id !== unitToAct.id);
  const otherFriendlyUnitsThatHaventActed = otherFriendlyUnits.filter(u => !u.hasActed);

  const friendlyFollowUpPotential = otherFriendlyUnitsThatHaventActed.map(u => ({
    id: u.id,
    type: u.type,
    moves: getValidMoves(u, state.board, state.units),
    attacks: getValidAttacks(u, state.board, state.units, true)
  }));

  const context: UnitActionContext = {
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
    isSavingForMine,
    isSavingForVillage,
    isLagging,
    isCriticallyLaggingLargeEconomy,
    isBarbarian,
    cachedData,
    primaryAggressorId,
    threatenedBasesCount,
    unitsMap: cachedData.unitsMap,
    boardMap: cachedData.boardMap,
    mySettlements,
    enemySettlements,
    myCatapults: state.units.filter(u => u.ownerId === currentPlayer.id && u.type === UnitType.CATAPULT),
    otherFriendlyUnits,
    friendlyFollowUpPotential,
    globalAggression: cachedData.globalAggression,
    globalUnitRatio: cachedData.globalUnitRatio,
    isRich: cachedData.isRich
  };

  // 2. Evaluate Actions
  // First, check for profitable attacks
  const attackAction = evaluateAttacks(unitToAct, context);
  if (attackAction) return attackAction;

  // Second, check for optimal movement
  const moveAction = evaluateMoves(unitToAct, context);
  if (moveAction) return moveAction;

  return { type: 'skipUnit' as const, payload: { unitId: unitToAct.id } };
}
