import { bass, bell, kick, noiseHit, pad, pluck, type Out } from './synth.ts';

/*
 * Ludora's music: two original loops in D major pentatonic, the lantern-festival
 * sound of plucked notes, soft pads and little bells.
 * - Lobby: relaxed, while players arrive. Sixteen bars, a tune and an answer.
 * - Game: lighter and steadier under the questions, so it never competes with
 *   thinking. Eight bars.
 * A track is plain data; `eventsAt` turns a step of it into notes, and
 * MusicPlayer plays those on a clock that schedules a little ahead.
 */

export type TrackId = 'lobby' | 'game';

/** A note in a part: `step` is a 16th note from the start of the loop, `len` is in 16ths. */
export interface PartNote {
  step: number;
  len: number;
  midi: number;
}

export interface Chord {
  /** Pad voicing. */
  notes: number[];
  bass: number;
}

export interface Track {
  id: TrackId;
  bpm: number;
  bars: number;
  /** One chord per bar. */
  chords: Chord[];
  melody: PartNote[];
  bells: PartNote[];
  /** Steps within a bar, and how long each bass note lasts. */
  bass: { step: number; len: number }[];
  kick: number[];
  snare: number[];
  shaker: number[];
  /** Plucked chord tones on these steps of each bar (chord note index, an octave up). */
  arp: { step: number; index: number }[];
  level: { melody: number; bells: number; pad: number; bass: number; kick: number; snare: number; shaker: number; arp: number };
}

const D: Chord = { notes: [62, 66, 69], bass: 38 };
const Bm: Chord = { notes: [59, 62, 66], bass: 47 };
const G: Chord = { notes: [59, 62, 67], bass: 43 };
const A: Chord = { notes: [61, 64, 69], bass: 45 };

/** Notes written bar by bar as [step in bar, length, midi]. */
function bars(...list: [number, number, number][][]): PartNote[] {
  return list.flatMap((bar, i) => bar.map(([step, len, midi]) => ({ step: i * 16 + step, len, midi })));
}

export const LOBBY: Track = {
  id: 'lobby',
  bpm: 96,
  bars: 16,
  chords: [D, Bm, G, A, D, Bm, G, A, D, Bm, G, A, D, Bm, G, A],
  melody: bars(
    // The tune.
    [[0, 3, 78], [3, 1, 76], [4, 4, 74], [10, 2, 69], [12, 4, 71]],
    [[0, 6, 74], [6, 2, 71], [8, 4, 69], [12, 4, 66]],
    [[0, 3, 71], [3, 3, 74], [6, 2, 76], [8, 4, 74], [12, 2, 71], [14, 2, 69]],
    [[0, 8, 69], [8, 4, 76]],
    [[0, 3, 78], [3, 3, 81], [6, 2, 78], [8, 4, 76], [12, 4, 74]],
    [[0, 4, 71], [4, 4, 74], [8, 4, 78], [12, 4, 76]],
    [[0, 3, 74], [3, 3, 71], [6, 2, 69], [8, 2, 71], [10, 2, 74], [12, 4, 76]],
    [[0, 2, 76], [2, 2, 74], [4, 12, 69]],
    // The answer: higher, with room to breathe.
    [[0, 2, 81], [2, 2, 78], [4, 4, 74], [12, 2, 76], [14, 2, 78]],
    [[0, 8, 81], [10, 2, 83], [12, 4, 81]],
    [[0, 2, 83], [2, 2, 81], [4, 4, 78], [12, 4, 74]],
    [[0, 4, 76], [4, 4, 81], [8, 8, 76]],
    [[0, 3, 74], [3, 3, 78], [6, 2, 81], [8, 4, 86], [12, 4, 83]],
    [[0, 4, 81], [4, 4, 78], [8, 8, 74]],
    [[0, 2, 71], [2, 2, 74], [4, 4, 76], [8, 4, 74], [12, 4, 71]],
    [[0, 4, 76], [4, 4, 73], [8, 8, 69]],
  ),
  bells: bars([], [], [], [], [], [], [], [], [[0, 8, 86]], [], [[0, 8, 83]], [], [[0, 8, 90]], [], [[0, 8, 88]], []),
  bass: [
    { step: 0, len: 6 },
    { step: 10, len: 4 },
  ],
  kick: [0],
  snare: [],
  shaker: [2, 6, 10, 14],
  arp: [],
  level: { melody: 0.15, bells: 0.06, pad: 0.07, bass: 0.14, kick: 0.08, snare: 0, shaker: 0.022, arp: 0 },
};

