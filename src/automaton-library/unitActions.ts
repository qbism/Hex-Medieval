import { 
  GameState, 
  Player, 
  Unit, 
  UnitType, 
  TerrainType, 
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

  // Pre-calculate follow-up potential for ALL units once
  const friendlyFollowUpPotential = myUnits.map(u => ({
    id: u.id,
    type: u.type,
    moves: getValidMoves(u, state.board, state.units),
    attacks: getValidAttacks(u, state.board, state.units, true)
  }));

  // --- Coordination and Sequencing Analysis ---
  // Identify units with restricted targets and targets with multiple potential attackers
  const unitTargetCounts = new Map<string, number>();
  const targetAttackerIds = new Map<string, string[]>();

  for (const f of friendlyFollowUpPotential) {
    unitTargetCounts.set(f.id, f.attacks.length);
    for (const t of f.attacks) {
      const key = `${t.q},${t.r}`;
      const attackers = targetAttackerIds.get(key) || [];
      attackers.push(f.id);
      targetAttackerIds.set(key, attackers);
    }
  }

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
  
  // Pre-calculate target partitioning for all acting units
  const actingUnitsTargets = myUnits.map(u => {
    const allTargets = getValidAttacks(u, state.board, state.units, true);
    const unitTargetCoords = allTargets.filter(t => cachedData.unitsMap.has(`${t.q},${t.r}`));
    const settlementTargetCoords = allTargets.filter(t => {
      const tile = cachedData.boardMap.get(`${t.q},${t.r}`);
      return tile && tile.ownerId !== null && tile.ownerId !== currentPlayer.id && 
             [TerrainType.VILLAGE, TerrainType.FORTRESS, TerrainType.CASTLE, TerrainType.GOLD_MINE].includes(tile.terrain as any);
    });
    return { unit: u, unitTargetCoords, settlementTargetCoords };
  });

  const createAttackAction = (unit: Unit, target: HexCoord) => ({
    type: 'attack' as const,
    payload: { unitId: unit.id, target }
  });

  // COMBINED PHASE: Evaluate all attacks and moves for all units, and pick the best one globally.
  const possibleActions: { unit: Unit, action: any, score: number }[] = [];

  for (const unitToAct of myUnits) {
    // Score all valid attacks for this unit
    const attackEval = evaluateAttacks(unitToAct, context);
    if (attackEval) {
      possibleActions.push({ unit: unitToAct, action: attackEval.action, score: attackEval.score });
    }

    // Score all valid moves for this unit
    const moveEval = evaluateMoves(unitToAct, context);
    if (moveEval) {
      possibleActions.push({ unit: unitToAct, action: moveEval.action, score: moveEval.score });
    }
  }

  // Combinatorial Logic: Catapult/Knight combos (still useful for high-priority capture)
  const catapultAction = possibleActions.find(pa => 
    pa.unit.type === UnitType.CATAPULT && 
    pa.action.type === 'attack' &&
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
