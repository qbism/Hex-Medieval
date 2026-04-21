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
  [1, 4, 0, 0], // ii - V - i (Jazz Minor Turnaround)
];

export const MAJOR_PROGRESSIONS = [
  [0, 3, 4, 0], // I - IV - V - I
  [0, 5, 3, 4], // I - vi - IV - V ('50s Pop Progression)
  [0, 4, 5, 3], // I - V - vi - IV (The "Axis" Progression)
  [0, 4, 0, 4], // I - V - I - V (Fanfare)
  [1, 4, 0, 0], // ii - V - I (Jazz ii-V-I Standard)
  [0, 6, 3, 0], // I - bVII - IV - I (Rock Mixolydian Vamp)
  [0, 4, 5, 2, 3, 0, 3, 4], // I - V - vi - iii - IV - I - IV - V (Pachelbel's Canon)
];

export const DEFAULT_INSTRUMENT_CHOICES: Record<MusicalPart, InstrumentChoice[]> = {
  lead: [
    { name: 'Plucked Lute', program: 104 },
    { name: 'Oboe', program: 68 },
    { name: 'Wooden Flute', program: 73 },
    { name: 'Harpsichord', program: 6 }
  ],
  counter: [
    { name: 'Fiddle', program: 110 }
  ],
  pad: [
    { name: 'Gothic Choir', program: 52 }
  ],
  bass: [
    { name: 'Acoustic Bass', program: 32 }
  ],
  percussion: [
    { name: 'Orchard / Concert', program: 48 }
  ],
  strings: [
    { name: 'Orchestral Harp', program: 46 }
  ],
  organ: [
    { name: 'Rock Organ', program: 18 }
  ],
  bells: [
    { name: 'Tubular Bells', program: 14 }
  ]
};
