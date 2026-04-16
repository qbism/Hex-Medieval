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
  LETHAL_THREAT_PENALTY_MULT,
  MUTUAL_SUPPORT_BONUS,
  KILL_PRIORITY_BONUS,
  ATTACK_OVER_MOVE_THRESHOLD,
  THREAT_PENALTY_SACRIFICE_MULT,
  THREAT_PENALTY_L1_MULT,
  SUPPORT_SCORE_MULT,
  RALLY_POINT_ADJACENCY_BONUS,
  BAIT_AND_TRADE_THRESHOLD,
  INFANTRY_VANGUARD_SETTLEMENT_BONUS,
  KNIGHT_FIRST_IN_PENALTY,
  CATAPULT_MEAT_SHIELD_BONUS,
  SETTLEMENT_DEGRADATION_PRIORITY_BONUS,
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
  isBarbarian: boolean = false
) {
  const myUnits = state.units.filter(u => u.ownerId === currentPlayer.id && !u.hasActed);
  const unitToAct = myUnits[0];
  
  if (!unitToAct) return null;

  // Pre-calculate maps and lists for O(1) lookups and efficient filtering
  const unitsMap = new Map<string, Unit>();
  state.units.forEach(u => unitsMap.set(`${u.coord.q},${u.coord.r}`, u));
  const boardMap = new Map<string, any>();
  state.board.forEach(t => boardMap.set(`${t.coord.q},${t.coord.r}`, t));
  
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

  const stats = UNIT_STATS[unitToAct.type];
  const myValue = stats.cost;

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
        // If we are already in peril, "risk" is lower because we are likely to die anyway
        const risk = (isUnitInPeril || isBarbarian) ? 0 : myValue;
        
        priority = targetValue - risk;
        
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
          const distToTarget = getDistance(unitToAct.coord, targetUnit.coord);
          if (distToTarget <= getUnitRange(targetUnit, state.board)) {
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
        
        // Infantry Vanguard Bonus: Extra bonus for attacking units on settlements
        const isOnSettlement = targetTile && (targetTile.terrain === TerrainType.VILLAGE || targetTile.terrain === TerrainType.FORTRESS || targetTile.terrain === TerrainType.CASTLE || targetTile.terrain === TerrainType.GOLD_MINE);
        if (unitToAct.type === UnitType.INFANTRY && isOnSettlement) {
           priority += BASE_REWARD * INFANTRY_VANGUARD_SETTLEMENT_BONUS;
        }

        // Defense Bonus
        const isThreateningBase = eminentThreatBases.some(b => getDistance(a, b.coord) <= 3);
        if (isThreateningBase) priority += BASE_REWARD * 1.5;

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

    // Only attack if it's not a suicidal bad trade (unless defending or barbarian)
    // Threshold lowered significantly to prefer attacking even if risky.
    // We use a very low threshold to ensure we almost always take the shot if it's in range.
    if (maxPriority > myValue * ATTACK_OVER_MOVE_THRESHOLD || eminentThreatBases.length > 0 || isBarbarian) {
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
    
    // Potential move targets - limit to top 8 nearest to avoid additive score bloat
    const moveTargets = [
      ...state.board.filter(t => 
        (t.ownerId === null || t.ownerId !== currentPlayer.id) && 
        (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
      ).map(t => ({ coord: t.coord, value: SETTLEMENT_INCOME[t.terrain] * HORIZON, isSettlement: true, ownerId: t.ownerId, unitType: undefined })),
      ...state.units.filter(u => u.ownerId !== currentPlayer.id).map(u => ({ coord: u.coord, value: UNIT_STATS[u.type].cost, isSettlement: false, ownerId: u.ownerId, unitType: u.type }))
    ].sort((a, b) => getDistance(unitToAct.coord, a.coord) - getDistance(unitToAct.coord, b.coord))
     .slice(0, 8);

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

      if (!isUnitInPeril && !isNearbyVillageInPeril) {
        const distFromCenter = getDistance(m, empireCenter);
        const currentDistFromCenter = getDistance(unitToAct.coord, empireCenter);
        if (distFromCenter > currentDistFromCenter) {
          score += BASE_REWARD * EXPANSION_DISTANCE_BONUS; // Move away from center
        }
        
        if (tile.terrain === TerrainType.PLAINS && (tile.ownerId === null || tile.ownerId === currentPlayer.id)) {
          score += BASE_REWARD * PLAINS_PRIORITY_BONUS; // Prioritize plains for building villages
          
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

          // Pathing Consistency: If we're already moving towards this target, give a bonus
          // This helps units stick to a path rather than deviating for minor terrain bonuses
          if (currentDist > dist) {
            targetScore += BASE_REWARD * PATHING_CONSISTENCY_BONUS;
          }

          // Knight Harassment Bonus: Knights love picking off distant, undefended settlements
          if (unitToAct.type === UnitType.KNIGHT && target.isSettlement && target.ownerId === null && dist <= 4) {
             targetScore += BASE_REWARD * KNIGHT_HARASSMENT_BONUS;
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
      const isDefendingBase = eminentThreatBases.some(b => getDistance(m, b.coord) <= 2) || possibleThreatBases.some(b => getDistance(m, b.coord) <= 2);
      if (isDefendingBase) score += BASE_REWARD * DEFENSE_SCORING_BONUS; 

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
          if (!target.isSettlement && getDistance(m, target.coord) <= potentialRange) {
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
        if (!target.isSettlement && getDistance(m, target.coord) <= potentialRange) {
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
          
          if (maxSupportScore < -100 && !isBarbarian) {
             score -= 10000; // Force hold the line
          } else {
             score += Math.max(0, maxSupportScore);
          }

          // Bait & Trade Logic
          let bestTradeValue = 0;
          for (const target of moveTargets) {
            if (!target.isSettlement && getDistance(m, target.coord) <= potentialRange) {
              const tradeValue = target.value - myValue;
              if (tradeValue > bestTradeValue) bestTradeValue = tradeValue;
            }
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

          // Peril is strictly 1-turn threat. Penalty is additive based on attackers.
          let penalty = ((myValue * THREAT_PENALTY_L1_MULT) + (eminentValue * 4.0) + (eminentCount * 100));
          
          // Numerical Disadvantage Penalty: If we are outnumbered in this spot, increase penalty
          if (eminentLnaRatio < 1.0) {
            penalty *= (2.0 - eminentLnaRatio); // Up to 2x penalty if heavily outnumbered
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
