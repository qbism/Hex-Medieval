import { Unit, UnitType } from './types';

/**
 * Runaway loop detection utility.
 * Throws an error or returns true if the counter exceeds the limit.
 */
export function checkRunaway(counter: number, limit: number, functionName: string): boolean {
  if (counter > limit) {
    console.warn(`Runaway loop detected in ${functionName}! Excessive iterations (${counter}). Kicking out.`);
    return true;
  }
  return false;
}

/**
 * A simple class to track loop safety.
 */
export class LoopSafety {
  private counter: number = 0;
  private limit: number;
  private functionName: string;

  constructor(functionName: string, limit: number = 1000) {
    this.functionName = functionName;
    this.limit = limit;
  }

  tick(): boolean {
    this.counter++;
    return checkRunaway(this.counter, this.limit, this.functionName);
  }

  get count(): number {
    return this.counter;
  }
}

export const calculateStrength = (playerId: number, units: Unit[]) => {
  return units
    .filter(u => u.ownerId === playerId)
    .reduce((acc, u) => {
      if (u.type === UnitType.INFANTRY) return acc + 1;
      if (u.type === UnitType.ARCHER) return acc + 2;
      if (u.type === UnitType.KNIGHT) return acc + 4;
      if (u.type === UnitType.CATAPULT) return acc + 6;
      return acc;
    }, 0);
};
