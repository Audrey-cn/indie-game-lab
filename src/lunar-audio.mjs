import { foleyPcm, foleyRate } from "./lunar-foley.mjs";
import { createLunarMusic, decodeLunarMusic } from "./lunar-music.mjs";
import { createCompanionChirp } from "./lunar-companion-chirp.mjs";

const CUES = {
  launch: [["latch", 0, 0.19, 0.88], ["body", 0.098, 0.14, 0.70]],
  scan: [["latch", 0, 0.14, 0.98], ["body", 0.062, 0.07, 0.80]],
  checkpoint: [["latch", 0, 0.12, 0.86], ["ore", 0.047, 0.055, 1.16]],
  sample: [["ore", 0, 0.18, 0.84], ["latch", 0.126, 0.16, 0.76]],
  return: [["latch", 0, 0.22, 0.77], ["body", 0.17, 0.13, 0.67]],
  warning: [["latch", 0, 0.18, 1.12], ["latch", 0.167, 0.12, 1.06]],
  strike: [["body", 0, 0.42, 0.59], ["ore", 0.053, 0.10, 0.77], ["latch", 0.108, 0.055, 0.70]],
  boost: [["latch", 0, 0.10, 0.86], ["body", 0.045, 0.16, 0.70]],
  won: [["body", 0, 0.32, 0.70], ["latch", 0.135, 0.20, 0.86], ["latch", 0.31, 0.10, 1.02]],
  lost: [["latch", 0, 0.14, 0.73], ["body", 0.085, 0.27, 0.58]],
  land: [["body", 0, 0.34, 0.56], ["latch", 0.068, 0.08, 0.73]],
  oreTap: [["ore", 0, 0.26, 0.71], ["body", 0.028, 0.13, 0.68]],
  surveyStart: [["latch", 0, 0.13, 0.96], ["body", 0.052, 0.075, 0.85]],
  surveyComplete: [["latch", 0, 0.14, 1.02], ["latch", 0.172, 0.12, 0.88]],
  uplink: [["latch", 0.06, 0.095, 0.89], ["ore", 0.43, 0.061, 0.94], ["ore", 0.61, 0.058, 1.13]],
  roughContact: [["body", 0, 0.115, 0.83], ["ore", 0.029, 0.065, 0.71]],
};
const CUE_SHADES = { body: 550, ore: 1210, latch: 1850 };
const LOOP_BLEND_SECONDS = 0.065;
const WHEEL_PANS = [-0.35, -0.31, -0.26, 0.35, 0.31, 0.26];
const REGOLITH_CONTACT_GAIN = 4.6;
const DRILL_GAIN = 1.85;

function bounded(value) { return Math.max(0, Math.min(value, 1)); }

