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
| **Archer** | 100g | 2 | 2* | Ranged attackers. Excellent for chipping away at approaching enemies. (*Range: -1 in Forests*) |
| **Knight** | 200g | 4 | 1 | Fast, highly mobile cavalry. Perfect for flanking and capturing undefended settlements. |
| **Catapult** | 300g | 1 | 3* | Slow but devastating artillery. (*Cannot target units in Forests*) |

---

## Technical Notes: Game Engine (`src/gameEngine.ts`)

The core game logic is built around a deterministic, immutable state machine.

*   **Hex Grid Math:** The board uses an axial/cube coordinate system (`q`, `r`, `s` where `q + r + s = 0`). This simplifies distance calculations, line-of-sight, and neighbor detection.
*   **Pathfinding:** Movement ranges are calculated using Breadth-First Search (BFS). The engine accounts for terrain movement penalties, impassable obstacles (Mountains), and Zone of Control (enemy units block movement).
*   **State Management:** Every action (move, attack, recruit, upgrade, end turn) takes the current `GameState` and returns a completely new `GameState` object. This functional approach ensures predictable UI updates and makes features like "Undo" or replay history trivial to implement.

---

## Technical Notes: AI Strategy & Mathematical Foundations (`src/automaton-library/`)

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

### 4. Dynamic Threat Matrix & Numerical Safety
The AI maintains a real-time "Lethality Map" of the board and evaluates engagements through the lens of **Numerical Safety**:
*   **Numerical Safety (The N+1 Rule)**: In this one-hit-kill environment, a 1:1 engagement is considered suicide. The AI will often refuse to move into an enemy's range unless it has strict local superiority (outnumbering the enemy by at least one unit).
*   **Support Parity**: Units evaluate the number of allies vs. enemies covering a target tile. If the AI doesn't have at least support parity, it will "Hold the Line" rather than risk a squad wipeout.
*   **HVT Guard (Queen vs. Pawn)**: High-value units like Catapults and Knights treat enemy ranges with extreme caution. They are essentially forbidden from entering an enemy's strike zone unless a settlement capture on that spot is guaranteed this turn. This mimics high-level chess play where a Queen refuses to trade for a minor piece.

### 5. Dynamic Strategic Aggression (Stance Shifting)
The AI is not static; it adjusts its risk tolerance based on the global state of the game:
*   **Stance: Steamroller**: If the AI outnumbers its enemies by 2:1 and has high gold reserves, it adopts an aggressive "Siege" stance. It relaxes unit risk aversion to apply overwhelming pressure and finish the match.
*   **Stance: Survival (Secret Pact)**: If an AI is failing (strength < 35% of the leader), it enters a "Survival Mode." It will identify another underdog as a "Secret Partner," forming an invisible non-aggression pact to focus all remaining strength on the game leader (the "King-Slayer Directive").

### 6. Tactical Search & Group Sequencing (Advanced Lookahead)
The AI has been upgraded with a **Deep Tactical Lookahead** layer that simulates potential counter-moves before executing high-value actions:
*   **Action Safety (MiniMax-lite)**: Before moving a Knight or Catapult, the AI simulates an immediate "Optimal Response" from the opponent. If the move results in the unit entering a lethal trap without a high-value trade, the action is rejected.
*   **Combinatorial "Group" Sequencing**: Instead of evaluating units in isolation, the AI plans sequences across multiple units. For example, it will purposefully schedule a **Catapult barrage** to neutralize a settlement's defenses *first*, expressly chaining it so a mobile unit can move in and capture the tile in a single turn.

### 7. Evolutionary Self-Play Tuning (Genetic Algorithm)
The AI's performance is optimized through a headless "Simulated Arena" and a **Genetic Algorithm (GA)**:
*   **Automated Balancing**: The dozens of strategic multipliers (e.g., `LETHAL_THREAT_PENALTY_MULT`, `IMMEDIATE_CAPTURE_BONUS`) are no longer hand-tuned.
*   **Fitness Evolution**: By pitting AI versions against each other for thousands of simulated matches, the system incrementally evolves the most aggressive and optimal constants for various map sizes—vastly out-calculating human-guessed parameters.

