import { 
  GameState, 
  Player, 
  Unit, 
  UnitType, 
  TerrainType, 
  UNIT_STATS, 
  getDistance, 
  getNeighbors as _getNeighbors, 
  HexCoord, 
  UPGRADE_COSTS as _UPGRADE_COSTS,
  SETTLEMENT_INCOME
} from '../../types';
import { TileEvaluation } from '../types';
import { getValidAttacks, getValidMoves, getUnitRange } from '../../gameEngine';
import { findNearestTarget as _findNearestTarget, getChokepointScore as _getChokepointScore } from '../utils';
import { 
  BASE_REWARD,
  HORIZON,
  STAY_PUT_BIAS,
  IMMEDIATE_CAPTURE_BONUS,
  PILLAGE_SCORE_BONUS,
  UNCLAIMED_VILLAGE_PRIORITY_BONUS,
  PUT_ENEMY_IN_PERIL_BONUS,
  EXPANSION_DISTANCE_BONUS,
  PLAINS_PRIORITY_BONUS,
  EDGE_OF_PERIL_BONUS,
  INFILLING_BONUS,
  PATHING_CONSISTENCY_BONUS,
  KNIGHT_HARASSMENT_BONUS,
  KNIGHT_SAFETY_BONUS,
  KNIGHT_FRIENDLY_SETTLEMENT_BONUS,
  CATAPULT_SAFETY_PENALTY_HIGH,
  CATAPULT_SIEGE_POSITION_BONUS,
  CATAPULT_SIEGE_PROXIMITY_BONUS,
  CATAPULT_DEFENSIVE_STAY_PUT_BONUS,
  DEFENSE_SCORING_BONUS,
  SACRIFICE_BONUS,
  COORDINATION_BONUS,
  INFLUENCE_PENALTY_HIGH_RATIO,
  INFLUENCE_PENALTY_MED_RATIO,
  INFLUENCE_EXPANSION_BONUS,
  HVT_PROXIMITY_BONUS_FACTOR,
  SCREENING_BONUS,
  COUNTER_ATTACK_BONUS,
  FOCUS_FIRE_BONUS,
  PREEMPTIVE_DEFENSE_BONUS,
  DRIVE_OUT_BONUS,
  LETHAL_THREAT_PENALTY_MULT,
  MUTUAL_SUPPORT_BONUS,
  THREAT_PENALTY_SACRIFICE_MULT,
  THREAT_PENALTY_L1_MULT,
  OPPORTUNISTIC_RETREAT_SETTLEMENT_BONUS,
  OPPORTUNISTIC_RETREAT_PLAINS_BONUS,
  SUPPORT_SCORE_MULT,
  RALLY_POINT_ADJACENCY_BONUS,
  BAIT_AND_TRADE_THRESHOLD,
  INFANTRY_VANGUARD_SETTLEMENT_BONUS,
  KNIGHT_FIRST_IN_PENALTY,
  CATAPULT_MEAT_SHIELD_BONUS,
  FORMATION_ANCHOR_BONUS,
  SQUAD_INTEGRITY_BONUS,
  ARCHER_PLACEMENT_BONUS,
  CATAPULT_PLACEMENT_BONUS,
  INFANTRY_FRONT_LINE_BONUS,
  KNIGHT_FLANK_BONUS,
  SETTLEMENT_DEGRADATION_PRIORITY_BONUS,
  COMBO_FOLLOW_UP_CLAIMER_BONUS,
  COMBO_FOLLOW_UP_NEUTRALIZER_BONUS,
  COMBO_SEQUENCING_STAY_PUT_PENALTY,
  UPGRADE_SAVING_MINE_BONUS,
  UPGRADE_SAVING_MINE_STAY_PUT_BONUS,
  UPGRADE_SAVING_VILLAGE_BONUS,
  UPGRADE_SAVING_VILLAGE_STAY_PUT_BONUS,
  TERRAIN_FOREST_PENALTY,
  TERRAIN_MOUNTAIN_BONUS,
  TERRAIN_PLAINS_NEUTRAL_BONUS,
  TERRAIN_PLAINS_OWNED_BONUS,
  TERRAIN_VILLAGE_BONUS,
  TERRAIN_FORT_BONUS,
  TERRAIN_CASTLE_BONUS,
  TERRAIN_GOLD_MINE_BONUS
} from '../constants';
import { LoopSafety } from '../../utils';
import { ThreatInfo } from '../threatAnalysis';
import { evaluateActionSafety } from '../TacticalSearch';
import { AIConfig } from '../AIConfig';

export interface UnitActionContext {
  state: GameState;
  currentPlayer: Player;
  threatMatrix: Map<string, ThreatInfo>;
  influenceMap: Map<string, number>;
  evaluationMap: Map<string, TileEvaluation>; 
  eminentThreatBases: any[];
  possibleThreatBases: any[];
  playerStrengths: any[];
  myStrength: number;
  focusOnLeader: boolean;
  leaderId: number;
  empireCenter: HexCoord;
  hvt: Unit | null;
  isSavingForMine: boolean;
  isSavingForVillage: boolean;
  isLagging: boolean;
  isCriticallyLaggingLargeEconomy: boolean;
  isBarbarian: boolean;
  cachedData: any;
  primaryAggressorId: number;
  threatenedBasesCount: number;
  unitsMap: Map<string, Unit>;
  boardMap: Map<string, any>;
  mySettlements: any[];
  enemySettlements: any[];
  myCatapults: Unit[];
  otherFriendlyUnits: Unit[];
  friendlyFollowUpPotential: any[];
  globalAggression: number;
  globalUnitRatio: number;
  isRich: boolean;
  config: AIConfig;
}

