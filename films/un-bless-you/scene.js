// UN-BLESS YOU - staging. Shot like a sketch-show episode: a locked-off wide,
// singles and over-the-shoulders, a slow push or two, a 2.39:1 letterbox and
// a camera operator who is breathing. Every cue is keyed to a beat id.
import { el, Camera, track, prog, hump, wobble, clamp, lerp, ease } from "../engine/engine.js";
import { Toon, EXPR, ex } from "../engine/rig.js";
import { makeMarcus, makeLeonard, makeDenise, makeMum, makeKid, makeDriver, makePigeon } from "./chars.js";
import { buildDefs, buildFar, buildBus, buildNear, buildProps, buildInserts, GROUND, SEAT, SEATS, DOOR, DOOR_LOCAL, KERB, DRAIN, BUS_TOP } from "./world.js";

export default function (stage, film) {
  const T = (id, o = 0) => film.T(id, o), E = (id, o = 0) => film.E(id, o);
  const Fr = (id, f) => film.T(id) + film.D(id) * f;

  // ---------------------------------------------------------------- build
  const { blur } = buildDefs(stage);
  const world = el("g", {}, stage);
  const cam = new Camera(world, 1920, 1080);
  buildFar(world);
  const bus = buildBus(world);
  buildNear(world);
  const props = buildProps();
  const cast = el("g", {}, world);
  cast.appendChild(props.thermos);
  const benchPaper = el("g", {}, cast);
  benchPaper.appendChild(props.paper.cloneNode(true));
  const leonard = makeLeonard(cast), denise = makeDenise(cast), marcus = makeMarcus(cast);
  const pigeon = makePigeon(cast), mum = makeMum(cast), kid = makeKid(cast);
  const driver = makeDriver(bus.driverSlot);
  world.appendChild(props.hubcap);
  world.appendChild(props.airpod);
  world.appendChild(props.thread);
  world.appendChild(props.knot);
  world.appendChild(props.sunGlare);
  for (const t of [leonard, marcus, denise]) t.c.itemsHang = true;
  leonard.frontItem.append(props.paper, props.pen);
  leonard.backItem.append(props.notebook);
  marcus.frontItem.append(props.phone, props.finger, props.packet);
  props.paper.setAttribute("transform", "translate(-10 -26)");
  props.pen.setAttribute("transform", "translate(4 -4) rotate(-30)");
  props.notebook.setAttribute("transform", "translate(6 -14)");
  props.finger.setAttribute("transform", "translate(2 -6)");
  const dPhone = el("g", {}, denise.frontItem);
  el("rect", { x: -10, y: -34, width: 20, height: 36, rx: 4, fill: "#1b1b1d" }, dPhone);
  el("rect", { x: -7, y: -31, width: 14, height: 28, rx: 2, fill: "#8fd3ff", opacity: 0.6 }, dPhone);
  const lanyardText = marcus.torsoArt.querySelector("text");
  const kidHood = el("path", { d: "M -28 6 Q -32 -36 0 -36 Q 32 -36 28 6 Q 0 -6 -28 6 Z", fill: "#f2c230", stroke: "#2b2622", "stroke-width": 1.6 }, kid.headG);

  const grey = el("rect", { width: 1920, height: 1080, fill: "#6f7b86", style: "mix-blend-mode:saturation", opacity: 0 }, stage);
  const warm = el("rect", { width: 1920, height: 1080, fill: "#ffd9a8", style: "mix-blend-mode:soft-light", opacity: 0.5 }, stage);
  const vig = el("rect", { width: 1920, height: 1080, fill: "url(#vig)" }, stage);
  const ins = buildInserts(stage);
  const BAR = 138;
  el("rect", { width: 1920, height: BAR, fill: "#000" }, stage);
  el("rect", { y: 1080 - BAR, width: 1920, height: BAR, fill: "#000" }, stage);

  // ---------------------------------------------------------------- framing
  const M_STAND = 1330;                       // where Marcus plants himself to argue
  const SH = {
    wide: { x: 960, y: 600, z: 0.92 },
    mwide: { x: 940, y: 610, z: 1.25 },
    pace: { x: 1420, y: 490, z: 2.0 },
    paceW: { x: 1300, y: 560, z: 1.45 },
    leo: { x: 700, y: 556, z: 2.55 },
    leoT: { x: 660, y: 548, z: 3.3 },
    leoStand: { x: 1120, y: 470, z: 2.4 },
    mar: { x: M_STAND, y: 474, z: 2.45 },
    marT: { x: M_STAND, y: 468, z: 3.2 },
    otsM: { x: 1150, y: 520, z: 1.65 },       // over Leonard, onto Marcus
    otsL: { x: 840, y: 545, z: 1.65 },       // over Marcus, onto Leonard
    two: { x: 1000, y: 540, z: 1.45 },
    ritual: { x: 1220, y: 480, z: 2.0 },
    den: { x: SEATS.D, y: 560, z: 2.6 },
    denA: { x: SEATS.A, y: 560, z: 2.7 },
    marSit: { x: SEATS.C, y: 550, z: 2.6 },
    bench: { x: 760, y: 590, z: 1.5 },
    ecu: { x: 802, y: 566, z: 5.4 },
    ecuL: { x: 652, y: 540, z: 4.6 },
    drain: { x: DRAIN[0], y: DRAIN[1] - 40, z: 4.2 },
    door: { x: DOOR - 40, y: 340, z: 2.4 },
    kneel: { x: 1440, y: 520, z: 2.2 },
    standoff: { x: 1130, y: 640, z: 0.98 },
    driver: { x: DOOR - DOOR_LOCAL + 90, y: BUS_TOP + 150, z: 3.2 },
    pigeon: { x: 1200, y: 920, z: 4.2 },
    street: { x: 760, y: 640, z: 1.05 },
  };

  // ---------------------------------------------------------------- poses
  const mS = Toon.stand(marcus.c), lS = Toon.stand(leonard.c), dS = Toon.stand(denise.c);
  const MY = GROUND + 25 - marcus.c.legLen;   // Marcus's hip height, standing
  const LY = GROUND - leonard.c.legLen;
  const STEP_Y = KERB - 22 - leonard.c.legLen * 0.84;   // Leonard's hips on the bus step
  const seat = (base, x, flip, o = {}) => ({ ...base, x, y: SEAT, flip, lf: [92, 145], rf: [118, 143], lh: [70, 128], rh: [36, 130], ...o });
  const P = {
    // Marcus
    mCall: { ...mS, x: 1520, y: MY, flip: -1, rh: [8, -18], lh: [0, 160] },
    mCallR: { ...mS, x: 1340, y: MY, flip: 1, rh: [8, -18], lh: [0, 160] },
    mBuild: { ...mS, x: 1340, y: MY, flip: 1, rh: [8, -18], tilt: -8, ht: -14 },
    mSneeze: { ...mS, x: 1350, y: MY + 6, flip: 1, rh: [8, -18], tilt: 14, ht: 18, lh: [40, 100] },
    mCallL: { ...mS, x: M_STAND, y: MY, flip: -1, rh: [8, -18], lh: [0, 160] },
    mFinger: { ...mS, x: M_STAND, y: MY, flip: -1, rh: [64, -24], lh: [0, 160] },
    mAway: { ...mS, x: M_STAND + 20, y: MY, flip: 1, rh: [8, -18], lh: [0, 160] },
    mDown: { ...mS, x: M_STAND, y: MY, flip: -1, rh: [10, 150], lh: [0, 160] },
    mArgue: { ...mS, x: M_STAND, y: MY, flip: -1, rh: [40, 90], lh: [-10, 150] },
    mOpen: { ...mS, x: M_STAND, y: MY, flip: -1, rh: [80, 40], lh: [-60, 60], tilt: -3 },
    mCross: { ...mS, x: M_STAND, y: MY, flip: -1, rh: [-10, 70], lh: [60, 70], tilt: -4 },
    mHip: { ...mS, x: M_STAND, y: MY, flip: -1, rh: [40, 110], lh: [-30, 100], tilt: -6 },
    mSit: seat(mS, SEATS.C, -1, { lh: [60, 120], rh: [30, 124], y: SEAT + 4 }),
    mSlump: seat(mS, SEATS.C, -1, { tilt: -10, lh: [60, 130], rh: [30, 132], y: SEAT + 8 }),
    mSitPhone: seat(mS, SEATS.C, -1, { rh: [40, 40], lh: [60, 120], ht: 14 }),
    mSitEar: seat(mS, SEATS.C, -1, { rh: [8, -18], lh: [60, 120] }),
    mLean: seat(mS, SEATS.C, -1, { tilt: 16, rh: [50, 110], lh: [70, 110] }),
    mStandL: { ...mS, x: 830, y: MY, flip: -1, rh: [36, 120], lh: [0, 150] },
    mPlead: { ...mS, x: 830, y: MY, flip: -1, rh: [60, 50], lh: [30, 60], tilt: 6 },
    mCrouch: { ...mS, x: 806, y: GROUND - 118, flip: -1, tilt: 8, lf: [70, 110], rf: [-60, 112], rh: [50, 60], lh: [70, 70] },
    mUp: { ...mS, x: 900, y: MY, flip: -1, rh: [30, 140], lh: [0, 150], tilt: -4 },
    mSun: { ...mS, x: 900, y: MY, flip: -1, rh: [40, -20], lh: [0, 150], tilt: -14, ht: -22 },
    mPacket: { ...mS, x: 900, y: MY, flip: -1, rh: [30, 20], lh: [60, 30] },
    mSnort: { ...mS, x: 900, y: MY, flip: -1, rh: [10, -40], lh: [0, 150], tilt: -8, ht: -10 },
    mKneel: { ...mS, x: 1390, y: GROUND - 100, flip: 1, tilt: -6, lf: [-90, 100], rf: [40, 100], rh: [80, -30], lh: [60, -10], ht: -20 },
    mKneelSag: { ...mS, x: 1390, y: GROUND - 92, flip: 1, tilt: 14, lf: [-90, 92], rf: [40, 92], rh: [20, 140], lh: [0, 140], ht: 12 },
    mRise: { ...mS, x: 1390, y: MY, flip: 1, rh: [10, 150], lh: [0, 150] },
    mWin: { ...mS, x: 1390, y: MY, flip: 1, rh: [8, -18], lh: [0, 150], tilt: -3 },
    mWinF: { ...mS, x: 1390, y: MY, flip: 1, rh: [64, -24], lh: [0, 150] },
    mWinAway: { ...mS, x: 1420, y: MY, flip: -1, rh: [8, -18], lh: [0, 150] },
    // Leonard
    lRead: seat(lS, SEATS.B, 1, { rh: [40, 64], lh: [92, 64] }),
    lLap: seat(lS, SEATS.B, 1, { rh: [44, 128], lh: [94, 128] }),
    lGlasses: seat(lS, SEATS.B, 1, { rh: [-14, -60], lh: [94, 128] }),
    lStand: { ...lS, x: SEATS.B + 40, y: LY, flip: 1, rh: [8, 166], lh: [-6, 166] },
    lBack: { ...lS, x: SEATS.B + 40, y: LY, flip: -1, rh: [8, 166], lh: [-6, 166] },
    lStep: { ...lS, x: 1150, y: LY + 22, flip: 1, rh: [8, 166], lh: [-6, 166] },
    lReach: { ...lS, x: 1150, y: LY + 22, flip: 1, tilt: 6, rh: [150, 30], lh: [-6, 166] },
    lPull: { ...lS, x: 1140, y: LY + 22, flip: 1, tilt: -2, rh: [70, 40], lh: [30, 80] },
    lFold: { ...lS, x: 1140, y: LY + 22, flip: 1, rh: [50, 60], lh: [80, 60] },
    lTuck: { ...lS, x: 1140, y: LY + 22, flip: 1, rh: [-4, 110], lh: [-6, 166] },
    lTurn: { ...lS, x: 1140, y: LY + 22, flip: -1, rh: [8, 166], lh: [-6, 166] },
    lNote: seat(lS, SEATS.B, 1, { rh: [44, 64], lh: [84, 66] }),
    lStandB: { ...lS, x: SEATS.B + 30, y: LY, flip: 1, rh: [8, 166], lh: [-6, 166] },
    lStepUp: { ...lS, x: DOOR_LOCAL, y: STEP_Y, s: 1, flip: 1, rh: [8, 166], lh: [-6, 166] },
    lStepL: { ...lS, x: DOOR_LOCAL, y: STEP_Y, s: 1, flip: -1, rh: [8, 166], lh: [-6, 166] },
    lSneezeB: { ...lS, x: DOOR_LOCAL, y: STEP_Y, s: 1, flip: 1, tilt: -10, ht: -20, rh: [20, 40], lh: [10, 60] },
    lSneezeH: { ...lS, x: DOOR_LOCAL, y: STEP_Y + 6, s: 1, flip: 1, tilt: 22, ht: 22, rh: [60, 20], lh: [40, 40] },
    lPalms: { ...lS, x: DOOR_LOCAL, y: STEP_Y, s: 1, flip: -1, rh: [40, -40], lh: [50, -36] },
    // Denise
    dPhone: seat(dS, SEATS.D, -1, { rh: [30, 48], lh: [64, 60], ht: 16 }),
    dUp: { ...dS, x: SEATS.D - 20, y: GROUND - denise.c.legLen, flip: -1, rh: [30, 48], lh: [10, 150] },
    dWalkTo: { ...dS, x: SEATS.A + 30, y: GROUND + 20 - denise.c.legLen, flip: -1, rh: [30, 48], lh: [10, 150] },
    dPhoneA: seat(dS, SEATS.A, 1, { rh: [30, 48], lh: [64, 60], ht: 16 }),
    dLookA: seat(dS, SEATS.A, 1, { rh: [30, 60], lh: [64, 70], ht: 0 }),
    dChest: seat(dS, SEATS.A, 1, { rh: [-4, 40], lh: [64, 70], ht: -4 }),
  };

  // ---------------------------------------------------------------- cue sheet
  const K = { cam: [], M: [], Me: [], L: [], Le: [], D: [], De: [], ins: [], call: [], hand: [], pen: [], paper: [], glasses: [], note: [], phoneM: [], finger: [], packet: [], dphone: [], shades: [], grade: [] };
  const w = (v, dur, e) => ({ __v: v, dur, e });
  const DUR = { cam: 0, ins: 0, call: 0, hand: 0, pen: 0, paper: 0.25, glasses: 0.2, note: 0.2, phoneM: 0.15, finger: 0.12, packet: 0.1, dphone: 0.15, shades: 0.8, grade: 1.2 };
  const at = (time, o) => {
    for (const [k, raw] of Object.entries(o)) {
      const wrapped = raw && raw.__v !== undefined;
      let v = wrapped ? raw.__v : raw;
      if (k === "cam" && typeof v === "string") v = SH[v];
      if (k.endsWith("e") && k.length === 2 && typeof v === "string") v = EXPR[v];
      K[k].push([time, v, wrapped && raw.dur !== undefined ? raw.dur : DUR[k] ?? (k.length === 2 ? 0.25 : 0.45), (wrapped && raw.e) || "io"]);
    }
  };
  const toM = { px: 0.6 }, toL = { px: 0.6 };   // eye lines toward the other man (faces mirror with flip)

  // the sneeze -------------------------------------------------------
  at(0, {
    cam: "wide", M: P.mCall, Me: ex("smug", { px: 0.2 }), L: P.lRead, Le: ex("flat", { px: 0.3, py: 0.8 }), D: P.dPhone, De: ex("flat", { py: 0.9 }),
    ins: null, call: "Mom", hand: "paper", pen: 1, paper: 1, glasses: 1, note: 0, phoneM: 1, finger: 0, packet: 0, dphone: 1, shades: 0, grade: 0,
  });
  at(T("m1", 0.5), { M: w(P.mCallR, 3.2, "io") });
  at(T("m1", 2.0), { cam: w("paceW", 3, "io") });
  at(T("m1", 3.8), { M: w({ ...P.mCallR, flip: 1 }, 0.3) });
  at(T("sneeze1.build"), { cam: "pace", M: w(P.mBuild, 1.1, "io"), Me: w(ex("sneeze", { mo: 0.3, eo: 0.6 }), 0.9) });
  at(T("sneeze1.hit"), { M: w(P.mSneeze, 0.08, "out"), Me: w(ex("sneeze", { eo: 0.05, mo: 0.9 }), 0.06) });
  at(T("sneeze1.hit", 0.5), { M: w(P.mCallR, 0.5), Me: w(ex("annoyed", { eo: 0.8, sm: 0 }), 0.3) });
  at(T("l2"), { cam: "leo", Le: ex("flat", { px: 0.3, py: 0.8 }) });
  at(T("m3"), { cam: "pace", Me: ex("smug", { px: 0.3 }) });
  at(T("stare"), { cam: "mwide" });
  at(T("stare.pen"), { pen: 1, L: w(P.lRead, 0.1) });
  at(T("stare.lower"), { cam: "leo", L: w(P.lLap, 0.9), Le: w(ex("flat", { px: 0.9, py: -0.1 }), 0.6) });
  at(T("stare", 2.2), { cam: w("leoT", 2.2, "lin") });
  at(T("stare.turn"), { cam: "pace", M: w({ ...P.mCallR, flip: -1 }, 0.35), Me: w(ex("neutral", { px: 0.7 }), 0.3) });
  at(T("m4"), { Me: ex("annoyed", { px: 0.7, bl: 6, br: 6 }) });
  at(T("l5"), { cam: "otsL", M: w(P.mCallL, 1.4) });
  at(T("m6"), { cam: "otsM", Me: ex("flat", { px: 0.6 }) });
  at(T("finger.up"), { cam: "mar", M: w(P.mFinger, 0.25, "out"), finger: 1, phoneM: 1, Me: ex("smug", { px: 0.6, eo: 0.7 }) });
  at(T("finger.turn"), { M: w(P.mAway, 0.35), finger: 0, Me: ex("smug", { px: 0.2 }) });
  at(T("finger.turn", 0.6), { cam: "two" });

  // the argument -----------------------------------------------------
  at(T("l7"), { cam: "leo", Le: ex("flat", { px: 0.9, py: -0.2, sm: -0.2 }) });
  at(T("m8a"), { cam: "mar", Me: ex("annoyed", { px: -0.4 }) });
  at(E("m8a", 0.1), { M: w(P.mDown, 0.4), phoneM: 1 });
  at(T("m8b"), { M: w(P.mArgue, 0.3), Me: ex("annoyed", toM) });
  at(T("l9"), { cam: "otsL", Le: ex("solemn", toL) });
  at(T("m10"), { cam: "otsM", M: w(P.mOpen, 0.3), Me: ex("angry", { px: 0.6, sm: -0.3 }) });
  at(T("l11"), { cam: "leo", Le: ex("solemn", { px: 0.9, py: -0.15 }) });
  at(Fr("l11", 0.45), { cam: w("leoT", 3.8, "lin") });
  at(T("m12"), { cam: "mar", M: w(P.mCross, 0.4), Me: ex("annoyed", toM) });
  at(T("l13"), { cam: "otsL", Le: ex("solemn", { px: 0.9, sm: 0.1 }) });
  at(T("m14"), { cam: "mar", M: w(P.mHip, 0.4), Me: ex("smug", { px: 0.6, sm: 0.3 }) });
  at(T("l15"), { cam: "leo", Le: ex("flat", { px: 0.9, py: -0.2 }) });
  at(T("m16"), { cam: "otsM", Me: ex("happy", { px: 0.6, sm: 0.5 }) });

  // the revocation ---------------------------------------------------
  at(T("rise"), { cam: "two", Le: ex("flat", { px: 0.9, py: -0.15, eo: 0.5 }) });
  at(T("rise.cap"), { pen: 0 });
  at(T("rise.down"), { L: w(P.lLap, 0.3), paper: 0, hand: "bench" });
  at(T("rise.glasses"), { cam: "leo", L: w(P.lGlasses, 0.5) });
  at(T("rise.glasses", 0.55), { glasses: 0, L: w(P.lLap, 0.4) });
  at(T("rise.stand"), { cam: w("two", 0.01), L: w(P.lStand, 1.0, "io") });
  at(T("rise.stand", 1.0), { L: w(P.lStep, 1.7, "lin") });
  at(T("l17"), { cam: "leoStand", Le: ex("solemn", { px: 0.8, eo: 0.6 }) });
  at(T("m18"), { cam: "mar", Me: ex("happy", { px: 0.6, sm: 0.6, mo: 0.15 }), M: w(P.mHip, 0.3) });
  at(T("ritual"), { cam: "ritual", M: w({ ...P.mArgue, rh: [20, 140], lh: [-10, 150] }, 0.4) });
  at(T("ritual.reach"), { L: w(P.lReach, 0.8, "io"), Le: ex("solemn", { px: 0.7, py: 0.4, eo: 0.55 }), Me: ex("smug", { px: 0.6, py: 0.6 }) });
  at(T("ritual.pinch", 0.1), { Me: w(ex("neutral", { px: 0.5, py: 0.8, eo: 1.1 }), 0.3) });
  at(T("ritual.pull"), { L: w(P.lPull, 2.0, "io"), Me: ex("shock", { px: 0.5, py: 0.6, mo: 0.15 }) });
  at(T("ritual.pull", 0.6), { cam: w({ x: 1210, y: 470, z: 2.5 }, 2.0, "io") });
  at(T("ritual.fold1"), { L: w(P.lFold, 0.4) });
  at(T("ritual.tuck"), { L: w(P.lTuck, 0.5) });
  at(T("l19"), { cam: "leoStand", Le: ex("solemn", { px: 0.8, eo: 0.6 }), grade: 1 });
  at(E("l19", 0.15), { cam: "two" });
  at(T("sits"), { L: w(P.lTurn, 0.3) });
  at(T("sits", 0.3), { L: w(P.lBack, 1.5, "lin") });
  at(T("sits", 1.8), { L: w({ ...P.lLap, flip: 1 }, 0.8, "io") });
  at(T("sits", 2.6), { glasses: w(1, 0.2), L: w(P.lRead, 0.5), hand: "paper", paper: 1 });
  at(T("sits", 2.9), { pen: 1, Le: ex("flat", { px: 0.3, py: 0.8 }) });
  at(T("sits"), { cam: "mwide" });
  at(T("m20"), { cam: "mar", Me: ex("sly", { px: 0.6, sm: 0.2 }) });

  // consequences -----------------------------------------------------
  at(T("denise.msit"), { cam: "mwide", M: w({ ...P.mSit, y: MY }, 0.01), Me: ex("smug", { px: -0.3 }) });
  at(T("denise.msit", 0.05), { M: w(P.mSit, 0.8, "io") });
  at(T("denise.up"), { D: w(P.dUp, 0.6, "io"), De: ex("flat", { py: 0.9 }) });
  at(T("denise.walk"), { D: w(P.dWalkTo, film.D("denise") - 1.6 - 0.9 + 0.2, "lin") });
  at(T("denise.sit"), { D: w({ ...P.dPhoneA, flip: 1 }, 0.7, "io") });
  at(T("m21"), { cam: "marSit", Me: ex("annoyed", { px: -0.8, py: 0 }) });
  at(T("airpod.slip", -0.3), { cam: "marSit", Me: ex("annoyed", { px: 0.3 }) });
  at(T("airpod.slip", 0.15), { Me: w(ex("shock", { px: 0.6, py: 0.9, mo: 0.2 }), 0.2) });
  at(T("airpod.b1", -0.1), { cam: "bench" });
  at(T("airpod.roll"), { cam: "drain" });
  at(T("airpod.plink", 0.3), { cam: "marSit", M: w(P.mSlump, 0.6), Me: ex("sad", { px: 0.8, py: 0.9 }) });
  at(T("m22"), { Me: ex("fear", { px: 0.2, py: 0.6, sm: -0.3 }) });
  at(T("l23"), { cam: "leo", Le: ex("flat", { px: 0.3, py: 0.85 }) });
  at(T("buzz.buzz"), { cam: "marSit", M: w(P.mSitPhone, 0.4), phoneM: 1, Me: ex("neutral", { px: 0.5, py: 0.9 }) });
  at(T("buzz.buzz", 0.7), { ins: "phone", call: null });
  at(E("m24a", 0.2), { ins: null, cam: "marSit", Me: ex("shock", { px: 0.5, py: 0.9 }) });
  at(T("m24b"), { Me: ex("angry", { px: 0.5, py: 0.6, mo: 0.2 }) });
  at(T("mum"), { cam: "street", Me: ex("annoyed", { px: 0.5, py: 0.9 }) });
  at(T("u25", -0.2), { cam: "mwide" });
  at(T("m26"), { cam: "marSit", M: w(P.mLean, 0.3, "back"), Me: ex("angry", { px: -0.9, mo: 0.2 }) });
  at(T("ring.ring"), { M: w(P.mSitPhone, 0.4), Me: ex("neutral", { px: 0.5, py: 0.9 }) });
  at(T("ring.ring", 0.4), { ins: "phone", call: "Mom" });
  at(T("ring.answer"), { ins: null, cam: "marSit", M: w(P.mSitEar, 0.4), Me: ex("happy", { px: 0, sm: 0.5 }) });
  at(T("o28"), { Me: ex("happy", { px: 0.1, sm: 0.4, eo: 0.9 }) });
  at(Fr("o28", 0.55), { cam: w({ x: SEATS.C, y: 548, z: 3.4 }, film.D("o28") * 0.45 + 3.4, "lin") });
  at(Fr("o28", 0.78), { Me: w(ex("neutral", { px: 0, eo: 1.05, sm: -0.05 }), 0.15) });
  at(T("hold", 1.6), { Me: w(ex("sad", { px: 0, eo: 0.95, sm: -0.2 }), 1.4) });
  at(T("o29"), { Me: ex("sad", { px: 0, eo: 0.8 }) });
  at(T("lower.click"), { cam: "marSit", M: w(P.mSitPhone, 0.6) });
  at(T("lower.turn"), { cam: "bench", M: w({ ...P.mStandL, x: 820 }, 0.9), Me: ex("plead", { px: 0.7 }), phoneM: 0 });

  // the return -------------------------------------------------------
  at(T("m30"), { cam: "otsL", M: w(P.mPlead, 0.3), Me: ex("plead", toM) });
  at(T("l31"), { cam: "leo", Le: ex("flat", { px: 0.9, py: -0.2 }) });
  at(T("m32"), { cam: "otsM", Me: ex("plead", { px: 0.6, sm: -0.1 }) });
  at(T("l33"), { cam: "leo", Le: ex("flat", { px: 0.9, py: -0.2, eo: 0.5 }) });
  at(T("m34"), { cam: "otsM", M: w(P.mStandL, 0.4), Me: ex("smug", { px: 0.6, sm: 0.4, bl: 10, br: 10 }) });
  at(T("l35"), { cam: "otsL", Le: ex("solemn", { px: 0.9, py: -0.1 }) });
  at(T("m36"), { cam: "otsM", Me: ex("annoyed", toM) });
  at(T("l37"), { cam: "leoT", Le: ex("flat", { px: 0.9, py: -0.2 }) });
  at(T("notebook.out"), { cam: "leo", L: w(P.lNote, 0.4), note: 1, hand: "none", paper: 0, pen: 1 });
  at(T("notebook.lick"), { L: w({ ...P.lNote, rh: [6, -40] }, 0.25), Le: ex("flat", { py: 0.8, mo: 0.4 }) });
  at(T("notebook.lick", 0.5), { L: w(P.lNote, 0.3), Le: ex("flat", { py: 0.8 }) });
  at(T("l38"), { cam: "otsL", Le: ex("flat", { px: 0.2, py: 0.9 }) });
  at(T("m39"), { cam: { x: 830, y: 474, z: 2.45 }, Me: ex("plead", { px: 0.2, py: 0.6 }) });
  at(T("l40"), { cam: "leo", Le: ex("flat", { px: 0.2, py: 0.9, sm: -0.3 }) });
  at(T("m41"), { cam: { x: 830, y: 474, z: 2.45 }, Me: ex("annoyed", toM) });
  at(T("l42"), { cam: "leoT", Le: ex("solemn", { px: 0.9, py: -0.2 }) });
  at(T("m43"), { cam: { x: 830, y: 470, z: 3.1 }, Me: ex("fear", { px: 0.6, eo: 1.2 }) });
  at(T("l44"), { cam: "leo", Le: ex("flat", { px: 0.9, py: -0.1 }) });
  at(T("lanyard.look"), { ins: "lanyard" });
  at(T("l45"), { ins: null, cam: "otsL", Le: ex("flat", { px: 0.2, py: 0.9 }) });
  at(T("m46"), { cam: { x: 830, y: 474, z: 2.45 }, M: w({ ...P.mStandL, ht: 18 }, 0.25), Me: ex("annoyed", { px: 0.3, py: 1 }) });
  at(T("l47"), { cam: "leo", Le: ex("solemn", { px: 0.9, py: -0.2 }) });
  at(T("crouch.down"), { cam: "bench", M: w(P.mCrouch, 0.9, "io"), Me: ex("plead", toM), note: 0, pen: 0 });
  at(T("m48", -0.5), { cam: "ecu", Me: ex("moved", { px: 0.7, sm: -0.1 }) });
  at(T("holdty"), { cam: "ecuL", Le: ex("moved", { px: 0.9, eo: 0.9, sm: 0.1 }) });
  at(T("holdty.chest"), { cam: "denA", D: w(P.dChest, 0.5), De: ex("moved", { px: 0.8 }), dphone: 0 });
  at(T("l49"), { cam: "otsL", Le: ex("happy", { px: 0.9, sm: 0.3 }) });
  at(T("m50"), { cam: "ecu", Me: ex("happy", { px: 0.7, sm: 0.3 }) });
  at(T("l51"), { cam: "leo", Le: ex("flat", { px: 0.9, py: 0, sm: 0 }), D: w(P.dLookA, 0.4), dphone: 1 });
  at(T("process"), { cam: "ecu", Me: ex("neutral", { px: 0.7, eo: 1.05 }) });
  at(T("process", 1.2), { Me: w(ex("fear", { px: 0.7 }), 0.6) });
  at(T("l52"), { cam: "leo", L: w(P.lRead, 0.4), hand: "paper", paper: 1, pen: 1 });

  // the forced sneeze ------------------------------------------------
  at(T("sun"), { cam: "mwide", M: w(P.mUp, 0.7, "io"), Me: ex("strain", { px: 0.3, py: -1 }) });
  at(T("sun.look"), { M: w(P.mSun, 0.8), Me: w(ex("strain", { px: 0.4, py: -1, eo: 0.12 }), 0.6) });
  at(T("sun", 1.6), { cam: w({ x: 900, y: 470, z: 2.4 }, 1.6, "io") });
  at(T("m53"), { M: w({ ...P.mSun, tilt: 4, ht: 6 }, 0.4) });
  at(T("l54"), { cam: "leo", Le: ex("flat", { px: 0.9, py: -0.2, sm: -0.3 }) });
  at(T("pepper"), { cam: { x: 900, y: 474, z: 2.4 }, M: w(P.mPacket, 0.4), packet: 1, Me: ex("angry", { px: 0.6, py: 0.8 }) });
  at(T("pepper.snort"), { M: w(P.mSnort, 0.2, "out"), Me: w(ex("wince", { mo: 0.2 }), 0.15) });
  at(T("pepper.snort", 1.0), { cam: "mwide", Me: ex("strain", { px: 0.2, py: -0.5 }), packet: 0 });
  at(T("pepper.pluck", -0.4), { M: w(P.mSnort, 0.2), Me: ex("strain", { eo: 0.3 }) });
  at(T("pepper.pluck"), { M: w({ ...P.mSnort, rh: [30, -10] }, 0.08, "out"), Me: w(ex("wince", { mo: 0.3 }), 0.06) });
  at(T("pepper.wince"), { cam: "denA", De: ex("wince", { mo: 0.15, px: 0.7 }), D: w(P.dLookA, 0.2), dphone: 1 });
  at(T("bus"), { cam: "wide", M: w(P.mUp, 0.5), Me: ex("strain", { px: 0.6, py: 0, eo: 0.6 }), De: ex("flat", { py: 0.9 }), D: w(P.dPhoneA, 0.4) });
  const busStand = T("bus", 0.5), busArrive = T("bus.step");
  at(busStand, { L: w(P.lStandB, 0.9, "io"), paper: 0, pen: 0, hand: "none", Le: ex("flat", { px: 0.6 }) });
  at(busArrive, { L: w(P.lStepL, 0.3), Le: ex("flat", { px: 0.7, py: 0.5 }) });
  at(T("m55"), { cam: "kneel", M: w(P.mKneel, 0.7, "out"), Me: ex("sneeze", { eo: 0.5, mo: 0.5 }) });
  at(T("m55", 1.6), { Me: w(ex("sneeze", { eo: 0.25, mo: 0.8 }), 2.6) });
  at(T("crest"), { cam: "standoff", Le: ex("flat", { px: 0.8, py: 0.7 }), De: ex("neutral", { px: 0.9, py: 0, eo: 1.1 }), D: w(P.dLookA, 0.2) });
  at(T("crest.die"), { M: w(P.mKneelSag, 0.9, "io"), Me: w(ex("sad", { py: 0.6 }), 0.5) });
  at(T("m56"), { cam: "kneel" });
  at(T("l57"), { cam: "door", Le: ex("flat", { px: 0.9, py: 0.8 }) });
  at(T("turnaway.turn"), { L: w(P.lStepUp, 0.5) });

  // the reversal -----------------------------------------------------
  at(T("sneeze2.hit", -0.4), { L: w(P.lSneezeB, 0.4), Le: w(ex("sneeze", { mo: 0.4 }), 0.35) });
  at(T("sneeze2.hit"), { L: w(P.lSneezeH, 0.07, "out"), Le: w(ex("sneeze", { eo: 0.05, mo: 0.95 }), 0.05) });
  at(T("sneeze2.hit", 0.5), { L: w(P.lStepUp, 0.7), Le: w(ex("shock", { px: -0.2, mo: 0 }), 0.3) });
  at(T("silence"), { cam: "standoff", M: w(P.mKneelSag, 0.1), Me: ex("shock", { px: 0.8, py: -0.6, mo: 0 }), De: ex("shock", { px: 0.9, py: -0.3, mo: 0 }), D: w(P.dLookA, 0.1) });
  at(T("silence.pigeon"), { cam: "pigeon" });
  at(T("silence.turn", -0.4), { cam: "door" });
  at(T("silence.turn"), { L: w(P.lStepL, 1.4, "io"), Le: w(ex("shock", { px: 0, eo: 0.9, mo: 0 }), 1.0) });
  at(T("silence.driver"), { cam: "driver", Le: w(ex("flat", { px: 0.6, py: -0.7, eo: 0.8 }), 0.4) });
  at(T("silence.driver", 0.5), { shades: 1 });
  at(T("silence.denise"), { cam: "denA", De: w(ex("flat", { py: 0.95 }), 0.12), dphone: 1, D: w(P.dPhoneA, 0.15, "out") });
  at(T("silence.marcus"), { cam: "kneel", M: w(P.mRise, 1.8, "io"), Me: w(ex("neutral", { px: 0.7, py: -0.5, eo: 0.6, sm: 0.1 }), 1.2) });
  at(T("l58"), { cam: "door", Le: ex("plead", { px: 0.9, py: 0.6 }) });
  at(T("phone2.ring"), { cam: "kneel", phoneM: 1, M: w({ ...P.mRise, rh: [30, 40] }, 0.4), Me: ex("neutral", { px: 0.3, py: 0.9 }) });
  at(T("phone2.ring", 0.35), { ins: "phone", call: "Brenda" });
  at(T("phone2.look"), { ins: null, cam: "kneel", Me: ex("sly", { px: -0.8, py: -0.4 }) });
  at(T("phone2.finger"), { M: w(P.mWinF, 0.25, "out"), finger: 1, Me: ex("smug", { px: -0.8, py: -0.4, eo: 0.6 }) });
  at(T("phone2.turn"), { M: w(P.mWin, 0.35), finger: 0, Me: ex("happy", { px: 0.5, sm: 0.6 }), grade: w(0, 2.5) });
  at(T("m59"), { M: w({ ...P.mWin, flip: 1 }, 0.2) });
  at(T("doors"), { cam: "door", Le: ex("plead", { px: 0.6, py: 0.7 }) });
  at(T("doors.palms"), { L: w(P.lPalms, 0.3, "out"), Le: w(ex("plead", { px: 0.6, py: 0.6, eo: 1.25 }), 0.2) });
  at(T("doors.go", 1.2), { cam: "wide" });
  at(T("crash.hit", 0.1), { cam: w({ x: 760, y: 610, z: 1.08 }, 0.01), De: ex("flat", { py: 0.95 }), M: w(P.mWinAway, 0.01), Me: ex("happy", { px: 0.5, sm: 0.5 }) });
  at(T("look.up"), { cam: "denA", De: w(ex("flat", { px: 0.9, py: -0.05, eo: 0.75 }), 0.4), D: w(P.dLookA, 0.5) });
  at(T("black"), { ins: "black" });
  at(T("endcard"), { ins: "end" });
  at(T("out"), { ins: "black" });

  const TR = Object.fromEntries(Object.entries(K).map(([k, v]) => [k, track(v.length ? v : [[0, 0]])]));
  const show = (node, on) => node.setAttribute("display", on ? "inline" : "none");

  // the bus: arrives from the right, waits, leaves to the left
  const BX_STOP = DOOR - DOOR_LOCAL;
  const busX = (t) => {
    const a0 = T("bus") - 0.2, a1 = T("bus.stop"), go = T("doors.go");
    if (t < a0) return 3200;
    if (t < a1) return lerp(2600, BX_STOP, ease.out3(prog(t, a0, a1, "lin")));
    if (t < go) return BX_STOP;
    const u = t - go;
    return BX_STOP - 140 * u * u - 40 * u;
  };
  const doorOpen = (t) => prog(t, T("bus.doors"), T("bus.doors", 0.5)) * (1 - prog(t, T("doors.close"), T("doors.shut")));

  // ---------------------------------------------------------------- render
  return (t) => {
    const insert = TR.ins(t);
    show(ins.phone, insert === "phone");
    show(ins.lanyard, insert === "lanyard");
    show(ins.black, insert === "black");
    show(ins.end, insert === "end");
    show(world, !insert);

    // camera: an operator who breathes
    const c = TR.cam(t);
    const hand = 5 / c.z;
    let bump = 0;
    for (const k of ["sneeze1.hit", "sneeze2.hit"]) bump += hump(t, T(k), 0.5, 0.1) * (k === "sneeze2.hit" ? 22 : 9);
    bump += hump(t, T("l19"), 0.8, 0.08) * 10 + hump(t, T("crash.hit"), 0.8, 0.1) * 6;
    cam.set({
      x: c.x + wobble(t, 1, 0.35) * hand * 6 + wobble(t, 4, 11) * bump / c.z,
      y: c.y + wobble(t, 2, 0.3) * hand * 4 + wobble(t, 5, 13) * bump / c.z,
      z: c.z * (1 + 0.004 * wobble(t, 3, 0.2)),
    });
    blur.setAttribute("stdDeviation", clamp((c.z - 1.3) * 3.2, 0, 7).toFixed(2));
    grey.setAttribute("opacity", (0.35 * TR.grade(t)).toFixed(3));

    // bus and driver
    const bx = busX(t);
    bus.bus.setAttribute("transform", `translate(${bx.toFixed(1)} 0)`);
    show(bus.bus, bx < 3100 && bx > -1700);
    const op = doorOpen(t);
    bus.doorL.setAttribute("transform", `translate(${(-70 * op).toFixed(1)} 0)`);
    bus.doorR.setAttribute("transform", `translate(${(70 * op).toFixed(1)} 0)`);
    driver.set(ex("flat", { px: t >= T("silence.driver") && t < T("silence.driver", 0.5) ? -0.4 : 0, eo: 0.8 }), TR.shades(t), t);

    // Leonard ---------------------------------------------------------
    let l = { ...TR.L(t), e: TR.Le(t) };
    const onBus = t >= busArrive;
    if (!onBus && t >= busStand + 0.9) {
      // walk from the bench to the door, receding a little as he goes
      const u = prog(t, busStand + 0.9, busArrive, "lin");
      const wk = Toon.walk(leonard.c, (t - busStand) * 1.7, 0.36, 0.12);
      const x = lerp(SEATS.B + 30, DOOR, ease.io(u)), s = lerp(1, 0.84, u);
      l = { ...l, x, s, y: lerp(LY, STEP_Y, u), lf: wk.lf, rf: wk.rf, lh: wk.lh, rh: wk.rh, flip: 1 };
    }
    if (onBus) {
      if (leonard.g.parentNode !== bus.inside) bus.inside.appendChild(leonard.g);
      l = { ...l, s: 0.84 };
    } else {
      // standing up to Marcus he is in front of the bench; seated he is on it, behind Denise's walk
      const front = t >= T("rise.stand") && t < T("sits", 1.8);
      const before = front ? marcus.g : denise.g;
      if (leonard.g.parentNode !== cast || leonard.g.nextSibling !== before) cast.insertBefore(leonard.g, before);
    }
    const trip = (t >= T("rise.stand", 1.0) && t < T("rise.stand", 2.7)) || (t >= T("sits", 0.3) && t < T("sits", 1.8));
    if (trip) {
      const wk = Toon.walk(leonard.c, t * 1.6, 0.34, 0.1);
      l = { ...l, lf: wk.lf, rf: wk.rf, y: l.y + wk.bob };
    }
    if (t >= T("ritual.pat") && t < T("ritual.pat", 0.8)) l = { ...l, rh: [l.rh[0], l.rh[1] - Math.abs(Math.sin((t - T("ritual.pat")) * 16)) * 10] };
    const lTalk = film.mouth("LEONARD", t);
    leonard.set(l, lTalk, t);
    show(leonard.glasses, TR.glasses(t) > 0.5);
    const hold = TR.hand(t);
    show(props.paper, TR.paper(t) > 0.5 && hold === "paper");
    show(props.pen, TR.pen(t) > 0.5);
    props.penCap.setAttribute("opacity", t >= T("rise.cap") && t < T("sits", 2.9) ? 1 : 0);
    show(props.notebook, TR.note(t) > 0.5);
    show(benchPaper, hold === "bench");
    benchPaper.setAttribute("transform", `translate(${SEATS.B - 120} ${SEAT - 6}) scale(0.9 0.35)`);
    props.thermos.setAttribute("transform", `translate(${SEATS.B - 140} ${SEAT - 6})`);
    // writing: the pen nibbles at the crossword
    const writing = (t >= T("open") && t < T("stare.pen")) || (t >= T("sits", 2.9) && t < T("m20")) || (t >= T("l23") && t < E("l23")) || (t >= T("l38") && t < E("l44"));
    props.pen.setAttribute("transform", `translate(${(4 + (writing ? Math.sin(t * 13) * 3 : 0)).toFixed(1)} ${(-4 + (writing ? Math.cos(t * 9) * 2 : 0)).toFixed(1)}) rotate(-30)`);

    // Denise ----------------------------------------------------------
    let d = { ...TR.D(t), e: TR.De(t) };
    if (t >= T("denise.walk") && t < T("denise.sit")) {
      const wk = Toon.walk(denise.c, (t - T("denise.walk")) * 1.8, 0.34, 0.12);
      d = { ...d, lf: wk.lf, rf: wk.rf, y: d.y + wk.bob, lh: wk.lh };
    }
    denise.set(d, film.mouth("DENISE", t), t);
    show(dPhone, TR.dphone(t) > 0.5);

    // Marcus ----------------------------------------------------------
    let m = { ...TR.M(t), e: TR.Me(t) };
    const mWalk = (t >= T("m1", 0.5) && t < T("m1", 3.7)) || (t >= T("l5") && t < T("l5", 1.4)) || (t >= T("lower.turn") && t < T("lower.turn", 0.9));
    if (mWalk) {
      const wk = Toon.walk(marcus.c, t * 1.8, 0.32, 0.1);
      m = { ...m, lf: wk.lf, rf: wk.rf, y: m.y + wk.bob, lh: wk.lh };
    }
    const g = film.energy("MARCUS", t);
    if (g > 0.01 && !TR.finger(t) && m.rh[1] > 0) m = { ...m, rh: [m.rh[0] + Math.sin(t * 5.1) * 9 * g, m.rh[1] - Math.abs(Math.sin(t * 3.7)) * 22 * g] };
    marcus.set(m, film.mouth("MARCUS", t), t);
    lanyardText.setAttribute("transform", `translate(5 0) scale(${m.flip < 0 ? -1 : 1} 1) translate(-5 0)`);
    show(props.phone, TR.phoneM(t) > 0.5);
    show(props.finger, TR.finger(t) > 0.5);
    show(props.packet, TR.packet(t) > 0.5);
    const ringing = (t >= T("buzz.buzz") && t < T("buzz.buzz", 1.2)) || (t >= T("ring.ring") && t < T("ring.answer")) || (t >= T("phone2.ring") && t < T("phone2.finger"));
    props.phoneGlow.setAttribute("opacity", ringing ? 0.9 : 0);
    const atEar = m.rh[1] < 0 && !TR.finger(t);
    props.phone.setAttribute("transform", `translate(${((atEar ? -14 : 0) + (ringing ? Math.sin(t * 90) * 1.5 : 0)).toFixed(1)} ${atEar ? -34 : 0})`);
    // the AirPod that falls out stays on him until it does
    const podGone = t >= T("airpod.slip");
    marcus.pods.forEach((p, i) => show(p, !(podGone && i === 1)));

    // Mum and Kid pass through
    const mt0 = T("mum"), mt1 = E("u25", 0.8);
    show(mum.g, t >= mt0 && t < mt1);
    show(kid.g, t >= mt0 && t < mt1);
    if (t >= mt0 && t < mt1) {
      const stop0 = T("mum.stop"), stop1 = T("mum.cover", 0.3);
      const walkT = t < stop0 ? t - mt0 : t < stop1 ? stop0 - mt0 : t - mt0 - (stop1 - stop0);
      const x = -260 + walkT * 330;
      const moving = t < stop0 || t >= stop1;
      const wk = Toon.walk(mum.c, walkT * 1.7, moving ? 0.34 : 0, 0.12);
      const wkK = Toon.walk(kid.c, walkT * 2.6, moving ? 0.4 : 0, 0.18);
      const covering = t >= T("mum.cover");
      const kx = x + 62;
      mum.set({ ...Toon.stand(mum.c), x, y: GROUND + 60 - mum.c.legLen, flip: 1, lf: wk.lf, rf: wk.rf, tilt: covering ? 16 : 0,
        rh: covering ? [44, 150] : [40, 90], lh: wk.lh, e: ex(covering ? "annoyed" : "flat", { px: covering ? 0.3 : 0.8, py: 0.5 }) }, film.mouth("MUM", t), t);
      const pointing = t >= T("mum.point") && t < T("mum.cover");
      kidHood.setAttribute("display", covering ? "inline" : "none");
      kid.set({ ...Toon.stand(kid.c), x: kx, y: GROUND + 72 - kid.c.legLen, flip: 1, lf: wkK.lf, rf: wkK.rf,
        rh: pointing ? [60, -30] : [10, 60], lh: [-20, 60], e: ex(covering ? "neutral" : "shock", { eo: covering ? 0.05 : 1.1, px: 0.8, mo: 0 }) }, 0, t);
    }

    // pigeon: pecks near Marcus, leaves when he is un-blessed, comes back for the showdown
    const pw = t < T("sits.pigeon") ? { x: 1240 + Math.sin(t * 0.4) * 40, flip: Math.sin(t * 0.4 + 1) > 0 ? 1 : -1, walk: t * 2, peck: Math.max(0, Math.sin(t * 2.3)) ** 6 }
      : t < T("pepper") ? { x: 1240 + (t - T("sits.pigeon")) * 260, flip: 1, walk: t * 3.2, peck: 0 }
      : t < T("silence.pigeon") ? { x: 2100 - (t - T("pepper")) * 40, flip: -1, walk: t * 2, peck: Math.max(0, Math.sin(t * 2.1)) ** 6 }
      : { x: 2100 - (T("silence.pigeon") - T("pepper")) * 40, flip: -1, walk: T("silence.pigeon") * 2, peck: 0 };
    pigeon.set({ ...pw, x: Math.min(pw.x, 2200), y: GROUND + 50 });

    // AirPod: falls, bounces three times, rolls in slow motion, finds the drain
    const a = t - T("airpod.slip");
    show(props.airpod, a >= 0 && t < T("airpod.plink"));
    if (a >= 0) {
      const earX = SEATS.C - 26, earY = SEAT - 175 - 12 - 30, floor = GROUND + 60;
      const b = [T("airpod.b1"), T("airpod.b2"), T("airpod.b3"), T("airpod.roll")].map((x) => x - T("airpod.slip"));
      let x, y, r = a * 200;
      if (a < b[0]) { const u = a / b[0]; x = earX + u * 40; y = lerp(earY, floor, u * u); }
      else if (a < b[3]) {
        const k = a < b[1] ? 0 : a < b[2] ? 1 : 2, s0 = b[k], s1 = b[k + 1], u = (a - s0) / (s1 - s0);
        x = earX + 40 + (a - b[0]) * 90; y = floor - Math.sin(u * Math.PI) * [70, 34, 14][k];
      } else {
        const g0 = T("airpod.grate") - T("airpod.slip"), d0 = T("airpod.drop") - T("airpod.slip");
        const x0 = earX + 40 + (b[3] - b[0]) * 90;
        const u = prog(a, b[3], g0, "out");
        x = lerp(x0, DRAIN[0] - 8, u); y = floor + (DRAIN[1] - 6 - floor) * u; r = 400 + u * 900;
        if (a >= g0) { x = DRAIN[0] - 8 + Math.sin((a - g0) * 9) * 3 * (1 - prog(a, g0, d0)); r = 1300 + Math.sin((a - g0) * 9) * 20; }
        if (a >= d0) { const v = a - d0; y = DRAIN[1] - 6 + v * v * 900; }
      }
      props.airpod.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${r.toFixed(0)}) scale(1.4)`);
    }
    if (t >= T("airpod.roll") && t < T("airpod.plink", 0.3)) {
      // the camera follows the pod along the ground
      const fx = Number(props.airpod.getAttribute("transform").match(/translate\(([-\d.]+)/)[1]);
      cam.set({ x: Math.min(fx + 60, DRAIN[0]), y: DRAIN[1] - 40, z: 4.2 });
    }

    // the thread of blessing, drawn out of Marcus's chest
    const tr0 = T("ritual.pinch"), snap = T("ritual.snap"), tuck = T("ritual.tuck");
    const threadOn = t >= tr0 && t < T("ritual.fold1");
    show(props.thread, threadOn);
    const lhx = l.x + l.flip * l.s * leonard.handF[0], lhy = l.y + l.s * leonard.handF[1];
    if (threadOn) {
      const chest = [m.x + m.flip * 14, m.y - 120];
      const loose = t < snap ? chest : [lerp(chest[0], lhx, prog(t, snap, snap + 0.4, "out")), lerp(chest[1], lhy, prog(t, snap, snap + 0.4, "out"))];
      const sag = 30 + 40 * prog(t, tr0, snap) + Math.sin(t * 5) * 8;
      const midx = (loose[0] + lhx) / 2, midy = (loose[1] + lhy) / 2 + sag;
      const dd = `M ${loose[0].toFixed(1)} ${loose[1].toFixed(1)} Q ${(midx + Math.sin(t * 3) * 20).toFixed(1)} ${midy.toFixed(1)} ${lhx.toFixed(1)} ${lhy.toFixed(1)}`;
      props.threadHalo.setAttribute("d", dd);
      props.threadCore.setAttribute("d", dd);
      props.thread.setAttribute("opacity", (0.6 + 0.4 * Math.sin(t * 12) ** 2).toFixed(2));
    }
    const knotOn = t >= T("ritual.fold1") && t < tuck + 0.35;
    show(props.knot, knotOn);
    if (knotOn) {
      const fold = t < T("ritual.fold2") ? 1 : 0.62;
      const into = prog(t, tuck, tuck + 0.35);
      props.knot.setAttribute("transform", `translate(${(lhx - l.flip * 8).toFixed(1)} ${(lhy - 6).toFixed(1)}) rotate(${(t * 40) % 360}) scale(${(fold * (1 - 0.8 * into) * 1.4).toFixed(3)})`);
    }

    // the sun, when stared at
    const glare = hump(t, T("sun.look"), film.D("sun") + 1.6, 0.4);
    props.sunGlare.setAttribute("transform", `translate(${c.x - 1920 / (2 * c.z) + 40} ${c.y - 1080 / (2 * c.z) + 160}) scale(${(2.4 / c.z).toFixed(3)})`);
    props.sunGlare.setAttribute("opacity", (glare * 0.9).toFixed(3));

    // the hubcap comes home
    const h0 = T("crash.hubcap"), h1 = T("crash.settle");
    show(props.hubcap, t >= h0 && t < T("black"));
    if (t >= h0) {
      const u = prog(t, h0, h1, "lin");
      const x = lerp(-140, 760, ease.out(Math.min(1, u * 1.35)));
      const wob = u < 0.7 ? 0 : (u - 0.7) / 0.3;
      const tilt = Math.min(1, wob * 1.1);
      const spin = Math.sin((t - h0) * (8 + 30 * wob)) * (1 - tilt) * 0.3;
      props.hubcap.setAttribute("transform", `translate(${(x + Math.sin((t - h0) * (14 + 40 * wob)) * 10 * wob).toFixed(1)} ${(GROUND + 42 + tilt * 16).toFixed(1)}) scale(${(1 - 0.85 * tilt * (0.6 + 0.4 * Math.abs(Math.sin((t - h0) * 30)))).toFixed(3)} 1) rotate(${((t - h0) * 400 * (1 - tilt)).toFixed(0)}) skewY(${(spin * 40).toFixed(1)})`);
      if (t >= h1) props.hubcap.setAttribute("transform", `translate(760 ${GROUND + 58}) scale(1 0.24)`);
    }

    // inserts ---------------------------------------------------------
    if (insert === "phone") {
      const callName = TR.call(t);
      show(ins.chat, !callName);
      show(ins.call, !!callName);
      if (callName) {
        ins.callName.textContent = callName;
        ins.callInitial.textContent = callName[0];
        const pulse = (t * 1.4) % 1;
        ins.callRing.setAttribute("r", (92 + pulse * 60).toFixed(1));
        ins.callRing.setAttribute("opacity", (0.5 * (1 - pulse)).toFixed(2));
        ins.phoneBody.setAttribute("transform", `translate(${(960 + Math.sin(t * 70) * 3).toFixed(1)} 540) rotate(-3) scale(0.92)`);
      } else {
        ins.phoneBody.setAttribute("transform", "translate(960 540) rotate(-3) scale(0.92)");
        const shows = [T("m24a"), Fr("m24a", 0.52), Fr("m24a", 0.8)];
        ins.bubbles.forEach((b, i) => b.setAttribute("opacity", t >= shows[i] ? 1 : 0));
        const nextIdx = shows.findIndex((s) => t < s);
        ins.typing.setAttribute("opacity", nextIdx >= 0 && t > shows[nextIdx] - 1.4 ? 1 : 0);
        if (nextIdx >= 0) ins.typing.setAttribute("transform", `translate(-186 ${-230 + nextIdx * 120})`);
        ins.dots.forEach((dt, i) => dt.setAttribute("opacity", (0.4 + 0.6 * Math.max(0, Math.sin(t * 8 - i))).toFixed(2)));
      }
    }
    if (insert === "end") {
      const u = prog(t, T("endcard"), T("endcard", 1.2), "out");
      ins.endTitle.setAttribute("opacity", u.toFixed(3));
      ins.endTitle.setAttribute("letter-spacing", (18 + 14 * (1 - u)).toFixed(1));
    }
  };
}
