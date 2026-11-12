// UN-BLESS YOU - character designs.
//
// The opposite of Film 1's cartoon: hairline outlines, seven-heads-tall
// proportions, small eyes, muted clothes. Each maker returns a rig.js Toon
// with a few extra handles (glasses, AirPods) the scene switches on and off.
import { el, clamp } from "../engine/engine.js";
import { Toon, Face } from "../engine/rig.js";

export const INK = "#2b2622";
const OW = 1.6;
const ink = { stroke: INK, "stroke-width": OW, "stroke-linejoin": "round", "stroke-linecap": "round" };
const face = (over = {}) => ({
  eyeDX: 12, eyeY: -5, eyeRx: 6.5, eyeRy: 5.4, pupilR: 3.2, browW: 15, browLW: 3.2, browGap: 5,
  mouthY: 19, mouthW: 20, mouthOpen: 9, nose: "line", lw: 1.8, white: "#f6f1e7", pupil: "#2a1c14", ...over,
});
const adult = (over) => ({
  line: INK, ow: OW, torsoH: 175, shoulderW: 44, hipW: 34, belly: 4, armLen: 170, legLen: 250,
  limbW: 26, legW: 30, handR: 11, neck: 12, neckW: 18, headRx: 29, headRy: 37, shoeL: 40, shoeH: 13, nod: 2.2, ...over,
});
const ears = (skin) => (g) => {
  for (const s of [-1, 1]) el("ellipse", { cx: s * 29, cy: 2, rx: 5, ry: 9, fill: skin, ...ink }, g);
};

// ---------------------------------------------------------------- Marcus
export function makeMarcus(parent) {
  const pods = [];
  const skin = "#9a6645";
  const t = new Toon(parent, adult({
    skin, top: "#a9c4e0", bottom: "#2f3b55", shoe: "#5a3a26",
    face: face({ browColor: "#1f1a17", seed: 21 }),
    torsoArt: (g) => {
      el("path", { d: "M -16 -176 L 0 -150 L 16 -176 Z", fill: skin, ...ink }, g);                       // open collar
      el("path", { d: "M -20 -178 L -4 -150 M 20 -178 L 4 -150", fill: "none", stroke: "#f4f7fb", "stroke-width": 5, "stroke-linecap": "round" }, g);
      el("path", { d: "M 0 -150 L 0 -4", stroke: "#8fabc9", "stroke-width": 1.6 }, g);                     // placket
      el("rect", { x: -34, y: -6, width: 70, height: 8, fill: "#3b2a20" }, g);                             // belt
      el("path", { d: "M -14 -176 L 4 -92 L 18 -176", fill: "none", stroke: "#c8423b", "stroke-width": 4, "stroke-linejoin": "round" }, g); // lanyard
      el("rect", { x: -14, y: -94, width: 38, height: 26, rx: 2.5, fill: "#fbfaf6", ...ink, "stroke-width": 1.2 }, g);
      el("rect", { x: -14, y: -94, width: 38, height: 7, fill: "#c8423b" }, g);
      el("text", { x: 5, y: -73, "text-anchor": "middle", "font-family": "Inter, sans-serif", "font-weight": 800, "font-size": 8.5, fill: INK, text: "MARCUS" }, g);
    },
    headBack: ears(skin),
    hair: (g) => {
      el("path", { d: "M -29 -6 Q -32 -41 0 -40 Q 32 -41 29 -6 Q 26 -24 12 -27 Q 0 -29 -12 -27 Q -26 -24 -29 -6 Z", fill: "#1f1a17" }, g);
      for (const s of [-1, 1]) pods.push(el("path", { d: `M ${s * 30} 0 q ${s * 5} 0 ${s * 4} 6 l ${-s * 1} 11`, fill: "none", stroke: "#fdfdfb", "stroke-width": 4.5, "stroke-linecap": "round" }, g));
    },
  }));
  t.pods = pods;   // [screen-left ear, screen-right ear] before any flip
  return t;
}

