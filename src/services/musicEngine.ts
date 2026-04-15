/**
 * Medieval Music Engine
 * Simulates period instruments like Lutes, Recorders, and Tabors.
 * Uses Modal scales (Dorian, Phrygian, Mixolydian) and parallel harmonies.
 */

import WebAudioTinySynth from 'webaudio-tinysynth';

type SectionType = 'Intro' | 'A' | 'B' | 'SoloLute' | 'SoloRecorder' | 'SoloShawm' | 'DuetLuteRecorder' | 'DuetRecorderShawm' | 'Outro';
type Instrument = 'lute' | 'recorder' | 'viol' | 'shawm' | 'talharpa' | 'perc' | 'hurdyGurdy';

interface NoteEvent {
  step: number;
  pitch: number;
  duration: number;
  velocity: number;
}

class MusicEngine {
  private synth: any = null;
  private isPlaying: boolean = false;
  private currentGlobalStep: number = 0;
  private timer: NodeJS.Timeout | null = null;
  private nextNoteTime: number = 0;
  private readonly lookAhead = 0.2;
  private readonly scheduleInterval = 25;
  private stepDuration: number = 0.125; // 120 BPM 16th notes
  private bpm: number = 120;
  private baseNote: number = 50; // D3
  private groove: 'straight' | 'syncopated' | 'driving' | 'march' = 'straight';
  
  private tracks: Record<Instrument, NoteEvent[]> = {
    lute: [], recorder: [], viol: [], shawm: [], talharpa: [], perc: [], hurdyGurdy: []
  };
  private totalSteps: number = 0;
  private mode: number[] = [0, 2, 3, 5, 7, 9, 10]; // Dorian

  private init() {
    if (this.synth) return;
    try {
      this.synth = new WebAudioTinySynth({ quality: 1, useReverb: 1 });
      
      // Set up instruments
      this.synth.send([0xC0, 104]); // Ch 0: Lute -> Sitar
      this.synth.send([0xC1, 79]);  // Ch 1: Recorder -> Ocarina
      this.synth.send([0xC2, 42]);  // Ch 2: Viol (Cello)
      this.synth.send([0xB2, 73, 90]); // CC 73: Attack Time (soft)
      this.synth.send([0xB2, 72, 90]); // CC 72: Release Time (soft)
      this.synth.send([0xC3, 69]);  // Ch 3: Shawm -> English Horn
      this.synth.send([0xC4, 20]);  // Ch 4: Hurdy-Gurdy -> Reed Organ
      this.synth.send([0xB4, 1, 80]); // CC 1: Modulation (Vibrato) for Organ
      this.synth.send([0xC5, 32]);  // Ch 5: Talharpa (Acoustic Bass - twangy backbeat)
    } catch (e) {
      console.warn("Music Engine: Web Audio not supported", e);
    }
  }

