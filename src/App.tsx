import React, { useState, useEffect, useRef } from 'react';
import { Game3D } from './components/Game3D';
import { 
  GameState, 
  HexCoord,
  axialToCube,
  Unit as _Unit,
} from './types';
import { PLAYER_COLORS as COLORS, COLOR_NAMES } from './constants/colors';
import { getValidMoves, getValidAttacks, getAttackRange, triggerBarbarianInvasion, createInitialState } from './gameEngine';
import { useAutomatonTurn } from './hooks/useAutomatonTurn';
import { useGameActions } from './hooks/useGameActions';
import { GameButton } from './components/GameButton';
import { Sidebar } from './components/Sidebar';
import { SetupScreen } from './components/SetupScreen';
import { GameMenu } from './components/GameMenu';
import { ConfirmationDialog } from './components/ConfirmationDialog';
import { GameOverOverlay } from './components/GameOverOverlay';
import { HelpModal } from './components/HelpModal';
import { soundEngine } from './services/soundEngine';
import { musicEngine } from './services/musicEngine';
import { triggerEffect } from './services/effectEngine';
import { saveGame, loadGame } from './services/saveLoadService';
import { saveDemo, loadDemo } from './services/demoService';
import { calculateOpportunityPerilMatrix, calculateThreatMatrix } from './automaton-library';
import { calculateStrategicAnalysis } from './game/analysis';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

import { Play, Pause, FastForward, Rewind, X } from 'lucide-react';

