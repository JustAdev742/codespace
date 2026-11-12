// STARTING MONDAY - the set: Dale's living room, the hole in it, props,
// hologram panels and the full-screen insert shots. build() returns handles
// that scene.js animates.
import { el } from "../engine/engine.js";
import { INK } from "./chars.js";

const ink = { stroke: INK, "stroke-width": 5, "stroke-linejoin": "round", "stroke-linecap": "round" };
const thin = { ...ink, "stroke-width": 3 };
const FONT = "'Inter Display', Inter, 'Helvetica Neue', Arial, sans-serif";
const txt = (parent, x, y, text, size, fill = INK, extra = {}) =>
  el("text", { x, y, text, "font-family": FONT, "font-weight": 900, "font-size": size, fill, "text-anchor": "middle", ...extra }, parent);

export const FLOOR = 880;
export const STARS = [
  [548, 222, 5], [590, 300, 3.5], [622, 248, 4], [660, 214, 3], [668, 330, 4.5], [700, 262, 3.5], [716, 400, 4],
  [742, 226, 5], [760, 318, 3], [784, 372, 4.5], [796, 250, 3.5], [570, 392, 4], [612, 432, 3], [690, 440, 3.5],
];

export function buildDefs(stage) {
  const defs = el("defs", {}, stage);
  const grad = (id, kind, stops, attrs = {}) => {
    const g = el(kind, { id, ...attrs }, defs);
    for (const [o, c, a = 1] of stops) el("stop", { offset: o, "stop-color": c, "stop-opacity": a }, g);
  };
  grad("portalG", "radialGradient", [[0, "#ffd9fb"], [0.25, "#ff7df2"], [0.6, "#7a2be0"], [1, "#160a36"]]);
  grad("glowG", "radialGradient", [[0, "#c77dff", 0.75], [0.5, "#7a2be0", 0.3], [1, "#7a2be0", 0]], { cx: "70%", cy: "45%", r: "75%" });
  grad("beamG", "linearGradient", [[0, "#aef6ff", 0.0], [0.5, "#aef6ff", 0.85], [1, "#aef6ff", 0.0]]);
  grad("holyG", "radialGradient", [[0, "#fff6c4", 0.95], [0.5, "#ffd96b", 0.45], [1, "#ffd96b", 0]]);
  grad("kitchenG", "linearGradient", [[0, "#f7c873", 0.55], [1, "#f7c873", 0.05]], { x1: 0, y1: 0, x2: 1, y2: 0 });
  grad("vigG", "radialGradient", [[0.55, "#000", 0], [1, "#000", 0.55]]);
  const clip = el("clipPath", { id: "winClip" }, defs);
  el("rect", { x: 520, y: 190, width: 300, height: 280 }, clip);
  const hole = el("clipPath", { id: "holeClip" }, defs);
  el("path", { id: "holeShape", d: HOLE }, hole);
}

const HOLE = "M 1090 250 L 1150 150 L 1240 190 L 1330 110 L 1420 170 L 1520 130 L 1590 230 L 1640 380 L 1600 520 L 1650 660 L 1610 800 L 1640 880 L 1100 880 L 1130 760 L 1070 640 L 1110 500 L 1060 380 Z";