function seededNoise(value) {
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function loadSample(context, encoded) {
  const source = atob(encoded);
  const buffer = context.createBuffer(1, source.length / 2, foleyRate);
  const values = buffer.getChannelData(0);
  for (let index = 0; index < values.length; index++) {
    const lower = source.charCodeAt(index * 2), upper = source.charCodeAt(index * 2 + 1);
    values[index] = ((lower | upper << 8) << 16 >> 16) / 32768;
  }
  return buffer;
}

function closeLoop(data, count) {
  for (let index = 0; index < count; index++) {
    const t = index / (count - 1);
    data[index] = data[data.length - count + index] * (1 - t) + data[index] * t;
  }
}

function bodyResonance(context) {
  const rate = context.sampleRate;
  const signal = context.createBuffer(1, Math.round(rate * 4.9), rate);
  const data = signal.getChannelData(0);
  const random = seededNoise(4987);
  let low = 0, mid = 0, pressure = 0, nextPulse = 0;
  for (let index = 0; index < data.length; index++) {
    const time = index / rate;
    if (time >= nextPulse) {
      pressure += 0.14 + random() * 0.45;
      nextPulse = time + 0.072 + random() * 0.13;
    }
    const white = random() * 2 - 1;
    pressure *= 0.99915;
    low += 0.012 * (white - low);
    mid += 0.043 * (white - mid);
    data[index] = low * 0.92 + mid * (pressure * 0.27 + 0.09);
  }
  closeLoop(data, Math.round(rate * LOOP_BLEND_SECONDS));
  return signal;
}

function motorOrders(context) {
  const rate = context.sampleRate;
  const signal = context.createBuffer(1, Math.round(rate * 4.2), rate);
  const data = signal.getChannelData(0);
  for (let index = 0; index < data.length; index++) {
    const time = index / rate;
    const flutter = 0.13 * Math.sin(time * 5.51) + 0.048 * Math.sin(time * 11.31);
    const load = 0.82 + 0.09 * Math.sin(time * 4.5) + 0.045 * Math.sin(time * 12.7);
    data[index] = load * (0.095 * Math.sin(time * 508.94 + flutter)
      + 0.048 * Math.sin(time * 1017.88 + flutter * 2)
      + 0.019 * Math.sin(time * 1526.81 + flutter * 3));
  }
  closeLoop(data, Math.round(rate * LOOP_BLEND_SECONDS));
  return signal;
}

function grainLoop(context, sample, count, spread, seed) {
  const rate = context.sampleRate;
  const result = context.createBuffer(1, Math.round(rate * 3.7), rate);
  const data = result.getChannelData(0), source = sample.getChannelData(0);
  const random = seededNoise(seed);
  for (let event = 0; event < count; event++) {
    const position = Math.floor(random() * data.length);
    const pace = foleyRate / rate * (0.60 + random() * 0.88);
    const origin = Math.floor(random() * source.length * 0.57);
    const length = Math.floor(rate * (0.026 + random() * spread));
    const gain = 0.17 + random() * 0.28;
    for (let index = 0; index < length; index++) {
      const sourceIndex = origin + index * pace;
      const first = Math.floor(sourceIndex);
      if (first + 1 >= source.length) break;
      const t = sourceIndex - first;
      const value = source[first] * (1 - t) + source[first + 1] * t;
      const envelope = Math.sin(Math.PI * index / length);
      data[(position + index) % data.length] += value * envelope * gain;
    }
  }
  closeLoop(data, Math.round(rate * LOOP_BLEND_SECONDS));
  return result;
}

export function createExpeditionMixer(context, destination = context.destination,
  { effectsEnabled = true, musicEnabled = true, musicBuffer } = {}) {
  const effects = context.createGain();
  effects.gain.value = effectsEnabled ? 0.79 : 0;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -16;
  limiter.knee.value = 10;
  limiter.ratio.value = 3.4;
  limiter.attack.value = 0.006;
  limiter.release.value = 0.16;
  effects.connect(limiter).connect(destination);
  const music = createLunarMusic(context, limiter, musicBuffer);
  music.setEnabled(musicEnabled);
  const samples = Object.fromEntries(Object.entries(foleyPcm).map(([name, pcm]) => [name, loadSample(context, pcm)]));

  function addLoop(buffer, type, frequency, q, pan = 0, offset = 0) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopEnd = buffer.duration - LOOP_BLEND_SECONDS;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const level = context.createGain();
    const stereo = context.createStereoPanner();
    stereo.pan.value = pan;
    level.gain.value = 0;
    source.connect(filter).connect(level).connect(stereo).connect(effects);
    source.start(context.currentTime, offset);
    return { source, filter, level };
  }

  const frame = addLoop(bodyResonance(context), "lowpass", 298, 0.61);
  const motor = addLoop(motorOrders(context), "lowpass", 423, 0.58);
  const tireTexture = grainLoop(context, samples.ore, 172, 0.069, 4161);
  const treads = WHEEL_PANS.map((pan, index) => addLoop(tireTexture, "bandpass", 373, 0.68, pan, index * 0.459));
  const actuator = addLoop(grainLoop(context, samples.latch, 127, 0.095, 2283), "bandpass", 420, 0.64, 0.21);
  const auger = addLoop(grainLoop(context, samples.ore, 247, 0.064, 1979), "bandpass", 739, 0.71, 0.18);
  const cueRandom = seededNoise(14118);
  let lastRoughContact = -Infinity;
  const companionChirps = [];
  let companionVariant = 0;

  function setLevel(level, time = context.currentTime) {
    effects.gain.setTargetAtTime(bounded(level) * 0.79, time, 0.055);
  }

  function drive({ active = false, speed = 0, throttle = 0, slip = 0, grounded = true, boost = false,
    wheels, roughness = 0, scan = false, scanProgress = 0, rapid = false, engaged = scan,
    stowing = false } = {}, time = context.currentTime) {
    const rpm = bounded(Math.abs(speed) / 7.9), load = bounded(Math.abs(throttle));
    const slipAmount = bounded(slip);
    const rough = bounded(roughness);
    const cutting = engaged && scanProgress >= 0.33 && scanProgress < 0.78;
    const drillLoad = cutting ? Math.sin((scanProgress - 0.33) / 0.45 * Math.PI) : 0;
    frame.source.playbackRate.setTargetAtTime(0.72 + rpm * 0.34 + load * 0.13, time, 0.21);
    frame.filter.frequency.setTargetAtTime(191 + rpm * 128 + load * 48 + rough * 92, time, 0.17);
    frame.level.gain.setTargetAtTime(active ? 0.010 + load * 0.088 + rpm * (0.27 + rough * 0.14) : 0, time, 0.135);
    motor.source.playbackRate.setTargetAtTime(0.78 + rpm * 0.76 + load * 0.18 + (boost ? 0.11 : 0), time, 0.14);
    motor.filter.frequency.setTargetAtTime(290 + rpm * 192 + load * 115, time, 0.19);
    motor.level.gain.setTargetAtTime(active ? 0.009 + load * 0.11 + rpm * 0.18 + (boost ? 0.035 : 0) : 0, time, 0.14);

    for (const [index, tread] of treads.entries()) {
      const wheel = wheels?.[index];
      const turn = bounded(Math.abs(wheel?.speed ?? speed) / 7.9);
      const lateral = bounded(wheel?.slip ?? slipAmount);
      const weight = bounded(wheel?.load ?? 0.55);
      const contact = active && grounded && wheel?.grounded !== false;
      const pulse = 1 + 0.075 * Math.sin(time * (6.8 + weight * 5.1) + index * 1.39);
      tread.source.playbackRate.setTargetAtTime(0.64 + turn * 0.62 + index * 0.018, time, 0.14);
      tread.filter.frequency.setTargetAtTime(520 + turn * 340 + lateral * 230 + weight * 70, time, 0.19);
      const rolling = turn * (0.034 + weight * 0.065 + rough * 0.044);
      const scrape = Math.max(turn, rpm * 0.29) * lateral * 0.047;
      tread.level.gain.setTargetAtTime(contact ? (rolling + scrape) * pulse * REGOLITH_CONTACT_GAIN : 0, time, 0.084);
    }

    const servicing = scan || stowing;
    actuator.source.playbackRate.setTargetAtTime(stowing ? 0.79 : rapid ? 1.06 : 0.92, time, 0.15);
    actuator.filter.frequency.setTargetAtTime(stowing ? 392 : 469 + drillLoad * 84, time, 0.11);
    const actuatorLevel = cutting ? 0.041 : stowing ? 0.10 : 0.078;
    actuator.level.gain.setTargetAtTime(active && servicing ? actuatorLevel : 0, time, 0.096);
    auger.source.playbackRate.setTargetAtTime((rapid ? 1.22 : 1.04) - drillLoad * 0.19, time, 0.12);
    auger.filter.frequency.setTargetAtTime(780 - drillLoad * 222, time, 0.12);
    const augerLevel = ((rapid ? 0.17 : 0.12) + drillLoad * 0.15) * DRILL_GAIN;
    auger.level.gain.setTargetAtTime(active && cutting ? augerLevel : 0, time, 0.065);
    music.drive(active, cutting, time, servicing);
  }

  function cue(name, time = context.currentTime, strength = 1) {
    const intensity = Math.sqrt(bounded(strength));
    if (intensity < 0.001) return;
    if (name === "combo") {
      const step = Math.max(0, Math.min(4, Math.round(strength * 4)));
      const notes = [523.25, 587.33, 659.25, 783.99, 1046.5];
      const baseFreq = notes[step];
      for (const [offset, mult, peak] of [[0, 1, 0.14], [0.055, 1.5, 0.11]]) {
        const osc = context.createOscillator();
        const env = context.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(baseFreq * mult, time + offset);
        env.gain.setValueAtTime(0.0001, time + offset);
        env.gain.exponentialRampToValueAtTime(peak, time + offset + 0.014);
        env.gain.exponentialRampToValueAtTime(0.0001, time + offset + 0.24);
        osc.connect(env).connect(effects);
        osc.start(time + offset);
        osc.stop(time + offset + 0.26);
        osc.onended = () => { osc.disconnect(); env.disconnect(); };
      }
      return;
    }
    if (name === "companion") {
      const source = context.createBufferSource();
      const level = context.createGain();
      source.buffer = companionChirps[companionVariant] ??= createCompanionChirp(context, companionVariant);
      companionVariant ^= 1;
      level.gain.value = 0.54 * intensity;
      source.connect(level).connect(effects);
      source.onended = () => {
        source.disconnect();
        level.disconnect();
      };
      source.start(time);
      return;
    }
    if (name === "roughContact") {
      if (time - lastRoughContact < 0.054) return;
      lastRoughContact = time;
    }
    if (name === "strike" || name === "land") music.duck(time, 0.65);
    if (name === "oreTap") music.duck(time, 0.32);
    for (const [part, delay, volume, speed] of CUES[name] ?? []) {
      const at = time + delay + cueRandom() * 0.013;
      const source = context.createBufferSource();
      source.buffer = samples[part];
      const rate = speed * (0.91 + cueRandom() * 0.18);
      source.playbackRate.value = rate;
      const shade = context.createBiquadFilter();
      shade.type = "lowpass";
      shade.frequency.value = CUE_SHADES[part] * (0.88 + 0.24 * cueRandom());
      shade.Q.value = 0.44 + cueRandom() * 0.17;
      const gain = context.createGain();
      const pan = context.createStereoPanner();
      pan.pan.value = (cueRandom() * 2 - 1) * (part === "body" ? 0.11 : 0.22);
      const amplitude = volume * intensity * (0.89 + cueRandom() * 0.22);
      const attack = 0.002 + cueRandom() * (part === "body" ? 0.013 : 0.007);
      const offset = cueRandom() * 0.008;
      const sustain = (source.buffer.duration - offset) / rate;
      const end = at + sustain * (0.68 + cueRandom() * 0.26);
      const tail = name === "roughContact" ? 0.48 : 0.76;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(amplitude, at + attack);
      gain.gain.setValueAtTime(amplitude * tail, at + Math.max(attack + 0.020, (end - at) * 0.35));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      source.connect(shade).connect(gain).connect(pan).connect(effects);
      source.start(at, offset);
      source.stop(end + 0.003);
    }
  }
  return { drive, cue, setLevel, setMusicEnabled: music.setEnabled };
}

