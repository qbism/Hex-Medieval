import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GameButton } from './GameButton';
import { COLOR_NAMES, GameState } from '../types';

interface GameOverOverlayProps {
  gameState: GameState;
  setSetupMode: (setup: boolean) => void;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  triggerBarbarianInvasion: (state: GameState) => GameState;
}

export const GameOverOverlay = ({ 
  gameState, 
  setSetupMode, 
  setGameState,
  triggerBarbarianInvasion
}: GameOverOverlayProps) => {
  return (
    <AnimatePresence>
      {gameState.winnerId !== null && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
        >
          <div className="bg-parchment border-4 border-black p-6 w-80 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="relative mb-6 overflow-hidden border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-stone-100 flex flex-col items-center justify-center py-4 gap-1">
              <div className="grayscale opacity-40 pointer-events-none select-none">
                <span className="text-[50px]">🏰</span>
              </div>
              <div className="text-center">
                <div className="text-4xl mb-1">🏆</div>
                <h2 className="text-xl font-black uppercase tracking-tighter">Conquest Complete</h2>
              </div>
            </div>
            <p className="text-lg mb-4 font-bold" style={{ color: gameState.winnerId === -1 ? 'black' : (gameState.players[gameState.winnerId]?.color || 'black') }}>
              {gameState.winnerId === -1 ? "It's a Draw!" : `${COLOR_NAMES[gameState.players[gameState.winnerId]?.color || '#000']} Empire Victorious!`}
            </p>
            <div className="space-y-2">
              <GameButton 
                onClick={() => {
                  setSetupMode(true);
                  setGameState(null);
                }}
                variant="primary"
                fullWidth
                className="py-2 text-sm"
              >
                Main Menu
              </GameButton>
              {gameState.winnerId !== -1 && !gameState.isBarbarianInvasion && (
                <GameButton 
                  onClick={() => {
                    setGameState(prev => prev ? triggerBarbarianInvasion(prev) : prev);
                  }}
                  variant="danger"
                  fullWidth
                  className="py-2 text-sm"
                >
                  Barbarian Invasion
                </GameButton>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
