import type { SoundBankId } from '@ludora/shared';
import { bell, blip, noiseHit, pluck, type Out } from './synth.ts';
import type { SfxName } from './sfx.ts';

/*
 * The sound bank: sounds a question, a choice or a set's feel can use. The game's own effects
 * (played through the engine, so they are the same recordings players hear in games), plus
 * musical sounds made here in code for listening questions: single notes, intervals, chords,
 * rhythms and plain tones. Nothing is sampled; every sound is generated, so all of it is ours.
 */

/** Builds a sound on a context from time `t` and returns how long it lasts, in seconds. */
export type BankVoice = (ctx: BaseAudioContext, out: Out, t: number) => number;

export type BankGroup = 'Game sounds' | 'Notes' | 'Intervals' | 'Chords' | 'Rhythms' | 'Tones';

export interface BankSound {
  label: string;
  group: BankGroup;
  /** A caption the editor suggests, for players who cannot hear it. */
  caption: string;
  /** A game effect played by the engine, or a voice built here. */
  sfx?: SfxName;
  voice?: BankVoice;
}

const NOTE_NAMES: Record<Extract<SoundBankId, `note-${string}`>, [string, number]> = {
  'note-c4': ['C', 60],
  'note-d4': ['D', 62],
  'note-e4': ['E', 64],
  'note-f4': ['F', 65],
  'note-g4': ['G', 67],
  'note-a4': ['A', 69],
  'note-b4': ['B', 71],
  'note-c5': ['High C', 72],
};

/** A clear piano-like note: a pluck with a soft bell an octave up. */
function note(ctx: BaseAudioContext, out: Out, t: number, midi: number, len = 1.1): number {
  pluck(ctx, out, t, midi, { gain: 0.22, decay: len, bright: 0.6, wet: 0.15 });
  bell(ctx, out, t, midi + 12, { gain: 0.03, decay: len * 0.6, wet: 0.1 });
  return len;
}

/** Two notes one after the other, then together: how an interval is usually played in class. */
const interval =
  (semitones: number): BankVoice =>
  (ctx, out, t) => {
    note(ctx, out, t, 60, 0.7);
    note(ctx, out, t + 0.75, 60 + semitones, 0.7);
    note(ctx, out, t + 1.6, 60, 1.1);
    note(ctx, out, t + 1.6, 60 + semitones, 1.1);
    return 2.7;
  };

const chord =
  (notes: number[]): BankVoice =>
  (ctx, out, t) => {
    notes.forEach((n, i) => note(ctx, out, t + i * 0.12, n, 0.9));
    notes.forEach((n) => note(ctx, out, t + notes.length * 0.12 + 0.35, n, 1.4));
    return notes.length * 0.12 + 1.8;
  };

/** A woody click for rhythms; accented beats are louder and lower. */
function tick(ctx: BaseAudioContext, out: Out, t: number, accent: boolean) {
  noiseHit(ctx, out, t, { dur: 0.012, freq: accent ? 3500 : 5000, q: 1.2, gain: accent ? 0.12 : 0.07 });
  blip(ctx, out, t, accent ? 900 : 1300, accent ? 850 : 1250, { dur: 0.05, gain: accent ? 0.16 : 0.1, type: 'triangle' });
}

/** Beats at these times (in beats, at 100 a minute), accenting the given ones. Played twice. */
const rhythm =
  (beats: number[], bar: number, accents: number[]): BankVoice =>
  (ctx, out, t) => {
    const spb = 0.6;
    for (let rep = 0; rep < 2; rep++) for (const b of beats) tick(ctx, out, t + (rep * bar + b) * spb, accents.includes(b));
    return 2 * bar * spb;
  };

function tone(ctx: BaseAudioContext, out: Out, t: number, from: number, to: number, dur: number) {
  blip(ctx, out, t, from, to, { dur, gain: 0.12, type: 'sine' });
  return dur;
}

