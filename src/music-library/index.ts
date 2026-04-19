export * from './Core';
export * from './types';
export * from './constants';

import { MusicEngine } from './Core';

// Singleton instance for easy replacement of existing musicEngine.ts exports
export const musicLibrary = new MusicEngine();