// ------------------------------------------------------------------ room, behind the cast
export function buildRoom(world) {
  const h = {};
  el("rect", { x: -400, y: -400, width: 2720, height: 1280, fill: "#5d5580" }, world);
  for (let x = -380; x < 2320; x += 120) el("rect", { x, y: -400, width: 4, height: 1280, fill: "#554d77" }, world);

  // the hole the auditors came through
  h.portal = el("g", {}, world);
  const inside = el("g", { "clip-path": "url(#holeClip)" }, h.portal);
  el("rect", { x: 1000, y: 60, width: 720, height: 840, fill: "#160a36" }, inside);
  h.swirl = el("g", {}, inside);
  el("ellipse", { cx: 1360, cy: 470, rx: 420, ry: 420, fill: "url(#portalG)" }, h.swirl);
  for (let i = 0; i < 7; i++)
    el("ellipse", { cx: 1360, cy: 470, rx: 90 + i * 52, ry: 40 + i * 30, fill: "none", stroke: "#ffd9fb", "stroke-width": 3, opacity: 0.35 - i * 0.03, transform: `rotate(${i * 27} 1360 470)` }, h.swirl);
  for (let i = 0; i < 26; i++)
    el("circle", { cx: 1080 + ((i * 197) % 560), cy: 120 + ((i * 331) % 740), r: 1.5 + (i % 3), fill: "#fff", opacity: 0.8 }, inside);
  el("path", { d: HOLE, fill: "none", stroke: "#efe9ff", "stroke-width": 16, "stroke-linejoin": "round" }, h.portal);
  el("path", { d: HOLE, fill: "none", ...ink }, h.portal);
  // curls of torn wallpaper
  for (const [x, y, r] of [[1090, 250, -30], [1330, 110, 10], [1590, 230, 40], [1650, 660, 80], [1070, 640, -80], [1060, 380, -70]])
    el("path", { d: "M 0 0 q 26 -34 58 -12 q -18 4 -26 26 z", fill: "#efe9ff", ...thin, transform: `translate(${x} ${y}) rotate(${r})` }, h.portal);

  el("rect", { x: -400, y: 858, width: 2720, height: 22, fill: "#3b3554" }, world);
  h.holeFloor = el("rect", { x: 1100, y: 858, width: 540, height: 22, fill: "#2a0f55" }, world);
  el("rect", { x: -400, y: FLOOR, width: 2720, height: 600, fill: "#8a6f5c" }, world);
  for (let i = 0; i < 40; i++) el("rect", { x: -380 + ((i * 263) % 2600), y: 900 + ((i * 97) % 170), width: 26, height: 4, rx: 2, fill: "#7d6352" }, world);

  // kitchen doorway, far left
  el("rect", { x: -40, y: 330, width: 180, height: 550, fill: "#2a2540", ...ink }, world);
  el("rect", { x: -40, y: 330, width: 180, height: 550, fill: "url(#kitchenG)" }, world);

  // poster, still in its shrink-wrap
  const poster = el("g", { transform: "translate(180 236) rotate(-3)" }, world);
  el("rect", { width: 156, height: 216, fill: "#f4efe6", ...ink }, poster);
  for (const [i, w] of ["LIVE", "LAUGH", "LIFT"].entries()) txt(poster, 78, 66 + i * 54, w, 38, i === 2 ? "#e0483e" : INK);
  el("path", { d: "M 10 210 L 70 6 M 60 210 L 120 6", stroke: "#fff", "stroke-width": 14, opacity: 0.35 }, poster);
  el("circle", { cx: 132, cy: 26, r: 20, fill: "#ff9f1c", ...thin }, poster);
  txt(poster, 132, 31, "$9", 16);

  // calendar: every Monday circled, then crossed out
  const cal = el("g", { transform: "translate(400 290)" }, world);
  el("rect", { width: 96, height: 118, fill: "#fbfaf5", ...ink }, cal);
  el("rect", { width: 96, height: 24, fill: "#e0483e", ...ink }, cal);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 5; c++) {
      el("rect", { x: 8 + c * 17, y: 34 + r * 20, width: 12, height: 12, fill: "#e6e2d6" }, cal);
      if (c === 1) {
        el("circle", { cx: 14 + c * 17, cy: 40 + r * 20, r: 9, fill: "none", stroke: "#2f8f4e", "stroke-width": 2.5 }, cal);
        el("path", { d: `M ${7 + c * 17} ${33 + r * 20} l 14 14 m 0 -14 l -14 14`, stroke: "#e0483e", "stroke-width": 3 }, cal);
      }
    }

  // window
  el("rect", { x: 520, y: 190, width: 300, height: 280, fill: "#0e1034" }, world);
  h.sky = el("g", { "clip-path": "url(#winClip)" }, world);
  h.moon = el("path", { d: "M 772 228 a 26 26 0 1 0 22 44 a 22 22 0 1 1 -22 -44 z", fill: "#f6f0c8" }, h.sky);
  h.stars = STARS.map(([x, y, r]) => el("path", { d: star(x, y, r * 2.3), fill: "#fff7d6" }, h.sky));
  el("path", { d: "M 520 190 h 300 v 280 h -300 z M 670 190 v 280 M 520 330 h 300", fill: "none", stroke: "#e8e2d0", "stroke-width": 12, "stroke-linejoin": "round" }, world);
  el("rect", { x: 514, y: 184, width: 312, height: 292, fill: "none", ...ink }, world);
  h.curtains = [-1, 1].map((side) =>
    el("path", { d: `M 0 0 q ${-side * 14} 150 ${side * 8} 300 l ${side * 50} 0 q ${-side * 20} -150 ${-side * 6} -300 z`, fill: "#b7495b", ...ink, transform: `translate(${670 + side * 196} 172)` }, world));
  el("rect", { x: 440, y: 160, width: 460, height: 16, rx: 8, fill: "#3b3554", ...thin }, world);

  // employee of the month, once
  const fr = el("g", { transform: "translate(905 300)" }, world);
  el("rect", { width: 128, height: 100, fill: "#f4efe6", stroke: "#d9b65c", "stroke-width": 10 }, fr);
  el("rect", { x: -5, y: -5, width: 138, height: 110, fill: "none", ...thin }, fr);
  txt(fr, 64, 26, "EMPLOYEE OF THE MONTH", 8.5);
  el("circle", { cx: 64, cy: 52, r: 16, fill: "#f2c9a1", ...thin }, fr);
  txt(fr, 64, 88, "MARCH 2011", 10, "#e0483e");

  // front door, far right
  h.doorway = el("g", {}, world);
  el("rect", { x: 1700, y: 372, width: 176, height: 508, fill: "#10122e", ...ink }, h.doorway);
  el("circle", { cx: 1790, cy: 430, r: 60, fill: "#f7c873", opacity: 0.18 }, h.doorway);
  h.door = el("g", {}, h.doorway);
  el("rect", { x: 1700, y: 372, width: 176, height: 508, fill: "#7b4b36", ...ink }, h.door);
  el("rect", { x: 1722, y: 400, width: 132, height: 190, fill: "none", stroke: "#643a28", "stroke-width": 6 }, h.door);
  el("rect", { x: 1722, y: 630, width: 132, height: 210, fill: "none", stroke: "#643a28", "stroke-width": 6 }, h.door);
  el("circle", { cx: 1722, cy: 640, r: 9, fill: "#d9b65c", ...thin }, h.door);
  const tub = el("g", { transform: "translate(1880 792)" }, world);
  el("rect", { width: 70, height: 88, rx: 8, fill: "#22222c", ...ink }, tub);
  el("rect", { y: 22, width: 70, height: 40, fill: "#e0483e" }, tub);
  txt(tub, 35, 50, "WHEY", 20, "#fff");

  // exercise bike, in its true role
  const bike = (h.bike = el("g", { transform: "translate(296 0)" }, world));
  el("path", { d: "M -90 872 h 200 M -30 872 L 0 700 L 60 872 M 0 700 L -34 640 M 0 700 L 66 620 L 66 590", fill: "none", ...ink, "stroke-width": 12, stroke: "#3c3c4a" }, bike);
  el("circle", { cx: 40, cy: 790, r: 58, fill: "#55556a", ...ink }, bike);
  el("circle", { cx: 40, cy: 790, r: 16, fill: "#c7c9d6", ...thin }, bike);
  h.crank = el("g", { transform: "translate(40 790)" }, bike);
  el("path", { d: "M -34 0 L 34 0 M -48 0 h 20 M 28 0 h 20", stroke: INK, "stroke-width": 9, "stroke-linecap": "round" }, h.crank);
  h.seat = el("path", { d: "M -70 640 q 30 -18 62 0 q -30 12 -62 0 z", fill: "#22222c", ...ink }, bike);
  el("path", { d: "M 40 590 h 56", ...ink, "stroke-width": 12, stroke: "#3c3c4a" }, bike);
  h.jackets = el("g", {}, bike);
  el("path", { d: "M 30 582 q 40 -22 76 4 l 22 150 q -40 22 -78 4 l -34 -120 z", fill: "#d94f4f", ...ink }, h.jackets);
  el("path", { d: "M 66 600 q 30 -10 54 6 l 34 190 q -34 16 -58 -2 z", fill: "#4f7bd9", ...ink }, h.jackets);
  el("path", { d: "M 20 590 q 22 -16 44 -2 l -8 170 q -30 10 -50 -8 z", fill: "#f0c93a", ...ink }, h.jackets);
  el("path", { d: "M 58 578 q 10 -22 22 0", fill: "none", ...thin }, h.jackets);

  // couch
  const couch = el("g", {}, world);
  el("rect", { x: 430, y: 600, width: 420, height: 200, rx: 34, fill: "#c9963f", ...ink }, couch);
  el("path", { d: "M 640 610 v 150", stroke: "#b08030", "stroke-width": 5 }, couch);
  el("rect", { x: 440, y: 742, width: 400, height: 64, rx: 18, fill: "#dcae55", ...ink }, couch);
  el("rect", { x: 436, y: 800, width: 408, height: 62, fill: "#b8862f", ...ink }, couch);
  el("rect", { x: 448, y: 862, width: 384, height: 18, fill: "#1c1626" }, couch);
  for (const x of [404, 812]) el("rect", { x, y: 664, width: 62, height: 204, rx: 22, fill: "#c08d35", ...ink }, couch);

  // coffee table and the phone on it
  const table = el("g", {}, world);
  el("path", { d: "M 900 800 v 78 M 1040 800 v 78", ...ink, "stroke-width": 12, stroke: "#5c3a20" }, table);
  el("rect", { x: 874, y: 786, width: 192, height: 18, rx: 6, fill: "#8a5a33", ...ink }, table);
  el("path", { d: "M 1010 786 v -30 h 30 v 30 M 1040 764 q 16 0 14 12 q -2 8 -14 6", fill: "#f4efe6", ...thin }, table);
  return h;
}

