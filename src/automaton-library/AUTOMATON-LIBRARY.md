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
- **`constants.ts`**: The "personality" of the AI. Tune these values to adjust aggression, savings horizons, and strategic risk-taking.

## 🧠 Key Features

### 📡 Pre-emptive Threat Detection
The AI doesn't just react to being hit. It calculates the **Attack + Movement Range** of all enemy units to identify "Potential Peril" two turns before an enemy reaches its gates.

### ⚔️ Tactical Combination Moves
The AI can plan sequences:
1.  **Attacker 1** weakens a defender on a village.
2.  **Attacker 2** clears the tile, making it neutral.
3.  **Attacker 3** moves in to claim the village.

### 🛡️ Defensive Interception (Drive Out)
If an enemy unit gathers too close to a friendly settlement, the AI will prioritize "Driving Out" the threat before it becomes an actual siege, sending interceptors to push the front line back.

### 📉 Barbarian Conversion (Fall of Kingdoms)
If a kingdom's military and economy both drop below 25% of the leading player's stats, the AI will "go rogue" and its remaining assets will convert into Barbarian marauders.

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
