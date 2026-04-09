/**
 * SID-inspired Music Engine for rich, low-fi "metal" sounds.
 * Simulates pulse-width modulation, distortion, and fast arpeggios.
 */

type SectionType = 'Intro' | 'A' | 'B' | 'C' | 'Outro';
type Soloist = 'none' | 'guitar' | 'bass' | 'drums';
type RhythmStyle = 'rock' | 'dubstep' | 'techno' | 'house' | 'trap' | 'riddim';

class MusicEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private cabinetFilter: BiquadFilterNode | null = null;
  private isPlaying: boolean = false;
  private currentStep: number = 0;
  private timer: NodeJS.Timeout | null = null;
  
  // Song State
  private tempo: number = 135;
  private rootFreq: number = 130.81; 
  private songStructure: SectionType[] = [];
  private currentSectionIndex: number = 0;
  private stepsPerSection: number = 64;
  private passCount: number = 0;
  private currentSoloist: Soloist = 'none';
  private style: RhythmStyle = 'rock';
  private lastRootFreq: number = 0;
  private lastStyle: RhythmStyle | null = null;

  // Note Blending State
  private guitarNoteEnd: number = 0;
  private bassNoteEnd: number = 0;
  private synthNoteEnd: number = 0;
  private lastGuitarFreq: number = 0;
  private lastBassFreq: number = 0;
  private lastSynthFreq: number = 0;

  // SID-style "Metal" Lead Synth with Overdrive and Cabinet Sim
  private createLeadVoice(freq: number, duration: number, volume: number, overdrive: number = 1.0) {
    if (!this.ctx || !this.masterGain || !this.reverbNode || !this.cabinetFilter) return;

    const now = this.ctx.currentTime;
    
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const preGain = this.ctx.createGain();
    const distortion = this.ctx.createWaveShaper();
    const filter = this.ctx.createBiquadFilter();
    const postGain = this.ctx.createGain();

    const makeDistortionCurve = (amount: number) => {
      const n_samples = 44100;
      const curve = new Float32Array(n_samples);
      for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1;
        curve[i] = (Math.tanh(x * amount) + (x * 0.1)) / 1.1;
      }
      return curve;
    };

    distortion.curve = makeDistortionCurve(25 * overdrive);
    distortion.oversample = '4x';

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    
    const flutter = Math.sin(now * 10) * 2;
    osc1.frequency.setValueAtTime(freq + flutter, now);
    osc2.frequency.setValueAtTime(freq * 1.008 + flutter, now); 

    preGain.gain.setValueAtTime(4.0 * overdrive, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4000, now);
    filter.Q.setValueAtTime(15, now);
    filter.frequency.exponentialRampToValueAtTime(800, now + duration);

    // Reduced volume by another 15% (Total ~42% of original)
    const adjustedVolume = volume * 0.4165;
    
    // Dynamic Overdrive: Longer notes get more "dirt"
    const lengthFactor = Math.min(duration / 2.0, 1.0); // Max out at 2 seconds
    const dynamicOverdrive = overdrive * (1.0 + lengthFactor * 1.5);

    // Randomized Attack Rate: 0.02s to 0.1s
    const attackTime = 0.02 + Math.random() * 0.08;
    
    // Randomized Sustain Level: 0.2 to 0.6
    const sustainLevel = 0.2 + Math.random() * 0.4;

    distortion.curve = makeDistortionCurve(25 * dynamicOverdrive);
    distortion.oversample = '4x';

    postGain.gain.setValueAtTime(0, now);
    postGain.gain.linearRampToValueAtTime(adjustedVolume, now + attackTime);
    postGain.gain.linearRampToValueAtTime(adjustedVolume * sustainLevel, now + duration * 0.8);
    postGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    osc1.connect(preGain);
    osc2.connect(preGain);
    preGain.connect(distortion);
    distortion.connect(filter);
    filter.connect(postGain);
    
    // Vibrato and Tremolo for longer notes
    if (duration > 0.3) {
      // Vibrato (Frequency Modulation) - Scales with length
      const vibrato = this.ctx.createOscillator();
      const vibratoGain = this.ctx.createGain();
      
      // Randomize vibrato speed and depth
      const vSpeed = 4 + Math.random() * 4;
      // Vibrato depth increases with note length
      const vDepth = (0.005 + Math.random() * 0.015) * (1.0 + lengthFactor * 2.5);
      
      vibrato.frequency.setValueAtTime(vSpeed, now);
      vibratoGain.gain.setValueAtTime(freq * vDepth, now);
      
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc1.frequency);
      vibratoGain.connect(osc2.frequency);
      vibrato.start(now);
      vibrato.stop(now + duration);

      // Random Pitch Bend for "expressional" feel - Intensity increases with length
      if (Math.random() > 0.5) {
        const bendTime = duration * (0.2 + Math.random() * 0.5);
        // Reduced pitch bend by 80% (multiplied by 0.2)
        const bendIntensity = (0.01 + Math.random() * 0.02) * (1.0 + lengthFactor * 3.0) * 0.2;
        const bendAmount = 1 + (Math.random() > 0.5 ? bendIntensity : -bendIntensity);
        
        osc1.frequency.exponentialRampToValueAtTime(freq * bendAmount, now + bendTime);
        osc2.frequency.exponentialRampToValueAtTime(freq * 1.008 * bendAmount, now + bendTime);
        // Return to pitch
        osc1.frequency.exponentialRampToValueAtTime(freq, now + duration);
        osc2.frequency.exponentialRampToValueAtTime(freq * 1.008, now + duration);
      }

      // Tremolo (Amplitude Modulation)
      const tremolo = this.ctx.createGain();
      const tremoloOsc = this.ctx.createOscillator();
      const tremoloDepth = this.ctx.createGain();
      
      tremoloOsc.frequency.setValueAtTime(6, now);
      tremoloDepth.gain.setValueAtTime(0.2, now); // Slightly deeper tremolo
      tremolo.gain.setValueAtTime(0.8, now);
      
      tremoloOsc.connect(tremoloDepth);
      tremoloDepth.connect(tremolo.gain);
      
      postGain.connect(tremolo);
      tremolo.connect(this.cabinetFilter);
      
      tremoloOsc.start(now);
      tremoloOsc.stop(now + duration);
    } else {
      postGain.connect(this.cabinetFilter);
    }

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
  }

  private createPercussion(type: 'kick' | 'snare' | 'hihat' | 'tympani' | 'woodblock', volume: number) {
    if (!this.ctx || !this.masterGain || !this.reverbNode) return;
    const now = this.ctx.currentTime;
    
    // Increased drum volume by 25%
    const adjVolume = volume * 1.25;

    if (type === 'kick') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      // Techno/House kicks are punchier
      const isElectronic = this.style === 'techno' || this.style === 'house';
      osc.frequency.setValueAtTime(isElectronic ? 180 : 150, now);
      osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.12);
      gain.gain.setValueAtTime(adjVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'snare') {
      const noise = this.ctx.createBufferSource();
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.15, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(this.style === 'trap' ? 1500 : 800, now);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(adjVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      gain.connect(this.reverbNode);
      noise.start(now);
      noise.stop(now + 0.15);
    } else if (type === 'tympani') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
      gain.gain.setValueAtTime(adjVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.connect(gain);
      gain.connect(this.masterGain);
      gain.connect(this.reverbNode);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'woodblock') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1200, now);
      gain.gain.setValueAtTime(adjVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.05);
    } else {
      const noise = this.ctx.createBufferSource();
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(8000, now);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(adjVolume * 0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.05);
    }
  }

  private createBassVoice(freq: number, duration: number, volume: number, isSolo: boolean = false) {
    if (!this.ctx || !this.masterGain || !this.reverbNode) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const distortion = this.ctx.createWaveShaper();

    const makeDistortionCurve = (amount: number) => {
      const n_samples = 44100;
      const curve = new Float32Array(n_samples);
      for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1;
        curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
      }
      return curve;
    };
    
    // Dubstep/Riddim get much dirtier bass
    const isWobble = this.style === 'dubstep' || this.style === 'riddim';
    distortion.curve = makeDistortionCurve(isWobble ? 100 : (isSolo ? 50 : 15));

    osc.type = isSolo || isWobble ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(freq, now);
    
    filter.type = 'lowpass';
    
    if (isWobble) {
      // Wobble effect: LFO-like filter sweep
      const wobbleSpeed = this.style === 'riddim' ? 4 : 8;
      const t = (this.currentStep % wobbleSpeed) / wobbleSpeed;
      const sweepFreq = 200 + Math.sin(t * Math.PI) * 1800;
      filter.frequency.setValueAtTime(sweepFreq, now);
      filter.frequency.exponentialRampToValueAtTime(100, now + duration);
    } else {
      filter.frequency.setValueAtTime(isSolo ? 2500 : 1200, now);
      filter.frequency.exponentialRampToValueAtTime(isSolo ? 500 : 100, now + duration);
    }

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    osc.connect(distortion);
    distortion.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    gain.connect(this.reverbNode);

    osc.start(now);
    osc.stop(now + duration);
  }

  private createSynthVoice(freq: number, duration: number, volume: number) {
    if (!this.ctx || !this.masterGain || !this.reverbNode) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const distortion = this.ctx.createWaveShaper();

    const makeDistortionCurve = (amount: number) => {
      const n_samples = 44100;
      const curve = new Float32Array(n_samples);
      for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1;
        curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
      }
      return curve;
    };
    distortion.curve = makeDistortionCurve(5);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    
    // Expressional Pitch Bend
    if (Math.random() > 0.4) {
      const bendAmount = 0.98 + (Math.random() * 0.04);
      osc.frequency.exponentialRampToValueAtTime(freq * bendAmount, now + duration * 0.4);
      osc.frequency.exponentialRampToValueAtTime(freq, now + duration * 0.8);
    }
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1500, now);
    filter.Q.setValueAtTime(1, now);

    // Sustain logic
    const sustainLevel = duration > 1.0 ? 0.7 : 0.3;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + duration * 0.2); 
    gain.gain.linearRampToValueAtTime(volume * sustainLevel, now + duration * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    osc.connect(distortion);
    distortion.connect(filter);
    filter.connect(gain);
    
    // Vibrato and Tremolo for longer synth notes
    if (duration > 0.8) {
      // Random Vibrato
      const vibrato = this.ctx.createOscillator();
      const vibratoGain = this.ctx.createGain();
      vibrato.frequency.setValueAtTime(3 + Math.random() * 2, now);
      vibratoGain.gain.setValueAtTime(freq * 0.005, now);
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);
      vibrato.start(now);
      vibrato.stop(now + duration);

      const tremolo = this.ctx.createGain();
      const tremoloOsc = this.ctx.createOscillator();
      const tremoloDepth = this.ctx.createGain();
      
      tremoloOsc.frequency.setValueAtTime(4, now);
      tremoloDepth.gain.setValueAtTime(0.1, now);
      tremolo.gain.setValueAtTime(0.9, now);
      
      tremoloOsc.connect(tremoloDepth);
      tremoloDepth.connect(tremolo.gain);
      
      gain.connect(tremolo);
      tremolo.connect(this.masterGain);
      tremolo.connect(this.reverbNode);
      
      tremoloOsc.start(now);
      tremoloOsc.stop(now + duration);
    } else {
      gain.connect(this.masterGain);
      gain.connect(this.reverbNode);
    }

    osc.start(now);
    osc.stop(now + duration);
  }

  private createReverb() {
    if (!this.ctx) return;
    const length = this.ctx.sampleRate * 5.0; // 5.0s "Gothic Cathedral" reverb
    const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
    }
    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = impulse;
    
    const reverbGain = this.ctx.createGain();
    reverbGain.gain.value = 0.9; // Mostly wet reverb for cathedral feel
    
    this.reverbNode.connect(reverbGain);
    reverbGain.connect(this.masterGain!);
  }

  private createCabinetSim() {
    if (!this.ctx) return;
    this.cabinetFilter = this.ctx.createBiquadFilter();
    this.cabinetFilter.type = 'peaking';
    this.cabinetFilter.frequency.value = 2500;
    this.cabinetFilter.Q.value = 1.5;
    this.cabinetFilter.gain.value = 6;

    const lowPass = this.ctx.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 5000;

    this.cabinetFilter.connect(lowPass);
    lowPass.connect(this.masterGain!);
    lowPass.connect(this.reverbNode!);
  }

  private init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.12; 
      this.masterGain.connect(this.ctx.destination);
      this.createReverb();
      this.createCabinetSim();
    } catch (e) {
      console.warn("Music Engine: Web Audio not supported", e);
    }
  }

  private generateSong() {
    const keys = [130.81, 138.59, 146.83, 155.56, 164.81, 174.61, 185.00, 196.00, 207.65, 220.00, 233.08, 246.94];
    
    // Ensure a different key and style each time
    let newFreq = keys[Math.floor(Math.random() * keys.length)];
    while (newFreq === this.lastRootFreq && keys.length > 1) {
      newFreq = keys[Math.floor(Math.random() * keys.length)];
    }
    this.rootFreq = newFreq;
    this.lastRootFreq = newFreq;
    
    const styles: RhythmStyle[] = ['rock', 'dubstep', 'techno', 'house', 'trap', 'riddim'];
    let newStyle = styles[Math.floor(Math.random() * styles.length)];
    while (newStyle === this.lastStyle && styles.length > 1) {
      newStyle = styles[Math.floor(Math.random() * styles.length)];
    }
    this.style = newStyle;
    this.lastStyle = newStyle;

    // Style-based BPM
    if (this.style === 'house' || this.style === 'techno') {
      this.tempo = 120 + Math.floor(Math.random() * 15);
    } else if (this.style === 'trap' || this.style === 'dubstep' || this.style === 'riddim') {
      this.tempo = 140 + Math.floor(Math.random() * 20);
    } else {
      this.tempo = 110 + Math.floor(Math.random() * 40);
    }

    const targetSections = 8 + Math.floor(Math.random() * 4);
    const sections: SectionType[] = ['Intro'];
    for (let i = 0; i < targetSections; i++) {
      const pool: SectionType[] = ['A', 'B', 'C'];
      sections.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    sections.push('Outro');

    this.songStructure = sections;
    this.currentSectionIndex = 0;
    this.currentStep = 0;
    this.passCount = 0;
    this.currentSoloist = 'none';

    // Reset blending state
    this.guitarNoteEnd = 0;
    this.bassNoteEnd = 0;
    this.synthNoteEnd = 0;
    this.lastGuitarFreq = 0;
    this.lastBassFreq = 0;
    this.lastSynthFreq = 0;
  }

  start() {
    this.init();
    if (this.isPlaying) return;
    this.generateSong();
    this.isPlaying = true;
    this.playStep();
  }

  stop() {
    this.isPlaying = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private playStep() {
    if (!this.isPlaying || !this.ctx) return;

    const section = this.songStructure[this.currentSectionIndex];
    const stepDuration = (60 / this.tempo) / 4; 

    const progressions: Record<SectionType, number[]> = {
      'Intro': [1, 1, 1, 1],
      'A': [1, 1, 1.2, 0.9], 
      'B': [1, 1.33, 1.5, 1.2], 
      'C': [0.8, 0.9, 1, 1],
      'Outro': [1, 1, 0.8, 0.5]
    };

    const currentProg = progressions[section];
    const progIndex = Math.floor(this.currentStep / 16) % currentProg.length;
    const sectionRoot = this.rootFreq * currentProg[progIndex];
    const stepsUntilChange = 16 - (this.currentStep % 16);

    // 1. Percussion Patterns
    const isHalfTime = this.style === 'dubstep' || this.style === 'trap' || this.style === 'riddim';
    const isFourOnFloor = this.style === 'techno' || this.style === 'house';
    
    if (section !== 'Outro' || this.currentStep < 16) {
      // Kick
      if (isFourOnFloor) {
        if (this.currentStep % 4 === 0) this.createPercussion('kick', 0.7);
      } else if (isHalfTime) {
        if (this.currentStep % 16 === 0 || this.currentStep % 16 === 10) this.createPercussion('kick', 0.8);
      } else {
        // Rock
        if (this.currentStep % 8 === 0 || this.currentStep % 8 === 6) this.createPercussion('kick', 0.6);
      }

      // Snare
      if (isHalfTime) {
        if (this.currentStep % 16 === 8) this.createPercussion('snare', 0.6);
      } else {
        if (this.currentStep % 8 === 4) this.createPercussion('snare', 0.5);
      }

      // Hi-hat
      if (this.style === 'trap') {
        // Fast trap hats
        if (this.currentStep % 2 === 0 || (this.currentStep % 16 > 12)) this.createPercussion('hihat', 0.2);
      } else if (isFourOnFloor) {
        // Off-beat house hats
        if (this.currentStep % 4 === 2) this.createPercussion('hihat', 0.3);
      } else {
        if (this.currentStep % 2 === 1) this.createPercussion('hihat', 0.2);
      }
      
      // Variety
      if (this.currentSoloist === 'drums' || section === 'C') {
        if (this.currentStep % 16 === 8) this.createPercussion('tympani', 0.5);
        if (this.currentStep % 8 === 2) this.createPercussion('woodblock', 0.3);
      }
    }

    // 2. Bassline with blending
    const isBassSolo = this.currentSoloist === 'bass';
    if (section !== 'Outro' || this.currentStep < 32) {
      const bassInterval = isHalfTime ? 8 : 4;
      if (this.currentStep % bassInterval === 0) {
        const freq = sectionRoot / 2;
        // Blend if same freq and previous note is still "active"
        if (freq !== this.lastBassFreq || this.currentStep >= this.bassNoteEnd) {
          const bassDurationSteps = isBassSolo ? (1 + Math.floor(Math.random() * 3)) : stepsUntilChange;
          const bassDuration = stepDuration * bassDurationSteps;
          this.createBassVoice(freq, bassDuration, isBassSolo ? 0.6 : 0.4, isBassSolo);
          this.lastBassFreq = freq;
          this.bassNoteEnd = this.currentStep + bassDurationSteps;
        }
      }
    }

    // 3. Lead / Guitar Solo with blending
    const isGuitarSolo = this.currentSoloist === 'guitar';
    if (section !== 'Intro' && (section !== 'Outro' || this.currentStep < 32)) {
      if (isGuitarSolo) {
        if (this.currentStep % 2 === 0 || Math.random() > 0.6) {
          const soloScale = [1, 1.2, 1.33, 1.5, 1.8, 2];
          const freq = sectionRoot * 2 * soloScale[Math.floor(Math.random() * soloScale.length)];
          // Solos don't blend as much to keep them "shreddy"
          const leadDuration = stepDuration * (1 + Math.floor(Math.random() * 4));
          this.createLeadVoice(freq, leadDuration, 0.4, 1.8);
          this.lastGuitarFreq = freq;
          this.guitarNoteEnd = this.currentStep + (1 + Math.floor(Math.random() * 4));
        }
      } else {
        if (this.currentStep % 8 === 0 || (section === 'B' && this.currentStep % 4 === 0)) {
          const freq = sectionRoot * 2;
          if (freq !== this.lastGuitarFreq || this.currentStep >= this.guitarNoteEnd) {
            // Anticipate next note: check if the next 16-step block has the same root
            let leadDurationSteps = stepsUntilChange;
            const nextProgIndex = (progIndex + 1) % currentProg.length;
            if (currentProg[progIndex] === currentProg[nextProgIndex]) {
              leadDurationSteps += 16; // Combine with next block
            }
            
            const leadDuration = stepDuration * leadDurationSteps;
            this.createLeadVoice(freq, leadDuration, 0.3, 1.2);
            this.lastGuitarFreq = freq;
            this.guitarNoteEnd = this.currentStep + leadDurationSteps;
          }
        }
      }
    }

    // 4. Synth Quartet with blending
    if (this.currentStep % 16 === 0) {
      const freq1 = sectionRoot * 2;
      const freq2 = sectionRoot * 2 * 1.2;
      if (freq1 !== this.lastSynthFreq || this.currentStep >= this.synthNoteEnd) {
        // Increased synth volume by 75% (0.15 * 1.75 = 0.2625, 0.12 * 1.75 = 0.21)
        this.createSynthVoice(freq1, stepDuration * 16, 0.26);
        this.createSynthVoice(freq2, stepDuration * 16, 0.21);
        this.lastSynthFreq = freq1;
        this.synthNoteEnd = this.currentStep + 16;
      }
    }

    // Advance Logic
    this.currentStep++;
    if (this.currentStep >= this.stepsPerSection) {
      this.currentStep = 0;
      this.currentSectionIndex++;
      
      if (this.currentSectionIndex >= this.songStructure.length) {
        this.generateSong(); 
      } else {
        if (this.currentSectionIndex % 2 === 0) {
          const soloists: Soloist[] = ['none', 'guitar', 'bass', 'drums'];
          this.currentSoloist = soloists[Math.floor(Math.random() * soloists.length)];
        }
      }
    }

    this.timer = setTimeout(() => this.playStep(), stepDuration * 1000);
  }

  toggle() {
    if (this.isPlaying) this.stop();
    else this.start();
    return this.isPlaying;
  }

  setVolume(vol: number) {
    if (this.masterGain) {
      this.masterGain.gain.value = vol * 0.24;
    }
  }
}

export const musicEngine = new MusicEngine();
