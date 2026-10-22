/*
 * Ludora's instruments, synthesised with the Web Audio API: no recordings, so
 * every sound is our own. Each voice schedules its notes at time `t` on any
 * audio context (a live one, or an OfflineAudioContext when rendering a
 * preview) and connects to the node it is given.
 */

/** Frequency of a MIDI note: 69 is A4 at 440 Hz. */
export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Where a voice plays: the dry bus, and optionally a reverb send. */
export interface Out {
  dry: AudioNode;
  wet?: AudioNode | undefined;
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of white noise, made once per context. */
function noise(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // A fixed linear congruential sequence: the same noise every time, so renders repeat exactly.
    let seed = 22_222;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      data[i] = (seed / 1_073_741_824 - 1) * 0.9;
    }
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

/** A gain node that rises to `peak` and then decays exponentially to silence over `decay` seconds. */
function envelope(ctx: BaseAudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function send(ctx: BaseAudioContext, node: AudioNode, out: Out, wet: number) {
  node.connect(out.dry);
  if (out.wet && wet > 0) {
    const s = ctx.createGain();
    s.gain.value = wet;
    node.connect(s);
    s.connect(out.wet);
  }
}

/** A warm plucked tone, between a kalimba and a marimba. */
export function pluck(ctx: BaseAudioContext, out: Out, t: number, midi: number, o: { gain?: number; decay?: number; wet?: number; bright?: number } = {}) {
  const f = hz(midi);
  const decay = o.decay ?? 0.7;
  const amp = envelope(ctx, t, o.gain ?? 0.2, 0.004, decay);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(12_000, f * (o.bright ?? 6)), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), t + decay);
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.value = f;
  const overtone = ctx.createOscillator();
  overtone.type = 'triangle';
  overtone.frequency.value = f * 2.001;
  const overtoneGain = ctx.createGain();
  overtoneGain.gain.value = 0.35;
  body.connect(lp);
  overtone.connect(overtoneGain).connect(lp);
  lp.connect(amp);
  send(ctx, amp, out, o.wet ?? 0.25);
  const end = t + decay + 0.05;
  body.start(t);
  overtone.start(t);
  body.stop(end);
  overtone.stop(end);
  return decay;
}

/** A small bell: frequency modulation with a ratio that gives a glassy, lantern-chime colour. */
export function bell(ctx: BaseAudioContext, out: Out, t: number, midi: number, o: { gain?: number; decay?: number; wet?: number } = {}) {
  const f = hz(midi);
  const decay = o.decay ?? 1.4;
  const amp = envelope(ctx, t, o.gain ?? 0.12, 0.003, decay);
  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = f * 3.5;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(f * 1.6, t);
  depth.gain.exponentialRampToValueAtTime(1, t + decay * 0.8);
  mod.connect(depth).connect(carrier.frequency);
  carrier.connect(amp);
  send(ctx, amp, out, o.wet ?? 0.45);
  const end = t + decay + 0.05;
  carrier.start(t);
  mod.start(t);
  carrier.stop(end);
  mod.stop(end);
  return decay;
}

/** A soft chord pad: two slightly detuned saws per note through a gentle low-pass filter. */
export function pad(ctx: BaseAudioContext, out: Out, t: number, notes: number[], dur: number, o: { gain?: number; wet?: number; cutoff?: number } = {}) {
  const amp = ctx.createGain();
  const peak = (o.gain ?? 0.08) / Math.max(1, notes.length / 2);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(peak, t + Math.min(0.4, dur * 0.3));
  amp.gain.setValueAtTime(peak, t + Math.max(0.05, dur - 0.35));
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = o.cutoff ?? 1100;
  lp.Q.value = 0.4;
  lp.connect(amp);
  send(ctx, amp, out, o.wet ?? 0.5);
  const end = t + dur + 0.3;
  for (const n of notes) {
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz(n);
      osc.detune.value = detune;
      osc.connect(lp);
      osc.start(t);
      osc.stop(end);
    }
  }
  return dur;
}

/** A round bass note. */
export function bass(ctx: BaseAudioContext, out: Out, t: number, midi: number, dur: number, o: { gain?: number } = {}) {
  const amp = ctx.createGain();
  const peak = o.gain ?? 0.22;
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(peak, t + 0.01);
  amp.gain.exponentialRampToValueAtTime(peak * 0.5, t + dur * 0.6);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = hz(midi);
  const edge = ctx.createOscillator();
  edge.type = 'triangle';
  edge.frequency.value = hz(midi + 12);
  const edgeGain = ctx.createGain();
  edgeGain.gain.value = 0.3;
  sub.connect(lp);
  edge.connect(edgeGain).connect(lp);
  lp.connect(amp);
  amp.connect(out.dry);
  const end = t + dur + 0.1;
  sub.start(t);
  edge.start(t);
  sub.stop(end);
  edge.stop(end);
  return dur;
}

/** A soft kick: a sine that drops in pitch. */
export function kick(ctx: BaseAudioContext, out: Out, t: number, o: { gain?: number } = {}) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(48, t + 0.12);
  const amp = envelope(ctx, t, o.gain ?? 0.3, 0.003, 0.22);
  osc.connect(amp);
  amp.connect(out.dry);
  osc.start(t);
  osc.stop(t + 0.3);
  return 0.22;
}

/** Filtered noise: shakers, clicks and whooshes. A `sweep` moves the filter from `freq` to `sweep` over the hit. */
export function noiseHit(
  ctx: BaseAudioContext,
  out: Out,
  t: number,
  o: { dur?: number; freq?: number; sweep?: number; q?: number; gain?: number; type?: BiquadFilterType; attack?: number; wet?: number } = {},
) {
  const dur = o.dur ?? 0.05;
  const attack = o.attack ?? 0.002;
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = o.type ?? 'bandpass';
  filter.frequency.setValueAtTime(o.freq ?? 6000, t);
  if (o.sweep) filter.frequency.exponentialRampToValueAtTime(o.sweep, t + attack + dur);
  filter.Q.value = o.q ?? 1;
  const amp = envelope(ctx, t, o.gain ?? 0.05, attack, dur);
  src.connect(filter).connect(amp);
  send(ctx, amp, out, o.wet ?? 0);
  // Start somewhere different in the buffer each time, so repeated hits do not sound identical.
  src.start(t, (t * 7.31) % 1.5, attack + dur + 0.02);
  return attack + dur;
}

/** A short sine glide, for taps and pops. */
export function blip(ctx: BaseAudioContext, out: Out, t: number, from: number, to: number, o: { dur?: number; gain?: number; type?: OscillatorType; wet?: number } = {}) {
  const dur = o.dur ?? 0.06;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  const amp = envelope(ctx, t, o.gain ?? 0.12, 0.003, dur);
  osc.connect(amp);
  send(ctx, amp, out, o.wet ?? 0);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  return dur;
}

/**
 * A small room for the reverb send: a convolver fed a generated, exponentially
 * decaying stereo impulse, so no impulse recording is needed.
 */
export function makeReverb(ctx: BaseAudioContext, seconds = 1.8): ConvolverNode {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, len, rate);
  let seed = 7_777;
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      const white = seed / 1_073_741_824 - 1;
      data[i] = white * (1 - i / len) ** 2.6;
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = impulse;
  return conv;
}