  private generateSong() {
    this.tracks = { lute: [], recorder: [], viol: [], shawm: [], talharpa: [], perc: [], hurdyGurdy: [] };
    this.totalSteps = 0;
    
    const styles = [
      { name: 'Tavern Jig', bpm: [130, 160], modes: [[0, 2, 4, 5, 7, 9, 10], [0, 2, 4, 5, 7, 9, 11]], groove: 'driving' }, // Mixolydian, Ionian
      { name: 'Royal Court', bpm: [90, 110], modes: [[0, 2, 4, 5, 7, 9, 11], [0, 2, 3, 5, 7, 9, 10]], groove: 'march' }, // Ionian, Dorian
      { name: 'Dark Battle', bpm: [110, 135], modes: [[0, 1, 3, 5, 7, 8, 10], [0, 2, 3, 5, 7, 8, 10]], groove: 'syncopated' }, // Phrygian, Aeolian
      { name: 'Melancholy Dirge', bpm: [70, 90], modes: [[0, 2, 3, 5, 7, 8, 10], [0, 2, 3, 5, 7, 8, 11]], groove: 'straight' } // Aeolian, Harmonic Minor
    ];
    
    const style = styles[Math.floor(Math.random() * styles.length)];
    this.bpm = Math.floor(Math.random() * (style.bpm[1] - style.bpm[0])) + style.bpm[0];
    this.stepDuration = 60 / this.bpm / 4; // 16th note duration
    this.mode = style.modes[Math.floor(Math.random() * style.modes.length)];
    this.baseNote = Math.floor(Math.random() * 12) + 45; // Random key from A2 to G#3
    this.groove = style.groove as any;
    
    const isMajor = this.mode[2] === 4;
    const keyType = isMajor ? 'Major' : 'Minor';
    console.log(`Generated Song: ${style.name} | ${this.bpm} BPM | Key: ${this.baseNote} (${keyType})`);
    
    let progressions = [];
    if (isMajor) {
      progressions = [
        [0, 3, 4, 0], // I - IV - V - I
        [0, 5, 3, 4], // I - vi - IV - V
        [0, 4, 5, 3], // I - V - vi - IV
        [0, 1, 4, 0], // I - ii - V - I
      ];
    } else {
      progressions = [
        [0, 5, 6, 0], // i - VI - VII - i
        [0, 3, 4, 0], // i - iv - v - i
        [0, 6, 5, 4], // i - VII - VI - V
        [0, 2, 6, 0], // i - III - VII - i
      ];
    }
    const progA = progressions[Math.floor(Math.random() * progressions.length)];
    const progB = progressions[Math.floor(Math.random() * progressions.length)];
    
    const motifA = this.generateMotif();
    const motifB = this.generateMotif();
    
    // A classic arrangement structure: Intro, Theme A, Theme B, Solo 1, Theme A, Duet, Theme B, Outro
    // Total measures: 8 + 16 + 16 + 24 + 16 + 24 + 16 + 8 = 128 measures (approx 4.2 minutes at 120bpm)
    const structure: SectionType[] = ['Intro', 'A', 'B', 'SoloLute', 'A', 'DuetRecorderShawm', 'B', 'Outro'];
    
    let currentStep = 0;
    for (const section of structure) {
      let numMeasures = 16;
      if (section === 'Intro' || section === 'Outro') numMeasures = 8;
      else if (section.startsWith('Solo') || section.startsWith('Duet')) numMeasures = 24;
      
      this.generateSection(section, progA, progB, motifA, motifB, currentStep, numMeasures);
      currentStep += numMeasures * 16; // numMeasures * 16 steps
    }
    this.totalSteps = currentStep;
  }

  private generateMotif() {
    const notes = [];
    let currentDeg = 0;
    
    // Generate a 4-measure (64 step) motif for longer, more lyrical phrasing
    for (let m = 0; m < 4; m++) {
      let s = 0;
      while (s < 16) {
        // Favor longer notes (8th, quarter, half) for a more lyrical melody
        const lengths = [2, 2, 4, 4, 8]; 
        const len = lengths[Math.floor(Math.random() * lengths.length)];
        
        if (s + len > 16) {
          s++;
          continue;
        }
        
        const isStrong = s % 4 === 0;
        const chordTones = [0, 2, 4, -3];
        const passingTones = [-1, 1, 3, 5];
        
        if (Math.random() > 0.1) { // 90% chance to play a note
          // Move smoothly
          if (isStrong) {
            currentDeg = chordTones[Math.floor(Math.random() * chordTones.length)];
          } else {
            currentDeg = passingTones[Math.floor(Math.random() * passingTones.length)];
          }
          
          notes.push({ step: m * 16 + s, degree: currentDeg, duration: len * 0.9 });
        }
        s += len;
      }
    }
    return notes;
  }

