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
import { BASE_REWARD } from './constants';
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

  const stats = UNIT_STATS[unitToAct.type];
  const myValue = stats.cost;
  const HORIZON = 10;

  // 1. Evaluate Attacks
  const attacks = getValidAttacks(unitToAct, state.board, state.units);
  if (attacks.length > 0) {
    let bestAttack = attacks[0];
    let maxPriority = -Infinity;

    const attackSafety = new LoopSafety('getAutomatonBestAction-attacks-economic', 1000);
    for (const a of attacks) {
      if (attackSafety.tick()) break;
      
      const targetUnit = state.units.find(u => u.coord.q === a.q && u.coord.r === a.r);
      const targetTile = state.board.find(t => t.coord.q === a.q && t.coord.r === a.r);

      const threat = threatMatrix.get(`${unitToAct.coord.q},${unitToAct.coord.r}`);
      const myThreatLevel = threat ? threat.minTurns : Infinity;

      let priority = 0;

      if (targetUnit) {
        const targetValue = UNIT_STATS[targetUnit.type].cost;
        
        // Economic Trade: Target Value - My Risk
        const risk = (myThreatLevel <= 2 && !isBarbarian) ? myValue : 0;
        
        priority = targetValue - risk;
        
        // Peril Counter-Attack Bonus: If we are in peril, we prefer to attack rather than run
        if (myThreatLevel === 1 && !isBarbarian) {
          priority += BASE_REWARD * 5.0; // Significant bonus to prefer attacking over moving
          
          // Extra bonus if the target is actually one of the units threatening us
          const distToTarget = getDistance(unitToAct.coord, targetUnit.coord);
          if (distToTarget <= UNIT_STATS[targetUnit.type].range) {
            priority += BASE_REWARD * 3.0;
          }
        }

        // High Value Target (HVT) Bonus
        if (hvt && targetUnit.id === hvt.id) {
          priority += BASE_REWARD * 3.0;
        }

        // Forest Evasion Penalty: Reduce priority by 50% if target is in forest
        if (targetTile?.terrain === TerrainType.FOREST) {
          priority *= 0.5;
        }

        // Strategic Bonuses
        if (targetUnit.type === UnitType.CATAPULT) priority += BASE_REWARD * 1.0;
        if (focusOnLeader && targetUnit.ownerId === leaderId) priority += BASE_REWARD * 0.5;
        
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
        
        // Peril Bonus: If we are in peril, we prefer to capture a settlement rather than run
        if (myThreatLevel === 1 && !isBarbarian) {
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
    if (maxPriority > -myValue * 0.5 || eminentThreatBases.length > 0 || isBarbarian) {
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
      const tile = state.board.find(t => t.coord.q === m.q && t.coord.r === m.r)!;
      const isStayPut = m.q === unitToAct.coord.q && m.r === unitToAct.coord.r;

      const moveThreat = threatMatrix.get(`${m.q},${m.r}`);
      const moveThreatLevel = moveThreat ? moveThreat.minTurns : Infinity;
      const isMoveInPeril = moveThreatLevel === 1;

      // Stay Put Bias: Avoid jittery movement if there's no clear benefit to moving
      if (isStayPut) {
        score += BASE_REWARD * 0.5;
      }

      // Immediate Capture Bonus
      if (tile.ownerId === null && (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE)) {
        score += (SETTLEMENT_INCOME[tile.terrain] * HORIZON) + BASE_REWARD * 6.0; 
      }

      // Forest Defense Bonus: AI likes to end turn in forests
      if (tile.terrain === TerrainType.FOREST) {
        score += BASE_REWARD * 1.5;
      }

      // 1. Put enemies in peril: If we can move to within attack range of an enemy unit or village in one turn, 
      // AND it won't place our unit into peril, then do it.
      const potentialRange = getUnitRange({ ...unitToAct, coord: m }, state.board);
      if (!isMoveInPeril) {
        for (const target of moveTargets) {
          const dist = getDistance(m, target.coord);
          if (dist <= potentialRange) {
            score += BASE_REWARD * 3.0; // High bonus for putting enemy in peril
          }
        }
      }

      // 2. Empire expansion: If a unit and any nearby villages are not in peril, 
      // the unit should be actively moving as far as possible from the center of it's empire each turn, 
      // or building a village if it is on a plains tile.
      const unitCurrentThreat = threatMatrix.get(`${unitToAct.coord.q},${unitToAct.coord.r}`);
      const isUnitInPeril = unitCurrentThreat ? unitCurrentThreat.minTurns === 1 : false;
      
      const nearbyVillages = state.board.filter(t => 
        t.ownerId === currentPlayer.id && 
        (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE) &&
        getDistance(t.coord, unitToAct.coord) <= 3
      );
      const isNearbyVillageInPeril = nearbyVillages.some(v => {
        const t = threatMatrix.get(`${v.coord.q},${v.coord.r}`);
        return t ? t.minTurns === 1 : false;
      });

      if (!isUnitInPeril && !isNearbyVillageInPeril) {
        const distFromCenter = getDistance(m, empireCenter);
        const currentDistFromCenter = getDistance(unitToAct.coord, empireCenter);
        if (distFromCenter > currentDistFromCenter) {
          score += BASE_REWARD * 1.5; // Move away from center
        }
        
        if (tile.terrain === TerrainType.PLAINS && (tile.ownerId === null || tile.ownerId === currentPlayer.id)) {
          score += BASE_REWARD * 1.0; // Prioritize plains for building villages
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
            targetScore += BASE_REWARD * 0.2;
          }

          // Knight Harassment Bonus: Knights love picking off distant, undefended settlements
          if (unitToAct.type === UnitType.KNIGHT && target.isSettlement && target.ownerId === null && dist <= 4) {
             targetScore += BASE_REWARD * 2.0;
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
      if (unitToAct.type === UnitType.KNIGHT && currentThreatLevel <= 2 && !isBarbarian) {
        const moveThreat = threatMatrix.get(`${m.q},${m.r}`);
        const moveThreatLevel = moveThreat ? moveThreat.minTurns : Infinity;
        if (moveThreatLevel > 3) {
          score += BASE_REWARD * 4.0; 
        }
        
        // Bonus for moving towards friendly settlements when in danger
        const friendlySettlements = state.board.filter(t => t.ownerId === currentPlayer.id && (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE));
        let minDistToSettlement = Infinity;
        for (const s of friendlySettlements) {
          const d = getDistance(m, s.coord);
          if (d < minDistToSettlement) minDistToSettlement = d;
        }
        if (minDistToSettlement <= 2) {
          score += BASE_REWARD * 2.0; 
        }
      }

      // Catapult Specific Movement Logic
      if (unitToAct.type === UnitType.CATAPULT) {
        const moveThreat = threatMatrix.get(`${m.q},${m.r}`);
        const moveThreatLevel = moveThreat ? moveThreat.minTurns : Infinity;
        
        // Catapults MUST stay safe. They are too slow to escape once engaged.
        if (moveThreatLevel <= 2 && !isBarbarian) {
          score -= BASE_REWARD * 8.0; 
        } else if (moveThreatLevel === 3 && !isBarbarian) {
          score -= BASE_REWARD * 4.0; 
        }

        // Siege positioning: Prefer being exactly at max range from an enemy settlement
        for (const target of moveTargets) {
          if (target.isSettlement && target.ownerId !== null) {
            const d = getDistance(m, target.coord);
            if (d === potentialRange) {
              score += BASE_REWARD * 3.0; 
            } else if (d < potentialRange && d >= 2) {
              score += BASE_REWARD * 1.5; 
            }
          }
        }

        // Defensive positioning: If near a threatened base, stay put if we have a good shot
        const isNearThreatenedBase = eminentThreatBases.some(b => getDistance(m, b.coord) <= 3);
        if (isNearThreatenedBase && isStayPut) {
          score += BASE_REWARD * 2.0; 
        }
      }

      // Defense Scoring
      const isDefendingBase = eminentThreatBases.some(b => getDistance(m, b.coord) <= 2) || possibleThreatBases.some(b => getDistance(m, b.coord) <= 2);
      if (isDefendingBase) score += BASE_REWARD * 3.5; 

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
            const isEnemyThreateningVillage = threatenedVillages.some(v => getDistance(target.coord, v.coord) <= UNIT_STATS[target.unitType!].range);
            if (isEnemyThreateningVillage) {
              score += BASE_REWARD * 5.0; // Huge sacrifice bonus!
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
          const otherFriendlyUnits = state.units.filter(u => u.ownerId === currentPlayer.id && u.id !== unitToAct.id);
          const isAlreadyInPeril = otherFriendlyUnits.some(u => getDistance(u.coord, target.coord) <= UNIT_STATS[u.type].range);
          if (isAlreadyInPeril) {
            score += BASE_REWARD * 1.5; // Coordination bonus
          }
        }
      }

      // Influence Scoring (Potential Fields)
      const influence = influenceMap.get(`${m.q},${m.r}`) || 0;
      
      if (influence < -100 && !isBarbarian) {
        score -= myValue * 3.0; 
      } else if (influence < -50 && !isBarbarian) {
        score -= myValue * 1.5; 
      } else if (influence < 0) {
        score += Math.abs(influence) * 0.5; 
      } else {
        score += 5; // General expansion
      }

      // HVT Proximity Bonus
      if (hvt) {
        const distToHvt = getDistance(m, hvt.coord);
        const currentDistToHvt = getDistance(unitToAct.coord, hvt.coord);
        if (distToHvt < currentDistToHvt) {
          score += (BASE_REWARD * 1.5) / (distToHvt + 1);
        }
      }

      // Body-Blocking / Screening Bonus
      if (unitToAct.type === UnitType.INFANTRY || unitToAct.type === UnitType.KNIGHT) {
        const myCatapults = state.units.filter(u => u.ownerId === currentPlayer.id && u.type === UnitType.CATAPULT);
        for (const cat of myCatapults) {
          const distToCat = getDistance(m, cat.coord);
          if (distToCat === 1) {
            // We are adjacent to a catapult. Check if we are between it and an enemy.
            const nearestEnemy = state.units.find(u => u.ownerId !== currentPlayer.id); // Simplified: just check nearest
            if (nearestEnemy) {
              const catToEnemy = getDistance(cat.coord, nearestEnemy.coord);
              const meToEnemy = getDistance(m, nearestEnemy.coord);
              if (meToEnemy < catToEnemy) {
                score += BASE_REWARD * 2.0; // Screening bonus!
              }
            }
          }
        }
      }

      // Threat Penalty
      const threat = threatMatrix.get(`${m.q},${m.r}`);
      if (!isBarbarian && threat) {
        const threatLevel = threat.minTurns;
        const threatValue = threat.totalThreatValue;
        const attackerCount = threat.attackerCount;
        
        let penaltyMult = 1.0;
        // Reduce penalty if we are defending a village (Sacrifice)
        if (threatenedVillages.length > 0) {
          penaltyMult = 0.3;
        }

        if (threatLevel === 1) {
          score -= ((myValue * 10.0) + (threatValue * 4.0) + (attackerCount * 100)) * penaltyMult;
        } else if (threatLevel === 2) {
          score -= ((myValue * 5.0) + (threatValue * 2.0) + (attackerCount * 50)) * penaltyMult;
        } else if (threatLevel === 3) {
          score -= ((myValue * 1.5) + (threatValue * 0.75)) * penaltyMult;
        }
      }

      // Upgrade Path Scoring: Prioritize moving to or staying on tiles we want to upgrade
      if (isSavingForMine && tile.terrain === TerrainType.MOUNTAIN) {
        score += 40;
        if (isStayPut) score += 20; 
      } else if (isSavingForVillage && tile.terrain === TerrainType.PLAINS) {
        score += 30;
        if (isStayPut) score += 15; 
      } else {
        // Only apply generic terrain bonuses if we aren't specifically looking for an upgrade tile
        if (tile.terrain === TerrainType.FOREST) {
          score += isDefendingBase ? 10 : -15; // Penalty if not defending to avoid "useless" moves
        }
        if (tile.terrain === TerrainType.MOUNTAIN) score += 10;
        if (tile.terrain === TerrainType.PLAINS) {
          score += (tile.ownerId === null) ? 10 : 5; // Preference for developable plains
        }
      }

      if (score > maxScore) {
        maxScore = score;
        bestMove = m;
      }
    }

    if (bestMove.q === unitToAct.coord.q && bestMove.r === unitToAct.coord.r) {
      return { type: 'skipUnit' as const, payload: { unitId: unitToAct.id } };
    }

    return { type: 'move' as const, payload: { unitId: unitToAct.id, target: bestMove } };
  }

  return { type: 'skipUnit' as const, payload: { unitId: unitToAct.id } };
}
