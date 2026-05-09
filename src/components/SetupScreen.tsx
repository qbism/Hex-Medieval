import React from 'react';
import { motion } from 'motion/react';
import { HelpCircle, Upload, ChevronRight } from 'lucide-react';
import { GameButton } from './GameButton';
import { COLOR_NAMES } from '../constants/colors';
import { cn } from '../types';

interface PlayerConfig {
  name: string;
  isAutomaton: boolean;
}

interface SetupScreenProps {
  playerConfigs: PlayerConfig[];
  setPlayerConfigs: React.Dispatch<React.SetStateAction<PlayerConfig[]>>;
  startGame: (configs: PlayerConfig[]) => void;
  handleLoadWithConfirmation: () => void;
  setShowInstructions: (show: boolean) => void;
  COLORS: string[];
}

export const SetupScreen = ({ 
  playerConfigs, 
  setPlayerConfigs, 
  startGame, 
  handleLoadWithConfirmation,
  setShowInstructions,
  COLORS,
}: SetupScreenProps) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="menu-overlay menu-overlay-top"
    >
      <motion.div 
        initial={{ scale: 0.95, x: 40, opacity: 0 }}
        animate={{ scale: 1, x: 0, opacity: 1 }}
        exit={{ scale: 0.95, x: 40, opacity: 0 }}
        className="menu-card"
      >
        <div className="flex items-center gap-3 mb-2 border-b-2 border-black pb-2">
          <div>
            <h2 className="text-xl font-black tracking-tight leading-none">Setup Players</h2>
          </div>
        </div>

        {/* SECTION 1: PLAYER SETUP (Ultra-Dense Grid) */}
        <div className="w-full grid grid-cols-1 gap-1.5">
          {playerConfigs.map((config, i) => (
            <div key={i} className="flex items-center gap-3 p-2 border-2 border-black/20 rounded-lg bg-white/60 backdrop-blur-sm shrink-0 min-w-0">
              <div 
                className="w-5 h-5 rounded-full border border-black/40 shrink-0" 
                style={{ backgroundColor: COLORS[i] }} 
              />
              <span 
                className="flex-1 font-black text-base tracking-tight truncate leading-none"
                style={{ 
                  color: COLORS[i], 
                  textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' 
                }}
              >
                {(COLOR_NAMES[COLORS[i]] || 'Unknown').split(' ')[0]}
              </span>
              <button 
                onClick={() => {
                  const newConfigs = [...playerConfigs];
                  newConfigs[i].isAutomaton = !newConfigs[i].isAutomaton;
                  setPlayerConfigs(newConfigs);
                }}
                className={cn(
                  "px-3 py-1 rounded-md text-sm font-black border border-black transition-all shrink-0 active:scale-95 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]",
                  config.isAutomaton ? "bg-amber-400 text-black shadow-none translate-x-[0.5px] translate-y-[0.5px]" : "bg-blue-600 text-white"
                )}
              >
                {config.isAutomaton ? "Automaton" : "Human"}
              </button>
            </div>
          ))}
        </div>

        {/* SECTION 2: ACTIONS */}
        <div className="pt-2 border-t-2 border-black/10">
          <div className="flex gap-2">
            <GameButton 
              onClick={handleLoadWithConfirmation}
              variant="ghost"
              className="flex-1 py-2 px-3 border-2 border-black bg-white !text-lg font-black whitespace-nowrap"
              icon={<Upload size={18} />}
            >
              Load
            </GameButton>
            <GameButton 
              onClick={() => setShowInstructions(true)}
              variant="ghost"
              className="flex-1 py-2 px-3 border-2 border-black bg-white !text-lg font-black whitespace-nowrap"
              icon={<HelpCircle size={18} />}
            >
              Help
            </GameButton>
            <GameButton 
              onClick={() => startGame(playerConfigs)}
              variant="primary"
              className="flex-[1.5] py-2 px-4 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] !text-lg font-black tracking-tight active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
              icon={<ChevronRight size={20} />}
            >
              Start
            </GameButton>
          </div>
        </div>
      </motion.div>

      {/* FLOATING TITLE (Moved to absolute position within overlay or adjacent) */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="fixed bottom-4 sm:bottom-8 left-0 right-0 pointer-events-none flex flex-col items-center justify-center p-2 z-[102]"
      >
        <h1 
          className="text-4xl sm:text-8xl font-serif font-black tracking-tighter leading-none text-center italic"
          style={{ 
            textShadow: '2px 2px 0 #fff, -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 4px 4px 0 #000, 0 8px 15px rgba(0,0,0,0.5)' 
          }}
        >
          Hex Medieval
        </h1>
        <div className="px-4 py-0.5 mt-1 sm:mt-2 transform -skew-x-12">
          <span 
            className="text-sm sm:text-lg font-black tracking-normal"
            style={{ 
              color: 'black',
              textShadow: '1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff'
            }}
          >
            Turn Based Tactics
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
};
