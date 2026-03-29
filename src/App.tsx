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
import { createInitialState, getValidMoves, getValidAttacks, processTurnTransition, calculateIncome, triggerBarbarianInvasion } from './gameEngine';
import { useAutomatonTurn } from './hooks/useAutomatonTurn';
import { useGameActions } from './hooks/useGameActions';
import { Sword, Shield, Coins, User, Play, RotateCcw, ChevronRight, HelpCircle, X, PlusCircle, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, TERRAIN_COLORS } from './types';
import { soundEngine } from './services/soundEngine';
import { triggerEffect } from './services/effectEngine';
import { calculateStrength } from './utils';

const COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2'];

const HelpModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
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
            className="bg-parchment border-2 border-black p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] relative"
          >
            <div className="relative mb-8 overflow-hidden border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-stone-100 flex flex-col items-center justify-center py-6 gap-1">
              <div className="grayscale opacity-40 pointer-events-none select-none">
                <span className="text-[60px]">🏰</span>
              </div>
              <div className="relative flex justify-between items-center px-4 w-full">
                <div className="w-10" /> {/* Spacer for centering */}
                <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-center">How to Play</h2>
                <button onClick={onClose} className="p-2 hover:bg-stone-200/50 rounded-full bg-white/20 backdrop-blur-sm border border-black/10 transition-all">
                  <X size={24} />
                </button>
              </div>
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

const ExitDialog = ({ 
  isOpen, 
  onClose, 
  onExitCurrent, 
  onExitAll 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onExitCurrent: () => void; 
  onExitAll: () => void;
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
                <span className="text-[60px]">🏰</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-center">
                Quit Game?
              </h2>
            </div>
            
            <div className="space-y-4">
              <button 
                onClick={() => {
                  onExitCurrent();
                  onClose();
                }}
                className="w-full py-4 px-6 bg-white border-2 border-black font-bold uppercase tracking-wider hover:bg-red-50 transition-colors flex items-center justify-between group"
              >
                <span>Exit Current Player</span>
                <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
              
              <button 
                onClick={() => {
                  onExitAll();
                  onClose();
                }}
                className="w-full py-4 px-6 bg-white border-2 border-black font-bold uppercase tracking-wider hover:bg-red-100 transition-colors flex items-center justify-between group"
              >
                <span>Exit All (Reset Game)</span>
                <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
              
              <button 
                onClick={onClose}
                className="w-full py-4 px-6 bg-black text-white font-bold uppercase tracking-wider hover:bg-stone-800 transition-colors flex items-center justify-between group"
              >
                <span>Return to Game</span>
                <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
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
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
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
      attackUnit(gameState.selectedUnitId, coord);
      return;
    }

    // Select unit or tile
    if (unitAtHex && unitAtHex.ownerId === currentPlayer.id) {
      const moves = getValidMoves(unitAtHex, gameState.board, gameState.units);
      const attacks = getValidAttacks(unitAtHex, gameState.board, gameState.units);
      setGameState({
        ...gameState,
        selectedUnitId: unitAtHex.id,
        selectedHex: coord,
        possibleMoves: moves,
        possibleAttacks: attacks,
      });
    } else {
      setGameState({
        ...gameState,
        selectedUnitId: null,
        selectedHex: coord,
        possibleMoves: [],
        possibleAttacks: [],
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
              Hex Medieval
            </h1>
          </div>
          
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
            onClick={() => startGame(playerConfigs)}
            className="w-full bg-black text-white py-4 text-2xl font-bold uppercase tracking-widest hover:bg-stone-800 transition-colors flex items-center justify-center gap-3"
          >
            <Play fill="white" /> Start Conquest
          </button>
        </motion.div>
        <HelpModal isOpen={showInstructions} onClose={() => setShowInstructions(false)} />
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
                <button 
                  onClick={() => {
                    setSetupMode(true);
                    setGameState(null);
                  }}
                  className="w-full bg-black text-white py-2 font-black uppercase tracking-widest hover:bg-stone-800 transition-all text-sm"
                >
                  Throne Room
                </button>
                {gameState.winnerId !== -1 && !gameState.isBarbarianInvasion && (
                  <button 
                    onClick={() => {
                      setGameState(prev => prev ? triggerBarbarianInvasion(prev) : prev);
                    }}
                    className="w-full bg-red-700 text-white py-2 font-black uppercase tracking-widest hover:bg-red-800 transition-all text-sm"
                  >
                    Barbarian Invasion
                  </button>
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
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 hover:bg-stone-200 rounded-full transition-all border border-black/10 bg-white shadow-sm active:translate-y-0.5"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <button 
                onClick={() => setShowInstructions(true)}
                className="p-2 text-stone-500 hover:text-black hover:bg-stone-200 rounded-full transition-all border border-black/10 bg-white shadow-sm active:translate-y-0.5"
                title="Help"
              >
                <HelpCircle size={16} />
              </button>
              <button 
                onClick={() => setShowExitDialog(true)}
                className="p-2 text-red-500 hover:text-red-700 hover:bg-stone-200 rounded-full transition-all border border-black/10 bg-white shadow-sm active:translate-y-0.5"
                title="Quit Game"
              >
                <X size={16} />
              </button>
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
                                <button
                                  key={type}
                                  onClick={() => recruitUnit(type, gameState.selectedHex!)}
                                  disabled={!canAfford}
                                  className={cn(
                                    "w-full p-3 border-2 border-black flex items-center justify-between transition-all relative group rounded-xl",
                                    canAfford 
                                      ? "bg-parchment hover:bg-stone-50 active:translate-y-0.5 active:shadow-none shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]" 
                                      : "bg-stone-200 opacity-50 cursor-not-allowed"
                                  )}
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
                                </button>
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
                              <button
                                onClick={() => upgradeSettlement(tile.coord)}
                                disabled={!canAfford}
                                className={cn(
                                  "w-full p-3 border-2 border-black flex items-center justify-between transition-all rounded-xl",
                                  canAfford 
                                    ? "bg-parchment hover:bg-blue-100 active:translate-y-0.5 active:shadow-none shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]" 
                                    : "bg-stone-200 opacity-50 cursor-not-allowed"
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
                              </button>
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
            <button 
              onClick={undoMove}
              className="w-full bg-parchment text-black border-2 border-black py-3 font-black uppercase tracking-widest hover:bg-stone-100 transition-all flex items-center justify-center gap-2 text-xs shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none"
            >
              <RotateCcw size={14} /> Undo Move
            </button>
          )}
          <button 
            onClick={endTurn}
            disabled={currentPlayer.isAutomaton}
            className="w-full bg-black text-white py-4 font-black uppercase tracking-widest hover:bg-stone-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-sm shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] active:shadow-none active:translate-y-0.5"
          >
            {currentPlayer.isAutomaton ? automatonStatus : "End Turn"}
            {!currentPlayer.isAutomaton && <ChevronRight size={18} />}
          </button>
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
        <ExitDialog 
          isOpen={showExitDialog} 
          onClose={() => setShowExitDialog(false)} 
          onExitCurrent={exitPlayer}
          onExitAll={() => {
            setSetupMode(true);
            setGameState(null);
          }}
        />
      </div>
    );
}
