/**
 * MusicLibrary Core
 * A standalone procedural music engine using WebAudioTinySynth.
 */

import WebAudioTinySynth from 'webaudio-tinysynth';
import { 
  SectionType, 
  Instrument, 
  NoteEvent, 
  MusicalPart 
} from './types';
import { 
  MUSIC_STYLES, 
  MINOR_PROGRESSIONS, 
  MAJOR_PROGRESSIONS, 
  DEFAULT_INSTRUMENT_CHOICES 
} from './constants';

export class MusicEngine {
  private synth: any = null;
  private isPlaying: boolean = false;
  private currentGlobalStep: number = 0;
  private timer: NodeJS.Timeout | null = null;
  private nextNoteTime: number = 0;
  private readonly lookAhead = 0.2;
  private readonly scheduleInterval = 25;
  private stepDuration: number = 0.125;
  private bpm: number = 120;
  private baseNote: number = 50;
  private groove: string = 'straight';
  private mode: number[] = [0, 2, 3, 5, 7, 9, 10];
  
  public instrumentChoices = DEFAULT_INSTRUMENT_CHOICES;
  public currentInstruments: Record<MusicalPart, number> = {
    lead: 0,
    counter: 0,
    pad: 0,
    bass: 0,
    percussion: 0,
    strings: 0,
    organ: 0,
    bells: 0
  };
  
  private tracks: Record<Instrument, NoteEvent[]> = {
    harpsichord: [], oboe: [], choir: [], strings: [], organ: [], bass: [], perc: [], bells: []
  };
  private trackMap: Map<number, { pitch: number, vol: number, dur: number, chan: number }[]> = new Map();
  private totalSteps: number = 0;
  private readonly channelMap: Record<Instrument, number> = { 
    harpsichord: 0, oboe: 1, choir: 2, strings: 3, organ: 4, bass: 5, bells: 6, perc: 9 
  };

  constructor(options?: { baseNote?: number }) {
    if (options?.baseNote) this.baseNote = options.baseNote;
  }

  public init() {
    if (this.synth) return;
    try {
      this.synth = new WebAudioTinySynth({ quality: 1, useReverb: 1 });
      
      // Reset all channels and controllers to ensure clean tuning state
      for (let i = 0; i < 16; i++) {
        this.synth.send([0xB0 + i, 121, 0]); // Reset All Controllers
        this.synth.send([0xB0 + i, 101, 127]); // RPN null
        this.synth.send([0xB0 + i, 100, 127]);
        this.synth.send([0xB0 + i, 6, 0]);   // Data Entry reset
        this.synth.send([0xB0 + i, 10, 64]);  // Center pan
      }

      this.applyInstrumentChoices();
      
      // Global FX setup for thematic consistency
      this.synth.send([0xB0, 73, 0]);   // Ch 0: Punchy Lead Attack
      this.synth.send([0xB1, 73, 20]);  // Ch 1: Clean Counter Attack
      this.synth.send([0xB2, 73, 110]); // CC 73: Attack Time (soft choir)
      this.synth.send([0xB2, 72, 110]); // CC 72: Release Time
      this.synth.send([0xB4, 73, 40]);  // Organ faster attack
      this.synth.send([0xB6, 73, 90]);  // Bells softer attack
      this.synth.send([0xB6, 72, 127]); // Bells extreme release
      this.synth.send([0xB6, 91, 127]); // Bells max reverb
    } catch (e) {
      console.warn("MusicLibrary: Web Audio not supported", e);
    }
  }

  public setInstrumentChoice(part: MusicalPart, index: number) {
    this.currentInstruments[part] = index;
    if (this.synth) {
      this.applyInstrumentChoices();
    }
  }

  private applyInstrumentChoices() {
    if (!this.synth) return;
    const parts: MusicalPart[] = ['lead', 'counter', 'pad', 'bass', 'percussion', 'strings', 'organ', 'bells'];
    const channels = [0, 1, 2, 5, 9, 3, 4, 6];
    parts.forEach((part, i) => {
      const selection = this.currentInstruments[part];
      const inst = this.instrumentChoices[part][selection];
      const prog = inst.program;
      const chan = channels[i];

      this.synth!.send([0xC0 + chan, prog]);

      // Handle special volume/reverb for Wooden Flute (Program 73)
      // Standard values: Volume 100, Reverb 44
      let vol = 100;
      let rev = 44;

      if (inst.name === 'Wooden Flute' || prog === 73) {
        vol = 60; // 60% of normal
        rev = 88; // Double normal reverb
      }

      this.synth!.send([0xB0 + chan, 7, vol]);   // CC 7: Channel Volume
      this.synth!.send([0xB0 + chan, 91, rev]);  // CC 91: Reverb Level

      // Reset pitch bend and modulation on instrument change
      this.synth!.send([0xE0 + chan, 0, 64]); // Pitch Bend Center
      this.synth!.send([0xB0 + chan, 1, 0]);  // Modulation off
    });
  }

