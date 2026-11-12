// Poseable cartoon characters.
//
// A Toon is a torso that tilts about its hips, two-bone limbs solved with IK
// (you say where a hand or foot goes, the elbow or knee follows), and a head
// carrying a parametric Face. Poses and expressions are plain objects of
// numbers, so engine.track() can tween between them.

import { el, clamp, blink } from "./engine.js";

let uid = 0;

// ------------------------------------------------------------------ face

export const EXPR = {
  neutral: { bl: 0, br: 0, by: 0, eo: 1, px: 0, py: 0, sm: 0, mw: 1, mo: 0 },
  happy: { bl: -6, br: -6, by: 3, eo: 0.95, px: 0, py: 0, sm: 0.8, mw: 1.15, mo: 0.12 },
  smug: { bl: -4, br: 10, by: 1, eo: 0.6, px: 0.2, py: 0, sm: 0.55, mw: 1.0, mo: 0 },
  annoyed: { bl: 14, br: 14, by: -3, eo: 0.62, px: 0, py: 0, sm: -0.45, mw: 0.9, mo: 0 },
  angry: { bl: 24, br: 24, by: -5, eo: 0.8, px: 0, py: 0, sm: -0.7, mw: 1.1, mo: 0.1 },
  shock: { bl: -14, br: -14, by: 9, eo: 1.35, px: 0, py: 0, sm: -0.2, mw: 0.75, mo: 0.6 },
  fear: { bl: -20, br: -20, by: 7, eo: 1.3, px: 0, py: 0, sm: -0.7, mw: 1.1, mo: 0.3 },
  sad: { bl: -22, br: -22, by: 1, eo: 0.8, px: 0, py: 0.3, sm: -0.6, mw: 0.9, mo: 0 },
  think: { bl: 8, br: -12, by: 3, eo: 0.85, px: 0.5, py: -0.6, sm: -0.1, mw: 0.7, mo: 0 },
  sly: { bl: 10, br: -8, by: 0, eo: 0.5, px: 0.3, py: 0, sm: 0.45, mw: 0.9, mo: 0 },
  flat: { bl: 0, br: 0, by: -2, eo: 0.55, px: 0, py: 0, sm: -0.12, mw: 0.9, mo: 0 },
  solemn: { bl: -6, br: -6, by: 0, eo: 0.7, px: 0, py: 0, sm: -0.25, mw: 0.8, mo: 0 },
  strain: { bl: 22, br: 22, by: -4, eo: 0.35, px: 0, py: 0, sm: -0.5, mw: 1.3, mo: 0.35 },
  bliss: { bl: -10, br: -10, by: 2, eo: 0.12, px: 0, py: 0, sm: 0.7, mw: 1.1, mo: 0 },
  plead: { bl: -26, br: -26, by: 6, eo: 1.2, px: 0, py: -0.2, sm: -0.35, mw: 0.85, mo: 0.15 },
  moved: { bl: -18, br: -18, by: 4, eo: 0.9, px: 0, py: 0, sm: 0.2, mw: 0.8, mo: 0.05 },
  wince: { bl: 18, br: 18, by: -2, eo: 0.15, px: 0, py: 0, sm: -0.6, mw: 1.2, mo: 0.1 },
  sneeze: { bl: -16, br: -16, by: 8, eo: 0.25, px: 0, py: -0.5, sm: -0.3, mw: 0.7, mo: 0.75 },
};

/** Start from a named expression and override a few values. */
export const ex = (name, over = {}) => ({ ...EXPR[name], ...over });

