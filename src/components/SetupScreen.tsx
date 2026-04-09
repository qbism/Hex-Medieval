import React from 'react';
import { motion } from 'motion/react';
import { User, HelpCircle, Upload } from 'lucide-react';
import { GameButton } from './GameButton';
import { COLOR_NAMES } from '../constants/colors';

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
    <div className="min-h-full bg-[#2a1a1a] flex flex-col items-center py-12 px-4 sm:p-8 font-serif">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full bg-parchment border-2 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center my-auto"
      >
        <div className="relative mb-8 overflow-hidden border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-stone-100 flex flex-col items-center justify-center py-10 gap-2 w-full">
          <div className="grayscale opacity-60 pointer-events-none select-none">
            <span className="text-[100px] sm:text-[140px]">🏰</span>
          </div>
          <h1 className="text-2xl sm:text-6xl font-black uppercase tracking-tighter text-center">
            Hex Medieval
          </h1>
        </div>
        
        <div className="space-y-4 mb-8 w-full">
          <div className="flex justify-center items-center">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <User size={20} /> Player Setup
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {playerConfigs.map((config, i) => (
              <div key={i} className="flex items-center gap-3 p-3 border border-black/10 rounded-lg bg-stone-50">
                <div className="w-6 h-6 rounded-full border border-black/20" style={{ backgroundColor: COLORS[i] }} />
                <span className="flex-1 font-bold">{COLOR_NAMES[COLORS[i]]}</span>
                <GameButton 
                  onClick={() => {
                    const newConfigs = [...playerConfigs];
                    newConfigs[i].isAutomaton = !newConfigs[i].isAutomaton;
                    setPlayerConfigs(newConfigs);
                  }}
                  variant={config.isAutomaton ? "primary" : "ghost"}
                  size="sm"
                  className="border border-black"
                >
                  {config.isAutomaton ? "AUTOMATON" : "HUMAN"}
                </GameButton>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 w-full max-w-sm items-center">
          <GameButton 
            onClick={() => startGame(playerConfigs)}
            variant="primary"
            size="lg"
            fullWidth
            className="text-lg py-4"
          >
            Start Conquest
          </GameButton>

          <GameButton 
            onClick={handleLoadWithConfirmation}
            variant="secondary"
            size="lg"
            fullWidth
            className="text-lg py-4"
            icon={<Upload size={20} />}
          >
            Load Game
          </GameButton>
          
          <GameButton 
            onClick={() => setShowInstructions(true)}
            variant="ghost"
            size="lg"
            fullWidth
            className="border-2 border-black text-lg py-4"
            icon={<HelpCircle size={20} />}
          >
            How to Play
          </GameButton>
        </div>
      </motion.div>
    </div>
  );
};
