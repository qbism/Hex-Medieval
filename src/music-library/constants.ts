import { SongStyle, InstrumentChoice, MusicalPart } from './types';

export const MUSIC_STYLES: SongStyle[] = [
  { name: 'Gothic Cathedral', bpm: [91, 117], modes: [[0, 2, 3, 5, 7, 8, 11]], groove: 'straight' }, // Harmonic Minor
  { name: 'Vampire Hunter', bpm: [130, 155], modes: [[0, 2, 3, 5, 7, 8, 10]], groove: 'driving' }, // Aeolian
  { name: 'Dark Ritual', bpm: [123, 149], modes: [[0, 1, 3, 5, 7, 8, 10]], groove: 'syncopated' }, // Phrygian
  { name: 'Ruined Castle', bpm: [80, 100], modes: [[0, 2, 3, 5, 7, 9, 10]], groove: 'march' }, // Dorian
  { name: 'Inspiring March', bpm: [110, 130], modes: [[0, 2, 4, 5, 7, 9, 11]], groove: 'march' }, // Ionian (Major)
  { name: 'Glorious Fanfare', bpm: [120, 140], modes: [[0, 2, 4, 5, 7, 9, 10]], groove: 'driving' } // Mixolydian (Major)
];

export const MINOR_PROGRESSIONS = [
  [0, 5, 6, 0], // i - VI - VII - i (Epic Minor)
  [0, 3, 4, 0], // i - iv - V - i (Classic Minor)
  [0, 5, 2, 4], // i - VI - III - V (Dark Fantasy)
  [0, 1, 0, 4], // i - bII - i - V (Phrygian/Vampiric flavor)
];

export const MAJOR_PROGRESSIONS = [
  [0, 3, 4, 0], // I - IV - V - I
  [0, 5, 3, 4], // I - vi - IV - V
  [0, 4, 5, 3], // I - V - vi - IV
  [0, 4, 0, 4], // I - V - I - V (Fanfare)
];

export const DEFAULT_INSTRUMENT_CHOICES: Record<MusicalPart, InstrumentChoice[]> = {
  lead: [
    { name: 'Harpsichord', program: 6 },
    { name: 'Plucked Lute', program: 104 },
    { name: 'Wooden Flute', program: 73 }
  ],
  counter: [
    { name: 'Oboe', program: 68 },
    { name: 'Recorder', program: 79 },
    { name: 'Fiddle', program: 110 }
  ],
  pad: [
    { name: 'Gothic Choir', program: 52 }, 
    { name: 'String Ensemble', program: 48 },
    { name: 'Warm Pad', program: 89 }
  ],
  bass: [
    { name: 'Cello / Smooth', program: 42 },
    { name: 'Acoustic Bass', program: 32 },
    { name: 'Tuba / Brass', program: 58 }
  ]
};
