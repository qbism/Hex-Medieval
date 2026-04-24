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
  KILL_PRIORITY_BONUS,
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
  TERRAIN_PLAINS_OWNED_BONUS
} from '../constants';
import { LoopSafety } from '../../utils';
import { ThreatInfo } from '../threatAnalysis';

export interface UnitActionContext {
  state: GameState;
  currentPlayer: Player;
  threatMatrix: Map<string, ThreatInfo>;
  influenceMap: Map<string, number>;
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
}

export function evaluateAttacks(unitToAct: Unit, context: UnitActionContext) {
  const { 
    state, 
    currentPlayer, 
    threatMatrix, 
    leaderId, 
    focusOnLeader, 
    hvt, 
    isBarbarian,
    primaryAggressorId,
    unitsMap,
    boardMap,
    otherFriendlyUnits,
    friendlyFollowUpPotential
  } = context;

  const attacks = getValidAttacks(unitToAct, state.board, state.units);
  if (attacks.length === 0) return null;

  let bestAttack = attacks[0];
  let maxPriority = -Infinity;

  const unitCurrentThreat = threatMatrix.get(`${unitToAct.coord.q},${unitToAct.coord.r}`);
  const isUnitInPeril = unitCurrentThreat ? unitCurrentThreat.minTurns === 1 : false;
  const myValue = UNIT_STATS[unitToAct.type].cost;

  const attackSafety = new LoopSafety('evaluateAttacks', 1000);
  for (const a of attacks) {
    if (attackSafety.tick()) break;
    
    const coordKey = `${a.q},${a.r}`;
    const targetUnit = unitsMap.get(coordKey);
    const targetTile = boardMap.get(coordKey);

    let priority = 0;

    if (targetUnit) {
      const targetValue = UNIT_STATS[targetUnit.type].cost;
      priority = targetValue;
      
      const potentialAttackers = otherFriendlyUnits.filter(u => {
        if (u.hasActed) return false;
        const dist = getDistance(u.coord, targetUnit.coord);
        return dist <= getUnitRange(u, state.board);
      });
      
      if (potentialAttackers.length > 0) {
        priority += BASE_REWARD * FOCUS_FIRE_BONUS * potentialAttackers.length;
      }

      if (potentialAttackers.length >= 1) {
        priority += BASE_REWARD * KILL_PRIORITY_BONUS;
      }
      
      if (isUnitInPeril && !isBarbarian) {
        priority += BASE_REWARD * 10.0;
        const targetThreatRadius = UNIT_STATS[targetUnit.type].moves + getUnitRange(targetUnit, state.board);
        if (getDistance(unitToAct.coord, targetUnit.coord) <= targetThreatRadius) {
          priority += BASE_REWARD * 5.0;
        }
      }

      if (hvt && targetUnit.id === hvt.id) priority += BASE_REWARD * 3.0;
      if (targetUnit.type === UnitType.CATAPULT) priority += BASE_REWARD * 1.0;
      if (focusOnLeader && targetUnit.ownerId === leaderId) priority += BASE_REWARD * 0.5;
      if (primaryAggressorId !== -1 && targetUnit.ownerId === primaryAggressorId) priority += BASE_REWARD * 15.0;

      if (unitCurrentThreat && !isBarbarian) {
         const targetThreatRadius = UNIT_STATS[targetUnit.type].moves + getUnitRange(targetUnit, state.board);
         const isTargetThreateningUs = getDistance(unitToAct.coord, targetUnit.coord) <= targetThreatRadius;
         const willDieAnyway = unitCurrentThreat.eminentAttackerCount > (isTargetThreateningUs ? 1 : 0);
         
         if (willDieAnyway) {
            const netValue = targetValue - myValue;
            if (netValue < 0) {
              priority -= Math.abs(netValue) * 3.0;
            } else {
              priority += BASE_REWARD * 1.0;
            }
         }
      }

      const isOnSettlement = targetTile && (targetTile.terrain === TerrainType.VILLAGE || targetTile.terrain === TerrainType.FORTRESS || targetTile.terrain === TerrainType.CASTLE || targetTile.terrain === TerrainType.GOLD_MINE);
      if (isOnSettlement) {
        const canBuddiesNeutralize = friendlyFollowUpPotential.some(f => f.attacks.some((at: any) => at.q === targetTile.coord.q && at.r === targetTile.coord.r));
        const canBuddiesClaim = otherFriendlyUnits.some(f => {
          if (f.hasActed) return false;
          return getDistance(f.coord, targetTile.coord) <= UNIT_STATS[f.type].moves;
        });

        if (canBuddiesNeutralize && canBuddiesClaim && targetTile.ownerId !== currentPlayer.id) {
          priority += BASE_REWARD * COMBO_FOLLOW_UP_NEUTRALIZER_BONUS;
        }
      }
      
      if (unitToAct.type === UnitType.INFANTRY && isOnSettlement) priority += BASE_REWARD * INFANTRY_VANGUARD_SETTLEMENT_BONUS;

      const isThreateningBase = context.eminentThreatBases.some(b => getDistance(a, b.coord) <= 3);
      if (isThreateningBase) priority += BASE_REWARD * PREEMPTIVE_DEFENSE_BONUS;

      const isNearOurSettlement = context.mySettlements.some(s => getDistance(a, s.coord) <= 2);
      if (isNearOurSettlement) priority += BASE_REWARD * DRIVE_OUT_BONUS;

      const isOccupyingMySettlement = targetTile && targetTile.ownerId === currentPlayer.id && (targetTile.terrain === TerrainType.VILLAGE || targetTile.terrain === TerrainType.FORTRESS || targetTile.terrain === TerrainType.CASTLE || targetTile.terrain === TerrainType.GOLD_MINE);
      if (isOccupyingMySettlement) priority += BASE_REWARD * 2.0;

    } else if (targetTile && targetTile.ownerId !== null && targetTile.ownerId !== currentPlayer.id && (targetTile.terrain === TerrainType.VILLAGE || targetTile.terrain === TerrainType.FORTRESS || targetTile.terrain === TerrainType.CASTLE || targetTile.terrain === TerrainType.GOLD_MINE)) {
      const settlementValue = SETTLEMENT_INCOME[targetTile.terrain as TerrainType] * HORIZON;
      priority = settlementValue * 1.5 + BASE_REWARD * 4.0;
      
      const enemyUnitsNearThisSettlement = state.units.filter(u => u.ownerId === targetTile.ownerId && getDistance(u.coord, targetTile.coord) <= UNIT_STATS[u.type].moves);
      if (enemyUnitsNearThisSettlement.length > 0) priority += BASE_REWARD * SETTLEMENT_DEGRADATION_PRIORITY_BONUS;

      const canBuddiesClaim = otherFriendlyUnits.some(f => {
          if (f.hasActed) return false;
          return getDistance(f.coord, targetTile.coord) <= UNIT_STATS[f.type].moves;
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
      maxPriority = priority;
      bestAttack = a;
    }
  }

  if (maxPriority > -100 || (isBarbarian && attacks.length > 0)) {
    return { type: 'attack' as const, payload: { unitId: unitToAct.id, target: bestAttack } };
  }
  return null;
}

export function evaluateMoves(unitToAct: Unit, context: UnitActionContext) {
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
    unitsMap
  } = context;

  const moves = getValidMoves(unitToAct, state.board, state.units);
  moves.push(unitToAct.coord);
  
  if (moves.length === 0) return null;

  let bestMove = moves[0];
  let maxScore = -Infinity;

  const moveSafety = new LoopSafety('evaluateMoves', 5000);
  
  if (!cachedData.settlementTargets) {
    cachedData.settlementTargets = state.board.filter(t => 
      (t.ownerId === null || t.ownerId !== currentPlayer.id) && 
      (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
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
      !state.units.some(u => u.ownerId === currentPlayer.id && getDistance(u.coord, t.coord) <= 3) &&
      !mySettlements.some(s => getDistance(s.coord, t.coord) <= 4)
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
  ].sort((a, b) => getDistance(unitToAct.coord, a.coord) - getDistance(unitToAct.coord, b.coord))
   .slice(0, 30);

  const stats = UNIT_STATS[unitToAct.type];
  const myValue = stats.cost;
  const currentThreat = threatMatrix.get(`${unitToAct.coord.q},${unitToAct.coord.r}`);
  const isUnitInPeril = currentThreat ? currentThreat.minTurns === 1 : false;

  for (const m of moves) {
    if (moveSafety.tick()) break;
    
    let score = 0;
    const tile = boardMap.get(`${m.q},${m.r}`)!;
    const isStayPut = m.q === unitToAct.coord.q && m.r === unitToAct.coord.r;
    
    const moveThreat = threatMatrix.get(`${m.q},${m.r}`);
    const moveThreatLevel = moveThreat ? moveThreat.minTurns : Infinity;
    const isMoveInPeril = moveThreatLevel === 1;

    if (isStayPut) {
      score += BASE_REWARD * STAY_PUT_BIAS;
      const minDistToMySettlement = mySettlements.length > 0 ? Math.min(...mySettlements.map(s => getDistance(m, s.coord))) : 0;
      if (minDistToMySettlement >= stats.moves && tile.terrain === TerrainType.PLAINS && tile.ownerId === null) {
        score += BASE_REWARD * 10.0;
      }
      const fallbackAttacks = getValidAttacks(unitToAct, state.board, state.units);
      if (fallbackAttacks.length > 0) score += 200;
      const targetSettlementBeingNetted = moveTargets.some(t => 
        t.isSettlement && t.ownerId !== null && t.ownerId !== currentPlayer.id &&
        friendlyFollowUpPotential.some(f => f.attacks.some((at: any) => at.q === t.coord.q && at.r === t.coord.r))
      );
      if (targetSettlementBeingNetted) score -= BASE_REWARD * COMBO_SEQUENCING_STAY_PUT_PENALTY;
    }

    if (!isMoveInPeril && tile.ownerId === null && 
       (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE)) {
      score += (BASE_REWARD * 30.0);
    }

    if (tile.terrain === TerrainType.MOUNTAIN && isSavingForMine) {
      const myIncome = mySettlements.reduce((sum, s) => sum + SETTLEMENT_INCOME[s.terrain as TerrainType], 0);
      const goldNextTurn = currentPlayer.gold + myIncome;
      const mineCost = _UPGRADE_COSTS[TerrainType.GOLD_MINE];
      if (goldNextTurn < mineCost) score -= (BASE_REWARD * 15.0); 
      else if (goldNextTurn >= mineCost) score += (BASE_REWARD * 20.0);
    }

    if (tile.ownerId === null && (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE)) {
      score += (SETTLEMENT_INCOME[tile.terrain as TerrainType] * HORIZON) + BASE_REWARD * IMMEDIATE_CAPTURE_BONUS; 
    }

    const potentialRange = getUnitRange({ ...unitToAct, coord: m }, state.board);

    if (!isMoveInPeril || isBarbarian || isUnitInPeril) {
      const perilSafety = new LoopSafety('evaluateMoves-peril', 100);
      let putsEnemyInPeril = false;
      let perilCount = 0;
      for (const target of moveTargets) {
        if (perilSafety.tick()) break;
        const dist = getDistance(m, target.coord);
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

    const nearbyVillages = mySettlements.filter(v => getDistance(v.coord, unitToAct.coord) <= 3);
    const isNearbyVillageInPeril = nearbyVillages.some(v => {
      const t = threatMatrix.get(`${v.coord.q},${v.coord.r}`);
      return t ? t.minTurns === 1 : false;
    });

    const friendlyAttackers = otherFriendlyUnits.filter(u => getDistance(u.coord, m) <= UNIT_STATS[u.type].range).length;
    const enemyAttackers = moveThreat ? moveThreat.attackerCount : 0;
    const eminentEnemyAttackers = moveThreat ? moveThreat.eminentAttackerCount : 0;
    const eminentLnaRatio = eminentEnemyAttackers > 0 ? friendlyAttackers / eminentEnemyAttackers : 5.0;

    if (eminentLnaRatio <= 1.0 && eminentEnemyAttackers > 0 && !isBarbarian) {
      score -= (BASE_REWARD * 5.0);
    }

    if (!isUnitInPeril && !isNearbyVillageInPeril) {
      const distFromCenter = getDistance(m, empireCenter);
      const currentDistFromCenter = getDistance(unitToAct.coord, empireCenter);
      if (distFromCenter > currentDistFromCenter) score += BASE_REWARD * EXPANSION_DISTANCE_BONUS;
      
      if (tile.terrain === TerrainType.PLAINS && (tile.ownerId === null || tile.ownerId === currentPlayer.id)) {
        score += BASE_REWARD * PLAINS_PRIORITY_BONUS;
        if (isSavingForVillage) score += BASE_REWARD * 10.0;
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
    const targetSafety = new LoopSafety('evaluateMoves-targets', 100);
    for (const target of moveTargets) {
      if (targetSafety.tick()) break;
      const dist = getDistance(m, target.coord);
      const currentDist = getDistance(unitToAct.coord, target.coord);
      
      if (dist < currentDist) {
        const turnsToReach = Math.ceil((dist - (target.isSettlement ? 0 : potentialRange)) / stats.moves) + 1;
        let targetScore = target.value / (turnsToReach + 1);

        if (target.isSettlement && target.ownerId !== null && target.ownerId !== currentPlayer.id) {
          const buddiesWhoCanNeutralize = friendlyFollowUpPotential.some(f => f.attacks.some((at: any) => at.q === target.coord.q && at.r === target.coord.r));
          if (buddiesWhoCanNeutralize) targetScore += BASE_REWARD * COMBO_FOLLOW_UP_CLAIMER_BONUS;
        }

        if (currentDist > dist) targetScore += BASE_REWARD * PATHING_CONSISTENCY_BONUS;

        const friendlyCloserToTarget = otherFriendlyUnits.filter(u => getDistance(u.coord, target.coord) < dist).length;
        let saturationPenalty = friendlyCloserToTarget >= 2 ? 0.6 : (friendlyCloserToTarget === 1 ? 0.9 : 1.0);
        if (isRich) saturationPenalty = Math.max(saturationPenalty, 0.95);
        targetScore *= saturationPenalty;

        if (unitToAct.type === UnitType.KNIGHT && target.isSettlement && target.ownerId === null) {
           targetScore += BASE_REWARD * KNIGHT_HARASSMENT_BONUS * (dist > 3 ? 2.0 : 1.0);
        }

        if (unitToAct.type === UnitType.CATAPULT && target.ownerId !== null && target.ownerId !== currentPlayer.id) {
            if (dist === 3 || dist === 4) targetScore += BASE_REWARD * 10.0;
            else if (dist < 3) targetScore -= BASE_REWARD * 5.0;
        }

        if (target.ownerId !== null && target.ownerId !== currentPlayer.id) {
          if (unitToAct.type === UnitType.INFANTRY && dist === 1) targetScore += BASE_REWARD * INFANTRY_FRONT_LINE_BONUS;
          else if (unitToAct.type === UnitType.ARCHER && dist === 2) targetScore += BASE_REWARD * ARCHER_PLACEMENT_BONUS;
          else if (unitToAct.type === UnitType.CATAPULT && dist === 3) targetScore += BASE_REWARD * CATAPULT_PLACEMENT_BONUS;
          else if (unitToAct.type === UnitType.KNIGHT && dist <= 4 && dist >= 2) targetScore += BASE_REWARD * KNIGHT_FLANK_BONUS;
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
        const d = getDistance(m, s.coord);
        if (d < minDistToSettlement) minDistToSettlement = d;
      }
      if (minDistToSettlement <= 2) score += BASE_REWARD * KNIGHT_FRIENDLY_SETTLEMENT_BONUS; 
    }

    if (unitToAct.type === UnitType.CATAPULT) {
      if (moveThreatLevel === 1 && !isBarbarian) score -= BASE_REWARD * CATAPULT_SAFETY_PENALTY_HIGH; 
      const siegeSafety = new LoopSafety('evaluateMoves-siege', 100);
      for (const target of moveTargets) {
        if (siegeSafety.tick()) break;
        if (target.isSettlement && target.ownerId !== null) {
          const d = getDistance(m, target.coord);
          if (d === potentialRange) score += BASE_REWARD * CATAPULT_SIEGE_POSITION_BONUS; 
          else if (d < potentialRange && d >= 2) score += BASE_REWARD * CATAPULT_SIEGE_PROXIMITY_BONUS; 
        }
      }
      if (eminentThreatBases.some(b => getDistance(m, b.coord) <= 3) && isStayPut) score += BASE_REWARD * CATAPULT_DEFENSIVE_STAY_PUT_BONUS; 
    }

    const isDefendingBase = eminentThreatBases.some(b => getDistance(m, b.coord) <= 2) || mySettlements.some(s => getDistance(m, s.coord) <= 2);
    if (isDefendingBase) {
      const nearestEnemy = state.units.find(u => u.ownerId !== currentPlayer.id && getDistance(m, u.coord) <= 3);
      if (nearestEnemy) {
        score += BASE_REWARD * DRIVE_OUT_BONUS;
        if (isCriticallyLaggingLargeEconomy) score += BASE_REWARD * DRIVE_OUT_BONUS * 2;
      } else {
        score += BASE_REWARD * DEFENSE_SCORING_BONUS;
      }
      if (isCriticallyLaggingLargeEconomy) score += BASE_REWARD * DEFENSE_SCORING_BONUS * 4;
    }

    const threatenedVillages = eminentThreatBases.filter(v => {
      const t = threatMatrix.get(`${v.coord.q},${v.coord.r}`);
      return t ? t.minTurns === 1 : false;
    });
    if (threatenedVillages.length > 0) {
      const sacrificeSafety = new LoopSafety('evaluateMoves-sacrifice', 100);
      for (const target of moveTargets) {
        if (sacrificeSafety.tick()) break;
        if (target.unitType !== undefined && getDistance(m, target.coord) <= potentialRange) {
          const isEnemyThreateningVillage = threatenedVillages.some(v => getDistance(target.coord, v.coord) <= getUnitRange({ type: target.unitType, coord: target.coord } as any, state.board));
          if (isEnemyThreateningVillage) {
            score += BASE_REWARD * SACRIFICE_BONUS; 
            if (isCriticallyLaggingLargeEconomy) score += BASE_REWARD * SACRIFICE_BONUS * 3;
          }
        }
      }
    }

    const coordinationSafety = new LoopSafety('evaluateMoves-coordination', 100);
    for (const target of moveTargets) {
      if (coordinationSafety.tick()) break;
      if (target.unitType !== undefined && getDistance(m, target.coord) <= potentialRange) {
        const isAlreadyInPeril = otherFriendlyUnits.some(u => getDistance(u.coord, target.coord) <= getUnitRange(u, state.board));
        if (isAlreadyInPeril) {
          let bonus = COORDINATION_BONUS;
          const isTargetThreateningMyBase = threatenedVillages.some(v => getDistance(target.coord, v.coord) <= getUnitRange({ type: target.unitType, coord: target.coord } as any, state.board));
          if (isTargetThreateningMyBase) bonus *= 2.0;
          score += BASE_REWARD * bonus; 
        }
      }
    }

    const influence = influenceMap.get(`${m.q},${m.r}`) || 0;
    const distToFriendlyBase = mySettlements.length > 0 ? Math.min(...mySettlements.map(s => getDistance(m, s.coord))) : Infinity;
    const distToEnemyBase = enemySettlements.length > 0 ? Math.min(...enemySettlements.map(s => getDistance(m, s.coord))) : Infinity;
    const distToNearestEnemyTarget = Math.min(distToEnemyBase, enemyUnitTargets.length > 0 ? Math.min(...enemyUnitTargets.map(u => getDistance(m, u.coord))) : Infinity);
    
    if (unitToAct.type !== UnitType.INFANTRY && !isBarbarian && distToNearestEnemyTarget !== Infinity) {
      if (distToNearestEnemyTarget > 4) score -= (distToNearestEnemyTarget * BASE_REWARD * 5.0);
      else score += BASE_REWARD * 10.0; 
    }

    if (distToFriendlyBase <= 3 && distToEnemyBase <= 4 && influence >= -20 && (friendlyAttackers / Math.max(1, enemyAttackers)) >= 1.0) {
      score += BASE_REWARD * 4.5;
    }
    
    const nearFriendCount = otherFriendlyUnits.filter(u => getDistance(m, u.coord) === 1).length;
    if (nearFriendCount > 0) score += BASE_REWARD * MUTUAL_SUPPORT_BONUS * nearFriendCount;

    const catAnchors = myCatapults.filter(u => u.id !== unitToAct.id);
    for (const cat of catAnchors) {
      const distToCat = getDistance(m, cat.coord);
      if (distToCat === 1) score += BASE_REWARD * FORMATION_ANCHOR_BONUS;
      else if (distToCat === 2) score += BASE_REWARD * FORMATION_ANCHOR_BONUS * 0.5;
    }

    const clusterSize = otherFriendlyUnits.filter(u => getDistance(m, u.coord) <= 2).length;
    score += clusterSize * SQUAD_INTEGRITY_BONUS * 10; 

    if (moveThreatLevel > 1 && nearFriendCount > 0) score += RALLY_POINT_ADJACENCY_BONUS;
    if (influence < -100 && !isBarbarian) score -= myValue * INFLUENCE_PENALTY_HIGH_RATIO; 
    else if (influence < -50 && !isBarbarian) score -= myValue * INFLUENCE_PENALTY_MED_RATIO; 
    else if (influence < 0) score += Math.abs(influence) * INFLUENCE_EXPANSION_BONUS; 
    else score += 5;

    if (hvt) {
      const distToHvt = getDistance(m, hvt.coord);
      const currentDistToHvt = getDistance(unitToAct.coord, hvt.coord);
      if (distToHvt < currentDistToHvt) score += (BASE_REWARD * HVT_PROXIMITY_BONUS_FACTOR) / (distToHvt + 1);
    }

    if (unitToAct.type === UnitType.INFANTRY || unitToAct.type === UnitType.KNIGHT) {
      const screeningSafety = new LoopSafety('evaluateMoves-screening', 100);
      for (const cat of myCatapults) {
        if (screeningSafety.tick()) break;
        const distToCat = getDistance(m, cat.coord);
        if (distToCat === 1) {
          const nearestEnemy = state.units.find(u => u.ownerId !== currentPlayer.id);
          if (nearestEnemy) {
            const catToEnemy = getDistance(cat.coord, nearestEnemy.coord);
            const meToEnemy = getDistance(m, nearestEnemy.coord);
            if (meToEnemy < catToEnemy) score += BASE_REWARD * SCREENING_BONUS;
          }
        }
      }
    }

    if (unitToAct.type === UnitType.CATAPULT && isStayPut) {
      const hasMeatShield = otherFriendlyUnits.some(u => (u.type === UnitType.INFANTRY || u.type === UnitType.KNIGHT) && getDistance(m, u.coord) === 1);
      if (!hasMeatShield) score += BASE_REWARD * CATAPULT_MEAT_SHIELD_BONUS;
    }

    const threat = threatMatrix.get(`${m.q},${m.r}`);
    if (!isBarbarian && threat) {
      const threatLevel = threat.minTurns;
      const eminentValue = threat.eminentThreatValue;
      const eminentCount = threat.eminentAttackerCount;
      let penaltyMult = threatenedVillages.length > 0 ? THREAT_PENALTY_SACRIFICE_MULT : 1.0;
      if (isUnitInPeril) penaltyMult *= 0.5; 

      if (threatLevel === 1) {
        const enemiesCoveringTile = state.units.filter(u => u.ownerId !== currentPlayer.id && getDistance(u.coord, m) <= getUnitRange(u, state.board));
        let maxSupportScore = -Infinity;
        for (const enemy of enemiesCoveringTile) {
          const alliesInRangeOfEnemy = otherFriendlyUnits.filter(u => getDistance(u.coord, enemy.coord) <= getUnitRange(u, state.board)).length;
          const enemiesInRangeOfEnemy = state.units.filter(u => u.ownerId !== currentPlayer.id && u.id !== enemy.id && getDistance(u.coord, enemy.coord) <= getUnitRange(u, state.board)).length;
          const supportScore = (alliesInRangeOfEnemy - enemiesInRangeOfEnemy) * SUPPORT_SCORE_MULT;
          if (supportScore > maxSupportScore) maxSupportScore = supportScore;
        }
        
        if (maxSupportScore <= 0 && !isBarbarian) score -= 10000;
        else score += Math.max(0, maxSupportScore);

        let bestTradeValue = 0;
        let hasImmediateGain = false;
        for (const target of moveTargets) {
          const distAfterMove = getDistance(m, target.coord);
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
          if (!otherFriendlyUnits.some(u => { const t = threatMatrix.get(`${u.coord.q},${u.coord.r}`); return t && t.minTurns === 1; })) score -= BASE_REWARD * KNIGHT_FIRST_IN_PENALTY;
        }
        
        if (eminentLnaRatio <= 1.1) penalty *= (eminentLnaRatio <= 1.0 ? 2.5 : 1.5) * (2.1 - eminentLnaRatio); 
        if (eminentCount >= 2 && bestTradeValue < BAIT_AND_TRADE_THRESHOLD) {
          penalty *= LETHAL_THREAT_PENALTY_MULT;
          if (eminentCount >= 4) penalty *= 1.5;
        }
        score -= penalty * penaltyMult;
      }
    }

    if (isUnitInPeril && !isStayPut && moveThreatLevel > 1) {
      score += BASE_REWARD * 2.0;
      if (tile.ownerId === null && (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE)) score += BASE_REWARD * OPPORTUNISTIC_RETREAT_SETTLEMENT_BONUS;
      else if (tile.terrain === TerrainType.PLAINS && tile.ownerId === null) score += BASE_REWARD * OPPORTUNISTIC_RETREAT_PLAINS_BONUS;
    }

    const isBuildablePlains = tile.terrain === TerrainType.PLAINS && (tile.ownerId === null || tile.ownerId === currentPlayer.id);
    const isBuildableMountain = tile.terrain === TerrainType.MOUNTAIN && (tile.ownerId === null || tile.ownerId === currentPlayer.id);

    if (isSavingForMine && isBuildableMountain) {
      score += UPGRADE_SAVING_MINE_BONUS;
      if (isStayPut) score += UPGRADE_SAVING_MINE_STAY_PUT_BONUS; 
    } else if (isSavingForVillage && isBuildablePlains) {
      let canBuildHere = true;
      if (unitToAct.type === UnitType.CATAPULT) {
        const nearestFriendlySettlementDist = mySettlements.length > 0 ? Math.min(...mySettlements.map(s => getDistance(m, s.coord))) : Infinity;
        canBuildHere = nearestFriendlySettlementDist >= 2;
      }
      if (canBuildHere) {
        score += UPGRADE_SAVING_VILLAGE_BONUS;
        if (isStayPut) score += UPGRADE_SAVING_VILLAGE_STAY_PUT_BONUS; 
        if (tile.ownerId === currentPlayer.id) score += INFILLING_BONUS;
      }
    } else {
      if (tile.terrain === TerrainType.FOREST) score += TERRAIN_FOREST_PENALTY;
      if (tile.terrain === TerrainType.MOUNTAIN) {
        score += TERRAIN_MOUNTAIN_BONUS;
        if (tile.ownerId === currentPlayer.id) score += INFILLING_BONUS;
      }
      if (tile.terrain === TerrainType.PLAINS) {
        score += (tile.ownerId === null) ? TERRAIN_PLAINS_NEUTRAL_BONUS : TERRAIN_PLAINS_OWNED_BONUS;
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

    if (score > maxScore) {
      maxScore = score;
      bestMove = m;
    }
  }

  if (bestMove.q === unitToAct.coord.q && bestMove.r === unitToAct.coord.r) {
    const anyAttacks = getValidAttacks(unitToAct, state.board, state.units);
    if (anyAttacks.length > 0) {
      let bestTarget = anyAttacks[0];
      let maxVal = -1;
      for (const a of anyAttacks) {
        const targetUnit = unitsMap.get(`${a.q},${a.r}`);
        const targetTile = boardMap.get(`${a.q},${a.r}`);
        let val = 0;
        if (targetUnit) val = UNIT_STATS[targetUnit.type].cost;
        else if (targetTile) val = SETTLEMENT_INCOME[targetTile.terrain as TerrainType] * HORIZON;
        
        if (val > maxVal) {
          maxVal = val;
          bestTarget = a;
        }
      }
      return { type: 'attack' as const, payload: { unitId: unitToAct.id, target: bestTarget } };
    }
    return { type: 'skipUnit' as const, payload: { unitId: unitToAct.id } };
  }

  return { type: 'move' as const, payload: { unitId: unitToAct.id, target: bestMove } };
}
