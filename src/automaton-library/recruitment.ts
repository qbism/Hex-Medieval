import { 
  GameState, 
  Player, 
  TerrainType, 
  UnitType, 
  UNIT_STATS, 
  HexCoord, 
  getDistance, 
  HexTile,
  UPGRADE_COSTS,
  SETTLEMENT_INCOME
} from '../types';
import { getUnitRange } from '../game/units';
import { findNearestTarget, getChokepointScore as _getChokepointScore, findNearestEnemySettlement as _findNearestEnemySettlement } from './utils';
import { calculateIncome } from '../gameEngine';
import { 
  BASE_REWARD,
  HORIZON,
  BARBARIAN_EXPANSION_BUDGET_RATIO,
  SAVINGS_THRESHOLD_RATIO,
  CHEAP_UNIT_THRESHOLD,
  MAX_TURNS_TO_ACT,
  DEFENSE_DISTANCE_THRESHOLD,
  KNIGHT_SNIPE_BONUS,
  KNIGHT_EXPANSION_BONUS,
  KNIGHT_INCOME_THRESHOLD,
  KNIGHT_INCOME_PENALTY,
  KNIGHT_APPEAL_BOOST,
  CATAPULT_SIEGE_BONUS,
  CATAPULT_CASTLE_BONUS,
  CATAPULT_DEFENSE_BONUS,
  CATAPULT_INCOME_THRESHOLD,
  CATAPULT_INCOME_PENALTY,
  CATAPULT_MOBILITY_PENALTY_FAR,
  CATAPULT_MOBILITY_PENALTY_VERY_FAR,
  CATAPULT_APPEAL_BOOST,
  CATAPULT_PROXIMITY_BONUS_L1,
  CATAPULT_PROXIMITY_BONUS_L2,
  CATAPULT_MEAT_SHIELD_RECRUIT_PENALTY,
  CATAPULT_MEAT_SHIELD_RECRUIT_BONUS,
  NEUTRAL_CAPTURE_BONUS,
  NEAR_BASE_BONUS,
  INFLUENCE_BONUS_RATIO,
  HEAT_MAP_RECRUIT_BONUS,
  HEAT_MAP_SAVINGS_THRESHOLD,
  COMPOSITION_RATIO_THRESHOLD,
  COMPOSITION_PENALTY_FACTOR,
  EMINENT_PERIL_BONUS,
  SACRIFICIAL_DEFENSE_BONUS,
  EMINENT_PERIL_PENALTY_RATIO,
  DANGER_PENALTY_RATIO,
  MIN_RECRUIT_THRESHOLD_THREAT,
  MIN_RECRUIT_THRESHOLD_NORMAL,
  INTERIOR_PENALTY_FACTOR
} from './constants';
import { LoopSafety } from '../utils';
import { ThreatInfo } from './threatAnalysis';

