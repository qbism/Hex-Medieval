import React from 'react';
import { GameButton } from './GameButton';
import { X, Download, Cpu, Code, BookOpen, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AutomatonHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RULES_CONTENT = `# How Automatons Play: Technical Specifications & AI Logic

## 1. Unit Specifications
| Unit Type | Cost (Gold) | Attack Range | Movement Range |
| :--- | :--- | :--- | :--- |
| **Infantry** | 50 | 1 | 2 |
| **Archer** | 100 | 2 | 2 |
| **Knight** | 200 | 1 | 4 |
| **Catapult** | 300 | 3 | 1 |

**Note:** All combat is lethal. 1 Hit = 1 Kill.

## 2. Economic Infrastructure
| Settlement Type | Income / Turn | Upgrade Cost |
| :--- | :--- | :--- |
| **Village** | 20 | 100 |
| **Fortress** | 40 | 150 |
| **Castle** | 70 | 300 |
| **Gold Mine** | 100 | 500 |

## 3. Terrain Effects
- **Forest:** Catapults cannot target units in forests. Archers in forests have -1 Attack Range.
- **River:** No movement penalty. No defense modifiers.
- **Mountains:** Impassable to all units. Gold Mines can only be built on Mountains.

## 4. AI Core Logic (The "Conductor")
The AI operates on a **Heuristic Scoring System**. Every possible action is assigned a score. The AI has **Perfect Information** (No Fog of War).

### Recruitment ROI Formula
\`Score = (TargetValue - UnitCost) / TurnsToReachTarget\`
- **TargetValue:** 500 (Base) + Modifiers (e.g., +1500 for HVT).
- **TurnsToReach:** 1 + ceil((Distance - Range) / Moves).

### Unit Action Scoring
\`FinalScore = (AttackScore * 1.2) + (DefenseScore * 1.5) + (MoveScore * 1.0)\`
- **Stay Put Bias:** +0.5 to prevent jitter.
- **Lethal Threat Penalty:** -2.5x multiplier if moving into a tile where an enemy can kill the unit next turn.

## 5. Advanced Tactical Heuristics
- **Local Superiority Check:** Units calculate a "Support Score" (Allies - Enemies covering a tile). If deeply negative, the unit holds the line instead of pushing.
- **Rally Point Logic:** Units receive a MoveScore bonus for clumping with allies in safe zones adjacent to front lines.
- **Bait & Trade:** The AI will ignore Lethal Threat Penalties if the "Trade Value" (Target Cost - Unit Cost) exceeds 150g (e.g., Infantry for Catapult).
- **Unit Specialization:**
  - **Infantry:** Bonus for attacking units on settlements (Vanguard role).
  - **Knights:** Penalty for being the first to enter a Kill Zone (Sweeper role).
  - **Catapults:** Extreme "Stay Put" bias if no meat shield (Infantry/Knight) is adjacent. Strong recruitment penalty if no meat shield is nearby to protect the spawn point.
- **Settlement Degradation:** Prioritizes attacking settlements that anchor enemy supply lines to restrict enemy movement.

## 6. AI Personalities: Normal vs. Barbarian

### Normal AI (Strategic)
- **Safety First:** Avoids moving high-value units into "Kill Zones".
- **Dynamic Heat Map:** Calculates "Heat" based on enemy proximity. Scores recruitment higher in high-heat zones.
- **Strategic Fortification:** Prioritizes upgrading Villages to Fortresses if enemies are within 3 tiles.
- **Economic Balance:** Saves gold for Gold Mines in low-heat (safe) zones.

### Barbarian AI (Aggressive)
- **Zero Safety:** Ignores "Kill Zone" checks.
- **Pillage Logic:** Prioritizes attacking enemy structures over units to disrupt income.
- **Expansionist:** Spends 1/3 of gold strictly on new Villages.
- **Infantry Spam:** Prioritizes Infantry to overwhelm via numbers.
`;

export const AutomatonHelpModal = ({ isOpen, onClose }: AutomatonHelpModalProps) => {
  const handleDownload = () => {
    const blob = new Blob([RULES_CONTENT], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'automaton_logic_technical.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex flex-col items-center p-4 overflow-y-auto"
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="bg-parchment border-2 border-black p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] relative my-auto"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
                <Cpu size={28} /> Automaton Technical Specs
              </h2>
              <GameButton onClick={onClose} variant="ghost" size="icon">
                <X size={24} />
              </GameButton>
            </div>

            <div className="space-y-6 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <section className="bg-white/50 p-4 border border-black/10 rounded-xl">
                  <h3 className="font-bold mb-2 flex items-center gap-2 text-stone-800 uppercase text-xs tracking-wider">
                    <BookOpen size={16} /> Unit Stats
                  </h3>
                  <div className="space-y-2 font-mono text-[11px]">
                    <div className="flex justify-between border-b border-black/5 pb-1">
                      <span>INFANTRY</span>
                      <span>50G | R1 | M2</span>
                    </div>
                    <div className="flex justify-between border-b border-black/5 pb-1">
                      <span>ARCHER</span>
                      <span>100G | R2 | M2</span>
                    </div>
                    <div className="flex justify-between border-b border-black/5 pb-1">
                      <span>KNIGHT</span>
                      <span>200G | R1 | M4</span>
                    </div>
                    <div className="flex justify-between border-b border-black/5 pb-1">
                      <span>CATAPULT</span>
                      <span>300G | R3 | M1</span>
                    </div>
                  </div>
                </section>

                <section className="bg-white/50 p-4 border border-black/10 rounded-xl">
                  <h3 className="font-bold mb-2 flex items-center gap-2 text-stone-800 uppercase text-xs tracking-wider">
                    <Coins size={16} className="text-amber-600" /> Economy
                  </h3>
                  <div className="space-y-2 font-mono text-[11px]">
                    <div className="flex justify-between border-b border-black/5 pb-1">
                      <span>VILLAGE</span>
                      <span>+20G | 100G Up</span>
                    </div>
                    <div className="flex justify-between border-b border-black/5 pb-1">
                      <span>FORTRESS</span>
                      <span>+40G | 150G Up</span>
                    </div>
                    <div className="flex justify-between border-b border-black/5 pb-1">
                      <span>CASTLE</span>
                      <span>+70G | 300G Up</span>
                    </div>
                    <div className="flex justify-between border-b border-black/5 pb-1">
                      <span>GOLD MINE</span>
                      <span>+100G | 500G Up</span>
                    </div>
                  </div>
                </section>
              </div>

              <section className="bg-stone-900 p-4 border border-black rounded-xl overflow-hidden">
                <h3 className="font-bold mb-2 flex items-center gap-2 text-stone-300 uppercase text-xs tracking-wider">
                  <Code size={16} /> AI Heuristics & Formulae
                </h3>
                <div className="space-y-4 font-mono text-[11px] text-emerald-400">
                  <div>
                    <p className="text-stone-500 mb-1">// Recruitment ROI</p>
                    <code>Score = (TargetVal - Cost) / (1 + ceil((Dist - Range) / Moves))</code>
                  </div>
                  <div>
                    <p className="text-stone-500 mb-1">// Action Priority</p>
                    <code>Final = (Atk * 1.2) + (Def * 1.5) + (Move * 1.0)</code>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px]">
                    <div className="space-y-1">
                      <p className="text-white font-bold underline">NORMAL AI</p>
                      <p>• Safety: Enabled (Threat L1 Penalty)</p>
                      <p>• Heat Map: Dynamic Front-Line Mapping</p>
                      <p>• Tactics: Local Superiority & Bait/Trade</p>
                      <p>• Roles: Infantry Vanguard / Knight Sweeper</p>
                      <p>• Maintenance: Cap at Income/10</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-amber-400 font-bold underline">BARBARIAN AI</p>
                      <p>• Safety: Disabled (Aggressive)</p>
                      <p>• Pillage: Target structures over units</p>
                      <p>• Expansion: 33% Gold to Villages</p>
                      <p>• Focus: High ROI Infantry spam</p>
                    </div>
                  </div>
                </div>
              </section>

              <div className="flex flex-col sm:flex-row gap-3">
                <GameButton 
                  onClick={handleDownload}
                  variant="secondary"
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <Download size={18} /> Download Technical .md
                </GameButton>
                <GameButton 
                  onClick={onClose}
                  variant="primary"
                  className="flex-1"
                >
                  Close
                </GameButton>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
