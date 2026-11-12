// STARTING MONDAY - character designs.
import { el } from "../engine/engine.js";
import { Toon, Face } from "../engine/rig.js";

export const INK = "#1d1830";
const OW = 5;
const ink = { stroke: INK, "stroke-width": OW, "stroke-linejoin": "round", "stroke-linecap": "round" };

// ---------------------------------------------------------------- Dale
export function makeDale(parent) {
  return new Toon(parent, {
    skin: "#f2c9a1", top: "#5fa3a0", bottom: "#8e8ea8", shoe: "#f3f1ea", line: INK, ow: OW,
    torsoH: 150, shoulderW: 60, hipW: 60, belly: 50, armLen: 150, legLen: 150, limbW: 34, legW: 42, handR: 19,
    neck: 2, headRx: 66, headRy: 60, shoeL: 46, shoeH: 20, nod: 3,
    face: { eyeDX: 25, eyeY: -12, eyeRx: 19, eyeRy: 22, pupilR: 6.5, browW: 34, browLW: 8, browColor: "#5a3d2b",
            mouthY: 30, mouthW: 44, mouthOpen: 20, nose: "bulb", noseFill: "#eeb48c", noseX: 4, seed: 3 },
    torsoArt: (g) => {
      el("path", { d: "M -22 -152 L 0 -128 L 24 -152", fill: "none", ...ink }, g);               // polo collar
      el("path", { d: "M 0 -128 L 0 -96", fill: "none", ...ink, "stroke-width": 3 }, g);          // placket
      el("ellipse", { cx: 44, cy: -70, rx: 13, ry: 9, fill: "#f6d77a", opacity: 0.9 }, g);         // mustard stain
    },
    headBack: (g) => {
      el("path", { d: "M -66 -8 q -16 -4 -14 16 q 4 14 16 6 z", fill: "#f2c9a1", ...ink }, g);     // ear
    },
    headArt: (g) => {
      el("path", { d: "M -34 46 q 36 22 74 -2", fill: "none", stroke: "#dba983", "stroke-width": 4, "stroke-linecap": "round" }, g); // chin crease
    },
    hair: (g) => {
      el("path", { d: "M -62 -22 q -10 -34 14 -44 q -10 22 -4 40 z", fill: "#6b4a34", ...ink }, g); // side tuft
      el("path", { d: "M -30 -56 q 30 -16 64 -2 M -16 -60 q 28 -12 54 0", fill: "none", stroke: "#6b4a34", "stroke-width": 5, "stroke-linecap": "round" }, g); // combover
    },
  });
}

// ---------------------------------------------------------------- Zeth
export function makeZeth(parent) {
  return new Toon(parent, {
    skin: "#b9b4d6", top: "#2b2350", bottom: "#2b2350", line: INK, ow: OW, robe: true, robeLen: 330, robeFlare: 1.9,
    torsoH: 230, shoulderW: 58, hipW: 44, belly: 0, armLen: 240, legLen: 330, limbW: 24, handR: 15, elbow: 1,
    neck: 26, neckW: 18, headRx: 46, headRy: 80, nod: 1.2,
    face: { eyeDX: 19, eyeY: -4, eyeRx: 14, eyeRy: 11, pupilR: 5, browW: 26, browLW: 5, browGap: 12, pupil: "#2b2350", white: "#f6f3ff",
            mouthY: 46, mouthW: 26, mouthOpen: 13, nose: "dot", talk: 0.7, seed: 11 },
    torsoArt: (g) => {
      el("path", { d: "M -40 -232 L 0 -170 L 40 -232", fill: "none", stroke: "#d9b65c", "stroke-width": 9, "stroke-linejoin": "round" }, g); // gold collar
      el("path", { d: "M 0 -170 L 0 20", stroke: "#d9b65c", "stroke-width": 6 }, g);
      el("circle", { cx: 0, cy: -168, r: 10, fill: "#7df0ff", ...ink, "stroke-width": 3 }, g);
    },
    headArt: (g) => {
      el("path", { d: "M -30 -52 q 30 -14 60 0 M -24 -64 q 24 -10 48 0", fill: "none", stroke: "#9993bd", "stroke-width": 3.5, "stroke-linecap": "round" }, g); // brow ridges
      el("path", { d: "M 0 -44 l 7 9 l -7 9 l -7 -9 z", fill: "#7df0ff", stroke: INK, "stroke-width": 2.5 }, g);  // forehead gem
    },
  });
}

