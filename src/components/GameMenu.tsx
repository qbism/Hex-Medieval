import React from 'react';
import { motion } from 'motion/react';
import { Save, Upload, RotateCcw, ChevronRight, Play, Volume2, Music, X, HelpCircle } from 'lucide-react';
import { GameButton } from './GameButton';

interface GameMenuProps {
  onClose: () => void;
  onExitCurrent: () => void;
  onExitAll: () => void;
  onSave: () => void;
  onLoad: () => void;
  onSaveDemo: () => void;
  onLoadDemo: () => void;
  onShowHelp: () => void;
  musicVolume: number;
  setMusicVolume: (vol: number) => void;
  effectsVolume: number;
  setEffectsVolume: (vol: number) => void;
}

export const GameMenu = ({ 
  onClose, 
  onExitCurrent, 
  onExitAll,
  onSave,
  onLoad,
  onSaveDemo,
  onLoadDemo,
  onShowHelp,
  musicVolume,
  setMusicVolume,
  effectsVolume,
  setEffectsVolume
}: GameMenuProps) => {
  React.useEffect(() => {
    // Esc key handling
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="menu-overlay"
    >
      <motion.div 
        initial={{ scale: 0.95, x: 40, opacity: 0 }}
        animate={{ scale: 1, x: 0, opacity: 1 }}
        exit={{ scale: 0.95, x: 40, opacity: 0 }}
        className="menu-card"
      >
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 hover:bg-black/5 rounded-full transition-colors z-20"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-4 border-b-2 border-black pb-2">
          <div>
            <h2 className="text-lg font-black tracking-tight leading-none">Game menu</h2>
          </div>
        </div>
        
        <div className="space-y-4">
          {/* Volume Section */}
          <div className="space-y-3 bg-black/5 p-3 rounded-xl border border-black/5">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm font-black tracking-normal">
                <div className="flex items-center gap-1.5 opacity-60">
                  <Music size={14} />
                  <span>Music</span>
                </div>
                <span className="bg-white px-2 rounded border border-black/10 font-mono">{Math.round(musicVolume * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05" 
                value={musicVolume}
                onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                className="w-full h-2 bg-stone-300 rounded-full appearance-none cursor-pointer accent-black"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm font-black tracking-normal">
                <div className="flex items-center gap-1.5 opacity-60">
                  <Volume2 size={14} />
                  <span>Effects</span>
                </div>
                <span className="bg-white px-2 rounded border border-black/10 font-mono">{Math.round(effectsVolume * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05" 
                value={effectsVolume}
                onChange={(e) => setEffectsVolume(parseFloat(e.target.value))}
                className="w-full h-2 bg-stone-300 rounded-full appearance-none cursor-pointer accent-black"
              />
            </div>
          </div>

          {/* Actions Grid */}
          <div className="grid grid-cols-2 gap-2">
            <GameButton onClick={onSave} variant="ghost" className="border-2 border-black py-2 text-sm font-black bg-white" icon={<Save size={18} />}>
              Save
            </GameButton>
            <GameButton onClick={onLoad} variant="ghost" className="border-2 border-black py-2 text-sm font-black bg-white" icon={<Upload size={18} />}>
              Load
            </GameButton>
            <GameButton onClick={onSaveDemo} variant="ghost" className="border-2 border-black py-2 text-sm font-bold bg-white/50" icon={<Save size={16} />}>
              Save (.hexd)
            </GameButton>
            <GameButton onClick={onLoadDemo} variant="ghost" className="border-2 border-black py-2 text-sm font-bold bg-white/50" icon={<Upload size={16} />}>
              Load (.hexd)
            </GameButton>
          </div>

          <div className="space-y-2 pt-2 border-t border-black/10">
            <GameButton 
              onClick={onShowHelp}
              variant="ghost"
              fullWidth
              className="border-2 border-black justify-between py-2 px-4 bg-white hover:bg-stone-50"
            >
              <div className="flex items-center gap-2">
                <HelpCircle size={18} />
                <span className="text-sm font-black">How to Play</span>
              </div>
              <ChevronRight size={18} />
            </GameButton>

            <GameButton 
              onClick={onExitCurrent}
              variant="ghost"
              fullWidth
              className="border-2 border-black justify-between py-2 px-4 bg-white hover:bg-stone-50"
            >
              <div className="flex items-center gap-2">
                <RotateCcw size={18} />
                <span className="text-sm font-black">Exit player</span>
              </div>
              <ChevronRight size={18} />
            </GameButton>
            
            <GameButton 
              onClick={onExitAll}
              variant="danger"
              fullWidth
              className="border-2 border-black justify-between py-2 px-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
            >
              <div className="flex items-center gap-2">
                <X size={18} />
                <span className="text-sm font-black">Quit Game</span>
              </div>
            </GameButton>
            
            <GameButton 
              onClick={onClose}
              variant="primary"
              fullWidth
              className="border-2 border-black py-3 mt-1 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
              icon={<Play size={20} />}
            >
              <span className="text-sm font-black tracking-tight">Resume</span>
            </GameButton>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
