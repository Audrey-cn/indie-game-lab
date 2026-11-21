// Zero-byte procedural Web Audio synthesizer for Roomba Raid
// High-saturation audio juice: hit pops, electric zaps, laser pews, pentatonic XP chimes, Big Gold fanfare

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.xpCombo = 0;
    this.lastXpTime = 0;
    this.lastHitTime = 0;
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  tone(freq, endFreq, dur, type = "sine", vol = 0.12, delay = 0) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + dur);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  playHit(crit = false) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now - this.lastHitTime < 35) return;
    this.lastHitTime = now;
    if (crit) {
      this.tone(720, 1280, 0.09, "triangle", 0.13);
      this.tone(360, 160, 0.07, "square", 0.06);
    } else {
      this.tone(240 + Math.random() * 70, 95, 0.06, "triangle", 0.09);
    }
  }

  playZap() {
    this.tone(680, 220, 0.09, "sawtooth", 0.07);
    this.tone(1120, 420, 0.07, "square", 0.04, 0.015);
  }

  playLaser() {
    this.tone(1280, 320, 0.1, "sawtooth", 0.065);
  }

  playXp() {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now - this.lastXpTime > 650) this.xpCombo = 0;
    else this.xpCombo = Math.min(11, this.xpCombo + 1);
    this.lastXpTime = now;
    // Ascending pentatonic notes for juicy Vampire-Survivors dopamine
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0, 2349.32];
    const f = scale[this.xpCombo];
    this.tone(f, f * 1.04, 0.09, "sine", 0.09);
  }

  playBigGold() {
    // Sparkling gold arpeggio fanfare
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
    notes.forEach((n, i) => {
      this.tone(n, n * 1.02, 0.22, "triangle", 0.14, i * 0.055);
    });
  }

  playLevelUp() {
    [440, 554.37, 659.25, 880].forEach((n, i) => {
      this.tone(n, n, 0.18, "triangle", 0.12, i * 0.06);
    });
  }

  playExtractTick(progress) {
    const f = 460 + progress * 420;
    this.tone(f, f * 1.08, 0.08, "sine", 0.1);
  }

  playExtractSuccess() {
    [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => {
      this.tone(n, n * 1.01, 0.3, "triangle", 0.14, i * 0.08);
    });
  }

  playHurt() {
    this.tone(180, 65, 0.16, "sawtooth", 0.14);
  }

  playDefeat() {
    [320, 260, 190, 120].forEach((n, i) => {
      this.tone(n, n * 0.85, 0.22, "sawtooth", 0.11, i * 0.11);
    });
  }

  playCatSlam() {
    this.tone(130, 38, 0.26, "square", 0.16);
  }
}

export const sfx = new SoundEngine();
