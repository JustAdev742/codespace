import { EFFECTS, type SfxName, type SfxOptions } from './sfx.ts';
import { MusicPlayer, TRACKS, type TrackId } from './music.ts';
import { makeReverb } from './synth.ts';

/*
 * The one sound engine for the page. Nothing is made until it is needed, and
 * no audio context is created before the person has interacted with the page,
 * as browsers require. Effects and music follow the account's settings, and a
 * device-wide mute (the speaker button in a game) silences both at once.
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

interface Mix {
  sfx: GainNode;
  music: GainNode;
  reverb: AudioNode;
}

interface Graph extends Mix {
  ctx: AudioContext;
}

/**
 * The mixer: effects and music buses into a master with a shared reverb and a
 * gentle compressor at the end, which keeps stacked sounds from clipping. The
 * same mix renders the previews offline.
 */
export function buildMix(ctx: BaseAudioContext): Mix {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;
  const master = ctx.createGain();
  master.gain.value = LEVEL.master;
  master.connect(comp).connect(ctx.destination);
  const sfx = ctx.createGain();
  sfx.gain.value = LEVEL.sfx;
  sfx.connect(master);
  const music = ctx.createGain();
  music.gain.value = LEVEL.music;
  music.connect(master);
  const reverb = ctx.createGain();
  reverb.gain.value = LEVEL.reverb;
  reverb.connect(makeReverb(ctx)).connect(master);
  return { sfx, music, reverb };
}

export interface SoundState {
  /** Muted on this device. */
  muted: boolean;
  effects: boolean;
  music: boolean;
}

class SoundEngine {
  private graph: Graph | null = null;
  private failed = false;
  private interacted = false;
  private state: SoundState = { muted: readMuted(), effects: true, music: true };
  private wanted: TrackId | null = null;
  private player: MusicPlayer | null = null;
  private readonly lastPlayed = new Map<SfxName, number>();
  private readonly listeners = new Set<() => void>();

  constructor() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.interacted = true;
      void this.graph?.ctx.resume();
      this.syncMusic();
    };
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(type, unlock, { capture: true, passive: true });
    // Nothing plays in a hidden tab, and the music picks up again when it is shown.
    document.addEventListener('visibilitychange', () => {
      if (!this.graph) return;
      if (document.hidden) void this.graph.ctx.suspend();
      else if (this.mayPlay()) void this.graph.ctx.resume();
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
      return this.graph;
    } catch {
      this.failed = true;
      return null;
    }
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
    if (g.ctx.state === 'suspended') void g.ctx.resume();
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

  /** The music that should be playing, or null for none. It starts once the page may play sound. */
  setMusic(track: TrackId | null) {
    this.wanted = track;
    this.syncMusic();
  }

  private syncMusic() {
    const want = this.state.muted || !this.state.music ? null : this.wanted;
    if (this.player && this.player.track.id === want) return;
    this.player?.stop();
    this.player = null;
    if (!want) return;
    const g = this.ensure();
    if (!g) return;
    if (g.ctx.state === 'suspended') void g.ctx.resume();
    this.player = new MusicPlayer(g.ctx, g.music, g.reverb, TRACKS[want]);
    this.player.play();
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