  private generateSection(
    section: SectionType, 
    progA: number[], progB: number[], 
    motifA: any[], motifB: any[], 
    startStep: number,
    numMeasures: number = 8
  ) {
    const prog = (section === 'B' || section === 'SoloRecorder') ? progB : progA;
    const motif = (section === 'B' || section === 'SoloRecorder') ? motifB : motifA;
    
    let currentSoloDeg = prog[0];
    
    for (let m = 0; m < numMeasures; m++) {
      const chordRoot = prog[Math.floor(m / 2) % prog.length];
      const measureStart = startStep + m * 16;
      
      const isTransition = (m === numMeasures - 1) || (m === numMeasures - 2); // Make fills longer
      const isOutro = section === 'Outro';
      const isIntro = section === 'Intro';
      
      // 1. Percussion
      if (isOutro) {
        if (m === 0) {
          this.tracks.perc.push({ step: measureStart, pitch: 35, duration: 4, velocity: 1.0 }); // Big final kick
          this.tracks.perc.push({ step: measureStart, pitch: 54, duration: 4, velocity: 1.0 }); // Big final tambourine crash
        }
      } else if (!isIntro) {
        if (isTransition) {
          // Flourish
          this.tracks.perc.push({ step: measureStart + 0, pitch: 35, duration: 2, velocity: 1.0 });
          this.tracks.perc.push({ step: measureStart + 4, pitch: 38, duration: 2, velocity: 1.0 });
          for (let i = 8; i < 16; i++) {
            const pitch = i % 2 === 0 ? 38 : 47;
            this.tracks.perc.push({ step: measureStart + i, pitch, duration: 0.5, velocity: 0.6 + ((i - 8) * 0.05) });
          }
        } else {
          // Normal beat based on groove
          if (this.groove === 'driving') {
            this.tracks.perc.push({ step: measureStart + 0, pitch: 35, duration: 2, velocity: 1.0 });
            this.tracks.perc.push({ step: measureStart + 4, pitch: 38, duration: 2, velocity: 1.0 });
            this.tracks.perc.push({ step: measureStart + 8, pitch: 35, duration: 2, velocity: 1.0 });
            this.tracks.perc.push({ step: measureStart + 12, pitch: 38, duration: 2, velocity: 1.0 });
            this.tracks.perc.push({ step: measureStart + 10, pitch: 35, duration: 2, velocity: 0.8 });
          } else if (this.groove === 'march') {
            this.tracks.perc.push({ step: measureStart + 0, pitch: 35, duration: 2, velocity: 1.0 });
            this.tracks.perc.push({ step: measureStart + 4, pitch: 38, duration: 2, velocity: 1.0 });
            this.tracks.perc.push({ step: measureStart + 8, pitch: 35, duration: 2, velocity: 1.0 });
            this.tracks.perc.push({ step: measureStart + 12, pitch: 38, duration: 2, velocity: 1.0 });
            this.tracks.perc.push({ step: measureStart + 14, pitch: 38, duration: 1, velocity: 0.7 });
            this.tracks.perc.push({ step: measureStart + 15, pitch: 38, duration: 1, velocity: 0.7 });
          } else if (this.groove === 'syncopated') {
            this.tracks.perc.push({ step: measureStart + 0, pitch: 35, duration: 2, velocity: 1.0 });
            this.tracks.perc.push({ step: measureStart + 3, pitch: 35, duration: 2, velocity: 0.8 });
            this.tracks.perc.push({ step: measureStart + 8, pitch: 35, duration: 2, velocity: 1.0 });
            this.tracks.perc.push({ step: measureStart + 10, pitch: 38, duration: 2, velocity: 0.8 });
            this.tracks.perc.push({ step: measureStart + 14, pitch: 35, duration: 2, velocity: 0.8 });
          } else {
            this.tracks.perc.push({ step: measureStart + 0, pitch: 35, duration: 2, velocity: 1.0 });
            this.tracks.perc.push({ step: measureStart + 4, pitch: 38, duration: 2, velocity: 1.0 });
            this.tracks.perc.push({ step: measureStart + 8, pitch: 35, duration: 2, velocity: 1.0 });
            this.tracks.perc.push({ step: measureStart + 12, pitch: 38, duration: 2, velocity: 1.0 });
          }
        }
        
        const tambStep = this.groove === 'driving' ? 2 : 4;
        for (let i=0; i<16; i+=tambStep) {
            this.tracks.perc.push({ step: measureStart + i, pitch: 54, duration: 0.5, velocity: 0.8 });
        }
      }
      
      // 2. Talharpa (Bass)
      if (!isIntro && !isOutro) {
        const bassNotes = this.generateBassLine(chordRoot, this.groove, isTransition);
        for (const note of bassNotes) {
          this.tracks.talharpa.push({
            step: measureStart + note.step,
            pitch: this.getMidiNoteFromDegree(note.degree - 7), // Octave down
            duration: note.duration,
            velocity: note.velocity
          });
        }
      }
      
      // 3. Viol & Organ (Pads)
      if (m % 2 === 0 || isOutro) {
        const padDuration = isOutro ? 64 : 31.5;
        if (!isOutro || m === 0) {
          this.tracks.viol.push({ step: measureStart, pitch: this.getMidiNoteFromDegree(chordRoot - 7), duration: padDuration, velocity: 0.4 });
          this.tracks.viol.push({ step: measureStart, pitch: this.getMidiNoteFromDegree(chordRoot), duration: padDuration, velocity: 0.35 });
          
          this.tracks.hurdyGurdy.push({ step: measureStart, pitch: this.getMidiNoteFromDegree(chordRoot), duration: padDuration, velocity: 0.3 });
          this.tracks.hurdyGurdy.push({ step: measureStart, pitch: this.getMidiNoteFromDegree(chordRoot + 2), duration: padDuration, velocity: 0.25 });
          this.tracks.hurdyGurdy.push({ step: measureStart, pitch: this.getMidiNoteFromDegree(chordRoot + 4), duration: padDuration, velocity: 0.25 });
        }
      }
      
      // 4. Melody & Solos
      if (isOutro) {
        if (m === 0) {
          this.tracks.lute.push({ step: measureStart, pitch: this.getMidiNoteFromDegree(chordRoot + 7), duration: 32, velocity: 1.0 });
          this.tracks.recorder.push({ step: measureStart, pitch: this.getMidiNoteFromDegree(chordRoot + 9), duration: 32, velocity: 0.9 });
        }
      } else if (section === 'SoloLute') {
        currentSoloDeg = this.generateSolo('lute', measureStart, chordRoot, currentSoloDeg);
        this.generatePad('recorder', measureStart, chordRoot);
        this.generatePad('shawm', measureStart, chordRoot);
      } else if (section === 'SoloRecorder') {
        currentSoloDeg = this.generateSolo('recorder', measureStart, chordRoot, currentSoloDeg);
        this.generatePad('lute', measureStart, chordRoot);
        this.generatePad('shawm', measureStart, chordRoot);
      } else if (section === 'SoloShawm') {
        currentSoloDeg = this.generateSolo('shawm', measureStart, chordRoot, currentSoloDeg);
        this.generatePad('lute', measureStart, chordRoot);
        this.generatePad('recorder', measureStart, chordRoot);
      } else if (section === 'DuetLuteRecorder') {
        currentSoloDeg = this.generateDuet('lute', 'recorder', measureStart, chordRoot, currentSoloDeg);
        this.generatePad('shawm', measureStart, chordRoot);
      } else if (section === 'DuetRecorderShawm') {
        currentSoloDeg = this.generateDuet('recorder', 'shawm', measureStart, chordRoot, currentSoloDeg);
        this.generatePad('lute', measureStart, chordRoot);
      } else {
        // Normal Melody (Intro, A, B)
        const motifMeasure = m % 4;
        const measureNotes = motif.filter(n => n.step >= motifMeasure * 16 && n.step < (motifMeasure + 1) * 16);
        
        for (const note of measureNotes) {
          const localStep = note.step % 16;
          this.tracks.lute.push({
            step: measureStart + localStep,
            pitch: this.getMidiNoteFromDegree(chordRoot + note.degree + 7),
            duration: note.duration,
            velocity: 1.0
          });
          this.tracks.recorder.push({
            step: measureStart + localStep,
            pitch: this.getMidiNoteFromDegree(chordRoot + note.degree + 9),
            duration: note.duration,
            velocity: 0.9
          });
        }
        
        if (!isIntro) {
          const counterSteps = [
            { step: 2, degree: 2 }, { step: 4, degree: 4 }, { step: 6, degree: 2 },
            { step: 10, degree: 4 }, { step: 12, degree: 0 }, { step: 14, degree: 2 }
          ];
          for (const c of counterSteps) {
            this.tracks.shawm.push({
              step: measureStart + c.step,
              pitch: this.getMidiNoteFromDegree(chordRoot + c.degree),
              duration: 1.5,
              velocity: 0.7
            });
          }
        }
      }
    }
  }

