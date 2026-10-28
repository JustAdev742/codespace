import type { PulseView } from '@ludora/shared';
import {
  FLAGS,
  MOVE,
  TAG,
  type ArenaMap,
  type BeamView,
  type CrateView,
  type GlowTagHostView,
  type GlowTagPlayerView,
  type GlowTagPulse,
  type GlowTagYou,
  type RingCircle,
} from '@ludora/engine/glow-tag';
import { headingTo, inCone, lineOfSight, ringAt, walk, wrapAngle } from '@ludora/engine/glow-tag-arena';
import { Smoother } from '../../../three/net.ts';
import type { MoveInput } from '../../../three/input.ts';

/*
 * Glow Tag on the client: what both pictures (the 3D park and the flat map
 * shown with 3D off) draw, and your own walking.
 *
 * Everyone else is drawn from what the server said: full views and pulses,
 * smoothed a little in the past so ten updates a second look continuous.
 * You are predicted: your Glim walks at once, with the same walking and cover
 * code the server runs, and your moves go out at most eight times a second.
 * When the server puts you somewhere else (a step it cut short, a relight),
 * the picture eases to its answer, or jumps when it is far off.
 *
 * In Lights Out a player is drawn only while the server shows them to you:
 * your own view lists the players near you, the pulse the ones everyone sees.
 */

export type AnyView = GlowTagPlayerView | GlowTagHostView;

/** A player as the pictures draw them. */
export interface Drawn {
  id: string;
  name: string;
  team: string | null;
  colour: string;
  x: number;
  z: number;
  h: number;
  speed: number;
  /** In the arena (not dimmed). */
  in: boolean;
  /** Drawn at all: in the arena, and (in Lights Out) shown to you. */
  visible: boolean;
  glow: number;
  f: number;
  me: boolean;
}

interface Known {
  id: string;
  name: string;
  team: string | null;
  smoother: Smoother;
  /** The newest position the server gave, for aiming (the smoother draws a little behind it). */
  latest: { t: number; x: number; z: number; h: number } | null;
  glow: number;
  f: number;
  flagsAt: number;
  /** The latest view showed where they are. */
  viewSeen: boolean;
  /** The latest pulse listed them. */
  pulseSeen: boolean;
}

export interface Aim {
  target: { id: string; name: string } | null;
  /** Why the Tag button cannot be pressed, when it cannot. */
  reason: string | null;
}

/** How fast you turn with A and D (or the stick), radians a second. */
const TURN = 2.7;
/** Walk just under the server's speed so it never has to cut a step short. */
const PACE = 0.96;
/** Walking backwards is slower. */
const BACK = 0.7;
/** Moves go out at most this often. */
const SEND_MS = 1000 / MOVE.rate;
/** Further off than this from the server, you jump rather than ease. */
const SNAP = 1.5;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** A bright colour for a player with no team, the same every time for them. */
export function playerColour(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const hue = ((h >>> 0) % 24) * 15;
  return `hsl(${hue} 90% 62%)`;
}

export function teamColour(hue: number): string {
  return `hsl(${hue} 88% 60%)`;
}

export class Field {
  private known = new Map<string, Known>();
  private order: string[] = [];
  private view: AnyView | null = null;
  private teamHue = new Map<string, number>();
  /** Your predicted spot. */
  readonly pos = { x: 0, z: 0, h: 0 };
  private placed = false;
  private inArena = false;
  private moving = false;
  private sent: { t: number; x: number; z: number }[] = [];
  private lastSend = -1e9;
  private dirty = false;
  private fix = { x: 0, z: 0 };
  private speedUntil = 0;

  constructor(
    readonly map: ArenaMap,
    readonly meId: string | null,
    readonly now: () => number,
  ) {}

  get lightsOut(): boolean {
    return Boolean(this.view?.rules.lightsOut);
  }

  get maxGlow(): number {
    return this.view?.rules.glow ?? 3;
  }

  /** You are walking (for the camera and your Glim's feet). */
  get walking(): boolean {
    return this.moving;
  }

  /* --------------------------------- updates -------------------------------- */

  applyView(v: AnyView) {
    this.view = v;
    for (const t of v.teams ?? []) this.teamHue.set(t.id, t.hue);
    const listed = new Set<string>();
    for (const [id, name, team, x, z, h, glow, f] of v.players) {
      listed.add(id);
      const k = this.ensure(id, name, team);
      k.name = name;
      k.team = team;
      if (v.at >= k.flagsAt) {
        k.glow = glow;
        k.f = f;
        k.flagsAt = v.at;
      }
      k.viewSeen = x !== null;
      if (x !== null && z !== null && h !== null && id !== this.meId) this.place(k, v.at, x, z, h);
    }
    for (const id of this.known.keys()) {
      if (!listed.has(id)) this.known.delete(id);
    }
    this.order = v.players.map((p) => p[0]);
    const you = 'you' in v ? v.you : null;
    if (you && this.meId) this.applyYou(you);
  }

