import React, { useState } from 'react';
import { GameButton } from './GameButton';
import { X, Download, Cpu, Code, BookOpen, Coins, BarChart3, Play, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { evolveAsync } from '../automaton-library/GeneticAlgorithm';
import { AIConfig, DEFAULT_AI_CONFIG } from '../automaton-library/AIConfig';
import { cn } from '../types';

interface AutomatonHelpModalProps {
  onClose: () => void;
}

const RULES_CONTENT = `# How automatons play: Technical specifications & ai logic

## 1. Unit specifications
| Unit type | Cost (gold) | Attack range | Movement range |
| :--- | :--- | :--- | :--- |
| **Infantry** | 50 | 1 | 2 |
| **Archer** | 100 | 2 | 2 |
| **Knight** | 200 | 1 | 4 |
| **Catapult** | 300 | 3 | 1 |

**Movement Rule:** Once a unit moves, it may not attack that turn under any circumstances, even on a partial move. Movement ends the unit's turn.

**Note:** All combat is lethal. 1 hit = 1 kill.

## 2. Economic infrastructure
| Settlement type | Income / turn | Upgrade cost |
| :--- | :--- | :--- |
| **Village** | 20 | 100 |
| **Fortress** | 40 | 150 |
| **Castle** | 70 | 300 |
| **Gold mine** | 100 | 500 |

## 3. Terrain effects
- **Forest:** Costs 2 movement points. Catapults cannot target units in forests. Archers in forests have -1 attack range. Units starting in forests have reduced movement (Infantry/Archers: 1, Knights: 2).
- **River (Water):** Impassable to all land units.
- **Mountains:** Costs 3 movement points. Gold mines can only be built on mountains.

## 4. AI core logic (the "conductor")
The ai operates on a **heuristic scoring system**. Every possible action is assigned a score. The ai has **perfect information** (no fog of war).

### Recruitment roi formula
\`Score = (TargetValue - UnitCost) / TurnsToReachTarget\`
- **TargetValue:** 500 (Base) + Modifiers (e.g., +1500 for HVT).
- **TurnsToReach:** 1 + ceil((Distance - Range) / Moves).

### Unit action scoring
\`FinalScore = (AttackScore * 1.2) + (DefenseScore * 1.5) + (MoveScore * 1.0)\`
- **Stay put bias:** +0.5 to prevent jitter.
- **Eminent threat penalty:** -10.0x multiplier if a high-value unit (catapult/knight) moves into an enemy's strike zone without capturing a settlement.
- **Numerical safety (n+1 rule):** ai will "hold the line" if local numerical support is < 1.0 (even trades are rejected).

## 5. Strategic stances (dynamic aggression)
The ai shifts its core personality based on the global state of the game:
- **Stance: Steamroller (advantage):** Triggered when unit ratio is > 2:1 and gold is high. Reduces threat penalties; the ai becomes aggressive to finish the game.
- **Stance: Elite chess (parity):** Default mode. High risk aversion; treats battles like a high-stakes chess match.
- **Stance: Survival pact (struggling):** Triggered if strength is < 35% of the leader. Identifies another underdog for a "secret pact" (90% threat reduction from them) and focuses all aggression on the leader.

## 6. Advanced tactical heuristics
- **Opportunistic retreat:** When fleeing, units prefer neutral settlements or empty plains over forests to facilitate recovery.
- **Leapfrog expansion:** Units prioritize plains at the edge of the supply line to safely and quickly build new villages.
- **Local superiority check:** Units calculate a "support score" (allies - enemies covering a tile). If deeply negative, the unit holds the line instead of pushing.
- **Bait & trade:** The ai will ignore lethal threat penalties if the "trade value" (target cost - unit cost) exceeds 150g (e.g., infantry for catapult).
- **Unit specialization:**
  - **Infantry:** Bonus for attacking units on settlements (vanguard role).
  - **Knights:** Penalty for being the first to enter a kill zone (sweeper role).
  - **Catapults:** Extreme "stay put" bias if no meat shield (infantry/knight) is adjacent. 
- **Settlement degradation:** Prioritizes attacking settlements that anchor enemy supply lines to restrict enemy movement.

## 7. AI personalities: normal vs. barbarian

### Normal ai (strategic)
- **Safety first:** Avoids moving high-value units into "kill zones".
- **Dynamic heat map:** Calculates "heat" based on enemy proximity. Scores recruitment higher in high-heat zones.
- **Strategic fortification:** Prioritizes upgrading villages to fortresses if enemies are within 3 tiles.
- **Economic balance:** Saves gold for gold mines in low-heat (safe) zones.

### Barbarian ai (aggressive)
- **Zero safety:** Ignores "kill zone" checks.
- **Pillage logic:** Prioritizes attacking enemy structures over units to disrupt income.
- **Expansionist:** Spends 1/3 of gold strictly on new villages.
- **Infantry spam:** Prioritizes infantry to overwhelm via numbers.
`;

export const AutomatonHelpModal = ({ onClose }: AutomatonHelpModalProps) => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState({ gen: 0, fitness: 0 });
  const [currentConfig, setCurrentConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
  const [lastResults, setLastResults] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const runLiveSimulation = async () => {
    setIsSimulating(true);
    setLastResults(null);
    setIsCopied(false);
    try {
      const bestConfig = await evolveAsync(8, 3, (gen, fitness) => {
        setSimProgress({ gen: gen + 1, fitness: Math.round(fitness) });
      });
      setCurrentConfig(bestConfig);
      setLastResults(JSON.stringify(bestConfig, null, 2));
    } catch (err) {
      console.error("Simulation failed", err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleCopy = () => {
    if (!lastResults) return;
    navigator.clipboard.writeText(`export const DEFAULT_AI_CONFIG: AIConfig = ${lastResults};`);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownloadConfig = () => {
    if (!lastResults) return;
    const content = `// AUTOMATON OPTIMIZED CONFIGURATION
// Generated via Monte-Carlo Simulation
// Instructions: Upload this file to the /config folder of your application.

export const OPTIMIZED_AI_CONFIG = ${lastResults};`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mco_config.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 z-[10000] overflow-y-auto py-8 px-4"
    >
      <div className="min-h-full flex items-center justify-center">
        <motion.div 
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          className="bg-parchment border-2 border-black p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] relative"
        >
          <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-serif font-black tracking-tight flex items-center gap-2" style={{ textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' }}>
                <Cpu size={28} /> Automaton Technical Specs
              </h2>
              <GameButton onClick={onClose} variant="ghost" size="icon">
                <X size={24} />
              </GameButton>
            </div>

            <div className="space-y-6 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <section className="bg-white/50 p-4 border border-black/10 rounded-xl">
                  <h3 className="font-serif font-bold mb-2 flex items-center gap-2 text-stone-950 text-sm tracking-wider">
                    <BookOpen size={16} /> Unit Stats
                  </h3>
                  <div className="space-y-2 font-mono text-sm">
                    <div className="flex justify-between border-b border-black/5 pb-1">
                      <span>Infantry</span>
                      <span>50g | R1 | M2</span>
                    </div>
                    <div className="flex justify-between border-b border-black/5 pb-1">
                      <span>Archer</span>
                      <span>100g | R2 | M2</span>
                    </div>
                    <div className="flex justify-between border-b border-black/5 pb-1">
                      <span>Knight</span>
                      <span>200g | R1 | M4</span>
                    </div>
                    <div className="flex justify-between border-b border-black/5 pb-1">
                      <span>Catapult</span>
                      <span>300g | R3 | M1</span>
                    </div>
                  </div>
                </section>

                <section className="bg-white/50 p-4 border border-black/10 rounded-xl">
                  <h3 className="font-serif font-bold mb-2 flex items-center gap-2 text-stone-950 text-sm tracking-wider">
                    <Coins size={16} className="text-amber-600" /> Economy
                  </h3>
                  <div className="space-y-2 font-mono text-sm">
                    <div className="flex justify-between border-b border-black/5 pb-1">
                      <span>Village</span>
                      <span>+20g | 100g Up</span>
                    </div>
                    <div className="flex justify-between border-b border-black/5 pb-1">
                      <span>Fortress</span>
                      <span>+40g | 150g Up</span>
                    </div>
                    <div className="flex justify-between border-b border-black/5 pb-1">
                      <span>Castle</span>
                      <span>+70g | 300g Up</span>
                    </div>
                    <div className="flex justify-between border-b border-black/5 pb-1">
                      <span>Gold Mine</span>
                      <span>+100g | 500g Up</span>
                    </div>
                  </div>
                </section>
              </div>

              <section className="bg-stone-900 p-4 border border-black rounded-xl overflow-hidden">
                <h3 className="font-serif font-bold mb-2 flex items-center gap-2 text-stone-100 text-sm tracking-wider">
                  <Code size={16} /> AI Heuristics & Formulae
                </h3>
                <div className="space-y-4 font-mono text-sm text-emerald-400">
                  <div>
                    <p className="text-stone-100 mb-1">// Recruitment ROI</p>
                    <code>Score = (TargetVal - Cost) / (1 + ceil((Dist - Range) / Moves))</code>
                  </div>
                  <div>
                    <p className="text-stone-100 mb-1">// Action Priority</p>
                    <code>Final = (Atk * 1.2) + (Def * 1.5) + (Move * 1.0)</code>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <p className="text-white font-bold underline">Normal AI</p>
                      <p>• Safety: Enabled (Threat L1 Penalty)</p>
                      <p>• Heat Map: Dynamic Front-Line Mapping</p>
                      <p>• Tactics: Local Superiority & Bait/Trade</p>
                      <p>• Roles: Infantry Vanguard / Knight Sweeper</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-amber-400 font-bold underline">Barbarian AI</p>
                      <p>• Safety: Disabled (Aggressive)</p>
                      <p>• Pillage: Target structures over units</p>
                      <p>• Expansion: 33% Gold to Villages</p>
                      <p>• Focus: High ROI Infantry spam</p>
                    </div>
                  </div>
                </div>
              </section>
                        <section className="bg-stone-900 border-2 border-black rounded-xl p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)]">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <div>
                    <h3 className="font-serif font-black text-xl text-amber-50 flex items-center gap-2">
                      <BarChart3 size={20} className="text-amber-400" /> Monte Carlo Optimization
                    </h3>
                    <p className="text-stone-400 text-sm mt-1">Stochastic parameter tuning via genetic evolution</p>
                  </div>
                  <GameButton 
                    variant="primary" 
                    size="lg"
                    onClick={runLiveSimulation}
                    disabled={isSimulating}
                    className="w-full sm:w-auto min-w-[200px]"
                  >
                    {isSimulating ? (
                      <span className="flex items-center gap-2"><Loader2 size={20} className="animate-spin" /> RUNNING...</span>
                    ) : (
                      <span className="flex items-center gap-2"><Play size={20} fill="currentColor" /> RUN EVOLUTION</span>
                    )}
                  </GameButton>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-4 space-y-4">
                    <div className="bg-black/40 border border-stone-800 p-4 rounded-lg">
                      <p className="text-sm font-black tracking-[0.2em] text-stone-500 mb-3">Live Heuristics</p>
                      <div className="space-y-3 font-mono text-sm">
                        <div className="flex justify-between items-center text-stone-300">
                          <span>Forest Danger</span>
                          <span className="text-amber-400">{currentConfig.FOREST_DANGER_PENALTY.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-stone-300">
                          <span>Siege Bonus</span>
                          <span className="text-amber-400">{currentConfig.SIEGE_OVERRIDE_BONUS.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-stone-300">
                          <span>Gold Target</span>
                          <span className="text-amber-400">{currentConfig.GOLD_RESERVE_TARGET.toFixed(0)}</span>
                        </div>
                        <div className="flex justify-between items-center text-stone-300">
                          <span>Lethality</span>
                          <span className="text-amber-400">{currentConfig.LETHALITY_WEIGHT_BONUS.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-amber-400/5 border border-amber-400/20 p-3 rounded-lg">
                      <p className="text-sm font-bold tracking-widest text-amber-400/60 mb-2">Instructions</p>
                      <p className="text-stone-400 text-xs leading-relaxed italic">
                        After evolution completes, download <code className="text-amber-200">mco_config.txt</code> and upload it to your application's <code className="text-amber-200">/config</code> folder to apply the tuned parameters.
                      </p>
                    </div>

                    <div className="bg-amber-400/10 border border-amber-400/20 p-4 rounded-lg flex flex-col items-center justify-center text-center">
                      <p className="text-sm font-bold tracking-widest text-amber-400/60 mb-2">Peak Fitness</p>
                      <div className="text-4xl font-black text-amber-400 tabular-nums">
                        {simProgress.fitness}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-sm text-amber-400/80 font-mono">Iteration {simProgress.gen}/3</span>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-8">
                    <div className="bg-black border border-stone-800 rounded-lg overflow-hidden flex flex-col h-full min-h-[220px]">
                      <div className="bg-stone-800/50 px-4 py-2 border-b border-stone-800 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Code size={14} className="text-stone-500" />
                          <span className="text-sm font-mono text-stone-400">mco_config.txt</span>
                        </div>
                        {lastResults && (
                          <button 
                            onClick={handleCopy}
                            className={cn(
                              "text-sm font-bold px-2 py-1 rounded transition-colors",
                              isCopied ? "bg-green-500 text-black" : "bg-white/10 text-stone-300 hover:bg-white/20"
                            )}
                          >
                            {isCopied ? "COPIED" : "COPY CODE"}
                          </button>
                        )}
                      </div>
                      <div className="p-4 font-mono text-sm leading-relaxed flex-1 overflow-auto scrollbar-thin scrollbar-thumb-stone-800">
                        {isSimulating ? (
                          <div className="text-stone-500 italic flex items-center gap-2">
                            <span className="animate-pulse">_</span> Genetic crossover in progress...
                          </div>
                        ) : lastResults ? (
                          <pre className="text-emerald-400">
                            <code>{`export const DEFAULT_AI_CONFIG: AIConfig = ${lastResults};`}</code>
                          </pre>
                        ) : (
                          <div className="text-stone-700">
                            Ready for optimization run.<br/>
                            $ await GeneticAlgorithm.evolve();
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <div className="flex flex-col sm:flex-row gap-3">
                <GameButton 
                  onClick={handleDownloadConfig}
                  variant="secondary"
                  disabled={!lastResults}
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <Download size={18} /> Download mco_config.txt
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
        </div>
      </motion.div>
    );
  };
