# MusicLibrary

A procedural medieval music generation and playback library powered by `webaudio-tinysynth`.

## Features
- **Procedural Generation**: Generates full songs with multiple sections (Intro, A/B themes, Solos, Duets, Outros).
- **Style Variation**: Supports multiple modes (Dorian, Phrygian, harmonic minor, etc.) and grooves (straight, driving, syncopated, march).
- **Intelligent Leads**: Generates lyrical melodies with varied rhythms and smooth transitions.
- **Dynamic Instrumentation**: Easily swap instruments for Lead, Counter, Pad, and Bass voices.
- **Self-Contained**: Manages its own WebAudio context and MIDI synthesis.

## Quick Start

### Installation
Ensure `webaudio-tinysynth` is installed in your project:
```bash
npm install webaudio-tinysynth
```

### Integration

```typescript
import { MusicEngine } from './music-library';

// 1. Initialize the engine
const music = new MusicEngine({ baseNote: 50 });

// 2. Start playback (includes generation)
// Note: Must be called after a user interaction to resume WebAudio context
music.start();

// 3. Adjust Volume
music.setVolume(0.5);

// 4. Change Instruments
// Part: 'lead', 'counter', 'pad', 'bass'
// Index: index into the instrumentChoices array for that part
music.setInstrumentChoice('lead', 1); // Selects Plucked Lute

// 5. Stop
music.stop();
```

## Advanced Usage

### Accessing Choices
You can inspect available instruments and styles:
```typescript
import { MUSIC_STYLES, DEFAULT_INSTRUMENT_CHOICES } from './music-library';

console.log(MUSIC_STYLES); // Array of available procedural styles
console.log(DEFAULT_INSTRUMENT_CHOICES); // Map of parts to instrument programs
```

### Manual Song Generation
You can force a re-generation of the song without stopping playback:
```typescript
music.generateSong();
```

## Architecture Notes
- **Channel Mapping**:
  - Ch 0: Lead
  - Ch 1: Counter
  - Ch 2: Pad (Choir)
  - Ch 3: Tremolo Strings
  - Ch 4: Organ
  - Ch 5: Bass
  - Ch 6: Bells
  - Ch 9: Percussion
- **Performance**: Song generation is synchronous and takes ~5-15ms for a 4-minute arrangement.
- **Timing**: Uses a look-ahead scheduler (200ms) to ensure sample-accurate playback regardless of main thread jitter.