  applyPulse(p: PulseView<GlowTagPulse>) {
    const d = p.d;
    if (!d || !Array.isArray(d.p)) return;
    const t = p.gameNow;
    const listed = new Set<string>();
    for (const [id, x10, z10, h100, f, glow] of d.p) {
      const k = this.known.get(id);
      if (!k) continue;
      listed.add(id);
      if (t >= k.flagsAt) {
        k.f = f;
        k.glow = glow;
        k.flagsAt = t;
      }
      const x = x10 / 10;
      const z = z10 / 10;
      const h = h100 / 100;
      if (id === this.meId) this.reconcile(x, z);
      else this.place(k, t, x, z, h);
    }
    for (const k of this.known.values()) k.pulseSeen = listed.has(k.id);
  }

  private ensure(id: string, name: string, team: string | null): Known {
    let k = this.known.get(id);
    if (!k) {
      k = { id, name, team, smoother: new Smoother(), latest: null, glow: 0, f: 0, flagsAt: -1, viewSeen: false, pulseSeen: false };
      this.known.set(id, k);
    }
    return k;
  }

  private place(k: Known, t: number, x: number, z: number, h: number) {
    const was = k.latest;
    // A big jump (a relight, or first sight) is drawn as a jump, not a slide across the park.
    if (!was || Math.hypot(was.x - x, was.z - z) > 6) k.smoother.reset(t, x, z, h);
    else k.smoother.push(t, x, z, h);
    if (!was || t >= was.t) k.latest = { t, x, z, h };
  }

  private applyYou(you: GlowTagYou) {
    this.speedUntil = you.speedUntil;
    if (!you.in) {
      this.inArena = false;
      this.moving = false;
      if (!this.placed) {
        this.pos.x = you.x;
        this.pos.z = you.z;
        this.pos.h = you.h;
        this.placed = true;
      }
      return;
    }
    if (!this.placed || !this.inArena) {
      // First sight, or relit somewhere new: go straight there.
      this.pos.x = you.x;
      this.pos.z = you.z;
      this.pos.h = you.h;
      this.fix = { x: 0, z: 0 };
      this.sent = [];
      this.placed = true;
      this.inArena = true;
      return;
    }
    this.reconcile(you.x, you.z);
  }

  /** The server says you are at (x, z). Fine if that is somewhere you recently sent; otherwise ease (or jump) there. */
  private reconcile(x: number, z: number) {
    if (!this.placed || !this.inArena) return;
    const now = this.now();
    this.sent = this.sent.filter((s) => now - s.t < 1500);
    if (this.sent.some((s) => Math.hypot(s.x - x, s.z - z) < 0.3)) return;
    const ex = x - this.pos.x;
    const ez = z - this.pos.z;
    const err = Math.hypot(ex, ez);
    if (err < 0.05) return;
    if (err > SNAP) {
      this.pos.x = x;
      this.pos.z = z;
      this.fix = { x: 0, z: 0 };
      return;
    }
    this.fix = { x: ex, z: ez };
  }

  /* ------------------------------ your walking ------------------------------ */

  /** Move along one frame: walk from the input, send moves, ease any correction. */
  step(dt: number, input: MoveInput, paused: boolean, fire: (a: unknown) => void) {
    if (!this.meId || !this.placed || !this.inArena || paused) {
      this.moving = false;
      return;
    }
    const now = this.now();
    if (this.fix.x || this.fix.z) {
      const k = 1 - Math.exp(-dt * 8);
      const fx = this.fix.x * k;
      const fz = this.fix.z * k;
      [this.pos.x, this.pos.z] = walk(this.map, this.pos.x, this.pos.z, this.pos.x + fx, this.pos.z + fz);
      this.fix.x -= fx;
      this.fix.z -= fz;
      if (Math.hypot(this.fix.x, this.fix.z) < 0.01) this.fix = { x: 0, z: 0 };
    }
    const turn = input.x;
    const fwd = input.y;
    this.moving = false;
    if (Math.abs(turn) > 0.05 || Math.abs(fwd) > 0.05) {
      this.pos.h = wrapAngle(this.pos.h - turn * TURN * dt);
      if (Math.abs(fwd) > 0.05) {
        const speed = MOVE.speed * PACE * (now < this.speedUntil ? MOVE.boost : 1) * (fwd < 0 ? BACK : 1);
        const d = fwd * speed * dt;
        [this.pos.x, this.pos.z] = walk(this.map, this.pos.x, this.pos.z, this.pos.x + Math.sin(this.pos.h) * d, this.pos.z + Math.cos(this.pos.h) * d);
        this.moving = true;
      }
      this.dirty = true;
    }
    if (this.dirty && now - this.lastSend >= SEND_MS) this.send(fire, now);
  }