function star(x, y, r) {
  return `M ${x} ${y - r} L ${x + r * 0.28} ${y - r * 0.28} L ${x + r} ${y} L ${x + r * 0.28} ${y + r * 0.28} L ${x} ${y + r} L ${x - r * 0.28} ${y + r * 0.28} L ${x - r} ${y} L ${x - r * 0.28} ${y - r * 0.28} Z`;
}

// ------------------------------------------------------------------ small props that move
export function buildProps(world) {
  const h = {};
  h.phone = el("g", {}, world);
  el("rect", { x: -26, y: -9, width: 52, height: 12, rx: 4, fill: "#22222c", ...thin }, h.phone);
  el("rect", { x: -22, y: -9, width: 44, height: 4, rx: 2, fill: "#9be7ff" }, h.phone);
  h.notes = [0, 1, 2].map(() => txt(h.phone, 0, 0, "♪", 30, "#9be7ff", { opacity: 0 }));

  h.nachos = el("g", {});
  el("ellipse", { cx: 0, cy: 0, rx: 62, ry: 14, fill: "#f4efe6", ...ink }, h.nachos);
  for (const [x, y, r] of [[-34, -8, -20], [-12, -18, 12], [10, -10, -8], [30, -16, 24], [-22, -28, 30], [8, -30, -24], [0, -44, 6]])
    el("path", { d: "M -17 8 L 0 -18 L 17 8 Z", fill: "#f0b53a", ...thin, transform: `translate(${x} ${y}) rotate(${r})` }, h.nachos);
  el("path", { d: "M -30 -20 q 14 -16 28 -6 q 10 -18 30 -4 q 6 12 -6 16 q -30 8 -52 -6 z", fill: "#ffd34d", opacity: 0.95 }, h.nachos);
  for (const [x, y, c] of [[-14, -24, "#d94f4f"], [12, -30, "#3f9d54"], [22, -12, "#d94f4f"], [-2, -40, "#3f9d54"]]) el("circle", { cx: x, cy: y, r: 5, fill: c }, h.nachos);

  h.remote = el("g", {});
  el("rect", { x: -9, y: -30, width: 18, height: 60, rx: 5, fill: "#22222c", ...thin }, h.remote);
  el("circle", { cx: 0, cy: -20, r: 4, fill: "#e0483e" }, h.remote);

  h.bradPhone = el("g", {});
  el("rect", { x: -13, y: -44, width: 26, height: 50, rx: 5, fill: "#22222c", ...thin }, h.bradPhone);
  el("circle", { cx: 0, cy: -34, r: 4, fill: "#e0483e" }, h.bradPhone);

  h.rays = el("g", {}, world);
  el("circle", { r: 230, fill: "url(#holyG)" }, h.rays);
  for (let i = 0; i < 12; i++) el("path", { d: "M 0 -70 L 12 -250 L -12 -250 Z", fill: "#fff6c4", opacity: 0.5, transform: `rotate(${i * 30})` }, h.rays);

  h.tear = el("path", { d: "M 0 -10 q 9 12 0 18 q -9 -6 0 -18 z", fill: "#9be7ff", ...thin }, world);
  h.sparkles = el("g", {}, world);
  for (let i = 0; i < 9; i++) el("path", { d: star(0, 0, 14), fill: "#ffe66d", stroke: INK, "stroke-width": 2 }, h.sparkles);
  h.confetti = el("g", {}, world);
  for (let i = 0; i < 40; i++) el("rect", { width: 14, height: 8, fill: ["#ffe66d", "#7df0ff", "#ff7df2", "#8fe0b4"][i % 4] }, h.confetti);
  h.beam = el("path", { fill: "url(#beamG)" }, world);
  h.suit = el("g", {}, world);
  el("path", { d: "M -60 -330 q 60 -40 120 0 l 30 190 l -40 10 l 6 130 l -40 0 l -16 -110 l -16 110 l -40 0 l 6 -130 l -40 -10 z", fill: "#e39a55", ...ink }, h.suit);
  el("path", { d: "M -40 -300 q 40 -22 80 0 l 12 150 l -104 0 z", fill: "#d8ff3d", ...ink }, h.suit);
  el("path", { d: "M 0 -310 v 300", stroke: "#c7c9d6", "stroke-width": 6, "stroke-dasharray": "4 5" }, h.suit);
  return h;
}