  public generateSong() {
    this.tracks = { harpsichord: [], oboe: [], choir: [], strings: [], organ: [], bass: [], perc: [], bells: [] };
    
    // Shuffle instruments for each part to ensure variety
    (Object.keys(this.instrumentChoices) as MusicalPart[]).forEach(part => {
      this.currentInstruments[part] = Math.floor(Math.random() * this.instrumentChoices[part].length);
    });
    this.applyInstrumentChoices();

    const style = MUSIC_STYLES[Math.floor(Math.random() * MUSIC_STYLES.length)];
    this.bpm = Math.floor(Math.random() * (style.bpm[1] - style.bpm[0])) + style.bpm[0];
    this.stepDuration = 60 / this.bpm / 4;
    this.mode = style.modes[Math.floor(Math.random() * style.modes.length)];
    this.baseNote = Math.floor(Math.random() * 12) + 40;
    this.groove = style.groove;
    
    const isMajor = this.mode[2] === 4;
    const progressions = isMajor ? MAJOR_PROGRESSIONS : MINOR_PROGRESSIONS;
    const progA = progressions[Math.floor(Math.random() * progressions.length)];
    const progB = progressions[Math.floor(Math.random() * progressions.length)];
    
    const motifA = this.generateMotif();
    const motifB = this.generateMotif();
    
    // Shuffled song varieties: Randomize the middle solos and duets
    const soloPool: SectionType[] = ['SoloHarpsi', 'SoloOboe', 'SoloStrings'];
    const duetPool: SectionType[] = ['DuetHarpsiOboe', 'DuetOboeStrings'];
    const middleSolo = soloPool[Math.floor(Math.random() * soloPool.length)];
    const middleDuet = duetPool[Math.floor(Math.random() * duetPool.length)];
    
    const structure: SectionType[] = ['Intro', 'A', 'B', middleSolo, 'A', middleDuet, 'B', 'Outro'];
    
    let currentStep = 0;
    for (const section of structure) {
      let numMeasures = 16;
      if (section === 'Intro' || section === 'Outro') numMeasures = 8;
      else if (section.startsWith('Solo') || section.startsWith('Duet')) numMeasures = 24;
      
      this.generateSection(section, progA, progB, motifA, motifB, currentStep, numMeasures);
      currentStep += numMeasures * 16;
    }
    this.totalSteps = currentStep;
    this.flattenTracks();
  }

  private flattenTracks() {
    this.trackMap.clear();
    for (const [inst, track] of Object.entries(this.tracks)) {
      const chan = this.channelMap[inst as Instrument];
      for (const note of track) {
        if (!this.trackMap.has(note.step)) this.trackMap.set(note.step, []);
        this.trackMap.get(note.step)!.push({
          pitch: note.pitch,
          vol: note.velocity,
          dur: note.duration * this.stepDuration,
          chan
        });
      }
    }
  }

  private generateMotif() {
    const notes = [];
    for (let m = 0; m < 4; m++) {
      let s = 0;
      while (s < 16) {
        const lengths = [1, 2, 2, 2, 4, 4, 8]; 
        const len = lengths[Math.floor(Math.random() * lengths.length)];
        if (s + len > 16) { s++; continue; }
        
        const isStrong = s % 4 === 0;
        // Tighter chordal anchors to avoid discordance
        const chordTones = [0, 2, 4, 7, -3];
        const passingTones = [1, 3, 5]; // Removed 6 (7th) and -1 from standard passes for stability
        
        if (Math.random() > 0.05) {
          // Significant bias towards chord tones on any note longer than a 16th
          const deg = (isStrong || len > 2)
            ? chordTones[Math.floor(Math.random() * chordTones.length)]
            : passingTones[Math.floor(Math.random() * passingTones.length)];
          notes.push({ step: m * 16 + s, degree: deg, duration: len * 0.9 });
        }
        s += len;
      }
    }
    return notes;
  }

