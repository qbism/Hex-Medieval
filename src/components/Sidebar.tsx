import React from 'react';
import { motion } from 'motion/react';
import { GameButton } from './GameButton';
import { 
  Volume2, 
  VolumeX, 
  HelpCircle, 
  X, 
  Coins, 
  PlusCircle, 
  Sword 
} from 'lucide-react';
import { 
  GameState, 
  TerrainType, 
  UnitType, 
  COLOR_NAMES, 
  SETTLEMENT_INCOME, 
  UNIT_STATS, 
  cn,
  Unit as _Unit,
  TERRAIN_COLORS
} from '../types';
import { calculateIncome } from '../gameEngine';
import { calculateStrength } from '../automaton/utils';

interface SidebarProps {
  gameState: GameState;
  currentPlayer: any;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  setShowInstructions: (show: boolean) => void;
  setSetupMode: (setup: boolean) => void;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  recruitUnit: (type: UnitType) => void;
  handleUpgradeSettlement: (coord: any) => void;
}

export const Sidebar = ({
  gameState,
  currentPlayer,
  isMuted,
  setIsMuted,
  setShowInstructions,
  setSetupMode,
  setGameState,
  recruitUnit,
  handleUpgradeSettlement
}: SidebarProps) => {
  return (
    <div 
      className={cn(
        "absolute z-20 bg-stone-100 border-2 border-black flex shadow-2xl transition-all duration-300 m-2",
        // Mobile: Top horizontal
        "inset-x-0 top-0 flex-row overflow-x-auto h-44",
        // Desktop: Right vertical
        "lg:inset-y-0 lg:right-0 lg:left-auto lg:w-64 lg:max-h-none lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden"
      )}
      style={{
        clipPath: 'polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px), 0 10px)'
      }}
    >
      {/* HUD Section */}
      <div className="p-3 border-r lg:border-r-0 lg:border-b border-black/10 bg-stone-50 space-y-3 w-56 lg:w-full flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full border-2 border-black" style={{ backgroundColor: currentPlayer.color }} />
            <div>
              <p className="text-base font-black leading-none">
                {COLOR_NAMES[currentPlayer.color]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <GameButton 
              onClick={() => setIsMuted(!isMuted)}
              variant="ghost"
              size="icon"
              className="p-1.5 border border-black/10"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </GameButton>
            <GameButton 
              onClick={() => setShowInstructions(true)}
              variant="ghost"
              size="icon"
              className="p-1.5 text-stone-500 hover:text-black border border-black/10"
              title="Help"
            >
              <HelpCircle size={14} />
            </GameButton>
            <GameButton 
              onClick={() => {
                if (confirm('Are you sure you want to quit the current game? All progress will be lost.')) {
                  setSetupMode(true);
                  setGameState(null);
                }
              }}
              variant="ghost"
              size="icon"
              className="p-1.5 text-red-500 hover:text-red-700 border border-black/10"
              title="Quit Game"
            >
              <X size={14} />
            </GameButton>
          </div>
        </div>

        <div className="flex items-center justify-between p-2.5 bg-white border border-black/10 rounded-xl shadow-sm">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <Coins size={18} className="text-amber-600" />
                <span className="text-xl font-bold">
                  {currentPlayer.gold}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <PlusCircle size={10} className="text-green-600" />
                <span className="text-label font-bold text-green-700">
                  +{calculateIncome(currentPlayer, gameState.board)} / turn
                </span>
              </div>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <Sword size={18} className="text-red-600" />
                <span className="text-xl font-bold">
                  {calculateStrength(currentPlayer.id, gameState.units)}
                </span>
              </div>
              <p className="text-label font-bold opacity-50 uppercase leading-none">Strength</p>
            </div>
          </div>
        </div>
      </div>

      {/* Intel Section */}
      <div className="flex-1 p-3 overflow-y-auto bg-stone-50/50 min-w-[260px] lg:min-w-0">
        {gameState.selectedHex ? (
          <div className="h-full">
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
                    <div className="space-y-4">
                      {/* Tile Info */}
                      <div className="space-y-1.5">
                        <p className="text-label font-bold uppercase tracking-widest opacity-50">Terrain</p>
                        <div className="flex items-center gap-3 p-2 bg-white border border-black/10 rounded-xl shadow-sm">
                          <div className="w-5 h-5 rounded-lg border border-black/20" style={{ backgroundColor: TERRAIN_COLORS[tile.terrain] }} />
                          <div>
                            <p className="font-bold text-sm leading-none">{tile.terrain}</p>
                            {SETTLEMENT_INCOME[tile.terrain] > 0 && (
                              <div className="mt-1 flex items-center gap-1 text-amber-700">
                                <Coins size={10} />
                                <span className="text-label font-bold">+{SETTLEMENT_INCOME[tile.terrain]} Gold / turn</span>
                              </div>
                            )}
                            {tile.ownerId !== null && (
                              <div className="mt-2 pt-2 border-t border-black/10">
                                <p className="text-label font-bold mb-1" style={{ color: gameState.players[tile.ownerId].color }}>
                                  {COLOR_NAMES[gameState.players[tile.ownerId].color]} Empire
                                </p>
                                <div className="flex items-center gap-3 text-xs">
                                  <div className="flex items-center gap-1 text-green-700" title="Empire Gold Production">
                                    <PlusCircle size={10} />
                                    <span className="font-bold">+{calculateIncome(gameState.players[tile.ownerId], gameState.board)}/turn</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-red-700" title="Empire Military Strength">
                                    <Sword size={10} />
                                    <span className="font-bold">{calculateStrength(tile.ownerId, gameState.units)}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Unit Info */}
                      {unit && (
                        <div className="space-y-1.5">
                          <p className="text-label font-bold uppercase tracking-widest opacity-50">Occupying Unit</p>
                          <div className="p-3 bg-white border border-black/10 rounded-xl shadow-sm space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="font-bold text-sm">{unit.type}</p>
                              <p className="text-xs font-bold" style={{ color: gameState.players[unit.ownerId].color }}>
                                {COLOR_NAMES[gameState.players[unit.ownerId].color]}
                              </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-1.5 bg-stone-50 rounded-lg border border-black/5">
                                <p className="text-[10px] uppercase opacity-50 leading-none mb-1">Moves</p>
                                <p className="font-bold text-xs">{unit.movesLeft} / {UNIT_STATS[unit.type].moves}</p>
                              </div>
                              <div className="p-1.5 bg-stone-50 rounded-lg border border-black/5">
                                <p className="text-[10px] uppercase opacity-50 leading-none mb-1">Range</p>
                                <p className="font-bold text-xs">{UNIT_STATS[unit.type].range} hex</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {tile.ownerId === currentPlayer.id && (
                        <div className="space-y-2">
                          <p className="text-label font-bold uppercase tracking-widest opacity-50">Settlement Actions</p>
                          <div className="grid grid-cols-1 gap-2">
                            {tile.terrain === TerrainType.VILLAGE && (
                              <GameButton 
                                onClick={() => handleUpgradeSettlement(tile.coord)}
                                disabled={currentPlayer.gold < 150}
                                variant="primary"
                                size="sm"
                                fullWidth
                                className="bg-indigo-600 hover:bg-indigo-700"
                              >
                                Upgrade to Fortress (150G)
                              </GameButton>
                            )}
                            {tile.terrain === TerrainType.FORTRESS && (
                              <GameButton 
                                onClick={() => handleUpgradeSettlement(tile.coord)}
                                disabled={currentPlayer.gold < 300}
                                variant="primary"
                                size="sm"
                                fullWidth
                                className="bg-indigo-800 hover:bg-indigo-900"
                              >
                                Upgrade to Castle (300G)
                              </GameButton>
                            )}
                            {(tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.CASTLE) && !unit && (
                              <div className="space-y-1.5 mt-2">
                                <p className="text-[10px] font-bold uppercase opacity-50">Recruit Units</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {(Object.keys(UNIT_STATS) as UnitType[]).map(type => (
                                    <GameButton
                                      key={type}
                                      onClick={() => recruitUnit(type)}
                                      disabled={currentPlayer.gold < UNIT_STATS[type].cost}
                                      variant="ghost"
                                      size="sm"
                                      className="p-2 bg-white border border-black/10 text-left hover:bg-stone-50 block"
                                    >
                                      <p className="font-bold text-[10px] leading-none mb-1">{type}</p>
                                      <div className="flex items-center gap-1 text-amber-600">
                                        <Coins size={8} />
                                        <span className="text-[10px] font-bold">{UNIT_STATS[type].cost}</span>
                                      </div>
                                    </GameButton>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Expansion Action */}
                      {tile.ownerId === null && unit && unit.ownerId === currentPlayer.id && !unit.hasActed && (
                        <div className="space-y-2">
                          <p className="text-label font-bold uppercase tracking-widest opacity-50">Expansion</p>
                          {tile.terrain === TerrainType.PLAINS && (
                            <GameButton 
                              onClick={() => handleUpgradeSettlement(tile.coord)}
                              disabled={currentPlayer.gold < 100}
                              variant="primary"
                              size="sm"
                              fullWidth
                              className="bg-green-600 hover:bg-green-700"
                            >
                              Build Village (100G)
                            </GameButton>
                          )}
                          {tile.terrain === TerrainType.MOUNTAIN && (
                            <GameButton 
                              onClick={() => handleUpgradeSettlement(tile.coord)}
                              disabled={currentPlayer.gold < 500}
                              variant="primary"
                              size="sm"
                              fullWidth
                              className="bg-amber-600 hover:bg-amber-700"
                            >
                              Build Gold Mine (500G)
                            </GameButton>
                          )}
                        </div>
                      )}
                    </div>
                  );
              })()}
            </motion.div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 opacity-30">
            <HelpCircle size={32} className="mb-2" />
            <p className="text-xs font-bold uppercase tracking-widest">Select a tile or unit for intel</p>
          </div>
        )}
      </div>
    </div>
  );
};
