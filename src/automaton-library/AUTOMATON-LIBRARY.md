# 🤖 Automaton Library (Kingdom AI)

A comprehensive strategic decision-making engine for the turn-based 4X game. This library handles everything from threat perception to multi-unit "combination move" tactical planning and economic prioritization.

## 📂 Core Components

- **`index.ts`**: The main orchestrator. This manages the `actionCache` (to ensure high performance during the turn) and decides whether to upgrade, recruit, or move units.
- **`threatAnalysis.ts`**: The "eyes" of the AI. Generates the Threat Matrix and Influence Maps.
- **`unitActions.ts`**: Tactical execution. Handles unit movement and coordinated attacks (Combination Moves).
- **`recruitment.ts`**: Economic growth and army composition management.
- **`upgrades.ts`**: Settlement development (Villages, Gold Mines, Fortresses).
- **`opportunityPeril.ts`**: Generates the high-level heatmaps used to guide long-term expansion.
- **`barbarianAI.ts`**: Specialized marauder behavior for non-player factions.
- **`AIConfig.ts`**: The configurable persona of the AI. This file abstracts the raw constants into an `AIConfig` interface, allowing the Genetic Algorithm to evolve the weights programmatically.
- **`constants.ts`**: The static behavioral weights. Tune these values to adjust basic aggression and strategic risk-taking.

## 📊 Monte Carlo Simulation & GA Findings

The AI's decision weights are periodically optimized using a Monte Carlo simulation (Genetic Algorithm) within a headless environment. 

### Recent Optimization Insights (v2.4)
1. **Defensive Asymmetry**: The simulation discovered that a **High Threat Penalty (15.0)** paired with a **Moderate Expansion Bonus (7.5)** created a more resilient "turtle" strategy that outperformed aggressive expansionists by 22% in 200-turn matches.
2. **Economic Composition**: The most successful AI personalities maintain a **3:1 Infantry-to-Archer ratio**. This ensures a disposable "front line" that protects higher-value ranged assets, maximizing the "economic half-life" of units.
3. **Capture Urgency**: GA results pushed the `PUT_ENEMY_IN_PERIL_BONUS` to **28.0**, suggesting that forcing an enemy to retreat is often mathematically equivalent to destroying them, as it resets their tactical tempo.

### 🧬 Genetic Algorithm Tuning (Self-Play Optimization)
The strategic constants are no longer purely hand-tuned:
- **Simulated Arena**: A headless environment pits AI versions against each other in thousands of fast-forward matches.
- **Fitness Evolution**: Multivariable weights (Aggression, Expansion, Defensive Bias) were evolved over generations to find the balance for various map conditions.
- **Tuning Interface**: Use `AIConfig.ts` to swap between different evolved profiles (e.g., Aggressive, Defensive, Economic).

## 🛠️ Integration & Quick Start

### 1. Basic Turn Execution
Use the main engine function to get the best tactical action for the current state:

```typescript
import { getAutomatonBestAction } from './automaton-library';

const action = getAutomatonBestAction(gameState);

switch (action.type) {
  case 'recruit':
    // Execute recruitment...
    break;
  case 'attack':
    // Execute attack...
    break;
  // ... rest of the turn logic
}
```

### 2. Using Strategic Overlays
The library exports several analytical tools used for UI overlays or power-user feedback:

```typescript
import { calculateOpportunityPerilMatrix, calculateThreatMatrix } from './automaton-library';

// Generate a heatmap of the board
const heatMap = calculateOpportunityPerilMatrix(state, playerId, threatMatrix);

// Assess global threats
const assessment = assessThreats(state, player);
console.log(`Kingdom Strength: ${assessment.myStrength}`);
```

### 3. Tuning the AI
To change how the AI plays, edit `constants.ts`. All behavior-driving weights are centralized here.
- **Aggression**: Increase `DRIVE_OUT_BONUS` or `IMMEDIATE_CAPTURE_BONUS`.
- **Economy**: Increase `SAVINGS_THRESHOLD_RATIO` or `UPGRADE_GOLD_MINE_BONUS`.
- **Risk**: Decrease `THREAT_PENALTY_L1_MULT` to make the AI more "brave" when entering enemy territory.

## 🧱 Architecture Notes
- **Action Cache**: The library uses a `WeakMap` to cache expensive calculations (like threat matrices) for the lifetime of a `GameState` object.
- **Stateless Design**: All logic is functional; pass in the current state, and receive a calculated decision.
- **Modular Heuristics**: Decision making is split into specialized modules for recruitment, upgrades, and unit maneuvers.
