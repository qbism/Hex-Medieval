import { soundEngine } from './soundEngine';
import { HexCoord, GameState, UnitType } from '../types';

export type EffectType = 'move' | 'attack' | 'damage' | 'miss' | 'recruit' | 'upgrade' | 'victory' | 'click' | 'turnStart';

export interface EffectPayload {
  unitId?: string;
  unitType?: UnitType;
  to?: HexCoord;
  value?: number;
}

/**
 * Abstracts effects (sound, animation state) into a single call.
 * 3D components and game logic should call this instead of soundEngine directly.
 */
export function triggerEffect(
  type: EffectType,
  payload?: EffectPayload,
  setGameState?: React.Dispatch<React.SetStateAction<GameState | null>>
) {
  // 1. Play Sound
  switch (type) {
    case 'move': soundEngine.playMove(payload?.unitType); break;
    case 'attack': soundEngine.playAttack(payload?.unitType); break;
    case 'damage': soundEngine.playDamage(); break;
    case 'recruit': soundEngine.playRecruit(); break;
    case 'upgrade': soundEngine.playUpgrade(); break;
    case 'victory': soundEngine.playVictory(); break;
    case 'click': soundEngine.playClick(); break;
    case 'turnStart': soundEngine.playTurnFanfare(); break;
  }

  // 2. Dispatch Animation if applicable
  if (setGameState && payload) {
    setGameState(prev => {
      if (!prev) return prev;
      let newAnim: any = null;
      
      if (type === 'move' && payload.unitId && payload.to) {
        newAnim = { id: `move-${Date.now()}-${Math.random()}`, unitId: payload.unitId, type: 'move', to: payload.to };
      } else if (type === 'attack' && payload.unitId && payload.to) {
        newAnim = { id: `attack-${Date.now()}-${Math.random()}`, unitId: payload.unitId, type: 'attack', to: payload.to };
      } else if (type === 'damage' && payload.unitId && payload.to && payload.value !== undefined) {
        newAnim = { id: `dmg-${Date.now()}-${Math.random()}`, unitId: payload.unitId, type: 'damage', to: payload.to, value: payload.value };
      } else if (type === 'miss' && payload.unitId && payload.to) {
        newAnim = { id: `miss-${Date.now()}-${Math.random()}`, unitId: payload.unitId, type: 'miss', to: payload.to, value: 0 };
      }

      if (newAnim) {
        return {
          ...prev,
          animations: [
            ...prev.animations.filter(a => a.unitId !== payload.unitId),
            newAnim
          ]
        };
      }
      return prev;
    });
  }
}
