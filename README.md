# Hex Strategy Game

A turn-based, hex-grid strategy game where players build economies, recruit armies, and battle for control of the map. Play against human opponents or challenge the advanced AI Automaton.

## Game Rules

### Objective
Eliminate all other players by capturing their settlements and destroying their armies. The last player standing wins.

### Economy & Upgrades
Gold is the lifeblood of your empire. You earn gold at the start of your turn based on the settlements you control. You can spend gold to recruit units or upgrade your tiles.

*   **Plains:** Can be upgraded to a **Village** (Cost: 100g, Income: +10g).
*   **Village:** Can be upgraded to a **Fortress** (Cost: 150g, Income: +20g).
*   **Fortress:** Can be upgraded to a **Castle** (Cost: 300g, Income: +40g).
*   **Mountain:** Can be upgraded to a **Gold Mine** (Cost: 500g, Income: +80g).
*   **Forest:** Provides cover and slows movement.
    *   **Movement:** Entering a forest costs 2 movement points (prorated: can enter with only 1 point left). Units starting in a forest have reduced range (Infantry/Archers: 1, Knights: 2). Catapults cannot enter forests.
    *   **Defense:** Units in forests cannot be targeted by **Catapults**.
*   **Water:** Impassable to units unless they are moving from another water tile or are adjacent to a settlement (representing ports/docks).

*Note: You can only recruit new units on Villages and Castles.*

### Units
Each unit has unique strengths, movement ranges, and attack ranges.

| Unit | Cost | Movement | Range | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Infantry** | 50g | 2 | 1 | Cheap, reliable frontline fighters. Great for holding choke points or emergency base defense. |
| **Archer** | 100g | 2 | 2 | Ranged attackers. Excellent for chipping away at approaching enemies from behind a frontline wall. |
| **Knight** | 200g | 4 | 1 | Fast, highly mobile cavalry. Perfect for flanking, escaping congested areas, and capturing undefended backline settlements. |
| **Catapult** | 300g | 1 | 3 | Slow but devastating artillery. Essential for breaking stalemates and sieging heavily fortified positions. |

---

## Technical Notes: Game Engine (`src/gameEngine.ts`)

The core game logic is built around a deterministic, immutable state machine.

*   **Hex Grid Math:** The board uses an axial/cube coordinate system (`q`, `r`, `s` where `q + r + s = 0`). This simplifies distance calculations, line-of-sight, and neighbor detection.
*   **Pathfinding:** Movement ranges are calculated using Breadth-First Search (BFS). The engine accounts for terrain movement penalties, impassable obstacles (Mountains), and Zone of Control (enemy units block movement).
*   **State Management:** Every action (move, attack, recruit, upgrade, end turn) takes the current `GameState` and returns a completely new `GameState` object. This functional approach ensures predictable UI updates and makes features like "Undo" or replay history trivial to implement.

---

## Technical Notes: AI Strategy & Mathematical Foundations (`src/automatonEngine.ts`)

The AI ("Automaton") has been upgraded from simple heuristics to a sophisticated decision-making engine based on established game theory and mathematical principles.

### 1. Influence Maps (Potential Fields)
The AI perceives the board as a continuous landscape of control. Each unit and settlement exerts a "field" of influence that decays with distance using the formula: `Strength / (distance + 1)^1.5`.
*   **Expansion**: The AI is "pulled" toward areas where it has low influence but high potential value.
*   **Contestation**: It identifies "hot zones" where enemy influence is high and prioritizes moving reinforcements there.
*   **Danger Avoidance**: Units are "pushed" away from areas where enemy influence is overwhelming, preventing suicidal charges.

### 2. Lanchester-Inspired Combat Evaluation
Drawing from Lanchester's Laws of warfare, the AI evaluates combat effectiveness non-linearly. It uses a power scaling factor (`Cost^1.2`) to model the "Square Law" of combat, where higher-quality units provide exponentially more value in engagements than their raw cost suggests. This encourages the AI to maintain a "High-Quality Core" of elite units (Knights/Catapults) supported by cheaper screens.

### 3. Expected Utility & ROI (Return on Investment)
Every potential action is evaluated through an Economic Horizon. The AI calculates the "Return on Investment" for every move:
`Score = (TargetValue - UnitCost) / (TurnsToReach + 1)`
This allows the AI to mathematically decide if a distant settlement is worth the opportunity cost of the turns spent traveling, or if it should focus on immediate local threats.

### 4. Dynamic Threat Matrix
The AI maintains a real-time "Lethality Map" of the board. It calculates the maximum potential damage any enemy unit can deal to any given hex within a 3-turn horizon.
*   **Fear Factor**: Units will hold position or retreat if the local threat level exceeds their survival threshold.
*   **Priority Targeting**: The AI identifies "High Value Targets" (HVTs) by combining their unit cost with their proximity to the AI's "Empire Center."

### 5. Tactical Heuristics
In addition to the mathematical core, the AI uses several tuned heuristics:
*   **Targeted Upgrades**: Gold Mines are prioritized in safe backlines (>= 6 hexes away), while Fortresses/Castles are prioritized on the frontline (<= 4 hexes away).
*   **Combined Arms**: Army composition is adjusted based on local needs (e.g., spawning Infantry for static brawls, Knights for open-field flanking).
*   **Body-Blocking**: Infantry and Knights receive a "Screening Bonus" for positioning themselves between valuable Catapults and approaching enemies.
