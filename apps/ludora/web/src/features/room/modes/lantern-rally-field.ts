import type { PulseView } from '@ludora/shared';
import { lapPos } from '@ludora/engine/lantern-rally';

/*
 * Lantern Rally's picture of the race on a device: every kart's distance,
 * lane and speed from the latest view or pulse, carried forward smoothly
 * between updates. The server sends where karts were at a moment of game time
 * (`at` in a view, `t` in a pulse) and how fast they were going; the field
 * runs them on at that speed and eases out any difference when the next
 * update lands, so the karts never jump. Both the 3D scenes and the drawn map
 * read from it. It decides nothing.
 */

export const FLAG = { boost: 1, slow: 2, shield: 4, glow: 8, finished: 16, cough: 32, slip: 64 } as const;

/** A kart in a view, as the engine sends it. */
export interface ViewKart {
  playerId: string;
  name: string;
  teamId: string | null;
  d: number;
  lane: number;
  v: number;
  flags: number;
  place: number;
  lap: number;
  finished: number | null;
  isYou: boolean;
}

export interface RallyPulse {
  t: number;
  k: [string, number, number, number, number][];
}

export interface FieldKart {
  id: string;
  name: string;
  teamId: string | null;
  place: number;
  lap: number;
  finished: number | null;
  me: boolean;
  /** Where it is drawn: metres round (all laps) and lane (fractional while changing lane). */
  d: number;
  lane: number;
  v: number;
  flags: number;
  /** The newest word from the server. */
  srvD: number;
  srvLane: number;
  srvAt: number;
  seen: number;
}

export class RallyField {
  readonly karts = new Map<string, FieldKart>();
  length = 500;
  private lastNow = 0;

  constructor(
    readonly meId: string | null,
    private readonly clock: () => number,
  ) {}

  private sample(id: string, d: number, lane: number, v: number, flags: number, at: number) {
    let k = this.karts.get(id);
    if (!k) {
      k = { id, name: '', teamId: null, place: 0, lap: 1, finished: null, me: id === this.meId, d, lane, v, flags, srvD: d, srvLane: lane, srvAt: at, seen: at };
      this.karts.set(id, k);
      return k;
    }
    if (at < k.srvAt) return k;
    // A new race (a Grand Prix's next grid) or a big correction: jump rather than slide.
    if (Math.abs(d - (k.srvD + (k.v * (at - k.srvAt)) / 1000)) > 40) {
      k.d = d;
      k.lane = lane;
    }
    k.srvD = d;
    k.srvLane = lane;
    k.srvAt = at;
    k.v = v;
    k.flags = flags;
    k.seen = at;
    return k;
  }

  applyView(view: { karts: ViewKart[]; at: number; length: number }) {
    this.length = view.length;
    for (const vk of view.karts) {
      const k = this.sample(vk.playerId, vk.d, vk.lane, vk.v, vk.flags, view.at);
      k.name = vk.name;
      k.teamId = vk.teamId;
      k.place = vk.place;
      k.lap = vk.lap;
      k.finished = vk.finished;
      k.me = vk.isYou || vk.playerId === this.meId;
      k.seen = Math.max(k.seen, view.at);
    }
  }

  applyPulse(p: PulseView<RallyPulse>) {
    const { t, k } = p.d;
    for (const [id, d10, lane, v10, flags] of k) this.sample(id, d10 / 10, lane, v10 / 10, flags, t);
  }

  /** Move every kart on to the game clock. Call once a frame; returns the game time used. */
  update(): number {
    const now = this.clock();
    const dt = Math.min(0.25, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    for (const [id, k] of this.karts) {
      // Gone from every update for a while: left the game.
      if (now - k.seen > 4000 && !k.me) {
        this.karts.delete(id);
        continue;
      }
      const ahead = Math.max(0, Math.min(1500, now - k.srvAt));
      const target = k.srvD + (k.v * ahead) / 1000;
      k.d += k.v * dt;
      k.d += (target - k.d) * Math.min(1, dt * 3);
      if (Math.abs(target - k.d) > 25) k.d = target;
      const dl = k.srvLane - k.lane;
      const step = dt * 5;
      k.lane = Math.abs(dl) <= step ? k.srvLane : k.lane + Math.sign(dl) * step;
    }
    return now;
  }

  list(): FieldKart[] {
    return [...this.karts.values()];
  }

  me(): FieldKart | null {
    return this.meId ? (this.karts.get(this.meId) ?? null) : null;
  }

  /** Where on the lap a kart is drawn, 0 to the lap length. */
  lapPos(k: FieldKart): number {
    return lapPos(k.d, this.length);
  }
}