  private send(fire: (a: unknown) => void, now: number) {
    const x = r2(this.pos.x);
    const z = r2(this.pos.z);
    fire({ type: 'move', x, z, h: r3(this.pos.h) });
    this.sent.push({ t: now, x, z });
    if (this.sent.length > 16) this.sent.shift();
    this.lastSend = now;
    this.dirty = false;
  }

  /** Turn to face a heading and tell the server at once (before a tag). */
  face(h: number, fire: (a: unknown) => void) {
    if (!this.inArena) return;
    this.pos.h = wrapAngle(h);
    this.send(fire, this.now());
  }

  /* --------------------------------- reading -------------------------------- */

  private colourOf(k: Known): string {
    const hue = k.team ? this.teamHue.get(k.team) : undefined;
    return hue !== undefined ? teamColour(hue) : playerColour(k.id);
  }

  /** Everyone, as drawn at game time `now`. */
  players(now = this.now()): Drawn[] {
    const out: Drawn[] = [];
    for (const id of this.order) {
      const k = this.known.get(id);
      if (!k) continue;
      const isIn = Boolean(k.f & FLAGS.in);
      if (id === this.meId) {
        out.push({ id, name: k.name, team: k.team, colour: this.colourOf(k), x: this.pos.x, z: this.pos.z, h: this.pos.h, speed: this.moving ? MOVE.speed : 0, in: this.inArena && isIn, visible: this.inArena && isIn, glow: k.glow, f: k.f, me: true });
        continue;
      }
      const at = k.smoother.at(now);
      if (!at) continue;
      const shown = !this.lightsOut || k.viewSeen || k.pulseSeen;
      out.push({ id, name: k.name, team: k.team, colour: this.colourOf(k), x: at.x, z: at.z, h: at.h, speed: at.speed, in: isIn, visible: isIn && shown, glow: k.glow, f: k.f, me: false });
    }
    return out;
  }

  /** The ring now, and the next one if it is shown. */
  ring(now = this.now()): { cur: RingCircle; next: RingCircle | null; final: boolean } | null {
    const r = this.view?.ring;
    if (!r) return null;
    return { cur: ringAt({ from: r.from, to: r.to, startAt: r.startAt, endAt: r.endAt }, now), next: r.next, final: r.final };
  }

  crates(): CrateView[] {
    return this.view?.crates ?? [];
  }

  beams(): BeamView[] {
    return this.view?.beams ?? [];
  }

  /** Who the Tag button would tag now, or why it cannot. */
  aim(you: GlowTagYou | null | undefined): Aim {
    if (!you || !this.meId) return { target: null, reason: 'Watching' };
    if (!you.in) return { target: null, reason: you.out ? 'You are out' : 'You are dimmed' };
    const now = this.now();
    if (you.charges < 1) return { target: null, reason: 'No charge: answer a question' };
    if (now < you.cooldownUntil) return { target: null, reason: 'Recharging' };
    const teams = Boolean(this.view?.teams);
    let best: { k: Known; d: number } | null = null;
    let flickering = false;
    for (const k of this.known.values()) {
      if (k.id === this.meId || !k.latest || !(k.f & FLAGS.in)) continue;
      if (teams && you.team !== null && k.team === you.team) continue;
      if (this.lightsOut && !k.viewSeen && !k.pulseSeen) continue;
      const { x, z } = k.latest;
      const d = Math.hypot(x - this.pos.x, z - this.pos.z);
      if (d > TAG.range - 0.3) continue;
      if (!inCone(this.pos.h, headingTo(this.pos.x, this.pos.z, x, z), d, TAG.coneDeg)) continue;
      if (!lineOfSight(this.map, this.pos.x, this.pos.z, x, z)) continue;
      if (k.f & FLAGS.safe) {
        flickering = true;
        continue;
      }
      if (!best || d < best.d) best = { k, d };
    }
    if (best) return { target: { id: best.k.id, name: best.k.name }, reason: null };
    return { target: null, reason: flickering ? 'They are flickering' : 'Nobody in front of you' };
  }

  /** The heading that faces a player (their newest known spot). */
  headingToward(id: string): number | null {
    const k = this.known.get(id);
    if (!k?.latest) return null;
    return headingTo(this.pos.x, this.pos.z, k.latest.x, k.latest.z);
  }
}