export function evaluateAttacks(unitToAct: Unit, context: UnitActionContext): { action: any, score: number } | null {
  const { 
    state, 
    currentPlayer, 
    threatMatrix, 
    eminentThreatBases,
    leaderId, 
    focusOnLeader, 
    hvt, 
    isBarbarian,
    primaryAggressorId,
    unitsMap,
    boardMap,
    otherFriendlyUnits,
    friendlyFollowUpPotential,
    config
  } = context;

  const attacks = getValidAttacks(unitToAct, state.board, state.units);
  if (attacks.length === 0) return null;

  let bestAttack = attacks[0];
  let maxPriority = -Infinity;

  const unitCurrentThreat = threatMatrix.get(`${unitToAct.coord.q},${unitToAct.coord.r}`);
  
  // REAL PERIL check: Not in peril if we have enough friends or if we can strike first at a lone threat
  const myLocalSupport = otherFriendlyUnits.filter(u => getDistance(u.coord, unitToAct.coord, state.board) <= 2).length;
  const isUnitInPeril = unitCurrentThreat ? (unitCurrentThreat.minTurns === 1 && unitCurrentThreat.eminentAttackerCount > (myLocalSupport + 1)) : false;
  
  const isUnitDoomed = unitCurrentThreat ? (unitCurrentThreat.eminentThreatValue >= UNIT_STATS[unitToAct.type].cost * 1.5 && unitCurrentThreat.eminentAttackerCount > (myLocalSupport + 1)) : false;

  const attackSafety = new LoopSafety('evaluateAttacks', 3000);
  for (const a of attacks) {
    if (attackSafety.tick()) break;
    
    const coordKey = `${a.q},${a.r}`;
    const targetUnit = unitsMap.get(coordKey);
    const targetTile = boardMap.get(coordKey);

    let priority = 0;

    const evaluation = context.evaluationMap.get(coordKey);
    if (evaluation) {
      priority += evaluation.score * 8.0;
    }

    if (targetUnit) {
      const targetValue = UNIT_STATS[targetUnit.type].cost;
      // Lethality bonus: Huge reward for actually removing an enemy unit from the board
      const killBonus = config.BASE_REWARD * 15.0;
      
      // Always give a base reward for engaging enemy units
      // If unit is in peril or doomed, increase priority to "take them with you"
      const meatShieldBonus = (isUnitInPeril ? 1.5 : 1.0) * (isUnitDoomed ? 2.0 : 1.0);
      
      // HIGH PRIORITY: Attack score should usually trump move score if an immediate strike is possible.
      // We boost this significantly to ensure units actually Pull the Trigger.
      // USER BUG: Archers skipping attacks - Boosted to 100x to ensure it wins over complicated move heuristics.
      priority = (targetValue * 2.0 + config.BASE_REWARD * 100.0 + killBonus) * meatShieldBonus;
      
      const potentialAttackers = otherFriendlyUnits.filter(u => {
        if (u.hasActed) return false;
        const dist = getDistance(u.coord, targetUnit.coord, state.board);
        return dist <= getUnitRange(u, state.board);
      });
      
      if (potentialAttackers.length > 0) {
        priority += config.BASE_REWARD * config.FOCUS_FIRE_BONUS * potentialAttackers.length;
      }

      if (potentialAttackers.length >= 1) {
        priority += config.BASE_REWARD * config.KILL_PRIORITY_BONUS;
      }

      // LETHALITY: Huge bonus for finishing off a unit that is threatening a base
      const isTargetThreateningBase = eminentThreatBases.some(b => {
        const distToBase = getDistance(targetUnit.coord, b.coord, state.board);
        const enemyRange = UNIT_STATS[targetUnit.type].moves + getUnitRange(targetUnit, state.board);
        return distToBase <= enemyRange;
      });

      if (isTargetThreateningBase) {
        priority += config.BASE_REWARD * config.LETHALITY_WEIGHT_BONUS; // Urgent defense priority
      }
      
      if (isUnitInPeril && !isBarbarian) {
        priority += config.BASE_REWARD * 10.0;
        const targetThreatRadius = UNIT_STATS[targetUnit.type].moves + getUnitRange(targetUnit, state.board);
        if (getDistance(unitToAct.coord, targetUnit.coord, state.board) <= targetThreatRadius) {
          priority += config.BASE_REWARD * 5.0;
        }
      }

      if (hvt && targetUnit.id === hvt.id) priority += config.BASE_REWARD * 3.0;
      if (targetUnit.type === UnitType.CATAPULT) priority += config.BASE_REWARD * 1.0;
      if (focusOnLeader && targetUnit.ownerId === leaderId) priority += config.BASE_REWARD * 0.5;
      if (primaryAggressorId !== -1 && targetUnit.ownerId === primaryAggressorId) priority += config.BASE_REWARD * 15.0;

      if (unitCurrentThreat && !isBarbarian) {
         const targetThreatRadius = UNIT_STATS[targetUnit.type].moves + getUnitRange(targetUnit, state.board);
         const isTargetThreateningUs = getDistance(unitToAct.coord, targetUnit.coord, state.board) <= targetThreatRadius;
         
         // In a one-hit-kill game, if there is ANY attacker that can hit us (besides maybe the one we're killing), we are doomed.
         const willDieAnyway = unitCurrentThreat.eminentAttackerCount > (isTargetThreateningUs ? 1 : 0);
         
         if (willDieAnyway) {
            // If we're going to die anyway, any damage we deal is a bonus.
            // Don't penalize for "trading down" since the alternative is dying for free.
            priority += targetValue * 2.0 + BASE_REWARD * 2.0;
            
            // If we can take a Catapult or Knight with us, that's a massive win.
            if (targetValue >= 150) priority += BASE_REWARD * 10.0;
         }
      }

      const isOnSettlement = targetTile && (targetTile.terrain === TerrainType.VILLAGE || targetTile.terrain === TerrainType.FORT || targetTile.terrain === TerrainType.CASTLE || targetTile.terrain === TerrainType.GOLD_MINE);
      if (isOnSettlement) {
        const canBuddiesNeutralize = friendlyFollowUpPotential.some(f => f.attacks.some((at: any) => at?.q === targetTile.coord?.q && at?.r === targetTile.coord?.r));
        const canBuddiesClaim = otherFriendlyUnits.some(f => {
          if (f.hasActed) return false;
          return getDistance(f.coord, targetTile.coord, state.board) <= UNIT_STATS[f.type].moves;
        });

        if (canBuddiesNeutralize && canBuddiesClaim && targetTile.ownerId !== currentPlayer.id) {
          priority += BASE_REWARD * COMBO_FOLLOW_UP_NEUTRALIZER_BONUS;
        }
      }
      
      if (unitToAct.type === UnitType.INFANTRY && isOnSettlement) priority += config.BASE_REWARD * config.INFANTRY_VANGUARD_SETTLEMENT_BONUS;

      const isThreateningBase = context.eminentThreatBases.some(b => getDistance(a, b.coord, state.board) <= 3);
      if (isThreateningBase) priority += config.BASE_REWARD * config.PREEMPTIVE_DEFENSE_BONUS;

      const isNearOurSettlement = context.mySettlements.some(s => getDistance(a, s.coord, state.board) <= 2);
      if (isNearOurSettlement) priority += config.BASE_REWARD * config.DRIVE_OUT_BONUS;

      const isOccupyingMySettlement = targetTile && targetTile.ownerId === currentPlayer.id && (targetTile.terrain === TerrainType.VILLAGE || targetTile.terrain === TerrainType.FORT || targetTile.terrain === TerrainType.CASTLE || targetTile.terrain === TerrainType.GOLD_MINE);
      if (isOccupyingMySettlement) priority += BASE_REWARD * 2.0;

      // --- NEW: Target Rarity and Coordination ---
      // "coordinate attacks to hit the most number of enemy units as possible per turn"
      const othersWhoCanHitThis = friendlyFollowUpPotential.filter(f => f.id !== unitToAct.id && f.attacks.some((at: any) => at.q === a.q && at.r === a.r));
      const targetIsSettlement = targetTile && (targetTile.terrain === TerrainType.VILLAGE || targetTile.terrain === TerrainType.FORT || targetTile.terrain === TerrainType.CASTLE || targetTile.terrain === TerrainType.GOLD_MINE);

      if (othersWhoCanHitThis.length === 0) {
        // I am the ONLY unit that can hit this target. Definitely prioritize it!
        priority += config.BASE_REWARD * 20.0;
      } else if (!targetIsSettlement) {
        // Others can hit it too. Check if they have other options.
        // If all others who can hit this have NO other targets, I should probably leave it for them if I have other targets.
        // NOTE: Never yield settlements! We want them captured ASAP by whoever is ready.
        const myOtherTargets = attacks.length - 1;
        const othersTargetsCounts = othersWhoCanHitThis.map(f => f.attacks.length);
        const othersAreRestricted = othersTargetsCounts.every(count => count === 1);
        
        if (othersAreRestricted && myOtherTargets > 0) {
          // I have other options, and my buddies only have THIS one. I should wait/pick something else.
          priority -= config.BASE_REWARD * 15.0;
        }
      }

      // SIEGE PRIORITY: Catapults should focus on cracking enemy fortifications
      if (unitToAct.type === UnitType.CATAPULT && targetTile && targetTile.ownerId !== currentPlayer.id && (targetTile.terrain === TerrainType.FORT || targetTile.terrain === TerrainType.CASTLE)) {
        priority += config.BASE_REWARD * config.SIEGE_OVERRIDE_BONUS; 
      }

    } else if (targetTile && targetTile.ownerId !== null && targetTile.ownerId !== currentPlayer.id && (targetTile.terrain === TerrainType.VILLAGE || targetTile.terrain === TerrainType.FORT || targetTile.terrain === TerrainType.CASTLE || targetTile.terrain === TerrainType.GOLD_MINE)) {
      const settlementValue = SETTLEMENT_INCOME[targetTile.terrain as TerrainType] * HORIZON;
      // USER: AI avoids undefended settlements. 
      // Boosted priority from 35 to 80 to ensure it competes with units, especially if it's the only strike available.
      priority = settlementValue * 3.0 + config.BASE_REWARD * 80.0; 
      
      const enemyUnitsOnTarget = state.units.filter(u => u.coord.q === targetTile.coord.q && u.coord.r === targetTile.coord.r).length;
      if (enemyUnitsOnTarget === 0) {
        // UNDEFENDED BONUS: Huge boost if the settlement is literally wide open
        priority += config.BASE_REWARD * 50.0;
      }
      
      const enemyUnitsNearThisSettlement = state.units.filter(u => u.ownerId === targetTile.ownerId && getDistance(u.coord, targetTile.coord, state.board) <= UNIT_STATS[u.type].moves);
      if (enemyUnitsNearThisSettlement.length > 0) priority += config.BASE_REWARD * config.SETTLEMENT_DEGRADATION_PRIORITY_BONUS;

      const canBuddiesClaim = otherFriendlyUnits.some(f => {
          if (f.hasActed) return false;
          return getDistance(f.coord, targetTile.coord, state.board) <= UNIT_STATS[f.type].moves;
      });
      
      if (canBuddiesClaim && targetTile.terrain === TerrainType.VILLAGE) {
        priority += BASE_REWARD * COMBO_FOLLOW_UP_CLAIMER_BONUS;
      } else if (canBuddiesClaim) {
        priority += BASE_REWARD * (COMBO_FOLLOW_UP_CLAIMER_BONUS * 0.5);
      }

      if (isBarbarian) priority += BASE_REWARD * PILLAGE_SCORE_BONUS;
      if (isUnitInPeril && !isBarbarian) priority += BASE_REWARD * 5.0;
      if (focusOnLeader && targetTile.ownerId === leaderId) priority += BASE_REWARD * 1.0;
      if (primaryAggressorId !== -1 && targetTile.ownerId === primaryAggressorId) priority += BASE_REWARD * 10.0;
    }

    if (priority > maxPriority) {
      // Tactical Lookahead for high-value targets or high-value units
      if ((unitToAct.type === UnitType.KNIGHT || unitToAct.type === UnitType.CATAPULT) && !isBarbarian) {
        const safety = evaluateActionSafety(state, { type: 'attack', payload: { unitId: unitToAct.id, target: a } }, currentPlayer.id);
        if (!safety.isSafe) {
          // Penalize unsafe attacks for high value units
          priority -= (UNIT_STATS[unitToAct.type].cost * 2.0); 
        }
      }

      if (priority > maxPriority) {
        maxPriority = priority;
        bestAttack = a;
      }
    }
  }

  if (maxPriority > -100 || (isBarbarian && attacks.length > 0)) {
    return { 
      action: { type: 'attack' as const, payload: { unitId: unitToAct.id, target: bestAttack } },
      score: maxPriority === -Infinity ? 0 : maxPriority
    };
  }
  return null;
}

