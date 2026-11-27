// Meowball Rush v0.7.0 — Upbeat CC0 Bouncy Hamster BGM (Smooth Fade-In/Out + Pause Duck + Speed Tempo) + Reverb Foley SFX
import bgmUrl from "./assets/bgm-bouncy.m4a";

class MeowAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.reverbSend = null;
    this.muted = false;
    this.bgmAudio = null;
    this.bgmTargetVol = 0.34;
    this.bgmFadeRaf = 0;
    this.trackIndex = 0;
    this.paused = false;
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
      const len = Math.floor(this.ctx.sampleRate * 1.1);
      const ir = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.7) * 0.4;
      }
      rev.buffer = ir;
      this.reverbSend = this.ctx.createGain();
      this.reverbSend.gain.value = 0.25;
      this.reverbSend.connect(rev);
      rev.connect(this.master);
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  _fadeBgm(targetVol, durationMs = 900, onDone = null) {
    if (!this.bgmAudio) return;
    if (this.bgmFadeRaf) cancelAnimationFrame(this.bgmFadeRaf);
    const startVol = this.bgmAudio.volume;
    const endVol = this.muted ? 0 : Math.max(0, Math.min(1, targetVol));
    const startTs = performance.now();
    const step = (now) => {
      if (!this.bgmAudio) return;
      const t = Math.min(1, (now - startTs) / Math.max(16, durationMs));
      const ease = t * (2 - t);
      this.bgmAudio.volume = Math.max(0, Math.min(1, startVol + (endVol - startVol) * ease));
      if (t < 1) {
        this.bgmFadeRaf = requestAnimationFrame(step);
      } else {
        this.bgmFadeRaf = 0;
        if (onDone) onDone();
      }
    };
    this.bgmFadeRaf = requestAnimationFrame(step);
  }

  setMuted(flag) {
    this.muted = flag;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(flag ? 0 : 0.42, this.ctx.currentTime, 0.03);
    if (this.bgmAudio) this._fadeBgm(flag ? 0 : (this.paused ? 0.11 : this.bgmTargetVol), 240);
  }

  setPaused(flag) {
    this.paused = flag;
    if (!this.bgmAudio) return;
    this._fadeBgm(flag ? 0.11 : this.bgmTargetVol, 350);
  }

  updateSpeed(speedRatio = 0) {
    if (!this.bgmAudio || this.paused) return;
    const base = this.trackIndex === 2 ? 1.04 : this.trackIndex === 1 ? 1.02 : 1.0;
    const targetRate = base + Math.min(0.06, Math.max(0, speedRatio) * 0.06);
    this.bgmAudio.playbackRate += (targetRate - this.bgmAudio.playbackRate) * 0.08;
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
    this.paused = false;
    if (!this.bgmAudio) {
      this.bgmAudio = new Audio(bgmUrl);
      this.bgmAudio.loop = true;
      this.bgmAudio.volume = 0.001;
    }
    this.bgmAudio.playbackRate = trackIndex === 2 ? 1.04 : trackIndex === 1 ? 1.02 : 1.0;
    const wasPaused = this.bgmAudio.paused;
    if (wasPaused) this.bgmAudio.volume = 0.001;
    this.bgmAudio.play().catch(() => {});
    // Smooth 1.2s fade-in so music never starts abruptly!
    this._fadeBgm(this.bgmTargetVol, wasPaused ? 1200 : 450);
  }

  stopBgm() {
    if (!this.bgmAudio) return;
    this.paused = false;
    this._fadeBgm(0, 420, () => {
      if (this.bgmAudio && this.bgmAudio.volume <= 0.01) this.bgmAudio.pause();
    });
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

  playHammerBonk(strength = 1) {
    const v = Math.min(1.4, Math.max(0.5, strength));
    this.tone(160 * v, 52, 0.16, "sine", 0.28 * Math.min(1, v));
    this.tone(310, 145, 0.12, "triangle", 0.16 * Math.min(1, v));
    this.bell(620, 0.18, 0.07, 0.02);
  }

  playDizzy() {
    this.tone(420, 180, 0.16, "triangle", 0.18);
    [780, 620, 820, 580].forEach((f, i) => this.bell(f, 0.18, 0.075, i * 0.07));
  }

  playPop() {
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
