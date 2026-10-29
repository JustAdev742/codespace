import { MUSIC_ASSETS, SFX_ASSETS, type MusicId, type SfxAssetName } from './assets.generated.ts';
import { LoopPlayer } from './loops.ts';
import { MusicPlayer, TRACKS, type SynthTrackId } from './music.ts';
import { CORE_SFX, SampleBank, sampleFor, type Sample } from './samples.ts';
import { EFFECTS, type SfxName, type SfxOptions } from './sfx.ts';
import { makeReverb } from './synth.ts';

/**
 * Resuming or suspending the audio context can be refused: by autoplay rules, or because the page
 * is being left (Firefox rejects with "Navigated away from page"). Either way the sound stays as
 * it was, so the refusal is not an error worth reporting.
 */
function quietly(p: Promise<void> | undefined): void {
  p?.catch(() => {});
}

/*
 * The one sound engine for the page. Nothing is made until it is needed, and
 * no audio context is created before the person has interacted with the page,
 * as browsers require. Effects and music follow the account's settings, and a
 * device-wide mute (the speaker button in a game) silences both at once.
 *
 * Effects and music are recorded files (rendered offline by tools/audio). An
 * effect whose file is not loaded yet plays its synthesised version from
 * sfx.ts; music waits for its file and falls back to the synthesised loops in
 * music.ts only if the file cannot be had.
 */

const MUTE_KEY = 'ludora.sound.muted';

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** The mix: effects louder than the music, which sits underneath. */
const LEVEL = { master: 0.9, sfx: 1, music: 0.4, reverb: 0.22 };

/** Big moments turn the music down for a moment: how far (gain) and for how long (seconds). */
const DUCK: Partial<Record<SfxAssetName, [depth: number, hold: number]>> = {
  fanfare: [0.3, 2.4],
  jackpot: [0.5, 1.4],
  levelUp: [0.55, 1.6],
  event: [0.5, 1.8],
  win: [0.55, 1.1],
  timeUp: [0.6, 1.0],
  go: [0.6, 0.8],
  capture: [0.7, 0.8],
  'lanternReveal-epic': [0.55, 1.6],
  'lanternReveal-legendary': [0.45, 2.0],
  'lanternReveal-mythic': [0.4, 2.4],
};

/** If a track's file cannot be loaded, the synthesised loop that stands in for it. */
const SYNTH_FALLBACK: Record<MusicId, SynthTrackId> = { lobby: 'lobby', calm: 'lobby', results: 'lobby', game: 'game', market: 'game', battle: 'game', intense: 'game' };

interface Mix {
  sfx: GainNode;
  music: GainNode;
  /** Between the music bus and the master, for ducking under big effects. */
  duck: GainNode;
  reverb: AudioNode;
}

interface Graph extends Mix {
  ctx: AudioContext;
}

/**
 * The mixer: effects and music buses into a master with a shared reverb (for
 * the synthesised sounds; the recordings have their own) and a gentle
 * compressor at the end, which keeps stacked sounds from clipping.
 */
export function buildMix(ctx: BaseAudioContext): Mix {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 10;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;
  const master = ctx.createGain();
  master.gain.value = LEVEL.master;
  master.connect(comp).connect(ctx.destination);
  const sfx = ctx.createGain();
  sfx.gain.value = LEVEL.sfx;
  sfx.connect(master);
  const duck = ctx.createGain();
  duck.connect(master);
  const music = ctx.createGain();
  music.gain.value = LEVEL.music;
  music.connect(duck);
  const reverb = ctx.createGain();
  reverb.gain.value = LEVEL.reverb;
  reverb.connect(makeReverb(ctx)).connect(master);
  return { sfx, music, duck, reverb };
}

/** How a track comes in: after `delay` seconds (the old one fading at once), fading in over `fade`. */
export interface MusicEntry {
  delay: number;
  fade: number;
}

export interface SoundState {
  /** Muted on this device. */
  muted: boolean;
  effects: boolean;
  music: boolean;
}

type Playing = { id: MusicId; player: LoopPlayer } | { id: MusicId; synth: MusicPlayer };

class SoundEngine {
  private graph: Graph | null = null;
  private failed = false;
  private interacted = false;
  private state: SoundState = { muted: readMuted(), effects: true, music: true };
  private wanted: MusicId | null = null;
  private wantedEntry: MusicEntry | null = null;
  private playing: Playing | null = null;
  private readonly bank = new SampleBank();
  /** Tracks whose files could not be loaded this visit; they play their synthesised stand-in. */
  private readonly unavailable = new Set<MusicId>();
  private readonly loading = new Set<MusicId>();
  private duckUntil = 0;
  private readonly lastPlayed = new Map<SfxName, number>();
  private readonly listeners = new Set<() => void>();