export const GAME: Track = {
  id: 'game',
  bpm: 112,
  bars: 8,
  chords: [Bm, G, D, A, Bm, G, D, A],
  melody: bars(
    [[0, 2, 83], [2, 2, 81], [4, 4, 78]],
    [[0, 4, 74], [4, 2, 76], [6, 2, 78]],
    [[0, 2, 81], [2, 2, 78], [4, 4, 74]],
    [[0, 4, 76], [6, 2, 74], [8, 8, 69]],
    [[0, 2, 86], [2, 2, 83], [4, 4, 81]],
    [[0, 4, 83], [4, 4, 81], [8, 4, 78]],
    [[0, 2, 81], [2, 2, 83], [4, 4, 86]],
    [[0, 4, 88], [4, 4, 85], [8, 8, 81]],
  ),
  bells: bars([], [], [], [[8, 8, 93]], [], [], [], [[8, 8, 90]]),
  bass: [
    { step: 0, len: 3 },
    { step: 6, len: 2 },
    { step: 8, len: 3 },
    { step: 12, len: 2 },
  ],
  kick: [0, 8],
  snare: [4, 12],
  shaker: [0, 2, 4, 6, 8, 10, 12, 14],
  arp: [
    { step: 0, index: 0 },
    { step: 2, index: 1 },
    { step: 4, index: 2 },
    { step: 6, index: 1 },
    { step: 8, index: 0 },
    { step: 10, index: 1 },
    { step: 12, index: 2 },
    { step: 14, index: 1 },
  ],
  level: { melody: 0.1, bells: 0.045, pad: 0.05, bass: 0.16, kick: 0.13, snare: 0.028, shaker: 0.016, arp: 0.06 },
};

export const TRACKS: Record<TrackId, Track> = { lobby: LOBBY, game: GAME };

/** Seconds per 16th note. */
export const stepSeconds = (track: Track) => 60 / track.bpm / 4;

export type MusicEvent =
  | { kind: 'melody' | 'bells'; midi: number; len: number }
  | { kind: 'pad'; notes: number[]; len: number }
  | { kind: 'bass'; midi: number; len: number }
  | { kind: 'arp'; midi: number }
  | { kind: 'kick' | 'snare' | 'shaker'; accent: boolean };

/** Everything that starts on absolute step `n` of a track that loops forever. */
export function eventsAt(track: Track, n: number): MusicEvent[] {
  const loop = track.bars * 16;
  const step = ((n % loop) + loop) % loop;
  const bar = Math.floor(step / 16);
  const inBar = step % 16;
  const chord = track.chords[bar]!;
  const out: MusicEvent[] = [];
  for (const note of track.melody) if (note.step === step) out.push({ kind: 'melody', midi: note.midi, len: note.len });
  for (const note of track.bells) if (note.step === step) out.push({ kind: 'bells', midi: note.midi, len: note.len });
  if (inBar === 0) out.push({ kind: 'pad', notes: chord.notes, len: 16 });
  for (const b of track.bass) if (b.step === inBar) out.push({ kind: 'bass', midi: chord.bass, len: b.len });
  for (const a of track.arp) if (a.step === inBar) out.push({ kind: 'arp', midi: chord.notes[a.index % chord.notes.length]! + 12 });
  if (track.kick.includes(inBar)) out.push({ kind: 'kick', accent: inBar === 0 });
  if (track.snare.includes(inBar)) out.push({ kind: 'snare', accent: false });
  if (track.shaker.includes(inBar)) out.push({ kind: 'shaker', accent: inBar % 4 === 2 });
  return out;
}

