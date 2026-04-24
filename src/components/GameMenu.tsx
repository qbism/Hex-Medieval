import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Save, Upload, RotateCcw, ChevronRight, Play, Volume2, Music } from 'lucide-react';
import { GameButton } from './GameButton';

interface GameMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onExitCurrent: () => void;
  onExitAll: () => void;
  onSave: () => void;
  onLoad: () => void;
  onSaveDemo: () => void;
  onLoadDemo: () => void;
  musicVolume: number;
  setMusicVolume: (vol: number) => void;
  effectsVolume: number;
  setEffectsVolume: (vol: number) => void;
}

export const GameMenu = ({ 
  isOpen, 
  onClose, 
  onExitCurrent, 
  onExitAll,
  onSave,
  onLoad,
  onSaveDemo,
  onLoadDemo,
  musicVolume,
  setMusicVolume,
  effectsVolume,
  setEffectsVolume
}: GameMenuProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex flex-col items-center p-4 overflow-y-auto"
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="neo-brutalist-card-lg max-w-md w-full my-auto"
          >
            <div className="relative mb-8 overflow-hidden neo-brutalist-section py-6 flex flex-col items-center justify-center gap-1">
              <div className="grayscale opacity-40 pointer-events-none select-none">
                <Settings size={60} />
              </div>
              <h2 className="text-2xl sm:text-3xl font-serif font-black tracking-tight text-center">
                Game Menu
              </h2>
            </div>
            
            <div className="space-y-3">
              {/* Volume Sliders */}
              <div className="neo-brutalist-section mb-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm font-black tracking-widest gap-2">
                    <div className="flex items-center gap-2">
                      <Music size={14} />
                      <span>Music volume</span>
                    </div>
                    <div className="flex-1" />
                    <span>{Math.round(musicVolume * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01" 
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                    className="w-full h-2 bg-stone-300 rounded-none appearance-none cursor-pointer accent-black border border-black"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm font-black tracking-widest">
                    <div className="flex items-center gap-2">
                      <Volume2 size={14} />
                      <span>Effects volume</span>
                    </div>
                    <span>{Math.round(effectsVolume * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01" 
                    value={effectsVolume}
                    onChange={(e) => setEffectsVolume(parseFloat(e.target.value))}
                    className="w-full h-2 bg-stone-300 rounded-none appearance-none cursor-pointer accent-black border border-black"
                  />
                </div>
              </div>

              <GameButton 
                onClick={onSave}
                variant="ghost"
                fullWidth
                className="border-2 border-black justify-between"
                icon={<Save size={20} />}
              >
                <span>Save game</span>
                <ChevronRight size={20} />
              </GameButton>

              <GameButton 
                onClick={onLoad}
                variant="ghost"
                fullWidth
                className="border-2 border-black justify-between"
                icon={<Upload size={20} />}
              >
                <span>Load game</span>
                <ChevronRight size={20} />
              </GameButton>

              <div className="h-px bg-black/20 my-2" />

              <GameButton 
                onClick={onSaveDemo}
                variant="ghost"
                fullWidth
                className="border-2 border-black justify-between"
                icon={<Save size={20} />}
              >
                <span>Save demo (.hexd)</span>
                <ChevronRight size={20} />
              </GameButton>

              <GameButton 
                onClick={onLoadDemo}
                variant="ghost"
                fullWidth
                className="border-2 border-black justify-between"
                icon={<Upload size={20} />}
              >
                <span>Load demo (.hexd)</span>
                <ChevronRight size={20} />
              </GameButton>

              <div className="h-px bg-black/20 my-2" />

              <GameButton 
                onClick={onExitCurrent}
                variant="ghost"
                fullWidth
                className="border-2 border-black justify-between"
                icon={<RotateCcw size={20} />}
              >
                <span>Exit current player</span>
                <ChevronRight size={20} />
              </GameButton>
              
              <GameButton 
                onClick={onExitAll}
                variant="danger"
                fullWidth
                className="border-2 border-black justify-between"
                icon={<RotateCcw size={20} />}
              >
                <span>Exit all (reset game)</span>
                <ChevronRight size={20} />
              </GameButton>
              
              <GameButton 
                onClick={onClose}
                variant="primary"
                fullWidth
                className="border-2 border-black justify-between"
                icon={<Play size={20} />}
              >
                <span>Return to game</span>
                <ChevronRight size={20} />
              </GameButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
