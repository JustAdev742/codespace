// The cast: the game's own 3D Glims, built by the game's own code, directed for the film.
import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, AdditiveBlending, Color } from 'three';
import { GLIMS } from '@ludora/content';
import { Glim3D, type GlimAction } from '../../../../web/src/three/glim3d.ts';
import type { Quality } from '../../../../web/src/three/quality.ts';
import { FPS, rng } from './engine.ts';

const QUALITY: Quality = { tier: 'high', dpr: 1, antialias: true, shadows: false, outlines: true, particles: 1, drawDistance: 140, texture: 512 };
/** One Glim unit (about its own height and a half) in screen pixels. */
export const GLIM_SCALE = 330;

type Cue = { at: number; do: (a: Actor) => void };

/** A Glim with a script. Its pose at a time is found by playing its script from the start, so any frame can be drawn on its own. */
export class Actor extends Group {
  readonly glim: Glim3D;
  private cues: Cue[] = [];
  private simT = 0;
  private nextCue = 0;
  /** Where it stands at time t (seconds into its shot): set by the shot. */
  path: ((t: number) => { x: number; y: number; z: number; turn?: number; squash?: number; moving?: number }) | null = null;
  constructor(readonly who: string, scale = GLIM_SCALE) {
    super();
    const item = GLIMS.find((g) => g.id === who) ?? GLIMS[0]!;
    this.glim = new Glim3D({ look: { art: item.art as never, rarity: item.rarity, uniform: false, dress: null }, quality: QUALITY, reducedMotion: false });
    this.glim.scale.setScalar(scale);
    this.add(this.glim);
  }
  cue(at: number, action: GlimAction | ((a: Actor) => void)) {
    this.cues.push({ at, do: typeof action === 'function' ? action : (a) => a.glim.play(action) });
    this.cues.sort((a, b) => a.at - b.at);
    return this;
  }
  /** Bring the actor to time `t` of its shot. Going backwards starts its script again. */
  seek(t: number) {
    if (t < this.simT - 1e-6) { this.simT = 0; this.nextCue = 0; this.glim.play('idle'); }
    const dt = 1 / FPS;
    while (this.simT + dt <= t + 1e-6) {
      this.simT += dt;
      while (this.nextCue < this.cues.length && this.cues[this.nextCue]!.at <= this.simT) this.cues[this.nextCue++]!.do(this);
      if (this.path) {
        const p = this.path(this.simT);
        this.glim.setMoving(p.moving ?? 0);
      }
      this.glim.update(dt);
    }
    if (this.path) {
      const p = this.path(t);
      this.position.set(p.x, p.y, p.z);
      this.rotation.y = p.turn ?? 0;
      const s = p.squash ?? 1;
      this.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    }
  }
}

/** A hop along a line: up and over, with a squash on landing. Returns the pose at progress 0..1 of `hops` hops. */
export function hop(p: number, hops: number, height: number) {
  const u = (p * hops) % 1;
  const done = p >= 1;
  const y = done ? 0 : Math.sin(u * Math.PI) * height;
  const land = done ? 0 : Math.max(0, 1 - u * 6) + Math.max(0, (u - 0.86) * 7);
  return { y, squash: 1 - 0.16 * Math.min(1, land) + (u > 0.15 && u < 0.6 ? 0.06 : 0) };
}

const CAST = [
  'glim-pebblet', 'glim-sprig', 'glim-mossbun', 'glim-dandelump', 'glim-capling',
];

/** Picks `n` different Glims from across the whole collection, the same ones every time. */
export function casting(n: number, seed = 11): string[] {
  const r = rng(seed);
  const pool = GLIMS.map((g) => g.id).filter((id) => !CAST.slice(0, 1).includes(id));
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]!);
  return out;
}

/** The pool of light a Glim stands in: a flat disc on the floor. */
export function floorLight(radius: number, color = '#ffe2a0', strength = 0.9) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.55, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const m = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: AdditiveBlending, color: new Color(color).multiplyScalar(strength) }));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(radius * 2, radius * 2, 1);
  m.renderOrder = -4;
  return m;
}