export class Face {
  /**
   * c: eyeDX (half the eye spacing), eyeY, eyeRx, eyeRy, pupilR, browW,
   *    mouthY, mouthW, mouthOpen (px at full open), line (stroke colour),
   *    lw (stroke width), white, pupil, mouthFill, nose ("none"|"dot"|"line"|"bulb"),
   *    lids (skin colour for eyelids), iris (colour or null)
   */
  constructor(parent, c) {
    this.c = c;
    this.seed = c.seed ?? uid;
    const id = `f${uid++}`;
    const g = (this.g = el("g", {}, parent));
    const line = { stroke: c.line, "stroke-width": c.lw, "stroke-linecap": "round", "stroke-linejoin": "round" };
    this.eyes = [-1, 1].map((side) => {
      const eg = el("g", { transform: `translate(${side * c.eyeDX} ${c.eyeY})` }, g);
      const clip = el("clipPath", { id: `${id}e${side}` }, eg);
      const clipShape = el("ellipse", { rx: c.eyeRx, ry: c.eyeRy }, clip);
      const white = el("ellipse", { rx: c.eyeRx, ry: c.eyeRy, fill: c.white ?? "#fff", ...line }, eg);
      const inner = el("g", { "clip-path": `url(#${id}e${side})` }, eg);
      const iris = c.iris ? el("circle", { r: c.pupilR * 1.9, fill: c.iris }, inner) : null;
      const pupil = el("circle", { r: c.pupilR, fill: c.pupil ?? "#111" }, inner);
      const glint = el("circle", { r: c.pupilR * 0.3, fill: "#fff", opacity: 0.9 }, inner);
      const lid = el("path", { fill: "none", ...line }, eg);
      const brow = el("path", { fill: "none", ...line, "stroke-width": c.browLW ?? c.lw * 1.5, stroke: c.browColor ?? c.line }, g);
      return { side, clipShape, white, iris, pupil, glint, lid, brow };
    });
    if (c.nose === "line") el("path", { d: `M ${c.noseX ?? 2} ${c.eyeY + c.eyeRy * 0.8} q ${c.eyeRx * 0.6} ${c.eyeRy * 1.5} ${-c.eyeRx * 0.2} ${c.eyeRy * 1.9}`, fill: "none", ...line }, g);
    if (c.nose === "bulb") el("ellipse", { cx: c.noseX ?? 0, cy: c.eyeY + c.eyeRy * 1.55, rx: c.eyeRx * 0.62, ry: c.eyeRy * 0.5, fill: c.noseFill ?? "none", ...line }, g);
    if (c.nose === "dot") el("path", { d: `M -3 ${c.eyeY + c.eyeRy * 1.7} q 3 3 6 0`, fill: "none", ...line }, g);
    const mclip = el("clipPath", { id: `${id}m` }, g);
    this.mouthClip = el("path", {}, mclip);
    this.mouth = el("path", { fill: c.mouthFill ?? "#3a1418", ...line }, g);
    const inner = el("g", { "clip-path": `url(#${id}m)` }, g);
    this.teeth = el("rect", { fill: "#fff" }, inner);
    this.tongue = el("ellipse", { fill: c.tongue ?? "#d9626d" }, inner);
  }

