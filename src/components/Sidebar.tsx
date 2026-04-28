import React from 'react';
import { motion } from 'motion/react';
import { 
  Volume2, 
  VolumeX, 
  HelpCircle, 
  Settings, 
  Coins, 
  PlusCircle, 
  Sword, 
  RotateCcw, 
  ChevronRight,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  GameState, 
  TerrainType, 
  UnitType, 
  UNIT_ICONS, 
  UNIT_STATS, 
  SETTLEMENT_INCOME, 
  UPGRADE_COSTS,
  cn, 
} from '../types';
import { COLOR_NAMES, TERRAIN_COLORS } from '../constants/colors';
import { calculateIncome } from '../gameEngine';
import { calculateStrength } from '../utils';
import { GameButton } from './GameButton';

interface SidebarProps {
  gameState: GameState;
  currentPlayer: any;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  setShowInstructions: (show: boolean) => void;
  setShowMenu: (show: boolean) => void;
  recruitUnit: (type: UnitType, hex: any) => void;
  upgradeSettlement: (coord: any) => void;
  undoMove: () => void;
  endTurn: () => void;
  showStrategicView: boolean;
  setShowStrategicView: (show: boolean) => void;
  automatonStatus: string;
}

export const Sidebar = ({
  gameState,
  currentPlayer,
  isMuted,
  setIsMuted,
  setShowInstructions,
  setShowMenu,
  recruitUnit,
  upgradeSettlement,
  undoMove,
  endTurn,
  showStrategicView,
  setShowStrategicView,
  automatonStatus
}: SidebarProps) => {
  if (!currentPlayer) return null;
  return (
    <div 
      className={cn(
        "z-20 bg-parchment border-black flex shadow-2xl transition-all duration-300 order-1 lg:order-2",
        // Mobile: Top horizontal
        "w-full h-44 flex-row overflow-x-auto border-b-2",
        // Desktop: Right vertical
        "lg:h-full lg:w-80 lg:flex-col lg:overflow-hidden lg:border-l-2 lg:border-b-0"
      )}
      style={{
        clipPath: 'polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px), 0 10px)'
      }}
    >
      {/* HUD Section */}
      <div className="p-1.5 border-r lg:border-r-0 lg:border-b-2 border-black/10 bg-parchment/50 space-y-1 w-64 lg:w-full flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-black shadow-sm flex-shrink-0" style={{ backgroundColor: currentPlayer.color }} />
            <div className="relative overflow-hidden neo-brutalist-card-sm bg-stone-100 px-2 py-0.5 flex flex-col items-center">
              <div className="grayscale opacity-20 pointer-events-none select-none absolute inset-0 flex items-center justify-center">
                <span className="text-[24px]">🏰</span>
              </div>
              <p className="relative text-sm font-black leading-none tracking-tight z-10">
                {COLOR_NAMES[currentPlayer.color]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <GameButton 
              onClick={() => setIsMuted(!isMuted)}
              variant="ghost"
              size="icon"
              className="p-1.5 border border-black/10 bg-white shadow-sm"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </GameButton>
            <GameButton 
              onClick={() => setShowInstructions(true)}
              variant="ghost"
              size="icon"
              className="p-1.5 text-stone-500 hover:text-black border border-black/10 bg-white shadow-sm"
              title="Help"
            >
              <HelpCircle size={18} />
            </GameButton>
            <GameButton 
              onClick={() => setShowStrategicView(!showStrategicView)}
              variant="ghost"
              size="icon"
              className={cn(
                "p-1.5 border border-black/10 shadow-sm transition-colors",
                showStrategicView ? "bg-blue-100 text-blue-900 border-blue-300" : "bg-white text-stone-700"
              )}
              title={showStrategicView ? "Hide Strategic View" : "Show Strategic View"}
            >
              {showStrategicView ? <Eye size={18} /> : <EyeOff size={18} />}
            </GameButton>
            <GameButton 
              onClick={() => setShowMenu(true)}
              variant="ghost"
              size="icon"
              className="p-1.5 text-stone-700 hover:text-black border border-black/10 bg-white shadow-sm"
              title="Game Menu"
            >
              <Settings size={18} />
            </GameButton>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex flex-col p-1 neo-brutalist-card-sm">
            <div className="flex items-center gap-2">
              <Coins size={18} className="text-amber-600" />
              <span className="text-lg font-black">
                {currentPlayer.gold}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <PlusCircle size={15} className="text-green-600" />
              <span className="text-sm font-black text-green-700">
                +{calculateIncome(currentPlayer, gameState.board)}
              </span>
            </div>
          </div>

          <div className="flex flex-col p-1 neo-brutalist-card-sm">
            <div className="flex items-center gap-2">
              <Sword size={18} className="text-red-600" />
              <span className="text-lg font-black">
                {calculateStrength(currentPlayer.id, gameState.units)}
              </span>
            </div>
            <p className="text-sm font-black opacity-50 leading-none">Power</p>
          </div>
        </div>
      </div>

      {/* Intel Section */}
      <div className="flex-1 overflow-y-auto bg-parchment/30 min-w-[300px] lg:min-w-0 relative border-x lg:border-x-0 border-black/5">
        {gameState.selectedHex ? (
          <div className="p-1">
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

                const occupantId = unit?.ownerId ?? tile.ownerId;
                const occupant = occupantId !== null ? gameState.players[occupantId] : null;

                return (
                  <div className="space-y-1">
                    {/* Kingdom Intel */}
                    {occupant && (
                      <div className="space-y-0.5">
                        <div className="p-1 neo-brutalist-card-sm border-black/20">
                          <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 rounded-full border-2 border-black" style={{ backgroundColor: occupant.color }} />
                            <p className="font-black text-sm tracking-tight" style={{ color: occupant.color }}>
                              {COLOR_NAMES[occupant.color]} Empire
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1 text-amber-700">
                                <Coins size={14} />
                                <span className="text-sm font-black">+{calculateIncome(occupant, gameState.board)}</span>
                              </div>
                              <p className="text-sm font-black opacity-40">Total income</p>
                            </div>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1 text-red-700">
                                <Sword size={15} />
                                <span className="text-sm font-black">{calculateStrength(occupant.id, gameState.units)}</span>
                              </div>
                              <p className="text-sm font-black opacity-40">Power</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tile Info */}
                    <div className="space-y-0.5">
                      <div className="p-1 neo-brutalist-card-parchment">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl border-2 border-black/20 flex-shrink-0" style={{ backgroundColor: TERRAIN_COLORS[tile.terrain] }} />
                          <div className="flex-1">
                            <p className="font-black text-base tracking-tight leading-none">{tile.terrain}</p>
                            {SETTLEMENT_INCOME[tile.terrain] > 0 && (
                              <div className="flex items-center gap-1 text-amber-700">
                                <Coins size={14} />
                                <span className="text-sm font-black">+{SETTLEMENT_INCOME[tile.terrain]} Gold / turn</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Unit Info */}
                    {unit && (
                      <div className="space-y-0.5">
                        <div className="p-1 neo-brutalist-card-parchment border-black/10">
                          <div className="flex items-center gap-3 mb-0.5">
                            <div className="text-3xl bg-white w-12 h-12 rounded-xl border-2 border-black flex items-center justify-center shadow-sm">{UNIT_ICONS[unit.type]}</div>
                            <div>
                              <p className="font-black text-base tracking-tight leading-none">{unit.type}</p>
                              <p className="text-sm font-black" style={{ color: gameState.players[unit.ownerId].color }}>
                                {COLOR_NAMES[gameState.players[unit.ownerId].color]} Forces
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="p-1 bg-white border border-black/10 rounded-xl">
                              <p className="text-sm font-black opacity-40">Movement</p>
                              <div className="flex items-center gap-1">
                                <RotateCcw size={15} className="text-blue-600" />
                                <span className="text-sm font-black">{unit.movesLeft}/{UNIT_STATS[unit.type].moves}</span>
                              </div>
                            </div>
                            <div className="p-1 bg-white border border-black/10 rounded-xl">
                              <p className="text-sm font-black opacity-40">Range</p>
                              <div className="flex items-center gap-1">
                                <Sword size={15} className="text-red-600" />
                                <span className="text-sm font-black">{UNIT_STATS[unit.type].range}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Recruitment UI */}
                    {!unit && tile.ownerId === currentPlayer.id && (tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS) && (
                      <div className="space-y-0.5">
                        <div className="relative overflow-hidden border-b border-black/20 bg-stone-50 px-2 py-0.5 flex flex-col items-center">
                          <div className="grayscale opacity-20 pointer-events-none select-none absolute inset-0 flex items-center justify-center">
                            <span className="text-[20px]">🏰</span>
                          </div>
                          <p className="relative text-sm font-black tracking-[0.2em] opacity-60 z-10">Recruit forces</p>
                        </div>
                        <div className="grid grid-cols-1 gap-1">
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
                                className="p-1 border-2 border-black flex items-center justify-between transition-all relative group rounded-xl"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xl">{UNIT_ICONS[type]}</span>
                                  <div className="text-left">
                                    <p className="font-black text-sm leading-none">{type}</p>
                                    <div className="flex items-center gap-1.5">
                                      <div className="flex items-center gap-0.5">
                                        <RotateCcw size={15} className="text-blue-600" />
                                        <span className="text-sm font-bold">{stats.moves}</span>
                                      </div>
                                      <div className="flex items-center gap-0.5">
                                        <Sword size={15} className="text-red-600" />
                                        <span className="text-sm font-bold">{stats.range}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-right gap-1 bg-amber-100 px-1.5 py-0.5 rounded-lg border-2 border-amber-300">
                                  <Coins size={15} className="text-amber-700" />
                                  <span className="text-sm font-black text-amber-900">{stats.cost}</span>
                                </div>
                              </GameButton>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Upgrade UI */}
                    {tile.terrain !== TerrainType.CASTLE && tile.terrain !== TerrainType.GOLD_MINE && (
                      <div className="space-y-0.5">
                        {(() => {
                          let cost = 0;
                          let label = "";
                          if (tile.terrain === TerrainType.PLAINS && unit && unit.ownerId === currentPlayer.id && tile.ownerId !== currentPlayer.id) {
                            if (unit.hasActed) return <p className="text-sm opacity-50 p-2 bg-stone-100 rounded-xl border border-dashed border-black/20">Unit must have full actions to build.</p>;
                            cost = UPGRADE_COSTS[TerrainType.VILLAGE]; label = "Build village";
                          } else if (tile.terrain === TerrainType.MOUNTAIN && unit && unit.ownerId === currentPlayer.id && tile.ownerId !== currentPlayer.id) {
                            if (unit.hasActed) return <p className="text-sm opacity-50 p-2 bg-stone-100 rounded-xl border border-dashed border-black/20">Unit must have full actions to build.</p>;
                            cost = UPGRADE_COSTS[TerrainType.GOLD_MINE]; label = "Build gold mine";
                          } else if (tile.terrain === TerrainType.VILLAGE && tile.ownerId === currentPlayer.id) {
                            cost = UPGRADE_COSTS[TerrainType.FORTRESS]; label = "Upgrade to fortress";
                          } else if (tile.terrain === TerrainType.FORTRESS && tile.ownerId === currentPlayer.id) {
                            cost = UPGRADE_COSTS[TerrainType.CASTLE]; label = "Upgrade to castle";
                          }

                          if (!label) return <p className="text-sm opacity-50 p-2 bg-stone-100 rounded-xl border border-dashed border-black/20">No upgrades available here. Must own tile or occupy with unit.</p>;

                          const canAfford = currentPlayer.gold >= cost;

                          return (
                            <GameButton
                              onClick={() => upgradeSettlement(tile.coord)}
                              disabled={!canAfford}
                              variant="parchment"
                              fullWidth
                              className={cn(
                                "p-1 border-2 border-black flex items-center justify-between transition-all rounded-xl",
                                canAfford && "hover:bg-blue-100"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 bg-white rounded-lg border-2 border-black flex items-center justify-center">
                                  <PlusCircle size={20} className="text-blue-600" />
                                </div>
                                <p className="font-black text-sm">{label}</p>
                              </div>
                              <div className="flex items-center gap-1 bg-amber-100 px-1.5 py-0.5 rounded-lg border-2 border-amber-300">
                                <Coins size={14} className="text-amber-700" />
                                <span className="text-sm font-black text-amber-900">{cost}</span>
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
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40 p-6">
            <div className="text-5xl mb-3 grayscale">🏰</div>
            <div>
              <div className="relative overflow-hidden neo-brutalist-card-sm bg-stone-100 px-3 py-1.5 mb-2 flex flex-col items-center">
                <div className="grayscale opacity-20 pointer-events-none select-none absolute inset-0 flex items-center justify-center">
                  <span className="text-[32px]">🏰</span>
                </div>
                <p className="relative font-black text-sm tracking-widest z-10 font-serif">Imperial command</p>
              </div>
              <p className="text-sm font-bold">Select a tile or unit to begin</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {!gameState.isPlaybackMode && (
        <div className="p-1 border-l lg:border-l-0 lg:border-t-2 border-black/10 bg-parchment/50 space-y-1 w-48 lg:w-full flex-shrink-0">
          {!currentPlayer.isAutomaton && gameState.history && gameState.history.length > 0 && (
            <GameButton 
              onClick={undoMove}
              variant="parchment"
              size="sm"
              fullWidth
              className="py-2 text-sm border-2 border-black"
              icon={<RotateCcw size={15} />}
            >
              Undo move
            </GameButton>
          )}
          {!currentPlayer.isAutomaton && (
            <GameButton 
              onClick={endTurn}
              disabled={currentPlayer.isAutomaton}
              variant="primary"
              size="md"
              fullWidth
              className="py-3 text-sm"
            >
              {currentPlayer.isAutomaton ? automatonStatus : "End turn"}
              {!currentPlayer.isAutomaton && <ChevronRight size={20} className="ml-2 inline" />}
            </GameButton>
          )}
          {currentPlayer.isAutomaton && (
            <GameButton 
              disabled
              variant="primary"
              size="md"
              fullWidth
              className="py-3 text-sm"
            >
              {automatonStatus}
            </GameButton>
          )}
        </div>
      )}
    </div>
  );
};