// ------------------------------------------------------------------ the hologram
const CY = "#7df0ff";
export function buildHolo(world) {
  const root = el("g", { transform: "translate(1010 330)" }, world);
  const cone = el("path", { d: "M 150 190 L -150 150 L 150 150 Z", fill: CY, opacity: 0.12 }, root);
  el("rect", { x: -200, y: -150, width: 400, height: 300, rx: 16, fill: "#0b2a44", opacity: 0.78, stroke: CY, "stroke-width": 4 }, root);
  for (let y = -140; y < 150; y += 12) el("rect", { x: -196, y, width: 392, height: 2, fill: CY, opacity: 0.1 }, root);
  const panels = {};
  const panel = (name) => (panels[name] = el("g", { opacity: 0 }, root));
  const big = (g, y, s, size = 64, fill = CY) => txt(g, 0, y, s, size, fill);
  const small = (g, y, s, fill = CY, size = 26) => txt(g, 0, y, s, size, fill, { "font-weight": 700 });
  const cross = (g) => el("path", { d: "M -70 -70 L 70 70 M 70 -70 L -70 70", stroke: "#ff5d5d", "stroke-width": 16, "stroke-linecap": "round" }, g);

  let g = panel("stats");
  small(g, -96, "MEMBER 000417: KRUPNIK, D."); big(g, -18, "VISITS: 0", 76); small(g, 40, "MONDAYS INTENDED"); big(g, 118, "573", 80, "#ffe66d");
  g = panel("gold");
  el("path", { d: "M -90 30 L -60 -40 L 60 -40 L 90 30 Z", fill: "#ffd34d", stroke: CY, "stroke-width": 4 }, g); small(g, 100, "GOLD: MINEABLE", "#ff5d5d"); cross(g);
  g = panel("light");
  big(g, 20, "c", 150); small(g, 100, "SPEED OF LIGHT"); const st = el("g", { transform: "rotate(-14)" }, g);
  el("rect", { x: -170, y: -34, width: 340, height: 62, fill: "none", stroke: "#ff5d5d", "stroke-width": 7 }, st); txt(st, 0, 14, "NEGOTIABLE", 46, "#ff5d5d");
  g = panel("dale");
  for (let i = 0; i < 3; i++) el("ellipse", { rx: 150 - i * 30, ry: 56 - i * 10, fill: "none", stroke: CY, "stroke-width": 2.5, opacity: 0.6, transform: `rotate(${-20 + i * 24})` }, g);
  el("rect", { x: -44, y: -30, width: 88, height: 54, rx: 10, fill: "#ff7b3a", stroke: CY, "stroke-width": 4 }, g); el("circle", { cx: -28, cy: -3, r: 8, fill: "#0b2a44" }, g);
  txt(g, 10, 6, "FLEXZONE", 13, "#0b2a44"); small(g, -96, "THE DALE STANDARD"); big(g, 124, "AAA+", 60, "#ffe66d");
  g = panel("score");
  small(g, -90, "VARSITY WRESTLING, 1997"); big(g, -10, "SCOREKEEPER", 50); small(g, 50, "TAKEDOWNS: 0   PINS: 0"); small(g, 100, "PENCILS SHARPENED: 212", "#ffe66d");
  g = panel("offer");
  el("circle", { cx: -120, cy: -20, r: 44, fill: "#c7c9d6", stroke: CY, "stroke-width": 4 }, g); el("circle", { cx: 0, cy: -20, r: 50, fill: "#ffd34d", stroke: CY, "stroke-width": 4 }, g);
  txt(g, 122, 14, "∞", 110, CY); small(g, 100, "ANYTHING. NAME IT.");
  g = panel("greg");
  el("circle", { cx: 0, cy: -50, r: 46, fill: "#f2c9a1", stroke: CY, "stroke-width": 4 }, g); el("path", { d: "M -18 -56 h 8 M 10 -56 h 8 M -14 -30 q 14 10 28 0", stroke: "#0b2a44", "stroke-width": 5, fill: "none", "stroke-linecap": "round" }, g);
  big(g, 50, "GREG", 54); small(g, 104, "NOTIFIED ✓", "#8fe0b4", 34);
  g = panel("greg2");
  el("circle", { cx: 0, cy: -50, r: 46, fill: "#f2c9a1", stroke: CY, "stroke-width": 4 }, g); el("path", { d: "M -22 -62 l 12 6 M 22 -62 l -12 6 M -16 -22 q 16 -14 32 0", stroke: "#0b2a44", "stroke-width": 5, fill: "none", "stroke-linecap": "round" }, g);
  el("path", { d: "M -16 -48 q -6 20 0 34 M 16 -48 q 6 20 0 34", stroke: CY, "stroke-width": 6, fill: "none", "stroke-linecap": "round" }, g);
  big(g, 50, "GREG", 54); small(g, 104, "DEVASTATED", "#ff5d5d", 34);
  g = panel("short");
  big(g, -40, "VEX CAPITAL", 46, "#ff5d5d"); small(g, 14, "POSITION: SHORT DALE"); big(g, 100, "40 : 1", 72, "#ff5d5d");
  g = panel("crash");
  small(g, -100, "THE DALE (DLE)", "#ff5d5d"); const crashLine = el("path", { fill: "none", stroke: "#ff5d5d", "stroke-width": 8, "stroke-linejoin": "round" }, g);
  const halted = txt(g, 0, 124, "ANDROMEDA: TRADING HALTED", 23, "#ff5d5d");
  g = panel("moon");
  small(g, -100, "THE DALE (DLE)", "#8fe0b4"); const moonLine = el("path", { fill: "none", stroke: "#8fe0b4", "stroke-width": 8, "stroke-linejoin": "round" }, g);
  big(g, 124, "PEG HOLDS", 46, "#8fe0b4");
  g = panel("sharon");
  small(g, -96, "KRUPNIK, S."); small(g, -50, "“ONE MORE THING AND I'M LEAVING”", CY, 21); big(g, 40, "4,000×", 84, "#ffe66d"); small(g, 104, "STILL HERE", "#8fe0b4", 30);
  return { root, cone, panels, crashLine, moonLine, halted };
}

