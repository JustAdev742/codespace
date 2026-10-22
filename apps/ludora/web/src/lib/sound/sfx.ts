import type { Rarity } from '@ludora/shared';
import { bass, bell, blip, kick, noiseHit, pad, pluck, type Out } from './synth.ts';

/*
 * The game's sound effects, built from the instruments in synth.ts. Most sit in
 * D major pentatonic, the same scale as the music, so effects that overlap the
 * music or each other stay in tune. Each one schedules its notes from time `t`
 * and returns how long it lasts, in seconds.
 */

export type SfxOptions = { n?: number; seconds?: number; rarity?: Rarity };
type Effect = (ctx: BaseAudioContext, out: Out, t: number, o: SfxOptions) => number;

/** D major pentatonic from A4 up: the notes a run of joins or reactions steps through. */
const SPARKLE = [69, 71, 74, 76, 78, 81, 83, 86];

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

export const EFFECTS = {
  /** Picking an answer that is not sent yet (select-all, matching). */
  select: (ctx, out, t) => pluck(ctx, out, t, 81, { gain: 0.14, decay: 0.22, wet: 0.1 }),

  /** A light tap on a button. */
  tap: (ctx, out, t) => {
    blip(ctx, out, t, 900, 640, { dur: 0.045, gain: 0.14 });
    return noiseHit(ctx, out, t, { dur: 0.015, freq: 4200, q: 2, gain: 0.04 });
  },

  /** The answer went in. */
  lockIn: (ctx, out, t) => {
    pluck(ctx, out, t, 76, { gain: 0.15, decay: 0.45 });
    return 0.075 + pluck(ctx, out, t + 0.075, 81, { gain: 0.15, decay: 0.65 });
  },

  /** Right: a bright rising arpeggio that lands on a bell. */
  correct: (ctx, out, t) => {
    arpeggio(ctx, out, t, [74, 78, 81], 0.07, 0.16, 0.55);
    return 0.21 + bell(ctx, out, t + 0.21, 86, { gain: 0.1, decay: 1.3 });
  },

  /** Not this time: two soft, falling notes. Gentle, never a buzzer. */
  wrong: (ctx, out, t) => {
    pluck(ctx, out, t, 57, { gain: 0.16, decay: 0.26, bright: 3, wet: 0.15 });
    return 0.17 + pluck(ctx, out, t + 0.17, 53, { gain: 0.16, decay: 0.5, bright: 2.5, wet: 0.15 });
  },

  /** A clock tick for the last seconds of a question. */
  tick: (ctx, out, t) => {
    noiseHit(ctx, out, t, { dur: 0.018, freq: 3000, q: 3, gain: 0.08 });
    return blip(ctx, out, t, 1250, 1120, { dur: 0.035, gain: 0.19, type: 'triangle' });
  },

  /** The very last tick, a little higher. */
  tickFinal: (ctx, out, t) => {
    noiseHit(ctx, out, t, { dur: 0.02, freq: 3600, q: 3, gain: 0.09 });
    return blip(ctx, out, t, 1660, 1480, { dur: 0.045, gain: 0.24, type: 'triangle' });
  },

  /** Time is up. */
  timeUp: (ctx, out, t) => {
    pluck(ctx, out, t, 45, { gain: 0.14, decay: 0.7, bright: 3 });
    return bell(ctx, out, t, 69, { gain: 0.11, decay: 1.6 });
  },

  /** A new question: a soft whoosh that lands on two notes. */
  question: (ctx, out, t) => {
    noiseHit(ctx, out, t, { dur: 0.2, attack: 0.12, freq: 500, sweep: 3600, q: 0.8, gain: 0.045, wet: 0.2 });
    pluck(ctx, out, t + 0.28, 81, { gain: 0.09, decay: 0.45 });
    return 0.36 + pluck(ctx, out, t + 0.36, 86, { gain: 0.08, decay: 0.6 });
  },

  /** The answer is shown on the big screen. */
  reveal: (ctx, out, t) => {
    pluck(ctx, out, t, 74, { gain: 0.12, decay: 0.6 });
    pluck(ctx, out, t + 0.06, 81, { gain: 0.12, decay: 0.7 });
    return bell(ctx, out, t + 0.06, 90, { gain: 0.08, decay: 1.2 });
  },

  /** Someone joined the lobby. `n` steps through the scale, so a crowd arriving plays a little tune. */
  join: (ctx, out, t, o) => {
    blip(ctx, out, t, 330, 660, { dur: 0.05, gain: 0.045 });
    return pluck(ctx, out, t + 0.03, SPARKLE[(o.n ?? 0) % SPARKLE.length]!, { gain: 0.12, decay: 0.5 });
  },

  /** A reaction floated up on the big screen. */
  reaction: (ctx, out, t, o) => blip(ctx, out, t, 520, 900 + ((o.n ?? 0) % 4) * 60, { dur: 0.07, gain: 0.1, wet: 0.15 }),

  /** Moved up the leaderboard. */
  rankUp: (ctx, out, t) => {
    pluck(ctx, out, t, 81, { gain: 0.12, decay: 0.4 });
    return 0.07 + pluck(ctx, out, t + 0.07, 86, { gain: 0.12, decay: 0.6 });
  },

  /** The game is over: a short fanfare. */
  fanfare: (ctx, out, t) => {
    arpeggio(ctx, out, t, [62, 66, 69, 74, 78, 81], 0.075, 0.15, 0.6);
    const hit = t + 0.5;
    kick(ctx, out, hit, { gain: 0.24 });
    bass(ctx, out, hit, 38, 1.1, { gain: 0.2 });
    pad(ctx, out, hit, [62, 66, 69, 74], 1.6, { gain: 0.1 });
    pluck(ctx, out, hit, 86, { gain: 0.14, decay: 0.9 });
    return 0.5 + bell(ctx, out, hit + 0.05, 90, { gain: 0.1, decay: 1.8 });
  },

  /** Something was bought: two coin-bright pings. */
  purchase: (ctx, out, t) => {
    bell(ctx, out, t, 95, { gain: 0.07, decay: 0.45, wet: 0.3 });
    return 0.07 + bell(ctx, out, t + 0.07, 100, { gain: 0.07, decay: 0.7, wet: 0.3 });
  },

  /** A new level. */
  levelUp: (ctx, out, t) => {
    arpeggio(ctx, out, t, [69, 73, 76, 81], 0.08, 0.14, 0.6);
    pad(ctx, out, t + 0.3, [69, 73, 76], 1.2, { gain: 0.07 });
    return 0.32 + bell(ctx, out, t + 0.32, 88, { gain: 0.1, decay: 1.4 });
  },

  /** The light building inside a Lantern, for `seconds`. */
  lanternRise: (ctx, out, t, o) => {
    const dur = Math.max(0.4, o.seconds ?? 1.5);
    noiseHit(ctx, out, t, { dur: dur * 0.1, attack: dur * 0.9, freq: 400, sweep: 5200, q: 1.2, gain: 0.05, wet: 0.35 });
    return riser(ctx, out, t, 196, 784, dur, 0.05);
  },

  /** The Lantern opens: a bright burst. */
  lanternOpen: (ctx, out, t) => {
    kick(ctx, out, t, { gain: 0.18 });
    return noiseHit(ctx, out, t, { dur: 0.45, freq: 6000, sweep: 900, q: 0.7, gain: 0.07, wet: 0.4 });
  },

  /** The Glim appears: the rarer it is, the bigger the moment. */
  lanternReveal: (ctx, out, t, o) => {
    const r = o.rarity ?? 'common';
    if (r === 'common' || r === 'uncommon') {
      pluck(ctx, out, t, r === 'common' ? 78 : 81, { gain: 0.14, decay: 0.6 });
      return bell(ctx, out, t + 0.05, r === 'common' ? 86 : 88, { gain: 0.08, decay: 1.1 });
    }
    if (r === 'rare') {
      arpeggio(ctx, out, t, [74, 78, 81], 0.07, 0.14);
      return 0.2 + bell(ctx, out, t + 0.2, 86, { gain: 0.1, decay: 1.4 });
    }
    if (r === 'epic') {
      arpeggio(ctx, out, t, [71, 74, 78, 83], 0.07, 0.14);
      pad(ctx, out, t + 0.2, [59, 66, 71, 74], 1.4, { gain: 0.08 });
      return 0.25 + bell(ctx, out, t + 0.25, 90, { gain: 0.1, decay: 1.6 });
    }
    // Legendary and mythic: a fanfare and a cascade of bells.
    const cascade = r === 'mythic' ? [98, 95, 93, 90, 88, 86, 83, 81] : [93, 90, 88, 86, 83];
    arpeggio(ctx, out, t, [62, 66, 69, 74, 78], 0.06, 0.14);
    kick(ctx, out, t + 0.3, { gain: 0.22 });
    pad(ctx, out, t + 0.3, r === 'mythic' ? [62, 66, 69, 74, 78] : [62, 66, 69, 74], 1.8, { gain: 0.1 });
    bass(ctx, out, t + 0.3, 38, 1.2, { gain: 0.18 });
    cascade.forEach((n, i) => bell(ctx, out, t + 0.35 + i * 0.07, n, { gain: 0.06, decay: 1.2 }));
    return 0.35 + cascade.length * 0.07 + 1.2;
  },
} satisfies Record<string, Effect>;

export type SfxName = keyof typeof EFFECTS;