// ---------------------------------------------------------------- Leonard
export function makeLeonard(parent) {
  const skin = "#7d5239";
  let glasses;
  const t = new Toon(parent, adult({
    skin, top: "#8c3b3f", bottom: "#6a6258", shoe: "#3b2a20", belly: 12, headRx: 30, headRy: 37, nod: 1.2,
    face: face({ browColor: "#d9d5cd", browLW: 3.6, eyeRy: 5, talk: 0.75, seed: 34 }),
    torsoArt: (g) => {
      el("path", { d: "M -18 -177 L 0 -112 L 18 -177 Z", fill: "#f1ead9", ...ink }, g);                    // shirt
      el("path", { d: "M -4 -168 L 4 -168 L 6 -122 L 0 -114 L -6 -122 Z", fill: "#3d4a5c" }, g);            // tie
      el("path", { d: "M 0 -112 L 0 -2", stroke: "#6e2c30", "stroke-width": 2 }, g);                        // cardigan opening
      for (const y of [-96, -68, -40]) el("circle", { cx: 7, cy: y, r: 3.2, fill: "#e7d7a8", ...ink, "stroke-width": 1 }, g);
      el("path", { d: "M 12 -58 L 38 -56 L 37 -28 L 13 -30 Z", fill: "#7e3338", ...ink, "stroke-width": 1.2 }, g); // the pocket
    },
    headBack: ears(skin),
    headArt: (g) => {
      el("path", { d: "M -11 11 Q 0 6 11 11 Q 9 17 0 14 Q -9 17 -11 11 Z", fill: "#cfcac1" }, g);           // moustache
    },
    hair: (g) => {
      el("path", { d: "M -30 -2 Q -34 -30 -18 -37 Q -24 -22 -24 -6 Z M 30 -2 Q 34 -30 18 -37 Q 24 -22 24 -6 Z", fill: "#cfcac1" }, g);
      glasses = el("g", { fill: "rgba(255,255,255,0.14)", stroke: "#b7953f", "stroke-width": 2 }, g);
      el("circle", { cx: -12, cy: -5, r: 9.5 }, glasses);
      el("circle", { cx: 12, cy: -5, r: 9.5 }, glasses);
      el("path", { d: "M -2.5 -6 Q 0 -9 2.5 -6 M -21.5 -6 L -29 -8 M 21.5 -6 L 29 -8", fill: "none" }, glasses);
    },
  }));
  t.glasses = glasses;
  return t;
}

// ---------------------------------------------------------------- Denise
export function makeDenise(parent) {
  const skin = "#b47b55";
  return new Toon(parent, adult({
    skin, top: "#2f7f86", bottom: "#d8c6a6", shoe: "#7a2230", torsoH: 160, shoulderW: 37, hipW: 36, belly: 2,
    armLen: 155, legLen: 240, limbW: 22, legW: 27, handR: 10, headRx: 28, headRy: 35, shoeL: 34, shoeH: 9,
    face: face({ browColor: "#2a1a12", browLW: 2.6, mouthFill: "#7c2a2f", seed: 47 }),
    torsoArt: (g) => {
      el("path", { d: "M -13 -162 Q 0 -138 13 -162 Z", fill: skin, ...ink }, g);
      el("path", { d: "M -9 -154 Q 0 -143 9 -154", fill: "none", stroke: "#e2c46a", "stroke-width": 1.6 }, g);   // necklace
    },
    headBack: (g) => {
      el("path", { d: "M -36 4 Q -52 -30 -30 -50 Q -8 -66 16 -56 Q 46 -48 42 -10 Q 44 16 32 22 Q 36 -4 26 -14 L -24 -14 Q -34 0 -30 24 Q -38 18 -36 4 Z", fill: "#2a1a12" }, g);
      ears(skin)(g);
      for (const s of [-1, 1]) el("circle", { cx: s * 30, cy: 14, r: 3, fill: "#e2c46a" }, g);
    },
    hair: (g) => el("path", { d: "M -29 -8 Q -30 -40 2 -39 Q 32 -40 29 -8 Q 18 -30 -4 -28 Q -22 -26 -29 -8 Z", fill: "#2a1a12" }, g),
  }));
}

