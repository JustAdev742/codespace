// Film engine: a deterministic renderAt(t) over an SVG stage.
//
// Nothing here knows the wall clock. A scene is a pure function of film time,
// so the same code previews live in a browser and renders frame-by-frame to
// video without drift. Times come from build/timeline.json, which mix.py lays
// out from the recorded dialogue.

export const NS = "http://www.w3.org/2000/svg";

export function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  if (parent) parent.appendChild(node);
  return node;
}

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, u) => a + (b - a) * u;

export const ease = {
  lin: (u) => u,
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
  io: (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2),
  in3: (u) => u * u * u,
  out3: (u) => 1 - Math.pow(1 - u, 3),
  io3: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  back: (u) => 1 + 2.70158 * Math.pow(u - 1, 3) + 1.70158 * Math.pow(u - 1, 2),
  elastic: (u) => (u === 0 || u === 1 ? u : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  bounce: (u) => {
    const n = 7.5625, d = 2.75;
    if (u < 1 / d) return n * u * u;
    if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75;
    if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375;
    return n * (u -= 2.625 / d) * u + 0.984375;
  },
};

/** Eased 0..1 progress of t across [t0, t1]. */
export const prog = (t, t0, t1, e = "io") => ease[e](clamp((t - t0) / Math.max(1e-6, t1 - t0)));

/** 0 -> 1 -> 0 hump over [t0, t0+dur], peaking at `peak` of the way through. */
export const hump = (t, t0, dur, peak = 0.5) => {
  const u = (t - t0) / dur;
  if (u <= 0 || u >= 1) return 0;
  return u < peak ? ease.out(u / peak) : ease.io(1 - (u - peak) / (1 - peak));
};

/** Deterministic hash noise in [-1, 1], smooth in t. */
export function wobble(t, seed = 0, speed = 1) {
  const x = t * speed + seed * 17.13;
  const i = Math.floor(x), f = x - i;
  const h = (n) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u);
}

export function mix(a, b, u) {
  if (typeof b === "number" && typeof a === "number") return a + (b - a) * u;
  if (Array.isArray(b) && Array.isArray(a)) return b.map((v, i) => mix(a[i] ?? v, v, u));
  if (b && typeof b === "object" && a && typeof a === "object") {
    const out = { ...a };
    for (const k of Object.keys(b)) out[k] = k in a ? mix(a[k], b[k], u) : b[k];
    return out;
  }
  return u > 0 ? b : a;
}

/**
 * A keyframed value. keys: [[time, value, duration = 0.4, ease = "io"], ...].
 * At `time` the value starts moving to `value` over `duration` seconds
 * (0 cuts). Numbers, arrays and objects of numbers tween; anything else snaps.
 * A key that lands mid-tween takes over from wherever the value had got to.
 */
export function track(keys) {
  const ks = keys
    .map(([t, v, dur = 0.4, e = "io"]) => ({ t, v, dur, e }))
    .sort((a, b) => a.t - b.t);
  return (t) => {
    let val = ks[0].v;
    for (let i = 1; i < ks.length; i++) {
      const k = ks[i];
      if (t < k.t) break;
      const until = i + 1 < ks.length ? Math.min(t, ks[i + 1].t) : t;
      const u = k.dur <= 0 ? 1 : ease[k.e](clamp((until - k.t) / k.dur));
      val = mix(val, k.v, u);
    }
    return val;
  };
}

/** Blink multiplier for eye openness: 1, dipping to 0 every few seconds. */
export function blink(t, seed = 0) {
  const period = 3.1 + (seed % 5) * 0.47;
  const x = (t + seed * 1.37) % period;
  const d = 0.16;
  if (x > d) return 1;
  return Math.abs(x / d - 0.5) * 2;
}

export class Film {
  constructor(tl) {
    this.tl = tl;
    this.fps = tl.fps;
    this.duration = tl.duration;
    this.talk = {};
    for (const id of tl.order) {
      const b = tl.beats[id];
      if (b.who) (this.talk[b.who] ??= []).push([b.t0, b.t1]);
    }
  }
  /** Start of a beat or mark, plus an offset in seconds. */
  T(id, off = 0) {
    const b = this.tl.beats[id];
    if (!b) throw new Error(`no beat "${id}"`);
    return b.t0 + off;
  }
  /** End of a beat, plus an offset. */
  E(id, off = 0) {
    const b = this.tl.beats[id];
    if (!b) throw new Error(`no beat "${id}"`);
    return b.t1 + off;
  }
  D(id) {
    return this.E(id) - this.T(id);
  }
  /** Smoothed 0..1 mouth level for a character. */
  mouth(who, t) {
    const tr = this.tl.mouth[who];
    if (!tr) return 0;
    const x = t * this.fps;
    const i = Math.floor(x), f = x - i;
    const at = (k) => tr[clamp(k, 0, tr.length - 1)] ?? 0;
    return lerp(at(i), at(i + 1), f) * 0.7 + at(i - 1) * 0.15 + at(i + 2) * 0.15;
  }
  talking(who, t, pad = 0.05) {
    return (this.talk[who] ?? []).some(([a, b]) => t >= a - pad && t <= b + pad);
  }
  /** 0..1, how much `who` is mid-speech, with soft edges (for gestures). */
  energy(who, t) {
    let e = 0;
    for (const [a, b] of this.talk[who] ?? []) e = Math.max(e, Math.min(clamp((t - a) / 0.15), clamp((b - t) / 0.25)));
    return e;
  }
  /** The caption on screen at t, if any. */
  caption(t) {
    for (const id of this.tl.order) {
      const b = this.tl.beats[id];
      if (b.who && t >= b.t0 && t <= Math.max(b.t1, b.t0 + 0.7)) return b;
    }
    return null;
  }
}

/** A camera over a world group: shots are {x, y, z} (centre and zoom). */
export class Camera {
  constructor(world, w, h) {
    this.world = world;
    this.w = w;
    this.h = h;
  }
  set({ x, y, z = 1, r = 0 }) {
    const tx = this.w / 2 - x * z, ty = this.h / 2 - y * z;
    this.world.setAttribute(
      "transform",
      `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${z.toFixed(4)})` + (r ? ` rotate(${r.toFixed(3)} ${x} ${y})` : ""),
    );
  }
}
