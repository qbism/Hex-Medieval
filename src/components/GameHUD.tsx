import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GameButton } from './GameButton';
import { 
  ChevronRight, 
  Trophy, 
  RotateCcw, 
  Settings 
} from 'lucide-react';
import { 
  GameState, 
  COLOR_NAMES, 
  cn as _cn 
} from '../types';

interface GameHUDProps {
  gameState: GameState;
  currentPlayer: any;
  handleEndTurn: () => void;
  setSetupMode: (setup: boolean) => void;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
}

export const GameHUD = ({
  gameState,
  currentPlayer,
  handleEndTurn,
  setSetupMode,
  setGameState
}: GameHUDProps) => {
  return (
    <>
      {/* Bottom Action Bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-lg px-4">
        <div className="bg-white border-2 border-black p-3 flex items-center justify-between shadow-2xl rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border-2 border-black flex items-center justify-center shadow-sm" style={{ backgroundColor: currentPlayer.color }}>
              <span className="text-white font-black text-xl drop-shadow-md">
                {currentPlayer.id + 1}
              </span>
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-widest opacity-50 leading-none mb-1">Current Turn</p>
              <p className="text-lg font-black leading-none">{COLOR_NAMES[currentPlayer.color]} Empire</p>
            </div>
          </div>

          <GameButton
            onClick={handleEndTurn}
            disabled={currentPlayer.isAutomaton}
            variant="primary"
            size="md"
            className="px-6 py-3"
            icon={<ChevronRight className="ml-2" />}
          >
            <span className="uppercase tracking-widest text-sm">
              {currentPlayer.isAutomaton ? "Processing..." : "End Turn"}
            </span>
          </GameButton>
        </div>
      </div>

      {/* Game Over Overlay */}
      <AnimatePresence>
        {gameState.winnerId !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white border-4 border-black p-8 max-w-md w-full text-center shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] rounded-3xl"
            >
              <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-black shadow-lg">
                <Trophy size={48} className="text-amber-600" />
              </div>
              
              <h2 className="text-4xl font-black mb-2 uppercase tracking-tighter italic">Victory!</h2>
              <p className="text-xl font-bold mb-8">
                The <span style={{ color: gameState.players[gameState.winnerId].color }}>{COLOR_NAMES[gameState.players[gameState.winnerId].color]} Empire</span> has unified the realm!
              </p>

              <div className="space-y-3">
                <GameButton
                  onClick={() => {
                    setSetupMode(true);
                    setGameState(null);
                  }}
                  variant="primary"
                  size="lg"
                  fullWidth
                  className="py-4"
                  icon={<RotateCcw size={20} />}
                >
                  PLAY AGAIN
                </GameButton>
                <GameButton
                  onClick={() => {
                    setSetupMode(true);
                    setGameState(null);
                  }}
                  variant="ghost"
                  size="lg"
                  fullWidth
                  className="py-4 border-2 border-black"
                  icon={<Settings size={20} />}
                >
                  MAIN MENU
                </GameButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