// ---------------------------------------------------------------- Mum and Kid
export function makeMum(parent) {
  const skin = "#f1cfb8";
  return new Toon(parent, adult({
    skin, top: "#2b3a67", bottom: "#3d3d45", shoe: "#5b3a22", torsoH: 160, shoulderW: 38, hipW: 35, belly: 2,
    armLen: 155, legLen: 240, limbW: 23, legW: 26, handR: 10, headRx: 28, headRy: 35, shoeL: 36, shoeH: 12,
    face: face({ browColor: "#a8873f", browLW: 2.6, pupil: "#2f4a5c", mouthFill: "#8a3138", seed: 53 }),
    torsoArt: (g) => {
      el("path", { d: "M -36 -4 L 38 -4 L 44 74 L -42 74 Z", fill: "#2b3a67", ...ink }, g);                 // coat skirt
      el("path", { d: "M -13 -162 L 0 -128 L 13 -162 Z", fill: "#d9d2c4", ...ink }, g);                     // scarf
      el("path", { d: "M 0 -128 L 2 70", stroke: "#1f2a4c", "stroke-width": 2 }, g);
    },
    headBack: (g) => {
      el("path", { d: "M -34 -6 Q -36 -44 0 -42 Q 36 -44 34 -6 L 33 22 Q 22 26 24 4 L -24 4 Q -22 26 -33 22 Z", fill: "#d9b25f" }, g);
    },
    hair: (g) => el("path", { d: "M -29 -6 Q -28 -40 4 -39 Q 30 -38 29 -6 Q 14 -30 -29 -6 Z", fill: "#d9b25f" }, g),
  }));
}

export function makeKid(parent) {
  const skin = "#f1cfb8";
  return new Toon(parent, {
    skin, top: "#f2c230", bottom: "#3d5a80", shoe: "#c0392b", line: INK, ow: OW,
    torsoH: 78, shoulderW: 25, hipW: 23, belly: 4, armLen: 72, legLen: 82, limbW: 15, legW: 17, handR: 7.5,
    neck: 3, neckW: 12, headRx: 25, headRy: 27, shoeL: 24, shoeH: 11, nod: 2,
    face: face({ eyeDX: 10, eyeY: -2, eyeRx: 6.5, eyeRy: 7, pupilR: 3.6, browW: 11, browLW: 2.2, browColor: "#6b4a2f", mouthY: 15, mouthW: 13, mouthOpen: 7, nose: "dot", seed: 59 }),
    torsoArt: (g) => {
      el("path", { d: "M -24 -4 L 26 -4 L 30 18 L -28 18 Z", fill: "#f2c230", ...ink }, g);
      for (const y of [-58, -38, -18]) el("circle", { cx: 4, cy: y, r: 2.4, fill: "#b8901c" }, g);
    },
    headBack: (g) => el("path", { d: "M -30 6 Q -36 -34 0 -36 Q 36 -34 30 6 Q 20 -8 -30 6 Z", fill: "#f2c230", ...ink }, g), // hood
    hair: (g) => el("path", { d: "M -22 -14 Q -10 -30 8 -26 Q 22 -24 22 -12 Q 6 -22 -22 -14 Z", fill: "#6b4a2f" }, g),
  });
}