export function createExpeditionAudio() {
  let context = null;
  let mixer = null;
  let enabled = true;
  let musicEnabled = true;
  async function unlock() {
    const AudioEngine = window.AudioContext ?? window.webkitAudioContext;
    if ((!enabled && !musicEnabled) || !AudioEngine) return false;
    try {
      if (!context) {
        context = new AudioEngine();
        mixer = createExpeditionMixer(context, context.destination, { effectsEnabled: enabled, musicEnabled });
      }
      if (context.state === "suspended") await context.resume();
      return context.state === "running";
    } catch {
      return false;
    }
  }
  function setEnabled(value) {
    enabled = Boolean(value);
    mixer?.setLevel(enabled ? 1 : 0);
    if (enabled) void unlock();
  }
  function setMusicEnabled(value) {
    musicEnabled = Boolean(value);
    mixer?.setMusicEnabled(musicEnabled);
    if (musicEnabled) void unlock();
  }
  return {
    unlock, setEnabled, setMusicEnabled,
    drive: state => mixer?.drive(state),
    cue: (name, strength = 1) => {
      if (enabled && context?.state === "running") mixer.cue(name, context.currentTime, strength);
    },
    get running() { return enabled && context?.state === "running"; },
  };
}

export async function renderExpeditionAudio(frames, fps) {
  const sampleRate = 48_000;
  const length = Math.ceil(frames.length / fps * sampleRate);
  const context = new OfflineAudioContext(2, length, sampleRate);
  let effectsEnabled = frames[0]?.soundEnabled !== false;
  let musicEnabled = frames[0]?.musicEnabled !== false;
  const musicBuffer = frames.some(frame => frame.active && frame.musicEnabled !== false)
    ? await decodeLunarMusic(context) : null;
  const mixer = createExpeditionMixer(context, context.destination, { effectsEnabled, musicEnabled, musicBuffer });
  for (const [index, frame] of frames.entries()) {
    const at = index / fps;
    if (typeof frame.soundEnabled === "boolean" && frame.soundEnabled !== effectsEnabled) {
      effectsEnabled = frame.soundEnabled;
      mixer.setLevel(effectsEnabled ? 1 : 0, at);
    }
    if (typeof frame.musicEnabled === "boolean" && frame.musicEnabled !== musicEnabled) {
      musicEnabled = frame.musicEnabled;
      mixer.setMusicEnabled(musicEnabled, at);
    }
    if (index % 2 === 0) mixer.drive(frame, at);
    if (effectsEnabled) {
      for (const cue of frame.cues ?? []) {
        if (typeof cue === "string") mixer.cue(cue, at);
        else if (cue) mixer.cue(cue.name ?? cue.type, at, cue.strength);
      }
    }
  }
  const buffer = await context.startRendering();
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
  const wav = new Uint8Array(44 + length * 4);
  const view = new DataView(wav.buffer);
  const label = (offset, value) => wav.set(new TextEncoder().encode(value), offset);
  label(0, "RIFF");
  view.setUint32(4, wav.length - 8, true);
  label(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  label(36, "data");
  view.setUint32(40, length * 4, true);
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < 2; channel++) {
      const value = Math.max(-1, Math.min(1, channels[channel][i]));
      view.setInt16(44 + i * 4 + channel * 2, Math.round(value * 32767), true);
    }
  }
  let bytes = "";
  for (let offset = 0; offset < wav.length; offset += 8192) {
    bytes += String.fromCharCode(...wav.subarray(offset, offset + 8192));
  }
  return btoa(bytes);
}
