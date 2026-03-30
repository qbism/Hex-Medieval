import React, { useState, useEffect, useRef } from 'react';
import { Game3D } from './components/Game3D';
import { 
  GameState, 
  TerrainType, 
  UnitType, 
  HexCoord,
  axialToCube,
  COLOR_NAMES,
  UNIT_ICONS,
  UNIT_STATS,
  SETTLEMENT_INCOME,
  UPGRADE_COSTS,
  Unit
} from './types';
import { createInitialState, getValidMoves, getValidAttacks, getAttackRange, processTurnTransition, calculateIncome, triggerBarbarianInvasion } from './gameEngine';
import { useAutomatonTurn } from './hooks/useAutomatonTurn';
import { useGameActions } from './hooks/useGameActions';
import { GameButton } from './components/GameButton';
import { Sword, Shield, Coins, User, Play, RotateCcw, ChevronRight, HelpCircle, Settings, PlusCircle, Volume2, VolumeX, Save, Upload, AlertTriangle, AlertTriangle as AlertIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, TERRAIN_COLORS } from './types';
import { soundEngine } from './services/soundEngine';
import { triggerEffect } from './services/effectEngine';
import { calculateStrength } from './utils';
import { HelpModal } from './components/HelpModal';
import { saveGame, loadGame } from './services/saveLoadService';

const COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2'];

const ConfirmationDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: () => void; 
  title: string;
  message: string;
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="bg-parchment border-2 border-black p-8 max-w-md w-full shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-amber-100 border-2 border-black">
                <AlertTriangle className="text-amber-600" size={32} />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">{title}</h3>
                <p className="text-stone-600 font-medium">{message}</p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <GameButton 
                onClick={onClose}
                variant="ghost"
                fullWidth
                className="border-2 border-black"
              >
                Cancel
              </GameButton>
              <GameButton 
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                variant="danger"
                fullWidth
                className="border-2 border-black"
              >
                Confirm
              </GameButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const GameMenu = ({ 
  isOpen, 
  onClose, 
  onExitCurrent, 
  onExitAll,
  onSave,
  onLoad
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onExitCurrent: () => void; 
  onExitAll: () => void;
  onSave: () => void;
  onLoad: () => void;
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="bg-parchment border-2 border-black p-8 max-w-md w-full shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]"
          >
            <div className="relative mb-8 overflow-hidden border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-stone-100 flex flex-col items-center justify-center py-6 gap-1">
              <div className="grayscale opacity-40 pointer-events-none select-none">
                <Settings size={60} />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-center">
                Game Menu
              </h2>
            </div>
            
            <div className="space-y-3">
              <GameButton 
                onClick={onSave}
                variant="ghost"
                fullWidth
                className="border-2 border-black justify-between"
                icon={<Save size={20} />}
              >
                <span>Save Game</span>
                <ChevronRight size={20} />
              </GameButton>

              <GameButton 
                onClick={onLoad}
                variant="ghost"
                fullWidth
                className="border-2 border-black justify-between"
                icon={<Upload size={20} />}
              >
                <span>Load Game</span>
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
                <span>Exit Current Player</span>
                <ChevronRight size={20} />
              </GameButton>
              
              <GameButton 
                onClick={onExitAll}
                variant="danger"
                fullWidth
                className="border-2 border-black justify-between"
                icon={<RotateCcw size={20} />}
              >
                <span>Exit All (Reset Game)</span>
                <ChevronRight size={20} />
              </GameButton>
              
              <GameButton 
                onClick={onClose}
                variant="primary"
                fullWidth
                className="border-2 border-black justify-between"
                icon={<Play size={20} />}
              >
                <span>Return to Game</span>
                <ChevronRight size={20} />
              </GameButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default function App() {
  const [hoveredHex, setHoveredHex] = useState<HexCoord | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [setupMode, setSetupMode] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    if (gameState) {
      saveGame(gameState);
      setShowMenu(false);
    }
  };

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const loadedState = await loadGame(file);
        setGameState(loadedState);
        setShowMenu(false);
        setSetupMode(false);
      } catch (error) {
        console.error('Failed to load game:', error);
        setError('Failed to load game. Make sure it is a valid .hexm file.');
      }
    }
    // Reset input
    e.target.value = '';
  };

  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    setConfirmation({
      isOpen: true,
      title,
      message,
      onConfirm,
    });
  };

  const handleExitCurrent = () => {
    confirmAction(
      "Exit Player?",
      "Are you sure you want to remove this player from the game?",
      () => {
        exitPlayer();
        setShowMenu(false);
      }
    );
  };

  const handleExitAll = () => {
    confirmAction(
      "Reset Game?",
      "Are you sure you want to end the current game and return to the main menu?",
      () => {
        setSetupMode(true);
        setGameState(null);
        setShowMenu(false);
      }
    );
  };

  const handleLoadWithConfirmation = () => {
    if (gameState) {
      confirmAction(
        "Load Game?",
        "Loading a game will end your current session. Are you sure?",
        handleLoadClick
      );
    } else {
      handleLoadClick();
    }
  };
  const [automatonStatus, setAutomatonStatus] = useState("Analyzing battlefield...");
  const [playerConfigs, setPlayerConfigs] = useState([
    { name: 'Red', isAutomaton: false },
    { name: 'Blue', isAutomaton: true },
    { name: 'Green', isAutomaton: true },
    { name: 'Orange', isAutomaton: true },
    { name: 'Purple', isAutomaton: true },
    { name: 'Cyan', isAutomaton: true },
  ]);
  const stageContainerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);

  const actions = useGameActions(gameState, setGameState, setSetupMode);
  const {
    startGame,
    moveUnit,
    finalizeMove,
    attackUnit,
    finalizeAttack,
    recruitUnit,
    upgradeSettlement,
    endTurn,
    undoMove,
    clearAnimation,
    exitPlayer
  } = actions;

  useEffect(() => {
    soundEngine.setEnabled(!isMuted);
  }, [isMuted]);

  useEffect(() => {
    if (gameState?.currentPlayerIndex !== undefined && !setupMode) {
      triggerEffect('click');
      
      const currentPlayer = gameState.players[gameState.currentPlayerIndex];
      if (!currentPlayer.isAutomaton) {
        triggerEffect('turnStart');
      }
    }
  }, [gameState?.currentPlayerIndex, setupMode]);

  useEffect(() => {
    if (gameState?.winnerId !== null && gameState?.winnerId !== undefined) {
      triggerEffect('victory');
    }
  }, [gameState?.winnerId]);

  // Force refresh after map initiation
  useEffect(() => {
    if (gameState && !setupMode) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [!!gameState, setupMode]); // Only run when gameState becomes truthy or setupMode changes

  const handleHexClick = React.useCallback((q: number, r: number) => {
    if (!gameState || gameState.winnerId !== null || setupMode) return;
    triggerEffect('click');
    const coord = axialToCube(q, r);
    
    // Toggle selection: if clicking the same hex, deselect
    if (gameState.selectedHex && gameState.selectedHex.q === coord.q && gameState.selectedHex.r === coord.r) {
      setGameState({
        ...gameState,
        selectedUnitId: null,
        selectedHex: null,
        possibleMoves: [],
        possibleAttacks: [],
        attackRange: [],
      });
      return;
    }

    const unitAtHex = gameState.units.find(u => u.coord.q === coord.q && u.coord.r === coord.r);
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];

    // If it's the AI's turn, only allow inspection
    if (currentPlayer.isAutomaton) {
      setGameState({
        ...gameState,
        selectedUnitId: null,
        selectedHex: coord,
        possibleMoves: [],
        possibleAttacks: [],
        attackRange: [],
      });
      return;
    }

    // If unit selected and clicked on a possible move
    if (gameState.selectedUnitId && gameState.possibleMoves.some(m => m.q === coord.q && m.r === coord.r)) {
      moveUnit(gameState.selectedUnitId, coord);
      return;
    }

    // If unit selected and clicked on a possible attack
    if (gameState.selectedUnitId && gameState.possibleAttacks.some(a => a.q === coord.q && a.r === coord.r)) {
      const selectedUnit = gameState.units.find(u => u.id === gameState.selectedUnitId);
      // Only allow attack if it's the current player's unit and it hasn't acted
      if (selectedUnit && selectedUnit.ownerId === currentPlayer.id && !selectedUnit.hasActed) {
        attackUnit(gameState.selectedUnitId, coord);
        return;
      }
    }

    // Select unit or tile
    if (unitAtHex) {
      const isCurrentPlayer = unitAtHex.ownerId === currentPlayer.id;
      const moves = isCurrentPlayer ? getValidMoves(unitAtHex, gameState.board, gameState.units) : [];
      // For UI purposes, we show the range even if the unit has acted or is an enemy
      const attacks = getValidAttacks(unitAtHex, gameState.board, gameState.units, true);
      const range = getAttackRange(unitAtHex, gameState.board, gameState.units);
      
      setGameState({
        ...gameState,
        selectedUnitId: unitAtHex.id,
        selectedHex: coord,
        possibleMoves: moves,
        possibleAttacks: attacks,
        attackRange: range,
      });
    } else {
      setGameState({
        ...gameState,
        selectedUnitId: null,
        selectedHex: coord,
        possibleMoves: [],
        possibleAttacks: [],
        attackRange: [],
      });
    }
  }, [gameState, moveUnit, attackUnit, setGameState]);

  useAutomatonTurn({ gameState, setupMode, actions, setAutomatonStatus });

  if (setupMode) {
    return (
      <div className="min-h-screen bg-[#2a1a1a] flex items-center justify-center p-8 font-serif">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl w-full bg-parchment border-2 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
        >
          <div className="relative mb-8 overflow-hidden border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-stone-100 flex flex-col items-center justify-center py-10 gap-2">
            <div className="grayscale opacity-60 pointer-events-none select-none">
              <span className="text-[100px] sm:text-[140px]">🏰</span>
            </div>
            <h1 className="text-2xl sm:text-6xl font-black uppercase tracking-tighter text-center">
              Throne Room
            </h1>
            <p className="text-sm font-black uppercase tracking-widest opacity-40">Hex Medieval</p>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="flex justify-between items-center">
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

          <div className="flex flex-col gap-4 w-full max-w-sm">
            <GameButton 
              onClick={() => startGame(playerConfigs)}
              variant="primary"
              size="lg"
              fullWidth
              className="text-xl py-5"
            >
              Start Conquest
            </GameButton>

            <GameButton 
              onClick={handleLoadWithConfirmation}
              variant="secondary"
              size="lg"
              fullWidth
              className="text-xl py-5"
              icon={<Upload size={24} />}
            >
              Load Game
            </GameButton>
            
            <GameButton 
              onClick={() => setShowInstructions(true)}
              variant="ghost"
              size="md"
              fullWidth
              className="border-2 border-black"
              icon={<HelpCircle size={20} />}
            >
              How to Play
            </GameButton>
          </div>
        </motion.div>
        <HelpModal isOpen={showInstructions} onClose={() => setShowInstructions(false)} />
        <ConfirmationDialog
          isOpen={confirmation.isOpen}
          onClose={() => setConfirmation(prev => ({ ...prev, isOpen: false }))}
          onConfirm={confirmation.onConfirm}
          title={confirmation.title}
          message={confirmation.message}
        />

        {/* Error Dialog */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-parchment border-2 border-black p-8 max-w-md w-full shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-red-100 border-2 border-black">
                    <AlertTriangle className="text-red-600" size={32} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Error</h3>
                    <p className="text-stone-600 font-medium">{error}</p>
                  </div>
                </div>
                <GameButton 
                  onClick={() => setError(null)}
                  variant="primary"
                  fullWidth
                  className="border-2 border-black"
                >
                  Dismiss
                </GameButton>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept=".hexm" 
          className="hidden" 
        />
      </div>
    );
  }

  if (!gameState) return null;

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  return (
    <div className="h-screen w-screen bg-[#2a1a1a] overflow-hidden relative font-serif">
      {/* Game Over Overlay */}
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
              <p className="text-lg mb-4 font-bold" style={{ color: gameState.winnerId === -1 ? 'black' : gameState.players[gameState.winnerId].color }}>
                {gameState.winnerId === -1 ? "It's a Draw!" : `${COLOR_NAMES[gameState.players[gameState.winnerId].color]} Empire Victorious!`}
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
                  Throne Room
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

      {/* Sidebar / Top Bar */}
      <div 
        className={cn(
          "absolute z-20 bg-parchment border-2 border-black flex shadow-2xl transition-all duration-300",
          // Mobile: Top horizontal
          "inset-x-2 top-2 flex-row overflow-x-auto h-44",
          // Desktop: Right vertical
          "lg:top-2 lg:bottom-2 lg:right-2 lg:left-auto lg:w-80 lg:h-auto lg:flex-col lg:overflow-hidden"
        )}
        style={{
          clipPath: 'polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px), 0 10px)'
        }}
      >
        {/* HUD Section */}
        <div className="p-4 border-r lg:border-r-0 lg:border-b-2 border-black/10 bg-parchment/50 space-y-4 w-64 lg:w-full flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-black shadow-sm flex-shrink-0" style={{ backgroundColor: currentPlayer.color }} />
              <div className="relative overflow-hidden border-2 border-black bg-stone-100 px-3 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center">
                <div className="grayscale opacity-20 pointer-events-none select-none absolute inset-0 flex items-center justify-center">
                  <span className="text-[32px]">🏰</span>
                </div>
                <p className="relative text-base font-black leading-none tracking-tight uppercase z-10">
                  {COLOR_NAMES[currentPlayer.color]}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <GameButton 
                onClick={() => setIsMuted(!isMuted)}
                variant="ghost"
                size="icon"
                className="p-2 border border-black/10 bg-white shadow-sm"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </GameButton>
              <GameButton 
                onClick={() => setShowInstructions(true)}
                variant="ghost"
                size="icon"
                className="p-2 text-stone-500 hover:text-black border border-black/10 bg-white shadow-sm"
                title="Help"
              >
                <HelpCircle size={16} />
              </GameButton>
              <GameButton 
                onClick={() => setShowMenu(true)}
                variant="ghost"
                size="icon"
                className="p-2 text-stone-700 hover:text-black border border-black/10 bg-white shadow-sm"
                title="Game Menu"
              >
                <Settings size={16} />
              </GameButton>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col p-3 bg-white border-2 border-black rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex items-center gap-2 mb-1">
                <Coins size={16} className="text-amber-600" />
                <span className="text-xl font-black">
                  {currentPlayer.gold}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <PlusCircle size={10} className="text-green-600" />
                <span className="text-[10px] font-black uppercase text-green-700">
                  +{calculateIncome(currentPlayer, gameState.board)} / turn
                </span>
              </div>
            </div>

            <div className="flex flex-col p-3 bg-white border-2 border-black rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex items-center gap-2 mb-1">
                <Sword size={16} className="text-red-600" />
                <span className="text-xl font-black">
                  {calculateStrength(currentPlayer.id, gameState.units)}
                </span>
              </div>
              <p className="text-[10px] font-black uppercase opacity-50 leading-none">Military Power</p>
            </div>
          </div>
        </div>

        {/* Intel Section */}
        <div className="flex-1 overflow-y-auto bg-parchment/30 min-w-[300px] lg:min-w-0 relative border-x lg:border-x-0 border-black/5">
          {gameState.selectedHex ? (
            <div className="p-4">
              <motion.div
                key={`${gameState.selectedHex.q}-${gameState.selectedHex.r}`}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
              >
                {(() => {
                  const tile = gameState.board.find(t => t.coord.q === gameState.selectedHex!.q && t.coord.r === gameState.selectedHex!.r);
                  const unit = gameState.units.find(u => u.coord.q === gameState.selectedHex!.q && u.coord.r === gameState.selectedHex!.r);
                  
                  if (!tile) return null;

                  return (
                    <div className="space-y-5">
                      {/* Tile Info */}
                      <div className="space-y-2">
                        <div className="relative overflow-hidden border-b-2 border-black bg-stone-50 px-2 py-1 mb-1 flex flex-col items-center">
                          <div className="grayscale opacity-20 pointer-events-none select-none absolute inset-0 flex items-center justify-center">
                            <span className="text-[24px]">🏰</span>
                          </div>
                          <p className="relative text-[10px] font-black uppercase tracking-[0.2em] opacity-60 z-10">Terrain Intelligence</p>
                        </div>
                        <div className="p-3 bg-parchment border-2 border-black rounded-2xl shadow-[3px_3px_0px_0px_rgba(0,0,0,0.05)]">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl border-2 border-black/20 flex-shrink-0" style={{ backgroundColor: TERRAIN_COLORS[tile.terrain] }} />
                            <div className="flex-1">
                              <p className="font-black text-lg uppercase tracking-tight leading-none mb-1">{tile.terrain}</p>
                              {SETTLEMENT_INCOME[tile.terrain] > 0 && (
                                <div className="flex items-center gap-1.5 text-amber-700">
                                  <Coins size={12} />
                                  <span className="text-xs font-black">+{SETTLEMENT_INCOME[tile.terrain]} Gold / turn</span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {tile.ownerId !== null && (
                            <div className="mt-3 pt-3 border-t-2 border-stone-100">
                              <p className="text-[10px] font-black uppercase opacity-40 mb-1">Occupied By</p>
                              <p className="font-black text-sm" style={{ color: gameState.players[tile.ownerId].color }}>
                                {COLOR_NAMES[gameState.players[tile.ownerId].color]} Empire
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Unit Info */}
                      {unit && (
                        <div className="space-y-2">
                          <div className="relative overflow-hidden border-b-2 border-black bg-stone-50 px-2 py-1 mb-1 flex flex-col items-center">
                            <div className="grayscale opacity-20 pointer-events-none select-none absolute inset-0 flex items-center justify-center">
                              <span className="text-[24px]">🏰</span>
                            </div>
                            <p className="relative text-[10px] font-black uppercase tracking-[0.2em] opacity-60 z-10">Unit Presence</p>
                          </div>
                          <div className="p-3 bg-parchment/80 border-2 border-black rounded-2xl shadow-[3px_3px_0px_0px_rgba(0,0,0,0.05)]">
                            <div className="flex items-center gap-4 mb-3">
                              <div className="text-4xl bg-white w-14 h-14 rounded-xl border-2 border-black flex items-center justify-center shadow-sm">{UNIT_ICONS[unit.type]}</div>
                              <div>
                                <p className="font-black text-lg uppercase tracking-tight leading-none mb-1">{unit.type}</p>
                                <p className="text-xs font-black" style={{ color: gameState.players[unit.ownerId].color }}>
                                  {COLOR_NAMES[gameState.players[unit.ownerId].color]} Forces
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-2 bg-white border border-black/10 rounded-xl">
                                <p className="text-[9px] uppercase font-black opacity-40 mb-1">Movement</p>
                                <div className="flex items-center gap-1.5">
                                  <RotateCcw size={12} className="text-blue-600" />
                                  <span className="text-sm font-black">{unit.movesLeft}/{UNIT_STATS[unit.type].moves}</span>
                                </div>
                              </div>
                              <div className="p-2 bg-white border border-black/10 rounded-xl">
                                <p className="text-[9px] uppercase font-black opacity-40 mb-1">Attack Range</p>
                                <div className="flex items-center gap-1.5">
                                  <Sword size={12} className="text-red-600" />
                                  <span className="text-sm font-black">{UNIT_STATS[unit.type].range}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Recruitment UI */}
                      {!unit && tile.ownerId === currentPlayer.id && (tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS) && (
                        <div className="space-y-2">
                          <div className="relative overflow-hidden border-b-2 border-black bg-stone-50 px-2 py-1 mb-1 flex flex-col items-center">
                            <div className="grayscale opacity-20 pointer-events-none select-none absolute inset-0 flex items-center justify-center">
                              <span className="text-[24px]">🏰</span>
                            </div>
                            <p className="relative text-[10px] font-black uppercase tracking-[0.2em] opacity-60 z-10">Recruit Forces</p>
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            {(Object.keys(UNIT_STATS) as UnitType[]).map(type => {
                              const stats = UNIT_STATS[type];
                              const canAfford = currentPlayer.gold >= stats.cost;

                              return (
                                <GameButton
                                  key={type}
                                  onClick={() => recruitUnit(type, gameState.selectedHex!)}
                                  disabled={!canAfford}
                                  variant="parchment"
                                  fullWidth
                                  className="p-3 border-2 border-black flex items-center justify-between transition-all relative group rounded-xl"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-2xl">{UNIT_ICONS[type]}</span>
                                    <div className="text-left">
                                      <p className="font-black uppercase text-sm leading-none mb-1">{type}</p>
                                      <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1">
                                          <RotateCcw size={10} className="text-blue-600" />
                                          <span className="text-[10px] font-bold">{stats.moves}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Sword size={10} className="text-red-600" />
                                          <span className="text-[10px] font-bold">{stats.range}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 bg-amber-100 px-2 py-1 rounded-lg border-2 border-amber-300">
                                    <Coins size={12} className="text-amber-700" />
                                    <span className="text-xs font-black text-amber-900">{stats.cost}</span>
                                  </div>
                                </GameButton>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Upgrade UI */}
                      {tile.terrain !== TerrainType.CASTLE && tile.terrain !== TerrainType.GOLD_MINE && (
                        <div className="space-y-2">
                          <div className="relative overflow-hidden border-b-2 border-black bg-stone-50 px-2 py-1 mb-1 flex flex-col items-center">
                            <div className="grayscale opacity-20 pointer-events-none select-none absolute inset-0 flex items-center justify-center">
                              <span className="text-[24px]">🏰</span>
                            </div>
                            <p className="relative text-[10px] font-black uppercase tracking-[0.2em] opacity-60 z-10">Settlement Upgrades</p>
                          </div>
                          {(() => {
                            let cost = 0;
                            let label = "";
                            if (tile.terrain === TerrainType.PLAINS && unit && unit.ownerId === currentPlayer.id && tile.ownerId !== currentPlayer.id) {
                              if (unit.hasActed) return <p className="text-xs italic opacity-50 p-3 bg-stone-100 rounded-xl border border-dashed border-black/20">Unit must have full actions to build.</p>;
                              cost = UPGRADE_COSTS[TerrainType.VILLAGE]; label = "Build Village";
                            } else if (tile.terrain === TerrainType.MOUNTAIN && unit && unit.ownerId === currentPlayer.id && tile.ownerId !== currentPlayer.id) {
                              if (unit.hasActed) return <p className="text-xs italic opacity-50 p-3 bg-stone-100 rounded-xl border border-dashed border-black/20">Unit must have full actions to build.</p>;
                              cost = UPGRADE_COSTS[TerrainType.GOLD_MINE]; label = "Build Gold Mine";
                            } else if (tile.terrain === TerrainType.VILLAGE && tile.ownerId === currentPlayer.id) {
                              cost = UPGRADE_COSTS[TerrainType.FORTRESS]; label = "Upgrade to Fortress";
                            } else if (tile.terrain === TerrainType.FORTRESS && tile.ownerId === currentPlayer.id) {
                              cost = UPGRADE_COSTS[TerrainType.CASTLE]; label = "Upgrade to Castle";
                            }

                            if (!label) return <p className="text-xs italic opacity-50 p-3 bg-stone-100 rounded-xl border border-dashed border-black/20">No upgrades available here. Must own tile or occupy with unit.</p>;

                            const canAfford = currentPlayer.gold >= cost;

                            return (
                              <GameButton
                                onClick={() => upgradeSettlement(tile.coord)}
                                disabled={!canAfford}
                                variant="parchment"
                                fullWidth
                                className={cn(
                                  "p-3 border-2 border-black flex items-center justify-between transition-all rounded-xl",
                                  canAfford && "hover:bg-blue-100"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-white rounded-lg border-2 border-black flex items-center justify-center">
                                    <PlusCircle size={18} className="text-blue-600" />
                                  </div>
                                  <p className="font-black uppercase text-sm">{label}</p>
                                </div>
                                <div className="flex items-center gap-1 bg-amber-100 px-2 py-1 rounded-lg border-2 border-amber-300">
                                  <Coins size={12} className="text-amber-700" />
                                  <span className="text-xs font-black text-amber-900">{cost}</span>
                                </div>
                              </GameButton>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </motion.div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-40 p-8">
              <div className="text-6xl mb-4 grayscale">🏰</div>
              <div>
                <div className="relative overflow-hidden border-2 border-black bg-stone-100 px-4 py-2 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] mb-2 flex flex-col items-center">
                  <div className="grayscale opacity-20 pointer-events-none select-none absolute inset-0 flex items-center justify-center">
                    <span className="text-[48px]">🏰</span>
                  </div>
                  <p className="relative font-black uppercase text-sm tracking-widest z-10">Imperial Command</p>
                </div>
                <p className="text-xs font-bold">SELECT A TILE OR UNIT TO BEGIN</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-l lg:border-l-0 lg:border-t-2 border-black/10 bg-parchment/50 space-y-3 w-48 lg:w-full flex-shrink-0">
          {!currentPlayer.isAutomaton && gameState.history && gameState.history.length > 0 && (
            <GameButton 
              onClick={undoMove}
              variant="parchment"
              size="sm"
              fullWidth
              className="py-3 text-xs border-2 border-black"
              icon={<RotateCcw size={14} />}
            >
              Undo Move
            </GameButton>
          )}
          <GameButton 
            onClick={endTurn}
            disabled={currentPlayer.isAutomaton}
            variant="primary"
            size="md"
            fullWidth
            className="py-4 text-sm"
          >
            {currentPlayer.isAutomaton ? automatonStatus : "End Turn"}
            {!currentPlayer.isAutomaton && <ChevronRight size={18} className="ml-2 inline" />}
          </GameButton>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="absolute inset-0 bg-black" ref={stageContainerRef}>
        <Game3D 
          gameState={gameState}
          hoveredHex={hoveredHex}
          setHoveredHex={setHoveredHex}
          handleHexClick={handleHexClick}
          finalizeMove={finalizeMove}
          finalizeAttack={finalizeAttack}
          clearAnimation={clearAnimation}
        />
      </div>
        <HelpModal isOpen={showInstructions} onClose={() => setShowInstructions(false)} />
        <GameMenu 
          isOpen={showMenu} 
          onClose={() => setShowMenu(false)} 
          onExitCurrent={handleExitCurrent}
          onExitAll={handleExitAll}
          onSave={handleSave}
          onLoad={handleLoadWithConfirmation}
        />
        <ConfirmationDialog
          isOpen={confirmation.isOpen}
          onClose={() => setConfirmation(prev => ({ ...prev, isOpen: false }))}
          onConfirm={confirmation.onConfirm}
          title={confirmation.title}
          message={confirmation.message}
        />

        {/* Error Dialog */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-parchment border-2 border-black p-8 max-w-md w-full shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-red-100 border-2 border-black">
                    <AlertTriangle className="text-red-600" size={32} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Error</h3>
                    <p className="text-stone-600 font-medium">{error}</p>
                  </div>
                </div>
                <GameButton 
                  onClick={() => setError(null)}
                  variant="primary"
                  fullWidth
                  className="border-2 border-black"
                >
                  Dismiss
                </GameButton>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept=".hexm" 
          className="hidden" 
        />
      </div>
    );
}
