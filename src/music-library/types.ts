export type SectionType = 'Intro' | 'A' | 'B' | 'SoloHarpsi' | 'SoloOboe' | 'SoloStrings' | 'DuetHarpsiOboe' | 'DuetOboeStrings' | 'Outro';
export type Instrument = 'harpsichord' | 'oboe' | 'choir' | 'strings' | 'organ' | 'bass' | 'perc' | 'bells';

export interface NoteEvent {
  step: number;
  pitch: number;
  duration: number;
  velocity: number;
}

export type MusicalPart = 'lead' | 'counter' | 'pad' | 'bass';

export interface InstrumentChoice {
  name: string;
  program: number;
}

export interface SongStyle {
  name: string;
  bpm: [number, number];
  modes: number[][];
  groove: 'straight' | 'syncopated' | 'driving' | 'march';
}
