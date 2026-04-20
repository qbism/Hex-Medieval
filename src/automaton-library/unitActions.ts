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
} from '../types';
import { getValidAttacks, getValidMoves, getUnitRange } from '../gameEngine';
import { findNearestTarget as _findNearestTarget, getChokepointScore as _getChokepointScore } from './utils';
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
  FRONT_LINE_BONUS,
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
} from './constants';
import { LoopSafety } from '../utils';
import { ThreatInfo } from './threatAnalysis';

/**
 * getUnitAction: The core decision-making engine for individual unit tactics.
 * 
 * Logic Layers:
 * 1. Global Strategy (Stances): Dynamic Strategic Aggression based on game state.
 *    - STEAMROLLER: Aggressive offensive when dominating.
 *    - ELITE CHESS: High-precision risk aversion (Default).
 *    - SURVIVAL PACT: Underdog alliance/King-Slayer focusing when failing.
 * 2. Tactical Evaluation:
 *    - Numerical Safety: Ensures local support superiority (N+1 rule).
 *    - HVT Guard: Prevents Queen-vs-Pawn trades for expensive units.
 *    - Synergy Moves: Combination attacks and settlement clearing.
 * 3. Movement & Retreat:
 *    - Opportunistic Retreat: Defensive moves that preserve expansion potential.
 *    - Leapfrog Expansion: Intelligent positioning for village construction.
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
  isBarbarian: boolean = false,
  cachedData: any = {}
) {
  const myUnits = state.units.filter(u => u.ownerId === currentPlayer.id && !u.hasActed);
  const unitToAct = myUnits[0];
  
  if (!unitToAct) return null;

  // Pre-calculate maps and lists for O(1) lookups and efficient filtering
  if (!cachedData.unitsMap) {
    cachedData.unitsMap = new Map<string, Unit>();
    state.units.forEach(u => cachedData.unitsMap.set(`${u.coord.q},${u.coord.r}`, u));
  }
  const unitsMap = cachedData.unitsMap;
  
  if (!cachedData.boardMap) {
    cachedData.boardMap = new Map<string, any>();
    state.board.forEach(t => cachedData.boardMap.set(`${t.coord.q},${t.coord.r}`, t));
  }
  const boardMap = cachedData.boardMap;
  
  const mySettlements = state.board.filter(t => 
    t.ownerId === currentPlayer.id && 
    (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
  );

  const enemySettlements = state.board.filter(t => 
    t.ownerId !== null && t.ownerId !== currentPlayer.id && 
    (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
  );

  const myCatapults = state.units.filter(u => u.ownerId === currentPlayer.id && u.type === UnitType.CATAPULT);
  const otherFriendlyUnits = state.units.filter(u => u.ownerId === currentPlayer.id && u.id !== unitToAct.id);
  const otherFriendlyUnitsThatHaventActed = otherFriendlyUnits.filter(u => !u.hasActed);

  // Pre-calculate which hexes other units can reach or attack this turn
  const friendlyFollowUpPotential = otherFriendlyUnitsThatHaventActed.map(u => {
    return {
      id: u.id,
      type: u.type,
      moves: getValidMoves(u, state.board, state.units),
      attacks: getValidAttacks(u, state.board, state.units, true)
    };
  });

  const stats = UNIT_STATS[unitToAct.type];
  const myValue = stats.cost;

  // Global Aggression Calculation: How aggressive should the AI be based on the game state?
  if (!cachedData.globalAggression) {
    const myUnitsCount = state.units.filter(u => u.ownerId === currentPlayer.id).length;
    const enemyUnitsCount = state.units.filter(u => u.ownerId !== currentPlayer.id).length;
    const globalUnitRatio = enemyUnitsCount > 0 ? myUnitsCount / enemyUnitsCount : 10.0;
    
    // High income / gold reserves allow for more aggression
    const myIncome = mySettlements.reduce((sum, s) => sum + SETTLEMENT_INCOME[s.terrain as TerrainType], 0);
    const isRich = currentPlayer.gold > 500 || myIncome > 200;
    
    // "Aggressive Stance" triggers when we outnumber the enemy decisively and have strong backing.
    let aggression = 1.0;
    if (globalUnitRatio >= 2.0 && isRich) {
       aggression = 2.0; 
    } else if (globalUnitRatio >= 1.5) {
       aggression = 1.3;
    }
    
    cachedData.globalAggression = aggression;
    cachedData.globalUnitRatio = globalUnitRatio;
    cachedData.isRich = isRich;
  }
  const globalAggression = cachedData.globalAggression;
  const globalUnitRatio = cachedData.globalUnitRatio;
  const isRich = cachedData.isRich;

  const unitCurrentThreat = threatMatrix.get(`${unitToAct.coord.q},${unitToAct.coord.r}`);
  const isUnitInPeril = unitCurrentThreat ? unitCurrentThreat.minTurns === 1 : false;

  // 1. Evaluate Attacks
  const attacks = getValidAttacks(unitToAct, state.board, state.units);
  if (attacks.length > 0) {
    let bestAttack = attacks[0];
    let maxPriority = -Infinity;

    const attackSafety = new LoopSafety('getUnitAction-attacks-economic', 1000);
    for (const a of attacks) {
      if (attackSafety.tick()) break;
      
      const coordKey = `${a.q},${a.r}`;
      const targetUnit = unitsMap.get(coordKey);
      const targetTile = boardMap.get(coordKey);

      let priority = 0;

      if (targetUnit) {
        const targetValue = UNIT_STATS[targetUnit.type].cost;
        
        priority = targetValue;
        
        // Focus Fire Bonus: If other friendly units can also attack this target
        const potentialAttackers = otherFriendlyUnits.filter(u => {
          if (u.hasActed) return false;
          const dist = getDistance(u.coord, targetUnit.coord);
          return dist <= getUnitRange(u, state.board);
        });
        
        if (potentialAttackers.length > 0) {
          priority += BASE_REWARD * FOCUS_FIRE_BONUS * potentialAttackers.length;
        }

        // Kill Priority: Extra bonus if we can likely kill it
        if (potentialAttackers.length >= 1) {
          priority += BASE_REWARD * KILL_PRIORITY_BONUS;
        }
        
        // Peril Counter-Attack Bonus: If we are in peril, we prefer to attack rather than run
        if (isUnitInPeril && !isBarbarian) {
          priority += BASE_REWARD * 10.0; // Increased bonus to prefer attacking over moving
          
          // Extra bonus if the target is actually one of the units threatening us
          const targetThreatRadius = UNIT_STATS[targetUnit.type].moves + getUnitRange(targetUnit, state.board);
          if (getDistance(unitToAct.coord, targetUnit.coord) <= targetThreatRadius) {
            priority += BASE_REWARD * 5.0;
          }
        }

        // High Value Target (HVT) Bonus
        if (hvt && targetUnit.id === hvt.id) {
          priority += BASE_REWARD * 3.0;
        }

        // Strategic Bonuses
        if (targetUnit.type === UnitType.CATAPULT) priority += BASE_REWARD * 1.0;
        if (focusOnLeader && targetUnit.ownerId === leaderId) priority += BASE_REWARD * 0.5;

        // Trade / Suicide Evaluation (Chess-like 1-hit kill awareness)
        // If we are currently in peril, calculate if attacking this target is actually a terrible trade.
        if (unitCurrentThreat && !isBarbarian) {
           const targetThreatRadius = UNIT_STATS[targetUnit.type].moves + getUnitRange(targetUnit, state.board);
           const isTargetThreateningUs = getDistance(unitToAct.coord, targetUnit.coord) <= targetThreatRadius;
           // If there are other units threatening us besides the one we are shooting...
           const willDieAnyway = unitCurrentThreat.eminentAttackerCount > (isTargetThreateningUs ? 1 : 0);
           
           if (willDieAnyway) {
              const netValue = targetValue - myValue; // e.g. 10 - 30 = -20
              if (netValue < 0) {
                 // It's a bad trade and we will die next turn anyway. 
                 // Heavily penalize this attack so the unit considers running away instead!
                 priority -= Math.abs(netValue) * 3.0; // Pushes priority deep into the negatives
              } else {
                 priority += BASE_REWARD * 1.0; // It's a good/equal trade, take them down with us!
              }
           }
        }

        // Combination Move Setup: Clearing unit on settlement
        const isOnSettlement = targetTile && (targetTile.terrain === TerrainType.VILLAGE || targetTile.terrain === TerrainType.FORTRESS || targetTile.terrain === TerrainType.CASTLE || targetTile.terrain === TerrainType.GOLD_MINE);
        if (isOnSettlement) {
          const canBuddiesNeutralize = friendlyFollowUpPotential.some(f => f.attacks.some(at => at.q === targetTile.coord.q && at.r === targetTile.coord.r));
          
          // Approximate claiming capability through distance, instead of f.moves which ignores enemy settlements
          const canBuddiesClaim = otherFriendlyUnits.some(f => {
            if (f.hasActed) return false;
            return getDistance(f.coord, targetTile.coord) <= UNIT_STATS[f.type].moves;
          });

          if (canBuddiesNeutralize && canBuddiesClaim && targetTile.ownerId !== currentPlayer.id) {
            priority += BASE_REWARD * COMBO_FOLLOW_UP_NEUTRALIZER_BONUS;
          }
        }
        
        // Infantry Vanguard Bonus: Extra bonus for attacking units on settlements
        if (unitToAct.type === UnitType.INFANTRY && isOnSettlement) {
           priority += BASE_REWARD * INFANTRY_VANGUARD_SETTLEMENT_BONUS;
        }

        // Defense Bonus
        const isThreateningBase = eminentThreatBases.some(b => getDistance(a, b.coord) <= 3);
        if (isThreateningBase) priority += BASE_REWARD * PREEMPTIVE_DEFENSE_BONUS;

        // Drive Out Bonus: Specifically target units that are near our settlements
        const isNearOurSettlement = mySettlements.some(s => getDistance(a, s.coord) <= 2);
        if (isNearOurSettlement) priority += BASE_REWARD * DRIVE_OUT_BONUS;

        // Counterattack Bonus
        const isOccupyingMySettlement = targetTile && targetTile.ownerId === currentPlayer.id && (targetTile.terrain === TerrainType.VILLAGE || targetTile.terrain === TerrainType.FORTRESS || targetTile.terrain === TerrainType.CASTLE || targetTile.terrain === TerrainType.GOLD_MINE);
        if (isOccupyingMySettlement) priority += BASE_REWARD * 2.0;

      } else if (targetTile && targetTile.ownerId !== null && targetTile.ownerId !== currentPlayer.id && (targetTile.terrain === TerrainType.VILLAGE || targetTile.terrain === TerrainType.FORTRESS || targetTile.terrain === TerrainType.CASTLE || targetTile.terrain === TerrainType.GOLD_MINE)) {
        // Attacking an empty settlement (must be owned by an enemy)
        const settlementValue = SETTLEMENT_INCOME[targetTile.terrain] * HORIZON;
        priority = settlementValue * 1.5 + BASE_REWARD * 4.0; // High priority for capturing empty enemy settlements
        
        // Settlement Degradation Priority: Prioritize attacking settlements that anchor enemy units
        const enemyUnitsNearThisSettlement = state.units.filter(u => u.ownerId === targetTile.ownerId && getDistance(u.coord, targetTile.coord) <= UNIT_STATS[u.type].moves);
        if (enemyUnitsNearThisSettlement.length > 0) {
          priority += BASE_REWARD * SETTLEMENT_DEGRADATION_PRIORITY_BONUS;
        }

        // Combination Move Setup: Demoting village for a buddy to claim
        // Since getValidMoves excludes enemy settlements, we approximate buddy reach by checking raw distance
        const canBuddiesClaim = otherFriendlyUnits.some(f => {
            if (f.hasActed) return false;
            // Can the buddy reach this tile with its movement speed?
            return getDistance(f.coord, targetTile.coord) <= UNIT_STATS[f.type].moves;
        });
        
        // If it's currently a Village, it will become Neutral, meaning the buddy can actually claim it.
        if (canBuddiesClaim && targetTile.terrain === TerrainType.VILLAGE) {
          priority += BASE_REWARD * COMBO_FOLLOW_UP_CLAIMER_BONUS;
        } else if (canBuddiesClaim) {
          // If it's a Castle/Fortress, we are setting up a multi-turn siege.
          priority += BASE_REWARD * (COMBO_FOLLOW_UP_CLAIMER_BONUS * 0.5);
        }

        // Barbarian Pillage Logic: Prioritize attacking structures over units to disrupt income
        if (isBarbarian) {
          priority += BASE_REWARD * PILLAGE_SCORE_BONUS;
        }

        // Peril Bonus: If we are in peril, we prefer to capture a settlement rather than run
        if (isUnitInPeril && !isBarbarian) {
          priority += BASE_REWARD * 5.0;
        }

        if (focusOnLeader && targetTile.ownerId === leaderId) priority += BASE_REWARD * 1.0;
      }

      if (priority > maxPriority) {
        maxPriority = priority;
        bestAttack = a;
      }
    }

    // Execute the attack if it is deemed profitable or we are at the front
    // We only skip the attack if maxPriority is deep in the negative (suicide trade)
    // AND we have a movement phase coming up that might find a better option.
    if (maxPriority > -100 || (isBarbarian && attacks.length > 0)) {
      return { type: 'attack' as const, payload: { unitId: unitToAct.id, target: bestAttack } };
    }
  }

    // 2. Evaluate Moves
    const moves = getValidMoves(unitToAct, state.board, state.units);
    moves.push(unitToAct.coord); // Staying put is an option
    
    if (moves.length > 0) {
      let bestMove = moves[0];
      let maxScore = -Infinity;
  
      const moveSafety = new LoopSafety('getAutomatonBestAction-moves-economic', 5000);
      
      // Potential move targets
      if (!cachedData.settlementTargets) {
        cachedData.settlementTargets = state.board.filter(t => 
          (t.ownerId === null || t.ownerId !== currentPlayer.id) && 
          (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
        ).map(t => ({ coord: t.coord, value: SETTLEMENT_INCOME[t.terrain] * HORIZON, isExpansionHub: false, isSettlement: true, ownerId: t.ownerId, unitType: undefined }));
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
       .slice(0, 10); // Limit to top 10

    for (const m of moves) {
      if (moveSafety.tick()) break;
      
      let score = 0;
      const tile = boardMap.get(`${m.q},${m.r}`)!;
      const isStayPut = m.q === unitToAct.coord.q && m.r === unitToAct.coord.r;
      
      const moveThreat = threatMatrix.get(`${m.q},${m.r}`);
      const moveThreatLevel = moveThreat ? moveThreat.minTurns : Infinity;
      const isMoveInPeril = moveThreatLevel === 1;

      // Stay Put Bias: Avoid jittery movement if there's no clear benefit to moving
      if (isStayPut) {
        score += BASE_REWARD * STAY_PUT_BIAS;

        // Supply Edge Bonus: If we are at the very edge of our supply line on a plains tile,
        // and we want to expand further, stay put to signal village building.
        const minDistToMySettlement = mySettlements.length > 0 ? Math.min(...mySettlements.map(s => getDistance(m, s.coord))) : 0;
        if (minDistToMySettlement >= stats.moves && tile.terrain === TerrainType.PLAINS && tile.ownerId === null) {
          score += BASE_REWARD * 10.0;
        }

        // NEW: If staying put allows an attack, give it a massive score boost
        const fallbackAttacks = getValidAttacks(unitToAct, state.board, state.units);
        if (fallbackAttacks.length > 0) {
          score += 200; // Strong incentive to stay and fight
        }

        // Combo Sequencing: If we stay put while buddies are ready to sweep an enemy settlement, penalize to encourage moving up
        const targetSettlementBeingNetted = moveTargets.some(t => 
          t.isSettlement && t.ownerId !== null && t.ownerId !== currentPlayer.id &&
          friendlyFollowUpPotential.some(f => f.attacks.some(at => at.q === t.coord.q && at.r === t.coord.r))
        );
        if (targetSettlementBeingNetted) {
          score -= BASE_REWARD * COMBO_SEQUENCING_STAY_PUT_PENALTY;
        }
      }

      // Immediate Capture Bonus
      if (tile.ownerId === null && (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE)) {
        score += (SETTLEMENT_INCOME[tile.terrain] * HORIZON) + BASE_REWARD * IMMEDIATE_CAPTURE_BONUS; 
      }

      // 1. Put enemies in peril: If we can move to within attack range of an enemy unit or village in one turn, 
      // AND it won't place our unit into peril, then do it.
      const potentialRange = getUnitRange({ ...unitToAct, coord: m }, state.board);

      if (!isMoveInPeril || isBarbarian || isUnitInPeril) {
        const perilSafety = new LoopSafety('getUnitAction-peril', 100);
        let putsEnemyInPeril = false;
        for (const target of moveTargets) {
          if (perilSafety.tick()) break;
          const dist = getDistance(m, target.coord);
          if (dist <= potentialRange) {
            score += BASE_REWARD * PUT_ENEMY_IN_PERIL_BONUS; // High bonus for putting enemy in peril
            putsEnemyInPeril = true;
            
            // Counter-Attack Bonus: If we are already in peril, but this move turns the tide
            if (isUnitInPeril) {
              score += BASE_REWARD * COUNTER_ATTACK_BONUS;
            }
          }
        }

        // Strategic Movement: Unclaimed Village Priority
        // If an AI unit is going to move to an unoccupied tile that is not in peril 
        // or does not provide the advantage of putting an enemy in peril the 1st choice by far: unclaimed village
        if (!isMoveInPeril && !putsEnemyInPeril && !isBarbarian) {
          if (tile.ownerId === null && tile.terrain === TerrainType.VILLAGE) {
            score += BASE_REWARD * UNCLAIMED_VILLAGE_PRIORITY_BONUS;
          }
        }
      }

      // 2. Empire expansion: If a unit and any nearby villages are not in peril, 
      const nearbyVillages = mySettlements.filter(v => getDistance(v.coord, unitToAct.coord) <= 3);
      const isNearbyVillageInPeril = nearbyVillages.some(v => {
        const t = threatMatrix.get(`${v.coord.q},${v.coord.r}`);
        return t ? t.minTurns === 1 : false;
      });

      // Local Numerical Advantage (LNA) Check
      // Calculate how many friendly units can hit this tile vs how many enemies
      const friendlyAttackers = otherFriendlyUnits.filter(u => getDistance(u.coord, m) <= UNIT_STATS[u.type].range).length + 1;
      const enemyAttackers = moveThreat ? moveThreat.attackerCount : 0;
      const eminentEnemyAttackers = moveThreat ? moveThreat.eminentAttackerCount : 0;
      
      const lnaRatio = enemyAttackers > 0 ? friendlyAttackers / enemyAttackers : 5.0;
      const eminentLnaRatio = eminentEnemyAttackers > 0 ? friendlyAttackers / eminentEnemyAttackers : 5.0;

      // Numerical Safety Penalty: In a one-hit-kill game, having even numbers (1:1) is often suicide 
      // if you are the one stepping into the fire.
      if (eminentLnaRatio <= 1.0 && eminentEnemyAttackers > 0 && !isBarbarian) {
        score -= (BASE_REWARD * 5.0); // Significant penalty for non-superiority in danger
      }

      if (!isUnitInPeril && !isNearbyVillageInPeril) {
        const distFromCenter = getDistance(m, empireCenter);
        const currentDistFromCenter = getDistance(unitToAct.coord, empireCenter);
        if (distFromCenter > currentDistFromCenter) {
          score += BASE_REWARD * EXPANSION_DISTANCE_BONUS; // Move away from center
        }
        
        if (tile.terrain === TerrainType.PLAINS && (tile.ownerId === null || tile.ownerId === currentPlayer.id)) {
          score += BASE_REWARD * PLAINS_PRIORITY_BONUS; // Prioritize plains for building villages
          
          // Extra push for plains if we are specifically saving for a village
          if (isSavingForVillage) {
            score += BASE_REWARD * 10.0;
          }

          if (!isMoveInPeril) {
            const neighbors = _getNeighbors(m);
            let isAdjacentToPeril = false;
            for (const n of neighbors) {
              const nKey = `${n.q},${n.r}`;
              const nThreat = threatMatrix.get(nKey);
              if (nThreat && nThreat.eminentAttackerCount > 0) {
                isAdjacentToPeril = true;
                break;
              }
            }
            if (isAdjacentToPeril) {
              score += BASE_REWARD * EDGE_OF_PERIL_BONUS;
            }
          }
        }
      }

      // Evaluate proximity to all targets - use non-additive scoring with decay
      let maxTargetScore = 0;
      let otherTargetsScore = 0;
      
      const targetSafety = new LoopSafety('getUnitAction-moveTargets', 100);
      for (const target of moveTargets) {
        if (targetSafety.tick()) break;
        const dist = getDistance(m, target.coord);
        const currentDist = getDistance(unitToAct.coord, target.coord);
        
        if (dist < currentDist) {
          // Moving closer to a target
          // ROI = Value / turnsToReach
          const turnsToReach = Math.ceil((dist - (target.isSettlement ? 0 : potentialRange)) / stats.moves) + 1;
          let targetScore = target.value / (turnsToReach + 1);

          // Combination Move Setup: Rush towards settlements that buddies are about to neutralize
          if (target.isSettlement && target.ownerId !== null && target.ownerId !== currentPlayer.id) {
            const buddiesWhoCanNeutralize = friendlyFollowUpPotential.some(f => f.attacks.some(at => at.q === target.coord.q && at.r === target.coord.r));
            if (buddiesWhoCanNeutralize) {
              targetScore += BASE_REWARD * COMBO_FOLLOW_UP_CLAIMER_BONUS;
            }
          }

          // Pathing Consistency: If we're already moving towards this target, give a bonus
          // This helps units stick to a path rather than deviating for minor terrain bonuses
          if (currentDist > dist) {
            targetScore += BASE_REWARD * PATHING_CONSISTENCY_BONUS;
          }

          // Target Saturation Penalty: If multiple friendly units are already closer to this target, 
          // reduce the score to encourage this unit to find its own front.
          const friendlyCloserToTarget = otherFriendlyUnits.filter(u => getDistance(u.coord, target.coord) < dist).length;
          if (friendlyCloserToTarget >= 2) {
            targetScore *= 0.6; // Heavy penalty for dogpiling
          } else if (friendlyCloserToTarget === 1) {
            targetScore *= 0.9;
          }

          // Knight Distant Claim Bonus: Knights explicitly prioritize traversing to neutral villages
          if (unitToAct.type === UnitType.KNIGHT && target.isSettlement && target.ownerId === null) {
             targetScore += BASE_REWARD * KNIGHT_HARASSMENT_BONUS * (dist > 3 ? 2.0 : 1.0);
          }

          // Catapult Threat/Siege range preference
          if (unitToAct.type === UnitType.CATAPULT && target.ownerId !== null && target.ownerId !== currentPlayer.id) {
              if (dist === 3 || dist === 4) {
                 targetScore += BASE_REWARD * 10.0; // Ideal trajectory
              } else if (dist < 3) {
                 targetScore -= BASE_REWARD * 5.0; // Catapult is getting too close!
              }
          }

          if (targetScore > maxTargetScore) {
            otherTargetsScore += maxTargetScore * 0.2; // Decay previous max
            maxTargetScore = targetScore;
          } else {
            otherTargetsScore += targetScore * 0.2; // Decay this target
          }
        }
      }
      score += maxTargetScore + otherTargetsScore;

      // Knight Safety Logic: If in danger, prioritize moving to safety
      const currentThreat = threatMatrix.get(`${unitToAct.coord.q},${unitToAct.coord.r}`);
      const currentThreatLevel = currentThreat ? currentThreat.minTurns : Infinity;
      if (unitToAct.type === UnitType.KNIGHT && currentThreatLevel === 1 && !isBarbarian) {
        const moveThreat = threatMatrix.get(`${m.q},${m.r}`);
        const moveThreatLevel = moveThreat ? moveThreat.minTurns : Infinity;
        if (moveThreatLevel > 1) {
          score += BASE_REWARD * KNIGHT_SAFETY_BONUS; 
        }
        
        // Bonus for moving towards friendly settlements when in danger
        let minDistToSettlement = Infinity;
        for (const s of mySettlements) {
          const d = getDistance(m, s.coord);
          if (d < minDistToSettlement) minDistToSettlement = d;
        }
        if (minDistToSettlement <= 2) {
          score += BASE_REWARD * KNIGHT_FRIENDLY_SETTLEMENT_BONUS; 
        }
      }

      // Catapult Specific Movement Logic
      if (unitToAct.type === UnitType.CATAPULT) {
        const moveThreat = threatMatrix.get(`${m.q},${m.r}`);
        const moveThreatLevel = moveThreat ? moveThreat.minTurns : Infinity;
        
        // Catapults MUST stay safe. They are too slow to escape once engaged.
        if (moveThreatLevel === 1 && !isBarbarian) {
          score -= BASE_REWARD * CATAPULT_SAFETY_PENALTY_HIGH; 
        }

        // Siege positioning: Prefer being exactly at max range from an enemy settlement
        const siegeSafety = new LoopSafety('getUnitAction-siege', 100);
        for (const target of moveTargets) {
          if (siegeSafety.tick()) break;
          if (target.isSettlement && target.ownerId !== null) {
            const d = getDistance(m, target.coord);
            if (d === potentialRange) {
              score += BASE_REWARD * CATAPULT_SIEGE_POSITION_BONUS; 
            } else if (d < potentialRange && d >= 2) {
              score += BASE_REWARD * CATAPULT_SIEGE_PROXIMITY_BONUS; 
            }
          }
        }

        // Defensive positioning: If near a threatened base, stay put if we have a good shot
        const isNearThreatenedBase = eminentThreatBases.some(b => getDistance(m, b.coord) <= 3);
        if (isNearThreatenedBase && isStayPut) {
          score += BASE_REWARD * CATAPULT_DEFENSIVE_STAY_PUT_BONUS; 
        }
      }

      // Defense Scoring
      const isDefendingBase = eminentThreatBases.some(b => getDistance(m, b.coord) <= 2) || mySettlements.some(s => getDistance(m, s.coord) <= 2);
      if (isDefendingBase) {
        // Boost score if there's actually an enemy nearby that we're reacting to
        const nearestEnemy = state.units.find(u => u.ownerId !== currentPlayer.id && getDistance(m, u.coord) <= 3);
        if (nearestEnemy) {
          score += BASE_REWARD * DRIVE_OUT_BONUS;
        } else {
          score += BASE_REWARD * DEFENSE_SCORING_BONUS;
        }
      }

      // Sacrifice Logic: If a village is in peril, a unit should move to a position that either blocks the enemy 
      // or puts the enemy in peril, even if the unit itself enters peril.
      const threatenedVillages = eminentThreatBases.filter(v => {
        const t = threatMatrix.get(`${v.coord.q},${v.coord.r}`);
        return t ? t.minTurns === 1 : false;
      });
      if (threatenedVillages.length > 0) {
        const sacrificeSafety = new LoopSafety('getUnitAction-sacrifice', 100);
        for (const target of moveTargets) {
          if (sacrificeSafety.tick()) break;
          if (target.unitType !== undefined && getDistance(m, target.coord) <= potentialRange) {
            // This move puts an enemy in range. Is that enemy threatening a village?
            const isEnemyThreateningVillage = threatenedVillages.some(v => getDistance(target.coord, v.coord) <= getUnitRange({ type: target.unitType, coord: target.coord } as any, state.board));
            if (isEnemyThreateningVillage) {
              score += BASE_REWARD * SACRIFICE_BONUS; // Huge sacrifice bonus!
            }
          }
        }
      }

      // Pair Coordination: If an enemy unit is already in peril from another friendly unit, 
      // and this move also puts it in peril, give a bonus.
      const coordinationSafety = new LoopSafety('getUnitAction-coordination', 100);

      for (const target of moveTargets) {
        if (coordinationSafety.tick()) break;
        if (target.unitType !== undefined && getDistance(m, target.coord) <= potentialRange) {
          const isAlreadyInPeril = otherFriendlyUnits.some(u => getDistance(u.coord, target.coord) <= getUnitRange(u, state.board));
          if (isAlreadyInPeril) {
            let bonus = COORDINATION_BONUS;
            // Enhanced Coordination: If the target is threatening a friendly settlement, increase bonus
            const isTargetThreateningMyBase = threatenedVillages.some(v => getDistance(target.coord, v.coord) <= getUnitRange({ type: target.unitType, coord: target.coord } as any, state.board));
            if (isTargetThreateningMyBase) {
              bonus *= 2.0;
            }
            score += BASE_REWARD * bonus; 
          }
        }
      }

      // Influence Scoring (Potential Fields)
      const influence = influenceMap.get(`${m.q},${m.r}`) || 0;

      // Front Line Positioning: Recognize "fronts" between friendly and enemy settlements
      const distToFriendlyBase = mySettlements.length > 0 ? Math.min(...mySettlements.map(s => getDistance(m, s.coord))) : Infinity;
      const distToEnemyBase = enemySettlements.length > 0 ? Math.min(...enemySettlements.map(s => getDistance(m, s.coord))) : Infinity;
      const distToNearestEnemyTarget = Math.min(
        distToEnemyBase, 
        enemyUnitTargets.length > 0 ? Math.min(...enemyUnitTargets.map(u => getDistance(m, u.coord))) : Infinity
      );
      
      // User Directive: Non-Infantry should move towards edges of the kingdom near enemy kingdoms
      if (unitToAct.type !== UnitType.INFANTRY && !isBarbarian && distToNearestEnemyTarget !== Infinity) {
        if (distToNearestEnemyTarget > 4) {
          // Push non-infantry out of the peaceful inner kingdom
          score -= (distToNearestEnemyTarget * BASE_REWARD * 5.0);
        } else {
          // Explicit edge/frontline magnet
          score += BASE_REWARD * 10.0; 
        }
      }

      // A "front line" tile is one that is close to both a friendly and an enemy base
      if (distToFriendlyBase <= 3 && distToEnemyBase <= 4) {
        // Only take the front line bonus if we have at least neutral influence and decent LNA
        if (influence >= -20 && lnaRatio >= 1.0) {
          score += BASE_REWARD * FRONT_LINE_BONUS;
        }
      }
      
      // Mutual Support Bonus: AI likes to stay near other friendly units
      const isNearFriend = otherFriendlyUnits.some(u => getDistance(m, u.coord) === 1);
      if (isNearFriend) {
        score += BASE_REWARD * MUTUAL_SUPPORT_BONUS;
      }

      // Rally Point Heuristic: Clumping in safe zones
      if (moveThreatLevel > 1 && isNearFriend) {
        score += RALLY_POINT_ADJACENCY_BONUS;
      }

      if (influence < -100 && !isBarbarian) {
        score -= myValue * INFLUENCE_PENALTY_HIGH_RATIO; 
      } else if (influence < -50 && !isBarbarian) {
        score -= myValue * INFLUENCE_PENALTY_MED_RATIO; 
      } else if (influence < 0) {
        score += Math.abs(influence) * INFLUENCE_EXPANSION_BONUS; 
      } else {
        score += 5; // General expansion
      }

      // HVT Proximity Bonus
      if (hvt) {
        const distToHvt = getDistance(m, hvt.coord);
        const currentDistToHvt = getDistance(unitToAct.coord, hvt.coord);
        if (distToHvt < currentDistToHvt) {
          score += (BASE_REWARD * HVT_PROXIMITY_BONUS_FACTOR) / (distToHvt + 1);
        }
      }

      // Body-Blocking / Screening Bonus
      if (unitToAct.type === UnitType.INFANTRY || unitToAct.type === UnitType.KNIGHT) {
        const screeningSafety = new LoopSafety('getUnitAction-screening', 100);
        for (const cat of myCatapults) {
          if (screeningSafety.tick()) break;
          const distToCat = getDistance(m, cat.coord);
          if (distToCat === 1) {
            // We are adjacent to a catapult. Check if we are between it and an enemy.
            const nearestEnemy = state.units.find(u => u.ownerId !== currentPlayer.id); // Simplified: just check nearest
            if (nearestEnemy) {
              const catToEnemy = getDistance(cat.coord, nearestEnemy.coord);
              const meToEnemy = getDistance(m, nearestEnemy.coord);
              if (meToEnemy < catToEnemy) {
                score += BASE_REWARD * SCREENING_BONUS; // Screening bonus!
              }
            }
          }
        }
      }

      // Catapult Meat Shield Logic
      if (unitToAct.type === UnitType.CATAPULT && isStayPut) {
        const hasMeatShield = otherFriendlyUnits.some(u => 
          (u.type === UnitType.INFANTRY || u.type === UnitType.KNIGHT) && 
          getDistance(m, u.coord) === 1
        );
        if (!hasMeatShield) {
          score += BASE_REWARD * CATAPULT_MEAT_SHIELD_BONUS; // Stay put if unprotected
        }
      }

      // Threat Penalty
      const threat = threatMatrix.get(`${m.q},${m.r}`);
      if (!isBarbarian && threat) {
        const threatLevel = threat.minTurns;
        const eminentValue = threat.eminentThreatValue;
        const eminentCount = threat.eminentAttackerCount;
        
        let penaltyMult = 1.0;
        // Reduce penalty if we are defending a village (Sacrifice)
        if (threatenedVillages.length > 0) {
          penaltyMult = THREAT_PENALTY_SACRIFICE_MULT;
        }

        // Desperation: If we are already in peril, we are more willing to move into other peril 
        // if it means we can do something useful (like counter-attacking or blocking)
        if (isUnitInPeril) {
          penaltyMult *= 0.5; 
        }

        if (threatLevel === 1) {
          // Local Superiority Check
          const enemiesCoveringTile = state.units.filter(u => u.ownerId !== currentPlayer.id && getDistance(u.coord, m) <= getUnitRange(u, state.board));
          
          let maxSupportScore = -Infinity;
          for (const enemy of enemiesCoveringTile) {
            const alliesInRangeOfEnemy = otherFriendlyUnits.filter(u => getDistance(u.coord, enemy.coord) <= getUnitRange(u, state.board)).length;
            const enemiesInRangeOfEnemy = state.units.filter(u => u.ownerId !== currentPlayer.id && u.id !== enemy.id && getDistance(u.coord, enemy.coord) <= getUnitRange(u, state.board)).length;
            
            const supportScore = (alliesInRangeOfEnemy - enemiesInRangeOfEnemy) * SUPPORT_SCORE_MULT;
            if (supportScore > maxSupportScore) maxSupportScore = supportScore;
          }
          
          // Tightened threshold: In a 1-hit kill game, being "outnumbered by 1" (score -50) 
          // is just as fatal as being outnumbered by 2. We must at least match the enemy 
          // support to even consider moving in.
          if (maxSupportScore < 0 && !isBarbarian) {
             score -= 10000; // Force hold the line if we don't have support parity
          } else {
             score += Math.max(0, maxSupportScore);
          }

          // Bait & Trade Logic: Only trade high-value units if the gain is significant.
          let bestTradeValue = 0;
          let hasImmediateGain = false;
          for (const target of moveTargets) {
            const distAfterMove = getDistance(m, target.coord);
            if (distAfterMove <= potentialRange) {
              const tradeValue = target.value - myValue;
              if (tradeValue > bestTradeValue) bestTradeValue = tradeValue;
              
              // Immediate Gain check: 
              // 1. Moving onto an unclaimed settlement captures it immediately.
              const isNeutralCaptureOnSpot = distAfterMove === 0 && target.isSettlement && target.ownerId === null;
              if (isNeutralCaptureOnSpot) {
                hasImmediateGain = true;
              }
            }
          }

          // Peril is strictly 1-turn threat. Penalty is additive based on attackers.
          let penalty = ((myValue * THREAT_PENALTY_L1_MULT) + (eminentValue * 4.0) + (eminentCount * 100));

          // Global Aggression Mitigation: 
          // If we have a massive advantage, reduce the fear of the penalty to push the line.
          if (globalAggression > 1.0) {
             penalty /= globalAggression;
          }

          // High-Value Target (HVT) Guard: 
          // If a unit is worth >= 200 (Knight/Catapult), it is essentially FORBIDDEN from 
          // stepping into a kill zone (eminent threat) unless it captures a settlement 
          // ON THAT SPOT this turn. This reflects the chess "Queen vs Pawn" rule.
          if (myValue >= 200 && !isBarbarian && !hasImmediateGain) {
             let hvtPenaltyMult = 10.0;

             // Dynamic Tempering: If we outnumber them and are rich, we can afford 
             // to be braver with our HVTs to speed up the victory or break a siege.
             if (globalUnitRatio >= 2.0 && isRich) {
                hvtPenaltyMult = 2.5; // Relaxed: willing to trade HVT to clinch the win
             } else if (globalUnitRatio >= 1.5) {
                hvtPenaltyMult = 5.0; // Semi-relaxed
             }

             penalty *= hvtPenaltyMult; 
          }

          // Knight First-In Penalty
          if (unitToAct.type === UnitType.KNIGHT && !isBarbarian) {
            const isAnyAllyAlreadyInKillZone = otherFriendlyUnits.some(u => {
              const t = threatMatrix.get(`${u.coord.q},${u.coord.r}`);
              return t && t.minTurns === 1;
            });
            if (!isAnyAllyAlreadyInKillZone) {
              score -= BASE_REWARD * KNIGHT_FIRST_IN_PENALTY;
            }
          }
          
          // Numerical Disadvantage Penalty: If we are not clearly outnumbering the enemy, increase penalty.
          // We start penalizing at 1.1x to encourage "Safe Superiority" (e.g. 3 vs 2).
          if (eminentLnaRatio <= 1.1) {
            // If even (1.0) or worse, apply a scaling multiplier that aggressively discourages the move
            const disadvantageScale = eminentLnaRatio <= 1.0 ? 2.5 : 1.5;
            penalty *= disadvantageScale * (2.1 - eminentLnaRatio); 
          }

          // Lethal Threat Penalty: If multiple attackers can hit us, it's much more dangerous
          if (eminentCount >= 2) {
            // Bait & Trade: Ignore lethal penalty if trade is high value
            if (bestTradeValue < BAIT_AND_TRADE_THRESHOLD) {
              penalty *= LETHAL_THREAT_PENALTY_MULT;
              // Extra scaling for massive groups
              if (eminentCount >= 4) penalty *= 1.5;
            }
          }
          score -= penalty * penaltyMult;
        }
      }

      // Desperation Bonus: If in peril, moving is better than staying put unless staying put is safe
      if (isUnitInPeril && !isStayPut && moveThreatLevel > 1) {
        score += BASE_REWARD * 2.0;

        // Opportunistic Retreat: Favor high-value terrain when fleeing to safety
        if (tile.ownerId === null && (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE)) {
          score += BASE_REWARD * OPPORTUNISTIC_RETREAT_SETTLEMENT_BONUS;
        } else if (tile.terrain === TerrainType.PLAINS && tile.ownerId === null) {
          score += BASE_REWARD * OPPORTUNISTIC_RETREAT_PLAINS_BONUS;
        }
      }

      // Upgrade Path Scoring: Prioritize moving to or staying on tiles we want to upgrade
      const isBuildablePlains = tile.terrain === TerrainType.PLAINS && (tile.ownerId === null || tile.ownerId === currentPlayer.id);
      const isBuildableMountain = tile.terrain === TerrainType.MOUNTAIN && (tile.ownerId === null || tile.ownerId === currentPlayer.id);

      if (isSavingForMine && isBuildableMountain) {
        score += UPGRADE_SAVING_MINE_BONUS;
        if (isStayPut) score += UPGRADE_SAVING_MINE_STAY_PUT_BONUS; 
      } else if (isSavingForVillage && isBuildablePlains) {
        // Catapult specific build constraint check
        let canBuildHere = true;
        if (unitToAct.type === UnitType.CATAPULT) {
          const nearestFriendlySettlementDist = mySettlements.length > 0 
            ? Math.min(...mySettlements.map(s => getDistance(m, s.coord)))
            : Infinity;
          canBuildHere = nearestFriendlySettlementDist >= 2;
        }

        if (canBuildHere) {
          score += UPGRADE_SAVING_VILLAGE_BONUS;
          if (isStayPut) score += UPGRADE_SAVING_VILLAGE_STAY_PUT_BONUS; 
          if (tile.ownerId === currentPlayer.id) score += INFILLING_BONUS;
        }
      } else {
        // Only apply generic terrain bonuses if we aren't specifically looking for an upgrade tile
        if (tile.terrain === TerrainType.FOREST) {
          score += TERRAIN_FOREST_PENALTY; // Forests slow movement and don't allow villages
        }
        if (tile.terrain === TerrainType.MOUNTAIN) {
          score += TERRAIN_MOUNTAIN_BONUS;
          if (tile.ownerId === currentPlayer.id) score += INFILLING_BONUS;
        }
        if (tile.terrain === TerrainType.PLAINS) {
          score += (tile.ownerId === null) ? TERRAIN_PLAINS_NEUTRAL_BONUS : TERRAIN_PLAINS_OWNED_BONUS; // Preference for developable plains
          if (tile.ownerId === currentPlayer.id) score += INFILLING_BONUS;
        }
      }

      // Edge of Peril Bonus: Pushes AI to expand on plains tiles right up to the enemy border
      if (tile.terrain === TerrainType.PLAINS && moveThreatLevel > 1) {
        const neighbors = _getNeighbors(m);
        let isEdgeOfPeril = false;
        for (const n of neighbors) {
          const t = threatMatrix.get(`${n.q},${n.r}`);
          if (t && t.minTurns === 1) {
            isEdgeOfPeril = true;
            break;
          }
        }
        if (isEdgeOfPeril) {
          score += BASE_REWARD * EDGE_OF_PERIL_BONUS;
        }
      }

      if (score > maxScore) {
        maxScore = score;
        bestMove = m;
      }
    }

    if (bestMove.q === unitToAct.coord.q && bestMove.r === unitToAct.coord.r) {
      // Opportunistic Attack: If staying put anyway, check if there's ANY valid attack
      // This ensures units don't ignore enemies in range if they decide not to move.
      const anyAttacks = getValidAttacks(unitToAct, state.board, state.units);
      if (anyAttacks.length > 0) {
        let bestTarget = anyAttacks[0];
        let maxVal = -1;
        for (const a of anyAttacks) {
          const targetUnit = unitsMap.get(`${a.q},${a.r}`);
          const targetTile = boardMap.get(`${a.q},${a.r}`);
          let val = 0;
          if (targetUnit) val = UNIT_STATS[targetUnit.type].cost;
          else if (targetTile) val = SETTLEMENT_INCOME[targetTile.terrain] * HORIZON;
          
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

  return { type: 'skipUnit' as const, payload: { unitId: unitToAct.id } };
}
