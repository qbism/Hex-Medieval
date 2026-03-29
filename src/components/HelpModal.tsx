import React from 'react';
import { Play, Coins, HelpCircle, RotateCcw, Sword, Shield, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TerrainType, UnitType, UNIT_ICONS, UNIT_STATS, SETTLEMENT_INCOME } from '../types';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal = ({ isOpen, onClose }: HelpModalProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="bg-white border-2 border-black p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]"
          >
            <div className="flex justify-between items-center mb-6 border-b-2 border-black pb-4">
              <h2 className="text-3xl font-black uppercase tracking-tight">How to Play</h2>
              <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-8">
              <section>
                <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                  <Play size={18} fill="black" /> The Objective
                </h3>
                <p className="text-stone-600 leading-relaxed">
                  Capture settlements and defeat enemy units. Control the map by moving your units onto Villages, Fortresses, and Castles. 
                </p>
              </section>

              <section className="bg-amber-50 p-6 rounded-2xl border border-amber-100">
                <h3 className="text-xl font-bold mb-3 flex items-center gap-2 text-amber-900">
                  <Coins size={18} /> Economy: Earning Gold
                </h3>
                <p className="text-sm text-amber-800 leading-relaxed mb-3">
                  Gold is the lifeblood of your empire. You earn it automatically at the start of every turn:
                </p>
                <ul className="space-y-2 text-sm text-amber-800">
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Villages grant <span className="font-bold">{SETTLEMENT_INCOME[TerrainType.VILLAGE]} Gold</span>, Fortresses <span className="font-bold">{SETTLEMENT_INCOME[TerrainType.FORTRESS]} Gold</span>, Castles <span className="font-bold">{SETTLEMENT_INCOME[TerrainType.CASTLE]} Gold</span>, and Gold Mines <span className="font-bold">{SETTLEMENT_INCOME[TerrainType.GOLD_MINE]} Gold</span> per turn.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Capture enemy settlements by moving a unit onto them.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Build new settlements on Plains if you occupy them with a unit.</span>
                  </li>
                </ul>
              </section>

              <section className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                <h3 className="text-xl font-bold mb-3 flex items-center gap-2 text-blue-900">
                  <HelpCircle size={18} /> Pro Tips
                </h3>
                <ul className="space-y-3 text-sm text-blue-800">
                  <li className="flex gap-2">
                    <span className="font-bold">1.</span>
                    <span>Always check the <span className="font-bold">Intel Section</span> in the sidebar. It shows unit stats and recruitment options.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold">2.</span>
                    <span><span className="font-bold text-red-700">Supply Range:</span> Units cannot move further from a friendly settlement than their movement range. (e.g., Knights can only move up to 4 hexes away from a settlement).</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold">3.</span>
                    <span><span className="font-bold text-green-700">Combat:</span> Units die in one hit. If an undefended Castle is attacked, it reverts to a Fortress. If a Fortress is attacked, it reverts to a Village. If a Village is attacked, it becomes neutral. If a defended settlement is attacked, the defending unit dies but the settlement remains owned.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold">4.</span>
                    <span><span className="font-bold text-indigo-700">Upgrades:</span> Upgrade your Villages to Fortresses and then Castles. Build Gold Mines on Mountains for massive income.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold">5.</span>
                    <span><span className="font-bold text-blue-700">Water & Sailing:</span> To enter water, you must be adjacent to a <span className="font-bold">Village/Settlement</span>. Once in water (⛵), you can move freely between adjacent water tiles. The map is surrounded by a deep water perimeter.</span>
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                  <RotateCcw size={18} /> Controls
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="p-3 border border-black/5 rounded-lg">
                    <p className="font-bold mb-1">Navigation</p>
                    <p className="text-stone-500">Drag to pan. Pinch or use mouse wheel to zoom.</p>
                  </div>
                  <div className="p-3 border border-black/5 rounded-lg">
                    <p className="font-bold mb-1">Selection</p>
                    <p className="text-stone-500">Click a unit to see its moves. Click a tile to see its info.</p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                  <Sword size={18} /> Units & Combat
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  {(Object.keys(UNIT_STATS) as UnitType[]).map(type => (
                    <div key={type} className="p-4 border border-black/10 rounded-xl bg-stone-50">
                      <div className="text-3xl mb-2">{UNIT_ICONS[type]}</div>
                      <p className="font-bold">{type.charAt(0) + type.slice(1).toLowerCase()}</p>
                      <p className="text-body opacity-60">Range: {UNIT_STATS[type].range}. Moves: {UNIT_STATS[type].moves}.</p>
                    </div>
                  ))}
                </div>
                <div className="p-4 bg-stone-100 border border-black/10 rounded-xl">
                  <p className="font-bold text-sm mb-1 flex items-center gap-2">
                    <Shield size={16} /> Attacking Settlements
                  </p>
                  <p className="text-body text-stone-600 leading-relaxed">
                    Units die in one hit. If you attack an undefended enemy Castle, it reverts to a Fortress. A Fortress reverts to a Village. A Village becomes neutral (unclaimed). If you attack a settlement occupied by an enemy unit, the unit is destroyed but the settlement remains under enemy control.
                  </p>
                </div>
              </section>

              <button 
                onClick={onClose}
                className="w-full bg-black text-white py-3 font-bold uppercase tracking-widest hover:bg-stone-800 transition-colors"
              >
                Got it!
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
