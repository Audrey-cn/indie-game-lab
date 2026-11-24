// Roomba Raid v0.9.0 — Studio-Mixed WebAudio Engine:
// Convolver Room Reverb + Master DynamicsCompressor + Warm FM Rhodes Lo-Fi Funk BGM
// + Dynamic 5s Breather Low-Pass Filter + Layered Foley Combat SFX + External MP3/OGG Drop-in Slot!

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.bgmBus = null;
    this.bgmFilter = null;
    this.reverb = null;
    this.reverbSend = null;
    this.muted = false;
    this.bgmTimer = null;
    this.bgmRunning = false;
    this.bgmUrgent = false;
    this.bgmFever = false;
    this.bgmBreather = false;
    this.roomTheme = "living";
    this.step = 0;
    this.xpCombo = 0;
    this.lastXpTime = 0;
    this.lastHitTime = 0;
    this.noiseBuffer = null;
    this.externalAudio = null; // Optional drop-in MP3/OGG BGM slot
  }

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      // Master Dynamics Compressor -> Warm, punchy commercial mobile game loudness without harsh clipping!
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 18;
      comp.ratio.value = 4.5;
      comp.attack.value = 0.006;
      comp.release.value = 0.14;

      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.42;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      // Dedicated BGM Bus with Dynamic Low-Pass Filter (sweeps smoothly during 5s Breathing Window!)
      this.bgmFilter = this.ctx.createBiquadFilter();
      this.bgmFilter.type = "lowpass";
      this.bgmFilter.frequency.value = 6200;
      this.bgmFilter.Q.value = 0.7;

      this.bgmBus = this.ctx.createGain();
      this.bgmBus.gain.value = 0.78;
      this.bgmBus.connect(this.bgmFilter);
      this.bgmFilter.connect(this.master);

      // Synthesized Stereo Room Impulse Response for Warm Convolver Reverb!
      this.reverb = this.ctx.createConvolver();
      const irLen = Math.floor(this.ctx.sampleRate * 1.15);
      const ir = this.ctx.createBuffer(2, irLen, this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) {
          const env = Math.pow(1 - i / irLen, 2.6);
          d[i] = (Math.random() * 2 - 1) * env * 0.45;
        }
      }
      this.reverb.buffer = ir;
      this.reverbSend = this.ctx.createGain();
      this.reverbSend.gain.value = 0.24;
      this.reverbSend.connect(this.reverb);
      this.reverb.connect(this.master);

      // Pre-build 1s white noise buffer
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  // Optional zero-code drop-in for external Suno/Udio/Royalty-free MP3 or OGG loop!
  loadExternalBgm(url) {
    if (this.externalAudio) {
      this.externalAudio.pause();
      this.externalAudio = null;
    }
    if (!url) return;
    const a = new Audio(url);
    a.loop = true;
    a.volume = this.muted ? 0 : 0.36;
    this.externalAudio = a;
  }

  setMuted(flag) {
    this.muted = flag;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(flag ? 0 : 0.42, this.ctx.currentTime, 0.02);
    }
    if (this.externalAudio) this.externalAudio.volume = flag ? 0 : 0.36;
  }

  setBreather(flag) {
    this.bgmBreather = flag;
    if (this.bgmFilter && this.ctx) {
      this.bgmFilter.frequency.setTargetAtTime(flag ? 920 : 6200, this.ctx.currentTime, 0.22);
    }
  }

  // Warm FM Rhodes Electric Piano Voice (Bell attack + mellow sine body -> Reverb!)
  rhodes(freq, dur = 0.55, vol = 0.075, delay = 0, dest = null) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime + delay;
    const carrier = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const amp = this.ctx.createGain();

    carrier.type = "sine";
    carrier.frequency.setValueAtTime(freq, now);
    mod.type = "sine";
    mod.frequency.setValueAtTime(freq * 2.0, now);

    // Classic Rhodes bell tine transient decays rapidly leaving warm fundamental
    modGain.gain.setValueAtTime(freq * 1.15, now);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.06, now + 0.14);

    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(vol, now + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(amp);
    const out = dest || this.bgmBus;
    amp.connect(out);
    if (this.reverbSend) amp.connect(this.reverbSend);

    carrier.start(now);
    mod.start(now);
    carrier.stop(now + dur + 0.04);
    mod.stop(now + dur + 0.04);
  }

  // Warm Plucky Slap/Synth Bass (Lowpass envelope -> tight groove!)
  bassPluck(freq, dur = 0.22, vol = 0.16, delay = 0) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const sub = this.ctx.createOscillator();
    const flt = this.ctx.createBiquadFilter();
    const amp = this.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now);
    sub.type = "sine";
    sub.frequency.setValueAtTime(freq * 0.5, now);

    flt.type = "lowpass";
    flt.frequency.setValueAtTime(1400, now);
    flt.frequency.exponentialRampToValueAtTime(260, now + dur * 0.85);
    flt.Q.value = 1.6;

    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(vol, now + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(flt);
    sub.connect(flt);
    flt.connect(amp);
    amp.connect(this.bgmBus);

    osc.start(now);
    sub.start(now);
    osc.stop(now + dur + 0.03);
    sub.stop(now + dur + 0.03);
  }

  tone(freq, endFreq, dur, type = "sine", vol = 0.14, delay = 0, filterHz = 0, sendReverb = false) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(22, endFreq), now + dur);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    if (filterHz > 0) {
      const flt = this.ctx.createBiquadFilter();
      flt.type = "lowpass";
      flt.frequency.setValueAtTime(filterHz, now);
      osc.connect(flt);
      flt.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(this.master);
    if (sendReverb && this.reverbSend) gain.connect(this.reverbSend);
    osc.start(now);
    osc.stop(now + dur + 0.03);
  }

  noise(dur, vol = 0.08, bandHz = 1800, q = 1.0, delay = 0, dest = null) {
    if (!this.ctx || this.muted || !this.noiseBuffer) return;
    const now = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const flt = this.ctx.createBiquadFilter();
    flt.type = "bandpass";
    flt.frequency.setValueAtTime(bandHz, now);
    flt.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(flt);
    flt.connect(gain);
    gain.connect(dest || this.master);
    src.start(now);
    src.stop(now + dur + 0.03);
  }

  startBgm(theme = "living") {
    this.unlock();
    this.roomTheme = theme;
    if (this.externalAudio) {
      this.externalAudio.play().catch(() => {});
      this.bgmRunning = true;
      return;
    }
    if (this.bgmRunning) return;
    this.bgmRunning = true;
    this.step = 0;
    const tick = () => {
      if (!this.bgmRunning) return;
      const baseBpm = this.roomTheme === "bedroom" ? 104 : this.roomTheme === "kitchen" ? 116 : 110;
      const bpm = this.bgmBreather ? baseBpm - 8 : this.bgmUrgent ? baseBpm + 14 : this.bgmFever ? baseBpm + 8 : baseBpm;
      const stepMs = (60 / bpm / 4) * 1000;
      this.playBgmStep(this.step);
      this.step = (this.step + 1) % 128; // Full 8-bar Rhodes Jazz-Funk progression!
      this.bgmTimer = setTimeout(tick, stepMs);
    };
    tick();
  }

  stopBgm() {
    this.bgmRunning = false;
    clearTimeout(this.bgmTimer);
    if (this.externalAudio) this.externalAudio.pause();
  }

  setUrgent(flag) {
    this.bgmUrgent = flag;
  }

  setFever(flag) {
    this.bgmFever = flag;
  }

  playBgmStep(s) {
    if (this.muted || !this.ctx) return;
    const bar = Math.floor(s / 16);      // 0..7
    const sub = s % 16;                  // 0..15
    const section = Math.floor(bar / 2); // 0=Groove Intro, 1=Main Funk, 2=Chorus Lift, 3=Chill Bridge

    // 1. Lush Jazz-Funk Rhodes Chords (Dm9 -> Gm9 -> C13 -> Fmaj9 -> Bbmaj7 -> Em7b5 -> A7#5 -> Dm9)
    const chords = [
      [293.66, 349.23, 440.0, 523.25],   // Dm7
      [196.0, 293.66, 349.23, 466.16],   // Gm7
      [261.63, 329.63, 466.16, 587.33],  // C9
      [261.63, 349.23, 440.0, 523.25],   // Fmaj7
      [233.08, 293.66, 349.23, 440.0],   // Bbmaj7
      [246.94, 293.66, 392.0, 493.88],   // G/B
      [220.0, 277.18, 392.0, 493.88],    // A9
      [293.66, 349.23, 440.0, 659.25],   // Dm9
    ];
    // Syncopated warm electric-piano stabs (never robotic on-beat blocks!)
    if (sub === 0 || (!this.bgmBreather && sub === 10)) {
      const ch = chords[bar];
      const dur = sub === 0 ? 1.15 : 0.42;
      const vol = sub === 0 ? 0.044 : 0.032;
      ch.forEach((f, idx) => this.rhodes(f, dur, vol, idx * 0.018));
    }

    // During 5s Breathing Window, drop drums & play gentle Rhodes arpeggio only!
    if (this.bgmBreather) {
      if (sub === 4 || sub === 8 || sub === 12) {
        const ch = chords[bar];
        this.rhodes(ch[(sub / 4) % ch.length] * 2, 0.55, 0.038);
      }
      return;
    }

    // 2. Tight Lo-Fi Funk Drum Kit (Punchy 808 Kick + Brushed Snare + Swung Hi-Hat)
    const kickHit = sub === 0 || sub === 7 || sub === 10 || (this.bgmUrgent && sub === 14);
    if (kickHit) {
      this.tone(128, 38, 0.14, "sine", 0.24);
      this.noise(0.018, 0.035, 3200, 1.5, 0, this.bgmBus);
    }
    if (sub === 4 || sub === 12) {
      this.noise(0.11, 0.095, 2400, 0.9, 0, this.bgmBus);
      this.tone(195, 115, 0.06, "triangle", 0.075);
    }
    if (sub % 2 === 0) {
      const open = sub === 14;
      this.noise(open ? 0.075 : 0.022, open ? 0.036 : 0.018, 7600, 2.2, 0, this.bgmBus);
    }

    // 3. Elastic Funk Bassline
    const roots = [73.42, 98.0, 65.41, 87.31, 58.27, 61.74, 55.0, 73.42];
    const root = roots[bar];
    const bassSteps = [1, 0, 0, 1, 0, 0, 1.5, 0, 0, 1.2, 1, 0, 0, 1.5, 0, 1.33];
    const m = bassSteps[sub];
    if (m > 0) this.bassPluck(root * m, 0.21, 0.15);

    // 4. Playful Heist Rhodes Lead Melody (only in Chorus / Main Groove, airy spacing!)
    if (section === 1 || section === 2) {
      const lead = section === 2
        ? [880, 0, 1046.5, 0, 783.99, 0, 698.46, 0, 880, 0, 1174.66, 0, 1046.5, 0, 783.99, 0]
        : [587.33, 0, 0, 698.46, 0, 880, 0, 783.99, 0, 0, 659.25, 0, 587.33, 0, 0, 0];
      const note = lead[sub];
      if (note > 0) this.rhodes(note, 0.34, 0.055);
    }
  }

  // ===== WARM FOLEY COMBAT & UNBOXING SFX (Zero harsh square/sawtooth beeps!) =====
  playHit(crit = false) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now - this.lastHitTime < 32) return;
    this.lastHitTime = now;
    if (crit) {
      // Heavy padded sub-punch + crisp crystal chime + snappy foley crack
      this.tone(165, 42, 0.12, "sine", 0.26);
      this.rhodes(1318.5, 0.16, 0.11, 0, this.master);
      this.noise(0.05, 0.11, 3800, 1.6);
    } else {
      // Tactile muted pop + soft dust puff
      this.tone(145, 58, 0.065, "sine", 0.15);
      this.noise(0.032, 0.065, 2000 + Math.random() * 700, 1.5);
    }
  }

  playKill() {
    // Satisfying bubble-pop + sub-thump
    this.tone(240, 72, 0.085, "sine", 0.17);
    this.tone(480, 760, 0.065, "sine", 0.09, 0.015, 0, true);
    this.noise(0.045, 0.06, 3200, 1.5);
  }

  playZap() {
    // Crisp high-voltage crackle (filtered spark bursts + deep magnetic thump, zero ugly sawtooth!)
    this.tone(150, 46, 0.095, "sine", 0.18);
    this.noise(0.03, 0.14, 6400, 2.4, 0);
    this.noise(0.05, 0.11, 3800, 1.8, 0.025);
    this.rhodes(1568, 0.09, 0.06, 0.01, this.master);
  }

  playLaser() {
    // Sleek optical glass ping + airy whoosh
    this.tone(1680, 620, 0.095, "sine", 0.11, 0, 0, true);
    this.tone(2420, 1180, 0.075, "triangle", 0.055, 0.01, 3400);
    this.noise(0.04, 0.05, 5800, 2.6);
  }

  playHairdryer() {
    // Pressurized turbine air-blast whoosh
    this.tone(130, 78, 0.16, "sine", 0.13);
    this.noise(0.18, 0.14, 1250, 0.85);
    this.noise(0.14, 0.075, 2900, 1.3);
  }

  playEvolution() {
    // Warm orchestral Rhodes + sub-drop super weapon awakening!
    this.tone(125, 38, 0.45, "sine", 0.34);
    this.noise(0.24, 0.14, 2400, 0.9);
    [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].forEach((n, i) => {
      this.rhodes(n, 0.55, 0.13, i * 0.055, this.master);
    });
  }

  playUnboxingFanfare() {
    // Crate pop + sparkling harp-like Rhodes cascade!
    this.tone(160, 46, 0.2, "sine", 0.28);
    this.noise(0.1, 0.12, 3400, 1.2);
    [587.33, 739.99, 880, 1174.66, 1479.98, 1760, 2349.32].forEach((n, i) => {
      this.rhodes(n, 0.52, 0.12, 0.04 + i * 0.048, this.master);
    });
  }

  playOverdriveBlast() {
    this.tone(180, 32, 0.44, "sine", 0.36);
    this.noise(0.32, 0.22, 1100, 0.7);
    [440, 659.25, 880, 1318.5].forEach((n, i) => this.rhodes(n, 0.4, 0.09, i * 0.03, this.master));
  }

  playPoopSplat() {
    this.tone(210, 54, 0.26, "triangle", 0.18, 0, 480);
    this.noise(0.18, 0.15, 620, 0.75);
  }

  playBossStun() {
    this.tone(140, 36, 0.32, "sine", 0.32);
    this.rhodes(440, 0.35, 0.12, 0.04, this.master);
  }

  playHordeHorn() {
    this.tone(196, 185, 0.46, "triangle", 0.18, 0, 680, true);
    this.tone(293.66, 277.18, 0.46, "triangle", 0.12, 0.05, 880, true);
  }

  playCrateTick(progress) {
    this.rhodes(420 + progress * 680, 0.14, 0.09, 0, this.master);
  }

  playCratePop() {
    this.playUnboxingFanfare();
  }

  playXp() {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now - this.lastXpTime > 650) this.xpCombo = 0;
    else this.xpCombo = Math.min(11, this.xpCombo + 1);
    this.lastXpTime = now;
    const scale = [587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0, 2349.32, 2637.02];
    this.rhodes(scale[this.xpCombo], 0.18, 0.075, 0, this.master);
  }

  playBigGold() {
    [587.33, 739.99, 880.0, 1174.66, 1479.98].forEach((n, i) => {
      this.rhodes(n, 0.42, 0.12, i * 0.05, this.master);
    });
  }

  playLevelUp() {
    [440, 554.37, 659.25, 880, 1108.73].forEach((n, i) => {
      this.rhodes(n, 0.38, 0.12, i * 0.055, this.master);
    });
  }

  playExtractTick(progress) {
    this.rhodes(520 + progress * 560, 0.16, 0.11, 0, this.master);
  }

  playExtractSuccess() {
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((n, i) => {
      this.rhodes(n, 0.55, 0.14, i * 0.075, this.master);
    });
  }

  playHurt() {
    this.tone(175, 52, 0.18, "sine", 0.22);
    this.noise(0.11, 0.13, 850, 1.0);
  }

  playDefeat() {
    [329.63, 293.66, 261.63, 196.0].forEach((n, i) => {
      this.rhodes(n, 0.42, 0.12, i * 0.13, this.master);
    });
  }

  playCatSlam() {
    this.tone(145, 34, 0.32, "sine", 0.34);
    this.noise(0.22, 0.18, 760, 0.8);
  }
}

export const sfx = new SoundEngine();