  private generateSection(section: SectionType, progA: number[], progB: number[], motifA: any[], motifB: any[], startStep: number, numMeasures: number) {
    const prog = (section === 'B' || section === 'SoloOboe') ? progB : progA;
    const motif = (section === 'B' || section === 'SoloOboe') ? motifB : motifA;
    let currentSoloDeg = prog[0];
    
    for (let m = 0; m < numMeasures; m++) {
      const chordRoot = prog[Math.floor(m / 2) % prog.length];
      const measureStart = startStep + m * 16;
      const isTransition = (m >= numMeasures - 2);
      const isOutro = section === 'Outro';
      const isIntro = section === 'Intro';
      
      // 0. Bells
      if (m === 0 && !isIntro) {
        this.tracks.bells.push({ step: measureStart, pitch: this.getMidiNoteFromDegree(chordRoot), duration: 24, velocity: 0.64 });
      }
      
      // 1. Percussion
      this.generatePercussion(measureStart, isIntro, isOutro, isTransition, m, numMeasures);
      
      // 2. Bass
      if (!isIntro && !isOutro) {
        const bassLine = this.generateBassLine(chordRoot, this.groove, isTransition, m);
        bassLine.forEach(note => {
          this.tracks.bass.push({
            step: measureStart + note.step,
            pitch: this.getMidiNoteFromDegree(note.degree - 7),
            duration: note.duration,
            velocity: note.velocity
          });
        });
      }
      
      // 3. Pads
      if (m % 2 === 0 || isOutro) {
        const dur = isOutro ? 64 : 31.5;
        if (!isOutro || m === 0) {
          this.tracks.choir.push({ step: measureStart, pitch: this.getMidiNoteFromDegree(chordRoot), duration: dur, velocity: 0.6 });
          this.tracks.choir.push({ step: measureStart, pitch: this.getMidiNoteFromDegree(chordRoot - 7), duration: dur, velocity: 0.6 });
          this.tracks.organ.push({ step: measureStart, pitch: this.getMidiNoteFromDegree(chordRoot), duration: dur, velocity: 0.5 });
          this.tracks.organ.push({ step: measureStart, pitch: this.getMidiNoteFromDegree(chordRoot + 2), duration: dur, velocity: 0.4 });
          this.tracks.organ.push({ step: measureStart, pitch: this.getMidiNoteFromDegree(chordRoot + 4), duration: dur, velocity: 0.4 });
        }
      }
      
      // 4. Melody
      currentSoloDeg = this.generateMelody(section, measureStart, chordRoot, motif, m, isIntro, isOutro, currentSoloDeg);
    }
  }

