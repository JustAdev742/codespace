import type { Rarity } from '@ludora/shared';
import { bass, bell, blip, kick, noiseHit, pad, pluck, type Out } from './synth.ts';

/*
 * The synthesised versions of the game's sound effects, built from the
 * instruments in synth.ts. The recorded effects (tools/audio) replace them as
 * soon as their files have loaded; until then these play, so each one follows
 * its recording's shape: the same notes at the same moments, a transient where
 * the recording has one (a knock, a crack, a click), a body (plucks, keys,
 * brass) and a sparkle of bells on top, placed across the stereo field, and
 * it plays about as loud as its recording (LEVEL, below), so the switch is not
 * a jump. They are kept light: a handful of oscillators for the small sounds,
 * a few dozen for the biggest moments.
 *
 * Most sit in D major pentatonic, the same scale as the recordings, so effects
 * that overlap each other stay in tune. Each one schedules its notes from time
 * `t` and returns how long it lasts, in seconds.
 */

export type SfxOptions = { n?: number; seconds?: number; rarity?: Rarity };
type Effect = (ctx: BaseAudioContext, out: Out, t: number, o: SfxOptions) => number;

/** D major pentatonic from A4 up: the notes a run of joins steps through. */
const SPARKLE = [69, 71, 74, 76, 78, 81, 83, 86];
/** Board steps walk up it from D5. */
const STEPS = [74, 76, 78, 81, 83, 86];
/** High pentatonic notes for sparkles: D7 to E8. */
const GLINTS = [98, 100, 102, 105, 107, 110, 112];

/** The same voice placed left (-1) or right (1). The reverb send stays centred. */
function at(ctx: BaseAudioContext, out: Out, pan: number): Out {
  if (!pan || typeof ctx.createStereoPanner !== 'function') return out;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(out.dry);
  return { dry: p, wet: out.wet };
}

/** Bright little bell pings scattered over `dur` seconds, left and right; the same pattern every time. */
function sparkle(ctx: BaseAudioContext, out: Out, t: number, dur: number, count: number, gain = 0.03) {
  for (let i = 0; i < count; i++) {
    const when = t + dur * 0.85 * ((i * 0.618) % 1) ** 1.2;
    bell(ctx, at(ctx, out, ((i * 0.37) % 1) * 1.4 - 0.7), when, GLINTS[(i * 3) % GLINTS.length]!, { gain: gain * (1 - (0.4 * i) / count), decay: 0.22, wet: 0.5 });
  }
  return dur;
}

/** A low hit that small speakers still play: a falling sine and its octave, gone in a moment. */
function thump(ctx: BaseAudioContext, out: Out, t: number, freq: number, gain: number, dur = 0.16) {
  blip(ctx, out, t, freq * 1.8, freq, { dur, gain, type: 'sine' });
  return blip(ctx, out, t, freq * 3.6, freq * 2, { dur: dur * 0.6, gain: gain * 0.45, type: 'triangle' });
}

/** A woody knock: a short triangle tock with a click on top. */
function knock(ctx: BaseAudioContext, out: Out, t: number, freq: number, gain: number) {
  noiseHit(ctx, out, t, { dur: 0.01, freq: 5000, q: 1.2, gain: gain * 0.5 });
  return blip(ctx, out, t, freq * 1.06, freq, { dur: 0.035, gain, type: 'triangle' });
}

/** A drum's crack: band-passed noise over a short falling tone. */
function crack(ctx: BaseAudioContext, out: Out, t: number, gain: number, dur = 0.12) {
  blip(ctx, out, t, 260, 185, { dur: 0.07, gain: gain * 0.8, type: 'triangle' });
  return noiseHit(ctx, out, t, { dur, freq: 3200, q: 0.6, gain, wet: 0.2 });
}

/** A roll of soft hits from `start` to `end`, growing from gain g0 to g1. */
function roll(ctx: BaseAudioContext, out: Out, start: number, end: number, step: number, g0: number, g1: number, freq = 2400) {
  const count = Math.max(1, Math.round((end - start) / step));
  for (let i = 0; i < count; i++) noiseHit(ctx, out, start + i * step, { dur: 0.05, freq, q: 0.8, gain: g0 + ((g1 - g0) * i) / Math.max(1, count - 1) });
  return end - start;
}

/** Synth brass: detuned saws whose filter blooms open on the hit, then closes as the chord holds. */
function brass(ctx: BaseAudioContext, out: Out, t: number, notes: number[], dur: number, gain = 0.1) {
  const amp = ctx.createGain();
  const peak = gain / Math.max(1, notes.length / 2);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(peak, t + 0.015);
  amp.gain.setValueAtTime(peak * 0.75, t + Math.max(0.03, dur - 0.05));
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.8;
  lp.frequency.setValueAtTime(700, t);
  lp.frequency.exponentialRampToValueAtTime(3200, t + 0.04);
  lp.frequency.exponentialRampToValueAtTime(1300, t + 0.4);
  lp.connect(amp);
  amp.connect(out.dry);
  if (out.wet) {
    const s = ctx.createGain();
    s.gain.value = 0.35;
    amp.connect(s).connect(out.wet);
  }
  const end = t + dur + 0.25;
  for (const n of notes) {
    for (const detune of [-8, 8]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 440 * 2 ** ((n - 69) / 12);
      osc.detune.value = detune;
      osc.connect(lp);
      osc.start(t);
      osc.stop(end);
    }
  }
  return dur;
}

/** A rising tone for build-ups: a triangle sweep that swells, then lets go. */
function riser(ctx: BaseAudioContext, out: Out, t: number, from: number, to: number, dur: number, gain: number) {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + dur * 0.9);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
  osc.connect(amp);
  amp.connect(out.dry);
  if (out.wet) {
    const s = ctx.createGain();
    s.gain.value = 0.3;
    amp.connect(s);
    s.connect(out.wet);
  }
  osc.start(t);
  osc.stop(t + dur + 0.2);
  return dur;
}