// ---------------------------------------------------------------- Brad
export function makeBrad(parent) {
  return new Toon(parent, {
    skin: "#e39a55", top: "#d8ff3d", bottom: "#ff4fa3", shoe: "#ffffff", line: INK, ow: OW, bare: true,
    torsoH: 175, shoulderW: 98, hipW: 46, belly: 0, armLen: 170, legLen: 125, limbW: 46, legW: 32, handR: 22,
    neck: 0, neckW: 40, headRx: 46, headRy: 50, shoeL: 44, shoeH: 18, nod: 3.5,
    face: { eyeDX: 18, eyeY: -10, eyeRx: 12, eyeRy: 13, pupilR: 5, browW: 26, browLW: 7, browColor: "#c9a13a",
            mouthY: 22, mouthW: 56, mouthOpen: 18, nose: "line", seed: 5 },
    torsoArt: (g) => {
      // tank top cut-outs: bare shoulders and chest
      el("path", { d: "M -100 -160 Q -62 -150 -52 -84 L -98 -70 Z M 100 -160 Q 62 -150 52 -84 L 98 -70 Z", fill: "#e39a55" }, g);
      el("path", { d: "M -34 -178 Q 0 -128 34 -178 Z", fill: "#e39a55", ...ink }, g);
      el("path", { d: "M -30 -108 Q 0 -96 30 -108", fill: "none", stroke: "#a9cc20", "stroke-width": 4, "stroke-linecap": "round" }, g); // pec line
      el("text", { x: 0, y: -52, "text-anchor": "middle", "font-family": "Inter, sans-serif", "font-weight": 900, "font-size": 30, fill: INK, text: "FLEX" }, g);
      el("path", { d: "M -24 -176 L 6 -112", stroke: INK, "stroke-width": 3 }, g);                 // whistle cord
      el("rect", { x: -2, y: -116, width: 22, height: 14, rx: 5, fill: "#c7c9d6", ...ink, "stroke-width": 3 }, g); // whistle
    },
    headBack: (g) => {
      // the zipper nobody mentions
      el("path", { d: "M -44 8 L -44 44", stroke: "#c7c9d6", "stroke-width": 5, "stroke-dasharray": "3 4" }, g);
      el("rect", { x: -51, y: 2, width: 9, height: 13, rx: 2, fill: "#f5d04a", stroke: INK, "stroke-width": 2.5 }, g);
    },
    hair: (g) => {
      el("path", { d: "M -46 -22 L -44 -62 L 44 -66 L 46 -22 Q 0 -44 -46 -22 Z", fill: "#f7dc6f", ...ink }, g);
    },
  });
}