export function evaluateMoves(unitToAct: Unit, context: UnitActionContext): { action: any, score: number } | null {
  const {
    state,
    currentPlayer,
    threatMatrix,
    influenceMap,
    eminentThreatBases,
    empireCenter,
    hvt,
    isSavingForMine,
    isSavingForVillage,
    isCriticallyLaggingLargeEconomy,
    isBarbarian,
    cachedData,
    boardMap,
    mySettlements,
    enemySettlements,
    myCatapults,
    otherFriendlyUnits,
    friendlyFollowUpPotential,
    globalAggression,
    globalUnitRatio,
    isRich,
    config
  } = context;

  const stats = UNIT_STATS[unitToAct.type];
  const moves = getValidMoves(unitToAct, state.board, state.units);
  moves.push(unitToAct.coord);
  
  if (moves.length === 0) return null;

  const currentAttacks = getValidAttacks(unitToAct, state.board, state.units);
  const isRanged = unitToAct.type === UnitType.ARCHER || unitToAct.type === UnitType.CATAPULT;

  let bestMove = moves[0];
  let maxScore = -Infinity;

  const moveSafety = new LoopSafety('evaluateMoves', 15000);
  
  if (!cachedData.settlementTargets) {
    cachedData.settlementTargets = state.board.filter(t => 
      (t.ownerId === null || t.ownerId !== currentPlayer.id) && 
      (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORT || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
    ).map(t => ({ coord: t.coord, value: SETTLEMENT_INCOME[t.terrain as TerrainType] * HORIZON, isExpansionHub: false, isSettlement: true, ownerId: t.ownerId, unitType: undefined }));
  }
  const settlementTargets = cachedData.settlementTargets;

  if (!cachedData.enemyUnitTargets) {
    cachedData.enemyUnitTargets = state.units.filter(u => u.ownerId !== currentPlayer.id)
      .map(u => ({ coord: u.coord, value: UNIT_STATS[u.type].cost, isExpansionHub: false, isSettlement: false, ownerId: u.ownerId, unitType: u.type }));
  }
  const enemyUnitTargets = cachedData.enemyUnitTargets;

  if (!cachedData.expansionHubs) {
    cachedData.expansionHubs = state.board.filter(t => 
      t.terrain === TerrainType.PLAINS && t.ownerId === null &&
      !state.units.some(u => u.ownerId === currentPlayer.id && getDistance(u.coord, t.coord, state.board) <= 3) &&
      !mySettlements.some(s => getDistance(s.coord, t.coord, state.board) <= 4)
    ).map(t => {
      const neighbors = _getNeighbors(t.coord);
      let quality = 1;
      neighbors.forEach(n => {
        const nt = boardMap.get(`${n.q},${n.r}`);
        if (nt && nt.ownerId === null) quality++;
      });
      return { coord: t.coord, value: quality * 20, isExpansionHub: true, isSettlement: false, ownerId: null, unitType: undefined };
    }).sort((a, b) => b.value - a.value).slice(0, 5);
  }
  const expansionHubs = cachedData.expansionHubs;

  const moveTargets = [
    ...settlementTargets,
    ...enemyUnitTargets,
    ...expansionHubs
  ].sort((a, b) => getDistance(unitToAct.coord, a.coord, state.board) - getDistance(unitToAct.coord, b.coord, state.board))
   .slice(0, 30);

  const myValue = stats.cost;
  const currentThreat = threatMatrix.get(`${unitToAct.coord.q},${unitToAct.coord.r}`);
  
  // Real Peril for movement
  const myLocalSupport = otherFriendlyUnits.filter(u => getDistance(u.coord, unitToAct.coord, state.board) <= 2).length;
  const isUnitInPeril = currentThreat ? (currentThreat.minTurns === 1 && currentThreat.eminentAttackerCount > (myLocalSupport + 1)) : false;

  const hasSafeRetreat = isUnitInPeril && moves.some(m => {
    const t = threatMatrix.get(`${m.q},${m.r}`);
    return !t || t.minTurns > 1;
  });

  let stayPutScore = -Infinity;

  for (const m of moves) {
    if (moveSafety.tick()) break;
    
    let score = 0;
    const tile = boardMap.get(`${m.q},${m.r}`)!;
    const isStayPut = m.q === unitToAct.coord.q && m.r === unitToAct.coord.r;
    
    const moveThreat = threatMatrix.get(`${m.q},${m.r}`);
    const moveThreatLevel = moveThreat ? moveThreat.minTurns : Infinity;
    const isMoveInPeril = moveThreatLevel === 1;

    const evaluation = context.evaluationMap.get(`${m.q},${m.r}`);
    if (evaluation) {
      score += evaluation.score * 8.0; // Increased significantly to respect the global Strategic Analysis
    }

    if (isStayPut) {
      score += config.BASE_REWARD * config.STAY_PUT_BIAS;

      // --- BASE CLEARANCE LOGIC ---
      // If we are on a recruitment tile, check if we should move to make room for a better unit.
      const isOnRecruitmentTile = tile.ownerId === currentPlayer.id && (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORT || tile.terrain === TerrainType.CASTLE);
      
      if (isOnRecruitmentTile) {
        const enemyUnitsAtRange2 = enemyUnitTargets.filter(trg => getDistance(m, trg.coord, state.board) === 2);
        const enemyUnitsAtRange3 = enemyUnitTargets.filter(trg => getDistance(m, trg.coord, state.board) === 3);

        const needsArcher = enemyUnitsAtRange2.length > 0 && unitToAct.type !== UnitType.ARCHER;
        const needsCatapult = enemyUnitsAtRange3.length > 0 && unitToAct.type !== UnitType.CATAPULT;
        
        // If we need a specific counter and have the gold, penalize staying put
        if ((needsArcher && currentPlayer.gold >= UNIT_STATS[UnitType.ARCHER].cost) || 
            (needsCatapult && currentPlayer.gold >= UNIT_STATS[UnitType.CATAPULT].cost)) {
          
          // Only move if there is a safe nearby tile to move to
          const hasSafeMove = moves.some(move => {
            if (move.q === m.q && move.r === m.r) return false;
            const t = threatMatrix.get(`${move.q},${move.r}`);
            return !t || t.minTurns > 1;
          });

          if (hasSafeMove) {
            score -= BASE_REWARD * 4.0; // Encourage clearing the base
          }
        }
 
        // Also if we are a "cheap" unit and can afford a "better" one for this specific spot
        if (unitToAct.type === UnitType.INFANTRY && currentPlayer.gold > 300) {
           score -= BASE_REWARD * 2.0; 
        }
      }
      
      // AI BUG FIX: Do NOT give a massive bonus to "Stay Put" just because an attack is available.
      // This was making "Move to current tile" score higher than the actual "Attack" action.
      // evaluateAttacks will naturally return a higher score if it's the best thing to do.
      const canAttackFromHere = currentAttacks.length > 0;
      if (canAttackFromHere) {
        score -= BASE_REWARD * 100.0; // CRITICAL: Heavy penalty for moving to "same tile" move action if we can attack.
      }

      const minDistToMySettlement = mySettlements.length > 0 ? Math.min(...mySettlements.map(s => getDistance(m, s.coord, state.board))) : 0;
      if (minDistToMySettlement >= stats.moves && tile.terrain === TerrainType.PLAINS && tile.ownerId === null) {
        score += BASE_REWARD * 3.0;
      }
      const targetSettlementBeingNetted = moveTargets.some(t => 
        t.isSettlement && t.ownerId !== null && t.ownerId !== currentPlayer.id &&
        friendlyFollowUpPotential.some(f => f.attacks.some((at: any) => at?.q === t?.coord?.q && at?.r === t?.coord?.r))
      );
      if (targetSettlementBeingNetted) score -= BASE_REWARD * COMBO_SEQUENCING_STAY_PUT_PENALTY;
    }

    if (!isMoveInPeril && tile.ownerId === null && 
       (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORT || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE)) {
      score += (BASE_REWARD * 30.0);
    }

    if (tile.terrain === TerrainType.MOUNTAIN && isSavingForMine) {
      const myIncome = mySettlements.reduce((sum, s) => sum + SETTLEMENT_INCOME[s.terrain as TerrainType], 0);
      const goldNextTurn = currentPlayer.gold + myIncome;
      const mineCost = _UPGRADE_COSTS[TerrainType.GOLD_MINE];
      if (goldNextTurn < mineCost) score -= (BASE_REWARD * 15.0); 
      else if (goldNextTurn >= mineCost) score += (BASE_REWARD * 20.0);
    }

    if (tile.ownerId === null && (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORT || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE)) {
      score += (SETTLEMENT_INCOME[tile.terrain as TerrainType] * HORIZON) + BASE_REWARD * IMMEDIATE_CAPTURE_BONUS; 
    }

    const potentialRange = getUnitRange({ ...unitToAct, coord: m }, state.board);

    if (!isMoveInPeril || isBarbarian) {
      const perilSafety = new LoopSafety('evaluateMoves-peril', 300);
      let putsEnemyInPeril = false;
      let perilCount = 0;
      for (const target of moveTargets) {
        if (perilSafety.tick()) break;
        const dist = getDistance(m, target.coord, state.board);
        if (dist <= potentialRange) {
          perilCount++;
          let pBonus = BASE_REWARD * PUT_ENEMY_IN_PERIL_BONUS;
          if (target.isSettlement) pBonus *= 1.25;
          score += pBonus;
          putsEnemyInPeril = true;
          if (isUnitInPeril) score += BASE_REWARD * COUNTER_ATTACK_BONUS;
        }
      }
      if (perilCount > 1) score += BASE_REWARD * 10 * (perilCount - 1); 
      if (!isMoveInPeril && !putsEnemyInPeril && !isBarbarian) {
        if (tile.ownerId === null && tile.terrain === TerrainType.VILLAGE) score += BASE_REWARD * UNCLAIMED_VILLAGE_PRIORITY_BONUS;
      }
    }

    const nearbyVillages = mySettlements.filter(v => getDistance(v.coord, unitToAct.coord, state.board) <= 3);
    const isNearbyVillageInPeril = nearbyVillages.some(v => {
      const t = threatMatrix.get(`${v.coord.q},${v.coord.r}`);
      return t ? t.minTurns === 1 : false;
    });

    const friendlyAttackers = otherFriendlyUnits.filter(u => getDistance(u.coord, m, state.board) <= UNIT_STATS[u.type].range).length;
    const enemyAttackers = moveThreat ? moveThreat.attackerCount : 0;
    const eminentEnemyAttackers = moveThreat ? moveThreat.eminentAttackerCount : 0;
    const eminentLnaRatio = eminentEnemyAttackers > 0 ? friendlyAttackers / eminentEnemyAttackers : 5.0;

    if (eminentLnaRatio <= 1.0 && eminentEnemyAttackers > 0 && !isBarbarian) {
      score -= (BASE_REWARD * 5.0);
    }

    if (!isUnitInPeril && !isNearbyVillageInPeril) {
      const distFromCenter = getDistance(m, empireCenter, state.board);
      const currentDistFromCenter = getDistance(unitToAct.coord, empireCenter, state.board);
      if (distFromCenter > currentDistFromCenter) score += BASE_REWARD * EXPANSION_DISTANCE_BONUS;
      
      const isExpansionTarget = (tile.terrain === TerrainType.PLAINS || (tile.terrain === TerrainType.VILLAGE && tile.ownerId === null)) && 
                               (tile.ownerId === null || tile.ownerId === currentPlayer.id);

      if (isExpansionTarget) {
        score += BASE_REWARD * PLAINS_PRIORITY_BONUS;
        if (isSavingForVillage && tile.terrain === TerrainType.PLAINS) score += BASE_REWARD * 10.0;
        if (!isMoveInPeril) {
          const neighbors = _getNeighbors(m);
          let isAdjacentToPeril = false;
          for (const n of neighbors) {
            const nThreat = threatMatrix.get(`${n.q},${n.r}`);
            if (nThreat && nThreat.eminentAttackerCount > 0) { isAdjacentToPeril = true; break; }
          }
          if (isAdjacentToPeril) score += BASE_REWARD * EDGE_OF_PERIL_BONUS;
        }
      }
    }

    let maxTargetScore = 0;
    let otherTargetsScore = 0;
    
    // Position-based Firing Bonus: Not currently used in direct score to prevent competition with attacks
    const range = getUnitRange(unitToAct, state.board);

    const targetSafety = new LoopSafety('evaluateMoves-targets', 300);
    for (const target of moveTargets) {
      if (targetSafety.tick()) break;
      const dist = getDistance(m, target.coord, state.board);
      const currentDist = getDistance(unitToAct.coord, target.coord, state.board);
      
      if (dist <= potentialRange || dist < currentDist) {
        const turnsToReach = Math.ceil((Math.max(0, dist - (target.isSettlement ? 0 : potentialRange))) / stats.moves) + 1;
        let targetScore = target.value / (turnsToReach + 1);

        const alreadyInRange = getDistance(unitToAct.coord, target.coord, state.board) <= range;
        
        if (alreadyInRange && isRanged && !isUnitInPeril) {
          if (dist > currentDist) {
            // STEP BACK PENALTY: Prevent ranged units from moving further away if they can already shoot
            targetScore -= BASE_REWARD * 100.0; // Increased to prevent annoying back-pedaling
          } else if (dist === currentDist && !isStayPut) {
             // REPOSITION PENALTY: Small cost for lateral moves that don't improve range but waste the attack turn
             targetScore -= BASE_REWARD * 10.0;
          }
          
          if (isStayPut && dist <= potentialRange) {
            // We found at least one target we can hit if we stay put
            // We've already accounted for this with a small STAY_PUT bonus above
          }

          // ARCHER BUG: If we can attack an enemy unit from where we are, moving is almost ALWAYS a waste.
          // In this engine, movement ends the turn (hasActed = true).
          if (!isStayPut && alreadyInRange && !isUnitInPeril) {
            targetScore -= BASE_REWARD * 50.0; // Penalty for moving when we could just shoot
          }
        }

        if (target.isSettlement && target.ownerId !== null && target.ownerId !== currentPlayer.id) {
          const buddiesWhoCanNeutralize = friendlyFollowUpPotential.some(f => f.attacks.some((at: any) => at?.q === target.coord?.q && at?.r === target.coord?.r));
          if (buddiesWhoCanNeutralize) targetScore += BASE_REWARD * COMBO_FOLLOW_UP_CLAIMER_BONUS;
        }

        if (currentDist > dist) targetScore += BASE_REWARD * PATHING_CONSISTENCY_BONUS;

        const friendlyCloserToTarget = otherFriendlyUnits.filter(u => getDistance(u.coord, target.coord, state.board) < dist).length;
        let saturationPenalty = friendlyCloserToTarget >= 2 ? 0.6 : (friendlyCloserToTarget === 1 ? 0.9 : 1.0);
        if (isRich) saturationPenalty = Math.max(saturationPenalty, 0.95);
        targetScore *= saturationPenalty;

        if (unitToAct.type === UnitType.KNIGHT && target.isSettlement && target.ownerId === null) {
           targetScore += BASE_REWARD * KNIGHT_HARASSMENT_BONUS * (dist > 3 ? 2.0 : 1.0);
        }

        if (unitToAct.type === UnitType.CATAPULT && (target.ownerId !== null || !target.isSettlement) && target.ownerId !== currentPlayer.id) {
            if (dist === 3 || dist === 4) targetScore += BASE_REWARD * 15.0; // Increased
            else if (dist < 3) targetScore -= BASE_REWARD * 10.0; // Increased penalty
        }

        if (unitToAct.type === UnitType.ARCHER && (target.ownerId !== null || !target.isSettlement) && target.ownerId !== currentPlayer.id) {
          if (dist === 2 || dist === 3) targetScore += BASE_REWARD * 12.0; 
          else if (dist < 2) targetScore -= BASE_REWARD * 8.0;
        }

        if (target.ownerId !== null && target.ownerId !== currentPlayer.id) {
          if (unitToAct.type === UnitType.INFANTRY && dist === 1) targetScore += config.BASE_REWARD * config.INFANTRY_FRONT_LINE_BONUS;
          else if (unitToAct.type === UnitType.ARCHER && dist === 2) targetScore += config.BASE_REWARD * config.ARCHER_PLACEMENT_BONUS * 1.5;
          else if (unitToAct.type === UnitType.CATAPULT && dist === 3) targetScore += config.BASE_REWARD * config.CATAPULT_PLACEMENT_BONUS * 1.5;
          else if (unitToAct.type === UnitType.KNIGHT && dist === 1) targetScore += config.BASE_REWARD * 5.0; // Knights want to strike!
          else if (unitToAct.type === UnitType.KNIGHT && dist <= 4 && dist >= 2) targetScore += config.BASE_REWARD * config.KNIGHT_FLANK_BONUS;
        }

        if (targetScore > maxTargetScore) {
          otherTargetsScore += maxTargetScore * 0.5;
          maxTargetScore = targetScore;
        } else {
          otherTargetsScore += targetScore * 0.5;
        }
      }
    }
    score += maxTargetScore + otherTargetsScore;

    const currentThreatLevel = currentThreat ? currentThreat.minTurns : Infinity;
    if (unitToAct.type === UnitType.KNIGHT && currentThreatLevel === 1 && !isBarbarian) {
      if (moveThreatLevel > 1) score += BASE_REWARD * KNIGHT_SAFETY_BONUS; 
      let minDistToSettlement = Infinity;
      for (const s of mySettlements) {
        const d = getDistance(m, s.coord, state.board);
        if (d < minDistToSettlement) minDistToSettlement = d;
      }
      if (minDistToSettlement <= 2) score += BASE_REWARD * KNIGHT_FRIENDLY_SETTLEMENT_BONUS; 
    }
    
    // Archer Skirmishing: Favor positions exactly 2 tiles away from threats but safe from immediate melee
    if (unitToAct.type === UnitType.ARCHER) {
      const nearestEnemyDist = enemyUnitTargets.length > 0 ? Math.min(...enemyUnitTargets.map(u => getDistance(m, u.coord, state.board))) : 99;
      const nearestSettlementDist = settlementTargets.filter(s => s.ownerId !== null).length > 0 ? Math.min(...settlementTargets.filter(s => s.ownerId !== null).map(s => getDistance(m, s.coord, state.board))) : 99;
      const effectiveEnemyDist = Math.min(nearestEnemyDist, nearestSettlementDist);

      if (effectiveEnemyDist === 2 && moveThreatLevel > 1) {
        score += config.BASE_REWARD * config.SKIRMISH_BIAS * 1.5; // Increased sweet spot bonus
      } else if (effectiveEnemyDist === 1) {
        score -= BASE_REWARD * 25.0; // Melee is even worse for archers now
      }
    }

    if (unitToAct.type === UnitType.CATAPULT) {
      if (moveThreatLevel === 1 && !isBarbarian) score -= BASE_REWARD * CATAPULT_SAFETY_PENALTY_HIGH; 
      const siegeSafety = new LoopSafety('evaluateMoves-siege', 300);
      for (const target of moveTargets) {
        if (siegeSafety.tick()) break;
        if (target.isSettlement && target.ownerId !== null && target.ownerId !== currentPlayer.id) {
          const d = getDistance(m, target.coord, state.board);
          if (d === potentialRange) score += BASE_REWARD * CATAPULT_SIEGE_POSITION_BONUS * 1.5; 
          else if (d < potentialRange && d >= 1) score += BASE_REWARD * CATAPULT_SIEGE_PROXIMITY_BONUS; 
        }
      }
      if (eminentThreatBases.some(b => getDistance(m, b.coord, state.board) <= 3) && isStayPut) score += BASE_REWARD * CATAPULT_DEFENSIVE_STAY_PUT_BONUS; 
    }

    const isDefendingBase = eminentThreatBases.some(b => getDistance(m, b.coord, state.board) <= 2) || mySettlements.some(s => getDistance(m, s.coord, state.board) <= 2);
    if (isDefendingBase) {
      const nearestEnemy = state.units.find(u => u.ownerId !== currentPlayer.id && getDistance(m, u.coord, state.board) <= 3);
      if (nearestEnemy) {
        score += config.BASE_REWARD * config.DRIVE_OUT_BONUS;
        if (isCriticallyLaggingLargeEconomy) score += config.BASE_REWARD * config.DRIVE_OUT_BONUS * 2;
      } else {
        score += config.BASE_REWARD * config.DEFENSE_SCORING_BONUS;
      }
      if (isCriticallyLaggingLargeEconomy) score += config.BASE_REWARD * config.DEFENSE_SCORING_BONUS * 4;
    }

    const threatenedVillages = eminentThreatBases.filter(v => {
      const t = threatMatrix.get(`${v.coord.q},${v.coord.r}`);
      return t ? t.minTurns === 1 : false;
    });
    if (threatenedVillages.length > 0) {
      const sacrificeSafety = new LoopSafety('evaluateMoves-sacrifice', 300);
      for (const target of moveTargets) {
        if (sacrificeSafety.tick()) break;
        if (target.unitType !== undefined && getDistance(m, target.coord, state.board) <= potentialRange) {
          const isEnemyThreateningVillage = threatenedVillages.some(v => getDistance(target.coord, v.coord, state.board) <= getUnitRange({ type: target.unitType, coord: target.coord } as any, state.board));
          if (isEnemyThreateningVillage) {
            let sBonus = BASE_REWARD * SACRIFICE_BONUS; 
            if (isCriticallyLaggingLargeEconomy) sBonus += BASE_REWARD * SACRIFICE_BONUS * 3;
            
            // AI BUG: Don't sacrifice archers if we can avoid it.
            if (unitToAct.type === UnitType.ARCHER) sBonus -= BASE_REWARD * 100.0; // Increased significantly
            
            score += sBonus;
          }
        }
      }
    }

    const coordinationSafety = new LoopSafety('evaluateMoves-coordination', 300);
    for (const target of moveTargets) {
      if (coordinationSafety.tick()) break;
      if (target.unitType !== undefined && getDistance(m, target.coord, state.board) <= potentialRange) {
        const isAlreadyInPeril = otherFriendlyUnits.some(u => getDistance(u.coord, target.coord, state.board) <= getUnitRange(u, state.board));
        if (isAlreadyInPeril) {
          let bonus = config.COORDINATION_BONUS;
          const isTargetThreateningMyBase = threatenedVillages.some(v => getDistance(target.coord, v.coord, state.board) <= getUnitRange({ type: target.unitType, coord: target.coord } as any, state.board));
          if (isTargetThreateningMyBase) bonus *= 2.0;
          score += config.BASE_REWARD * bonus; 
        }
      }
    }

    const influence = influenceMap.get(`${m.q},${m.r}`) || 0;
    const distToFriendlyBase = mySettlements.length > 0 ? Math.min(...mySettlements.map(s => getDistance(m, s.coord, state.board))) : Infinity;
    const distToEnemyBase = enemySettlements.length > 0 ? Math.min(...enemySettlements.map(s => getDistance(m, s.coord, state.board))) : Infinity;
    const distToNearestEnemyTarget = Math.min(distToEnemyBase, enemyUnitTargets.length > 0 ? Math.min(...enemyUnitTargets.map(u => getDistance(m, u.coord, state.board))) : Infinity);
    
    if (unitToAct.type !== UnitType.INFANTRY && !isBarbarian && distToNearestEnemyTarget !== Infinity) {
      const currentDistToEnemy = Math.min(
        enemySettlements.length > 0 ? Math.min(...enemySettlements.map(s => getDistance(unitToAct.coord, s.coord, state.board))) : Infinity,
        enemyUnitTargets.length > 0 ? Math.min(...enemyUnitTargets.map(u => getDistance(unitToAct.coord, u.coord, state.board))) : Infinity
      );
      
      // Award points for closing the gap to the enemy
      if (distToNearestEnemyTarget < currentDistToEnemy) {
        score += (currentDistToEnemy - distToNearestEnemyTarget) * config.BASE_REWARD * 15.0; 
      }
      
      if (distToNearestEnemyTarget > 4) {
        score -= (distToNearestEnemyTarget * config.BASE_REWARD * 2.0); // Reduced penalty
      } else {
        score += config.BASE_REWARD * 15.0; // Proximity bonus
      }
    }

    if (distToFriendlyBase <= 3 && distToEnemyBase <= 4 && influence >= -20 && (friendlyAttackers / Math.max(1, enemyAttackers)) >= 1.0) {
      score += BASE_REWARD * 4.5;
    }
    
    const nearFriendCount = otherFriendlyUnits.filter(u => getDistance(m, u.coord, state.board) === 1).length;
    if (nearFriendCount > 0) score += config.BASE_REWARD * config.MUTUAL_SUPPORT_BONUS * nearFriendCount;

    const catAnchors = myCatapults.filter(u => u.id !== unitToAct.id);
    for (const cat of catAnchors) {
      const distToCat = getDistance(m, cat.coord, state.board);
      if (distToCat === 1) score += config.BASE_REWARD * config.FORMATION_ANCHOR_BONUS;
      else if (distToCat === 2) score += config.BASE_REWARD * config.FORMATION_ANCHOR_BONUS * 0.5;
    }

    const clusterSize = otherFriendlyUnits.filter(u => getDistance(m, u.coord, state.board) <= 2).length;
    score += clusterSize * config.SQUAD_INTEGRITY_BONUS * 10; 

    // FOREST PENALTY
    if (tile.terrain === TerrainType.FOREST && isMoveInPeril) {
      score -= config.BASE_REWARD * config.FOREST_DANGER_PENALTY;
    } 

    if (moveThreatLevel > 1 && nearFriendCount > 0) score += RALLY_POINT_ADJACENCY_BONUS;
    if (influence < -100 && !isBarbarian) score -= myValue * INFLUENCE_PENALTY_HIGH_RATIO; 
    else if (influence < -50 && !isBarbarian) score -= myValue * INFLUENCE_PENALTY_MED_RATIO; 
    else if (influence < 0) score += Math.abs(influence) * INFLUENCE_EXPANSION_BONUS; 
    else score += 5;

    if (hvt) {
      const distToHvt = getDistance(m, hvt.coord, state.board);
      const currentDistToHvt = getDistance(unitToAct.coord, hvt.coord, state.board);
      if (distToHvt < currentDistToHvt) score += (BASE_REWARD * HVT_PROXIMITY_BONUS_FACTOR) / (distToHvt + 1);
    }

    if (unitToAct.type === UnitType.INFANTRY || unitToAct.type === UnitType.KNIGHT) {
      const screeningSafety = new LoopSafety('evaluateMoves-screening', 300);
      for (const cat of myCatapults) {
        if (screeningSafety.tick()) break;
        const distToCat = getDistance(m, cat.coord, state.board);
        if (distToCat === 1) {
          const nearestEnemy = state.units.find(u => u.ownerId !== currentPlayer.id);
          if (nearestEnemy) {
            const catToEnemy = getDistance(cat.coord, nearestEnemy.coord, state.board);
            const meToEnemy = getDistance(m, nearestEnemy.coord, state.board);
            if (meToEnemy < catToEnemy) score += BASE_REWARD * SCREENING_BONUS;
          }
        }
      }
    }

    if (unitToAct.type === UnitType.CATAPULT && isStayPut) {
      const hasMeatShield = otherFriendlyUnits.some(u => (u.type === UnitType.INFANTRY || u.type === UnitType.KNIGHT) && getDistance(m, u.coord, state.board) === 1);
      if (!hasMeatShield) score += BASE_REWARD * CATAPULT_MEAT_SHIELD_BONUS;
    }

    const threat = threatMatrix.get(`${m.q},${m.r}`);
    if (!isBarbarian && threat) {
      const threatLevel = threat.minTurns;
      const eminentValue = threat.eminentThreatValue;
      const eminentCount = threat.eminentAttackerCount;
      let penaltyMult = threatenedVillages.length > 0 ? THREAT_PENALTY_SACRIFICE_MULT : 1.0;
      
      const isOnOurSettlement = tile.ownerId === currentPlayer.id && (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORT || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE);
      
      // If we are defending our own settlement, we are willing to take risks.
      if (isOnOurSettlement) penaltyMult *= 0.3; // Much lower penalty for defending home
      
      if (isUnitInPeril) penaltyMult *= 0.5; 

      if (threatLevel === 1) {
        const enemiesCoveringTile = state.units.filter(u => u.ownerId !== currentPlayer.id && getDistance(u.coord, m, state.board) <= getUnitRange(u, state.board));
        let maxSupportScore = -Infinity;
        for (const enemy of enemiesCoveringTile) {
          const alliesInRangeOfEnemy = otherFriendlyUnits.filter(u => getDistance(u.coord, enemy.coord, state.board) <= getUnitRange(u, state.board)).length;
          const enemiesInRangeOfEnemy = state.units.filter(u => u.ownerId !== currentPlayer.id && u.id !== enemy.id && getDistance(u.coord, enemy.coord, state.board) <= getUnitRange(u, state.board)).length;
          const supportScore = (alliesInRangeOfEnemy - enemiesInRangeOfEnemy) * SUPPORT_SCORE_MULT;
          if (supportScore > maxSupportScore) maxSupportScore = supportScore;
        }
        
        // --- OVERWHELMING OVERRIDE ---
        // If we are targeting a high value unit (Catapult/Settlement) and we have buddies who can also hit it, 
        // we override the self-preservation instinct.
        let teamCommitment = 0;
        const targetBeingSwarmed = moveTargets.find(t => getDistance(m, t.coord, state.board) <= potentialRange);
        if (targetBeingSwarmed && (targetBeingSwarmed.unitType === UnitType.CATAPULT || targetBeingSwarmed.isSettlement)) {
           const teamCount = friendlyFollowUpPotential.filter(f => f.attacks.some((at: any) => at.q === targetBeingSwarmed.coord.q && at.r === targetBeingSwarmed.coord.r)).length;
           if (teamCount >= 2) {
             teamCommitment = teamCount * BASE_REWARD * 5.0;
           }
        }

        // If we're on our own settlement, don't just abandon it because it's threatened
        if (maxSupportScore + teamCommitment <= 0 && !isBarbarian && !isOnOurSettlement) score -= 10000;
        else if (maxSupportScore + teamCommitment <= 0 && !isBarbarian && isOnOurSettlement) score -= 2000; // Still a penalty, but not a total veto
        else score += Math.max(0, maxSupportScore + teamCommitment);

        let bestTradeValue = 0;
        let hasImmediateGain = false;
        for (const target of moveTargets) {
          const distAfterMove = getDistance(m, target.coord, state.board);
          if (distAfterMove <= potentialRange) {
            const tradeValue = target.value - myValue;
            if (tradeValue > bestTradeValue) bestTradeValue = tradeValue;
            if (distAfterMove === 0 && target.isSettlement && target.ownerId === null) hasImmediateGain = true;
          }
        }

        let penalty = ((myValue * THREAT_PENALTY_L1_MULT) + (eminentValue * 4.0) + (eminentCount * 100));
        if (globalAggression > 1.0) penalty /= globalAggression;

        if (myValue >= 200 && !isBarbarian && !hasImmediateGain) {
           const hvtPenaltyMult = globalUnitRatio >= 2.0 && isRich ? 2.5 : (globalUnitRatio >= 1.5 ? 5.0 : 10.0);
           penalty *= hvtPenaltyMult; 
        }

        if (unitToAct.type === UnitType.KNIGHT && !isBarbarian) {
          if (!otherFriendlyUnits.some(u => { const t = threatMatrix.get(`${u.coord?.q},${u.coord?.r}`); return t && t.minTurns === 1; })) score -= BASE_REWARD * KNIGHT_FIRST_IN_PENALTY;
        }
        
        if (eminentLnaRatio <= 1.1) penalty *= (eminentLnaRatio <= 1.0 ? 2.5 : 1.5) * (2.1 - eminentLnaRatio); 
        if (eminentCount >= 2 && bestTradeValue < BAIT_AND_TRADE_THRESHOLD) {
          penalty *= LETHAL_THREAT_PENALTY_MULT;
          if (eminentCount >= 4) penalty *= 1.5;
        }
        score -= penalty * penaltyMult;
      } else if (threatLevel === 2) {
        // Potential Trap Awareness: Small penalty for moving into range of an enemy move+attack
        score -= (myValue * 0.5) * penaltyMult;
      }
    }

    if (isUnitInPeril && !isStayPut) {
      if (moveThreatLevel > 1) {
        // General retreat bonus - heavily prioritize if it's actually safe
        score += BASE_REWARD * 30.0; 
        
        // High-Value Withdrawal: Much stronger for Knights/Catapults
        if (unitToAct.type === UnitType.KNIGHT || unitToAct.type === UnitType.CATAPULT) {
          score += BASE_REWARD * 40.0;
          
          // Bonus for retreating towards own territory or empire center
          const distFromCenter = getDistance(m, empireCenter, state.board);
          const currentDistFromCenter = getDistance(unitToAct.coord, empireCenter, state.board);
          if (distFromCenter < currentDistFromCenter) score += BASE_REWARD * 10.0;
        }

        if (tile.ownerId === null && (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORT || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE)) score += BASE_REWARD * OPPORTUNISTIC_RETREAT_SETTLEMENT_BONUS;
        else if (tile.terrain === TerrainType.PLAINS && tile.ownerId === null) score += BASE_REWARD * OPPORTUNISTIC_RETREAT_PLAINS_BONUS;
      } else if (hasSafeRetreat) {
        // If a safe retreat exists, heavily punish moving to ANOTHER peril tile
        score -= BASE_REWARD * 50.0;
      }
    }

    // Sacrifice/Screening logic: Infantry moving to protect assets
    if (unitToAct.type === UnitType.INFANTRY || unitToAct.type === UnitType.ARCHER) {
      // Is this tile adjacent to an asset we want to protect?
      const adjacentAssets = otherFriendlyUnits.filter(u => 
        (u.type === UnitType.KNIGHT || u.type === UnitType.CATAPULT) && 
        getDistance(m, u.coord, state.board) === 1
      );
      
      if (adjacentAssets.length > 0) {
        // Find if this tile is between the asset and an enemy
        const enemy = state.units.find(u => u.ownerId !== currentPlayer.id);
        if (enemy) {
          const distAssetToEnemy = getDistance(adjacentAssets[0].coord, enemy.coord, state.board);
          const distMeToEnemy = getDistance(m, enemy.coord, state.board);
          if (distMeToEnemy < distAssetToEnemy) {
            score += BASE_REWARD * SCREENING_BONUS * 5.0; // Increased
          }
        }
      }

      // Explicitly rotate into threatened settlement tiles
      if (tile.ownerId === currentPlayer.id && (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORT || tile.terrain === TerrainType.CASTLE)) {
        const baseThreat = threatMatrix.get(`${tile.coord.q},${tile.coord.r}`);
        if (baseThreat && baseThreat.minTurns <= 2) { 
          // Reduced from 15.0 to 1.5 to allow self-preservation to matter
          score += BASE_REWARD * SACRIFICE_BONUS * 1.5; 
        }
      }
    }

    // Self-preservation: Penalty for moving into higher peril
    const destinationThreat = threatMatrix.get(`${m.q},${m.r}`);
    
    if (destinationThreat && (!currentThreat || destinationThreat.eminentThreatValue > currentThreat.eminentThreatValue)) {
      // Moving into more danger than we are currently in
      score -= (destinationThreat.eminentThreatValue + 100) * 2.0;
    }

    const isBuildablePlains = tile.terrain === TerrainType.PLAINS && (tile.ownerId === null || tile.ownerId === currentPlayer.id);
    const isBuildableMountain = tile.terrain === TerrainType.MOUNTAIN && (tile.ownerId === null || tile.ownerId === currentPlayer.id);

    if (isSavingForMine && isBuildableMountain) {
      score += UPGRADE_SAVING_MINE_BONUS;
      if (isStayPut) score += UPGRADE_SAVING_MINE_STAY_PUT_BONUS; 
    } else if (isSavingForVillage && isBuildablePlains) {
      let canBuildHere = true;
      if (unitToAct.type === UnitType.CATAPULT) {
        const nearestFriendlySettlementDist = mySettlements.length > 0 ? Math.min(...mySettlements.map(s => getDistance(m, s.coord, state.board))) : Infinity;
        canBuildHere = nearestFriendlySettlementDist >= 2;
      }
      if (canBuildHere) {
        score += UPGRADE_SAVING_VILLAGE_BONUS;
        if (isStayPut) score += UPGRADE_SAVING_VILLAGE_STAY_PUT_BONUS; 
        if (tile.ownerId === currentPlayer.id) score += INFILLING_BONUS;
      }
    } else {
      // Direct Terrain Priority Scoring
      if (tile.terrain === TerrainType.FOREST) {
        score += TERRAIN_FOREST_PENALTY;
      } else if (tile.terrain === TerrainType.MOUNTAIN) {
        score += TERRAIN_MOUNTAIN_BONUS;
        if (tile.ownerId === currentPlayer.id) score += INFILLING_BONUS;
      } else if (tile.terrain === TerrainType.PLAINS) {
        score += (tile.ownerId === null) ? TERRAIN_PLAINS_NEUTRAL_BONUS : TERRAIN_PLAINS_OWNED_BONUS;
        if (tile.ownerId === currentPlayer.id) score += INFILLING_BONUS;
      } else if (tile.terrain === TerrainType.VILLAGE) {
        score += TERRAIN_VILLAGE_BONUS;
        if (tile.ownerId === currentPlayer.id) score += INFILLING_BONUS;
      } else if (tile.terrain === TerrainType.FORT) {
        score += TERRAIN_FORT_BONUS;
        if (tile.ownerId === currentPlayer.id) score += INFILLING_BONUS;
      } else if (tile.terrain === TerrainType.CASTLE) {
        score += TERRAIN_CASTLE_BONUS;
        if (tile.ownerId === currentPlayer.id) score += INFILLING_BONUS;
      } else if (tile.terrain === TerrainType.GOLD_MINE) {
        score += TERRAIN_GOLD_MINE_BONUS;
        if (tile.ownerId === currentPlayer.id) score += INFILLING_BONUS;
      }
    }

    if (tile.terrain === TerrainType.PLAINS && moveThreatLevel > 1) {
      const neighbors = _getNeighbors(m);
      let isEdgeOfPeril = false;
      for (const n of neighbors) {
        const t = threatMatrix.get(`${n.q},${n.r}`);
        if (t && t.minTurns === 1) { isEdgeOfPeril = true; break; }
      }
      if (isEdgeOfPeril) score += BASE_REWARD * EDGE_OF_PERIL_BONUS;
    }

    if (isStayPut) stayPutScore = score;

    if (score > maxScore) {
      // Tactical Lookahead for high-value units moving into peril
      if ((unitToAct.type === UnitType.KNIGHT || unitToAct.type === UnitType.CATAPULT) && !isBarbarian) {
        const safety = evaluateActionSafety(state, { type: 'move', payload: { unitId: unitToAct.id, target: m } }, currentPlayer.id);
        if (!safety.isSafe) {
          // Significant penalty if moving into a trap
          score -= (UNIT_STATS[unitToAct.type].cost * 2.5);
          
          // Debugging/Reasons if we had them here, but we just want to avoid the move.
        }
      }

      if (score > maxScore) {
        maxScore = score;
        bestMove = m;
      }
    }
  }

  if (bestMove.q === unitToAct.coord.q && bestMove.r === unitToAct.coord.r) {
    return { 
      action: { type: 'skipUnit' as const, payload: { unitId: unitToAct.id } },
      score: maxScore 
    };
  }

  // Dampen pointless movement: if moving isn't at least 20% better than staying put, and we are not in peril, just stay put.
  // Using 1.2 for positive scores, and dampening for negative as well if needed.
  if (!isUnitInPeril && stayPutScore > -Infinity) {
    const margin = Math.max(10.0, Math.abs(stayPutScore) * 0.20);
    const isMarginalImprovement = maxScore <= stayPutScore + margin;
    
    if (isMarginalImprovement) {
      return {
        action: { type: 'skipUnit' as const, payload: { unitId: unitToAct.id } },
        score: stayPutScore
      };
    }
  }

  return { 
    action: { type: 'move' as const, payload: { unitId: unitToAct.id, target: bestMove } },
    score: maxScore
  };
}
