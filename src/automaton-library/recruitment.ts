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
import { AIConfig, DEFAULT_AI_CONFIG } from './AIConfig';

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
  threatenedBasesCount: number = 0,
  config: AIConfig = DEFAULT_AI_CONFIG
) {
  const recruitmentTiles = state.board.filter(t => 
    t.ownerId === currentPlayer.id && 
    (t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORT) &&
    !state.units.some(u => u.coord?.q === t.coord?.q && u.coord?.r === t.coord?.r)
  );

  if (recruitmentTiles.length === 0) return null;

  const income = calculateIncome(currentPlayer, state.board);
  const isRich = currentPlayer.gold > 500 || income > 200;

  // Savings Account Logic: If we are saving for a high-reward item, we might skip recruitment
  const savingsTarget = isSavingForMine ? UPGRADE_COSTS[TerrainType.GOLD_MINE] : (isSavingForVillage ? UPGRADE_COSTS[TerrainType.VILLAGE] : 0);
  let currentGold = currentPlayer.gold;

  // Disciplined Cumulative Savings (Task 1): 
  // If we are saving, we "lock" a portion of our wealth to ensure growth happens.
  if (savingsTarget > 0 && !isUnderThreat && !isBarbarian) {
    // We want to save 'dedication_ratio' of our current wealth towards this goal.
    // As we get closer (higher progress), we lock a higher % of our gold to cross the finish line.
    const progress = currentPlayer.gold / savingsTarget;
    // We lock at least SAVINGS_DEDICATION_RATIO, but as we near the goal, we lock more.
    const lockRatio = Math.max(config.SAVINGS_DEDICATION_RATIO, progress); 
    const savingsReserve = Math.floor(currentPlayer.gold * lockRatio);
    currentGold = Math.max(0, currentGold - savingsReserve);
  }
  
  // Barbarians spend roughly 1/3 on expansion and 2/3 on infantry
  if (isBarbarian) {
    const expansionBudget = Math.floor(currentPlayer.gold * BARBARIAN_EXPANSION_BUDGET_RATIO);
    currentGold = currentPlayer.gold - expansionBudget;
  }
  
  // If we are under imminent threat (units next to bases), defense becomes priority 1.
  // Otherwise, we stick to our savings target for income expansion.
  // If many bases are threatened, we completely ignore savings to spam defenders
  const isDesperateDefense = threatenedBasesCount >= 2;
  const hasEminentThreat = eminentThreatBases.length > 0;

  // --- UNIT RATIO CAP LOGIC (MOVED UP) ---
  const myUnitsCount = state.units.filter(u => u.ownerId === currentPlayer.id).length;
  const mySettlementsCount = state.board.filter(b => 
    b.ownerId === currentPlayer.id && 
    [TerrainType.VILLAGE, TerrainType.FORT, TerrainType.CASTLE, TerrainType.GOLD_MINE].includes(b.terrain)
  ).length;

  let activeRatioCap = config.UNIT_TO_SETTLEMENT_RATIO;
  
  if (state.turnNumber <= 2) {
    // Early turns: force quick units
    activeRatioCap = 2.0; 
  } else if (isDesperateDefense) {
    activeRatioCap = 2.0;
  } else if (isUnderThreat) {
    activeRatioCap = Math.max(activeRatioCap, 1.2);
  } else if (isLaggingStrength) {
    activeRatioCap = Math.max(activeRatioCap, 1.0);
  }

  const maxUnitsAllowed = Math.ceil(mySettlementsCount * activeRatioCap);
  const isCappedByRatio = myUnitsCount >= maxUnitsAllowed;
  // --- END RATIO CAP LOGIC ---

  // Adjust savings threshold if we are capped by ratio - force saving the full amount
  const effectiveSavingsRatio = isCappedByRatio ? 1.0 : SAVINGS_THRESHOLD_RATIO;

  // USER: High-level Economic Reserve logic (25% or 50% based on unit/settlement ratio)
  // This keeps funds aside for growth (villages and mines).
  const unitToSettlementRatio = myUnitsCount / Math.max(1, mySettlementsCount);
  const reserveRatio = unitToSettlementRatio > 1.0 ? config.ECONOMIC_RESERVE_RATIO_HIGH : config.ECONOMIC_RESERVE_RATIO_NORMAL;
  const economicReserve = Math.floor(currentPlayer.gold * reserveRatio);

  // Apply reserve if NOT under immediate duress
  if (!hasEminentThreat && !isDesperateDefense && !isBarbarian) {
    currentGold = Math.max(0, currentGold - economicReserve);
  }

  // Gold Shield: If NOT under threat, keep a small reserve for emergency defense
  // This prevents the AI from being "bankrupt" right before an enemy surprise attack
  const isHealthyEconomy = income > 100;
  const goldShieldAmount = (isHealthyEconomy && !isUnderThreat && !isDesperateDefense) ? config.GOLD_RESERVE_TARGET : 0;
  
  const effectiveSavingsTarget = (hasEminentThreat || isDesperateDefense) ? 0 : Math.max(savingsTarget, goldShieldAmount);
  
  // Potential targets for evaluation
  const targets = [
    ...state.board.filter(t => 
      (t.ownerId === null || t.ownerId !== currentPlayer.id) && 
      (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORT || t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE)
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

  const recruitSafety = new LoopSafety('getAutomatonBestAction-recruit-economic', 6000);
  
  for (const t of recruitmentTiles) {
    if (recruitSafety.tick()) break;

    const { dist: distToNearestEnemy } = findNearestTarget(t.coord, state, currentPlayer.id);
    const isNearMyBase = eminentThreatBases.some(b => getDistance(t.coord, b.coord, state.board) <= DEFENSE_DISTANCE_THRESHOLD);

    const allowedUnitTypes = (Object.keys(UNIT_STATS) as UnitType[]);

    const typeSafety = new LoopSafety('getRecruitmentAction-types', 300);
    for (const unitType of allowedUnitTypes) {
      if (typeSafety.tick()) break;
      const stats = UNIT_STATS[unitType];
      if (currentGold < stats.cost) continue;
      
      const tileKey = `${t.coord?.q},${t.coord?.r}`;
      const heat = heatMap.get(tileKey) || 0;

      // Check if buying this unit puts us too far from our savings target
      // Normal AI: If heat is low, prioritize savings for high-tier structures
      if (!isBarbarian && !isUnderThreat && effectiveSavingsTarget > 0 && heat < HEAT_MAP_SAVINGS_THRESHOLD) {
        if ((currentGold - stats.cost) < effectiveSavingsTarget * effectiveSavingsRatio) {
          if (stats.cost > CHEAP_UNIT_THRESHOLD) continue;
        }
      }

      let bestUnitScore = -Infinity;
      const range = getUnitRange({ type: unitType as UnitType, coord: t.coord } as any, state.board);
      
      // Evaluate this unit type against all targets from this tile
      const targetSafety = new LoopSafety('getRecruitmentAction-targets', 3000);
      
      // PRE-CALC: Check for immediate local counters
      let localCounterBonus = 0;
      const enemyUnitsAtRange2 = targets.filter(trg => trg.unitType !== undefined && getDistance(t.coord, trg.coord, state.board) === 2);
      const enemyUnitsAtRange3 = targets.filter(trg => trg.unitType !== undefined && getDistance(t.coord, trg.coord, state.board) === 3);

      if (unitType === UnitType.ARCHER && enemyUnitsAtRange2.length > 0) {
        // Archers are perfect for hitting units at range 2
        localCounterBonus += config.BASE_REWARD * 6.0 * enemyUnitsAtRange2.length;
      }
      
      if (unitType === UnitType.CATAPULT && enemyUnitsAtRange3.length > 0) {
        // Catapults are perfect for hitting units at range 3
        localCounterBonus += config.BASE_REWARD * 8.0 * enemyUnitsAtRange3.length;
      }
      
      if (unitType === UnitType.KNIGHT && (enemyUnitsAtRange2.length > 0 || enemyUnitsAtRange3.length > 0)) {
        // Knights are good for closing distance on ranged units
        const hasRangedEnemies = targets.some(trg => 
          (trg.unitType === UnitType.ARCHER || trg.unitType === UnitType.CATAPULT) && 
          getDistance(t.coord, trg.coord, state.board) <= stats.moves + 1
        );
        if (hasRangedEnemies) localCounterBonus += config.BASE_REWARD * 4.0;
      }

      // CRITICAL: If we are already unit-capped, local defense must be EXTREMELY high value to justify another unit
      if (isCappedByRatio && !isDesperateDefense) {
        localCounterBonus *= 0.1;
      }

      for (const target of targets) {
        if (targetSafety.tick()) break;
        const dist = getDistance(t.coord, target.coord, state.board);
        
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
          const isTileInEminentPeril = eminentThreatBases.some(b => b.coord?.q === t.coord?.q && b.coord?.r === t.coord?.r);

          if (isAtExactRange && isEnemyTarget && !isTileInEminentPeril) {
            isValidImmediateNeed = true;
            
            // Boost for each additional target (settlement or unit) within 2 to 4 range
            const otherTargetsInRange = targets.filter(other => {
               if (other.coord?.q === target.coord?.q && other.coord?.r === target.coord?.r) return false;
               const d = getDistance(t.coord, other.coord, state.board);
               return d >= 2 && d <= 4;
            }).length;

            actionValue += otherTargetsInRange * BASE_REWARD * 1.0;
 
            if (target.isSettlement) {
                actionValue += BASE_REWARD * 4.0; // Huge bonus for targeted sieges
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
        const influence = influenceMap.get(`${t.coord?.q},${t.coord?.r}`) || 0;
        const influenceBonus = influence < 0 ? Math.abs(influence) * INFLUENCE_BONUS_RATIO : 0;
        
        // Heat Map Bonus: Recruit where the action is
        const heatBonus = heat * HEAT_MAP_RECRUIT_BONUS;

        // Front Priority Bonus: Favor tiles that are near threatened bases
        let frontPriorityBonus = 0;
        const isNearThreatenedFront = eminentThreatBases.some(b => getDistance(t.coord, b.coord, state.board) <= 3);
        if (isNearThreatenedFront) {
          // Scaling bonus by the severity of the front situation
          frontPriorityBonus += BASE_REWARD * 4.0 * Math.max(1, threatenedBasesCount);
          
          // CRITICAL: If we are already over our unit ratio, scale DOWN this front bonus 
          // to prevent endless unit spamming that stalls the economy.
          if (isCappedByRatio) {
            frontPriorityBonus *= 0.2;
          }
        }

        if (score + influenceBonus + heatBonus + frontPriorityBonus + localCounterBonus > bestUnitScore) {
          let finalScore = score + influenceBonus + heatBonus + frontPriorityBonus + localCounterBonus;
          
          // Primary Aggressor Priority: Target units/settlements of the primary attacker
          if (primaryAggressorId !== -1 && target.ownerId === primaryAggressorId) {
            finalScore += BASE_REWARD * 2.0;
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
      const threat = threatMatrix.get(`${t.coord?.q},${t.coord?.r}`);
      const threatLevel = threat ? threat.minTurns : Infinity;
      
      // Check if this specific tile is in eminent peril
      const isTileInEminentPeril = (eminentThreatBases || []).some(b => b.coord?.q === t.coord?.q && b.coord?.r === t.coord?.r);
      
      if (isTileInEminentPeril) {
        // Massive bonus for recruiting ANY unit at a tile in eminent peril to act as a blocker/defender
        // Scale this down if we are already over the ratio but NOT in a total collapse (desperate defense)
        const survivalPenalty = (isCappedByRatio && !isDesperateDefense) ? 0.15 : 1.0;
        bestUnitScore += BASE_REWARD * EMINENT_PERIL_BONUS * 2.0 * survivalPenalty;
        
        // AI IMPROVE: Favor CHEAPER INFANTRY for "sacrificial" defense to buy time.
        // Don't waste Archers as blockers in eminent peril tiles unless no infantry available.
        if (unitType === UnitType.INFANTRY) {
          bestUnitScore += BASE_REWARD * SACRIFICIAL_DEFENSE_BONUS * 2.0 * survivalPenalty;
        } else if (unitType === UnitType.ARCHER) {
          // Penalize archers specifically on the peril tile - they should be behind the lines
          bestUnitScore -= BASE_REWARD * 4.0 * survivalPenalty;
        } else if (stats.cost <= 100) {
          bestUnitScore += BASE_REWARD * SACRIFICIAL_DEFENSE_BONUS * 1.0 * survivalPenalty;
        }
      }

      // Military Lag Bonus: If we are weak, give an extra nudge to recruit units near ANY base, 
      // not just those currently under eminent threat.
      if (isLaggingStrength && isNearMyBase) {
        bestUnitScore += BASE_REWARD * config.DEFENSE_URGENCY_BONUS;
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
  let minThreshold = (isUnderThreat || isLaggingStrength) ? MIN_RECRUIT_THRESHOLD_THREAT : MIN_RECRUIT_THRESHOLD_NORMAL;
  
  // Extra low threshold if critically lagging strength
  if (isLaggingStrength && currentPlayer.gold > 200) {
    minThreshold -= 100; 
  }
  
  // Tiered ideal unit/village ratio (Logic moved to top)

  if (myUnitsCount === 0) {
    minThreshold = -Infinity;
  } else if (isCappedByRatio && myUnitsCount > 0) {
    // If we have enough units (ratio exceeded), we prioritize gold for upgrades/mines.
    // We only recruit if there is an EXTRAORDINARILY high score
    // Increased penalty to ensure expansion happens
    minThreshold += 10000; 
  } else if (bestAction && !isBarbarian) {
    // Heat Map Logic: If heat is low, we need a higher score to justify recruitment (unless barbarian)
    const tileKey = `${bestAction.coord?.q},${bestAction.coord?.r}`;
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