  private generateBassLine(chordRoot: number, groove: string, isTransition: boolean) {
    const notes = [];
    if (isTransition) {
      // Walking bass fill
      const walk = [0, 2, 4, 5, 4, 2, 0, -1]; // degrees relative to root
      for (let i = 0; i < 8; i++) {
        notes.push({ step: i * 2, degree: chordRoot + walk[i % walk.length], duration: 1.5, velocity: 1.0 });
      }
    } else {
      if (groove === 'driving') {
        // 8th notes, alternating root and fifth/octave
        for (let i = 0; i < 8; i++) {
          let deg = chordRoot;
          if (i % 4 === 2) deg = chordRoot + 4; // Fifth
          else if (i % 4 === 3) deg = chordRoot + 7; // Octave
          else if (i % 2 === 1) deg = chordRoot; // Root offbeat
          notes.push({ step: i * 2, degree: deg, duration: 1.0, velocity: i % 2 === 0 ? 0.9 : 0.7 });
        }
      } else if (groove === 'syncopated') {
        // Funky syncopation
        notes.push({ step: 0, degree: chordRoot, duration: 1.5, velocity: 0.9 });
        notes.push({ step: 3, degree: chordRoot + 4, duration: 1.0, velocity: 0.8 });
        notes.push({ step: 6, degree: chordRoot + 7, duration: 1.0, velocity: 0.9 });
        notes.push({ step: 9, degree: chordRoot, duration: 1.5, velocity: 0.8 });
        notes.push({ step: 12, degree: chordRoot + 4, duration: 1.0, velocity: 0.9 });
        notes.push({ step: 14, degree: chordRoot + 2, duration: 1.0, velocity: 0.8 });
      } else if (groove === 'march') {
        // Root - Fifth quarter notes
        notes.push({ step: 0, degree: chordRoot, duration: 2.0, velocity: 1.0 });
        notes.push({ step: 4, degree: chordRoot + 4, duration: 2.0, velocity: 0.9 });
        notes.push({ step: 8, degree: chordRoot, duration: 2.0, velocity: 1.0 });
        notes.push({ step: 12, degree: chordRoot - 3, duration: 2.0, velocity: 0.9 }); // lower fifth
      } else {
        // straight
        notes.push({ step: 0, degree: chordRoot, duration: 2.0, velocity: 0.9 });
        notes.push({ step: 4, degree: chordRoot + 4, duration: 1.5, velocity: 0.8 });
        notes.push({ step: 7, degree: chordRoot + 7, duration: 1.0, velocity: 0.8 });
        notes.push({ step: 8, degree: chordRoot, duration: 2.0, velocity: 0.9 });
        notes.push({ step: 12, degree: chordRoot + 4, duration: 1.5, velocity: 0.8 });
        notes.push({ step: 15, degree: chordRoot + 2, duration: 1.0, velocity: 0.7 });
      }
    }
    return notes;
  }