export const SOUND_BANK: Record<SoundBankId, BankSound> = {
  'fx-correct': { label: 'Right answer', group: 'Game sounds', caption: 'A bright chime', sfx: 'correct' },
  'fx-wrong': { label: 'Wrong answer', group: 'Game sounds', caption: 'A low buzz', sfx: 'wrong' },
  'fx-fanfare': { label: 'Fanfare', group: 'Game sounds', caption: 'A short fanfare', sfx: 'fanfare' },
  'fx-win': { label: 'Win', group: 'Game sounds', caption: 'A winning flourish', sfx: 'win' },
  'fx-coin': { label: 'Coin', group: 'Game sounds', caption: 'A coin clinks', sfx: 'coin' },
  'fx-level-up': { label: 'Level up', group: 'Game sounds', caption: 'A rising level-up jingle', sfx: 'levelUp' },
  'fx-reveal': { label: 'Reveal', group: 'Game sounds', caption: 'A reveal sting', sfx: 'reveal' },
  'fx-go': { label: 'Go', group: 'Game sounds', caption: 'A starting blast', sfx: 'go' },
  'fx-power-up': { label: 'Power up', group: 'Game sounds', caption: 'A sparkly power-up', sfx: 'powerUp' },
  'fx-lose': { label: 'Lose', group: 'Game sounds', caption: 'A falling, sad sound', sfx: 'lose' },
  'fx-alarm': { label: 'Alarm', group: 'Game sounds', caption: 'An alarm rings', sfx: 'alarm' },
  'fx-dice': { label: 'Dice', group: 'Game sounds', caption: 'Dice rattle and roll', sfx: 'dice' },
  ...(Object.fromEntries(
    Object.entries(NOTE_NAMES).map(([id, [name, midi]]) => [id, { label: `Note: ${name}`, group: 'Notes' as const, caption: 'A single musical note', voice: (ctx: BaseAudioContext, out: Out, t: number) => note(ctx, out, t, midi, 1.3) }]),
  ) as Record<keyof typeof NOTE_NAMES, BankSound>),
  'interval-minor-third': { label: 'Minor third', group: 'Intervals', caption: 'Two notes a minor third apart, then together', voice: interval(3) },
  'interval-major-third': { label: 'Major third', group: 'Intervals', caption: 'Two notes a major third apart, then together', voice: interval(4) },
  'interval-fourth': { label: 'Perfect fourth', group: 'Intervals', caption: 'Two notes a fourth apart, then together', voice: interval(5) },
  'interval-fifth': { label: 'Perfect fifth', group: 'Intervals', caption: 'Two notes a fifth apart, then together', voice: interval(7) },
  'interval-octave': { label: 'Octave', group: 'Intervals', caption: 'Two notes an octave apart, then together', voice: interval(12) },
  'chord-major': { label: 'Major chord', group: 'Chords', caption: 'Three notes played up, then together', voice: chord([60, 64, 67]) },
  'chord-minor': { label: 'Minor chord', group: 'Chords', caption: 'Three notes played up, then together', voice: chord([60, 63, 67]) },
  'rhythm-four-beats': { label: 'Four steady beats', group: 'Rhythms', caption: 'Clicks: four steady beats, twice', voice: rhythm([0, 1, 2, 3], 4, [0]) },
  'rhythm-waltz': { label: 'Waltz (three beats)', group: 'Rhythms', caption: 'Clicks: one strong and two light beats, twice', voice: rhythm([0, 1, 2], 3, [0]) },
  'rhythm-gallop': { label: 'Gallop', group: 'Rhythms', caption: 'Clicks in a galloping long-short-short pattern, twice', voice: rhythm([0, 0.5, 0.75, 1, 1.5, 1.75], 2, [0, 1]) },
  'rhythm-offbeat': { label: 'Off-beat', group: 'Rhythms', caption: 'Clicks that land between the beats, twice', voice: rhythm([0, 1.5, 2, 3.5], 4, [0, 2]) },
  'tone-high': { label: 'High tone', group: 'Tones', caption: 'A high, steady tone', voice: (ctx, out, t) => tone(ctx, out, t, 1320, 1320, 0.8) },
  'tone-low': { label: 'Low tone', group: 'Tones', caption: 'A low, steady tone', voice: (ctx, out, t) => tone(ctx, out, t, 165, 165, 0.8) },
  'tone-rising': { label: 'Rising tone', group: 'Tones', caption: 'A tone that rises', voice: (ctx, out, t) => tone(ctx, out, t, 300, 1200, 1.0) },
  'tone-falling': { label: 'Falling tone', group: 'Tones', caption: 'A tone that falls', voice: (ctx, out, t) => tone(ctx, out, t, 1200, 300, 1.0) },
  'tone-three-beeps': {
    label: 'Three beeps',
    group: 'Tones',
    caption: 'Three short beeps',
    voice: (ctx, out, t) => {
      for (let i = 0; i < 3; i++) blip(ctx, out, t + i * 0.3, 880, 880, { dur: 0.15, gain: 0.12, type: 'square' });
      return 0.9;
    },
  },
};

export const BANK_GROUPS: BankGroup[] = ['Notes', 'Intervals', 'Chords', 'Rhythms', 'Tones', 'Game sounds'];