  private generatePercussion(measureStart: number, isIntro: boolean, isOutro: boolean, isTransition: boolean, m: number, numMeasures: number) {
    const [kick, snare, toms, ride, crash] = [35, 38, 50, 53, 49];
    if (isOutro) {
      if (m === 0) {
        this.tracks.perc.push({ step: measureStart, pitch: kick, duration: 4, velocity: 1 });
        this.tracks.perc.push({ step: measureStart, pitch: crash, duration: 8, velocity: 1 });
        this.tracks.perc.push({ step: measureStart + 8, pitch: toms, duration: 2, velocity: 0.9 });
        this.tracks.perc.push({ step: measureStart + 12, pitch: snare, duration: 2, velocity: 1 });
      }
      return;
    }
    if (isIntro) return;

    const isFill = isTransition || (m % 4 === 3 && Math.random() > 0.5);
    if (isFill) {
      this.tracks.perc.push({ step: measureStart, pitch: kick, duration: 2, velocity: 1 });
      this.tracks.perc.push({ step: measureStart + 4, pitch: snare, duration: 2, velocity: 1 });
      this.tracks.perc.push({ step: measureStart + 4, pitch: toms, duration: 2, velocity: 0.8 });
      for (let i = 8; i < 16; i++) {
        const p = i % 2 === 0 ? snare : toms;
        this.tracks.perc.push({ step: measureStart + i, pitch: p, duration: 0.5, velocity: 0.7 + (i - 8) * 0.04 });
      }
      if (isTransition && m === numMeasures - 1) this.tracks.perc.push({ step: measureStart + 15, pitch: crash, duration: 4, velocity: 0.9 });
    } else {
      if (this.groove === 'driving' || this.groove === 'march') {
        [0, 8].forEach(s => this.tracks.perc.push({ step: measureStart + s, pitch: kick, duration: 2, velocity: 1 }));
        [4, 12].forEach(s => {
          this.tracks.perc.push({ step: measureStart + s, pitch: snare, duration: 2, velocity: 1 });
          this.tracks.perc.push({ step: measureStart + s, pitch: toms, duration: 2, velocity: 0.7 });
        });
        if (this.groove === 'driving') this.tracks.perc.push({ step: measureStart + 10, pitch: kick, duration: 2, velocity: 0.8 });
        else {
          this.tracks.perc.push({ step: measureStart + 14, pitch: toms, duration: 1, velocity: 0.7 });
          this.tracks.perc.push({ step: measureStart + 15, pitch: snare, duration: 1, velocity: 0.7 });
        }
      } else if (this.groove === 'syncopated') {
        [0, 8].forEach(s => this.tracks.perc.push({ step: measureStart + s, pitch: kick, duration: 2, velocity: 1 }));
        [3, 14].forEach(s => this.tracks.perc.push({ step: measureStart + s, pitch: kick, duration: 2, velocity: 0.8 }));
        this.tracks.perc.push({ step: measureStart + 10, pitch: snare, duration: 2, velocity: 0.8 });
        this.tracks.perc.push({ step: measureStart + 10, pitch: toms, duration: 2, velocity: 0.7 });
      }
    }
    const rideStep = this.groove === 'driving' ? 2 : 4;
    for (let i = 0; i < 16; i += rideStep) this.tracks.perc.push({ step: measureStart + i, pitch: ride, duration: 0.5, velocity: 0.6 });
  }

  private generateBassLine(chordRoot: number, groove: string, isTransition: boolean, measureIndex: number) {
    const notes = [];
    const isSickLick = !isTransition && (measureIndex % 4 === 3) && Math.random() > 0.4;
    if (isTransition) {
      const walk = [0, -1, -2, -3, -4, -5, -6, -7];
      for (let i = 0; i < 8; i++) notes.push({ step: i * 2, degree: chordRoot + walk[i % walk.length], duration: 1.5, velocity: 1 });
    } else if (isSickLick) {
      notes.push({ step: 0, degree: chordRoot, duration: 4, velocity: 1 }, { step: 4, degree: chordRoot + 4, duration: 2, velocity: 0.9 });
      const lick = [7, 6, 5, 4, 2, 1, 0, -1];
      for (let i = 0; i < 8; i++) if (Math.random() > 0.3 || i >= 6) notes.push({ step: 8 + i, degree: chordRoot + lick[i], duration: 1, velocity: 0.95 });
    } else if (groove === 'driving') {
      for (let i = 0; i < 8; i++) {
        let deg = chordRoot;
        if (i % 4 === 2) deg = chordRoot + 4; else if (i % 4 === 3) deg = chordRoot + 7;
        notes.push({ step: i * 2, degree: deg, duration: 1, velocity: i % 2 === 0 ? 0.9 : 0.7 });
      }
    } else if (groove === 'march') {
      [0, 8].forEach(s => notes.push({ step: s, degree: chordRoot, duration: 2, velocity: 1 }));
      notes.push({ step: 4, degree: chordRoot + 4, duration: 2, velocity: 0.9 }, { step: 12, degree: chordRoot - 3, duration: 2, velocity: 0.9 });
    } else {
      notes.push({ step: 0, degree: chordRoot, duration: 2, velocity: 0.9 });
      notes.push({ step: 4, degree: chordRoot + 4, duration: 1.5, velocity: 0.8 });
      notes.push({ step: 7, degree: chordRoot + 7, duration: 1, velocity: 0.8 });
      notes.push({ step: 8, degree: chordRoot, duration: 2, velocity: 0.9 });
      notes.push({ step: 12, degree: chordRoot + 4, duration: 1.5, velocity: 0.8 });
      notes.push({ step: 15, degree: chordRoot + 2, duration: 1, velocity: 0.7 });
    }
    return notes;
  }