  /** e: expression, talk: 0..1 mouth level, t: film time (for blinks). */
  set(e, talk = 0, t = 0) {
    const c = this.c;
    const open = clamp(e.eo * (e.noBlink ? 1 : blink(t, this.seed)), 0.04, 1.5);
    for (const eye of this.eyes) {
      const ry = c.eyeRy * open;
      eye.white.setAttribute("ry", ry.toFixed(2));
      eye.clipShape.setAttribute("ry", ry.toFixed(2));
      const px = clamp(e.px, -1, 1) * c.eyeRx * 0.48, py = clamp(e.py, -1, 1) * c.eyeRy * 0.42;
      for (const p of [eye.pupil, eye.iris]) if (p) { p.setAttribute("cx", px.toFixed(2)); p.setAttribute("cy", py.toFixed(2)); }
      eye.glint.setAttribute("cx", (px - c.pupilR * 0.35).toFixed(2));
      eye.glint.setAttribute("cy", (py - c.pupilR * 0.35).toFixed(2));
      // upper lid line when the eye is narrowed
      eye.lid.setAttribute("d", open < 0.9 ? `M ${-c.eyeRx} ${-ry * 0.2} Q 0 ${-ry * 1.25} ${c.eyeRx} ${-ry * 0.2}` : "");
      // brow: positive angle drops the inner end (angry), negative raises it (worried)
      const ang = ((eye.side < 0 ? e.bl : e.br) * Math.PI) / 180;
      const cx = eye.side * c.eyeDX, cy = c.eyeY - c.eyeRy - (c.browGap ?? c.eyeRy * 0.7) - e.by;
      const hw = c.browW / 2;
      const dx = Math.cos(ang) * hw, dy = Math.sin(ang) * hw * eye.side;
      eye.brow.setAttribute("d", `M ${(cx - dx).toFixed(1)} ${(cy + dy).toFixed(1)} L ${(cx + dx).toFixed(1)} ${(cy - dy).toFixed(1)}`);
    }
    const hw = (c.mouthW * e.mw * (1 + 0.1 * Math.sin(t * 19 + this.seed) * talk)) / 2;
    const o = clamp(e.mo + talk * (c.talk ?? 0.85), 0, 1.2) * c.mouthOpen;
    const curve = e.sm * hw * 0.55;
    const yc = c.mouthY - curve * 0.45, ym = c.mouthY + curve * 0.7;
    const d = `M ${-hw.toFixed(1)} ${yc.toFixed(1)} Q 0 ${(ym - o * 0.25).toFixed(1)} ${hw.toFixed(1)} ${yc.toFixed(1)} Q 0 ${(ym + o * 1.75).toFixed(1)} ${-hw.toFixed(1)} ${yc.toFixed(1)} Z`;
    this.mouth.setAttribute("d", d);
    this.mouthClip.setAttribute("d", d);
    const showTeeth = o > c.mouthOpen * 0.18;
    this.teeth.setAttribute("x", -hw); this.teeth.setAttribute("width", hw * 2);
    this.teeth.setAttribute("y", Math.min(yc, ym) - 10); this.teeth.setAttribute("height", showTeeth ? 10 + o * 0.28 + Math.abs(curve) * 0.3 : 0);
    this.tongue.setAttribute("cx", 0); this.tongue.setAttribute("cy", ym + o * 0.95);
    this.tongue.setAttribute("rx", hw * 0.6); this.tongue.setAttribute("ry", showTeeth ? o * 0.35 : 0);
  }
}

// ------------------------------------------------------------------ body

const rot = ([x, y], deg) => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
};

/** Two-bone IK. Returns the joint between `from` and `to`; bend is +1 or -1. */
export function joint(from, to, a, b, bend) {
  let dx = to[0] - from[0], dy = to[1] - from[1];
  let d = Math.hypot(dx, dy) || 1e-6;
  const reach = a + b - 0.5, min = Math.abs(a - b) + 0.5;
  const dd = clamp(d, min, reach);
  const end = [from[0] + (dx / d) * dd, from[1] + (dy / d) * dd];
  const cos = clamp((a * a + dd * dd - b * b) / (2 * a * dd), -1, 1);
  const ang = Math.atan2(dy, dx) + bend * Math.acos(cos);
  return { mid: [from[0] + Math.cos(ang) * a, from[1] + Math.sin(ang) * a], end };
}

const P = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;