export default function App() {
  const [hoveredHex, setHoveredHex] = useState<HexCoord | null>(null);
  const [playerConfigs, setPlayerConfigs] = useState([
    { name: COLOR_NAMES[COLORS[0]], isAutomaton: false },
    { name: COLOR_NAMES[COLORS[1]], isAutomaton: true },
    { name: COLOR_NAMES[COLORS[2]], isAutomaton: true },
    { name: COLOR_NAMES[COLORS[3]], isAutomaton: true },
    { name: COLOR_NAMES[COLORS[4]], isAutomaton: true },
    { name: COLOR_NAMES[COLORS[5]], isAutomaton: true },
  ]);
  const [gameState, setGameState] = useState<GameState>(() => createInitialState([
    { name: COLOR_NAMES[COLORS[0]], isAutomaton: false },
    { name: COLOR_NAMES[COLORS[1]], isAutomaton: true },
    { name: COLOR_NAMES[COLORS[2]], isAutomaton: true },
    { name: COLOR_NAMES[COLORS[3]], isAutomaton: true },
    { name: COLOR_NAMES[COLORS[4]], isAutomaton: true },
    { name: COLOR_NAMES[COLORS[5]], isAutomaton: true },
  ]));
  const [setupMode, setSetupMode] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.33);
  const [effectsVolume, setEffectsVolume] = useState(0.5);
  const [showStrategicView, setShowStrategicView] = useState(false);
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
  const demoInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    musicEngine.resume();
    if (gameState) {
      saveGame(gameState);
      setShowMenu(false);
    }
  };

  const handleSaveDemo = () => {
    if (gameState) {
      saveDemo(gameState);
      setShowMenu(false);
    }
  };

  const handleLoadClick = () => {
    musicEngine.resume();
    fileInputRef.current?.click();
  };

  const handleLoadDemoClick = () => {
    demoInputRef.current?.click();
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

  const handleDemoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const timeline = await loadDemo(file);
        setGameState({
          ...timeline[0],
          history: [],
          animations: [],
          isPlaybackMode: true,
          demoTimeline: timeline,
          playbackIndex: 0,
          isPlayingDemo: false,
          playbackSpeed: 1000 // 1 second per move default
        });
        setShowMenu(false);
        setSetupMode(false);
      } catch (error) {
        console.error('Failed to load demo:', error);
        setError('Failed to load demo. Make sure it is a valid .hexd file.');
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
      "Leave game?",
      "Are you sure you want to leave? Your empire will fall and its remnants will turn into barbarians.",
      () => {
        concedeGame();
        setShowMenu(false);
      }
    );
  };

  const handleExitAll = () => {
    confirmAction(
      "Reset game?",
      "Are you sure you want to end the current game and return to the main menu? A new map will be generated.",
      () => {
        setSetupMode(true);
        // Regenerate map upon exiting to setup screen
        setGameState(createInitialState(playerConfigs));
        setShowMenu(false);
      }
    );
  };

  const handleLoadWithConfirmation = () => {
    if (gameState) {
      confirmAction(
        "Load game?",
        "Loading a game will end your current session. Are you sure?",
        handleLoadClick
      );
    } else {
      handleLoadClick();
    }
  };

  const handleLoadDemoWithConfirmation = () => {
    if (gameState) {
      confirmAction(
        "Load demo?",
        "Loading a demo will end your current session. Are you sure?",
        handleLoadDemoClick
      );
    } else {
      handleLoadDemoClick();
    }
  };
  const [automatonStatus, setAutomatonStatus] = useState("Analyzing battlefield...");

  // Reactive Strategic Analysis to keep the UI snappy
  useEffect(() => {
    if (!gameState || gameState.winnerId !== null || (gameState.animations && gameState.animations.length > 0)) return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer) return;

    // Use a small timeout to allow the initial state change to render first
    const timer = setTimeout(() => {
       const analysis = calculateStrategicAnalysis(gameState, currentPlayer.id);
       
       setGameState(prev => {
         if (!prev) return prev;
         // Avoid unnecessary state updates if analysis hasn't changed or isn't needed
         if (prev.strategicAnalysis && JSON.stringify(prev.strategicAnalysis.opportunityMap) === JSON.stringify(analysis.opportunityMap)) {
           return prev;
         }
         return { ...prev, strategicAnalysis: analysis };
       });
    }, 60);

    return () => clearTimeout(timer);
  }, [gameState?.board, gameState?.units, gameState?.currentPlayerIndex, gameState?.selectedUnitId]);

  const stageContainerRef = useRef<HTMLDivElement>(null);
  const _stageRef = useRef<any>(null);

  const actions = useGameActions(gameState, setGameState, setSetupMode);
  const {
    startGame,
    moveUnit,
    finalizeMove,
    attackUnit,
    finalizeAttack,
    recruitUnit,
    upgradeSettlement,
    updateAIMatrix,
    endTurn,
    undoMove,
    clearAnimation,
    concedeGame
  } = actions;

  // Real-time strategic matrix calculation for player view
  useEffect(() => {
    if (showStrategicView && gameState && !gameState.players[gameState.currentPlayerIndex].isAutomaton) {
      const threatMatrix = calculateThreatMatrix(gameState, gameState.players[gameState.currentPlayerIndex].id);
      const matrix = calculateOpportunityPerilMatrix(gameState, gameState.players[gameState.currentPlayerIndex].id, threatMatrix);
      updateAIMatrix(matrix);
    }
  }, [showStrategicView, gameState?.board, gameState?.units, gameState?.currentPlayerIndex]);

  // Safety: Clear animations that have been stuck for too long
  useEffect(() => {
    if (gameState?.animations && gameState.animations.length > 0) {
      const timeout = 10000; // 10 seconds safety
      
      const timer = setTimeout(() => {
        if (gameState.animations.length > 0) {
          console.warn('Safety: Clearing stuck animations after 10s timeout');
          setGameState(prev => {
            if (!prev) return prev;
            return { ...prev, animations: [] };
          });
        }
      }, timeout);
      
      return () => clearTimeout(timer);
    }
  }, [gameState?.animations?.length]);

  useEffect(() => {
    if (effectsVolume > 0 && !isMuted) {
      soundEngine.setEnabled(true);
      soundEngine.setVolume(effectsVolume);
    } else {
      soundEngine.setEnabled(false);
    }
  }, [isMuted, effectsVolume]);

  useEffect(() => {
    const handleInteraction = () => {
      musicEngine.resume();
    };
    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  useEffect(() => {
    if (musicVolume > 0 && !isMuted) {
      musicEngine.start();
      musicEngine.setVolume(musicVolume * 0.5);
    } else {
      musicEngine.stop();
    }
  }, [musicVolume, isMuted]);

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

  // Global click listener to resume audio context (browser policy compliance)
  useEffect(() => {
    const handleInteraction = () => {
      musicEngine.resume();
      soundEngine.resume();
    };

    window.addEventListener('mousedown', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);

    return () => {
      window.removeEventListener('mousedown', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  // Demo Playback Logic
  useEffect(() => {
    if (gameState?.isPlaybackMode && gameState.isPlayingDemo && gameState.demoTimeline) {
      const timer = setTimeout(() => {
        setGameState(prev => {
          if (!prev || !prev.isPlaybackMode || !prev.demoTimeline) return prev;
          const nextIndex = (prev.playbackIndex || 0) + 1;
          if (nextIndex >= prev.demoTimeline.length) {
            return { ...prev, isPlayingDemo: false };
          }
          const nextState = prev.demoTimeline[nextIndex];
          return {
            ...nextState,
            history: [],
            animations: [],
            isPlaybackMode: true,
            demoTimeline: prev.demoTimeline,
            playbackIndex: nextIndex,
            isPlayingDemo: true,
            playbackSpeed: prev.playbackSpeed
          };
        });
      }, gameState.playbackSpeed || 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState?.isPlaybackMode, gameState?.isPlayingDemo, gameState?.playbackIndex, gameState?.playbackSpeed, gameState?.demoTimeline]);

  const handleDemoControl = (action: 'play' | 'pause' | 'ffwd' | 'rwnd' | 'speed' | 'exit') => {
    setGameState(prev => {
      if (!prev || !prev.isPlaybackMode || !prev.demoTimeline) return prev;
      
      const currentIndex = prev.playbackIndex || 0;
      const timeline = prev.demoTimeline;
      
      switch (action) {
        case 'play':
          if (currentIndex >= timeline.length - 1) {
            // Restart if at end
            return {
              ...timeline[0],
              history: [],
              animations: [],
              isPlaybackMode: true,
              demoTimeline: timeline,
              playbackIndex: 0,
              isPlayingDemo: true,
              playbackSpeed: prev.playbackSpeed
            };
          }
          return { ...prev, isPlayingDemo: true };
        case 'pause':
          return { ...prev, isPlayingDemo: false };
        case 'ffwd': {
          const nextIndex = Math.min(timeline.length - 1, currentIndex + 1);
          return {
            ...timeline[nextIndex],
            history: [],
            animations: [],
            isPlaybackMode: true,
            demoTimeline: timeline,
            playbackIndex: nextIndex,
            isPlayingDemo: false,
            playbackSpeed: prev.playbackSpeed
          };
        }
        case 'rwnd': {
          const prevIndex = Math.max(0, currentIndex - 1);
          return {
            ...timeline[prevIndex],
            history: [],
            animations: [],
            isPlaybackMode: true,
            demoTimeline: timeline,
            playbackIndex: prevIndex,
            isPlayingDemo: false,
            playbackSpeed: prev.playbackSpeed
          };
        }
        case 'speed': {
          const currentSpeed = prev.playbackSpeed || 1000;
          const newSpeed = currentSpeed === 1000 ? 500 : currentSpeed === 500 ? 250 : 1000;
          return { ...prev, playbackSpeed: newSpeed };
        }
        case 'exit':
          setSetupMode(true);
          return null;
        default:
          return prev;
      }
    });
  };

  const handleHexClick = React.useCallback((q: number, r: number) => {
    if (!gameState || gameState.winnerId !== null || setupMode || gameState.isPlaybackMode) return;
    
    // Ignore clicks if animations are running to prevent race conditions/double-moves
    if (gameState.animations && gameState.animations.length > 0) return;

    triggerEffect('click');
    const coord = axialToCube(q, r);
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const unitAtHex = gameState.units.find(u => u.coord.q === coord.q && u.coord.r === coord.r);
    
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
      const attacks = getValidAttacks(unitAtHex, gameState.board, gameState.units, true);
      const range = getAttackRange(unitAtHex, gameState.board, gameState.units);
      
      const newState: GameState = {
        ...gameState,
        selectedUnitId: unitAtHex.id,
        selectedHex: coord,
        possibleMoves: moves,
        possibleAttacks: attacks,
        attackRange: range,
      };
      setGameState(newState);
    } else {
      const newState: GameState = {
        ...gameState,
        selectedUnitId: null,
        selectedHex: coord,
        possibleMoves: [],
        possibleAttacks: [],
        attackRange: [],
      };
      setGameState(newState);
    }
  }, [gameState, moveUnit, attackUnit, setGameState]);

  useAutomatonTurn({ gameState, setupMode, actions, setAutomatonStatus });

  // UI BUG FIX: Trigger a "fake" resize event when the game starts.
  // This ensures that the Sidebar and 3D stage correctly re-evaluate their layout 
  // based on the container size rather than just the window size, which fix the
  // "hidden sidebar on widescreen" issue.
  useEffect(() => {
    if (!setupMode) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [setupMode]);

  const currentPlayer = gameState ? gameState.players[gameState.currentPlayerIndex] : null;

  const handleStartGame = (configs: any) => {
    musicEngine.resume();
    // Use current board for the new game
    startGame(configs, gameState?.board);
  };

  return (
    <div className="h-screen w-screen bg-gradient-to-b from-[#43e3ff] via-[#0e5984] to-[#1f0606] overflow-hidden relative font-sans text-sm selection:bg-amber-200">
      <div className="h-full w-full flex flex-col md:flex-row">
        {/* Main Game Area - Always visible */}
        <div className="flex-1 relative bg-transparent" ref={stageContainerRef}>
          <Game3D 
            gameState={gameState}
            hoveredHex={hoveredHex}
            setHoveredHex={setHoveredHex}
            handleHexClick={handleHexClick}
            finalizeMove={finalizeMove}
            finalizeAttack={finalizeAttack}
            clearAnimation={clearAnimation}
            showStrategicView={showStrategicView}
          />
        </div>

        {/* Sidebar / Top Bar space */}
        <AnimatePresence>
          {!setupMode && (
            <Sidebar 
              key={`sidebar-${setupMode}`}
              gameState={gameState}
              currentPlayer={currentPlayer!}
              isMuted={isMuted}
              setIsMuted={setIsMuted}
              setShowInstructions={setShowInstructions}
              setShowMenu={setShowMenu}
              recruitUnit={recruitUnit}
              upgradeSettlement={upgradeSettlement}
              undoMove={undoMove}
              endTurn={endTurn}
              showStrategicView={showStrategicView}
              setShowStrategicView={setShowStrategicView}
              automatonStatus={automatonStatus}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Global Overlays */}
      {!setupMode && (
        <GameOverOverlay 
          gameState={gameState}
          onExit={() => {
            setSetupMode(true);
            setGameState(createInitialState(playerConfigs));
          }}
          setGameState={setGameState}
          triggerBarbarianInvasion={triggerBarbarianInvasion}
        />
      )}
      <AnimatePresence>
        {setupMode && (
          <SetupScreen 
            key="setup"
            playerConfigs={playerConfigs}
            setPlayerConfigs={setPlayerConfigs}
            startGame={handleStartGame}
            handleLoadWithConfirmation={handleLoadWithConfirmation}
            setShowInstructions={setShowInstructions}
            COLORS={COLORS}
          />
        )}
        
        {showMenu && !setupMode && (
          <GameMenu 
            key="game-menu"
            onClose={() => setShowMenu(false)} 
            onExitCurrent={handleExitCurrent}
            onExitAll={handleExitAll}
            onSave={handleSave}
            onLoad={handleLoadWithConfirmation}
            onSaveDemo={handleSaveDemo}
            onLoadDemo={handleLoadDemoWithConfirmation}
            onShowHelp={() => {
              setShowInstructions(true);
              setShowMenu(false);
            }}
            musicVolume={musicVolume}
            setMusicVolume={setMusicVolume}
            effectsVolume={effectsVolume}
            setEffectsVolume={setEffectsVolume}
          />
        )}

        {showInstructions && (
          <HelpModal key="help-modal" onClose={() => setShowInstructions(false)} />
        )}

        {confirmation.isOpen && (
          <ConfirmationDialog
            key="conf-dialog"
            onClose={() => setConfirmation(prev => ({ ...prev, isOpen: false }))}
            onConfirm={confirmation.onConfirm}
            title={confirmation.title}
            message={confirmation.message}
          />
        )}
      </AnimatePresence>
      {gameState?.isPlaybackMode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-parchment border-4 border-black p-4 flex items-center gap-4 z-[100] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="text-sm font-black tracking-widest mr-4">
            Turn {gameState.turnNumber}
          </div>
          <GameButton onClick={() => handleDemoControl('rwnd')} variant="ghost" size="sm" className="border-2 border-black" icon={<Rewind size={16} />}>
            Rewind
          </GameButton>
          <GameButton onClick={() => handleDemoControl(gameState.isPlayingDemo ? 'pause' : 'play')} variant="primary" size="sm" className="border-2 border-black" icon={gameState.isPlayingDemo ? <Pause size={16} /> : <Play size={16} />}>
            {gameState.isPlayingDemo ? 'Pause' : 'Play'}
          </GameButton>
          <GameButton onClick={() => handleDemoControl('ffwd')} variant="ghost" size="sm" className="border-2 border-black" icon={<FastForward size={16} />}>
            Forward
          </GameButton>
          <GameButton onClick={() => handleDemoControl('speed')} variant="ghost" size="sm" className="border-2 border-black w-24">
            {gameState.playbackSpeed === 1000 ? '1x' : gameState.playbackSpeed === 500 ? '2x' : '4x'} Speed
          </GameButton>
          <div className="w-px h-8 bg-black/20 mx-2" />
          <GameButton onClick={() => handleDemoControl('exit')} variant="danger" size="sm" className="border-2 border-black" icon={<X size={16} />}>
            Exit Demo
          </GameButton>
        </div>
      )}

      {/* Error Dialog */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="menu-overlay"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="menu-card max-w-md"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-red-100 border-2 border-black">
                  <AlertTriangle className="text-red-600" size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight">Error</h3>
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
      <input 
        type="file" 
        ref={demoInputRef} 
        onChange={handleDemoFileChange} 
        accept=".hexd" 
        className="hidden" 
      />
    </div>
  );
}
