import React, { useState } from 'react';
import { GameButton } from './GameButton';
import { Play, Coins, HelpCircle, RotateCcw, Sword, Shield, X, PlusCircle, Music, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TerrainType, UnitType, UNIT_ICONS, UNIT_STATS, SETTLEMENT_INCOME, UPGRADE_COSTS } from '../types';
import { AutomatonHelpModal } from './AutomatonHelpModal';

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal = ({ onClose }: HelpModalProps) => {
  const [isAutomatonModalOpen, setIsAutomatonModalOpen] = useState(false);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="menu-overlay"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="menu-card max-w-2xl max-h-[90vh] overflow-y-auto"
      >
          <div className="relative mb-8 overflow-hidden neo-brutalist-section py-6 flex flex-col items-center justify-center gap-1">
              <div className="grayscale opacity-40 pointer-events-none select-none">
                <span className="text-[60px]">🏰</span>
              </div>
              <div className="relative flex justify-between items-center px-4 w-full">
                <div className="w-10" /> {/* Spacer for centering */}
                <h2 className="text-2xl sm:text-4xl font-serif font-black tracking-tight text-center" style={{ textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' }}>Game Rules</h2>
                <GameButton 
                  onClick={onClose} 
                  variant="ghost"
                  size="icon"
                  className="p-2 bg-white/20 backdrop-blur-sm border border-black/10"
                >
                  <X size={24} />
                </GameButton>
              </div>
            </div>

            <div className="space-y-8">
            <section>
              <h3 className="text-xl font-serif font-black mb-3 flex items-center gap-2">
                <Play size={18} fill="black" /> Victory Conditions
              </h3>
              <p className="text-stone-900 leading-relaxed font-sans">
                Eliminate all opposing factions by turning their settlements neutral and eliminating their units. A player is eliminated when they lose all their units and settlements, or when they leave the game and their remaining units turn barbarian.
              </p>
            </section>

            <section className="bg-red-50 p-6 rounded-2xl border border-red-100">
              <h3 className="text-xl font-serif font-black mb-3 flex items-center gap-2 text-red-900">
                <Sword size={18} /> Barbarian Invasion
              </h3>
              <p className="text-sm text-red-800 leading-relaxed font-sans">
                After a faction achieves victory, a <span className="font-bold">Barbarian Invasion</span> can be triggered. A massive horde of barbarian villages and units will spawn from the edges of the map, challenging the victor to hold their empire against overwhelming odds.
              </p>
            </section>

            <section className="bg-amber-50 p-6 rounded-2xl border border-amber-100">
              <h3 className="text-xl font-serif font-black mb-3 flex items-center gap-2 text-amber-900">
                <Coins size={18} /> Economy & Expansion
              </h3>
              <p className="text-sm text-amber-800 leading-relaxed mb-3">
                Gold is generated at the start of each turn based on your controlled settlements:
              </p>
              <ul className="space-y-2 text-sm text-amber-800">
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span><span className="font-bold">Income:</span> Village (+{SETTLEMENT_INCOME[TerrainType.VILLAGE]}), Fortress (+{SETTLEMENT_INCOME[TerrainType.FORTRESS]}), Castle (+{SETTLEMENT_INCOME[TerrainType.CASTLE]}), Gold Mine (+{SETTLEMENT_INCOME[TerrainType.GOLD_MINE]}).</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span><span className="font-bold">Capture:</span> Move any unit onto an <span className="font-bold">unclaimed</span> settlement to seize control. You cannot move directly onto an enemy-owned settlement; it must first be reduced to a neutral Village via attacks.</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span><span className="font-bold">Founding:</span> Spend {UPGRADE_COSTS[TerrainType.VILLAGE]}g to build a Village on a Plains hex occupied by your unit.</span>
                </li>
              </ul>
            </section>

            <section className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
              <h3 className="text-xl font-serif font-black mb-3 flex items-center gap-2 text-indigo-900">
                <PlusCircle size={18} /> Upgrades & Construction
              </h3>
              <ul className="space-y-2 text-sm text-indigo-800">
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-400" />
                  <span><span className="font-bold text-indigo-700">Fortification:</span> Upgrade Villages to Fortresses ({UPGRADE_COSTS[TerrainType.FORTRESS]}g) and then Castles ({UPGRADE_COSTS[TerrainType.CASTLE]}g) to increase income and defense.</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-400" />
                  <span><span className="font-bold text-indigo-700">Mining:</span> Build Gold Mines on Mountain tiles ({UPGRADE_COSTS[TerrainType.GOLD_MINE]}g) for the highest possible income.</span>
                </li>
              </ul>
            </section>

            <section className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
              <h3 className="text-xl font-serif font-black mb-3 flex items-center gap-2 text-blue-900">
                <HelpCircle size={18} /> Core Mechanics
              </h3>
              <ul className="space-y-3 text-sm text-blue-800">
                <li className="flex gap-2">
                  <span className="font-bold">1.</span>
                  <span><span className="font-bold text-red-700">Supply Range:</span> Units cannot end their move further from a friendly settlement than their maximum movement range (e.g., Knights must stay within 4 hexes of a settlement).</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">2.</span>
                  <span><span className="font-bold text-green-700">One-Hit Combat:</span> All units are <span className="font-bold">eliminated in one hit</span> upon receiving an attack. Defending a settlement sacrifices the unit but protects the structure from degradation.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">3.</span>
                  <span><span className="font-bold text-indigo-700">Siege Mechanics:</span> Attacking an undefended enemy settlement degrades its tier: Castle → Fortress → Village → Neutral. Once it becomes a Neutral Village, any unit can move onto it to capture it.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">4.</span>
                  <span><span className="font-bold text-blue-700">Maritime Travel:</span> Units can only enter Water hexes from an adjacent friendly settlement. Once at sea, they move freely between Water tiles.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">5.</span>
                  <span><span className="font-bold text-emerald-700">Forest Cover:</span> Entering a forest costs 2 movement points (prorated: can enter with 1 point left). Units in forests are <span className="font-bold text-red-700">immune to Catapult attacks</span>. Catapults cannot enter forests.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">6.</span>
                  <span><span className="font-bold text-amber-700">Terrain Modifiers:</span> Archers lose <span className="font-bold text-red-700">-1 Range</span> when attacking from Forest tiles.</span>
                </li>
              </ul>
            </section>

            <section className="bg-purple-50 p-6 rounded-2xl border border-purple-100">
              <h3 className="text-xl font-serif font-black mb-3 flex items-center gap-2 text-purple-900">
                <Music size={18} /> Music & Atmosphere
              </h3>
              <p className="text-sm text-purple-800 leading-relaxed mb-3">
                The game features a <span className="font-bold">procedural music engine</span> that generates a custom soundtrack for your campaign.
              </p>
              <ul className="space-y-2 text-sm text-purple-800">
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-400" />
                  <span><span className="font-bold">Volume Control:</span> Open the <span className="font-bold">Game Menu</span> (Settings icon) to adjust Music and Effects volume sliders individually.</span>
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-xl font-serif font-black mb-3 flex items-center gap-2">
                <RotateCcw size={18} /> Controls & Actions
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="p-3 border border-black/5 rounded-lg">
                  <p className="font-bold mb-1">Unit Actions</p>
                  <p className="text-stone-900">Select a unit to see move/attack ranges. Click a blue hex to move, or a red hex to attack.</p>
                </div>
                <div className="p-3 border border-black/5 rounded-lg">
                  <p className="font-bold mb-1">Management</p>
                  <p className="text-stone-900">Click a friendly settlement to recruit units or upgrade the structure. Click empty hexes for terrain info.</p>
                </div>
                <div className="p-3 border border-black/5 rounded-lg">
                  <p className="font-bold mb-1">Camera</p>
                  <p className="text-stone-900">Drag to pan. Scroll or pinch to zoom. The camera follows the active player.</p>
                </div>
                <div className="p-3 border border-black/5 rounded-lg">
                  <p className="font-bold mb-1">Turn Flow</p>
                  <p className="text-stone-900">Use the "End Turn" button in the sidebar to pass play to the next faction.</p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-xl font-serif font-black mb-3 flex items-center gap-2">
                <Sword size={18} /> Units & Combat
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {(Object.keys(UNIT_STATS) as UnitType[]).map(type => (
                  <div key={type} className="p-4 border border-black/10 rounded-xl bg-stone-50">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="text-3xl">{UNIT_ICONS[type]}</div>
                      <div>
                        <p className="font-bold text-lg">{type.charAt(0) + type.slice(1).toLowerCase()}</p>
                        <p className="text-sm font-black tracking-wider">
                          Range: {UNIT_STATS[type].range} | Moves: {UNIT_STATS[type].moves}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-stone-900 leading-relaxed">
                      {type === UnitType.INFANTRY && "The backbone of the army. Cheap and reliable frontline units that must be adjacent to an enemy to strike. Ideal for holding settlements and absorbing attacks."}
                      {type === UnitType.ARCHER && "Ranged support that can strike from 2 hexes away. Highly effective when positioned behind infantry, but suffer a -1 Range penalty when firing from forests."}
                      {type === UnitType.KNIGHT && "Elite cavalry with superior mobility (4 moves). Excellent for seizing neutral villages and flanking, but must stay within 4 hexes of a settlement to remain supplied."}
                      {type === UnitType.CATAPULT && "Slow but devastating siege engines with 3 range. Essential for degrading enemy Castles. Immune to forest units but cannot hit forest targets; they cannot enter forests."}
                    </p>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-stone-100 border border-black/10 rounded-xl">
                <p className="font-bold text-sm mb-1 flex items-center gap-2">
                  <Shield size={16} /> Attacking Settlements
                </p>
                <p className="text-sm text-stone-900 leading-relaxed">
                  Units are eliminated in one hit. If you attack an undefended enemy Castle, it reverts to a Fortress. A Fortress reverts to a Village. A Village becomes neutral (unclaimed). If you attack a settlement occupied by an enemy unit, the unit is eliminated but the settlement remains under enemy control.
                </p>
              </div>
            </section>

            <div className="flex flex-col gap-3">
              <GameButton 
                onClick={() => setIsAutomatonModalOpen(true)}
                variant="secondary"
                size="lg"
                fullWidth
                className="py-4 flex items-center justify-center gap-2"
              >
                <Cpu size={20} /> How Automatons Play
              </GameButton>
              <GameButton 
                onClick={onClose}
                variant="primary"
                size="lg"
                fullWidth
                className="py-4"
              >
                Got it!
              </GameButton>
            </div>
          </div>
        </motion.div>
      <AnimatePresence>
        {isAutomatonModalOpen && (
          <AutomatonHelpModal 
            onClose={() => setIsAutomatonModalOpen(false)} 
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};