function arpeggio(ctx: BaseAudioContext, out: Out, t: number, notes: number[], step: number, gain: number, decay = 0.6) {
  notes.forEach((n, i) => pluck(ctx, out, t + i * step, n, { gain, decay }));
  return (notes.length - 1) * step + decay;
}

function bells(ctx: BaseAudioContext, out: Out, t: number, notes: number[], step: number, gain: number, decay = 0.9) {
  notes.forEach((n, i) => bell(ctx, out, t + i * step, n, { gain, decay }));
  return (notes.length - 1) * step + decay;
}

/** The Glim appears, by rarity: each step up adds layers and lasts a little longer. */
function lanternReveal(ctx: BaseAudioContext, out: Out, t: number, r: Rarity) {
  const L = at(ctx, out, -0.35);
  const R = at(ctx, out, 0.35);
  if (r === 'common') {
    arpeggio(ctx, L, t, [78, 81, 86], 0.06, 0.09, 0.4);
    bells(ctx, R, t, [78, 81, 86], 0.06, 0.07, 0.8);
    return 0.12 + sparkle(ctx, out, t + 0.12, 0.5, 3, 0.02);
  }
  if (r === 'uncommon') {
    pad(ctx, out, t, [62, 69, 74], 0.6, { gain: 0.05, cutoff: 1400 });
    arpeggio(ctx, L, t, [74, 78, 81, 86], 0.06, 0.1, 0.45);
    bells(ctx, R, t, [86, 90, 93], 0.06, 0.06, 0.6);
    bell(ctx, R, t + 0.18, 98, { gain: 0.07, decay: 1 });
    return 0.18 + sparkle(ctx, out, t + 0.18, 0.7, 5, 0.025);
  }
  if (r === 'rare') {
    pad(ctx, out, t, [62, 69, 74, 76, 78], 1, { gain: 0.08, cutoff: 1600 });
    bass(ctx, out, t, 50, 0.8, { gain: 0.1 });
    arpeggio(ctx, L, t, [74, 78, 81, 86, 88], 0.06, 0.11, 0.5);
    bells(ctx, R, t + 0.05, [86, 90, 93, 98], 0.07, 0.07, 0.8);
    bell(ctx, out, t + 0.28, 86, { gain: 0.08, decay: 1.2 });
    return 0.3 + sparkle(ctx, out, t + 0.2, 1, 8, 0.03);
  }
  if (r === 'epic') {
    kick(ctx, out, t, { gain: 0.14 });
    pad(ctx, out, t, [62, 69, 74, 78], 1.3, { gain: 0.11, cutoff: 2000 });
    brass(ctx, out, t, [62, 69, 74], 0.8, 0.07);
    bass(ctx, out, t, 50, 1, { gain: 0.09 });
    arpeggio(ctx, L, t, [74, 76, 78, 81, 83, 86, 88], 0.03, 0.1, 0.5);
    bells(ctx, R, t + 0.2, [105, 102, 98, 95, 93], 0.06, 0.06, 0.7);
    return 0.3 + sparkle(ctx, out, t + 0.2, 1.2, 10, 0.03);
  }
  // Legendary and mythic: a brass fanfare on a drum hit, a cascade of bells and a shower of sparkles.
  const mythic = r === 'mythic';
  const hit = t + (mythic ? 0.36 : 0.3);
  const pickup = mythic ? [74, 78, 81] : [74, 81];
  pickup.forEach((n, i) => brass(ctx, out, t + i * 0.12, [n], 0.1, 0.09));
  roll(ctx, out, t, hit - 0.02, mythic ? 0.045 : 0.056, 0.02, 0.07);
  kick(ctx, out, hit, { gain: 0.24 });
  crack(ctx, out, hit, 0.08, 0.3);
  noiseHit(ctx, out, hit, { dur: 0.9, freq: 7000, q: 0.5, gain: 0.07, wet: 0.4 });
  brass(ctx, out, hit, mythic ? [62, 66, 69, 74] : [62, 69, 74, 78], mythic ? 1.7 : 1.2, 0.14);
  pad(ctx, out, hit, mythic ? [50, 57, 62, 66, 69] : [62, 69, 74, 78], mythic ? 1.9 : 1.2, { gain: 0.09, cutoff: 2200 });
  bass(ctx, out, hit, 38, 1.2, { gain: 0.11 });
  const cascade = mythic ? [110, 105, 102, 100, 98, 93, 90, 86] : [98, 102, 105, 98, 93];
  bells(ctx, R, hit + 0.04, cascade, 0.06, 0.06, 1);
  if (mythic) bells(ctx, L, hit, [74, 81, 86], 0.14, 0.08, 1.4);
  arpeggio(ctx, L, hit, [74, 78, 81, 86], 0.04, 0.09, 0.5);
  sparkle(ctx, out, hit, mythic ? 2.2 : 1.5, mythic ? 10 : 8, 0.035);
  return hit - t + (mythic ? 2.4 : 1.5);
}

