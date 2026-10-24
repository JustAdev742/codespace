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

  /** Incorrect: two soft, falling notes. Gentle, never a buzzer. */
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

  /* Game events for modes with coins, tricks, battles, towers and boards. */

  /** A few coins. */
  coin: (ctx, out, t) => {
    bell(ctx, out, t, 93, { gain: 0.06, decay: 0.35, wet: 0.2 });
    return 0.05 + bell(ctx, out, t + 0.05, 98, { gain: 0.06, decay: 0.5, wet: 0.2 });
  },

  /** A big win: coins pour in. */
  jackpot: (ctx, out, t) => {
    arpeggio(ctx, out, t, [74, 78, 81, 86], 0.06, 0.13, 0.5);
    [98, 95, 93, 98, 100].forEach((n, i) => bell(ctx, out, t + 0.22 + i * 0.06, n, { gain: 0.05, decay: 0.6, wet: 0.3 }));
    return 0.22 + 5 * 0.06 + 0.6;
  },

  /** You took something from another player. */
  steal: (ctx, out, t) => {
    blip(ctx, out, t, 1400, 500, { dur: 0.12, gain: 0.09 });
    return 0.12 + pluck(ctx, out, t + 0.12, 81, { gain: 0.14, decay: 0.45 });
  },

  /** Another player took something from you. */
  stolen: (ctx, out, t) => {
    blip(ctx, out, t, 500, 1300, { dur: 0.1, gain: 0.07 });
    pluck(ctx, out, t + 0.1, 62, { gain: 0.15, decay: 0.3, bright: 3 });
    return 0.26 + pluck(ctx, out, t + 0.26, 57, { gain: 0.15, decay: 0.5, bright: 2.5 });
  },

  /** Two things trade places. */
  swap: (ctx, out, t) => {
    pluck(ctx, out, t, 74, { gain: 0.12, decay: 0.3 });
    pluck(ctx, out, t + 0.09, 81, { gain: 0.12, decay: 0.3 });
    pluck(ctx, out, t + 0.18, 81, { gain: 0.12, decay: 0.3 });
    return 0.27 + pluck(ctx, out, t + 0.27, 74, { gain: 0.12, decay: 0.5 });
  },

  /** A shield goes up, or blocks something. */
  shield: (ctx, out, t) => {
    noiseHit(ctx, out, t, { dur: 0.25, attack: 0.05, freq: 1200, sweep: 6000, q: 1.2, gain: 0.04, wet: 0.4 });
    return bell(ctx, out, t + 0.04, 86, { gain: 0.09, decay: 1.1, wet: 0.35 });
  },

  /** Something went wrong: coins lost, a dud, a miss. */
  bust: (ctx, out, t) => {
    kick(ctx, out, t, { gain: 0.12 });
    return pluck(ctx, out, t + 0.02, 50, { gain: 0.16, decay: 0.55, bright: 2.5, wet: 0.15 });
  },

  /** Something is built or placed. */
  build: (ctx, out, t) => {
    noiseHit(ctx, out, t, { dur: 0.05, freq: 900, q: 1.5, gain: 0.08 });
    kick(ctx, out, t, { gain: 0.1 });
    return pluck(ctx, out, t + 0.03, 69, { gain: 0.13, decay: 0.4, bright: 4 });
  },

  /** Something gets better. */
  upgrade: (ctx, out, t) => arpeggio(ctx, out, t, [69, 74, 78, 81], 0.055, 0.12, 0.45),

  /** A hit lands. */
  hit: (ctx, out, t) => {
    noiseHit(ctx, out, t, { dur: 0.07, freq: 2600, q: 0.9, gain: 0.08 });
    return kick(ctx, out, t, { gain: 0.16 });
  },

  /** You take a hit, or the festival loses a light. */
  hurt: (ctx, out, t) => {
    kick(ctx, out, t, { gain: 0.14 });
    return blip(ctx, out, t + 0.02, 420, 160, { dur: 0.22, gain: 0.08, type: 'triangle' });
  },

  /** A power is switched on. */
  powerUp: (ctx, out, t) => {
    riser(ctx, out, t, 330, 1320, 0.32, 0.05);
    return 0.3 + bell(ctx, out, t + 0.3, 90, { gain: 0.08, decay: 0.8 });
  },

  /** Something happens to the whole room: an event begins. */
  event: (ctx, out, t) => {
    noiseHit(ctx, out, t, { dur: 0.3, attack: 0.15, freq: 400, sweep: 4000, q: 0.8, gain: 0.04, wet: 0.3 });
    pad(ctx, out, t + 0.2, [66, 69, 74, 78], 1.2, { gain: 0.07 });
    return 0.2 + bell(ctx, out, t + 0.2, 86, { gain: 0.09, decay: 1.3 });
  },

  /** You won a round or a duel. */
  win: (ctx, out, t) => {
    arpeggio(ctx, out, t, [74, 78, 81], 0.07, 0.15, 0.5);
    return 0.21 + bell(ctx, out, t + 0.21, 90, { gain: 0.1, decay: 1.2 });
  },

  /** You lost a round or a duel. */
  lose: (ctx, out, t) => {
    pluck(ctx, out, t, 62, { gain: 0.14, decay: 0.35, bright: 3 });
    pluck(ctx, out, t + 0.2, 59, { gain: 0.14, decay: 0.35, bright: 3 });
    return 0.4 + pluck(ctx, out, t + 0.4, 55, { gain: 0.14, decay: 0.7, bright: 2.5 });
  },

  /** Dice rattle and land. */
  dice: (ctx, out, t) => {
    for (let i = 0; i < 6; i++) noiseHit(ctx, out, t + i * 0.045 + (i % 2) * 0.01, { dur: 0.02, freq: 2400 + i * 300, q: 2, gain: 0.05 });
    return 0.3 + pluck(ctx, out, t + 0.3, 76, { gain: 0.1, decay: 0.3 });
  },

  /** A token hops one space. */
  step: (ctx, out, t, o) => blip(ctx, out, t, 600 + ((o.n ?? 0) % 6) * 70, 900 + ((o.n ?? 0) % 6) * 70, { dur: 0.05, gain: 0.07 }),

  /** Territory or a prize changes hands. */
  capture: (ctx, out, t) => {
    kick(ctx, out, t, { gain: 0.14 });
    arpeggio(ctx, out, t, [69, 74, 78], 0.05, 0.13, 0.4);
    return 0.15 + bell(ctx, out, t + 0.15, 86, { gain: 0.08, decay: 0.9 });
  },

  /** Danger: something is about to go wrong. */
  alarm: (ctx, out, t) => {
    blip(ctx, out, t, 880, 880, { dur: 0.12, gain: 0.08, type: 'triangle' });
    return 0.18 + blip(ctx, out, t + 0.18, 660, 660, { dur: 0.16, gain: 0.08, type: 'triangle' });
  },

  /** One beat of a countdown before something starts. */
  countdown: (ctx, out, t) => blip(ctx, out, t, 990, 990, { dur: 0.08, gain: 0.1, type: 'triangle' }),

  /** Go! */
  go: (ctx, out, t) => {
    blip(ctx, out, t, 1320, 1320, { dur: 0.25, gain: 0.1, type: 'triangle' });
    return pluck(ctx, out, t, 86, { gain: 0.12, decay: 0.6 });
  },
} satisfies Record<string, Effect>;

export type SfxName = keyof typeof EFFECTS;