  constructor() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.interacted = true;
      quietly(this.graph?.ctx.resume());
      this.syncMusic();
    };
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(type, unlock, { capture: true, passive: true });
    // Nothing plays in a hidden tab, and the music picks up again when it is shown.
    document.addEventListener('visibilitychange', () => {
      if (!this.graph) return;
      if (document.hidden) quietly(this.graph.ctx.suspend());
      else if (this.mayPlay()) quietly(this.graph.ctx.resume());
    });
  }

  private mayPlay(): boolean {
    if (this.interacted) return true;
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    return Boolean(activation?.hasBeenActive);
  }

  private ensure(): Graph | null {
    if (this.graph) return this.graph;
    if (this.failed || typeof window === 'undefined' || !this.mayPlay()) return null;
    const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      this.failed = true;
      return null;
    }
    try {
      const ctx = new Ctor({ latencyHint: 'interactive' });
      this.graph = { ctx, ...buildMix(ctx) };
      this.bank.attach(ctx);
      this.warmUp();
      return this.graph;
    } catch {
      this.failed = true;
      return null;
    }
  }

  /** Loads the effects heard in every game first, then the rest in the background. */
  private warmUp() {
    const core = CORE_SFX.map((k) => SFX_ASSETS[k].url);
    const rest = Object.values(SFX_ASSETS)
      .map((a) => a.url)
      .filter((u) => !core.includes(u));
    void this.bank.loadAll(core).then(() => {
      setTimeout(() => void this.bank.loadAll(rest, 2), 1500);
    });
  }

  /** Plays an effect now, unless effects are off or the device is muted. Returns a stop function for long effects. */
  play(name: SfxName, options: SfxOptions = {}): () => void {
    if (this.state.muted || !this.state.effects) return () => {};
    const g = this.ensure();
    if (!g) return () => {};
    // The same effect asked for twice at once (two screens reacting to one change) plays once.
    const at = performance.now();
    if (at - (this.lastPlayed.get(name) ?? -1e9) < 40) return () => {};
    this.lastPlayed.set(name, at);
    if (g.ctx.state === 'suspended') quietly(g.ctx.resume());
    const key = sampleFor(name, options);
    const duck = key ? DUCK[key] : undefined;
    if (duck) this.duck(g, g.ctx.currentTime + 0.01, duck[0], duck[1]);
    const sample = key ? this.bank.get(SFX_ASSETS[key].url) : null;
    if (key && sample) return this.playSample(g, key, sample, options);
    // Not loaded yet: the synthesised version now, the recording next time.
    if (key) void this.bank.load(SFX_ASSETS[key].url);
    return this.playSynth(g, name, options);
  }

  private playSample(g: Graph, key: SfxAssetName, sample: Sample, options: SfxOptions): () => void {
    const asset = SFX_ASSETS[key];
    const ctx = g.ctx;
    const src = ctx.createBufferSource();
    src.buffer = sample.buffer;
    const voice = ctx.createGain();
    src.connect(voice).connect(g.sfx);
    let when = ctx.currentTime + 0.005;
    let offset = sample.lead;
    if (asset.play === 'rise' && options.seconds !== undefined) {
      // A build-up lands on time: started part-way if there is less time than it lasts, or held back if there is more.
      const land = asset.land ?? asset.seconds;
      if (options.seconds < land) offset += land - Math.max(0.2, options.seconds);
      else when += options.seconds - land;
    }
    if (offset > sample.lead + 0.01) {
      // Starting mid-sound: a quick fade so it does not click.
      voice.gain.setValueAtTime(0, when);
      voice.gain.linearRampToValueAtTime(1, when + 0.03);
    }
    src.start(when, Math.min(offset, sample.buffer.duration - 0.05));
    src.onended = () => voice.disconnect();
    return () => {
      const now = ctx.currentTime;
      voice.gain.cancelScheduledValues(now);
      voice.gain.setValueAtTime(voice.gain.value, now);
      voice.gain.linearRampToValueAtTime(0, now + 0.12);
      try {
        src.stop(now + 0.15);
      } catch {
        // Already finished.
      }
    };
  }

  private playSynth(g: Graph, name: SfxName, options: SfxOptions): () => void {
    const voice = g.ctx.createGain();
    const wet = g.ctx.createGain();
    voice.connect(g.sfx);
    wet.connect(g.reverb);
    const t = g.ctx.currentTime + 0.012;
    let seconds = 1;
    try {
      seconds = EFFECTS[name](g.ctx, { dry: voice, wet }, t, options);
    } catch {
      // A sound that fails to build is skipped; the game goes on without it.
    }
    const cleanup = setTimeout(() => {
      voice.disconnect();
      wet.disconnect();
    }, (seconds + 2.5) * 1000);
    return () => {
      clearTimeout(cleanup);
      const now = g.ctx.currentTime;
      for (const node of [voice, wet]) {
        node.gain.cancelScheduledValues(now);
        node.gain.setValueAtTime(node.gain.value, now);
        node.gain.linearRampToValueAtTime(0, now + 0.12);
      }
      setTimeout(() => {
        voice.disconnect();
        wet.disconnect();
      }, 400);
    };
  }

  /** Turns the music down to `depth` from `at` for `hold` seconds, then eases it back. */
  private duck(g: Graph, at: number, depth: number, hold: number) {
    const until = Math.max(this.duckUntil, at + hold);
    this.duckUntil = until;
    const p = g.duck.gain;
    p.cancelScheduledValues(at);
    p.setTargetAtTime(depth, at, 0.04);
    p.setTargetAtTime(1, until, 0.45);
  }

  /**
   * The music that should be playing, or null for none. It starts once the page may play sound. With
   * `entry`, the track waits before coming in (the results music lets the fanfare finish first).
   */
  setMusic(track: MusicId | null, entry?: MusicEntry) {
    this.wanted = track;
    this.wantedEntry = entry ?? null;
    this.syncMusic();
  }

  /** Fetches music files ahead of need (no audio context required), so a track can start the moment it is wanted. */
  prefetchMusic(tracks: MusicId[]) {
    if (this.state.muted || !this.state.music) return;
    for (const t of tracks) void this.bank.prefetch(MUSIC_ASSETS[t].url);
  }

  private syncMusic() {
    const want = this.state.muted || !this.state.music ? null : this.wanted;
    if (this.playing?.id === want) return;
    if (!want) {
      this.stopPlaying(0.8);
      return;
    }
    const g = this.ensure();
    if (!g) return;
    if (g.ctx.state === 'suspended') quietly(g.ctx.resume());
    const asset = MUSIC_ASSETS[want];
    const sample = this.bank.get(asset.url);
    if (sample) {
      this.startLoop(g, want, sample);
      return;
    }
    if (this.unavailable.has(want)) {
      this.stopPlaying(0.8);
      const synth = new MusicPlayer(g.ctx, g.music, g.reverb, TRACKS[SYNTH_FALLBACK[want]]);
      synth.play();
      this.playing = { id: want, synth };
      return;
    }
    // Whatever is playing carries on until the new track's file is ready, unless the new one waits its turn
    // anyway (at the end of a game the old music makes way for the fanfare at once).
    if (this.wantedEntry) this.stopPlaying(0.6);
    if (this.loading.has(want)) return;
    this.loading.add(want);
    void this.bank.load(asset.url).then((loaded) => {
      this.loading.delete(want);
      if (!loaded) this.unavailable.add(want);
      if (this.wanted === want) this.syncMusic();
    });
  }

  /** Brings in a recorded loop: on the outgoing loop's next bar line when there is one, so the change lands on the beat. */
  private startLoop(g: Graph, id: MusicId, sample: Sample) {
    const now = g.ctx.currentTime;
    const entry = this.wantedEntry;
    const prev = this.playing;
    const player = new LoopPlayer(g.ctx, g.music, id, MUSIC_ASSETS[id], sample.buffer);
    if (entry) {
      this.stopPlaying(0.6);
      player.start(now + entry.delay, entry.fade);
    } else if (prev && 'player' in prev) {
      const bar = prev.player.nextBar(now + 0.15);
      const at = bar - now <= 3 ? bar : now + 0.15;
      // The old loop fades over the beat before the bar line; the new one comes in on it.
      prev.player.stop(at - 60 / prev.player.asset.bpm, 60 / prev.player.asset.bpm + 0.05);
      player.start(at, 0.03);
    } else {
      this.stopPlaying(0.8);
      player.start(now + 0.05, prev ? 0.4 : 1.2);
    }
    this.playing = { id, player };
  }

  private stopPlaying(fade: number) {
    const p = this.playing;
    this.playing = null;
    if (!p) return;
    if ('player' in p) p.player.stop(this.graph?.ctx.currentTime ?? 0, fade);
    else p.synth.stop(fade);
  }

  /** The account's settings: sound effects, and music on the host screen and in solo games. */
  setPrefs(prefs: { effects: boolean; music: boolean }) {
    if (prefs.effects === this.state.effects && prefs.music === this.state.music) return;
    this.state = { ...this.state, ...prefs };
    this.syncMusic();
    this.emit();
  }

  setMuted(muted: boolean) {
    if (muted === this.state.muted) return;
    this.state = { ...this.state, muted };
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // The choice still holds for this visit.
    }
    this.syncMusic();
    this.emit();
  }

  getState = (): SoundState => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

export const sound = new SoundEngine();
