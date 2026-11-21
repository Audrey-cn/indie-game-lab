// High-Energy Procedural Audio Engine for Roomba Raid v0.2.0
// Features: 4-Track 128 BPM Midnight Electro-Funk BGM Sequencer (dynamic extraction intensity!)
// + Sub-bass punch hits, electric zaps, crate tension roll, Big Gold jackpot fanfare & Overdrive boom.

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.muted = false;
    this.bgmRunning = false;
    this.bgmUrgent = false;
    this.bgmTimer = null;
    this.step = 0;
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

      // Pre-generate 0.5s white noise buffer for snares, hi-hats, electric crackle & explosions
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
    gain.gain.linearRampToValueAtTime(vol, now + 0.006);
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

  // ===== 4-TRACK 128 BPM MIDNIGHT ELECTRO-FUNK BGM =====
  startBgm() {
    this.unlock();
    if (this.bgmRunning) return;
    this.bgmRunning = true;
    this.step = 0;
    const tick = () => {
      if (!this.bgmRunning) return;
      const bpm = this.bgmUrgent ? 142 : 126;
      const stepMs = (60 / bpm / 4) * 1000; // 16th-note grid
      this.playBgmStep(this.step);
      this.step = (this.step + 1) % 32;
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

  playBgmStep(s) {
    if (this.muted || !this.ctx) return;

    // 1. Punchy 4-on-the-floor Kick + syncopated ghost kick
    if (s % 4 === 0 || (this.bgmUrgent && s % 16 === 14)) {
      this.tone(140, 42, 0.13, "sine", 0.24);
    }

    // 2. Crisp Snare on 4 & 12 + bouncy 16th Hi-hat
    if (s % 8 === 4) {
      this.noise(0.11, 0.11, 2200, 0.9);
      this.tone(210, 110, 0.07, "triangle", 0.08);
    }
    if (s % 2 === 0 || this.bgmUrgent) {
      const open = s % 4 === 2;
      this.noise(open ? 0.065 : 0.028, open ? 0.05 : 0.026, 7200, 1.8);
    }

    // 3. Funky Minor-Pentatonic Synth Bassline (D minor groove)
    const bassNotes = [
      73.42, 0, 73.42, 87.31, 0, 73.42, 110.0, 98.0,
      73.42, 0, 87.31, 0, 110.0, 98.0, 87.31, 65.41,
      58.27, 0, 58.27, 73.42, 0, 87.31, 0, 73.42,
      65.41, 0, 65.41, 87.31, 98.0, 0, 110.0, 130.81,
    ];
    const bn = bassNotes[s];
    if (bn > 0) {
      this.tone(bn, bn * 0.99, 0.16, "sawtooth", 0.1, 0, this.bgmUrgent ? 720 : 480);
    }

    // 4. Catchy Playful Midnight Heist Lead Pluck
    const leadNotes = [
      587.33, 0, 698.46, 0, 880.0, 0, 783.99, 698.46,
      587.33, 0, 0, 523.25, 587.33, 0, 440.0, 0,
      466.16, 0, 587.33, 0, 698.46, 0, 659.25, 587.33,
      523.25, 0, 659.25, 0, 783.99, 880.0, 1046.5, 0,
    ];
    const ln = leadNotes[s];
    if (ln > 0) {
      this.tone(ln, ln, 0.11, "triangle", this.bgmUrgent ? 0.085 : 0.065);
    }

    // 5. Urgent Extraction High Arp Pulse
    if (this.bgmUrgent && s % 2 === 0) {
      const arp = [1174.66, 1396.91, 1760.0, 1567.98];
      this.tone(arp[(s / 2) % 4], arp[(s / 2) % 4], 0.07, "square", 0.025, 0, 2200);
    }
  }

  // ===== PUNCHY COMBAT & EXTRACTION SFX =====
  playHit(crit = false) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now - this.lastHitTime < 28) return;
    this.lastHitTime = now;
    if (crit) {
      this.tone(160, 48, 0.11, "sine", 0.22); // Heavy punch thud
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
    // Massive sub-bass boom + rising turbine sweep!
    this.tone(190, 32, 0.42, "sine", 0.34);
    this.tone(240, 1280, 0.32, "sawtooth", 0.13, 0, 2400);
    this.noise(0.32, 0.22, 1100, 0.7);
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