  private generateMelody(section: SectionType, measureStart: number, chordRoot: number, motif: any[], m: number, isIntro: boolean, isOutro: boolean, currentSoloDeg: number): number {
    if (isOutro) {
      if (m === 0) {
        this.tracks.harpsichord.push({ step: measureStart, pitch: this.getMidiNoteFromDegree(chordRoot + 7), duration: 32, velocity: 1 });
        this.tracks.oboe.push({ step: measureStart, pitch: this.getMidiNoteFromDegree(chordRoot + 9), duration: 32, velocity: 0.9 });
      }
    } else if (section.startsWith('Solo')) {
      const inst = section === 'SoloHarpsi' ? 'harpsichord' : (section === 'SoloOboe' ? 'oboe' : 'strings');
      currentSoloDeg = this.generateSolo(inst, measureStart, chordRoot, currentSoloDeg);
      if (inst !== 'harpsichord') this.generatePad('harpsichord', measureStart, chordRoot);
      if (inst !== 'oboe') this.generatePad('oboe', measureStart, chordRoot);
      if (inst !== 'strings') this.generatePad('strings', measureStart, chordRoot);
    } else if (section.startsWith('Duet')) {
      const [i1, i2] = section === 'DuetHarpsiOboe' ? ['harpsichord', 'oboe'] : ['oboe', 'strings'];
      currentSoloDeg = this.generateDuet(i1 as Instrument, i2 as Instrument, measureStart, chordRoot, currentSoloDeg);
      if (i1 !== 'strings' && i2 !== 'strings') this.generatePad('strings', measureStart, chordRoot);
      if (i1 !== 'harpsichord' && i2 !== 'harpsichord') this.generatePad('harpsichord', measureStart, chordRoot);
    } else {
      const motifMeasure = m % 4;
      const notes = motif.filter(n => n.step >= motifMeasure * 16 && n.step < (motifMeasure + 1) * 16);
      notes.forEach(note => {
        const step = measureStart + (note.step % 16);
        // Reduce unison doubling clash by shifting the Oboe accompaniment 
        // to a more supportive role if it's not the primary focused section
        this.tracks.harpsichord.push({ step, pitch: this.getMidiNoteFromDegree(chordRoot + note.degree + 7), duration: note.duration, velocity: 0.95 });
        this.tracks.oboe.push({ step, pitch: this.getMidiNoteFromDegree(chordRoot + note.degree - 7), duration: note.duration, velocity: 0.7 });
      });
      if (!isIntro) {
        [{ s: 0, d: 4 }, { s: 4, d: 7 }, { s: 8, d: 4 }, { s: 12, d: 2 }].forEach(c => {
          this.tracks.strings.push({ step: measureStart + c.s, pitch: this.getMidiNoteFromDegree(chordRoot + c.d), duration: 3.5, velocity: 0.65 });
        });
      }
    }
    return currentSoloDeg;
  }

  private generateSolo(instrument: Instrument, measureStart: number, chordRoot: number, currentDeg: number) {
    let s = 0;
    while (s < 16) {
      const len = instrument === 'harpsichord' ? [0.5, 0.5, 1, 1, 2, 4][Math.floor(Math.random() * 6)] : [1, 1, 2, 2, 2, 4][Math.floor(Math.random() * 6)];
      if (s + len > 16) { s += 0.5; continue; }
      
      const isStrong = s % 4 === 0;
      
      if (Math.random() > 0.15) {
        // High likelihood of resetting to a chord tone on strong beats
        if (isStrong && Math.random() > 0.4) {
          currentDeg = chordRoot + [0, 2, 4, 7][Math.floor(Math.random() * 4)];
        } else {
          // Guided random walk
          const move = (Math.floor(Math.random() * 3) - 1); // -1, 0, or 1 for smoother transitions
          currentDeg += move;
          
          // High-pressure correction: if we land on a very discordant interval (like degree 1 or 3 in some modes)
          // on a long note, push it towards a chordal neighbor
          if (len > 2 && Math.abs(currentDeg - chordRoot) % 2 !== 0) {
            currentDeg += (Math.random() > 0.5 ? 1 : -1);
          }
        }

        if (currentDeg < chordRoot - 7) currentDeg += 7;
        if (currentDeg > chordRoot + 14) currentDeg -= 7;
        
        this.tracks[instrument].push({
          step: measureStart + s,
          pitch: this.getMidiNoteFromDegree(currentDeg + 7),
          duration: Math.max(0.2, len * 0.9),
          velocity: 1
        });
      }
      s += len;
    }
    return currentDeg;
  }

