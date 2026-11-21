const DURATION = 0.31;
const TURN = 2 * Math.PI;
const CONTACTS = [[0.004, 0.155], [0.27, 0.061]];

const PATTERNS = [
  [[0.032, 0.078, 465, 378, 0.29], [0.126, 0.126, 545, 423, 0.35]],
  [[0.027, 0.091, 425, 348, 0.27], [0.139, 0.118, 494, 371, 0.34]],
];

export function createCompanionChirp(context, variant = 0) {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.round(rate * DURATION), rate);
  const data = buffer.getChannelData(0);
  let seed = 23591 + (variant & 1) * 1129;
  let bright = 0;
  let body = 0;
  const brightRate = 1 - Math.exp(-TURN * 1920 / rate);
  const bodyRate = 1 - Math.exp(-TURN * 330 / rate);
  const pulses = PATTERNS[variant & 1].map(description => ({ description, phase: 0 }));

  for (let index = 0; index < data.length; index++) {
    const time = index / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    bright += (noise - bright) * brightRate;
    body += (noise - body) * bodyRate;
    const grain = bright - body;
    let sample = 0;

    // The contacts use a soft noise transient and a brief enclosure resonance.
    for (const [trigger, strength] of CONTACTS) {
      const age = time - trigger;
      if (age < 0 || age > 0.026) continue;
      const touch = Math.sin(Math.PI * (age / 0.026)) * Math.exp(-age * 180);
      sample += strength * touch * (0.68 * grain + 0.52 * Math.sin(TURN * (890 * age - 4200 * age * age)));
    }

    for (const pulse of pulses) {
      const [start, length, pitch, tail, strength] = pulse.description;
      const age = time - start;
      if (age < 0 || age >= length) continue;
      const position = age / length;
      const attack = Math.min(1, age / 0.013);
      const envelope = attack * attack * (1 - position) ** 1.24;
      const frequency = tail + (pitch - tail) * (1 - position) ** 1.55 + 15 * Math.sin(7.3 * position) + grain * 20;
      pulse.phase += TURN * frequency / rate;
      const angle = pulse.phase;
      const bell = Math.sin(angle) + 0.20 * Math.sin(2.015 * angle + 0.31)
        + 0.082 * Math.sin(2.87 * angle + 0.48) + 0.17 * grain;
      const ripple = 0.95 + 0.05 * Math.sin(TURN * 64 * age);
      sample += strength * envelope * bell * ripple;
    }

    data[index] = sample;
  }
  return buffer;
}
