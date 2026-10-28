/*
 * Smoothing for things the server moves (other players in Glow Tag): keep the
 * last few snapshots and draw a little in the past, between two of them, so
 * movement looks continuous at ten updates a second. Angles take the short
 * way round.
 */

interface Snap {
  t: number;
  x: number;
  z: number;
  h: number;
}

const DELAY_MS = 120;

export class Smoother {
  private snaps: Snap[] = [];

  push(t: number, x: number, z: number, h: number) {
    const last = this.snaps[this.snaps.length - 1];
    if (last && t <= last.t) {
      if (t === last.t) Object.assign(last, { x, z, h });
      return;
    }
    this.snaps.push({ t, x, z, h });
    if (this.snaps.length > 8) this.snaps.shift();
  }

  /** Jump straight to a spot (respawn, first sight). */
  reset(t: number, x: number, z: number, h: number) {
    this.snaps = [{ t, x, z, h }];
  }

  /** Where to draw it at game time `now`. Returns null before the first snapshot. */
  at(now: number): { x: number; z: number; h: number; speed: number } | null {
    const s = this.snaps;
    if (!s.length) return null;
    const t = now - DELAY_MS;
    if (s.length === 1 || t <= s[0]!.t) return { x: s[0]!.x, z: s[0]!.z, h: s[0]!.h, speed: 0 };
    for (let i = s.length - 1; i > 0; i--) {
      const a = s[i - 1]!;
      const b = s[i]!;
      if (t >= a.t) {
        const span = Math.max(1, b.t - a.t);
        const k = Math.min(1, (t - a.t) / span);
        let dh = b.h - a.h;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const speed = t > b.t + 250 ? 0 : (Math.hypot(b.x - a.x, b.z - a.z) / span) * 1000;
        return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, h: a.h + dh * k, speed };
      }
    }
    return { x: s[0]!.x, z: s[0]!.z, h: s[0]!.h, speed: 0 };
  }
}