const VOICES = {
  /** Picking an answer that is not sent yet (select-all, matching): a mallet tick on E with a glint. */
  select: (ctx, out, t) => {
    noiseHit(ctx, out, t, { dur: 0.012, freq: 5000, q: 1, gain: 0.03 });
    pluck(ctx, at(ctx, out, 0.3), t, 76, { gain: 0.08, decay: 0.18, wet: 0.1 });
    bell(ctx, at(ctx, out, 0.45), t, 100, { gain: 0.025, decay: 0.2, wet: 0.2 });
    return pluck(ctx, at(ctx, out, -0.2), t, 88, { gain: 0.1, decay: 0.22, wet: 0.1 });
  },

  /** A light tap on a button: a small wooden knock with a little body under it. */
  tap: (ctx, out, t) => {
    thump(ctx, out, t, 330, 0.05, 0.05);
    noiseHit(ctx, at(ctx, out, -0.3), t, { dur: 0.012, freq: 7000, q: 1, gain: 0.03 });
    return knock(ctx, at(ctx, out, 0.1), t, 1350, 0.12);
  },

  /** The answer went in: two mallet notes rising a fourth, a bell on the second. */
  lockIn: (ctx, out, t) => {
    noiseHit(ctx, at(ctx, out, -0.2), t, { dur: 0.03, freq: 6000, q: 1, gain: 0.02 });
    pluck(ctx, at(ctx, out, -0.25), t, 76, { gain: 0.13, decay: 0.35 });
    pluck(ctx, at(ctx, out, 0.35), t + 0.075, 69, { gain: 0.06, decay: 0.4 });
    knock(ctx, out, t + 0.075, 1800, 0.04);
    bell(ctx, at(ctx, out, 0.4), t + 0.078, 93, { gain: 0.05, decay: 0.45 });
    return 0.075 + pluck(ctx, at(ctx, out, -0.25), t + 0.075, 81, { gain: 0.14, decay: 0.55 });
  },

  /** Right: plucks and bells rising together, landing on a high D over warm keys and a sparkle. */
  correct: (ctx, out, t) => {
    noiseHit(ctx, out, t, { dur: 0.04, freq: 7000, q: 0.8, gain: 0.02 });
    arpeggio(ctx, at(ctx, out, -0.3), t, [74, 78, 81], 0.06, 0.13, 0.5);
    bells(ctx, at(ctx, out, 0.3), t, [86, 90, 93], 0.06, 0.05, 0.4);
    pad(ctx, out, t + 0.18, [62, 69, 74], 0.6, { gain: 0.06, cutoff: 1500 });
    bell(ctx, at(ctx, out, 0.3), t + 0.18, 98, { gain: 0.1, decay: 1.1 });
    return 0.18 + sparkle(ctx, out, t + 0.18, 0.8, 6, 0.025);
  },

  /** Incorrect: two soft, falling notes over a warm low D. Gentle, never a buzzer. */
  wrong: (ctx, out, t) => {
    noiseHit(ctx, out, t, { dur: 0.25, attack: 0.08, freq: 3200, sweep: 800, q: 0.9, gain: 0.015, wet: 0.2 });
    pluck(ctx, at(ctx, out, -0.3), t, 69, { gain: 0.15, decay: 0.26, bright: 3, wet: 0.15 });
    bass(ctx, out, t + 0.17, 50, 0.32, { gain: 0.045 });
    pluck(ctx, at(ctx, out, 0.4), t + 0.17, 65, { gain: 0.06, decay: 0.4, bright: 4 });
    return 0.17 + pluck(ctx, at(ctx, out, -0.3), t + 0.17, 65, { gain: 0.15, decay: 0.5, bright: 2.5, wet: 0.15 });
  },

  /** A clock tick for the last seconds of a question: a woody tock with a hat on top. */
  tick: (ctx, out, t) => {
    thump(ctx, out, t, 392, 0.05, 0.04);
    noiseHit(ctx, at(ctx, out, 0.35), t, { dur: 0.02, freq: 8000, q: 0.8, gain: 0.04 });
    return knock(ctx, out, t, 1050, 0.13);
  },

  /** The very last tick: a brighter knock, and a little bell on E. */
  tickFinal: (ctx, out, t) => {
    noiseHit(ctx, at(ctx, out, 0.3), t, { dur: 0.03, freq: 8000, q: 0.8, gain: 0.04 });
    knock(ctx, out, t, 1500, 0.14);
    pluck(ctx, at(ctx, out, -0.25), t, 76, { gain: 0.05, decay: 0.25 });
    bell(ctx, at(ctx, out, 0.3), t, 100, { gain: 0.04, decay: 0.3 });
    return bell(ctx, at(ctx, out, 0.3), t, 88, { gain: 0.08, decay: 0.35 });
  },

  /** Time is up: a big lantern bell on A with a soft thud, and a falling whoosh. */
  timeUp: (ctx, out, t) => {
    thump(ctx, out, t, 220, 0.12, 0.3);
    noiseHit(ctx, out, t, { dur: 0.8, freq: 3000, sweep: 400, q: 0.9, gain: 0.03, wet: 0.3 });
    noiseHit(ctx, at(ctx, out, -0.2), t, { dur: 0.5, freq: 8000, q: 0.5, gain: 0.025, wet: 0.4 });
    pluck(ctx, at(ctx, out, -0.25), t, 64, { gain: 0.07, decay: 0.7 });
    pluck(ctx, at(ctx, out, -0.25), t, 69, { gain: 0.07, decay: 0.7 });
    bell(ctx, at(ctx, out, 0.2), t, 76, { gain: 0.08, decay: 1.3 });
    bell(ctx, at(ctx, out, 0.2), t, 81, { gain: 0.06, decay: 1.2 });
    return bell(ctx, at(ctx, out, 0.2), t, 69, { gain: 0.11, decay: 1.4 });
  },

  /** A new question: a rising whoosh that lands on two notes, bell and pluck. */
  question: (ctx, out, t) => {
    noiseHit(ctx, out, t, { dur: 0.06, attack: 0.26, freq: 500, sweep: 6000, q: 1.4, gain: 0.04, wet: 0.2 });
    bell(ctx, at(ctx, out, -0.2), t + 0.28, 81, { gain: 0.07, decay: 0.5 });
    pluck(ctx, at(ctx, out, 0.3), t + 0.28, 93, { gain: 0.04, decay: 0.35 });
    pluck(ctx, at(ctx, out, 0.3), t + 0.36, 98, { gain: 0.04, decay: 0.5 });
    sparkle(ctx, out, t + 0.36, 0.5, 3, 0.02);
    return 0.36 + bell(ctx, at(ctx, out, -0.2), t + 0.36, 86, { gain: 0.08, decay: 0.7 });
  },

  /** The answer is shown on the big screen: a pluck glissando across the field, bells and warm keys. */
  reveal: (ctx, out, t) => {
    arpeggio(ctx, at(ctx, out, -0.35), t, [74, 76, 78], 0.03, 0.09, 0.45);
    arpeggio(ctx, at(ctx, out, 0.3), t + 0.09, [81, 83, 86], 0.03, 0.1, 0.55);
    pad(ctx, out, t + 0.18, [62, 66, 69, 74], 0.8, { gain: 0.06, cutoff: 1500 });
    bass(ctx, out, t + 0.18, 50, 0.5, { gain: 0.08 });
    bell(ctx, at(ctx, out, 0.25), t + 0.18, 93, { gain: 0.06, decay: 0.8 });
    sparkle(ctx, out, t + 0.1, 0.8, 6, 0.025);
    return 0.2 + bell(ctx, at(ctx, out, 0.25), t + 0.2, 98, { gain: 0.08, decay: 1 });
  },

  /** Someone joined the lobby. `n` climbs the scale (and walks left to right), so a crowd arriving plays a little tune. */
  join: (ctx, out, t, o) => {
    const i = (((o.n ?? 0) % SPARKLE.length) + SPARKLE.length) % SPARKLE.length;
    const note = SPARKLE[i]!;
    const pan = -0.3 + (0.6 * i) / (SPARKLE.length - 1);
    blip(ctx, at(ctx, out, pan), t, 700 + i * 40, (700 + i * 40) * 2.2, { dur: 0.05, gain: 0.04 });
    pluck(ctx, at(ctx, out, Math.min(0.6, pan + 0.45)), t + 0.01, i >= 5 ? note : note + 12, { gain: 0.06, decay: 0.3 });
    bell(ctx, at(ctx, out, Math.max(-0.6, pan - 0.45)), t + 0.012, note + 12, { gain: 0.04, decay: 0.35 });
    if (i >= 5) pluck(ctx, out, t + 0.01, note - 12, { gain: 0.06, decay: 0.3, bright: 3 });
    return 0.01 + pluck(ctx, at(ctx, out, pan), t + 0.01, note, { gain: 0.11, decay: 0.45 });
  },

  /** A reaction floated up on the big screen: a bubble pop with a tiny mallet note and a sparkle. */
  reaction: (ctx, out, t, o) => {
    const i = (((o.n ?? 0) % 4) + 4) % 4;
    const f = 520 + i * 70;
    noiseHit(ctx, out, t, { dur: 0.02, freq: 6000, q: 0.8, gain: 0.025 });
    pluck(ctx, at(ctx, out, 0.3), t + 0.006, [86, 88, 90, 93][i]!, { gain: 0.04, decay: 0.15 });
    bell(ctx, at(ctx, out, -0.4), t + 0.03, GLINTS[i + 1]!, { gain: 0.025, decay: 0.15 });
    return blip(ctx, at(ctx, out, -0.15), t, f, f * 2.2, { dur: 0.07, gain: 0.1, wet: 0.15 });
  },

  /** Moved up the leaderboard: A to D in mallet, bell and pluck, with a shaker and a sparkle. */
  rankUp: (ctx, out, t) => {
    noiseHit(ctx, out, t, { dur: 0.03, freq: 7000, q: 0.8, gain: 0.02 });
    noiseHit(ctx, out, t + 0.07, { dur: 0.03, freq: 7000, q: 0.8, gain: 0.025 });
    pluck(ctx, at(ctx, out, -0.1), t, 81, { gain: 0.11, decay: 0.35 });
    pluck(ctx, at(ctx, out, -0.4), t, 69, { gain: 0.06, decay: 0.3 });
    pluck(ctx, at(ctx, out, -0.4), t + 0.07, 74, { gain: 0.06, decay: 0.4 });
    bell(ctx, at(ctx, out, 0.4), t, 93, { gain: 0.04, decay: 0.3 });
    bell(ctx, at(ctx, out, 0.4), t + 0.073, 98, { gain: 0.05, decay: 0.5 });
    sparkle(ctx, out, t + 0.07, 0.6, 4, 0.02);
    return 0.07 + pluck(ctx, at(ctx, out, -0.1), t + 0.07, 86, { gain: 0.12, decay: 0.5 });
  },

  /** The game is over: a snare roll and a brass pickup into a big G chord, bells and a sparkle shower. */
  fanfare: (ctx, out, t) => {
    const hit = t + 0.5;
    roll(ctx, out, t, hit - 0.02, 0.06, 0.015, 0.06);
    [62, 67, 71].forEach((n, i) => brass(ctx, out, t + i * 0.16, [n], 0.14, 0.09));
    arpeggio(ctx, at(ctx, out, -0.35), t, [67, 69, 71, 74, 76, 79], 0.07, 0.09, 0.5);
    kick(ctx, out, hit, { gain: 0.26 });
    crack(ctx, out, hit, 0.08, 0.2);
    noiseHit(ctx, out, hit, { dur: 1.2, freq: 7000, q: 0.5, gain: 0.07, wet: 0.4 });
    brass(ctx, out, hit, [67, 71, 74, 79], 1.4, 0.15);
    pad(ctx, out, hit, [55, 62, 67, 71], 1.4, { gain: 0.07, cutoff: 1800 });
    bass(ctx, out, hit, 43, 1.2, { gain: 0.11 });
    bells(ctx, at(ctx, out, 0.35), hit, [91, 95, 98, 103], 0.06, 0.07, 1.2);
    sparkle(ctx, out, hit, 1.6, 8, 0.035);
    return 0.5 + 2;
  },

  /** Something was bought: a little thunk, a jingle, two bells and a few coins. */
  purchase: (ctx, out, t) => {
    knock(ctx, out, t, 700, 0.08);
    noiseHit(ctx, at(ctx, out, -0.2), t + 0.02, { dur: 0.2, freq: 7500, q: 0.6, gain: 0.03, wet: 0.3 });
    pluck(ctx, at(ctx, out, -0.25), t + 0.02, 76, { gain: 0.05, decay: 0.3 });
    pluck(ctx, at(ctx, out, -0.25), t + 0.09, 83, { gain: 0.05, decay: 0.4 });
    bell(ctx, at(ctx, out, 0.2), t + 0.02, 88, { gain: 0.08, decay: 0.45, wet: 0.3 });
    sparkle(ctx, out, t + 0.06, 0.6, 6, 0.03);
    return 0.09 + bell(ctx, at(ctx, out, 0.2), t + 0.09, 95, { gain: 0.08, decay: 0.7, wet: 0.3 });
  },

  /** A new level: a pluck glissando up two octaves of G, landing on bells, a chord and a soft kick. */
  levelUp: (ctx, out, t) => {
    const land = t + 0.38;
    noiseHit(ctx, out, t, { dur: 0.05, attack: 0.33, freq: 400, sweep: 5000, q: 1.2, gain: 0.025, wet: 0.2 });
    arpeggio(ctx, at(ctx, out, -0.3), t, [67, 69, 71, 74, 76, 79, 81, 83, 86, 88, 91], 0.034, 0.08, 0.45);
    kick(ctx, out, land, { gain: 0.12 });
    pad(ctx, out, land, [67, 71, 74], 1, { gain: 0.08, cutoff: 1800 });
    pad(ctx, out, land, [55, 62, 67, 71], 0.8, { gain: 0.05, cutoff: 1200 });
    bells(ctx, at(ctx, out, 0.3), land, [79, 86, 91], 0, 0.06, 1.3);
    sparkle(ctx, out, land, 1.2, 10, 0.03);
    return 0.38 + 1.4;
  },

  /** The light building inside a Lantern, for `seconds`: a riser, a swelling chord and pings climbing faster. */
  lanternRise: (ctx, out, t, o) => {
    const dur = Math.max(0.4, o.seconds ?? 1.5);
    noiseHit(ctx, out, t, { dur: dur * 0.1, attack: dur * 0.9, freq: 400, sweep: 8000, q: 1, gain: 0.09, wet: 0.35 });
    pad(ctx, out, t, [62, 66, 69, 74], dur, { gain: 0.035, cutoff: 1400 });
    for (let i = 0; i < 8; i++) {
      const x = (i / 8) ** 0.6;
      bell(ctx, at(ctx, out, i % 2 ? 0.5 : -0.5), t + dur * x, [86, 88, 90, 93, 95, 98, 100, 102][i]!, { gain: 0.02 + 0.05 * x, decay: 0.25 });
    }
    return riser(ctx, out, t, 147, 588, dur, 0.05);
  },

  /** The Lantern opens: a bright burst, a thud and a bell chord of light. */
  lanternOpen: (ctx, out, t) => {
    kick(ctx, out, t, { gain: 0.16 });
    thump(ctx, out, t, 147, 0.1, 0.3);
    crack(ctx, out, t, 0.05, 0.1);
    noiseHit(ctx, out, t, { dur: 0.5, freq: 6000, sweep: 800, q: 0.7, gain: 0.06, wet: 0.4 });
    pad(ctx, out, t, [62, 69, 74, 78], 0.5, { gain: 0.06, cutoff: 1600 });
    bells(ctx, at(ctx, out, 0.3), t + 0.02, [86, 93, 98], 0, 0.06, 0.9);
    return sparkle(ctx, out, t + 0.02, 1, 10, 0.035);
  },

  /** The Glim appears: the rarer it is, the bigger the moment. */
  lanternReveal: (ctx, out, t, o) => lanternReveal(ctx, out, t, o.rarity ?? 'common'),

  /* Game events for modes with coins, tricks, battles, towers and boards. */

  /** A few coins: two bright bells a fourth apart and a clink. */
  coin: (ctx, out, t) => {
    noiseHit(ctx, out, t, { dur: 0.01, freq: 8000, q: 1, gain: 0.025 });
    pluck(ctx, at(ctx, out, -0.25), t, 83, { gain: 0.04, decay: 0.25 });
    pluck(ctx, at(ctx, out, -0.25), t + 0.06, 88, { gain: 0.04, decay: 0.3 });
    bell(ctx, at(ctx, out, 0.15), t, 95, { gain: 0.07, decay: 0.35, wet: 0.2 });
    sparkle(ctx, out, t + 0.05, 0.3, 3, 0.025);
    return 0.06 + bell(ctx, at(ctx, out, 0.15), t + 0.06, 100, { gain: 0.07, decay: 0.45, wet: 0.2 });
  },

  /** A big win: a brass chord and a kick, runs of plucks and bells, a tambourine and a pour of coins. */
  jackpot: (ctx, out, t) => {
    kick(ctx, out, t, { gain: 0.12 });
    brass(ctx, out, t, [74, 78, 81, 86], 0.5, 0.08);
    bass(ctx, out, t, 50, 0.5, { gain: 0.06 });
    noiseHit(ctx, out, t, { dur: 0.9, freq: 7000, q: 0.5, gain: 0.06, wet: 0.4 });
    arpeggio(ctx, at(ctx, out, -0.35), t, [86, 90, 93, 98, 102], 0.05, 0.09, 0.5);
    bells(ctx, at(ctx, out, 0.35), t + 0.01, [86, 90, 93, 98, 102], 0.05, 0.05, 0.7);
    roll(ctx, at(ctx, out, 0.2), t + 0.2, t + 1.2, 0.1, 0.03, 0.01, 8000);
    sparkle(ctx, out, t + 0.15, 1.4, 12, 0.05);
    return 2;
  },

  /** You took something from another player: a swipe across the field, a snap and a quick run up. */
  steal: (ctx, out, t) => {
    noiseHit(ctx, at(ctx, out, 0.4), t, { dur: 0.1, attack: 0.15, freq: 900, sweep: 5000, q: 1.2, gain: 0.05, wet: 0.2 });
    noiseHit(ctx, at(ctx, out, 0.2), t + 0.11, { dur: 0.02, freq: 2100, q: 3, gain: 0.08 });
    arpeggio(ctx, at(ctx, out, 0.3), t + 0.12, [74, 78, 81, 86], 0.05, 0.1, 0.35);
    return 0.28 + bell(ctx, at(ctx, out, 0.5), t + 0.28, 98, { gain: 0.04, decay: 0.3 });
  },

  /** Another player took something from you: a swipe the other way, a falling run and a soft thud. */
  stolen: (ctx, out, t) => {
    noiseHit(ctx, at(ctx, out, -0.4), t, { dur: 0.1, attack: 0.15, freq: 5000, sweep: 900, q: 1.2, gain: 0.04, wet: 0.2 });
    arpeggio(ctx, at(ctx, out, -0.25), t + 0.12, [81, 77, 74], 0.07, 0.11, 0.35);
    return 0.3 + thump(ctx, out, t + 0.3, 147, 0.07, 0.2);
  },

  /** Two things trade places: a pluck run up on the left crosses a mallet run down on the right. */
  swap: (ctx, out, t) => {
    noiseHit(ctx, out, t, { dur: 0.16, attack: 0.16, freq: 1500, sweep: 3200, q: 1, gain: 0.025, wet: 0.2 });
    arpeggio(ctx, at(ctx, out, -0.45), t, [74, 76, 78, 81, 83, 86], 0.035, 0.07, 0.35);
    return 0.05 + arpeggio(ctx, at(ctx, out, 0.45), t + 0.05, [86, 83, 81, 78, 76, 74], 0.035, 0.07, 0.35);
  },

  /** A shield goes up, or blocks something: a rising shimmer, a soft whoomp and an open bell chord. */
  shield: (ctx, out, t) => {
    thump(ctx, out, t, 165, 0.08, 0.2);
    noiseHit(ctx, out, t, { dur: 0.05, attack: 0.2, freq: 1200, sweep: 6000, q: 1.2, gain: 0.03, wet: 0.4 });
    pad(ctx, out, t + 0.02, [64, 69, 71], 0.5, { gain: 0.05, cutoff: 1800 });
    bells(ctx, at(ctx, out, 0.15), t + 0.02, [76, 81, 83, 88], 0, 0.05, 0.9);
    return sparkle(ctx, out, t + 0.05, 0.9, 6, 0.02);
  },

  /** Something went wrong (coins lost, a dud, a miss): a muffled thud and a muted wah-wah. */
  bust: (ctx, out, t) => {
    thump(ctx, out, t, 165, 0.1, 0.25);
    noiseHit(ctx, out, t + 0.02, { dur: 0.25, freq: 3000, sweep: 600, q: 0.8, gain: 0.015, wet: 0.2 });
    brass(ctx, at(ctx, out, -0.2), t + 0.05, [69], 0.18, 0.08);
    return 0.26 + brass(ctx, at(ctx, out, -0.2), t + 0.26, [66], 0.45, 0.08);
  },

  /** Something is built or placed: a wooden thock with a body, a shaker and a mallet A. */
  build: (ctx, out, t) => {
    thump(ctx, out, t, 220, 0.09, 0.12);
    knock(ctx, at(ctx, out, -0.15), t, 640, 0.1);
    noiseHit(ctx, at(ctx, out, 0.35), t, { dur: 0.04, freq: 7000, q: 0.8, gain: 0.03 });
    pluck(ctx, at(ctx, out, -0.3), t + 0.02, 81, { gain: 0.03, decay: 0.25 });
    return pluck(ctx, at(ctx, out, 0.2), t + 0.02, 69, { gain: 0.11, decay: 0.35, bright: 4 });
  },

  /** Something gets better: a pluck arpeggio and a bell run up to a high D, with a sparkle. */
  upgrade: (ctx, out, t) => {
    noiseHit(ctx, out, t, { dur: 0.04, attack: 0.14, freq: 600, sweep: 5000, q: 1.2, gain: 0.015, wet: 0.2 });
    arpeggio(ctx, at(ctx, out, -0.3), t, [69, 74, 78, 81], 0.05, 0.11, 0.45);
    bells(ctx, at(ctx, out, 0.3), t + 0.05, [86, 90, 93], 0.05, 0.04, 0.4);
    sparkle(ctx, out, t + 0.18, 0.6, 5, 0.025);
    return 0.18 + bell(ctx, at(ctx, out, 0.3), t + 0.18, 98, { gain: 0.07, decay: 0.8 });
  },

  /** A hit lands: a snare's crack and a clap over a drum body small speakers can play. */
  hit: (ctx, out, t) => {
    thump(ctx, out, t, 196, 0.12, 0.24);
    noiseHit(ctx, at(ctx, out, 0.3), t, { dur: 0.14, freq: 1500, q: 1.2, gain: 0.06 });
    noiseHit(ctx, at(ctx, out, -0.3), t, { dur: 0.08, freq: 1300, q: 3, gain: 0.05 });
    noiseHit(ctx, out, t, { dur: 0.12, freq: 6000, q: 0.5, gain: 0.04 });
    return crack(ctx, out, t, 0.08, 0.22);
  },

  /** You take a hit, or the festival loses a light: a soft thud and a little falling "oof". */
  hurt: (ctx, out, t) => {
    thump(ctx, out, t, 185, 0.12, 0.16);
    noiseHit(ctx, at(ctx, out, 0.2), t, { dur: 0.1, freq: 3500, q: 0.7, gain: 0.03 });
    pluck(ctx, at(ctx, out, -0.25), t + 0.03, 64, { gain: 0.06, decay: 0.25, bright: 3 });
    pluck(ctx, at(ctx, out, -0.25), t + 0.03, 71, { gain: 0.04, decay: 0.25, bright: 3 });
    return 0.01 + blip(ctx, at(ctx, out, 0.25), t + 0.01, 660, 290, { dur: 0.22, gain: 0.08, type: 'triangle' });
  },

  /** A power is switched on: a rising sweep and a fast arpeggio, landing on a bright D chord. */
  powerUp: (ctx, out, t) => {
    const land = t + 0.38;
    noiseHit(ctx, out, t, { dur: 0.05, attack: 0.33, freq: 400, sweep: 6000, q: 1.4, gain: 0.04, wet: 0.2 });
    [62, 66, 69, 74, 78, 81].forEach((n, i) => blip(ctx, at(ctx, out, -0.2), t + i * 0.06, 440 * 2 ** ((n - 69) / 12), 440 * 2 ** ((n - 69) / 12), { dur: 0.06, gain: 0.05, type: 'square' }));
    pad(ctx, out, land, [74, 78, 81], 0.6, { gain: 0.06, cutoff: 2000 });
    bells(ctx, at(ctx, out, 0.25), land, [86, 90, 93, 98], 0, 0.05, 0.9);
    sparkle(ctx, out, land, 0.8, 6, 0.03);
    return 0.38 + 1;
  },

  /** Something happens to the whole room: a drum roll and a sweep into a brass chord, bells and a choir-like pad. */
  event: (ctx, out, t) => {
    const land = t + 0.5;
    for (let i = 0; i < 5; i++) thump(ctx, out, t + i * 0.1, 98, 0.04 + i * 0.015, 0.12);
    noiseHit(ctx, out, t, { dur: 0.05, attack: 0.45, freq: 400, sweep: 5000, q: 1, gain: 0.02, wet: 0.3 });
    kick(ctx, out, land, { gain: 0.2 });
    noiseHit(ctx, out, land, { dur: 1, freq: 7000, q: 0.5, gain: 0.06, wet: 0.4 });
    brass(ctx, out, land, [62, 69, 74, 78], 1, 0.13);
    pad(ctx, out, land, [74, 78, 81], 1, { gain: 0.06, cutoff: 1600 });
    bass(ctx, out, land, 38, 1, { gain: 0.1 });
    bells(ctx, at(ctx, out, 0.3), land, [74, 81, 86], 0.06, 0.07, 1.2);
    sparkle(ctx, out, land, 1.2, 8, 0.03);
    return 0.5 + 1.6;
  },

  /** You won a round or a duel: a brass pickup to a high D on a drum hit, bells and a sparkle. */
  win: (ctx, out, t) => {
    const hit = t + 0.32;
    [74, 78, 81].forEach((n, i) => {
      brass(ctx, out, t + i * 0.1, [n], 0.09, 0.08);
      noiseHit(ctx, out, t + i * 0.1, { dur: 0.04, freq: 2600, q: 0.8, gain: 0.015 + i * 0.01 });
    });
    kick(ctx, out, hit, { gain: 0.22 });
    crack(ctx, out, hit, 0.07, 0.15);
    noiseHit(ctx, out, hit, { dur: 0.9, freq: 7000, q: 0.5, gain: 0.06, wet: 0.4 });
    brass(ctx, out, hit, [62, 66, 69, 86], 0.8, 0.14);
    bass(ctx, out, hit, 50, 0.7, { gain: 0.09 });
    arpeggio(ctx, at(ctx, out, -0.35), hit, [74, 78, 81, 86], 0.03, 0.07, 0.5);
    bells(ctx, at(ctx, out, 0.35), hit, [98, 93], 0.02, 0.07, 1);
    sparkle(ctx, out, hit, 1, 8, 0.03);
    return 0.32 + 1.5;
  },

  /** You lost a round or a duel: three soft notes falling to a low D. */
  lose: (ctx, out, t) => {
    pluck(ctx, at(ctx, out, -0.35), t, 69, { gain: 0.13, decay: 0.3, bright: 3 });
    pluck(ctx, at(ctx, out, 0.4), t, 69, { gain: 0.05, decay: 0.25 });
    pluck(ctx, at(ctx, out, -0.35), t + 0.18, 65, { gain: 0.13, decay: 0.3, bright: 3 });
    pluck(ctx, at(ctx, out, 0.4), t + 0.18, 65, { gain: 0.05, decay: 0.25 });
    bass(ctx, out, t + 0.36, 50, 0.5, { gain: 0.045 });
    noiseHit(ctx, out, t + 0.3, { dur: 0.3, attack: 0.06, freq: 4000, q: 0.5, gain: 0.01, wet: 0.2 });
    return 0.36 + pluck(ctx, at(ctx, out, -0.35), t + 0.36, 62, { gain: 0.13, decay: 0.6, bright: 2.5 });
  },

  /** Dice rattle and land: woody clicks coming faster, then a knock and a little note. */
  dice: (ctx, out, t) => {
    let when = t;
    let gap = 0.07;
    for (let i = 0; i < 9; i++) {
      knock(ctx, at(ctx, out, ((i * 0.53) % 1) * 1.4 - 0.7), when, 1300 + ((i * 337) % 1300), 0.09 * (1 - i / 9) ** 0.6);
      when += gap;
      gap *= 0.82;
    }
    noiseHit(ctx, at(ctx, out, -0.35), t, { dur: 0.05, freq: 7000, q: 0.8, gain: 0.025 });
    // The dice rolling between the knocks.
    noiseHit(ctx, out, t, { dur: 0.36, freq: 2600, q: 0.7, gain: 0.02 });
    thump(ctx, out, t + 0.4, 220, 0.04, 0.12);
    knock(ctx, out, t + 0.4, 700, 0.06);
    return 0.4 + pluck(ctx, at(ctx, out, 0.3), t + 0.4, 76, { gain: 0.04, decay: 0.2 });
  },

  /** A token hops one space. `n` walks up the scale. */
  step: (ctx, out, t, o) => {
    const i = (((o.n ?? 0) % STEPS.length) + STEPS.length) % STEPS.length;
    const note = STEPS[i]!;
    knock(ctx, at(ctx, out, -0.3), t, 900 + 60 * i, 0.05);
    noiseHit(ctx, at(ctx, out, 0.3), t, { dur: 0.03, freq: 7000, q: 0.8, gain: 0.02 });
    pluck(ctx, at(ctx, out, 0.4), t, i >= 3 ? note : note + 12, { gain: 0.05, decay: 0.18 });
    if (i >= 3) pluck(ctx, at(ctx, out, -0.35), t, note - 12, { gain: 0.05, decay: 0.2, bright: 3 });
    return pluck(ctx, at(ctx, out, -0.15), t, note, { gain: 0.09, decay: 0.2 });
  },

  /** Territory or a prize changes hands: a drum hit and a brass stab, then two bells. */
  capture: (ctx, out, t) => {
    kick(ctx, out, t, { gain: 0.2 });
    thump(ctx, out, t, 147, 0.08, 0.25);
    crack(ctx, out, t, 0.04, 0.1);
    noiseHit(ctx, out, t, { dur: 0.6, freq: 7000, q: 0.5, gain: 0.03, wet: 0.4 });
    brass(ctx, out, t, [62, 69, 74], 0.3, 0.12);
    pluck(ctx, at(ctx, out, -0.3), t + 0.1, 81, { gain: 0.07, decay: 0.35 });
    pluck(ctx, at(ctx, out, -0.3), t + 0.16, 86, { gain: 0.07, decay: 0.45 });
    bell(ctx, at(ctx, out, 0.3), t + 0.1, 93, { gain: 0.07, decay: 0.5 });
    return 0.16 + bell(ctx, at(ctx, out, 0.3), t + 0.16, 98, { gain: 0.08, decay: 0.7 });
  },

  /** Danger, something is about to go wrong: four soft two-tone pulses swaying left and right. Urgent, never shrill. */
  alarm: (ctx, out, t) => {
    [0, 0.18, 0.36, 0.54].forEach((d, i) => {
      const high = i % 2 === 0;
      const f = high ? 1318.5 : 987.8;
      blip(ctx, at(ctx, out, high ? -0.4 : 0.4), t + d, f, f, { dur: high ? 0.16 : 0.18, gain: 0.05, type: 'square' });
      pluck(ctx, out, t + d, high ? 88 : 83, { gain: 0.05, decay: 0.15 });
      thump(ctx, out, t + d, high ? 200 : 160, 0.03, 0.1);
    });
    return 0.7;
  },

  /** One beat of a countdown before something starts: a knock and a bell on A. */
  countdown: (ctx, out, t) => {
    knock(ctx, out, t, 1300, 0.1);
    noiseHit(ctx, out, t, { dur: 0.02, freq: 8000, q: 0.8, gain: 0.03 });
    pluck(ctx, at(ctx, out, -0.25), t, 81, { gain: 0.06, decay: 0.25 });
    bell(ctx, at(ctx, out, 0.4), t, 105, { gain: 0.025, decay: 0.2 });
    return bell(ctx, at(ctx, out, 0.2), t, 81, { gain: 0.09, decay: 0.35 });
  },

  /** Go! A brass D chord on a kick, a clap and a cymbal, with a whoosh launching up. */
  go: (ctx, out, t) => {
    kick(ctx, out, t, { gain: 0.24 });
    thump(ctx, out, t, 147, 0.08, 0.25);
    crack(ctx, out, t, 0.06, 0.12);
    noiseHit(ctx, out, t, { dur: 0.8, freq: 7000, q: 0.5, gain: 0.04, wet: 0.4 });
    noiseHit(ctx, out, t, { dur: 0.2, attack: 0.2, freq: 600, sweep: 5000, q: 1.2, gain: 0.03, wet: 0.3 });
    bells(ctx, at(ctx, out, 0.3), t, [86, 93], 0, 0.05, 0.6);
    return brass(ctx, out, t, [62, 66, 69, 74], 0.5, 0.16) + 0.4;
  },
} satisfies Record<string, Effect>;

