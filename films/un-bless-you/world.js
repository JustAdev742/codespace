// UN-BLESS YOU - the set: a bus stop on an ordinary morning, the bus, props,
// and the full-frame inserts. Drawn flat and muted to read as a filmed
// location, not a cartoon. build*() return handles that scene.js animates.
import { el } from "../engine/engine.js";
import { INK } from "./chars.js";

const FONT = "Inter, 'Helvetica Neue', Arial, sans-serif";
const line = { stroke: INK, "stroke-width": 1.4, "stroke-linejoin": "round" };
const txt = (parent, x, y, text, size, fill = INK, extra = {}) =>
  el("text", { x, y, text, "font-family": FONT, "font-weight": 700, "font-size": size, fill, "text-anchor": "middle", ...extra }, parent);

export const GROUND = 905;    // where standing feet go
export const SEAT = 760;      // hip height on the bench
export const SEATS = { A: 430, B: 650, C: 870, D: 1090 };
export const DOOR = 1770;     // bus front door, once the bus has stopped
export const DOOR_LOCAL = 205; // the same door, measured from the front of the bus
export const KERB = 712;
export const DRAIN = [1640, 978];
export const BUS_TOP = 205;   // roof line of the bus; the doorway is tall enough for Leonard

export function buildDefs(stage) {
  const defs = el("defs", {}, stage);
  const grad = (id, stops, attrs = {}, kind = "linearGradient") => {
    const g = el(kind, { id, ...attrs }, defs);
    for (const [o, c, a = 1] of stops) el("stop", { offset: o, "stop-color": c, "stop-opacity": a }, g);
  };
  grad("sky", [[0, "#9fc3d9"], [0.7, "#d9e3df"], [1, "#efe5cf"]], { x1: 0, y1: 0, x2: 0, y2: 1 });
  grad("glass", [[0, "#cfe3ea", 0.38], [1, "#9fbcc6", 0.22]], { x1: 0, y1: 0, x2: 1, y2: 1 });
  grad("sun", [[0, "#fff4d6", 0.55], [1, "#fff4d6", 0]], { cx: "8%", cy: "0%", r: "75%" }, "radialGradient");
  grad("vig", [[0.6, "#000", 0], [1, "#000", 0.42]], {}, "radialGradient");
  grad("thread", [[0, "#fff8d8"], [0.5, "#ffe9a8"], [1, "#fff8d8"]], { x1: 0, y1: 0, x2: 1, y2: 0 });
  const f = el("filter", { id: "glow", x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
  el("feGaussianBlur", { stdDeviation: 5, result: "b" }, f);
  const m = el("feMerge", {}, f);
  el("feMergeNode", { in: "b" }, m);
  el("feMergeNode", { in: "SourceGraphic" }, m);
  const dof = el("filter", { id: "dof", x: "-5%", y: "-5%", width: "110%", height: "110%" }, defs);
  const blur = el("feGaussianBlur", { stdDeviation: 0 }, dof);
  return { blur };
}

// ------------------------------------------------------------------ the far side: sky, shops, road
export function buildFar(world) {
  const g = el("g", { filter: "url(#dof)" }, world);
  el("rect", { x: -600, y: -300, width: 3400, height: 900, fill: "url(#sky)" }, g);
  const shops = [
    { x: -500, w: 520, h: 430, c: "#b5654a", sign: "", awn: null },
    { x: 20, w: 470, h: 380, c: "#d8c9a8", sign: "CAFÉ", awn: "#2f5d50" },
    { x: 490, w: 520, h: 450, c: "#8f4f43", sign: "PHARMACY", awn: "#3c6e8f" },
    { x: 1010, w: 440, h: 400, c: "#c9b48d", sign: "LAUNDRETTE", awn: "#a8443a" },
    { x: 1450, w: 560, h: 470, c: "#a35b47", sign: "NEWS & WINE", awn: "#4f4f6b" },
    { x: 2010, w: 600, h: 420, c: "#d3c3a0", sign: "", awn: null },
  ];
  for (const s of shops) {
    const top = 560 - s.h;
    el("rect", { x: s.x, y: top, width: s.w, height: s.h, fill: s.c }, g);
    el("rect", { x: s.x, y: top, width: s.w, height: 14, fill: "#000", opacity: 0.08 }, g);
    for (let r = 0; r < Math.floor((s.h - 170) / 90); r++)
      for (let k = 0; k < Math.floor(s.w / 110); k++)
        el("rect", { x: s.x + 30 + k * 110, y: top + 40 + r * 90, width: 56, height: 58, fill: "#5d6f7a", stroke: "#efe8da", "stroke-width": 5 }, g);
    if (s.awn) {
      el("rect", { x: s.x + 20, y: 430, width: s.w - 40, height: 130, fill: "#3f4c53" }, g);
      el("rect", { x: s.x + 30, y: 440, width: s.w - 60, height: 110, fill: "#7f9aa3", opacity: 0.7 }, g);
      el("path", { d: `M ${s.x + 10} 412 L ${s.x + s.w - 10} 412 L ${s.x + s.w - 24} 444 L ${s.x + 24} 444 Z`, fill: s.awn }, g);
      for (let k = s.x + 24; k < s.x + s.w - 30; k += 36) el("rect", { x: k, y: 412, width: 18, height: 32, fill: "#fff", opacity: 0.18 }, g);
      el("rect", { x: s.x + 40, y: 376, width: s.w - 80, height: 30, fill: "#f2ede1" }, g);
      txt(g, s.x + s.w / 2, 398, s.sign, 21, "#333", { "letter-spacing": 3 });
    }
  }
  el("rect", { x: -600, y: 560, width: 3400, height: 30, fill: "#b9b3a8" }, g);          // far pavement
  el("rect", { x: -600, y: 588, width: 3400, height: 6, fill: "#8d877d" }, g);
  el("rect", { x: -600, y: 594, width: 3400, height: KERB - 594, fill: "#55585c" }, g);  // road
  for (let x = -560; x < 2800; x += 180) el("rect", { x, y: 648, width: 90, height: 6, fill: "#e8e2cf", opacity: 0.85 }, g);
  return g;
}

// ------------------------------------------------------------------ the bus
export function buildBus(world) {
  const h = {};
  const bus = (h.bus = el("g", {}, world));
  const L = 1500, top = BUS_TOP;
  h.body = el("g", {}, bus);
  el("path", { d: `M 0 ${KERB - 20} L 0 ${top + 60} Q 0 ${top} 60 ${top} L ${L} ${top} L ${L} ${KERB - 20} Z`, fill: "#2f7f86", ...line }, h.body);
  el("rect", { x: 0, y: KERB - 120, width: L, height: 80, fill: "#e8e2cf" }, h.body);                   // cream band
  el("rect", { x: 0, y: top + 20, width: L, height: 18, fill: "#e8e2cf", opacity: 0.6 }, h.body);
  el("path", { d: `M 8 ${top + 50} Q 10 ${top + 14} 52 ${top + 12} L 120 ${top + 12} L 120 ${top + 240} L 8 ${top + 240} Z`, fill: "#3b4a52", ...line }, h.body); // windscreen
  el("rect", { x: 14, y: top + 18, width: 100, height: 30, fill: "#141414" }, h.body);
  txt(h.body, 64, top + 41, "14  CITY CENTRE", 15, "#ffb000", { "font-family": "monospace" });
  for (let x = 330; x < L - 60; x += 170) el("rect", { x, y: top + 60, width: 150, height: 170, rx: 6, fill: "#3b4a52", ...line }, h.body);
  el("rect", { x: 330, y: top + 60, width: 150, height: 170, rx: 6, fill: "#cfe3ea", opacity: 0.15 }, h.body);
  el("rect", { x: 129, y: top + 40, width: 152, height: KERB - 60 - top, fill: "#1e2629" }, h.body);  // door aperture
  for (const x of [400, 1240]) {
    el("circle", { cx: x, cy: KERB - 18, r: 50, fill: "#1d1d1f" }, h.body);
    el("circle", { cx: x, cy: KERB - 18, r: 24, fill: "#9a9ea3" }, h.body);
  }
  el("rect", { x: -6, y: KERB - 46, width: 20, height: 22, fill: "#ffe7a3", ...line }, h.body);         // headlight
  // the driver sits behind the windscreen; the scene parents him here
  h.driverSlot = el("g", { transform: `translate(66 ${top + 150})` }, bus);
  el("rect", { x: 10, y: top + 230, width: 106, height: 14, fill: "#3b4a52" }, bus);                  // dash, in front of him
  // door aperture: whoever boards stands in here, between body and doors
  const doorway = el("clipPath", { id: "doorway" }, bus);
  el("rect", { x: 129, y: top + 40, width: 152, height: KERB - 60 - top }, doorway);
  h.inside = el("g", { "clip-path": "url(#doorway)" }, bus);
  h.doors = el("g", { transform: `translate(${DOOR_LOCAL} 0)` }, bus);   // door panels, relative to the door centre
  h.doorL = el("g", {}, h.doors);
  h.doorR = el("g", {}, h.doors);
  for (const [d, s] of [[h.doorL, -1], [h.doorR, 1]]) {
    const x0 = s < 0 ? -76 : 0, y0 = top + 40, y1 = KERB - 20;
    // a frame with a real hole in it, so whoever is inside shows through the glass
    el("path", { d: `M ${x0} ${y0} h 76 V ${y1} h -76 Z M ${x0 + 10} ${top + 52} V ${top + 352} h 56 V ${top + 52} Z`, fill: "#2f7f86", "fill-rule": "evenodd", ...line }, d);
    el("rect", { x: x0 + 10, y: top + 52, width: 56, height: 300, fill: "url(#glass)" }, d);
  }
  return h;
}

// ------------------------------------------------------------------ the near pavement and the shelter
export function buildNear(world) {
  const h = {};
  el("rect", { x: -600, y: KERB, width: 3400, height: 14, fill: "#cfcac0", ...line }, world);         // kerb
  el("rect", { x: -600, y: KERB + 14, width: 3400, height: 600, fill: "#bdb7ab" }, world);
  for (let y = 780; y < 1200; y += 70) el("rect", { x: -600, y, width: 3400, height: 2, fill: "#a9a397" }, world);
  for (let x = -560; x < 2800; x += 150) el("rect", { x, y: KERB + 14, width: 2, height: 600, fill: "#a9a397", transform: `skewX(${(x - 960) / 60})` }, world);
  // storm drain
  const [dx, dy] = DRAIN;
  el("rect", { x: dx - 70, y: dy - 18, width: 140, height: 36, rx: 3, fill: "#2a2a2c", ...line }, world);
  for (let k = -56; k <= 56; k += 14) el("rect", { x: dx + k - 3, y: dy - 14, width: 6, height: 28, fill: "#6e6e72" }, world);
  // bin and lamp
  el("path", { d: "M 120 905 L 110 760 L 210 760 L 200 905 Z", fill: "#3b4a3c", ...line }, world);
  el("rect", { x: 102, y: 748, width: 116, height: 16, rx: 4, fill: "#2c382d", ...line }, world);
  el("rect", { x: 1950, y: 120, width: 14, height: 790, fill: "#4a4f55" }, world);
  el("path", { d: "M 1957 130 q 0 -40 -60 -40 l -20 0", fill: "none", stroke: "#4a4f55", "stroke-width": 12 }, world);
  // bus stop pole and flag
  el("rect", { x: 1553, y: 250, width: 12, height: 660, fill: "#8d9399" }, world);
  el("rect", { x: 1500, y: 236, width: 118, height: 92, rx: 8, fill: "#c8423b", ...line }, world);
  el("circle", { cx: 1559, cy: 268, r: 22, fill: "#fff" }, world);
  txt(world, 1559, 276, "BUS", 15, "#c8423b", { "font-weight": 900 });
  txt(world, 1559, 318, "14  22  N9", 17, "#fff");
  el("rect", { x: 1468, y: 430, width: 78, height: 104, fill: "#f2ede1", ...line }, world);
  for (let i = 0; i < 6; i++) el("rect", { x: 1478, y: 446 + i * 14, width: 58, height: 5, fill: "#9a958b" }, world);
  // shelter
  const sh = (h.shelter = el("g", {}, world));
  el("rect", { x: 240, y: 300, width: 1010, height: 470, fill: "url(#glass)", stroke: "#8d9399", "stroke-width": 4 }, sh);
  el("rect", { x: 250, y: 470, width: 990, height: 4, fill: "#fff", opacity: 0.35 }, sh);
  el("path", { d: "M 320 300 L 520 770 M 900 300 L 1100 770", stroke: "#fff", "stroke-width": 18, opacity: 0.12 }, sh); // reflections
  el("rect", { x: 260, y: 360, width: 230, height: 300, fill: "#efe7d4", ...line }, sh);                  // advert
  txt(sh, 375, 470, "GOOD", 46, "#c8423b", { "font-weight": 900 });
  txt(sh, 375, 520, "MORNING", 34, "#c8423b", { "font-weight": 900 });
  txt(sh, 375, 600, "coffee, kindly made", 18, "#555");
  for (const x of [234, 1244]) el("rect", { x, y: 270, width: 14, height: 640, fill: "#8d9399", ...line }, sh);
  el("rect", { x: 210, y: 256, width: 1070, height: 26, rx: 4, fill: "#5f666d", ...line }, sh);
  // bench
  const bench = (h.bench = el("g", {}, world));
  for (const x of [380, 1150]) el("rect", { x: x - 8, y: SEAT, width: 16, height: GROUND - SEAT - 10, fill: "#5f666d" }, bench);
  for (let i = 0; i < 3; i++) el("rect", { x: 320, y: SEAT - 6 + i * 11, width: 880, height: 9, rx: 3, fill: "#9c6b45", ...line }, bench);
  return h;
}

// ------------------------------------------------------------------ props the hands carry
export function buildProps() {
  const h = {};
  h.paper = el("g", {});
  el("rect", { x: -62, y: -48, width: 124, height: 86, fill: "#ece6d6", ...line }, h.paper);
  el("rect", { x: -54, y: -40, width: 50, height: 6, fill: "#555" }, h.paper);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) el("rect", { x: 6 + c * 12, y: -36 + r * 12, width: 11, height: 11, fill: (r + c) % 3 ? "#fff" : "#2a2a2a", stroke: "#999", "stroke-width": 0.6 }, h.paper);
  for (let i = 0; i < 5; i++) el("rect", { x: -54, y: -26 + i * 9, width: 50, height: 3, fill: "#9a958b" }, h.paper);
  for (let i = 0; i < 3; i++) el("rect", { x: -54, y: 18 + i * 7, width: 108, height: 3, fill: "#9a958b" }, h.paper);
  h.pen = el("g", {});
  el("rect", { x: -2.5, y: -26, width: 5, height: 32, rx: 2, fill: "#1f3b8a" }, h.pen);
  h.penCap = el("rect", { x: -3.5, y: -30, width: 7, height: 12, rx: 2, fill: "#1f3b8a", stroke: "#fff", "stroke-width": 0.8 }, h.pen);
  h.phone = el("g", {});
  el("rect", { x: -11, y: -21, width: 22, height: 40, rx: 4, fill: "#1b1b1d", ...line }, h.phone);
  h.phoneGlow = el("rect", { x: -8, y: -17, width: 16, height: 31, rx: 2, fill: "#8fd3ff", opacity: 0 }, h.phone);
  h.finger = el("g", {});
  el("rect", { x: -4.5, y: -30, width: 9, height: 28, rx: 4.5, fill: "#9a6645", ...line }, h.finger);   // the "one sec" finger
  h.notebook = el("g", {});
  el("rect", { x: -16, y: -22, width: 32, height: 40, rx: 2, fill: "#d9d0b8", ...line }, h.notebook);
  for (let i = 0; i < 6; i++) el("circle", { cx: -12 + i * 4.8, cy: -22, r: 1.6, fill: "none", stroke: "#666", "stroke-width": 1 }, h.notebook);
  h.packet = el("g", {});
  el("rect", { x: -9, y: -14, width: 18, height: 26, fill: "#f2ede1", ...line }, h.packet);
  el("rect", { x: -9, y: -4, width: 18, height: 8, fill: "#333" }, h.packet);
  h.thermos = el("g", {});
  el("rect", { x: -13, y: -62, width: 26, height: 62, rx: 6, fill: "#6b7f54", ...line }, h.thermos);
  el("rect", { x: -15, y: -72, width: 30, height: 14, rx: 4, fill: "#3f4d31", ...line }, h.thermos);
  h.airpod = el("g", {});
  el("path", { d: "M -5 -6 q 7 -3 9 3 q 1 4 -4 5 l 0 12 l -4 0 z", fill: "#fdfdfb", ...line, "stroke-width": 1 }, h.airpod);
  h.thread = el("g", { filter: "url(#glow)" });
  h.threadHalo = el("path", { fill: "none", stroke: "#ffc53d", "stroke-width": 14, "stroke-linecap": "round", opacity: 0.45 }, h.thread);
  h.threadCore = el("path", { fill: "none", stroke: "#fffbe6", "stroke-width": 5, "stroke-linecap": "round" }, h.thread);
  h.knot = el("rect", { x: -10, y: -10, width: 20, height: 20, rx: 3, fill: "#fff3c4", stroke: "#ffc53d", "stroke-width": 4, filter: "url(#glow)" });
  h.hubcap = el("g", {});
  el("ellipse", { rx: 34, ry: 34, fill: "#b9bec4", ...line }, h.hubcap);
  el("ellipse", { rx: 22, ry: 22, fill: "#d9dde1", ...line }, h.hubcap);
  for (let i = 0; i < 5; i++) el("rect", { x: -2, y: -32, width: 4, height: 12, fill: "#8d9399", transform: `rotate(${i * 72})` }, h.hubcap);
  h.sunGlare = el("circle", { r: 260, fill: "url(#sun)" });
  return h;
}

// ------------------------------------------------------------------ full-frame inserts and cards
export function buildInserts(stage) {
  const h = {};
  h.phone = el("g", {}, stage);
  el("rect", { width: 1920, height: 1080, fill: "#a9a397" }, h.phone);
  for (let y = 120; y < 1080; y += 160) el("rect", { y, width: 1920, height: 6, fill: "#9a958b" }, h.phone);
  el("ellipse", { cx: 1060, cy: 1080, rx: 330, ry: 260, fill: "#9a6645" }, h.phone);                     // palm
  const ph = (h.phoneBody = el("g", { transform: "translate(960 560) rotate(-3)" }, h.phone));
  el("rect", { x: -230, y: -420, width: 460, height: 860, rx: 54, fill: "#1b1b1d" }, ph);
  el("rect", { x: -206, y: -396, width: 412, height: 812, rx: 36, fill: "#f4f4f6" }, ph);
  // thread view
  h.chat = el("g", {}, ph);
  el("rect", { x: -206, y: -396, width: 412, height: 110, fill: "#e9e9ee" }, h.chat);
  el("circle", { cx: 0, cy: -350, r: 26, fill: "#c8423b" }, h.chat);
  txt(h.chat, 0, -341, "B", 26, "#fff");
  txt(h.chat, 0, -300, "Brenda (Work)", 20, "#333", { "font-weight": 600 });
  h.bubbles = ["Hey bud. Going with Greg for the presentation.", "Also, Greg's taking your office.", "Also, your chair."].map((s, i) => {
    const b = el("g", { transform: `translate(-186 ${-230 + i * 120})`, opacity: 0 }, h.chat);
    const words = s.split(" "), lines = [""];
    for (const w of words) (lines[lines.length - 1] + " " + w).length > 26 ? lines.push(w) : (lines[lines.length - 1] += (lines[lines.length - 1] ? " " : "") + w);
    el("rect", { width: 330, height: 30 + lines.length * 30, rx: 22, fill: "#e5e5ea" }, b);
    lines.forEach((l, k) => txt(b, 18, 38 + k * 30, l, 23, "#111", { "text-anchor": "start", "font-weight": 500 }));
    return b;
  });
  h.typing = el("g", { transform: "translate(-186 140)", opacity: 0 }, h.chat);
  el("rect", { width: 90, height: 44, rx: 22, fill: "#e5e5ea" }, h.typing);
  h.dots = [0, 1, 2].map((i) => el("circle", { cx: 26 + i * 19, cy: 22, r: 6, fill: "#8e8e93" }, h.typing));
  // incoming call view
  h.call = el("g", {}, ph);
  el("rect", { x: -206, y: -396, width: 412, height: 812, rx: 36, fill: "#2b3440" }, h.call);
  h.callRing = el("circle", { cx: 0, cy: -140, r: 92, fill: "none", stroke: "#fff", "stroke-width": 3, opacity: 0.4 }, h.call);
  el("circle", { cx: 0, cy: -140, r: 80, fill: "#7b8794" }, h.call);
  h.callInitial = txt(h.call, 0, -116, "M", 70, "#fff");
  h.callName = txt(h.call, 0, 10, "Mom", 52, "#fff", { "font-weight": 600 });
  txt(h.call, 0, 54, "mobile", 24, "#c3cad3", { "font-weight": 500 });
  el("circle", { cx: -110, cy: 300, r: 40, fill: "#e5483e" }, h.call);
  el("circle", { cx: 110, cy: 300, r: 40, fill: "#3dbb5a" }, h.call);

  // lanyard close-up
  h.lanyard = el("g", {}, stage);
  el("rect", { width: 1920, height: 1080, fill: "#a9c4e0" }, h.lanyard);
  el("path", { d: "M 0 640 L 1920 560 L 1920 1080 L 0 1080 Z", fill: "#9fbbd8" }, h.lanyard);
  el("path", { d: "M 700 0 L 840 380 M 1220 0 L 1080 380", stroke: "#c8423b", "stroke-width": 34 }, h.lanyard);
  const badge = el("g", { transform: "translate(960 560) rotate(-4)" }, h.lanyard);
  el("rect", { x: -330, y: -220, width: 660, height: 440, rx: 22, fill: "#fbfaf6", ...line, "stroke-width": 3 }, badge);
  el("rect", { x: -330, y: -220, width: 660, height: 110, rx: 22, fill: "#c8423b" }, badge);
  el("rect", { x: -330, y: -140, width: 660, height: 30, fill: "#c8423b" }, badge);
  txt(badge, 0, -150, "VISITOR", 40, "#fff", { "letter-spacing": 10 });
  el("rect", { x: -290, y: -80, width: 180, height: 220, fill: "#d9d0b8" }, badge);
  el("circle", { cx: -200, cy: -10, r: 46, fill: "#9a6645" }, badge);
  el("path", { d: "M -270 140 q 70 -110 140 0 z", fill: "#a9c4e0" }, badge);
  txt(badge, 110, 30, "MARCUS", 104, INK, { "font-weight": 900 });
  txt(badge, 110, 100, "Regional Lead (Interim)", 30, "#666", { "font-weight": 500 });

  // cards
  h.black = el("rect", { width: 1920, height: 1080, fill: "#000" }, stage);
  h.end = el("g", {}, stage);
  el("rect", { width: 1920, height: 1080, fill: "#0b0b0c" }, h.end);
  h.endTitle = txt(h.end, 960, 470, "UN-BLESS YOU", 118, "#f2ede1", { "font-weight": 800, "letter-spacing": 18 });
  const credit = (y, s, size = 30, fill = "#bdb7ab") => txt(h.end, 960, y, s, size, fill, { "font-weight": 500 });
  credit(560, "Written and directed by Claude");
  credit(610, "Voices and effects generated with ElevenLabs");
  credit(660, "Marcus: Liam   Leonard: Bill   Denise: Matilda   Mum: Alice   Mom: Bella", 23, "#8d877d");
  credit(760, "An animatic. No actors were filmed, and no one was blessed.", 25, "#8d877d");
  return h;
}
