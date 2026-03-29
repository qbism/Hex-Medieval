import React from 'react';
import { motion } from 'motion/react';
import { User, HelpCircle, Play } from 'lucide-react';
import { cn, COLOR_NAMES } from '../types';
import { HelpModal } from './HelpModal';

interface PlayerConfig {
  name: string;
  isAutomaton: boolean;
}

interface SetupScreenProps {
  playerConfigs: PlayerConfig[];
  setPlayerConfigs: React.Dispatch<React.SetStateAction<PlayerConfig[]>>;
  startGame: () => void;
  showInstructions: boolean;
  setShowInstructions: (show: boolean) => void;
  COLORS: string[];
}

export const SetupScreen = ({ 
  playerConfigs, 
  setPlayerConfigs, 
  startGame, 
  showInstructions, 
  setShowInstructions,
  COLORS
}: SetupScreenProps) => {
  return (
    <div className="min-h-screen bg-[#2a1a1a] flex items-center justify-center p-8 font-serif">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full bg-white border-2 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
      >
        <h1 className="text-5xl font-black uppercase tracking-tighter mb-8 border-b-4 border-black pb-4">
          Hex Medieval
        </h1>
        
        <div className="space-y-4 mb-8">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <User size={20} /> Player Setup
            </h2>
            <button 
              onClick={() => setShowInstructions(true)}
              className="bg-stone-100 hover:bg-stone-200 text-black border border-black/20 px-4 py-2 rounded-full flex items-center gap-2 text-sm font-black uppercase tracking-wider transition-all"
            >
              <HelpCircle size={18} className="text-blue-600" /> How to Play
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {playerConfigs.map((config, i) => (
              <div key={i} className="flex items-center gap-3 p-3 border border-black/10 rounded-lg bg-stone-50">
                <div className="w-6 h-6 rounded-full border border-black/20" style={{ backgroundColor: COLORS[i] }} />
                <span className="flex-1 font-bold">{COLOR_NAMES[COLORS[i]]}</span>
                <button 
                  onClick={() => {
                    const newConfigs = [...playerConfigs];
                    newConfigs[i].isAutomaton = !newConfigs[i].isAutomaton;
                    setPlayerConfigs(newConfigs);
                  }}
                  className={cn(
                    "px-3 py-1 rounded-md text-label font-bold uppercase tracking-wider transition-all border border-black",
                    config.isAutomaton ? "bg-black text-white" : "bg-white text-black"
                  )}
                >
                  {config.isAutomaton ? "AUTOMATON" : "HUMAN"}
                </button>
              </div>
            ))}
          </div>
        </div>

        <button 
          onClick={startGame}
          className="w-full bg-black text-white py-4 text-2xl font-bold uppercase tracking-widest hover:bg-stone-800 transition-colors flex items-center justify-center gap-3"
        >
          <Play fill="white" /> Start Conquest
        </button>
      </motion.div>
      <HelpModal isOpen={showInstructions} onClose={() => setShowInstructions(false)} />
    </div>
  );
};
