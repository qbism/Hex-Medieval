import { UnitType } from '../types';
import WebAudioTinySynth from 'webaudio-tinysynth';

class SoundEngine {
  private synth: any = null;
  private enabled: boolean = true;
  private globalVolume: number = 0.6;

  constructor() {
    // Context is initialized on first user interaction down the line
  }

  private init() {
    if (this.synth) return;
    try {
      this.synth = new WebAudioTinySynth({ quality: 1, useReverb: 1 });
      
      // Setup Channels
      // Channel 11: SFX Instruments
      this.synth.send([0xCB, 127]); // Program 127: Gunshot
      
      // Channel 12: Bell / Gold
      this.synth.send([0xCC, 9]);   // Program 9: Glockenspiel
      
      // Channel 13: Fanfare / Brass
      this.synth.send([0xCD, 61]);  // Program 61: Brass Section
      
    } catch (e) {
      console.warn("Web Audio Synth not supported", e);
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  setVolume(vol: number) {
    this.globalVolume = vol * 0.6;
    if (this.synth) {
      this.synth.setMasterVol(this.globalVolume);
    }
  }

  private playDrum(note: number, velocity: number = 100) {
    this.init();
    if (!this.synth || !this.enabled) return;
    const v = Math.floor(velocity * this.globalVolume * 2);
    this.synth.send([0x99, note, Math.min(127, Math.max(0, v))]);
  }

  private playToneSynth(channel: number, note: number, velocity: number = 100, durationMs: number = 200, program?: number) {
    this.init();
    if (!this.synth || !this.enabled) return;
    if (program !== undefined) {
      this.synth.send([0xC0 + channel, program]);
    }
    const v = Math.floor(velocity * this.globalVolume * 2);
    this.synth.send([0x90 + channel, note, Math.min(127, Math.max(0, v))]);
    setTimeout(() => {
      this.synth.send([0x80 + channel, note, 0]);
    }, durationMs);
  }

  playClick() {
    this.playDrum(76, 60); // High Wood Block
  }

  playMove(unitType?: UnitType) {
    switch (unitType) {
      case UnitType.KNIGHT:
        // Gallop (Wood blocks)
        this.playDrum(77, 120); // Low Wood Block
        setTimeout(() => this.playDrum(76, 105), 100);
        break;
      case UnitType.ARCHER:
        // Light footsteps (Shaker & Hihat)
        this.playDrum(82, 90); // Shaker
        setTimeout(() => this.playDrum(42, 75), 100); // Closed Hi-Hat
        break;
      case UnitType.CATAPULT:
        // Heavy Creak (Low Tom)
        this.playDrum(41, 127); // Low Floor Tom
        break;
      case UnitType.INFANTRY:
      default:
        // Standard march
        this.playDrum(45, 105); // Low Tom
        setTimeout(() => this.playDrum(45, 90), 150);
        break;
    }
  }

  playAttack(unitType?: UnitType) {
    switch (unitType) {
      case UnitType.ARCHER:
        // Twang of a bow (using Sitar/Plucked String)
        this.playToneSynth(11, 60, 100, 400, 104); // Sitar / Plucked
        this.playDrum(82, 100); // Shaker snap
        break;
      case UnitType.CATAPULT:
        // Thwack of timber / explosion - Pitch reduced 30% from 40 to 28
        this.playToneSynth(11, 28, 110, 500, 127); // Gunshot pitched down
        this.playDrum(35, 127); // Acoustic Bass Drum
        this.playDrum(49, 90); // Crash Cymbal
        break;
      case UnitType.KNIGHT: {
        // Horse neigh effect: fast slide on Ocarina/Synth Voice + gallop
        for (let i = 0; i < 4; i++) {
          setTimeout(() => this.playToneSynth(11, 80 - i * 1, 90, 150, 79), i * 30); // Ocarina Whinny
        }
        this.playDrum(49, 80); // Crash Cymbal
        setTimeout(() => this.playDrum(76, 80), 100);
        break;
      }
      case UnitType.INFANTRY:
      default:
        // Clang of swords (dissonant Glockenspiel hit + snare)
        this.playToneSynth(11, 84, 100, 300, 9); // Glockenspiel
        this.playToneSynth(11, 85, 100, 300, 9); // Dissonant clash
        this.playDrum(38, 90); // Snare
        break;
    }
  }

  playRecruit(unitType?: UnitType) {
    switch (unitType) {
      case UnitType.KNIGHT:
        this.playDrum(76, 90);
        setTimeout(() => this.playDrum(77, 100), 100);
        break;
      case UnitType.ARCHER:
        this.playDrum(55, 70); // Splash cymbal
        break;
      case UnitType.CATAPULT:
        this.playDrum(41, 100);
        this.playDrum(43, 100);
        break;
      case UnitType.INFANTRY:
      default:
        this.playDrum(48, 90); // Hi Mid Tom
        setTimeout(() => this.playDrum(45, 90), 150);
        break;
    }
  }

  playDefeat(unitType?: UnitType) {
    this.playToneSynth(11, 35, 100, 400, 127); // Gunshot muted
    switch (unitType) {
      case UnitType.KNIGHT:
        this.playDrum(49, 70); // Crash
        break;
      case UnitType.CATAPULT:
        this.playDrum(41, 100); // Low Tom
        this.playDrum(35, 100); // Kick
        break;
      default:
        this.playDrum(45, 90); // Tom
        break;
    }
  }

  playUpgrade() {
    this.playToneSynth(12, 72, 60, 300, 9); // High glockenspiel (volume reduced 40%)
    setTimeout(() => this.playToneSynth(12, 76, 60, 500), 150);
  }

  playHeal() {
    this.playToneSynth(12, 64, 80, 800, 9);
    this.playDrum(81, 100); // Open Triangle
  }

  playConquest() {
    // Triumphant 3-note fanfare
    this.playToneSynth(13, 60, 100, 200, 61); // Brass (C4)
    setTimeout(() => this.playToneSynth(13, 64, 100, 200), 150); // Brass (E4)
    setTimeout(() => this.playToneSynth(13, 67, 110, 600), 300); // Brass (G4)
  }

  playGoldMine() {
    // "Cha-ching": High-pitched metallic ring + coin jingle
    const playCoin = (vol: number, delay: number) => {
      setTimeout(() => {
        this.playDrum(81, vol); // Triangle
        this.playToneSynth(12, 84, vol, 400, 9); // Glockenspiel
      }, delay);
    };

    playCoin(120, 0);      // Initial sound
    playCoin(80, 100);    // First echo
    playCoin(50, 200);   // Second echo
  }

  playDamage() {
    this.playDrum(38, 90); // Snare
    this.playDrum(45, 90); // Low Tom
  }

  playVictory() {
    // Brass Fanfare
    const notes = [60, 64, 67, 72]; // C4, E4, G4, C5
    notes.forEach((note, i) => {
      setTimeout(() => this.playToneSynth(13, note, 110, 500, 61), i * 200);
    });
  }

  playTurnFanfare() {
    // Short 2-note fanfare (G4 -> C5)
    this.playToneSynth(13, 67, 90, 200, 61);
    setTimeout(() => this.playToneSynth(13, 72, 100, 400), 150);
  }

  resume() {
    if (this.synth && this.synth.actx && this.synth.actx.state === 'suspended') {
      this.synth.actx.resume();
    }
  }
}

export const soundEngine = new SoundEngine();