  private generateSolo(instrument: Instrument, measureStart: number, chordRoot: number, currentDeg: number): number {
    let s = 0;
    while (s < 16) {
      // Mix of 16th, 8th, and quarter notes for more lyrical solos
      const lengths = [1, 1, 2, 2, 2, 4];
      const len = lengths[Math.floor(Math.random() * lengths.length)];
      
      if (s + len > 16) {
        s++;
        continue;
      }
      
      if (Math.random() > 0.15) { // 85% chance to play
        currentDeg += (Math.floor(Math.random() * 5) - 2); // Move -2 to +2 steps
        // Keep within a reasonable range
        if (currentDeg < chordRoot - 4) currentDeg += 4;
        if (currentDeg > chordRoot + 7) currentDeg -= 4;
        
        this.tracks[instrument].push({
          step: measureStart + s,
          pitch: this.getMidiNoteFromDegree(currentDeg + 7), // Octave up for solo
          duration: len * 0.9, // Slightly legato
          velocity: 1.0
        });
      }
      s += len;
    }
    return currentDeg;
  }

  private generateDuet(inst1: Instrument, inst2: Instrument, measureStart: number, chordRoot: number, currentDeg: number): number {
    let s = 0;
    while (s < 16) {
      const lengths = [2, 2, 4, 4, 8];
      const len = lengths[Math.floor(Math.random() * lengths.length)];
      
      if (s + len > 16) {
        s++;
        continue;
      }
      
      if (Math.random() > 0.1) { // 90% chance to play
        currentDeg += (Math.floor(Math.random() * 5) - 2); // Move -2 to +2 steps
        if (currentDeg < chordRoot - 4) currentDeg += 4;
        if (currentDeg > chordRoot + 7) currentDeg -= 4;
        
        // Lead instrument
        this.tracks[inst1].push({
          step: measureStart + s,
          pitch: this.getMidiNoteFromDegree(currentDeg + 7), // Octave up
          duration: len * 0.9,
          velocity: 1.0
        });
        
        // Harmony instrument (consistently a third or sixth offset)
        const harmonyOffset = Math.random() > 0.5 ? 2 : -2;
        this.tracks[inst2].push({
          step: measureStart + s,
          pitch: this.getMidiNoteFromDegree(currentDeg + 7 + harmonyOffset),
          duration: len * 0.9,
          velocity: 0.9
        });
      }
      s += len;
    }
    return currentDeg;
  }