// ---------------------------------------------------------------- Sharon
export function makeSharon(parent) {
  const bag = (g) => {
    el("path", { d: "M -34 6 L 34 6 L 30 84 L -30 84 Z", fill: "#b98a56", ...ink }, g);
    el("path", { d: "M -18 8 q 4 -40 12 0 M 4 8 q 10 -58 20 -2", fill: "#7fbf5a", ...ink, "stroke-width": 3 }, g);
    el("path", { d: "M -34 6 L 34 6", ...ink }, g);
  };
  const s = new Toon(parent, {
    skin: "#eab98f", top: "#c8553d", bottom: "#3e5a8c", shoe: "#2a2a35", line: INK, ow: OW,
    torsoH: 140, shoulderW: 48, hipW: 52, belly: 6, armLen: 138, legLen: 165, limbW: 26, legW: 32, handR: 15,
    neck: 8, headRx: 50, headRy: 54, shoeL: 38, shoeH: 14, nod: 2, itemsHang: true,
    face: { eyeDX: 19, eyeY: -6, eyeRx: 14, eyeRy: 15, pupilR: 5.5, browW: 26, browLW: 5, browColor: "#7a2f1d",
            mouthY: 28, mouthW: 30, mouthOpen: 14, nose: "line", seed: 8 },
    headBack: (g) => el("path", { d: "M -58 -8 Q -66 -74 0 -70 Q 66 -74 60 -6 L 58 44 Q 40 30 44 -4 L -42 -6 Q -38 34 -58 46 Z", fill: "#a8442c", ...ink }, g),
    hair: (g) => el("path", { d: "M -52 -18 Q -40 -62 4 -58 Q 46 -60 52 -16 Q 22 -40 -52 -18 Z", fill: "#a8442c", ...ink }, g),
  });
  bag(s.frontItem);
  bag(s.backItem);
  return s;
}