// ---------------------------------------------------------------- the bus driver, seen through his window
export function makeDriver(parent) {
  const g = el("g", {}, parent);
  const skin = "#c99672";
  el("path", { d: "M -46 96 Q -44 40 0 38 Q 44 40 46 96 Z", fill: "#51627a", ...ink }, g);                  // shoulders
  el("path", { d: "M -10 40 L 0 56 L 10 40 Z", fill: "#e9e4d8" }, g);
  el("rect", { x: -8, y: 22, width: 16, height: 20, fill: skin }, g);
  el("ellipse", { rx: 28, ry: 34, fill: skin, ...ink }, g);
  const f = new Face(g, face({ line: INK, browColor: "#3b2a20", seed: 61 }));
  el("path", { d: "M -30 -14 Q -30 -40 0 -40 Q 30 -40 30 -14 Z", fill: "#2f3b55", ...ink }, g);             // cap
  el("path", { d: "M -34 -14 L 40 -14 L 44 -8 L -34 -8 Z", fill: "#1f2838", ...ink }, g);
  const shades = el("g", {}, g);
  el("path", { d: "M -22 -11 L -3 -11 L -4 -1 Q -12 4 -21 -1 Z M 3 -11 L 22 -11 L 21 -1 Q 12 4 4 -1 Z", fill: "#14161a", ...ink }, shades);
  el("path", { d: "M -3 -9 L 3 -9", stroke: INK, "stroke-width": 2 }, shades);
  return {
    g,
    /** e: expression; shades: 0 (pushed up under the cap) .. 1 (on) */
    set(e, shadesOn, t) {
      f.set(e, 0, t);
      shades.setAttribute("transform", `translate(0 ${(-22 * (1 - shadesOn)).toFixed(1)})`);
      shades.setAttribute("opacity", clamp(shadesOn * 4).toFixed(2));
    },
  };
}

// ---------------------------------------------------------------- pigeon
export function makePigeon(parent) {
  const g = el("g", {}, parent);
  const legs = [el("path", { stroke: "#c8553d", "stroke-width": 2.5, "stroke-linecap": "round", fill: "none" }, g), el("path", { stroke: "#c8553d", "stroke-width": 2.5, "stroke-linecap": "round", fill: "none" }, g)];
  el("path", { d: "M -30 -24 Q -44 -26 -52 -16 Q -40 -14 -28 -14 Z", fill: "#6f7783", ...ink }, g);         // tail
  el("ellipse", { cx: -6, cy: -26, rx: 26, ry: 16, fill: "#8f98a5", ...ink }, g);
  el("path", { d: "M -24 -30 Q -6 -40 12 -28 Q -4 -18 -24 -30 Z", fill: "#6f7783" }, g);                    // wing
  const head = el("g", {}, g);
  el("path", { d: "M 4 -30 Q 8 -52 18 -54 Q 30 -52 26 -40 Q 22 -30 16 -24 Z", fill: "#7b8794", ...ink }, head);
  el("path", { d: "M 6 -36 Q 14 -30 22 -36", fill: "none", stroke: "#4f9b8a", "stroke-width": 4 }, head);   // neck sheen
  el("path", { d: "M 27 -47 L 37 -44 L 27 -42 Z", fill: "#d9a441", ...ink, "stroke-width": 1 }, head);
  el("circle", { cx: 20, cy: -47, r: 2.4, fill: "#e8762c", stroke: INK, "stroke-width": 1 }, head);
  return {
    g,
    /** p: x, y, flip, walk (phase in steps; a constant phase freezes mid-stride), peck 0..1 */
    set(p) {
      g.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.flip} 1)`);
      const a = (p.walk ?? 0) * Math.PI;
      legs.forEach((leg, i) => {
        const ph = a + i * Math.PI, dx = Math.sin(ph) * 8, lift = Math.max(0, Math.cos(ph)) * 7;
        leg.setAttribute("d", `M ${-10 + i * 8} -12 L ${-10 + i * 8 + dx} ${-lift} l 6 0`);
      });
      const bob = Math.cos(a * 2) * 4;
      head.setAttribute("transform", `translate(${bob.toFixed(1)} 0) rotate(${((p.peck ?? 0) * 55).toFixed(1)} 6 -28)`);
    },
  };
}
