import React from 'react';
import { motion } from 'motion/react';
import { User, HelpCircle, Upload, ChevronRight } from 'lucide-react';
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
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn(
        "z-20 bg-parchment border-black flex shadow-2xl transition-all duration-300 order-1 lg:order-2",
        "w-full h-44 flex-row overflow-x-auto border-b-2 lg:h-full lg:w-80 lg:flex-col lg:overflow-hidden lg:border-l-2 lg:border-b-0"
      )}
      style={{
        clipPath: 'polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px), 0 10px)'
      }}
    >
      <div className="p-1.5 border-r lg:border-r-0 lg:border-b-2 border-black/10 bg-parchment/50 flex flex-col items-center justify-center gap-1 w-64 lg:w-full flex-shrink-0">
        <div className="grayscale opacity-40 pointer-events-none select-none mb-0.5">
          <span className="text-3xl lg:text-5xl">🏰</span>
        </div>
        <h1 className="relative text-lg lg:text-3xl font-serif font-black tracking-tighter text-center z-10 leading-none" style={{ textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' }}>
          Hex Medieval
        </h1>
        <p className="relative text-[10px] lg:text-sm font-black tracking-[0.1em] opacity-40 z-10 uppercase">Turn Based Tactics</p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 bg-parchment/30 min-w-[280px] lg:min-w-0 border-x lg:border-x-0 border-black/5">
        <div className="neo-brutalist-section space-y-2 !p-2 lg:!p-3">
          <div className="flex justify-center items-center mb-1">
            <h2 className="text-[10px] lg:text-xs font-black tracking-widest flex items-center gap-1.5 opacity-60 uppercase">
              <User size={12} /> Player Setup
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-1 px-0.5">
            {playerConfigs.map((config, i) => (
              <div key={i} className="flex items-center gap-2 p-1.5 border border-black/10 rounded-lg bg-white/50">
                <div className="w-3.5 h-3.5 rounded-full border border-black/30 flex-shrink-0" style={{ backgroundColor: COLORS[i] }} />
                <span className="flex-1 font-black text-xs tracking-tight truncate" style={{ color: COLORS[i], textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' }}>{COLOR_NAMES[COLORS[i]]}</span>
                <GameButton 
                  onClick={() => {
                    const newConfigs = [...playerConfigs];
                    newConfigs[i].isAutomaton = !newConfigs[i].isAutomaton;
                    setPlayerConfigs(newConfigs);
                  }}
                  variant={config.isAutomaton ? "primary" : "ghost"}
                  size="sm"
                  className="border border-black text-[10px] py-0 px-2 h-5 min-h-0"
                >
                  {config.isAutomaton ? "Bot" : "Human"}
                </GameButton>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-1.5 border-l lg:border-l-0 lg:border-t-2 border-black/10 bg-parchment/50 w-56 lg:w-full flex-shrink-0 space-y-1.5 flex flex-col justify-center">
        <GameButton 
          onClick={() => startGame(playerConfigs)}
          variant="primary"
          fullWidth
          className="border-2 border-black py-2.5 lg:py-4 text-xs lg:text-base shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] lg:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
          icon={<ChevronRight size={18} />}
        >
          Commence Conquest
        </GameButton>

        <div className="grid grid-cols-2 gap-1.5">
          <GameButton 
            onClick={handleLoadWithConfirmation}
            variant="ghost"
            fullWidth
            className="border-2 border-black py-1.5 text-[10px] lg:text-sm bg-white"
            icon={<Upload size={14} />}
          >
            Load
          </GameButton>
          
          <GameButton 
            onClick={() => setShowInstructions(true)}
            variant="ghost"
            fullWidth
            className="border-2 border-black py-1.5 text-[10px] lg:text-sm bg-white"
            icon={<HelpCircle size={14} />}
          >
            Help
          </GameButton>
        </div>
      </div>
    </motion.div>
  );
};
