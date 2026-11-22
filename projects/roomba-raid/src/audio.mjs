// Roomba Raid v0.3.0 — Multi-Section 128-Step Dynamic BGM Engine + Punchy Combat SFX
// Solves short-loop fatigue: 4 distinct musical sections (A: Stealth Intro -> B: Funky Groove -> C: Chorus Drop -> D: Bridge)
// + Warm chord pads + Room-specific themes + Dynamic Urgent Extraction Mode!

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.muted = false;
    this.bgmRunning = false;
    this.bgmUrgent = false;
    this.bgmFever = false;
    this.roomTheme = "living"; // living | bedroom | kitchen
    this.bgmTimer = null;
    this.step = 0; // 0..127 (8 bars of 16th notes!)
    this.xpCombo = 0;
    this.lastXpTime = 0;
    this.lastHitTime = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(this.ctx.destination);

      const len = Math.floor(this.ctx.sampleRate * 0.5);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(flag) {
    this.muted = flag;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(flag ? 0 : 0.85, this.ctx.currentTime, 0.03);
    }
  }

  tone(freq, endFreq, dur, type = "sine", vol = 0.14, delay = 0, filterFreq = 0) {
    if (this.muted || !this.ctx || !this.master) return;
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

    if (filterFreq > 0) {
      const flt = this.ctx.createBiquadFilter();
      flt.type = "lowpass";
      flt.frequency.setValueAtTime(filterFreq, now);
      osc.connect(flt);
      flt.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.03);
  }

  padChord(freqs, dur, vol = 0.035) {
    for (const f of freqs) {
      this.tone(f, f, dur, "triangle", vol, 0, 950);
    }
  }

  noise(dur, vol = 0.1, bandFreq = 1800, q = 1.2, delay = 0) {
    if (this.muted || !this.ctx || !this.noiseBuf || !this.master) return;
    const now = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = "bandpass";
    flt.frequency.setValueAtTime(bandFreq, now);
    flt.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(flt);
    flt.connect(gain);
    gain.connect(this.master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  startBgm(theme = "living") {
    this.unlock();
    this.roomTheme = theme;
    if (this.bgmRunning) return;
    this.bgmRunning = true;
    this.step = 0;
    const tick = () => {
      if (!this.bgmRunning) return;
      const baseBpm = this.roomTheme === "bedroom" ? 116 : 124;
      const bpm = this.bgmUrgent ? baseBpm + 18 : this.bgmFever ? baseBpm + 10 : baseBpm;
      const stepMs = (60 / bpm / 4) * 1000;
      this.playBgmStep(this.step);
      this.step = (this.step + 1) % 128; // Full 8-bar evolving progression!
      this.bgmTimer = setTimeout(tick, stepMs);
    };
    tick();
  }

  stopBgm() {
    this.bgmRunning = false;
    clearTimeout(this.bgmTimer);
  }

  setUrgent(flag) {
    this.bgmUrgent = flag;
  }

  setFever(flag) {
    this.bgmFever = flag;
  }

  playBgmStep(s) {
    if (this.muted || !this.ctx) return;
    const bar = Math.floor(s / 16); // 0..7
    const sub = s % 16;             // 0..15
    const section = Math.floor(bar / 2); // 0=A(Stealth), 1=B(Groove), 2=C(Chorus), 3=D(Bridge)

    // 1. Warm Chord Progression (changes every bar across 8 bars: Dm9 -> Bbmaj7 -> Gm7 -> A7 -> Dm9 -> Fmaj7 -> Cmaj7 -> A7)
    const chords = [
      [293.66, 349.23, 440.0],    // Dm
      [233.08, 293.66, 349.23],   // Bb
      [196.0, 233.08, 293.66],    // Gm
      [220.0, 277.18, 329.63],    // A
      [293.66, 349.23, 440.0],    // Dm
      [349.23, 440.0, 523.25],    // F
      [261.63, 329.63, 392.0],    // C
      [220.0, 277.18, 392.0],     // A7
    ];
    if (sub === 0) {
      this.padChord(chords[bar], 1.35, section === 2 ? 0.042 : 0.028);
    }

    // 2. Dynamic Drum Groove (minimal in section A, full funk in B/C, syncopated fill in bar 7!)
    const kickHit =
      section === 0
        ? (sub === 0 || sub === 8)
        : (sub === 0 || sub === 6 || sub === 8 || (this.bgmUrgent && sub === 14));
    if (kickHit) this.tone(135, 42, 0.13, "sine", section === 2 ? 0.24 : 0.18);

    if (section >= 1 && (sub === 4 || sub === 12)) {
      this.noise(0.11, 0.1, 2100, 0.9);
      this.tone(205, 110, 0.065, "triangle", 0.075);
    }
    if (sub % 2 === 0 && (section >= 1 || sub % 4 === 2)) {
      const open = sub === 10 || sub === 14;
      this.noise(open ? 0.06 : 0.025, open ? 0.042 : 0.022, 6800, 1.8);
    }
    // End-of-8-bar drum fill
    if (bar === 7 && sub >= 12) {
      this.tone(190 - (sub - 12) * 20, 70, 0.08, "triangle", 0.14);
    }

    // 3. Evolving Funk Bassline (follows chord root)
    const roots = [73.42, 58.27, 98.0, 110.0, 73.42, 87.31, 65.41, 110.0];
    const root = roots[bar];
    const bassPattern = [1, 0, 0, 1, 0, 0, 1.5, 0, 1, 0, 1.2, 0, 0, 1, 1.5, 0];
    const mult = bassPattern[sub];
    if (mult > 0) {
      const f = root * (mult === 1.5 ? 1.498 : mult === 1.2 ? 1.189 : 1);
      this.tone(f, f * 0.99, 0.16, "sawtooth", 0.095, 0, section === 2 || this.bgmUrgent ? 780 : 440);
    }

    // 4. Distinct Melodies per Section (no repetitive 2-bar fatigue!)
    const melA = [587.33, 0, 0, 698.46, 0, 0, 659.25, 0, 587.33, 0, 0, 0, 523.25, 0, 0, 0];
    const melB = [587.33, 0, 698.46, 0, 880.0, 0, 783.99, 698.46, 587.33, 0, 523.25, 0, 587.33, 0, 440.0, 0];
    const melC = [880.0, 0, 1046.5, 880.0, 783.99, 0, 698.46, 0, 880.0, 0, 1174.66, 0, 1046.5, 880.0, 783.99, 0];
    const melD = [659.25, 0, 587.33, 0, 523.25, 0, 440.0, 0, 523.25, 587.33, 659.25, 0, 783.99, 0, 880.0, 0];
    const mel = section === 0 ? melA : section === 1 ? melB : section === 2 ? melC : melD;
    const note = mel[sub];
    if (note > 0) {
      const transpose = bar % 2 === 1 && section < 2 ? 0.8909 : 1; // Gentle harmonic answer on odd bars
      this.tone(note * transpose, note * transpose, 0.13, section === 2 ? "square" : "triangle", section === 2 ? 0.048 : 0.065, 0, 2400);
    }

    // 5. Urgent Extraction High Synth Pulse
    if (this.bgmUrgent && sub % 4 === 2) {
      this.tone(1174.66, 1396.91, 0.08, "sawtooth", 0.032, 0, 2200);
    }
  }

  // ===== COMBAT & ENVIRONMENT SFX =====
  playHit(crit = false) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now - this.lastHitTime < 28) return;
    this.lastHitTime = now;
    if (crit) {
      this.tone(160, 48, 0.11, "sine", 0.22);
      this.tone(860, 1580, 0.1, "triangle", 0.16);
      this.noise(0.05, 0.1, 3600, 1.4);
    } else {
      this.tone(150, 55, 0.07, "sine", 0.14);
      this.tone(320 + Math.random() * 90, 140, 0.055, "triangle", 0.09);
    }
  }

  playKill() {
    this.tone(190, 60, 0.09, "sine", 0.16);
    this.noise(0.06, 0.08, 2800, 1.2);
  }

  playZap() {
    this.tone(760, 240, 0.09, "sawtooth", 0.085, 0, 2600);
    this.noise(0.07, 0.08, 4200, 2.0);
  }

  playLaser() {
    this.tone(1480, 340, 0.11, "sawtooth", 0.08, 0, 3000);
  }

  playOverdriveBlast() {
    this.tone(190, 32, 0.42, "sine", 0.34);
    this.tone(240, 1280, 0.32, "sawtooth", 0.13, 0, 2400);
    this.noise(0.32, 0.22, 1100, 0.7);
  }

  playPoopSplat() {
    this.tone(240, 62, 0.28, "sawtooth", 0.18, 0, 520);
    this.noise(0.18, 0.16, 650, 0.7);
  }

  playBossStun() {
    this.tone(140, 36, 0.32, "sine", 0.3);
    this.tone(420, 210, 0.28, "triangle", 0.15, 0.06);
  }

  playHordeHorn() {
    this.tone(220, 208, 0.48, "sawtooth", 0.16, 0, 720);
    this.tone(330, 312, 0.48, "sawtooth", 0.12, 0.04, 880);
  }

  playCrateTick(progress) {
    const f = 380 + progress * 760;
    this.tone(f, f * 1.12, 0.07, "triangle", 0.11);
  }

  playCratePop() {
    this.tone(180, 45, 0.18, "sine", 0.24);
    this.noise(0.12, 0.14, 2400, 1.0);
    this.playBigGold();
  }

  playXp() {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now - this.lastXpTime > 650) this.xpCombo = 0;
    else this.xpCombo = Math.min(11, this.xpCombo + 1);
    this.lastXpTime = now;
    const scale = [587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0, 2349.32, 2637.02];
    const f = scale[this.xpCombo];
    this.tone(f, f * 1.05, 0.09, "sine", 0.1);
  }

  playBigGold() {
    const notes = [587.33, 739.99, 880.0, 1174.66, 1479.98, 1760.0];
    notes.forEach((n, i) => {
      this.tone(n, n * 1.02, 0.26, "triangle", 0.16, i * 0.05);
    });
  }

  playLevelUp() {
    [440, 554.37, 659.25, 880, 1108.73].forEach((n, i) => {
      this.tone(n, n, 0.2, "triangle", 0.14, i * 0.055);
    });
  }

  playExtractTick(progress) {
    const f = 520 + progress * 560;
    this.tone(f, f * 1.1, 0.09, "sine", 0.14);
  }

  playExtractSuccess() {
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((n, i) => {
      this.tone(n, n * 1.01, 0.35, "triangle", 0.18, i * 0.075);
    });
  }

  playHurt() {
    this.tone(180, 55, 0.18, "sawtooth", 0.18, 0, 900);
    this.noise(0.1, 0.12, 900, 1.0);
  }

  playDefeat() {
    [320, 250, 180, 95].forEach((n, i) => {
      this.tone(n, n * 0.85, 0.24, "sawtooth", 0.13, i * 0.11, 1000);
    });
  }

  playCatSlam() {
    this.tone(150, 34, 0.3, "sine", 0.3);
    this.noise(0.2, 0.18, 800, 0.8);
  }
}

export const sfx = new SoundEngine();
