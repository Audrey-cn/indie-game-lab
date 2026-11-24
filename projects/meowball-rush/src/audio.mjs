// Meowball Rush v0.1.0 — WitchSpring Fairy-Tale Celesta & Reverb Audio Engine
class MeowAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.reverbSend = null;
    this.muted = false;
    this.bgmRunning = false;
    this.bgmTimer = null;
    this.step = 0;
    this.trackIndex = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;

      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.42;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      // Warm Fairy-Tale Hall Reverb
      const rev = this.ctx.createConvolver();
      const len = Math.floor(this.ctx.sampleRate * 1.2);
      const ir = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.7) * 0.42;
      }
      rev.buffer = ir;
      this.reverbSend = this.ctx.createGain();
      this.reverbSend.gain.value = 0.28;
      this.reverbSend.connect(rev);
      rev.connect(this.master);
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(flag) {
    this.muted = flag;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(flag ? 0 : 0.42, this.ctx.currentTime, 0.02);
  }

  // Dreamy WitchSpring Celesta / Music-Box Bell Voice
  bell(freq, dur = 0.55, vol = 0.08, delay = 0) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const mg = this.ctx.createGain();
    const amp = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    mod.type = "sine";
    mod.frequency.setValueAtTime(freq * 3.0, now);
    mg.gain.setValueAtTime(freq * 0.9, now);
    mg.gain.exponentialRampToValueAtTime(1, now + 0.12);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(vol, now + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    mod.connect(mg);
    mg.connect(osc.frequency);
    osc.connect(amp);
    amp.connect(this.master);
    if (this.reverbSend) amp.connect(this.reverbSend);
    osc.start(now);
    mod.start(now);
    osc.stop(now + dur + 0.03);
    mod.stop(now + dur + 0.03);
  }

  tone(f0, f1, dur, type = "sine", vol = 0.14, delay = 0) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(24, f1), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.03);
  }

  startBgm(trackIndex = 0) {
    this.unlock();
    this.trackIndex = trackIndex;
    if (this.bgmRunning) return;
    this.bgmRunning = true;
    this.step = 0;
    const tick = () => {
      if (!this.bgmRunning) return;
      const bpm = this.trackIndex === 2 ? 124 : this.trackIndex === 1 ? 118 : 114;
      this.playStep(this.step);
      this.step = (this.step + 1) % 64;
      this.bgmTimer = setTimeout(tick, (60 / bpm / 4) * 1000);
    };
    tick();
  }

  stopBgm() {
    this.bgmRunning = false;
    clearTimeout(this.bgmTimer);
  }

  playStep(s) {
    if (this.muted || !this.ctx) return;
    const bar = Math.floor(s / 16);
    const sub = s % 16;
    // Playful Waltzy WitchSpring Fantasy Progression (Fmaj7 -> G6 -> Em7 -> Am9)
    const chords = [
      [349.23, 440.0, 523.25],
      [392.0, 493.88, 587.33],
      [329.63, 392.0, 493.88],
      [440.0, 523.25, 659.25],
    ];
    if (sub === 0) {
      chords[bar].forEach((f, i) => this.bell(f, 0.9, 0.036, i * 0.025));
    }
    // Soft Bouncy Kick & Pizzicato Bass
    if (sub === 0 || sub === 8) this.tone(118, 42, 0.11, "sine", 0.14);
    const roots = [174.61, 196.0, 164.81, 220.0];
    if (sub === 0 || sub === 6 || sub === 10) this.tone(roots[bar], roots[bar] * 0.99, 0.15, "triangle", 0.075);

    const mel = [
      [523.25, 0, 659.25, 0, 783.99, 0, 659.25, 587.33, 523.25, 0, 440, 0, 523.25, 0, 0, 0],
      [587.33, 0, 783.99, 0, 880, 0, 783.99, 659.25, 587.33, 0, 493.88, 0, 587.33, 0, 0, 0],
      [659.25, 0, 783.99, 0, 987.77, 0, 880, 783.99, 659.25, 0, 523.25, 0, 659.25, 0, 0, 0],
      [880, 0, 783.99, 0, 659.25, 0, 587.33, 523.25, 440, 0, 523.25, 0, 659.25, 0, 0, 0],
    ][bar];
    if (mel[sub] > 0) this.bell(mel[sub], 0.36, 0.052);
  }

  playStar() {
    this.bell(1046.5, 0.25, 0.11);
    this.bell(1567.98, 0.32, 0.1, 0.05);
  }

  playBoost() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.bell(f, 0.24, 0.09, i * 0.032));
  }

  playBoing() {
    this.tone(190, 620, 0.22, "sine", 0.24);
    this.bell(880, 0.24, 0.08, 0.06);
  }

  playDizzy() {
    this.tone(420, 180, 0.16, "triangle", 0.18);
    [780, 620, 820, 580].forEach((f, i) => this.bell(f, 0.18, 0.075, i * 0.07));
  }

  playPop() {
    // Iconic comical soap-bubble POP + shocked cat meow pitch chirp!
    this.tone(360, 980, 0.07, "sine", 0.28);
    this.tone(180, 52, 0.14, "sine", 0.22, 0.04);
    this.tone(860, 520, 0.18, "triangle", 0.12, 0.06);
  }

  playCheckpoint() {
    [659.25, 880, 1174.66].forEach((f, i) => this.bell(f, 0.35, 0.1, i * 0.055));
  }

  playFinish() {
    [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].forEach((f, i) => this.bell(f, 0.55, 0.12, i * 0.065));
  }

  playUrgentTick() {
    this.bell(1318.5, 0.12, 0.08);
  }
}

export const sfx = new MeowAudio();
