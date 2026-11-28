// Meowball Rush v1.1.0 — Dual BGM (Warm Lobby Sunflower Valley + Upbeat Gameplay Bouncy Hamster) with Crossfade & Combo Star Chimes
import gameBgmUrl from "./assets/bgm-bouncy.m4a";
import lobbyBgmUrl from "./assets/bgm-lobby.m4a";

class MeowAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.reverbSend = null;
    this.muted = false;
    this.gameAudio = null;
    this.lobbyAudio = null;
    this.activeMode = "none"; // "lobby" | "game" | "none"
    this.fades = new Map();
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

  _ensureAudios() {
    if (!this.lobbyAudio) {
      this.lobbyAudio = new Audio(lobbyBgmUrl);
      this.lobbyAudio.loop = true;
      this.lobbyAudio.volume = 0.001;
    }
    if (!this.gameAudio) {
      this.gameAudio = new Audio(gameBgmUrl);
      this.gameAudio.loop = true;
      this.gameAudio.volume = 0.001;
    }
  }

  _fadeAudio(audioEl, targetVol, durationMs = 1100, pauseAtZero = false) {
    if (!audioEl) return;
    const prevRaf = this.fades.get(audioEl);
    if (prevRaf) cancelAnimationFrame(prevRaf);
    const startVol = audioEl.volume;
    const endVol = this.muted ? 0 : Math.max(0, Math.min(1, targetVol));
    const startTs = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - startTs) / Math.max(16, durationMs));
      const ease = t * (2 - t);
      audioEl.volume = Math.max(0, Math.min(1, startVol + (endVol - startVol) * ease));
      if (t < 1) {
        this.fades.set(audioEl, requestAnimationFrame(step));
      } else {
        this.fades.delete(audioEl);
        if (pauseAtZero && audioEl.volume <= 0.008) audioEl.pause();
      }
    };
    this.fades.set(audioEl, requestAnimationFrame(step));
  }

  setMuted(flag) {
    this.muted = flag;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(flag ? 0 : 0.42, this.ctx.currentTime, 0.03);
    if (this.activeMode === "lobby" && this.lobbyAudio) {
      this._fadeAudio(this.lobbyAudio, flag ? 0 : 0.30, 300);
    } else if (this.activeMode === "game" && this.gameAudio) {
      this._fadeAudio(this.gameAudio, flag ? 0 : (this.paused ? 0.12 : 0.34), 300);
    }
  }

  // Warm Storybook Lobby BGM (Crossfades smoothly from Game BGM!)
  playLobbyBgm() {
    this.unlock();
    this._ensureAudios();
    this.activeMode = "lobby";
    this.paused = false;
    if (this.gameAudio && !this.gameAudio.paused) {
      this._fadeAudio(this.gameAudio, 0, 1400, true);
    }
    if (this.lobbyAudio.paused) {
      this.lobbyAudio.volume = 0.001;
      this.lobbyAudio.play().catch(() => {});
    }
    this._fadeAudio(this.lobbyAudio, 0.30, 1400, false);
  }

  // Upbeat Gameplay BGM (Seamless swell between stages — never abruptly cuts!)
  startBgm(trackIndex = 0) {
    this.unlock();
    this._ensureAudios();
    this.trackIndex = trackIndex;
    this.activeMode = "game";
    this.paused = false;
    if (this.lobbyAudio && !this.lobbyAudio.paused) {
      this._fadeAudio(this.lobbyAudio, 0, 1100, true);
    }
    const baseRate = trackIndex >= 7 ? 1.04 : trackIndex >= 4 ? 1.02 : 1.0;
    this.gameAudio.playbackRate = baseRate;
    const wasPaused = this.gameAudio.paused;
    if (wasPaused) {
      this.gameAudio.volume = 0.001;
      this.gameAudio.play().catch(() => {});
    }
    this._fadeAudio(this.gameAudio, 0.34, wasPaused ? 1200 : 800, false);
  }

  // Gentle Volume Ducking on Stage Clear (keeps musical flow alive into Next Stage!)
  duckForResult() {
    if (!this.gameAudio || this.gameAudio.paused) return;
    this._fadeAudio(this.gameAudio, 0.14, 900, false);
  }

  setPaused(flag) {
    this.paused = flag;
    if (!this.gameAudio || this.activeMode !== "game") return;
    this._fadeAudio(this.gameAudio, flag ? 0.11 : 0.34, 420, false);
  }

  updateSpeed(speedRatio = 0) {
    if (!this.gameAudio || this.paused || this.activeMode !== "game") return;
    const base = this.trackIndex >= 7 ? 1.04 : this.trackIndex >= 4 ? 1.02 : 1.0;
    const targetRate = base + Math.min(0.06, Math.max(0, speedRatio) * 0.06);
    this.gameAudio.playbackRate += (targetRate - this.gameAudio.playbackRate) * 0.08;
  }

  stopBgm() {
    if (this.gameAudio) this._fadeAudio(this.gameAudio, 0, 1000, true);
  }

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

  // Rising Pentatonic Combo Star Chime!
  playStar(combo = 1) {
    const scale = [1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0];
    const root = scale[Math.min(scale.length - 1, Math.max(0, combo - 1))];
    this.bell(root, 0.28, 0.12);
    this.bell(root * 1.25, 0.36, 0.11, 0.045);
    this.bell(root * 1.5, 0.42, 0.09, 0.09);
  }

  playBoost() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.bell(f, 0.24, 0.09, i * 0.032));
  }

  playWarp() {
    this.tone(170, 1500, .38, 'sine', .14);
    this.noiseBurst(.3, .055, 3200, true);
    [659.25, 987.77, 1318.51, 1975.53].forEach((f, i) => this.bell(f, .45, .095, i * .055));
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

  noiseBurst(duration, volume, cutoff, highpass = false) {
    if (!this.ctx || this.muted) return;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 1.6;
    const source = this.ctx.createBufferSource(); source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter(); filter.type = highpass ? 'highpass' : 'lowpass'; filter.frequency.value = cutoff;
    const gain = this.ctx.createGain(); gain.gain.value = volume;
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  playSplash() {
    this.noiseBurst(0.48, 0.32, 1600);
    this.tone(250, 65, 0.22, 'sine', 0.2);
    [660, 880, 540].forEach((f, i) => this.bell(f, 0.12, 0.045, 0.07 + i * 0.045));
  }

  playWoodThud() {
    this.tone(145, 62, 0.18, 'triangle', 0.23);
    this.tone(290, 120, 0.09, 'sine', 0.12);
    this.noiseBurst(0.08, 0.08, 780);
  }

  playLeafRustle() { this.noiseBurst(0.36, 0.16, 2200, true); }

  playCloudFall(starlight = false) {
    this.noiseBurst(0.42, 0.09, 550);
    [880, 660, starlight ? 1320 : 440].forEach((f, i) => this.bell(f, 0.36, 0.065, i * 0.08));
  }

  playCheckpoint() {
    [659.25, 880, 1174.66].forEach((f, i) => this.bell(f, 0.35, 0.1, i * 0.055));
  }

  playSpikeWarning() {
    this.noiseBurst(.12, .07, 3200, true);
    this.tone(880, 1320, .1, 'triangle', .065);
  }

  playSpikeHit() {
    this.noiseBurst(.09, .18, 2400, true);
    this.tone(980, 160, .14, 'sawtooth', .1);
    this.bell(1760, .16, .07);
  }

  playTimePenalty(seconds = 5) {
    this.tone(seconds >= 8 ? 420 : 560, 110, .23, 'triangle', .16);
    this.bell(330, .19, .08, .06);
    this.bell(220, .22, .07, .14);
  }

  playFinish() {
    [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].forEach((f, i) => this.bell(f, 0.55, 0.12, i * 0.065));
  }

  playUrgentTick() {
    this.bell(1318.5, 0.12, 0.08);
  }
}

export const sfx = new MeowAudio();