export class Toon {
  /**
   * c: skin, top, bottom, shoe, line (outline colour), ow (outline width, 0 for none),
   *    torsoH, shoulderW, hipW, belly, armLen, legLen, limbW, legW, handR,
   *    neck, headRx, headRy, face {...}, robe (true: no legs, floor-length skirt),
   *    sleeve (colour of arms; defaults to top), bare (arms are skin),
   *    hair(g), headBack(g), torsoArt(g), headArt(g): callbacks that draw into local space
   */
  constructor(parent, c) {
    this.c = c;
    const g = (this.g = el("g", {}, parent));
    const ow = c.ow ?? 0;
    const limb = (color, w) => {
      const under = ow ? el("path", { fill: "none", stroke: c.line, "stroke-width": w + ow * 2, "stroke-linecap": "round", "stroke-linejoin": "round" }, g) : null;
      const over = el("path", { fill: "none", stroke: color, "stroke-width": w, "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
      return { under, over };
    };
    const outline = ow ? { stroke: c.line, "stroke-width": ow, "stroke-linejoin": "round" } : {};
    const armColor = c.bare ? c.skin : c.sleeve ?? c.top;
    const shade = (hex, k) => hex; // flat colour; back limbs are distinguished by layering
    this.backArm = limb(shade(armColor), c.limbW);
    this.backHand = el("circle", { r: c.handR, fill: c.skin, ...outline }, g);
    this.backItem = el("g", {}, g);
    if (!c.robe) {
      this.backLeg = limb(c.bottom, c.legW ?? c.limbW);
      this.backShoe = el("path", { fill: c.shoe, ...outline }, g);
      this.frontLeg = limb(c.bottom, c.legW ?? c.limbW);
      this.frontShoe = el("path", { fill: c.shoe, ...outline }, g);
    }
    this.torsoG = el("g", {}, g);
    if (c.robe) this.robe = el("path", { fill: c.bottom ?? c.top, ...outline }, this.torsoG);
    this.torso = el("path", { fill: c.top, ...outline }, this.torsoG);
    this.torsoArt = el("g", {}, this.torsoG);
    c.torsoArt?.(this.torsoArt, c);
    this.neck = el("path", { fill: "none", stroke: c.skin, "stroke-width": c.neckW ?? c.limbW * 0.8, "stroke-linecap": "round" }, g);
    this.headG = el("g", {}, g);
    c.headBack?.(this.headG, c);
    this.head = c.headPath
      ? el("path", { d: c.headPath, fill: c.skin, ...outline }, this.headG)
      : el("ellipse", { rx: c.headRx, ry: c.headRy, fill: c.skin, ...outline }, this.headG);
    c.headArt?.(this.headG, c);
    this.face = new Face(this.headG, { line: c.line, lw: Math.max(2, ow * 0.8), ...c.face });
    c.hair?.(this.headG, c);
    this.frontArm = limb(armColor, c.limbW);
    this.frontHand = el("circle", { r: c.handR, fill: c.skin, ...outline }, g);
    this.frontItem = el("g", {}, g);
    this.pose = Toon.stand(c);
  }

  static stand(c) {
    return {
      x: 0, y: 0, s: 1, flip: 1, tilt: 0, ht: 0, hx: 0, hy: 0, sq: 1,
      lh: [-6, c.armLen * 0.96], rh: [8, c.armLen * 0.96],
      lf: [-c.hipW * 0.9, c.legLen], rf: [c.hipW * 0.9, c.legLen],
    };
  }

  /** Stride positions for a walk cycle; phase in turns. */
  static walk(c, phase, stride = 0.42, lift = 0.16) {
    const a = phase * Math.PI * 2;
    const foot = (ph) => [Math.sin(ph) * c.legLen * stride, c.legLen - Math.max(0, Math.cos(ph)) * c.legLen * lift];
    return {
      lf: foot(a), rf: foot(a + Math.PI),
      lh: [Math.sin(a + Math.PI) * c.armLen * 0.35, c.armLen * 0.93], rh: [Math.sin(a) * c.armLen * 0.35, c.armLen * 0.93],
      bob: -Math.abs(Math.sin(a)) * c.legLen * 0.035,
    };
  }

  /**
   * p: x, y (hips, world), s (scale), flip (+1 faces right), tilt (torso, degrees),
   *    ht (head tilt), hx, hy (head offset), sq (vertical squash),
   *    lh, rh (hands, relative to their shoulder), lf, rf (feet, relative to hips),
   *    lfr, rfr (foot rotation, degrees), e (expression), a (opacity)
   * Things drawn into frontItem / backItem ride the hands; they turn with the
   * forearm unless the config sets itemsHang.
   * talk: mouth level 0..1.  t: film time.
   */
  set(p, talk = 0, t = 0) {
    const c = this.c;
    this.g.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${(p.s * p.flip).toFixed(4)} ${(p.s * (p.sq ?? 1)).toFixed(4)})`);
    if (p.a !== undefined) this.g.setAttribute("opacity", clamp(p.a).toFixed(3));
    const up = (pt) => rot(pt, p.tilt);
    const neck = up([0, -c.torsoH]);
    const shB = up([-c.shoulderW * 0.72, -c.torsoH * 0.9]);
    const shF = up([c.shoulderW * 0.72, -c.torsoH * 0.9]);

    // torso: hips fixed, shoulders follow the tilt
    const hw = c.hipW, sw = c.shoulderW, th = c.torsoH, belly = c.belly ?? 0;
    this.torso.setAttribute(
      "d",
      `M ${-hw} 0 Q ${-hw - 4} ${-th * 0.55} ${-sw} ${-th * 0.92} Q ${-sw * 0.6} ${-th * 1.04} 0 ${-th * 1.02} Q ${sw * 0.6} ${-th * 1.04} ${sw} ${-th * 0.92} Q ${hw + 4 + belly * 1.6} ${-th * 0.42} ${hw + belly * 0.35} 0 Z`,
    );
    this.torsoG.setAttribute("transform", `rotate(${p.tilt.toFixed(2)})`);
    if (this.robe) {
      const len = c.robeLen ?? c.legLen, flare = c.robeFlare ?? 1.5;
      const sway = (p.sway ?? 0) * 10;
      this.robe.setAttribute("d", `M ${-hw - 2} -6 L ${hw + 2} -6 Q ${hw * flare + sway} ${len * 0.6} ${hw * flare * 1.1 + sway * 1.6} ${len} L ${-hw * flare * 1.1 + sway * 1.6} ${len} Q ${-hw * flare + sway} ${len * 0.6} ${-hw - 2} -6 Z`);
    }

    // arms
    const arm = (sh, hand, parts, handEl, item) => {
      const j = joint(sh, [sh[0] + hand[0], sh[1] + hand[1]], c.armLen * 0.5, c.armLen * 0.5, c.elbow ?? 1);
      const d = `M ${P(sh)} L ${P(j.mid)} L ${P(j.end)}`;
      parts.under?.setAttribute("d", d);
      parts.over.setAttribute("d", d);
      handEl.setAttribute("cx", j.end[0].toFixed(1));
      handEl.setAttribute("cy", j.end[1].toFixed(1));
      const ang = (Math.atan2(j.end[1] - j.mid[1], j.end[0] - j.mid[0]) * 180) / Math.PI;
      item.setAttribute("transform", `translate(${P(j.end)})` + (c.itemsHang ? "" : ` rotate(${(ang - 90).toFixed(1)})`));
      return j.end;
    };
    this.handB = arm(shB, p.lh, this.backArm, this.backHand, this.backItem);
    this.handF = arm(shF, p.rh, this.frontArm, this.frontHand, this.frontItem);

    // legs
    if (!c.robe) {
      const leg = (hipX, foot, parts, shoe, rotation) => {
        const hip = [hipX, -2];
        const j = joint(hip, foot, c.legLen * 0.5, c.legLen * 0.5, c.knee ?? -1);
        const d = `M ${P(hip)} L ${P(j.mid)} L ${P(j.end)}`;
        parts.under?.setAttribute("d", d);
        parts.over.setAttribute("d", d);
        const [fx, fy] = j.end, L = c.shoeL ?? c.limbW * 1.5, H = c.shoeH ?? c.limbW * 0.62;
        shoe.setAttribute("d", `M ${-L * 0.35} ${-H} Q ${L * 0.5} ${-H * 1.2} ${L} ${-H * 0.2} Q ${L * 1.05} ${H * 0.5} ${L * 0.7} ${H * 0.5} L ${-L * 0.35} ${H * 0.5} Z`);
        shoe.setAttribute("transform", `translate(${fx.toFixed(1)} ${fy.toFixed(1)}) rotate(${(rotation ?? 0).toFixed(1)})`);
      };
      leg(-hw * 0.55, p.lf, this.backLeg, this.backShoe, p.lfr);
      leg(hw * 0.55, p.rf, this.frontLeg, this.frontShoe, p.rfr);
    }

    // head rides the neck
    const hc = up([p.hx ?? 0, -c.torsoH - (c.neck ?? 10) - c.headRy * 0.82 + (p.hy ?? 0)]);
    this.neck.setAttribute("d", `M ${P(neck)} L ${P(hc)}`);
    const nod = talk * (c.nod ?? 2.5) * Math.sin(t * 9 + (this.face.seed % 7));
    this.headG.setAttribute("transform", `translate(${P(hc)}) rotate(${(p.tilt * 0.35 + (p.ht ?? 0) + nod).toFixed(2)})`);
    this.face.set(p.e ?? EXPR.neutral, talk, t);
  }
}