// ------------------------------------------------------------------ full-screen inserts and cards
export function buildInserts(stage) {
  const h = {};
  // phone screen
  h.phone = el("g", {}, stage);
  el("rect", { width: 1920, height: 1080, fill: "#2a2540" }, h.phone);
  el("rect", { x: 0, y: 860, width: 1920, height: 220, fill: "#8a5a33" }, h.phone);
  const ph = el("g", { transform: "translate(960 560) rotate(-4)" }, h.phone);
  el("rect", { x: -300, y: -470, width: 600, height: 980, rx: 70, fill: "#22222c", ...ink, "stroke-width": 8 }, ph);
  el("rect", { x: -268, y: -420, width: 536, height: 880, rx: 40, fill: "#0e2238" }, ph);
  el("circle", { cx: 0, cy: -300, r: 70, fill: "#ff7b3a" }, ph);
  txt(ph, 0, -278, "FZ", 62, "#fff");
  txt(ph, 0, -180, "FlexZone Member Care", 40, "#fff", { "font-weight": 700 });
  txt(ph, 0, -110, "ON HOLD", 34, "#9be7ff", { "letter-spacing": 8 });
  h.timer = txt(ph, 0, 40, "47:12", 150, "#fff");
  h.bars = Array.from({ length: 9 }, (_, i) => el("rect", { x: -196 + i * 46, width: 26, rx: 8, fill: "#9be7ff" }, ph));
  h.phoneLine = txt(ph, 0, 330, "", 30, "#9be7ff", { "font-weight": 600 });
  el("circle", { cx: 0, cy: 400, r: 44, fill: "#e0483e" }, ph);

  // under the couch
  h.under = el("g", {}, stage);
  el("rect", { width: 1920, height: 1080, fill: "#15101f" }, h.under);
  el("rect", { y: 0, width: 1920, height: 300, fill: "#b8862f", ...ink }, h.under);
  el("rect", { y: 300, width: 1920, height: 50, fill: "#0a0710" }, h.under);
  el("rect", { y: 800, width: 1920, height: 280, fill: "#6d5647" }, h.under);
  h.underRays = el("g", { transform: "translate(1080 690)" }, h.under);
  el("circle", { r: 420, fill: "url(#holyG)" }, h.underRays);
  for (let i = 0; i < 12; i++) el("path", { d: "M 0 -120 L 22 -470 L -22 -470 Z", fill: "#fff6c4", opacity: 0.35, transform: `rotate(${i * 30})` }, h.underRays);
  const rem = el("g", { transform: "translate(1080 720) rotate(-78)" }, h.under);
  el("rect", { x: -60, y: -190, width: 120, height: 380, rx: 30, fill: "#22222c", ...ink, "stroke-width": 8 }, rem);
  el("circle", { cx: 0, cy: -130, r: 22, fill: "#e0483e", ...thin }, rem);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) el("rect", { x: -40 + c * 30, y: -70 + r * 44, width: 20, height: 24, rx: 6, fill: "#55556a" }, rem);
  for (const [x, y, s] of [[420, 760, 1.2], [1500, 800, 0.9], [760, 830, 0.7]]) {
    const d = el("g", { transform: `translate(${x} ${y}) scale(${s})` }, h.under);
    for (let i = 0; i < 9; i++) el("circle", { cx: Math.cos(i * 0.7) * 34, cy: Math.sin(i * 1.3) * 18, r: 22 + (i % 3) * 6, fill: "#8d8799", opacity: 0.7 }, d);
  }
  el("path", { d: "M 520 770 q 40 -40 90 -10 q 20 26 -20 36 q -50 8 -70 -26 z", fill: "#ff9f1c", ...ink }, h.under);           // cheese puff
  const flyer = el("g", { transform: "translate(1420 620) rotate(12)" }, h.under);
  el("rect", { width: 260, height: 180, fill: "#f4efe6", ...ink }, flyer);
  txt(flyer, 130, 50, "FLEXZONE", 34, "#ff7b3a"); txt(flyer, 130, 96, "FREE SESSION!", 28); txt(flyer, 130, 140, "expires 2014", 22, "#e0483e", { "font-weight": 600 });
  h.cheek = el("g", {}, h.under);
  el("ellipse", { cx: -140, cy: 780, rx: 420, ry: 330, fill: "#f2c9a1", ...ink, "stroke-width": 8 }, h.cheek);
  h.eye = el("g", { transform: "translate(150 640)" }, h.cheek);
  el("ellipse", { rx: 78, ry: 88, fill: "#fff", ...ink, "stroke-width": 8 }, h.eye);
  h.pupil = el("circle", { r: 26, fill: INK }, h.eye);
  el("path", { d: "M 60 530 q 90 -40 190 0", fill: "none", stroke: "#5a3d2b", "stroke-width": 22, "stroke-linecap": "round" }, h.cheek);

  // title card and end card
  const card = (name) => {
    const g = (h[name] = el("g", {}, stage));
    el("rect", { width: 1920, height: 1080, fill: name === "title" ? "#1a0b3d" : "#08060f" }, g);
    return g;
  };
  let g = card("title");
  for (let i = 0; i < 60; i++) el("circle", { cx: (i * 367) % 1920, cy: (i * 211) % 1080, r: 1 + (i % 3), fill: "#fff", opacity: 0.6 }, g);
  h.titleWords = ["STARTING", "MONDAY"].map((w, i) => {
    const t = el("g", {}, g);
    txt(t, 0, 0, w, 250, INK, { stroke: INK, "stroke-width": 34, "stroke-linejoin": "round" });
    txt(t, 0, 0, w, 250, i ? "#ffe66d" : "#fff");
    return t;
  });
  g = card("end");
  txt(g, 960, 330, "STARTING MONDAY", 130, "#ffe66d");
  const credit = (y, s, size = 34, fill = "#d6d0ea") => txt(g, 960, y, s, size, fill, { "font-weight": 600 });
  credit(470, "Written, directed and animated by Claude");
  credit(540, "Voices and effects generated with ElevenLabs");
  credit(600, "Dale: Chris   Zeth: Daniel   Quib: Laura   Brad: Charlie   Kayla: Jessica   Sharon: Sarah", 26, "#9d97b8");
  credit(760, "No gym was attended in the making of this film.", 30, "#ffe66d");
  h.black = el("rect", { width: 1920, height: 1080, fill: "#000" }, stage);
  h.flash = el("rect", { width: 1920, height: 1080, fill: "#fff", opacity: 0 }, stage);
  return h;
}