/**
 * How many dB louder each synthesised effect plays than it is written, so that through the engine's
 * mix it is about as loud as its recording and the switch to the recording is not a jump in level.
 * Measured by rendering both offline through the same mix (the loudest 400 ms of each).
 */
const LEVEL: Record<keyof typeof VOICES, number> = {
  select: 12, tap: 17, lockIn: 9, correct: 9, wrong: 8, tick: 17.5, tickFinal: 18, timeUp: 13, question: 12, reveal: 7.5,
  join: 13, reaction: 20, rankUp: 11, fanfare: 3, purchase: 14.5, levelUp: 6.5, lanternRise: 11, lanternOpen: 14.5, lanternReveal: 0,
  coin: 12.5, jackpot: 8, steal: 12.5, stolen: 12.5, swap: 11.5, shield: 14, bust: 8.5, build: 17, upgrade: 10.5, hit: 21, hurt: 21.5,
  powerUp: 10, event: 3, win: 2.5, lose: 7.5, dice: 16, step: 17.5, capture: 7, alarm: 16, countdown: 13, go: 3.5,
};

/** The Lantern reveals differ so much in size that each rarity has its own level. */
const REVEAL_LEVEL: Record<Rarity, number> = { common: 9, uncommon: 8, rare: 5.5, epic: 3, legendary: 1.5, mythic: 2 };

/** `out` turned up by `db`, dry and wet alike. */
function louder(ctx: BaseAudioContext, out: Out, db: number): Out {
  if (!db) return out;
  const gain = 10 ** (db / 20);
  const dry = ctx.createGain();
  dry.gain.value = gain;
  dry.connect(out.dry);
  if (!out.wet) return { dry };
  const wet = ctx.createGain();
  wet.gain.value = gain;
  wet.connect(out.wet);
  return { dry, wet };
}

export const EFFECTS = Object.fromEntries(
  (Object.keys(VOICES) as (keyof typeof VOICES)[]).map((name) => {
    const voice: Effect = VOICES[name];
    const play: Effect = (ctx, out, t, o) => voice(ctx, louder(ctx, out, LEVEL[name] + (name === 'lanternReveal' ? REVEAL_LEVEL[o.rarity ?? 'common'] : 0)), t, o);
    return [name, play];
  }),
) as Record<keyof typeof VOICES, Effect>;

export type SfxName = keyof typeof VOICES;
