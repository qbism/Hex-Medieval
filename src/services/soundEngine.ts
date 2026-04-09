import { UnitType } from '../types';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled: boolean = true;

  constructor() {
    // Context is initialized on first user interaction to comply with browser policies
  }

  private init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3; // Low default volume
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number = 1, slideTo?: number) {
    this.init();
    if (!this.ctx || !this.masterGain || !this.enabled) return;

    // Random detune (±5%)
    const detune = 1 + (Math.random() * 0.1 - 0.05);
    const actualFreq = freq * detune;
    const actualSlideTo = slideTo ? slideTo * detune : undefined;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(actualFreq, this.ctx.currentTime);
    if (actualSlideTo) {
      osc.frequency.exponentialRampToValueAtTime(actualSlideTo, this.ctx.currentTime + duration);
    }

    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private playNoise(duration: number, volume: number = 1, filterFreq: number = 1000, slideTo?: number) {
    this.init();
    if (!this.ctx || !this.masterGain || !this.enabled) return;

    // Random detune (±5%)
    const detune = 1 + (Math.random() * 0.1 - 0.05);
    const actualFilterFreq = filterFreq * detune;
    const actualSlideTo = slideTo ? slideTo * detune : undefined;

    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(actualFilterFreq, this.ctx.currentTime);
    if (actualSlideTo) {
      filter.frequency.exponentialRampToValueAtTime(actualSlideTo, this.ctx.currentTime + duration);
    } else {
      filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + duration);
    }

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
  }

  playClick() {
    this.playTone(800, 'sine', 0.05, 0.5);
  }

  playMove(unitType?: UnitType) {
    switch (unitType) {
      case UnitType.KNIGHT:
        // Gallop sound (clop clop)
        this.playTone(350, 'triangle', 0.05, 0.4, 300);
        setTimeout(() => this.playTone(300, 'triangle', 0.05, 0.3, 250), 80);
        break;
      case UnitType.ARCHER:
        // Light footsteps
        this.playTone(400, 'sine', 0.1, 0.3, 500);
        break;
      case UnitType.CATAPULT:
        // Heavy mechanical creak
        this.playTone(100, 'sawtooth', 0.4, 0.3, 150);
        this.playNoise(0.4, 0.2, 300);
        break;
      case UnitType.INFANTRY:
      default:
        // Standard march
        this.playTone(200, 'triangle', 0.2, 0.4, 300);
        break;
    }
  }

  playAttack(unitType?: UnitType) {
    switch (unitType) {
      case UnitType.ARCHER:
        // Twang of a bow: Short low-to-high slide + high-freq noise
        this.playTone(150, 'triangle', 0.1, 0.5, 300);
        this.playNoise(0.05, 0.3, 4000, 2000);
        break;
      case UnitType.CATAPULT:
        // Thwack of timber: Low thud with wooden resonance
        this.playNoise(0.2, 0.8, 600, 100);
        this.playTone(80, 'sawtooth', 0.15, 0.6, 40);
        break;
      case UnitType.KNIGHT: {
        // Whinny of a horse + metallic clash
        this.playTone(400, 'sine', 0.4, 0.3, 600);
        setTimeout(() => {
          this.playTone(550, 'sine', 0.3, 0.2, 450);
          // Metallic clash
          this.playTone(1000, 'square', 0.05, 0.3, 800);
          this.playNoise(0.1, 0.4, 4000, 1000);
        }, 100);
        break;
      }
      case UnitType.INFANTRY:
      default:
        // Clang of swords: High-pitched metallic square wave
        this.playTone(1200, 'square', 0.05, 0.4, 800);
        this.playTone(1500, 'sine', 0.1, 0.3, 1000);
        this.playNoise(0.1, 0.5, 5000, 1000);
        break;
    }
  }

  playRecruit(unitType?: UnitType) {
    switch (unitType) {
      case UnitType.KNIGHT:
        // High-pitched whinny
        this.playTone(400, 'sine', 0.4, 0.4, 600);
        setTimeout(() => this.playTone(550, 'sine', 0.3, 0.3, 450), 100);
        break;
      case UnitType.ARCHER:
        // Light chime + bow string tension
        this.playTone(600, 'sine', 0.1, 0.4, 800);
        this.playTone(150, 'triangle', 0.2, 0.3, 200);
        break;
      case UnitType.CATAPULT:
        // Heavy mechanical assembly
        this.playTone(80, 'sawtooth', 0.5, 0.4, 120);
        this.playNoise(0.5, 0.2, 400);
        break;
      case UnitType.INFANTRY:
      default:
        // Sharp march start / "Attention!"
        this.playTone(300, 'square', 0.1, 0.5, 300);
        setTimeout(() => this.playTone(400, 'square', 0.1, 0.4, 400), 100);
        break;
    }
  }

  playDefeat(unitType?: UnitType) {
    switch (unitType) {
      case UnitType.KNIGHT:
        // Horse fall: Low sliding triangle + noise
        this.playTone(150, 'triangle', 0.5, 0.4, 50);
        this.playNoise(0.5, 0.3, 200);
        break;
      case UnitType.ARCHER:
        // "Argh!": Medium noise + descending slide
        this.playTone(300, 'sine', 0.3, 0.4, 100);
        this.playNoise(0.3, 0.3, 800, 200);
        break;
      case UnitType.CATAPULT:
        // Wood splintering: High noise bursts + low sawtooth
        this.playNoise(0.1, 0.6, 2000, 500);
        setTimeout(() => this.playNoise(0.1, 0.5, 1500, 400), 100);
        this.playTone(60, 'sawtooth', 0.4, 0.4, 30);
        break;
      case UnitType.INFANTRY:
      default:
        // "Ugh!": Low noise thud + descending tone
        this.playTone(200, 'triangle', 0.3, 0.5, 80);
        this.playNoise(0.3, 0.4, 400, 100);
        break;
    }
  }

  playUpgrade() {
    this.playTone(200, 'square', 0.5, 0.4, 800);
    setTimeout(() => this.playTone(400, 'square', 0.4, 0.3, 1200), 150);
  }

  playHeal() {
    this.playTone(600, 'sine', 0.6, 0.4, 1200);
  }

  playConquest() {
    // Triumphant 3-note fanfare
    this.playTone(440, 'square', 0.15, 0.5, 440);
    setTimeout(() => this.playTone(554.37, 'square', 0.15, 0.5, 554.37), 150);
    setTimeout(() => this.playTone(659.25, 'square', 0.4, 0.6, 680), 300);
  }

  playGoldMine() {
    // "Cha-ching": High-pitched metallic ring + coin jingle
    // Added "reverb" echoes to simulate being in a mine
    const playCoin = (vol: number, delay: number) => {
      setTimeout(() => {
        this.playTone(1500, 'sine', 0.1, vol, 1600);
        this.playTone(1200, 'sine', 0.05, vol * 0.6);
        this.playNoise(0.1, vol * 0.5, 8000, 4000);
      }, delay);
    };

    playCoin(0.6, 0);      // Initial sound
    playCoin(0.3, 150);    // First echo
    playCoin(0.15, 300);   // Second echo
    playCoin(0.05, 500);   // Faint third echo
  }

  playDamage() {
    this.playNoise(0.15, 0.6, 500);
  }

  playVictory() {
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((note, i) => {
      setTimeout(() => this.playTone(note, 'sine', 0.8, 0.5, note * 1.05), i * 200);
    });
  }

  playTurnFanfare() {
    // Short 2-note fanfare (G4 -> C5)
    this.playTone(392.00, 'square', 0.2, 0.5, 400);
    setTimeout(() => this.playTone(523.25, 'square', 0.4, 0.6, 530), 150);
  }
}

export const soundEngine = new SoundEngine();
