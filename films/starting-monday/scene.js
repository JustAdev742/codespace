// STARTING MONDAY - staging. Every cue is keyed to a beat id from script.mjs,
// so the picture follows the recorded performances wherever they land.
import { el, Camera, track, prog, hump, wobble, clamp, lerp, ease } from "../engine/engine.js";
import { Toon, EXPR, ex } from "../engine/rig.js";
import { makeDale, makeZeth, makeBrad, makeSharon, makeQuib, makeSlug } from "./chars.js";
import { buildDefs, buildRoom, buildProps, buildHolo, buildInserts, FLOOR, STARS } from "./world.js";

export default function (stage, film) {
  const T = (id, o = 0) => film.T(id, o), E = (id, o = 0) => film.E(id, o);
  const Fr = (id, f) => film.T(id) + film.D(id) * f;

  // ---------------------------------------------------------------- build
  buildDefs(stage);
  const world = el("g", {}, stage);
  const cam = new Camera(world, 1920, 1080);
  const room = buildRoom(world);
  const back = el("g", {}, world);
  const props = buildProps(world);
  back.appendChild(props.rays);
  back.appendChild(props.beam);
  const sharon = makeSharon(back), zeth = makeZeth(back), brad = makeBrad(back);
  back.appendChild(props.suit);
  const slug = makeSlug(back);
  const holo = buildHolo(world);
  const quib = makeQuib(world);
  world.appendChild(props.tear);
  const dale = makeDale(world);
  world.appendChild(props.phone);
  world.appendChild(props.sparkles);
  world.appendChild(props.confetti);
  zeth.frontItem.appendChild(props.nachos);
  dale.frontItem.appendChild(props.remote);
  brad.frontItem.appendChild(props.bradPhone);
  props.nachos.setAttribute("transform", "translate(10 -6) rotate(90)");
  props.remote.setAttribute("transform", "translate(0 6)");

  const night = el("rect", { width: 1920, height: 1080, fill: "#0a0830", style: "mix-blend-mode:multiply" }, stage);
  const glow = el("rect", { width: 1920, height: 1080, fill: "url(#glowG)", style: "mix-blend-mode:screen" }, stage);
  const red = el("rect", { width: 1920, height: 1080, fill: "#ff2a2a", opacity: 0 }, stage);
  const vig = el("rect", { width: 1920, height: 1080, fill: "url(#vigG)" }, stage);
  const ins = buildInserts(stage);

  // ---------------------------------------------------------------- shots
  const SH = {
    wide: { x: 960, y: 540, z: 1 },
    bike: { x: 330, y: 640, z: 1.9 },
    daleM: { x: 680, y: 680, z: 1.75 },
    daleC: { x: 630, y: 606, z: 2.6 },
    aliens: { x: 1310, y: 470, z: 1.45 },
    aliensLow: { x: 1330, y: 400, z: 1.7 },
    zethM: { x: 1380, y: 400, z: 1.7 },
    zethC: { x: 1400, y: 250, z: 2.7 },
    nachoC: { x: 1300, y: 330, z: 2.0 },
    quibC: { x: 1190, y: 470, z: 2.7 },
    holoS: { x: 1090, y: 400, z: 1.95 },
    thighs: { x: 690, y: 812, z: 3.6 },
    door: { x: 1700, y: 600, z: 1.55 },
    bradC: { x: 1600, y: 550, z: 2.4 },
    ear: { x: 700, y: 585, z: 2.2 },
    pitch: { x: 760, y: 650, z: 1.8 },
    bradK: { x: 900, y: 640, z: 2.4 },
    standC: { x: 720, y: 545, z: 2.3 },
    standC2: { x: 720, y: 540, z: 2.8 },
    standM: { x: 760, y: 620, z: 1.6 },
    floor: { x: 950, y: 800, z: 1.75 },
    floorC: { x: 850, y: 830, z: 2.6 },
    window: { x: 670, y: 330, z: 2.9 },
    bradF: { x: 1230, y: 640, z: 1.9 },
    slugC: { x: 1230, y: 800, z: 3.0 },
    sharonM: { x: 1690, y: 560, z: 2.0 },
    sharonC: { x: 1700, y: 530, z: 2.9 },
    zethX: { x: 1396, y: 236, z: 3.9 },
  };

  // ---------------------------------------------------------------- poses
  const dS = Toon.stand(dale.c), zS = Toon.stand(zeth.c), bS = Toon.stand(brad.c), sS = Toon.stand(sharon.c);
  const G = 955; // the floor Dale gets down on, a step closer to camera
  const P = {
    sit: { ...dS, x: 640, y: 790, tilt: -10, lf: [80, 88], rf: [106, 90], lh: [34, 104], rh: [72, 92] },
    sitUp: { ...dS, x: 640, y: 788, tilt: -2, lf: [80, 90], rf: [106, 92], lh: [30, 100], rh: [66, 96] },
    clutch: { ...dS, x: 640, y: 790, tilt: -14, lf: [80, 88], rf: [106, 90], lh: [62, 58], rh: [-30, 60] },
    point: { ...dS, x: 640, y: 790, tilt: 2, lf: [80, 88], rf: [106, 90], lh: [36, 100], rh: [128, 62] },
    shrug: { ...dS, x: 640, y: 790, tilt: -8, lf: [80, 88], rf: [106, 90], lh: [-40, 60], rh: [112, 40] },
    crossed: { ...dS, x: 640, y: 790, tilt: -12, lf: [80, 88], rf: [106, 90], lh: [74, 66], rh: [-22, 72] },
    lean: { ...dS, x: 640, y: 790, tilt: 10, lf: [80, 88], rf: [106, 90], lh: [56, 90], rh: [84, 84] },
    down: { ...dS, x: 640, y: 790, tilt: 2, ht: 26, lf: [80, 88], rf: [106, 90], lh: [40, 102], rh: [76, 94] },
    lounge: { ...dS, x: 632, y: 792, tilt: -24, lf: [116, 84], rf: [142, 86], lh: [-44, -58], rh: [10, -72] },
    stand: { ...dS, x: 720, y: 730 },
    fist: { ...dS, x: 720, y: 730, rh: [44, -52], tilt: -3 },
    walkR: { ...dS, x: 990, y: 800, s: 1.06 },
    turn: { ...dS, x: 990, y: 800, s: 1.06, flip: -1 },
    knee1: { ...dS, x: 980, y: G - 96, s: 1.06, flip: -1, tilt: 12, lf: [-84, 92], rf: [56, 96], lh: [10, 130], rh: [64, 104] },
    knee2: { ...dS, x: 975, y: G - 78, s: 1.06, flip: -1, tilt: 46, lf: [-112, 74], rf: [-76, 78], lh: [10, 120], rh: [14, 124], ht: -18 },
    plank: { ...dS, x: 975, y: G - 104, s: 1.06, flip: -1, tilt: 76, lf: [-140, 98], rf: [-130, 100], lh: [4, 132], rh: [0, 134], ht: -34 },
    half: { ...dS, x: 975, y: G - 74, s: 1.06, flip: -1, tilt: 80, lf: [-144, 68], rf: [-134, 70], lh: [-24, 86], rh: [-28, 88], ht: -30 },
    low: { ...dS, x: 975, y: G - 44, s: 1.06, flip: -1, tilt: 86, lf: [-146, 40], rf: [-136, 42], lh: [-40, 50], rh: [-44, 52], ht: -12 },
    reach: { ...dS, x: 975, y: G - 42, s: 1.06, flip: -1, tilt: 88, lf: [-146, 38], rf: [-130, 40], lh: [-40, 48], rh: [150, -8], ht: -14 },
    cozy: { ...dS, x: 990, y: G - 46, s: 1.06, flip: -1, tilt: 90, lf: [-110, 26], rf: [-128, 44], lh: [-70, 10], rh: [70, -70], ht: -62, hy: 6 },
    zStand: { ...zS, x: 1400, y: FLOOR - 330, flip: -1, lh: [-12, 232], rh: [14, 232] },
    zPoint: { ...zS, x: 1400, y: FLOOR - 330, flip: -1, tilt: 4, lh: [-12, 232], rh: [222, 14] },
    zOpen: { ...zS, x: 1400, y: FLOOR - 330, flip: -1, lh: [-90, 150], rh: [150, 130] },
    zChest: { ...zS, x: 1400, y: FLOOR - 330, flip: -1, lh: [-12, 232], rh: [-30, 70], ht: 8 },
    zSweep: { ...zS, x: 1400, y: FLOOR - 330, flip: -1, lh: [-60, 190], rh: [200, 40] },
    zRobe: { ...zS, x: 1400, y: FLOOR - 330, flip: -1, lh: [-12, 232], rh: [-46, 150], tilt: -2 },
    zOffer: { ...zS, x: 1400, y: FLOOR - 330, flip: -1, tilt: 6, lh: [150, 96], rh: [170, 90], ht: 6 },
    zPray: { ...zS, x: 1400, y: FLOOR - 330, flip: -1, lh: [44, 64], rh: [-36, 64], ht: 10 },
    bDoor: { ...bS, x: 1790, y: FLOOR - 125, flip: -1, lh: [-70, -80], rh: [70, -84] },
    bIn: { ...bS, x: 1610, y: FLOOR - 125, flip: -1, lh: [-70, -80], rh: [70, -84] },
    bHips: { ...bS, x: 1610, y: FLOOR - 125, flip: -1, lh: [-56, 96], rh: [56, 96] },
    bPointer: { ...bS, x: 1610, y: FLOOR - 125, flip: -1, lh: [-56, 96], rh: [170, -30] },
    bKneel: { ...bS, x: 905, y: FLOOR - 64, flip: -1, tilt: 6, lf: [-70, 62], rf: [50, 64], lh: [150, -60], rh: [170, -48] },
    bHeart: { ...bS, x: 905, y: FLOOR - 64, flip: -1, tilt: 2, lf: [-70, 62], rf: [50, 64], lh: [40, 80], rh: [-30, 60] },
    bBack: { ...bS, x: 1090, y: FLOOR - 125, flip: -1, lh: [-56, 96], rh: [56, 96] },
    bPump: { ...bS, x: 1090, y: FLOOR - 150, flip: -1, lh: [-80, -110], rh: [84, -116] },
    bFilm: { ...bS, x: 1235, y: FLOOR - 92, flip: -1, tilt: 14, lf: [-40, 92], rf: [44, 92], lh: [80, 60], rh: [120, -6] },
    bPanic: { ...bS, x: 1235, y: FLOOR - 125, flip: -1, lh: [-30, -150], rh: [40, -150], ht: -8 },
    sDoor: { ...sS, x: 1800, y: FLOOR - 165, flip: -1 },
    sIn: { ...sS, x: 1700, y: FLOOR - 165, flip: -1 },
    sGone: { ...sS, x: -160, y: FLOOR - 165, flip: -1 },
  };
  const Q0 = { x: 1190, y: 470, s: 1, flip: -1, floor: FLOOR, hands: 0, typing: 0, rot: 0, sq: 1, a: 1 };
  const QP = {
    home: Q0, read: { ...Q0, hands: 1 }, type: { ...Q0, hands: 1, typing: 1 },
    ear: { ...Q0, x: 778, y: 540 }, toZeth: { ...Q0, flip: 1 }, cower: { ...Q0, y: 520, sq: 0.86, hands: 1 },
    joy: { ...Q0, y: 400, hands: 1 }, peek: { ...Q0, x: 1200, y: 500, hands: 1 },
  };

  // ---------------------------------------------------------------- cue sheet
  const K = { cam: [], D: [], De: [], Z: [], Ze: [], Q: [], Qe: [], B: [], Be: [], S: [], Se: [], holo: [], ins: [], phone: [], door: [], nachos: [], bphone: [], remote: [] };
  const w = (v, dur, e) => ({ __v: v, dur, e });
  const DUR = { cam: 0, holo: 0, ins: 0, phone: 0, door: 0.25, nachos: 0.3, bphone: 0.2, remote: 0 };
  const at = (time, o) => {
    for (const [k, raw] of Object.entries(o)) {
      const wrapped = raw && raw.__v !== undefined;
      let v = wrapped ? raw.__v : raw;
      if (k === "cam" && typeof v === "string") v = SH[v];
      if (k.length === 2 && k[1] === "e" && typeof v === "string") v = EXPR[v];
      K[k].push([time, v, wrapped && raw.dur !== undefined ? raw.dur : DUR[k] ?? (k.length === 2 ? 0.22 : 0.4), (wrapped && raw.e) || "io"]);
    }
  };
  const R = { px: 0.55 }, L = { px: -0.3 }; // eye lines: toward what the character faces, or back over the shoulder

  // cold open
  at(0, {
    cam: "bike", D: P.sit, De: ex("annoyed", { px: 0.5, py: 0.6 }), Z: { ...P.zStand, a: 0 }, Ze: ex("angry", R), Q: { ...Q0, a: 0 }, Qe: ex("neutral", R),
    B: { ...P.bDoor, a: 0 }, Be: "happy", S: { ...P.sDoor, a: 0 }, Se: "flat", holo: null, ins: null, phone: "table", door: 0, nachos: 0, bphone: 0, remote: 0,
  });
  at(0.8, { cam: w("daleM", T("k1a") - 1.2, "io") });
  at(Fr("k1b", 0.1), { ins: "phone" });
  at(E("k2", 0.2), { ins: null, cam: "daleC", De: ex("flat", { px: 0.5, py: 0.6 }) });
  at(T("d3"), { De: ex("annoyed", { px: 0.5, py: 0.6 }) });
  at(T("k4"), { ins: "phone" });
  at(T("inhale"), { ins: null, cam: "daleM", D: w(P.sitUp, 0.5), De: ex("neutral", { px: 0.5, py: 0.5 }) });
  at(T("inhale", 0.6), { D: w({ ...P.sitUp, ht: -16 }, 0.22) });
  at(T("inhale", 1.05), { D: w({ ...P.sitUp, ht: 16 }, 0.22) });
  at(T("inhale", 1.5), { D: w({ ...P.sitUp, ht: 0, y: 778, tilt: -6 }, 0.8, "out"), De: w(ex("shock", { eo: 1, mo: 0.25, px: 0.4, py: 0.5 }), 0.6) });
  at(T("d5"), { cam: "daleC" });
  at(T("peel"), { cam: "wide", De: w(ex("shock", { px: 0.9 }), 0.12), D: w({ ...P.sit, tilt: -20 }, 0.2) });
  at(T("peel.figures"), { Z: w({ ...P.zStand, a: 1 }, 0.5), Q: w({ ...Q0, a: 1 }, 0.5) });
  at(T("z6"), { cam: "aliensLow", Z: w(P.zPoint, 0.25, "back") });
  at(E("z6", 0.2), { cam: "daleM", D: w(P.clutch, 0.22, "out"), De: ex("angry", R), phone: "dale" });
  at(T("d7"), { cam: "daleC" });
  at(E("d7", 0.25), { cam: "aliens", Z: w(P.zStand, 0.5), Ze: w(ex("flat", { px: 0.6, py: 0.8 }), 0.3), Qe: w(ex("shock", { px: -0.7, py: -0.8, mo: 0 }), 0.3) });
  at(T("d8"), { cam: "daleM", D: w(P.point, 0.25), De: ex("angry", R) });
  at(T("title"), { ins: "title" });

  // the Dale standard
  at(E("title"), { ins: null, cam: "aliens", phone: "table", D: P.sit, De: ex("annoyed", R), Z: w(P.zOpen, 0.6), Ze: ex("solemn", R), Qe: ex("neutral", R) });
  at(Fr("z9", 0.52), { cam: w("wide", 1.4) });
  at(T("d10"), { cam: "daleM", D: w(P.shrug, 0.3), De: ex("neutral", { px: 0.55, bl: -10, br: -10 }) });
  at(T("z11"), { cam: "zethC", Z: w(P.zChest, 0.5), Ze: w(ex("bliss", { sm: 0.15 }), 0.3) });
  at(T("q12"), { cam: "holoS", holo: "stats", Q: w(QP.read, 0.3), Qe: ex("happy", R), Z: w(P.zStand, 0.5), Ze: ex("solemn", R), D: P.sit });
  at(T("d13"), { cam: "daleC", D: w(P.crossed, 0.3), De: ex("annoyed", { px: 0.2, py: -0.4 }) });
  at(T("z14"), { cam: "zethM", Z: w(P.zSweep, 0.6) });
  at(Fr("z14", 0.34), { cam: "holoS", holo: "gold" });
  at(Fr("z14", 0.47), { holo: "light" });
  at(Fr("z14", 0.86), { cam: "wide", holo: "dale", Z: w(P.zPoint, 0.4), De: ex("shock", { px: 0.6, mo: 0.1 }) });
  at(T("q15"), { cam: "holoS", Qe: ex("happy", R), Q: w(QP.joy, 0.3, "back") });
  at(T("d16"), { cam: "daleM", D: w(P.point, 0.3), De: ex("angry", R), Q: w(QP.read, 0.4), Z: w(P.zStand, 0.5) });
  at(T("q17"), { cam: "holoS", holo: "score", Qe: ex("flat", { px: 0.2, py: 0.6 }) });
  at(T("d18"), { cam: "daleC", D: w(P.shrug, 0.25), De: ex("angry", R) });
  at(T("z19"), { cam: "zethC", Ze: ex("solemn", R), holo: null, Q: w(QP.home, 0.4), Qe: ex("neutral", R) });
  at(Fr("z19", 0.78), { cam: "thighs", D: P.sit });
  at(T("thighs", 1.2), { cam: "daleC", D: P.down, De: ex("think", { px: 0.2, py: 1 }) });
  at(T("thighs", 2.0), { D: w(P.lean, 0.45), De: w(ex("sly", R), 0.35) });

  // leverage
  at(T("z21"), { cam: "zethM", Z: w(P.zSweep, 0.5), holo: "offer", Ze: ex("solemn", R) });
  at(T("think"), { cam: "daleC", D: w(P.sit, 0.5), De: w(ex("think", { px: 0.2, py: -0.9 }), 0.3) });
  at(T("think", 0.1), { cam: w({ x: 630, y: 600, z: 3.1 }, film.D("think") + 0.4, "lin") });
  at(T("d22"), { cam: "daleM", D: w(P.point, 0.3), De: ex("happy", R), holo: null });
  at(E("d22", 0.25), { cam: "zethC", Ze: ex("shock", { px: 0.5, eo: 1.1, mo: 0 }), Z: w(P.zStand, 0.4) });
  at(T("d24"), { cam: "daleC", D: w(P.lean, 0.3), De: ex("sly", R) });
  at(T("typing"), { cam: "holoS", Q: w(QP.type, 0.2), Qe: ex("flat", { px: 0.2, py: 0.7 }) });
  at(T("q25", 0.3), { holo: "greg", Q: w(QP.read, 0.2), Qe: ex("neutral", R) });
  at(T("d26"), { cam: "daleC", De: ex("happy", { px: 0.55, eo: 1.15 }) });
  at(T("q27"), { cam: "holoS", holo: "greg2", Qe: ex("flat", R) });
  at(T("d28"), { cam: "daleM", D: w(P.lounge, 0.6, "back"), De: w(ex("smug", R), 0.3) });
  at(T("doorbell.ding"), { cam: w("wide", 0.01), holo: null, De: w(ex("shock", { px: 0.95, mo: 0 }), 0.2), D: w(P.sit, 0.3), Z: w({ ...P.zStand, flip: 1 }, 0.25), Ze: ex("annoyed", R), Q: w(QP.toZeth, 0.2), Qe: ex("shock", { px: 0.6, mo: 0 }) });
  at(T("doorbell.burst"), { cam: "door", door: w(1, 0.12, "out"), B: P.bDoor, Be: "happy" });

  // the short
  at(T("b29", 0.9), { B: w(P.bIn, 1.6), cam: w({ x: 1640, y: 590, z: 1.7 }, 1.6) });
  at(Fr("b29", 0.75), { B: w(P.bPointer, 0.3, "back") });
  at(T("z30"), { cam: "zethC", Ze: ex("annoyed", { px: 0.6, eo: 0.42 }), B: w(P.bHips, 0.4) });
  at(T("b31a"), { cam: "bradC", Be: ex("flat", { px: 0.5, eo: 0.5, sm: -0.4 }) });
  at(T("b31b"), { Be: w(ex("happy", { px: 0.5 }), 0.12) });
  at(E("b31b", 0.1), { Q: w(QP.ear, 0.45, "out"), Qe: ex("fear", { px: 0.5 }) });
  at(T("q32"), { cam: "ear", De: ex("neutral", { px: 0.9 }), Z: w(P.zStand, 0.4) });
  at(T("d33"), { cam: "daleC", De: w(ex("moved", { px: 0.4, py: -0.3 }), 0.3), D: w(P.sitUp, 0.4) });
  at(T("q34"), { cam: "ear", Qe: ex("flat", { px: 0.5 }) });
  at(E("q34", 0.15), { B: w(P.bKneel, 0.6, "out"), Q: w(QP.home, 0.6) });
  at(T("b35"), { cam: "pitch", Be: ex("plead", { px: 0.5, sm: 0.3 }), De: ex("neutral", { px: 0.6 }), Qe: ex("fear", R) });
  at(T("z36"), { cam: "zethM", Ze: ex("solemn", R) });
  at(T("wanted"), { cam: "daleC", De: w(ex("happy", { px: 0.9, sm: 0.4 }), 0.3) });
  at(T("wanted", 0.8), { De: w(ex("happy", { px: -0.2, sm: 0.6 }), 0.25) });
  at(T("d37"), { cam: "pitch", De: ex("sly", { px: 0.6 }) });
  at(T("b38"), { cam: "bradK", B: w(P.bHeart, 0.3), Be: ex("happy", { px: 0.4 }) });
  at(Fr("b38", 0.45), { Be: w(ex("moved", { px: 0.4, sm: 0.4 }), 0.3) });
  at(T("d39"), { cam: "daleC", De: ex("sly", { px: 0.95 }) });
  at(T("nachos"), { cam: "zethM", Z: w(P.zRobe, 1.5, "io"), Ze: ex("solemn", { px: 0.3, py: 0.5 }) });
  at(T("nachos", 0.2), { cam: w({ x: 1370, y: 380, z: 1.95 }, film.D("nachos"), "lin") });
  at(T("nachos.reveal"), { Z: w(P.zOffer, 0.7, "out3"), nachos: 1, Ze: w(ex("solemn", R), 0.3) });
  at(T("z40"), { cam: "nachoC" });
  at(T("d41"), { cam: "daleC", De: ex("think", { px: 0.9, py: 0 }) });
  at(T("z42"), { cam: "aliens", Ze: ex("fear", { px: 0.8, py: 0.7, mo: 0 }), Q: w(QP.toZeth, 0.15), Qe: ex("shock", { px: 0.6, py: -0.7, mo: 0 }) });
  at(T("q43"), { Qe: ex("fear", { px: 0.6, py: -0.6 }), Q: w({ ...QP.toZeth, hands: 1 }, 0.2) });
  at(T("waver"), { cam: "daleM", B: w(P.bBack, 0.9), Be: ex("happy", R), D: w(P.sit, 0.4), De: ex("think", { px: 0.9, py: 0 }), Q: w(QP.home, 0.4), Qe: ex("neutral", R), Ze: ex("solemn", R) });
  at(T("waver", 0.7), { De: w(ex("sad", { px: 0.2, py: 0.9 }), 0.4) });
  at(T("waver", 1.1), { D: w(P.stand, 0.9, "io"), cam: w("standM", 0.9) });
  at(T("d44"), { cam: "standC", De: ex("sad", { px: 0.5, py: 0.2 }) });
  at(T("d44", 0.1), { cam: w("standC2", film.D("d44"), "lin") });
  at(T("hush"), { cam: "wide", De: ex("sad", { px: 0.3, py: 0.7 }) });
  at(T("z45"), { cam: "zethC", Z: w(P.zChest, 0.5), Ze: ex("moved", R), nachos: 0 });
  at(T("q46"), { cam: "quibC", Qe: ex("plead", { px: 0.4, sm: -0.6 }), Q: w(QP.read, 0.3) });
  at(T("d47"), { cam: "standM", D: w(P.fist, 0.35, "back"), De: ex("angry", { px: 0.5, sm: 0.1 }) });
  at(T("b48"), { cam: { x: 1090, y: 560, z: 2.0 }, B: w(P.bPump, 0.22, "back"), Be: ex("happy", { eo: 1.2 }) });
  at(T("alarm.on"), { cam: "wide", holo: "crash", Ze: ex("fear", R), Z: w(P.zStand, 0.3), Qe: ex("fear", R), Q: w(QP.cower, 0.25), B: w(P.bBack, 0.4) });

  // the push-up
  at(T("down1"), { cam: "floor", D: w(P.walkR, 1.3), De: ex("angry", { px: 0.5, sm: 0.1 }), B: w(P.bFilm, 1.4), bphone: 1 });
  at(T("down1", 1.35), { D: w(P.turn, 0.22) });
  at(T("down1", 1.75), { D: w(P.knee1, 1.5, "io"), De: w(ex("strain", { px: 0.3, py: 0.6 }), 0.5) });
  at(T("q49"), { cam: "holoS", Q: w(QP.cower, 0.2) });
  at(T("down2"), { cam: "floor", D: w({ ...P.knee1, rh: [88, 40] }, 0.9) });
  at(T("down2", 1.3), { D: w(P.knee2, 1.5, "io") });
  at(T("d50"), { cam: "floorC", De: ex("strain", { px: 0.2, py: 0.5 }) });
  at(E("d50", 0.2), { cam: "floor", D: w(P.plank, 1.3, "io") });
  at(T("position", 1.7), { cam: "window" });
  at(T("b51"), { cam: "bradF", Be: ex("happy", { eo: 1.25, px: 0.4, py: 0.5 }) });
  at(T("z52"), { cam: "zethC", Z: w(P.zPray, 0.4), Ze: ex("bliss", { sm: -0.3, bl: -20, br: -20 }) });
  at(T("lower"), { cam: "floor", D: w(P.half, 1.8, "io"), De: ex("strain", { px: 0.2, py: 0.6 }) });
  at(T("lower", 1.8), { cam: "window" });
  at(T("lower", 3.3), { cam: "aliens", Qe: ex("fear", { px: 0.6, py: 0.6 }), Q: w(QP.peek, 0.3) });
  at(T("lower", 4.4), { cam: "floorC", D: w(P.low, 1.3, "io") });
  at(T("k52"), { ins: "phone" });
  at(T("eyes"), { ins: "under", De: ex("flat", { px: 0.6, py: 0.3 }) });
  at(Fr("d53", 0.62), { ins: null, cam: "floor", D: w(P.reach, 0.8, "out"), De: ex("happy", { px: 0.8, sm: 0.5 }) });
  at(T("roll", 0.6), { D: w(P.cozy, 1.3, "io"), remote: 1, De: w(ex("bliss"), 0.5) });
  at(T("d54a"), { cam: "floorC", De: ex("happy", { eo: 0.6, sm: 0.7 }) });
  at(T("d54b"), { cam: { x: 880, y: 850, z: 3.1 }, De: ex("bliss") });
  at(T("blaze.on"), { cam: "window" });
  at(T("blaze", 1.0), { cam: "wide", holo: "moon", Ze: ex("shock", R), Qe: ex("happy", R), Z: w(P.zOpen, 0.3), B: w(P.bPanic, 0.3), Be: ex("fear", R), bphone: 0 });
  at(T("q55"), { cam: "holoS", Q: w(QP.joy, 0.25, "back"), Qe: ex("happy", { eo: 1.2 }) });
  at(T("z56"), { cam: "zethC", Z: w(P.zChest, 0.5), Ze: ex("moved", R) });
  at(T("b57"), { cam: "bradF", Be: ex("fear", R) });
  at(T("repo"), { cam: w({ x: 1180, y: 520, z: 1.25 }, 0.01), holo: null, Q: w({ ...QP.home, x: 1090 }, 0.5), Qe: ex("shock", { px: -0.5, mo: 0 }), Ze: ex("flat", R), Z: w(P.zStand, 0.5) });
  at(T("repo.plop", 0.5), { cam: "slugC" });

  // tag
  at(T("sharon"), { cam: "door", door: 0 });
  at(T("sharon.open"), { door: w(1, 0.5, "io"), S: w({ ...P.sDoor, a: 1 }, 0.3) });
  at(T("sharon.open", 0.5), { S: w({ ...P.sIn, a: 1 }, 1.0), cam: w("sharonM", 1.0) });
  at(T("sharon.sees"), { cam: "wide", Ze: ex("shock", { px: -0.7, mo: 0 }), Qe: ex("shock", { px: -0.7, mo: 0 }), De: ex("shock", { px: -0.8, mo: 0, eo: 1 }), Z: w({ ...P.zStand, flip: 1 }, 0.2), Q: w({ ...QP.home, x: 1090, flip: 1 }, 0.2) });
  at(T("sharon.face"), { cam: "sharonC", Se: "flat" });
  at(T("s58"), { cam: "sharonM" });
  at(T("d59"), { cam: "floorC", De: ex("plead", { px: -0.7, sm: -0.2 }) });
  at(T("s60"), { cam: "sharonM", Se: ex("annoyed", { eo: 0.4 }) });
  at(Fr("s60", 0.35), { cam: w("wide", 0.9), S: w(P.sGone, 6.2, "lin") });
  at(T("ding.ding"), { cam: "holoS", holo: "sharon", Q: w({ ...QP.read, x: 1150 }, 0.3), Qe: ex("shock", { px: 0.2, py: 0.7, mo: 0 }), Z: w(P.zStand, 0.4), Ze: ex("flat", R) });
  at(T("ding", 1.5), { Qe: w(ex("shock", { px: -0.8, py: -0.6, mo: 0 }), 0.2) });
  at(T("q61"), { Qe: ex("plead", { px: -0.6, py: -0.5, sm: 0 }) });
  at(T("turn"), { cam: "zethM", Ze: ex("flat", { px: 0.2 }) });
  at(T("turn", 0.1), { cam: w("zethX", film.D("turn") + film.D("z62"), "io"), Z: w({ ...P.zStand, ht: -8 }, 2.4), Ze: w(ex("sly", { px: 1, eo: 0.42, sm: 0.25 }), 2.2) });
  at(T("black"), { ins: "black", holo: null });
  at(T("endcard"), { ins: "end" });
  at(T("stinger"), { ins: null, cam: "bike", remote: 0 });
  at(T("stinger", 0.1), { cam: w({ x: 310, y: 660, z: 2.3 }, 5, "lin") });
  at(T("out"), { ins: "black" });

  const TR = Object.fromEntries(Object.entries(K).map(([k, v]) => [k, track(v)]));
  const tPeel = T("peel"), tAlarm = T("alarm.on"), tBlaze = T("blaze.on"), tRepo = T("repo"), tBlack = T("black");
  const starOut = room.stars.map((_, i) => lerp(T("position", 1.2), E("lower", -1.4), i / (room.stars.length - 1)));
  const show = (node, on) => node.setAttribute("display", on ? "inline" : "none");

  // ---------------------------------------------------------------- render
  return (t) => {
    const insert = TR.ins(t);
    for (const name of ["phone", "under", "title", "end", "black"]) show(ins[name], insert === name);
    show(world, insert === null || insert === undefined);

    // camera, with shake on the big moments
    const c = TR.cam(t);
    const shake =
      18 * Math.max(0, 1 - (t - tPeel) / 1.3) * (t >= tPeel) +
      10 * Math.max(0, 1 - (t - T("doorbell.burst")) / 0.5) * (t >= T("doorbell.burst")) +
      4 * (t >= tAlarm && t < T("down1")) +
      5 * (t >= T("repo.beam") && t < T("repo.yank", 0.6));
    cam.set({ x: c.x + wobble(t, 1, 23) * shake, y: c.y + wobble(t, 2, 27) * shake, z: c.z });

    // the hole in the wall
    const open = t < tPeel ? 0 : ease.elastic(clamp((t - tPeel) / 1.1));
    room.portal.setAttribute("transform", `translate(1360 500) scale(${(0.3 + 0.7 * open).toFixed(3)} ${Math.max(0.001, open).toFixed(3)}) translate(-1360 -500)`);
    show(room.portal, t >= tPeel);
    show(room.holeFloor, t >= tPeel + 0.5);
    room.swirl.setAttribute("transform", `rotate(${(t * 9) % 360} 1360 470)`);
    ins.flash.setAttribute("opacity", (hump(t, tPeel, 0.7, 0.12) * 0.95 + hump(t, tBlaze, 0.6, 0.15) * 0.5).toFixed(3));
    show(ins.flash, insert !== "black" && insert !== "end");
    const wind = (t >= tPeel ? Math.max(0.12, 1 - (t - tPeel) / 3) : 0) * (t < tBlack ? 1 : 0.4);
    room.curtains.forEach((cu, i) => cu.setAttribute("transform", `translate(${670 + (i ? 1 : -1) * 196} 172) skewX(${(-wind * (14 + 8 * Math.sin(t * 9 + i))).toFixed(2)})`));
    room.jackets.setAttribute("transform", `rotate(${(-wind * (6 + 4 * Math.sin(t * 11))).toFixed(2)} 60 590)`);

    // light
    night.setAttribute("opacity", (t < tPeel ? 0.24 : 0.12).toFixed(3));
    glow.setAttribute("opacity", (t < tPeel ? 0 : (0.75 + 0.1 * Math.sin(t * 2.3)) * clamp((t - tPeel) / 0.4)).toFixed(3));
    const alarm = t >= tAlarm && t < T("eyes") ? (0.1 + 0.14 * (0.5 + 0.5 * Math.sin((t - tAlarm) * 7))) * (1 - prog(t, T("lower"), T("lower", 2))) : 0;
    red.setAttribute("opacity", alarm.toFixed(3));
    vig.setAttribute("opacity", (0.5 + 0.5 * prog(t, T("d44"), E("d44")) * (t < T("alarm.on"))).toFixed(3));
    show(night, !insert); show(glow, !insert); show(red, !insert); show(vig, insert !== "black" && insert !== "end");

    // stars: go out one by one as he lowers, flicker under the alarm, blaze back
    room.stars.forEach((s, i) => {
      let o = 1;
      if (t >= tAlarm && t < tBlaze) o = Math.min(0.75 + 0.25 * wobble(t, i + 5, 9), 1 - prog(t, starOut[i], starOut[i] + 0.35));
      const pulse = 1 + 1.6 * hump(t, tBlaze + i * 0.02, 0.9, 0.15);
      s.setAttribute("opacity", clamp(o).toFixed(3));
      const [sx, sy] = STARS[i];
      s.setAttribute("transform", pulse > 1.001 ? `translate(${sx} ${sy}) scale(${pulse.toFixed(3)}) translate(${-sx} ${-sy})` : "");
    });
    room.moon.setAttribute("opacity", (t >= tAlarm && t < tBlaze ? 1 - 0.8 * prog(t, T("position"), E("lower")) : 1).toFixed(3));

    // cast ----------------------------------------------------------
    const talk = (who) => film.mouth(who, t);
    const gest = (who, p, amp = 1) => {
      const g = film.energy(who, t) * amp;
      return g < 0.01 ? p : { ...p, rh: [p.rh[0] + Math.sin(t * 6.3) * 10 * g, p.rh[1] - Math.abs(Math.sin(t * 4.1)) * 16 * g] };
    };
    // Dale
    let d = { ...TR.D(t), e: TR.De(t) };
    const shiver = t >= E("d50") && t < T("eyes") ? 1 : 0;
    if (shiver) d = { ...d, x: d.x + wobble(t, 3, 31) * 2.5, lh: [d.lh[0] + wobble(t, 4, 37) * 4, d.lh[1]], rh: [d.rh[0] + wobble(t, 5, 41) * 4, d.rh[1]] };
    if (t >= T("down1") && t < T("down1", 1.3)) {
      const wk = Toon.walk(dale.c, (t - T("down1")) * 1.9, 0.3, 0.1);
      d = { ...d, lf: wk.lf, rf: wk.rf, y: d.y + wk.bob };
    }
    dale.set(gest("DALE", d, d.tilt > 40 ? 0 : 1), talk("DALE"), t);
    props.remote.setAttribute("opacity", TR.remote(t));

    // Zeth
    const z = { ...TR.Z(t), e: TR.Ze(t), sway: Math.sin(t * 1.3) * 0.5 + wind * 2 };
    zeth.set(gest("ZETH", z, 0.6), talk("ZETH"), t);
    const nach = TR.nachos(t);
    props.nachos.setAttribute("opacity", nach.toFixed(2));
    const zx = z.x + z.flip * zeth.handF[0], zy = z.y + zeth.handF[1];
    props.rays.setAttribute("transform", `translate(${zx.toFixed(1)} ${(zy - 30).toFixed(1)}) rotate(${(t * 20) % 360})`);
    props.rays.setAttribute("opacity", (nach * clamp(1 - (t - T("z40")) / 2.5, 0.25, 1) * (t < T("z45") ? 1 : 0)).toFixed(3));

    // Quib
    const q = { ...TR.Q(t), e: TR.Qe(t) };
    q.y += Math.sin(t * 2.4) * 9;
    if (t >= T("q55") && t < E("q55")) q.rot = Math.sin((t - T("q55")) * 9) * 14;
    if (t >= tAlarm && t < T("eyes")) q.x += wobble(t, 9, 19) * 5;
    quib.set(q, talk("QUIB"), t);
    const crying = t >= T("q46") && t < E("q46", 0.6);
    show(props.tear, crying);
    if (crying) {
      const u = ((t - T("q46")) * 1.1) % 1;
      props.tear.setAttribute("transform", `translate(${q.x - 40} ${q.y - 6 + u * 70}) scale(${1.2 - u * 0.4})`);
      props.tear.setAttribute("opacity", (1 - u * u).toFixed(2));
    }

    // Brad, then what he really is
    const tr = t - tRepo;
    let b = { ...TR.B(t), e: TR.Be(t) };
    if (t >= T("b29") && t < T("b29", 2.5)) {
      const wk = Toon.walk(brad.c, (t - T("b29")) * 1.6, 0.3, 0.12);
      if (t >= T("b29", 0.9)) b = { ...b, lf: wk.lf, rf: wk.rf, y: b.y + wk.bob };
    }
    if (t >= T("b51") && t < E("b51")) b = { ...b, y: b.y - Math.abs(Math.sin((t - T("b51")) * 9)) * 16 };
    const suited = t < T("repo.zip") && t >= T("doorbell.burst");
    b.a = suited ? 1 : 0;
    brad.set(gest("BRAD", b, 1.3), talk("BRAD"), t);
    props.bradPhone.setAttribute("opacity", TR.bphone(t));
    const beamOn = tr >= 0 ? prog(t, T("repo.beam"), T("repo.beam", 0.35)) * (1 - prog(t, T("repo.yank", 0.5), T("repo.yank", 1.1))) : 0;
    props.beam.setAttribute("d", `M ${1235 - 60} -500 L ${1235 + 60} -500 L ${1235 + 170} ${FLOOR + 10} L ${1235 - 170} ${FLOOR + 10} Z`);
    props.beam.setAttribute("opacity", (beamOn * (0.8 + 0.2 * Math.sin(t * 40))).toFixed(3));
    const suitOn = t >= T("repo.zip") && t < T("repo.yank", 1.2);
    show(props.suit, suitOn);
    if (suitOn) {
      const deflate = prog(t, T("repo.zip"), T("repo.yank"), "io");
      const up = ease.in3(clamp((t - T("repo.yank")) / 0.8));
      props.suit.setAttribute("transform", `translate(1235 ${(FLOOR + 10 - up * 1500).toFixed(1)}) rotate(${(Math.sin(t * 30) * 5 * (deflate + up)).toFixed(1)}) scale(${(1.1 - 0.45 * deflate).toFixed(3)} ${(1.1 + 0.25 * up).toFixed(3)})`);
    }
    const tp = t - T("repo.plop");
    const onBike = t >= T("stinger");
    const sl = { x: 1235, y: FLOOR - 30, s: 1, flip: -1, floor: FLOOR, hands: 0, a: tp >= 0 && t < tBlack ? 1 : 0, e: ex("shock", { mo: 0, px: Math.sin(t * 2.2) * 0.8 }), item: 0 };
    if (tp >= 0 && tp < 0.6) { sl.y = FLOOR - 30 - 140 * (1 - ease.bounce(tp / 0.6)); sl.sq = 1 - 0.25 * hump(t, T("repo.plop", 0.18), 0.3); }
    if (t >= T("repo.squeak") && t < T("repo.squeak", 0.5)) sl.e = ex("fear", { mo: 0.8 });
    if (t >= T("repo.toot", -0.3)) { sl.hands = 1; sl.item = 1; sl.e = ex("sad", { mo: t < T("repo.toot", 1.4) ? 0.5 : 0, eo: 0.7 }); sl.sq = 1 - 0.12 * prog(t, T("repo.toot", 1.2), T("repo.toot", 1.9)); }
    if (t >= T("sharon.sees") && t < tBlack) sl.e = ex("fear", { mo: 0, px: -0.8 });
    if (onBike) {
      const ph = (t - T("stinger")) * 2.2;
      Object.assign(sl, { x: 262, y: 612 + Math.sin(ph * 2) * 3, a: 1, floor: undefined, hands: 1, item: t >= T("stinger.toot", -0.3) ? 1 : 0, flip: 1,
        e: ex("strain", { mo: t >= T("stinger.toot") && t < T("stinger.toot", 1.3) ? 0.6 : 0.15 }) });
      room.crank.setAttribute("transform", `translate(40 790) rotate(${(ph * 57.3) % 360})`);
      room.jackets.setAttribute("transform", `rotate(${(Math.sin(ph) * 2.5).toFixed(2)} 60 590)`);
    }
    slug.set(sl, 0, t);

    // Sharon
    let s = { ...TR.S(t), e: TR.Se(t) };
    const walking = (t >= T("sharon.open", 0.5) && t < T("sharon.open", 1.5)) || (t >= Fr("s60", 0.35) && s.x > -150);
    if (walking) {
      const wk = Toon.walk(sharon.c, t * 1.7, 0.34, 0.12);
      s = { ...s, lf: wk.lf, rf: wk.rf, y: s.y + wk.bob };
    }
    sharon.set(s, talk("SHARON"), t);
    room.door.setAttribute("transform", `translate(1876 0) scale(${(1 - 0.86 * TR.door(t)).toFixed(3)} 1) translate(-1876 0)`);

    // props ---------------------------------------------------------
    const where = TR.phone(t);
    if (where === "dale") props.phone.setAttribute("transform", `translate(${(d.x + dale.handF[0] * d.flip + 14).toFixed(1)} ${(d.y + dale.handF[1] - 8).toFixed(1)}) rotate(-70)`);
    else props.phone.setAttribute("transform", "translate(950 780)");
    props.notes.forEach((n, i) => {
      const u = (t * 0.45 + i / 3) % 1;
      n.setAttribute("x", Math.sin(u * 6 + i) * 16); n.setAttribute("y", -20 - u * 80);
      n.setAttribute("opacity", (t < tBlack && where !== "dale" ? Math.sin(u * Math.PI) * 0.9 : 0).toFixed(2));
    });
    const sp = t >= Fr("z19", 0.78) && t < T("thighs", 1.2);
    show(props.sparkles, sp);
    if (sp) [...props.sparkles.children].forEach((n, i) => {
      const u = (t * 1.3 + i * 0.37) % 1;
      n.setAttribute("transform", `translate(${640 + ((i * 53) % 150)} ${775 + ((i * 31) % 70)}) scale(${(Math.sin(u * Math.PI) * 0.8).toFixed(3)})`);
    });
    const cf = t - tBlaze - 0.9;
    show(props.confetti, cf > 0 && cf < 5 && t < T("repo.plop", 0.5));
    if (cf > 0) [...props.confetti.children].forEach((n, i) => {
      const u = cf * (0.35 + (i % 5) * 0.05);
      n.setAttribute("transform", `translate(${(i * 131) % 1920 + Math.sin(cf * 3 + i) * 30} ${-40 + u * 760 - ((i * 53) % 300)}) rotate(${(cf * 300 + i * 40) % 360})`);
    });

    // hologram ------------------------------------------------------
    const panel = TR.holo(t);
    show(holo.root, !!panel);
    if (panel) {
      holo.root.setAttribute("opacity", (0.9 + 0.1 * Math.sin(t * 31)).toFixed(3));
      holo.root.setAttribute("transform", `translate(${q.x - 180} 330)`);
      for (const [name, g] of Object.entries(holo.panels)) g.setAttribute("opacity", name === panel ? 1 : 0);
      if (panel === "crash") {
        const u = prog(t, tAlarm, T("lower", 3), "lin");
        let dd = "M -170 -70";
        for (let i = 1; i <= 20; i++) { const f = i / 20; if (f > u) break; dd += ` L ${-170 + f * 340} ${-70 + f * f * 150 + wobble(i, 3, 1) * 12}`; }
        holo.crashLine.setAttribute("d", dd);
        holo.halted.setAttribute("opacity", t >= T("q49", 1.2) ? (Math.sin(t * 10) > 0 ? 1 : 0.3) : 0);
      }
      if (panel === "moon") {
        const u = prog(t, T("blaze", 1.0), T("blaze", 2.2), "out");
        let dd = "M -170 80";
        for (let i = 1; i <= 20; i++) { const f = i / 20; if (f > u) break; dd += ` L ${-170 + f * 340} ${80 - f * f * 150 + wobble(i, 4, 1) * 8}`; }
        holo.moonLine.setAttribute("d", dd);
      }
    }

    // inserts -------------------------------------------------------
    if (insert === "phone") {
      const secs = 47 * 60 + 12 + Math.floor(t);
      ins.timer.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
      const lv = film.mouth("KAYLA", t);
      ins.bars.forEach((bar, i) => {
        const hgt = 10 + lv * (40 + 50 * Math.abs(Math.sin(t * 13 + i * 1.7)));
        bar.setAttribute("y", 200 - hgt / 2); bar.setAttribute("height", hgt);
      });
      const cap = film.caption(t);
      ins.phoneLine.textContent = cap && cap.who === "KAYLA" ? "FlexZone is speaking…" : "♪  hold music  ♪";
    }
    if (insert === "under") {
      const u = prog(t, T("eyes", 0.5), T("eyes", 1.7), "io");
      ins.pupil.setAttribute("cx", (-10 + 42 * u).toFixed(1));
      ins.pupil.setAttribute("cy", (10 * u).toFixed(1));
      const found = prog(t, T("eyes", 1.6), T("eyes", 2.3));
      ins.underRays.setAttribute("opacity", found.toFixed(3));
      ins.underRays.setAttribute("transform", `translate(1080 690) rotate(${(t * 14) % 360})`);
      ins.cheek.setAttribute("transform", `translate(${(-60 * found).toFixed(1)} 0)`);
    }
    if (insert === "title") {
      ins.titleWords.forEach((wd, i) => {
        const u = clamp((t - T("title") - 0.12 - i * 0.42) / 0.3);
        const sc = u <= 0 ? 0 : 1 + 2.2 * (1 - ease.out3(u));
        const j = hump(t, T("title", 0.12 + i * 0.42 + 0.3), 0.3, 0.1) * 14;
        wd.setAttribute("transform", `translate(${960 + wobble(t, i, 40) * j} ${430 + i * 270 + wobble(t, i + 3, 44) * j}) rotate(${i ? 2 : -3}) scale(${sc.toFixed(3)})`);
        wd.setAttribute("opacity", u > 0 ? 1 : 0);
      });
    }
  };
}
