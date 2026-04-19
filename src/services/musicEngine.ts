/**
 * Medieval Music Engine Wrapper
 * This file is now a thin wrapper around the standalone /src/music-library.
 * Use /src/music-library directly in new projects!
 */

import { MusicEngine, MusicalPart, InstrumentChoice } from '../music-library';

// Re-exporting types for existing consumers
export type { MusicalPart, InstrumentChoice };

// Exporting the singleton instance used by the game
export const musicEngine = new MusicEngine();