### 8. Advanced Defensive Behaviors: Withdrawal & Sacrificial Screening
The AI now employs "Human-like" preservation tactics:
*   **Elite Withdrawal**: Imperiled high-value units (Knights/Catapults) will actively withdraw from danger if outnumbered, forcing the enemy to overextend into vulnerable territory if they want the kill.
*   **Sacrificial Screening (The Infantry Wall)**: The AI identifies when an elite unit or a vital settlement is at risk and will rotate low-cost Infantry into the "Kill Zone." This behavior purposefully trades a 50g unit to preserve a 300g asset, creating a dense tactical screen that slow-moving enemies cannot easily bypass.

### 9. Tactical Heuristics
In addition to the mathematical core, the AI uses several tuned heuristics:
*   **Formation-Based Thinking**: The AI treats the Catapult as its "Queen" and uses Infantry/Knights as "Pawns" to screen it. Units are heavily incentivized to maintain **Squad Integrity**, staying in a tight 1-2 hex cluster to provide mutual support and block flanking maneuvers.
*   **Infinite Mitigation (Sniper Logic)**: The AI understands that striking from Range 3 provides "Infinite Mitigation" because most enemies cannot return fire in a single move. It will aggressively prioritize protecting any unit that achieves this overmatch capability.
*   **Opportunistic Retreats**: When fleeing to safety, units prioritize neutral settlements or empty plains that allow them to continue expanding or building on the next turn, rather than just hiding in forests.
*   **Leapfrog Expansion**: Units are incentivized to move to plains at the very edge of their supply line, facilitating efficient "Leapfrog" village building to grow the empire quickly.
*   **Targeted Upgrades**: Gold Mines are prioritized in safe backlines (>= 6 hexes away), while Fortresses/Castles are prioritized on the frontline (<= 4 hexes away).
*   **Economic Urgency**: If a wealthy AI (>1000 income) lags significantly behind the leader (>15% gap), it enters "Economic Urgency" mode—doubling down on Gold Mine construction and assigning higher defensive priority to its economic heartland.
*   **Barbarian Resilience**: The Barbarian team is exceptionally stubborn. They will only consider surrendering if only a single non-barbarian competitor remains; otherwise, they remain a persistent world threat.
*   **Combined Arms**: Army composition is adjusted based on local needs (e.g., spawning Infantry for static brawls, Knights for open-field flanking).
*   **Body-Blocking**: Infantry and Knights receive a "Screening Bonus" for positioning themselves between valuable Catapults and approaching enemies.
*   **Tactical Focus Fire**: The AI prioritizes targets that multiple units can hit, ensuring lethal engagements rather than spreading damage.

---

## Technical Notes: Expressive Music Engine (`src/services/musicEngine.ts`)

The game features a custom-built, real-time procedural music engine that simulates a full medieval quartet.

### 1. 4-Part Quartet Polyphony
*   **Cantus (Lead):** High-register Lute or Shawm, carrying the main melodic themes.
*   **Altus (Counter):** Mid-high Recorder, providing flowing counter-melodies.
*   **Tenor (Harmonic):** Mid-low Recorder, supporting the harmony with sustained tones.
*   **Bassus (Foundation):** Low-register Viol or Hurdy-Gurdy, providing the rhythmic and tonal anchor.
*   **Percussion:** Background frame drums or tambourines that join during intense sections.

### 2. Structured Composition & Dynamic Shuffling
*   **Song Structure:** Songs are generated with a clear architectural structure (e.g., A-B-A-C-A).
*   **Musical Variety:** Instruments are dynamically shuffled and structural parameters (tempo, density, reverb) are randomized for every song, ensuring the soundtrack never sounds repetitive.
*   **Historical Pieces:** The engine includes a library of public domain medieval melodies (e.g., "Palästinalied," "L'homme armé") which are served through a shuffled playlist system.

---

## Technical Notes: Demo Recording & Playback (`src/services/demoService.ts`)

The game includes a robust system for recording and playing back full game sessions.

*   **Full History Preservation:** The game state engine records every single state change from Turn 1 to the end of the game in the background.
*   **Efficient Serialization:** Demos are serialized and zipped using `JSZip` to keep file sizes extremely small, saved with a `.hexd` extension.
*   **Playback Mode:** Loading a demo puts the game into a dedicated playback mode, disabling normal input and AI turns.
*   **VCR Controls:** Players can rewind, play/pause, fast-forward, and adjust playback speed (1x, 2x, 4x) to review the match.