  private generateDuet(inst1: Instrument, inst2: Instrument, measureStart: number, chordRoot: number, currentDeg: number) {
    let s = 0;
    while (s < 16) {
      const len = [2, 2, 4, 4, 8][Math.floor(Math.random() * 5)];
      if (s + len > 16) { s++; continue; }
      if (Math.random() > 0.1) {
        currentDeg += (Math.floor(Math.random() * 5) - 2);
        if (currentDeg < chordRoot - 4) currentDeg += 4;
        if (currentDeg > chordRoot + 7) currentDeg -= 4;
        this.tracks[inst1].push({ step: measureStart + s, pitch: this.getMidiNoteFromDegree(currentDeg + 7), duration: len * 0.9, velocity: 1 });
        const off = Math.random() > 0.5 ? 2 : -2;
        this.tracks[inst2].push({ step: measureStart + s, pitch: this.getMidiNoteFromDegree(currentDeg + 7 + off), duration: len * 0.9, velocity: 0.9 });
      }
      s += len;
    }
    return currentDeg;
  }

  private generatePad(instrument: Instrument, measureStart: number, chordRoot: number) {
    [0, 4].forEach(off => this.tracks[instrument].push({ step: measureStart, pitch: this.getMidiNoteFromDegree(chordRoot + off), duration: 15.5, velocity: 0.7 - (off ? 0.1 : 0) }));
  }

  private getMidiNoteFromDegree(degree: number): number {
    const norm = Math.round(((degree % 7) + 7) % 7);
    const pitch = this.baseNote + Math.floor(degree / 7) * 12 + this.mode[norm];
    return isNaN(pitch) ? Math.round(this.baseNote) : Math.round(pitch);
  }

  public start() {
    this.init();
    if (this.synth?.audioContext?.state === 'suspended') this.synth.audioContext.resume();
    if (this.isPlaying) {
      if (this.synth && this.nextNoteTime < this.synth.audioContext.currentTime) this.nextNoteTime = this.synth.audioContext.currentTime + 0.05;
      return;
    }
    this.generateSong();
    this.isPlaying = true;
    this.currentGlobalStep = 0; 
    this.nextNoteTime = (this.synth?.audioContext?.currentTime || 0) + 0.1;
    this.scheduler();
  }

  public stop() {
    this.isPlaying = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.synth) for (let i = 0; i < 16; i++) this.synth.send([0xB0 + i, 120, 0]);
  }

  public resume() {
    if (this.synth?.audioContext?.state === 'suspended') this.synth.audioContext.resume();
  }

  private scheduler() {
    if (!this.isPlaying || !this.synth?.audioContext) return;
    if (this.nextNoteTime < this.synth.audioContext.currentTime) this.nextNoteTime = this.synth.audioContext.currentTime + 0.05;
    let count = 0;
    while (this.nextNoteTime < this.synth.audioContext.currentTime + this.lookAhead && count < 32) {
      try { this.playStep(this.currentGlobalStep, this.nextNoteTime); } catch (e) { console.error(e); }
      this.currentGlobalStep++;
      if (this.currentGlobalStep >= this.totalSteps) {
        this.currentGlobalStep = 0;
        this.generateSong();
      }
      this.nextNoteTime += this.stepDuration;
      count++;
    }
    this.timer = setTimeout(() => this.scheduler(), this.scheduleInterval);
  }

  private playStep(step: number, time: number) {
    const notes = this.trackMap.get(step);
    if (!notes) return;
    for (const note of notes) {
      this.sendMidi(note.chan, note.pitch, note.vol, note.dur, time);
    }
  }

  private sendMidi(channel: number, pitch: number, vol: number, dur: number, start: number) {
    if (!this.synth || !Number.isFinite(pitch)) return;
    const n = Math.max(0, Math.min(127, Math.floor(pitch)));
    const v = Math.max(0, Math.min(127, Math.floor(vol * 127)));
    this.synth.send([0x90 + channel, n, v], start);
    this.synth.send([0x80 + channel, n, 0], start + Math.max(0, dur));
  }

  public setVolume(vol: number) {
    if (this.synth) this.synth.setMasterVol(vol * 0.3);
  }
}
