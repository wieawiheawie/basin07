export type SoilKind = "dig" | "fill";

export interface Sound {
  setEnabled(on: boolean): void;
  /** Must be called from a user gesture at least once so the browser lets audio start. */
  unlock(): void;
  scoop(kind: SoilKind, size: number, depth: number): void;
  /** A crate hitting the ground; intensity is roughly the impact speed. */
  knock(intensity: number): void;
  grab(): void;
  click(): void;
  setNight(night: boolean): void;
  update(dt: number): void;
}

/** All sound is synthesised here from noise and oscillators, so there are no audio files to ship. */
export function createSound(): Sound {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let white: AudioBuffer;
  let brown: AudioBuffer;
  let enabled = true;
  let night = false;
  let nextCritter = 3;
  let clock = 0;

  function ensure(): AudioContext | null {
    if (ctx) return ctx;
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = enabled ? 0.8 : 0;
    master.connect(ctx.destination);
    const length = ctx.sampleRate * 2;
    white = ctx.createBuffer(1, length, ctx.sampleRate);
    brown = ctx.createBuffer(1, length, ctx.sampleRate);
    const w = white.getChannelData(0);
    const b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const r = Math.random() * 2 - 1;
      w[i] = r;
      last = (last + 0.04 * r) / 1.04;
      b[i] = last * 8;
    }
    startWind(ctx);
    return ctx;
  }

  function startWind(c: AudioContext): void {
    const source = c.createBufferSource();
    source.buffer = brown;
    source.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const gain = c.createGain();
    gain.gain.value = 0.05;
    // A slow swell, like gusts.
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.12;
    const depth = c.createGain();
    depth.gain.value = 0.03;
    lfo.connect(depth).connect(gain.gain);
    source.connect(filter).connect(gain).connect(master);
    source.start();
    lfo.start();
  }

  /** A burst of filtered noise. */
  function burst(type: BiquadFilterType, freq: number, q: number, start: number, length: number, volume: number): void {
    const c = ctx!;
    const source = c.createBufferSource();
    source.buffer = type === "lowpass" ? brown : white;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + Math.min(0.006, length / 4));
    gain.gain.exponentialRampToValueAtTime(0.0008, start + length);
    source.connect(filter).connect(gain).connect(master);
    source.start(start, Math.random() * 1.5, length + 0.02);
  }

  /** A falling sine: the body of a thump. */
  function thump(start: number, from: number, to: number, length: number, volume: number): void {
    const c = ctx!;
    const osc = c.createOscillator();
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + length);
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + length);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }

  function tone(start: number, freq: number, length: number, volume: number, type: OscillatorType = "sine", glide = 1): void {
    const c = ctx!;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(freq * glide, start + length);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + length * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0005, start + length);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }

  return {
    setEnabled(on) {
      enabled = on;
      if (ctx) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.05);
    },
    unlock() {
      const c = ensure();
      if (c && c.state === "suspended") void c.resume();
    },
    scoop(kind, size, depth) {
      const c = enabled ? ensure() : null;
      if (!c) return;
      const t = c.currentTime;
      const s = 0.7 + Math.min(size, 3) * 0.2;
      if (kind === "dig") {
        // Blade biting in: gritty crunch (a few grains), a dull thump, and a clink once it hits stone.
        thump(t, 130, 55, 0.14, 0.3 * s);
        burst("bandpass", 700 + Math.random() * 500, 0.9, t, 0.1, 0.3 * s);
        for (let i = 0; i < 5; i += 1) burst("bandpass", 1500 + Math.random() * 2500, 1.4, t + 0.015 + Math.random() * 0.1, 0.02 + Math.random() * 0.02, 0.1 * s);
        burst("lowpass", 260, 0.7, t, 0.22, 0.4 * s);
        if (depth > 0.55) {
          tone(t + 0.01, 1900 + Math.random() * 900, 0.12, 0.05, "triangle", 0.92);
          burst("highpass", 3500, 0.7, t, 0.03, 0.09);
        }
      } else {
        // Soil poured in: a hiss of falling grains, then a soft landing.
        burst("bandpass", 3200, 0.5, t, 0.26, 0.16 * s);
        for (let i = 0; i < 9; i += 1) burst("bandpass", 1800 + Math.random() * 2600, 1.6, t + Math.random() * 0.24, 0.018, 0.07 * s);
        thump(t + 0.1, 95, 50, 0.16, 0.22 * s);
        burst("lowpass", 340, 0.7, t + 0.08, 0.2, 0.25 * s);
      }
    },
    knock(intensity) {
      const c = enabled ? ensure() : null;
      if (!c) return;
      const t = c.currentTime;
      const v = Math.min(1, intensity / 6);
      thump(t, 150, 60, 0.15, 0.35 * v + 0.05);
      burst("bandpass", 520 + Math.random() * 120, 5, t, 0.09, 0.35 * v + 0.04);
      burst("lowpass", 300, 0.7, t, 0.18, 0.3 * v);
    },
    grab() {
      const c = enabled ? ensure() : null;
      if (!c) return;
      const t = c.currentTime;
      burst("bandpass", 900, 3, t, 0.06, 0.14);
      thump(t, 220, 120, 0.07, 0.1);
    },
    click() {
      const c = enabled ? ensure() : null;
      if (!c) return;
      tone(c.currentTime, 1300, 0.04, 0.05, "triangle", 0.8);
    },
    setNight(value) {
      night = value;
    },
    update(dt) {
      if (!enabled || !ctx || ctx.state !== "running") return;
      clock += dt;
      if (clock < nextCritter) return;
      clock = 0;
      const t = ctx.currentTime;
      if (night) {
        // Crickets: short runs of high pulses.
        nextCritter = 0.8 + Math.random() * 1.6;
        const f = 4200 + Math.random() * 500;
        for (let i = 0; i < 4; i += 1) tone(t + i * 0.055, f, 0.035, 0.012, "sine");
      } else {
        // A small bird: two or three quick rising notes.
        nextCritter = 4 + Math.random() * 8;
        const base = 2400 + Math.random() * 1400;
        const notes = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < notes; i += 1) tone(t + i * 0.13, base * (1 + i * 0.12), 0.1, 0.02, "sine", 1.25);
      }
    }
  };
}