/** Plays one event at time `t`. */
export function playEvent(ctx: BaseAudioContext, out: Out, track: Track, e: MusicEvent, t: number) {
  const s = stepSeconds(track);
  const lv = track.level;
  switch (e.kind) {
    case 'melody':
      pluck(ctx, out, t, e.midi, { gain: lv.melody, decay: Math.min(1.4, 0.35 + e.len * s * 0.8), wet: 0.3 });
      break;
    case 'bells':
      bell(ctx, out, t, e.midi, { gain: lv.bells, decay: 1.6 });
      break;
    case 'pad':
      pad(ctx, out, t, e.notes, e.len * s, { gain: lv.pad });
      break;
    case 'bass':
      bass(ctx, out, t, e.midi, e.len * s, { gain: lv.bass });
      break;
    case 'arp':
      pluck(ctx, out, t, e.midi, { gain: lv.arp, decay: 0.28, wet: 0.2, bright: 4 });
      break;
    case 'kick':
      kick(ctx, out, t, { gain: lv.kick * (e.accent ? 1 : 0.8) });
      break;
    case 'snare':
      noiseHit(ctx, out, t, { dur: 0.09, freq: 1800, q: 0.9, gain: lv.snare, wet: 0.15 });
      break;
    case 'shaker':
      noiseHit(ctx, out, t, { dur: 0.04, freq: 7500, q: 1.4, type: 'highpass', gain: lv.shaker * (e.accent ? 1.25 : 0.8) });
      break;
  }
}

/** Schedules `seconds` of a track from time `t`, all at once. For rendering previews offline. */
export function scheduleTrack(ctx: BaseAudioContext, out: Out, track: Track, t: number, seconds: number) {
  const s = stepSeconds(track);
  for (let n = 0; n * s < seconds; n++) for (const e of eventsAt(track, n)) playEvent(ctx, out, track, e, t + n * s);
}

/**
 * Plays a track live: every 25 ms it schedules the notes due in the next 150 ms,
 * so timing stays exact even when the page is busy. Each player has its own
 * gain, so stopping fades it out without cutting other sounds.
 */
export class MusicPlayer {
  private readonly bus: GainNode;
  private readonly wet: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private start = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    dry: AudioNode,
    reverb: AudioNode,
    readonly track: Track,
  ) {
    this.bus = ctx.createGain();
    this.wet = ctx.createGain();
    this.bus.connect(dry);
    this.wet.connect(reverb);
  }

  play(fadeIn = 1.2) {
    const now = this.ctx.currentTime;
    this.start = now + 0.08;
    this.next = 0;
    for (const g of [this.bus, this.wet]) {
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(1, now + fadeIn);
    }
    this.tick();
    this.timer = setInterval(() => this.tick(), 25);
  }

  private tick() {
    const s = stepSeconds(this.track);
    const horizon = this.ctx.currentTime + 0.15;
    const out: Out = { dry: this.bus, wet: this.wet };
    while (this.start + this.next * s < horizon) {
      const t = this.start + this.next * s;
      // A step that fell behind (the tab was busy) is skipped rather than played late.
      if (t >= this.ctx.currentTime - 0.01) for (const e of eventsAt(this.track, this.next)) playEvent(this.ctx, out, this.track, e, t);
      this.next++;
    }
  }

  stop(fadeOut = 0.8) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const now = this.ctx.currentTime;
    for (const g of [this.bus, this.wet]) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + fadeOut);
    }
    setTimeout(() => {
      this.bus.disconnect();
      this.wet.disconnect();
    }, (fadeOut + 2) * 1000);
  }
}
