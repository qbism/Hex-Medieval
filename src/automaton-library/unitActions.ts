import { 
  GameState, 
  Player, 
  Unit, 
  UnitType, 
  TerrainType, 
  HexCoord, 
  SETTLEMENT_INCOME,
  UNIT_STATS,
  getDistance
} from '../types';
import { getValidAttacks, getValidMoves } from '../gameEngine';
import { UnitActionContext, evaluateAttacks, evaluateMoves } from './unit-actions/evaluators';
import { ThreatInfo } from './threatAnalysis';

/**
 * getUnitAction: The core decision-making engine for individual unit tactics.
 * Refactored to use separated evaluators for better maintainability.
 */
import { DEFAULT_AI_CONFIG } from './AIConfig';

export function getUnitAction(
  state: GameState, 
  currentPlayer: Player, 
  threatMatrix: Map<string, ThreatInfo>,
  influenceMap: Map<string, number>,
  evaluationMap: Map<string, any>,
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
  if (myUnits.length === 0) return null;
  
  // 1. Prepare Context & Cached Data
  if (!cachedData.unitsMap) {
    cachedData.unitsMap = new Map<string, Unit>();
    if (state.units) state.units.forEach(u => cachedData.unitsMap.set(`${u.coord.q},${u.coord.r}`, u));
  }
  
  if (!cachedData.boardMap) {
    cachedData.boardMap = new Map<string, any>();
    if (state.board) state.board.forEach(t => cachedData.boardMap.set(`${t.coord.q},${t.coord.r}`, t));
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

  // --- Coordination and Sequencing Analysis ---
  // Default: Evaluate ALL units to find the single best move globally.
  // PERFORMANCE FIX: If we have many units, evaluating ALL of them every single time a unit acts is O(N^2).
  // We limit the full evaluation to the most relevant units if the army is huge.
  let unitsToEvaluate = myUnits;
  if (myUnits.length > 100) {
    // Pick the 100 most "important" units to evaluate for the BEST action this turn.
    // Importance: Near enemies, or high value (Catapults/Knights)
    unitsToEvaluate = [...myUnits].sort((a, b) => {
      const aVal = UNIT_STATS[a.type].cost + (eminentThreatBases.some(base => getDistance(a.coord, base.coord) <= 3) ? 1000 : 0);
      const bVal = UNIT_STATS[b.type].cost + (eminentThreatBases.some(base => getDistance(b.coord, base.coord) <= 3) ? 1000 : 0);
      return bVal - aVal;
    }).slice(0, 100);
  }

  // Pre-calculate follow-up potential for evaluated units
  const friendlyFollowUpPotential = unitsToEvaluate.map(u => ({
    id: u.id,
    type: u.type,
    moves: getValidMoves(u, state.board, state.units),
    attacks: getValidAttacks(u, state.board, state.units, true)
  }));

  const otherFriendlyUnits = state.units.filter(u => u.ownerId === currentPlayer.id && u.id !== myUnits[0].id); 
  const context: UnitActionContext = {
    state,
    currentPlayer,
    threatMatrix,
    influenceMap,
    evaluationMap,
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
    isRich: cachedData.isRich,
    config: cachedData.config || DEFAULT_AI_CONFIG
  };

  // --- Aggressive Priority Phases ---
  
  // COMBINED PHASE: Evaluate all attacks and moves for the selected candidate units, and pick the best one globally.
  const possibleActions: { unit: Unit, action: any, score: number }[] = [];

  for (const unitToAct of unitsToEvaluate) {
    // 1. Evaluate Attacks FIRST: If a unit can attack, that's a high-priority action
    const attackEval = evaluateAttacks(unitToAct, context);
    if (attackEval) {
      possibleActions.push({ unit: unitToAct, action: attackEval.action, score: attackEval.score });
    }

    // 2. Evaluate Moves: 
    const moveEval = evaluateMoves(unitToAct, context);
    if (moveEval) {
      // REDUNDANCY CHECK: If the AI picks "Move to current location" but movesLeft is already 0, 
      // this action is a no-op that might trap the AI in a loop or trigger the "stuck" end-turn logic.
      const isMoveAction = moveEval.action?.type === 'move';
      const isNoOpMove = isMoveAction && 
                        moveEval.action.payload?.target?.q === unitToAct.coord.q && 
                        moveEval.action.payload?.target?.r === unitToAct.coord.r &&
                        unitToAct.movesLeft === 0;
      
      if (!isNoOpMove) {
        possibleActions.push({ unit: unitToAct, action: moveEval.action, score: moveEval.score });
      }
    }
  }

  // Combinatorial Logic: Catapult/Knight combos (still useful for high-priority capture)
  const catapultAction = possibleActions.find(pa => 
    pa.unit.type === UnitType.CATAPULT && 
    pa.action.type === 'attack' &&
    pa.action.payload?.target &&
    enemySettlements.some(s => s.coord.q === pa.action.payload.target.q && s.coord.r === pa.action.payload.target.r)
  );

  if (catapultAction) {
    const targetCoord = catapultAction.action.payload.target;
    // Use pre-calculated results for efficiency
    const knightCapturer = friendlyFollowUpPotential.find(f => 
      f.type === UnitType.KNIGHT && 
      f.moves.some((m: any) => m.q === targetCoord.q && m.r === targetCoord.r)
    );

    if (knightCapturer) {
      // Prioritize the Catapult attack first!
      return catapultAction.action;
    }
  }

  // 2. High-Priority Sequences (e.g. killing units blocking a path)
  // ... 

  // Default: return the action with the highest overall priority score among all units.
  if (possibleActions.length > 0) {
    const sorted = possibleActions.sort((a, b) => b.score - a.score);
    return sorted[0].action;
  }

  return { type: 'skipUnit' as const, payload: { unitId: myUnits[0].id } };
}