  private generatePad(instrument: Instrument, measureStart: number, chordRoot: number) {
    this.tracks[instrument].push({
      step: measureStart,
      pitch: this.getMidiNoteFromDegree(chordRoot), // Root
      duration: 15.5,
      velocity: 0.7
    });
    this.tracks[instrument].push({
      step: measureStart,
      pitch: this.getMidiNoteFromDegree(chordRoot + 4), // Fifth
      duration: 15.5,
      velocity: 0.6
    });
  }

  private getMidiNoteFromDegree(degree: number): number {
    const normalizedDegree = degree >= 0 ? degree : (degree % 7 + 7) % 7;
    const octave = Math.floor(degree / 7);
    const semitones = octave * 12 + this.mode[normalizedDegree];
    return this.baseNote + semitones; // Dynamic base note
  }

  start() {
    this.init();
    if (this.synth && this.synth.audioContext && this.synth.audioContext.state === 'suspended') {
      this.synth.audioContext.resume();
    }
    
    if (this.isPlaying) {
      if (this.synth && this.nextNoteTime < this.synth.audioContext.currentTime) {
        this.nextNoteTime = this.synth.audioContext.currentTime + 0.05;
      }
      return;
    }
    
    this.generateSong();
    this.isPlaying = true;
    this.nextNoteTime = this.synth?.audioContext?.currentTime || 0;
    this.scheduler();
  }

  stop() {
    this.isPlaying = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.synth) {
      for (let i = 0; i < 16; i++) {
        this.synth.send([0xB0 + i, 120, 0]); // All sound off
      }
    }
  }

  resume() {
    if (this.synth && this.synth.audioContext && this.synth.audioContext.state === 'suspended') {
      this.synth.audioContext.resume();
    }
  }

  private scheduler() {
    if (!this.isPlaying || !this.synth || !this.synth.audioContext) return;

    if (this.nextNoteTime < this.synth.audioContext.currentTime) {
      this.nextNoteTime = this.synth.audioContext.currentTime + 0.05;
    }

    let count = 0;
    while (this.nextNoteTime < this.synth.audioContext.currentTime + this.lookAhead && count < 32) {
      try {
        this.playGlobalStep(this.currentGlobalStep, this.nextNoteTime);
      } catch (e) {
        console.error("MusicEngine playback error:", e);
      }
      
      this.currentGlobalStep++;
      if (this.currentGlobalStep >= this.totalSteps) {
        this.currentGlobalStep = 0;
        this.generateSong(); // Loop with new song
      }
      
      this.nextNoteTime += this.stepDuration;
      count++;
    }
    this.timer = setTimeout(() => this.scheduler(), this.scheduleInterval);
  }

  private playGlobalStep(step: number, time: number) {
    const channels: Record<Instrument, number> = {
      lute: 0, recorder: 1, viol: 2, shawm: 3, hurdyGurdy: 4, talharpa: 5, perc: 9
    };
    
    for (const [inst, track] of Object.entries(this.tracks)) {
      const channel = channels[inst as Instrument];
      const notes = track.filter(n => n.step === step);
      for (const note of notes) {
        this.playMidiNote(channel, note.pitch, note.velocity, note.duration * this.stepDuration, time);
      }
    }
  }

  private playMidiNote(channel: number, note: number, volume: number, duration: number, startTime: number) {
    if (!this.synth) return;
    
    // Ensure values are finite and within valid MIDI ranges
    if (!Number.isFinite(note) || !Number.isFinite(volume) || !Number.isFinite(duration) || !Number.isFinite(startTime)) return;
    
    const safeNote = Math.max(0, Math.min(127, Math.floor(note)));
    const velocity = Math.max(0, Math.min(127, Math.floor(volume * 127)));
    
    this.synth.send([0x90 + channel, safeNote, velocity], startTime);
    this.synth.send([0x80 + channel, safeNote, 0], startTime + Math.max(0, duration));
  }

  setVolume(vol: number) {
    if (this.synth) {
      this.synth.setMasterVol(vol * 0.5);
    }
  }
}

export const musicEngine = new MusicEngine();
;