export function getRecruitmentAction(
  state: GameState, 
  currentPlayer: Player, 
  threatMatrix: Map<string, ThreatInfo>,
  influenceMap: Map<string, number>,
  eminentThreatBases: HexTile[],
  possibleThreatBases: HexTile[],
  isUnderThreat: boolean,
  isEarlyGame: boolean,
  isSavingForMine: boolean,
  isSavingForVillage: boolean,
  isLaggingStrength: boolean,
  isLaggingIncome: boolean,
  isCriticallyLaggingLargeEconomy: boolean,
  heatMap: Map<string, number>,
  isBarbarian: boolean = false,
  primaryAggressorId: number = -1,
  threatenedBasesCount: number = 0
) {
  const recruitmentTiles = state.board.filter(t => 
    t.ownerId === currentPlayer.id && 
    (t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS) &&
    !state.units.some(u => u.coord.q === t.coord.q && u.coord.r === t.coord.r)
  );

  if (recruitmentTiles.length === 0) return null;

  const myUnitCount = state.units.filter(u => u.ownerId === currentPlayer.id).length;
  const income = calculateIncome(currentPlayer, state.board);
  const isRich = currentPlayer.gold > 500 || income > 200;

  // Savings Account Logic: If we are saving for a high-reward item, we might skip recruitment
  const savingsTarget = isSavingForMine ? UPGRADE_COSTS[TerrainType.GOLD_MINE] : (isSavingForVillage ? UPGRADE_COSTS[TerrainType.VILLAGE] : 0);
  let currentGold = currentPlayer.gold;

  // Fraction-based planning (Task 1): Put aside 1/3 of income if saving for a mine
  if (isSavingForMine && !isUnderThreat) {
    const savingsCut = Math.floor(income * 0.33);
    currentGold = Math.max(0, currentGold - savingsCut);
  }
  
  // Barbarians spend roughly 1/3 on expansion and 2/3 on infantry
  // We implement this by making them "save" 1/3 of their gold during recruitment
  if (isBarbarian) {
    const expansionBudget = Math.floor(currentPlayer.gold * BARBARIAN_EXPANSION_BUDGET_RATIO);
    currentGold = currentPlayer.gold - expansionBudget;
  }
  
  // If we are under imminent threat (units next to bases), defense becomes priority 1.
  // Otherwise, we stick to our savings target for income expansion.
  const hasEminentThreat = eminentThreatBases.length > 0;
  
  // If many bases are threatened, we completely ignore savings to spam defenders
  const isDesperateDefense = threatenedBasesCount >= 2;
  const effectiveSavingsTarget = (hasEminentThreat || isDesperateDefense) ? 0 : savingsTarget;
  
  // Potential targets for evaluation
  const targets = [
    ...state.board.filter(t => 
      (t.ownerId === null || t.ownerId !== currentPlayer.id) && 
      (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
    ).map(t => ({ 
      coord: t.coord, 
      value: SETTLEMENT_INCOME[t.terrain] * HORIZON, 
      isSettlement: true, 
      ownerId: t.ownerId,
      unitType: undefined 
    })),
    ...state.units.filter(u => u.ownerId !== currentPlayer.id).map(u => ({ 
      coord: u.coord, 
      value: UNIT_STATS[u.type].cost, 
      isSettlement: false, 
      ownerId: u.ownerId,
      unitType: u.type 
    }))
  ];

  let bestAction: { type: UnitType, coord: HexCoord, score: number } | null = null;

  const recruitSafety = new LoopSafety('getAutomatonBestAction-recruit-economic', 2000);
  
  for (const t of recruitmentTiles) {
    if (recruitSafety.tick()) break;

    const { dist: distToNearestEnemy } = findNearestTarget(t.coord, state, currentPlayer.id);

    const allowedUnitTypes = (Object.keys(UNIT_STATS) as UnitType[]);

    const typeSafety = new LoopSafety('getRecruitmentAction-types', 100);
    for (const unitType of allowedUnitTypes) {
      if (typeSafety.tick()) break;
      const stats = UNIT_STATS[unitType];
      if (currentGold < stats.cost) continue;
      
      const tileKey = `${t.coord.q},${t.coord.r}`;
      const heat = heatMap.get(tileKey) || 0;

      // Check if buying this unit puts us too far from our savings target
      // Normal AI: If heat is low, prioritize savings for high-tier structures
      if (!isBarbarian && !isUnderThreat && effectiveSavingsTarget > 0 && heat < HEAT_MAP_SAVINGS_THRESHOLD) {
        if ((currentGold - stats.cost) < effectiveSavingsTarget * SAVINGS_THRESHOLD_RATIO) {
          if (stats.cost > CHEAP_UNIT_THRESHOLD) continue;
        }
      }

      let bestUnitScore = -Infinity;
      const range = getUnitRange({ type: unitType as UnitType, coord: t.coord } as any, state.board);
      
      // Evaluate this unit type against all targets from this tile
      const targetSafety = new LoopSafety('getRecruitmentAction-targets', 1000);
      for (const target of targets) {
        if (targetSafety.tick()) break;
        const dist = getDistance(t.coord, target.coord);
        
        // Calculate turns to act
        let turnsToAct: number;
        if (dist <= range) {
          turnsToAct = 1; // Can act next turn (recruited units can't act same turn)
        } else {
          // turns = 1 (spawn) + ceil((dist - range) / moves)
          turnsToAct = 1 + Math.ceil((dist - range) / stats.moves);
        }

        if (turnsToAct > MAX_TURNS_TO_ACT) continue; // Too far to care

        // Economic Value of Action
        // ROI = (Target Value - Unit Cost) / turnsToAct
        let actionValue = target.value;

        // Supply Line Check: Actual game rule says you can't move further than 'moves' distance from a base.
        // If a target requires walking beyond 'moves', it's unreachable without building new villages.
        const isBeyondSupply = dist > stats.moves;
        if (isBeyondSupply && !isBarbarian) {
           // Heavier penalty for slow units targeting distant objectives they will never reach alone
           actionValue *= 0.3;
           turnsToAct += (dist - stats.moves); // Simulate "Leapfrog" delay
        }
        
        // Bonus for defending own territory
        const isNearMyBase = eminentThreatBases.some(b => getDistance(t.coord, b.coord) <= DEFENSE_DISTANCE_THRESHOLD);

        // Strict Recruitment Constraints Based on Unit Type
        let isValidImmediateNeed = false;
        const isEdgeSpawn = distToNearestEnemy !== Infinity && distToNearestEnemy <= 4;

        if (unitType === UnitType.INFANTRY) {
          // Infantry: Valid anywhere (infilling safe inside kingdom).
          isValidImmediateNeed = true;
        } 
        else if (unitType === UnitType.ARCHER) {
          // Archers: Should spawn near edges/frontlines or for defense
          if (isEdgeSpawn || isUnderThreat) {
            isValidImmediateNeed = true;
          }
        } 
        else if (unitType === UnitType.KNIGHT) {
          // Knights: Traversing long distances to claim a neutral village
          const isFarNeutralClaim = target.isSettlement && target.ownerId === null && dist >= 3 && dist <= 7;
          // Or explicitly threatening if it's right on the front edge
          const isFrontlineSnipe = isEdgeSpawn && !target.isSettlement && (target.unitType === UnitType.ARCHER || target.unitType === UnitType.CATAPULT) && dist <= range;
          
          if (isFarNeutralClaim || isFrontlineSnipe || (isUnderThreat && isRich)) {
            isValidImmediateNeed = true;
            if (isFarNeutralClaim) actionValue += target.value * 2.0;
          }
        } 
        else if (unitType === UnitType.CATAPULT) {
          // Catapults: Specifically looking for targets exactly 3 hexes away
          const isAtExactRange = dist === 3;
          const isEnemyTarget = target.ownerId !== null && target.ownerId !== currentPlayer.id;
          
          // Don't spawn a catapult in a village already in peril (use infantry instead)
          const isTileInEminentPeril = eminentThreatBases.some(b => b.coord.q === t.coord.q && b.coord.r === t.coord.r);

          if (isAtExactRange && isEnemyTarget && !isTileInEminentPeril) {
            isValidImmediateNeed = true;
            
            // Boost for each additional target (settlement or unit) within 2 to 4 range
            const otherTargetsInRange = targets.filter(other => {
               if (other.coord.q === target.coord.q && other.coord.r === target.coord.r) return false;
               const d = getDistance(t.coord, other.coord);
               return d >= 2 && d <= 4;
            }).length;

            actionValue += otherTargetsInRange * BASE_REWARD * 1.5;

            if (target.isSettlement) {
                actionValue += BASE_REWARD * 10.0; // Huge bonus for targeted sieges
            }
          }
          
          // Siege Defense Rule: If we are being sieged (units at dist 1-3), catapults are the BEST counter.
          const isDefensiveNeed = (isUnderThreat || isEdgeSpawn) && isEnemyTarget && dist <= 4 && !isTileInEminentPeril;
          
          if (isDefensiveNeed) {
            isValidImmediateNeed = true;
            actionValue += BASE_REWARD * 5.0; // Bonus for anti-siege duty
          }
        }

        // Apply severe penalty if the specific deployment rules are not met
        // Wealthy AIs and Barbarians are allowed to be more flexible/wasteful to project power
        const isHighDensityExpansionism = (currentPlayer.gold > 2000 || income > 500);
        if (!isValidImmediateNeed && !isBarbarian && !isHighDensityExpansionism) {
           continue; // Disqualify this target for this unit type
        }
        
        // Bonus for capturing neutral settlements
        if (target.isSettlement && target.ownerId === null) {
          actionValue += BASE_REWARD * NEUTRAL_CAPTURE_BONUS;
        }
        
        if (isNearMyBase) {
          actionValue += BASE_REWARD * NEAR_BASE_BONUS;
        }

        const score = (actionValue - stats.cost) / turnsToAct;
        
        // Influence Bonus: Recruit where we are losing control
        const influence = influenceMap.get(`${t.coord.q},${t.coord.r}`) || 0;
        const influenceBonus = influence < 0 ? Math.abs(influence) * INFLUENCE_BONUS_RATIO : 0;
        
        // Heat Map Bonus: Recruit where the action is
        const heatBonus = heat * HEAT_MAP_RECRUIT_BONUS;

        // Front Priority Bonus: Favor tiles that are near threatened bases
        let frontPriorityBonus = 0;
        const isNearThreatenedFront = eminentThreatBases.some(b => getDistance(t.coord, b.coord) <= 3);
        if (isNearThreatenedFront) {
          frontPriorityBonus += BASE_REWARD * 10.0;
        }

        if (score + influenceBonus + heatBonus + frontPriorityBonus > bestUnitScore) {
          let finalScore = score + influenceBonus + heatBonus + frontPriorityBonus;
          
          // Primary Aggressor Priority: Target units/settlements of the primary attacker
          if (primaryAggressorId !== -1 && target.ownerId === primaryAggressorId) {
            finalScore += BASE_REWARD * 5.0;
          }
          const sameTypeCount = state.units.filter(u => u.ownerId === currentPlayer.id && u.type === unitType).length;
          const totalCount = state.units.filter(u => u.ownerId === currentPlayer.id).length;
          if (totalCount > 3) {
            const ratio = sameTypeCount / totalCount;
            if (ratio > COMPOSITION_RATIO_THRESHOLD) {
              finalScore -= BASE_REWARD * COMPOSITION_PENALTY_FACTOR * (ratio - COMPOSITION_RATIO_THRESHOLD);
            }
          }

          if (finalScore > bestUnitScore) {
            bestUnitScore = finalScore;
          }
        }
      }

      // Penalize spawning in danger unless it's for defense
      const threat = threatMatrix.get(`${t.coord.q},${t.coord.r}`);
      const threatLevel = threat ? threat.minTurns : Infinity;
      
      // Check if this specific tile is in eminent peril
      const isTileInEminentPeril = eminentThreatBases.some(b => b.coord.q === t.coord.q && b.coord.r === t.coord.r);
      
      if (isTileInEminentPeril) {
        // Massive bonus for recruiting ANY unit at a tile in eminent peril to act as a blocker/defender
        bestUnitScore += BASE_REWARD * EMINENT_PERIL_BONUS;
        
        // Favor cheaper units for "sacrificial" defense to buy time
        if (stats.cost <= 100) {
          bestUnitScore += BASE_REWARD * SACRIFICIAL_DEFENSE_BONUS;
        }
      }

      if (threatLevel <= 2 && !isBarbarian) {
        // If it's an eminent threat base, we still penalize but less, 
        // because we might need to block or defend.
        const penalty = isTileInEminentPeril ? stats.cost * EMINENT_PERIL_PENALTY_RATIO : stats.cost * DANGER_PENALTY_RATIO;
        bestUnitScore -= penalty;
      }

      if (bestUnitScore > (bestAction?.score ?? -Infinity)) {
        bestAction = { type: unitType, coord: t.coord, score: bestUnitScore };
      }
    }
  }

  // Minimum score threshold to actually recruit
  let minThreshold = isUnderThreat ? MIN_RECRUIT_THRESHOLD_THREAT : MIN_RECRUIT_THRESHOLD_NORMAL;
  
  // Heat Map Logic: If heat is low, we need a higher score to justify recruitment (unless barbarian)
  if (bestAction && !isBarbarian) {
    const tileKey = `${bestAction.coord.q},${bestAction.coord.r}`;
    const heat = heatMap.get(tileKey) || 0;
    if (heat < HEAT_MAP_SAVINGS_THRESHOLD) {
      minThreshold += (HEAT_MAP_SAVINGS_THRESHOLD - heat) * INTERIOR_PENALTY_FACTOR;
    }
  }
  
  if (bestAction && bestAction.score > minThreshold) {
    return { type: 'recruit' as const, payload: { type: bestAction.type, coord: bestAction.coord } };
  }

  return null;
}