// ---------------------------------------------------------------- Quib (and other blobs)
// A hovering bean: body, face, two stub arms, an antenna.
export class Blob {
  constructor(parent, c) {
    this.c = c;
    const g = (this.g = el("g", {}, parent));
    this.shadow = el("ellipse", { rx: c.rx * 0.8, ry: 10, fill: "#000", opacity: 0.25 }, parent);
    parent.insertBefore(this.shadow, g);
    c.back?.(g);
    this.antenna = el("path", { fill: "none", ...ink, opacity: c.antenna === false ? 0 : 1 }, g);
    this.bulb = el("circle", { r: 10, fill: c.glow ?? "#ffe66d", ...ink, "stroke-width": 3, opacity: c.antenna === false ? 0 : 1 }, g);
    this.armL = el("path", { fill: "none", ...ink, stroke: INK, "stroke-width": 16 }, g);
    this.armL2 = el("path", { fill: "none", stroke: c.color, "stroke-width": 8, "stroke-linecap": "round" }, g);
    this.body = el("ellipse", { rx: c.rx, ry: c.ry, fill: c.color, ...ink }, g);
    this.belly = el("ellipse", { cx: 0, cy: c.ry * 0.35, rx: c.rx * 0.62, ry: c.ry * 0.42, fill: c.belly ?? "#c9f5dc", opacity: 0.7 }, g);
    c.art?.(g);
    this.face = new Face(g, { line: INK, lw: 4, ...c.face });
    this.item = el("g", {}, g);
    this.armR = el("path", { fill: "none", stroke: INK, "stroke-width": 16, "stroke-linecap": "round" }, g);
    this.armR2 = el("path", { fill: "none", stroke: c.color, "stroke-width": 8, "stroke-linecap": "round" }, g);
  }
  /** p: x, y, s, flip, rot, sq (squash), floor (y of the shadow), e, hands: 0 down .. 1 up at the tablet */
  set(p, talk = 0, t = 0) {
    const c = this.c, sq = p.sq ?? 1;
    this.g.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(p.rot ?? 0).toFixed(1)}) scale(${(p.s * p.flip / Math.sqrt(sq)).toFixed(4)} ${(p.s * sq).toFixed(4)})`);
    this.g.setAttribute("opacity", (p.a ?? 1).toFixed(3));
    const h = p.floor !== undefined ? Math.max(0, p.floor - p.y) : 0;
    this.shadow.setAttribute("cx", p.x); this.shadow.setAttribute("cy", p.floor ?? p.y);
    this.shadow.setAttribute("opacity", p.floor !== undefined ? (0.3 * (p.a ?? 1) * Math.max(0.25, 1 - h / 500)).toFixed(3) : 0);
    this.shadow.setAttribute("rx", (c.rx * p.s * (0.9 - Math.min(0.5, h / 900))).toFixed(1));
    const sway = Math.sin(t * 3.1) * 6;
    this.antenna.setAttribute("d", `M 0 ${-c.ry + 4} q ${sway} -22 ${sway * 1.6} -44`);
    this.bulb.setAttribute("cx", sway * 1.6); this.bulb.setAttribute("cy", -c.ry - 44);
    const up = p.hands ?? 0;
    const hy = c.ry * 0.5 - up * c.ry * 0.25, hx = c.rx * 0.55;
    const dL = `M ${-c.rx * 0.8} ${c.ry * 0.2} Q ${-c.rx * 1.2} ${c.ry * 0.5} ${-hx + up * 20} ${hy}`;
    const dR = `M ${c.rx * 0.8} ${c.ry * 0.2} Q ${c.rx * 1.25} ${c.ry * 0.5} ${hx + 18 - up * 4} ${hy + Math.sin(t * 22) * 3 * (p.typing ?? 0)}`;
    this.armL.setAttribute("d", dL); this.armL2.setAttribute("d", dL);
    this.armR.setAttribute("d", dR); this.armR2.setAttribute("d", dR);
    this.item.setAttribute("transform", `translate(${c.rx * 0.2} ${c.ry * 0.62 - up * c.ry * 0.25})`);
    this.item.setAttribute("opacity", (p.item ?? 1).toFixed(2));
    this.face.set(p.e, talk, t);
  }
}

export function makeQuib(parent) {
  const q = new Blob(parent, {
    rx: 62, ry: 70, color: "#8fe0b4",
    face: { eyeDX: 24, eyeY: -18, eyeRx: 19, eyeRy: 23, pupilR: 8, browW: 26, browLW: 5, browGap: 9,
            mouthY: 22, mouthW: 30, mouthOpen: 16, nose: "none", seed: 2 },
  });
  el("rect", { x: -46, y: -8, width: 92, height: 58, rx: 8, fill: "#17324a", ...ink, "stroke-width": 4 }, q.item);
  el("rect", { x: -40, y: -2, width: 80, height: 46, rx: 4, fill: "#7df0ff", opacity: 0.85 }, q.item);
  el("path", { d: "M -32 30 l 14 -14 l 10 8 l 16 -20 l 12 10", fill: "none", stroke: "#17324a", "stroke-width": 4 }, q.item);
  return q;
}

// ---------------------------------------------------------------- Vex, out of the suit
export function makeSlug(parent) {
  const s = new Blob(parent, {
    rx: 40, ry: 30, color: "#9aa0ad", belly: "#c3c7d1", antenna: false,
    face: { eyeDX: 15, eyeY: -46, eyeRx: 12, eyeRy: 13, pupilR: 5, browW: 16, browLW: 4, browGap: 5,
            mouthY: -4, mouthW: 20, mouthOpen: 9, nose: "none", seed: 6 },
    back: (g) => el("path", { d: "M -30 6 q -50 4 -74 22 q 40 10 80 0 z", fill: "#9aa0ad", ...ink }, g),          // tail
    art: (g) => {
      el("path", { d: "M -15 -28 v -12 M 15 -28 v -12", ...ink, stroke: INK, "stroke-width": 12 }, g);            // eye stalks
      el("path", { d: "M -15 -28 v -12 M 15 -28 v -12", stroke: "#9aa0ad", "stroke-width": 6, "stroke-linecap": "round" }, g);
      el("path", { d: "M -38 8 q 38 12 76 0 l -4 20 q -34 8 -68 0 z", fill: "#ff4fa3", ...ink, "stroke-width": 4 }, g); // the shorts survived
    },
  });
  el("rect", { x: -12, y: -8, width: 26, height: 16, rx: 6, fill: "#c7c9d6", ...ink, "stroke-width": 3 }, s.item);  // whistle
  return s;
}
