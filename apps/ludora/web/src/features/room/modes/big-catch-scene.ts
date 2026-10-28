import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  BoxGeometry,
  type Fog,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  RingGeometry,
  type ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { GlimArt } from '@ludora/shared';
import { sizeCm, speciesById, type SpeciesId, type WaterId } from '@ludora/engine/big-catch';
import { DAY, EaseCamera, Glim3D, World, hsl, outline, props, toon, type GlimLook, type Lighting, type StageEnv } from '../../../three/index.ts';
import type { Label } from '../../../three/labels.ts';

/*
 * Big Catch in 3D. A wooden jetty over moving water, with the water's own
 * setting around it: a river with gums, reeds and a muddy bank at golden
 * hour; an estuary with mangroves, sand flats and a channel marker; a reef
 * with turquoise water, a boat and an island far off.
 *
 * An `Angler` is one Glim with a rod, a line and a bobber: it casts, waits,
 * feels the bite, reels in and holds the fish up. The player's scene has one
 * angler at the end of the jetty with a glass tank of their kept fish and a
 * money tin beside them; the big screen lines everyone up along one long
 * jetty. Scenes only draw what the view says happened, and the screens wait
 * for these animations before they put the outcome into words.
 */

/** How long after the view says "landed" the fish is up in the air and the screen may name it (ms). */
export const LEAP_MS = 1100;
/** How long a sell or tank takes to play once the fish is held (ms). */
export const RESOLVE_MS = 650;
/** How long a fish that got away (or was scared off) takes to show (ms). */
export const MISS_MS = 450;

export const DECK = 0.55;

/* ---------------------------------- looks --------------------------------- */

const RIVER: Lighting = { skyTop: '#4f7fd6', horizon: '#ffcf96', ground: '#5d5a3a', sun: '#ffd49c', sunIntensity: 2.4, fill: 1.1, sunFrom: [-7, 6, 5], fogNear: 30, fogFar: 110 };
const ESTUARY: Lighting = { ...DAY, horizon: '#d9f1ff', ground: '#8a8a5a', fogNear: 35, fogFar: 130 };
const REEF: Lighting = { skyTop: '#2f8fff', horizon: '#c4efff', ground: '#6a9aa8', sun: '#fff6e2', sunIntensity: 2.8, fill: 1.3, sunFrom: [6, 10, 4], fogNear: 40, fogFar: 150 };

const LOOK: Record<WaterId, { light: Lighting; shallow: string; deep: string }> = {
  river: { light: RIVER, shallow: '#6f8f55', deep: '#3e5a38' },
  estuary: { light: ESTUARY, shallow: '#3fb8a6', deep: '#1f6f78' },
  reef: { light: REEF, shallow: '#3fe0d6', deep: '#178fc0' },
};

/* -------------------------------- geometry -------------------------------- */

const G = {
  ball: new SphereGeometry(0.5, 16, 12),
  small: new SphereGeometry(0.5, 10, 8),
  fin: new ConeGeometry(0.5, 1, 3),
  stick: new CylinderGeometry(0.5, 0.5, 1, 6),
  box: new BoxGeometry(1, 1, 1),
  plank: new BoxGeometry(0.44, 0.1, 1.7),
  post: new CylinderGeometry(0.09, 0.1, 1, 7).translate(0, 0.5, 0),
  rod: new CylinderGeometry(0.012, 0.024, 1.4, 6).translate(0, 0.7, 0),
  grip: new CylinderGeometry(0.034, 0.034, 0.32, 8).translate(0, 0.16, 0),
  bobTop: new SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  bobBottom: new SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  ring: new RingGeometry(0.82, 1, 28).rotateX(-Math.PI / 2),
  shadow: new CircleGeometry(0.5, 12).rotateX(-Math.PI / 2),
  reed: new ConeGeometry(0.025, 1, 4).translate(0, 0.5, 0),
  disc: new CylinderGeometry(1, 1, 1, 24),
};
for (const g of Object.values(G)) g.computeBoundingSphere();

function part(geo: BufferGeometry, colour: string | Color, s: [number, number, number], p: [number, number, number] = [0, 0, 0], r: [number, number, number] = [0, 0, 0], glow = 0): Mesh {
  const m = new Mesh(geo, toon(colour, { glow }));
  m.userData.sharedGeometry = true;
  m.scale.set(...s);
  m.position.set(...p);
  m.rotation.set(...r);
  return m;
}

/* ---------------------------------- fish ---------------------------------- */

/**
 * A stylised fish (or crab, or yabby) from the species' hints, one metre long
 * along +x with its head forward. Scale the group to the size you want.
 */
export function fishModel(speciesId: SpeciesId, o: { ink?: boolean } = {}): Group {
  const sp = speciesById(speciesId);
  const hue = sp?.hue ?? 30;
  const legend = sp?.rarity === 'legend';
  const glow = legend ? 0.45 : 0;
  const body = hsl(hue, 58, legend ? 62 : 52);
  const finC = hsl(hue, 55, 36);
  const g = new Group();
  const eyes = (x: number, y: number, z: number, size = 0.1) => {
    for (const side of [-1, 1]) {
      g.add(part(G.small, '#ffffff', [size, size, size], [x, y, side * z]));
      g.add(part(G.small, '#141022', [size * 0.55, size * 0.55, size * 0.55], [x + size * 0.25, y, side * (z + size * 0.25)]));
    }
  };
  let main: Mesh;
  switch (sp?.shape ?? 'fish') {
    case 'crab': {
      main = part(G.ball, body, [0.62, 0.28, 0.82], [0, 0, 0], [0, 0, 0], glow);
      g.add(main);
      for (const side of [-1, 1]) {
        g.add(part(G.small, body, [0.3, 0.16, 0.2], [0.42, 0.04, side * 0.38]));
        g.add(part(G.small, finC, [0.14, 0.1, 0.12], [0.56, 0.04, side * 0.3]));
        for (let i = 0; i < 3; i++) g.add(part(G.stick, finC, [0.035, 0.42, 0.035], [-0.12 + i * 0.16, -0.08, side * 0.46], [side * 1.05, 0, 0]));
        g.add(part(G.stick, finC, [0.025, 0.12, 0.025], [0.26, 0.16, side * 0.1]));
      }
      eyes(0.27, 0.23, 0.1, 0.08);
      break;
    }
    case 'crayfish': {
      main = part(G.ball, body, [0.42, 0.26, 0.26], [0.18, 0, 0], [0, 0, 0], glow);
      g.add(main);
      for (const [x, s] of [
        [-0.08, 0.22],
        [-0.25, 0.19],
        [-0.39, 0.16],
      ] as const)
        g.add(part(G.ball, body, [0.2, s, s * 1.05], [x, -0.01, 0]));
      g.add(part(G.fin, finC, [0.3, 0.2, 0.06], [-0.55, -0.01, 0], [Math.PI / 2, 0, -Math.PI / 2]));
      for (const side of [-1, 1]) {
        g.add(part(G.stick, finC, [0.04, 0.3, 0.04], [0.42, 0, side * 0.12], [0, 0, -Math.PI / 2]));
        g.add(part(G.small, body, [0.3, 0.12, 0.17], [0.66, 0, side * 0.17]));
        g.add(part(G.stick, finC, [0.012, 0.5, 0.012], [0.55, 0.08, side * 0.06], [side * 0.3, 0, -1.2]));
      }
      eyes(0.36, 0.1, 0.07, 0.06);
      break;
    }
    case 'flatfish': {
      main = part(G.ball, body, [1, 0.2, 0.44], [0, 0, 0], [0, 0, 0], glow);
      g.add(main);
      g.add(part(G.fin, finC, [0.3, 0.32, 0.05], [-0.6, 0, 0], [Math.PI / 2, 0, -Math.PI / 2]));
      eyes(0.3, 0.09, 0.07, 0.08);
      break;
    }
    default: {
      main = part(G.ball, body, [1, 0.42, 0.26], [0, 0, 0], [0, 0, 0], glow);
      g.add(main);
      g.add(part(G.ball, hsl(hue, 30, 82), [0.8, 0.2, 0.2], [0.02, -0.1, 0]));
      g.add(part(G.fin, finC, [0.34, 0.36, 0.05], [-0.62, 0, 0], [0, 0, -Math.PI / 2]));
      g.add(part(G.fin, finC, [0.24, 0.2, 0.04], [-0.04, 0.24, 0], [0, 0, 0.35]));
      eyes(0.31, 0.06, 0.1, 0.09);
      if (sp?.shape === 'catfish') {
        for (const side of [-1, 1]) {
          g.add(part(G.stick, finC, [0.012, 0.32, 0.012], [0.56, -0.04, side * 0.07], [side * 0.5, 0, Math.PI / 2 - 0.3]));
          g.add(part(G.stick, finC, [0.012, 0.26, 0.012], [0.52, -0.1, side * 0.05], [side * 0.3, 0, Math.PI / 2 + 0.4]));
        }
      }
    }
  }
  if (o.ink) outline(main, '#141022', 0.02);
  for (const c of g.children) c.castShadow = false;
  return g;
}

/** How long a fish looks on screen (metres): true to its size, but never too small to see or too big for the jetty. */
export function shownLength(cm: number, k = 1.25, max = 1.7): number {
  return Math.max(0.32, Math.min(max, (cm / 100) * k));
}

/* ------------------------------- the jetty -------------------------------- */

/** A jetty along x from `from` to `to`, its deck at DECK, as two instanced meshes (planks and posts). */
function jetty(from: number, to: number): Group {
  const g = new Group();
  const n = Math.ceil((to - from) / 0.47);
  const planks = new InstancedMesh(G.plank, toon('#ffffff'), n);
  planks.userData.sharedGeometry = true;
  const m = new Matrix4();
  const c = new Color();
  for (let i = 0; i < n; i++) {
    m.makeTranslation(from + 0.235 + i * 0.47, DECK - 0.05, ((i * 7) % 3) * 0.01);
    planks.setMatrixAt(i, m);
    planks.setColorAt(i, c.set(i % 3 === 0 ? '#b98652' : i % 3 === 1 ? '#a87444' : '#c4925e'));
  }
  planks.receiveShadow = true;
  planks.castShadow = true;
  g.add(planks);
  const spots: number[] = [];
  for (let x = to - 0.2; x > from; x -= 2) spots.push(x);
  const posts = new InstancedMesh(G.post, toon('#6a4426'), spots.length * 2);
  posts.userData.sharedGeometry = true;
  spots.forEach((x, i) => {
    for (const side of [0, 1]) {
      m.compose(new Vector3(x, -1.2, side ? 0.78 : -0.78), new Quaternion(), new Vector3(1, DECK + 1.25, 1));
      posts.setMatrixAt(i * 2 + side, m);
    }
  });
  g.add(posts);
  // A low rail along the back edge, so the deck reads as a jetty from far off.
  const rail = part(G.box, '#8a5a2c', [to - from, 0.07, 0.07], [(from + to) / 2, DECK + 0.45, -0.8]);
  g.add(rail);
  return g;
}

/* ------------------------------ the waterside ----------------------------- */

function mangrove(scale: number, ink: boolean): Group {
  const g = new Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    g.add(part(G.stick, '#6d5a44', [0.05, 0.9, 0.05], [Math.cos(a) * 0.32, 0.4, Math.sin(a) * 0.32], [Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45]));
  }
  g.add(part(G.stick, '#6d5a44', [0.08, 1, 0.08], [0, 1, 0]));
  const canopy = props.bush({ color: '#2f6b3a', ink, scale: 1.2 });
  canopy.position.y = 1.35;
  g.add(canopy);
  g.scale.setScalar(scale);
  return g;
}

function reeds(rnd: () => number): Group {
  const g = new Group();
  for (let i = 0; i < 4; i++) {
    const r = part(G.reed, i % 2 ? '#8aa04a' : '#a8b45a', [1, 0.7 + rnd() * 0.6, 1], [(rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.4], [(rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3]);
    g.add(r);
  }
  return g;
}

function boat(ink: boolean): Group {
  const g = new Group();
  const hull = part(G.box, '#f4f1ea', [2.6, 0.55, 1.1], [0, 0.18, 0]);
  g.add(hull);
  g.add(part(G.fin, '#f4f1ea', [0.55, 0.9, 0.55], [1.5, 0.18, 0], [0, Math.PI / 4, -Math.PI / 2]));
  g.add(part(G.box, '#2a76c8', [2.62, 0.1, 1.12], [0, 0.3, 0]));
  g.add(part(G.box, '#e6e1d4', [1, 0.6, 0.8], [-0.4, 0.75, 0]));
  g.add(part(G.box, '#3a4a66', [0.06, 0.25, 0.6], [0.11, 0.85, 0]));
  if (ink) outline(hull, '#141022', 0.02);
  return g;
}

export class Waterside {
  readonly group = new Group();
  private sets: Record<WaterId, Group>;
  private water: Mesh & { time: (t: number) => void };
  private boatG: Group | null = null;
  current: WaterId | null = null;

  constructor(
    private readonly world: World,
    span: number,
  ) {
    const q = world.env.quality;
    // Far scenery goes without outlines (they would double its draw calls for lines too thin to see).
    const ink = false;
    const rnd = props.seeded(17);
    const many = Math.min(26, Math.round(span * 0.7) + 6) - (q.tier === 'low' ? 5 : 0);
    // Fine enough that the wave bands read as ripples rather than big flat facets near the camera.
    this.water = props.water(span * 2 + 50, 46, { calm: true, segments: q.tier === 'low' ? 56 : 90 });
    this.water.position.set(0, 0, -4);
    this.group.add(this.water);

    // The river: a far bank of gums and reeds, a muddy edge, and a log in the water.
    const river = new Group();
    const bank = props.ground(span * 2 + 90, 40, '#6f8f45');
    bank.position.set(0, 0.06, -30);
    river.add(bank);
    const mud = props.ground(span * 2 + 90, 2.6, '#7a5a3a');
    mud.position.set(0, 0.04, -9.6);
    river.add(mud);
    for (let i = 0; i < many; i++) {
      const t = props.tree(i % 5 === 0 ? 'round' : 'gum', { ink, scale: 0.9 + rnd() * 0.7 });
      t.position.set(-span - 14 + rnd() * (span * 2 + 28), 0.06, -12 - rnd() * 14);
      river.add(t);
    }
    for (let i = 0; i < Math.round(many * 0.7); i++) {
      const r = reeds(rnd);
      r.position.set(-span - 12 + rnd() * (span * 2 + 24), 0, -8.4 - rnd() * 1.2);
      river.add(r);
    }
    for (const x of [-2.2, -3.1, -4.4]) {
      const r = reeds(rnd);
      r.position.set(x, 0, 1.2 + rnd());
      river.add(r);
    }
    const log = part(G.stick, '#6a4a2e', [0.28, 2.6, 0.28], [5.5, 0.05, -3.5], [0, 0.4, Math.PI / 2]);
    river.add(log);

    // The estuary: mangroves on the far shore, sand flats, and a channel marker.
    const estuary = new Group();
    const shore = props.ground(span * 2 + 90, 40, '#d9c890');
    shore.position.set(0, 0.05, -31);
    estuary.add(shore);
    for (let i = 0; i < many; i++) {
      const m = mangrove(0.9 + rnd() * 0.6, ink);
      m.position.set(-span - 14 + rnd() * (span * 2 + 28), 0, -10.5 - rnd() * 6);
      estuary.add(m);
    }
    for (const [x, z, w, d] of [
      [-6.5, -4.5, 6, 2.4],
      [6.5, -6, 5, 2],
      [-span - 2, -2, 5, 2.5],
    ] as const) {
      const flat = part(G.disc, '#e9dcaa', [w / 2, 0.04, d / 2], [x, 0.02, z]);
      estuary.add(flat);
    }
    const marker = (colour: string, x: number, z: number) => {
      const m = new Group();
      m.add(part(G.stick, colour, [0.14, 2.2, 0.14], [0, 0.6, 0]));
      m.add(part(G.stick, colour, [0.36, 0.5, 0.36], [0, 1.9, 0], [0, 0, 0], 0.15));
      m.add(part(G.box, '#f4f1ea', [0.38, 0.1, 0.38], [0, 1.55, 0]));
      m.position.set(x, 0, z);
      estuary.add(m);
    };
    marker('#d63a3a', 4.6, -4.2);
    marker('#2f9e5a', -span - 3, -4.5);

    // The reef: open turquoise water, rocks, a boat, and an island far off.
    const reef = new Group();
    const island = part(G.ball, '#e9d9a0', [26, 5, 12], [12, -1.2, -55]);
    reef.add(island);
    const green = part(G.ball, '#4f9d4a', [16, 4, 7], [12, 0.4, -56]);
    reef.add(green);
    for (let i = 0; i < 6; i++) {
      const palm = props.tree('palm', { ink: false, scale: 1.6 + rnd() * 0.6 });
      palm.position.set(2 + i * 3.4 + rnd(), 1.2, -50 - rnd() * 3);
      reef.add(palm);
    }
    for (const [x, z, s] of [
      [6, -5, 0.6],
      [-7, -7, 0.8],
      [9, -9, 0.5],
    ] as const) {
      const r = props.rock({ ink, scale: s, seed: Math.round(x * 3 + z), color: '#8a8478' });
      r.position.set(x, -0.05, z);
      reef.add(r);
    }
    this.boatG = boat(ink);
    this.boatG.position.set(-5.5, 0, -9);
    this.boatG.rotation.y = 0.5;
    reef.add(this.boatG);

    this.sets = { river, estuary, reef };
    for (const s of Object.values(this.sets)) {
      s.visible = false;
      this.group.add(s);
    }
  }

  /** Show a water: its scenery, its colours and its light. */
  set(water: WaterId) {
    if (this.current === water) return;
    this.current = water;
    for (const [id, g] of Object.entries(this.sets)) g.visible = id === water;
    const look = LOOK[water];
    const mat = this.water.material as ShaderMaterial;
    (mat.uniforms.uColor!.value as Color).set(look.shallow);
    (mat.uniforms.uDeep!.value as Color).set(look.deep);
    const l = look.light;
    const w = this.world;
    w.fill.color.set(l.skyTop);
    w.fill.groundColor.set(l.ground);
    w.fill.intensity = l.fill;
    w.sun.color.set(l.sun);
    w.sun.intensity = l.sunIntensity;
    const fog = w.scene.fog as Fog | null;
    if (fog) {
      fog.color.set(l.horizon);
      fog.near = l.fogNear ?? 30;
      fog.far = l.fogFar ?? 120;
    }
    const sky = w.scene.getObjectByName('sky') as Mesh | undefined;
    const u = (sky?.material as ShaderMaterial | undefined)?.uniforms;
    if (u) {
      (u.top!.value as Color).set(l.skyTop);
      (u.horizon!.value as Color).set(l.horizon);
      (u.bottom!.value as Color).set(l.ground);
    }
  }

  tick(t: number) {
    this.water.time(t);
    if (this.boatG && this.current === 'reef' && !this.world.env.reducedMotion) {
      this.boatG.position.y = Math.sin(t * 1.1) * 0.06;
      this.boatG.rotation.z = Math.sin(t * 0.9) * 0.03;
    }
  }
}

/* --------------------------------- shadows -------------------------------- */

/** Little fish shadows drifting under the surface, all in one instanced mesh. */
class Shadows {
  readonly mesh: InstancedMesh;
  private fish: { cx: number; cz: number; r: number; a: number; speed: number; size: number }[] = [];
  private m = new Matrix4();
  private q = new Quaternion();
  private up = new Vector3(0, 1, 0);
  private at = new Vector3();
  private size = new Vector3();

  constructor(count: number, area: { x: [number, number]; z: [number, number] }, seed: number) {
    const mat = new MeshBasicMaterial({ color: '#08131f', transparent: true, opacity: 0.38, depthWrite: false });
    this.mesh = new InstancedMesh(G.shadow, mat, count);
    this.mesh.userData.sharedGeometry = true;
    this.mesh.renderOrder = 1;
    const rnd = props.seeded(seed);
    for (let i = 0; i < count; i++) {
      this.fish.push({ cx: area.x[0] + rnd() * (area.x[1] - area.x[0]), cz: area.z[0] + rnd() * (area.z[1] - area.z[0]), r: 0.5 + rnd() * 1.4, a: rnd() * Math.PI * 2, speed: (0.25 + rnd() * 0.35) * (rnd() < 0.5 ? -1 : 1), size: 0.3 + rnd() * 0.35 });
    }
    this.place(0, 1);
  }

  /** `pace` speeds them up (Feeding Time); `shown` is how many swim (a Passing School brings them all). */
  place(dt: number, pace: number, shown = this.fish.length) {
    this.fish.forEach((f, i) => {
      f.a += dt * f.speed * pace;
      const x = f.cx + Math.cos(f.a) * f.r;
      const z = f.cz + Math.sin(f.a) * f.r;
      this.q.setFromAxisAngle(this.up, -f.a - (f.speed > 0 ? 0 : Math.PI));
      const s = i < shown ? f.size : 0.0001;
      this.m.compose(this.at.set(x, 0.035, z), this.q, this.size.set(s * 1.8, 1, s * 0.7));
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* --------------------------------- anglers -------------------------------- */

export type Phase = 'idle' | 'waiting' | 'biting' | 'landed';

export interface HeldFish {
  id: number;
  species: SpeciesId;
  grams: number;
  cm: number;
  perfect: boolean;
}

interface Step {
  at: number;
  run: () => void;
}

const REST = 0.85;
const LINE_POINTS = 18;
const tmp = new Vector3();
const tmp2 = new Vector3();
const tmp3 = new Vector3();

function weightText(grams: number) {
  return grams < 1000 ? `${Math.max(10, Math.round(grams / 10) * 10)} g` : `${(grams / 1000).toFixed(1)} kg`;
}

export interface AnglerOptions {
  look: GlimLook;
  scale: number;
  /** Which way the Glim faces, in radians (0 is towards +z, the camera). */
  yaw: number;
  /** Where the bobber lands, in the angler's own coordinates (the water is at -DECK). */
  castTo: Vector3;
  /** The player's own: bigger labels, a face for every moment. */
  mine: boolean;
}

/** One Glim fishing: rod, line, bobber, splash ring and the fish once landed. */
export class Angler {
  readonly group = new Group();
  readonly glim: Glim3D;
  phase: Phase = 'idle';
  held: { fish: Group; info: HeldFish; t: number; from: Vector3; label: Label | null } | null = null;
  private pivot = new Group();
  private tip = new Object3D();
  private bobber = new Group();
  private line: Line;
  private linePos: BufferAttribute;
  private ring: Mesh;
  private ringMat: MeshBasicMaterial;
  private ringT = -1;
  private steps: Step[] = [];
  private time = 0;
  private bob: 'hang' | 'flying' | 'float' | 'plunge' | 'gone' | 'retract' = 'hang';
  private bobFrom = new Vector3();
  private bobT = 0;
  private rod = REST;
  private rodWant = REST;
  private tight = 0;
  private biteLabel: Label | null = null;
  private calm: boolean;
  private surf = new Vector3();

  constructor(
    private readonly world: World,
    private readonly o: AnglerOptions,
  ) {
    const q = world.env.quality;
    this.calm = world.env.reducedMotion;
    this.glim = new Glim3D({ look: o.look, quality: q, reducedMotion: world.env.reducedMotion });
    this.glim.scale.setScalar(o.scale);
    this.glim.rotation.y = o.yaw;
    this.group.add(this.glim);

    // The rod, in the Glim's hand, pointing up and out over the water.
    this.pivot.position.set(0.26, 0.34, 0.12);
    const rod = new Mesh(G.rod, toon('#3a2a24'));
    rod.userData.sharedGeometry = true;
    const grip = new Mesh(G.grip, toon('#c89a6a'));
    grip.userData.sharedGeometry = true;
    grip.position.y = -0.1;
    this.pivot.add(rod, grip);
    this.tip.position.set(0, 1.4, 0);
    this.pivot.add(this.tip);
    this.pivot.rotation.set(REST, 0, -0.18);
    this.glim.add(this.pivot);

    const top = new Mesh(G.bobTop, toon('#ff3b4e', { glow: 0.15 }));
    const bottom = new Mesh(G.bobBottom, toon('#fbf7ee'));
    top.userData.sharedGeometry = bottom.userData.sharedGeometry = true;
    this.bobber.add(top, bottom);
    this.bobber.scale.setScalar(o.mine ? 1.25 : 1.1);
    this.group.add(this.bobber);

    const geo = new BufferGeometry();
    this.linePos = new BufferAttribute(new Float32Array(LINE_POINTS * 3), 3);
    geo.setAttribute('position', this.linePos);
    this.line = new Line(geo, new LineBasicMaterial({ color: '#f4f1ea', transparent: true, opacity: 0.85 }));
    this.line.frustumCulled = false;
    this.group.add(this.line);

    this.ringMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
    this.ring = new Mesh(G.ring, this.ringMat);
    this.ring.userData.sharedGeometry = true;
    this.ring.visible = false;
    this.ring.renderOrder = 2;
    this.group.add(this.ring);
    this.update(0);
  }

  private later(seconds: number, run: () => void) {
    this.steps.push({ at: this.time + seconds, run });
  }

  /** The water's surface under the bobber, in the angler's coordinates. */
  private get surface(): Vector3 {
    return this.surf.set(this.o.castTo.x, -DECK + 0.03, this.o.castTo.z);
  }

  private worldOf(local: Vector3): Vector3 {
    return local.clone().applyMatrix4(this.group.matrixWorld);
  }

  /** Where the bobber is now, in world coordinates. */
  bobberWorld(): Vector3 {
    return this.bobber.getWorldPosition(new Vector3());
  }

  private tipLocal(out: Vector3): Vector3 {
    this.tip.getWorldPosition(out);
    return this.group.worldToLocal(out);
  }

  /** Go straight to a state with no animation (first sight of a game in progress). */
  snap(phase: Phase, fish: HeldFish | null) {
    this.steps = [];
    this.clearHeld();
    this.phase = phase;
    this.ringT = phase === 'biting' ? 0 : -1;
    this.bob = phase === 'waiting' ? 'float' : phase === 'biting' ? 'plunge' : phase === 'landed' ? 'gone' : 'hang';
    this.rodWant = phase === 'landed' ? 0.35 : REST;
    if (phase === 'landed' && fish) this.hold(fish, true);
  }

  /** Cast: wind up, flick, and the bobber flies out and lands with a splash. `thenBite` plays the bite straight after. */
  cast(thenBite = false) {
    this.steps = [];
    this.clearHeld();
    this.removeBiteLabel();
    this.phase = 'waiting';
    this.ringT = -1;
    this.glim.play('cast');
    this.rodWant = -0.5;
    this.tight = 0;
    this.later(0.28, () => {
      this.rodWant = 1.25;
      this.bobFrom.copy(this.bobber.position);
      this.bob = 'flying';
      this.bobT = 0;
    });
    this.later(0.9, () => {
      this.rodWant = REST;
      this.bob = 'float';
      this.world.fx.burst(this.worldOf(this.surface.clone()), { color: ['#ffffff', '#bfe9ff'], shape: 'dot', count: 14, speed: 1.6, gravity: 6, size: 0.08, life: 0.7 });
      if (thenBite) this.bite();
    });
  }

  /** The fish bites: the bobber plunges, rings spread and the Glim jumps. */
  bite() {
    if (this.bob === 'flying') {
      this.later(0.65, () => this.bite());
      return;
    }
    this.phase = 'biting';
    this.bob = 'plunge';
    this.ringT = 0;
    this.rodWant = 1.15;
    this.glim.setExpression('surprised', 1.6);
    this.world.fx.burst(this.worldOf(this.surface.clone()), { color: ['#ffffff', '#bfe9ff'], shape: 'dot', count: 22, speed: 2.2, gravity: 7, size: 0.09, life: 0.8 });
    this.removeBiteLabel();
    this.biteLabel = this.world.labels.add(this.bobber, 'Bite!', { offsetY: 0.35, className: this.o.mine ? 'big tone-bad' : 'small tone-bad' });
  }

  private removeBiteLabel() {
    this.world.labels.remove(this.biteLabel);
    this.biteLabel = null;
  }

  /** Reel in: the line goes tight, the fish leaps out and is held up high. */
  land(fish: HeldFish, onShown?: () => void) {
    this.steps = [];
    this.removeBiteLabel();
    this.phase = 'landed';
    this.ringT = -1;
    this.glim.play('reel');
    this.tight = 1;
    this.rodWant = 0.9;
    this.later(0.45, () => {
      this.rodWant = 0.2;
      const at = this.worldOf(this.surface.clone());
      this.world.fx.burst(at, { color: ['#ffffff', '#bfe9ff'], shape: 'dot', count: 30, speed: 2.8, gravity: 8, size: 0.1, life: 0.9 });
      this.bob = 'gone';
      this.hold(fish, false);
    });
    this.later(LEAP_MS / 1000, () => {
      this.glim.play(fish.perfect ? 'celebrate' : 'cheer');
      this.glim.setExpression('happy', 2.2);
      this.rodWant = 0.35;
      if (fish.perfect && this.held) {
        this.world.fx.burst(this.held.fish.getWorldPosition(new Vector3()), { color: ['#ffd25a', '#fff1a8', '#ffffff'], shape: 'star', glow: true, count: 40, speed: 3.2, gravity: 1 });
      }
      onShown?.();
    });
    this.later(LEAP_MS / 1000 + 1.4, () => this.glim.play('idle'));
  }

  private hold(fish: HeldFish, snap: boolean) {
    this.clearHeld();
    const mesh = fishModel(fish.species, { ink: this.world.env.quality.outlines && this.o.mine });
    // On the big screen anglers stand close together, so even a giant stays within its own spot.
    mesh.scale.setScalar(this.o.mine ? shownLength(fish.cm, 1.25) : shownLength(fish.cm, 1, 1.05));
    const from = this.surface.clone();
    mesh.position.copy(snap ? this.holdPoint() : from);
    this.group.add(mesh);
    const sp = speciesById(fish.species);
    const big = sp?.rarity === 'rare' || sp?.rarity === 'legend';
    const text = this.o.mine ? `${sp?.name ?? 'Fish'} · ${weightText(fish.grams)}` : weightText(fish.grams);
    const label = this.world.labels.add(mesh, text, { offsetY: 0.45, className: this.o.mine ? `${big ? 'big tone-gold' : 'tone-gold'}` : 'small tone-gold' });
    label.visible = snap;
    this.held = { fish: mesh, info: fish, t: snap ? 9 : 0, from, label };
  }

  private holdPoint(): Vector3 {
    // On the big screen the fish goes higher, clear of the name tags.
    return new Vector3(0.05, (this.o.mine ? 1.3 : 1.75) * this.o.scale, 0.3);
  }

  /** Hand over the held fish (to be sold or tanked): the caller animates it from here. */
  takeHeld(): { fish: Group; info: HeldFish } | null {
    if (!this.held) return null;
    const { fish, info, label } = this.held;
    this.world.labels.remove(label);
    this.held = null;
    this.phase = 'idle';
    this.bob = 'retract';
    this.bobT = 0;
    this.bobFrom.copy(this.holdPoint());
    this.tight = 0;
    this.rodWant = REST;
    return { fish, info };
  }

  /** Let the fish go with no fuss (the big screen, when a catch is gone). */
  dropHeld() {
    const h = this.takeHeld();
    if (!h) return;
    this.world.fx.burst(h.fish.getWorldPosition(new Vector3()), { color: ['#ffd25a', '#fff1a8'], shape: 'star', glow: true, count: 10, speed: 1.6 });
    h.fish.removeFromParent();
  }

  private clearHeld() {
    if (!this.held) return;
    this.world.labels.remove(this.held.label);
    this.held.fish.removeFromParent();
    this.held = null;
  }

  /** It got away, or was scared off: a splash, the bobber springs back, and a sad face. */
  miss() {
    this.steps = [];
    this.removeBiteLabel();
    this.phase = 'idle';
    this.ringT = -1;
    this.world.fx.burst(this.worldOf(this.surface.clone()), { color: ['#ffffff', '#bfe9ff'], shape: 'dot', count: 26, speed: 2.4, gravity: 7, size: 0.1, life: 0.8 });
    this.glim.play('idle');
    this.glim.setExpression('sad', 2);
    this.bob = 'retract';
    this.bobT = 0;
    this.bobFrom.copy(this.bobber.position);
    this.tight = 0;
    this.rodWant = REST;
  }

  update(dt: number) {
    this.time += dt;
    for (let i = this.steps.length - 1; i >= 0; i--) {
      const s = this.steps[i]!;
      if (this.time >= s.at) {
        this.steps.splice(i, 1);
        s.run();
      }
    }
    // The rod eases to where it wants to be, with a twitch while a fish is on.
    this.rod += (this.rodWant - this.rod) * Math.min(1, dt * 12);
    const twitch = this.phase === 'biting' && !this.calm ? Math.sin(this.time * 30) * 0.06 : 0;
    this.pivot.rotation.x = this.rod + twitch;

    const tip = this.tipLocal(tmp);
    const surface = this.surface;
    switch (this.bob) {
      case 'hang':
        this.bobber.position.set(tip.x, tip.y - 0.3, tip.z);
        this.bobber.visible = true;
        break;
      case 'flying': {
        this.bobT += dt / 0.6;
        const k = Math.min(1, this.bobT);
        this.bobber.position.lerpVectors(this.bobFrom, surface, k);
        this.bobber.position.y += Math.sin(k * Math.PI) * 1.3;
        break;
      }
      case 'float':
        this.bobber.position.set(surface.x, surface.y + (this.calm ? 0 : Math.sin(this.time * 2.4) * 0.025), surface.z);
        this.bobber.visible = true;
        break;
      case 'plunge':
        this.bobber.position.set(surface.x + (this.calm ? 0 : Math.sin(this.time * 23) * 0.02), surface.y - 0.09 + (this.calm ? 0 : Math.sin(this.time * 17) * 0.03), surface.z);
        this.bobber.visible = true;
        break;
      case 'gone':
        this.bobber.visible = false;
        break;
      case 'retract': {
        this.bobT += dt / 0.5;
        const k = Math.min(1, this.bobT);
        this.bobber.visible = true;
        this.bobber.position.lerpVectors(this.bobFrom, tmp2.set(tip.x, tip.y - 0.3, tip.z), k);
        this.bobber.position.y += Math.sin(k * Math.PI) * 0.5;
        if (k >= 1) this.bob = 'hang';
        break;
      }
    }

    // The line: from the rod tip to the bobber (or the fish), sagging unless it is tight.
    // While a fish is on, the line runs to it (it hangs from the line when held up).
    const end = this.held ? tmp3.copy(this.held.fish.position).setY(this.held.fish.position.y + 0.12 * this.held.fish.scale.x) : this.bobber.position;
    const showLine = this.bob !== 'gone' || this.held !== null;
    this.line.visible = showLine;
    if (showLine) {
      const sag = this.bob === 'hang' || this.bob === 'retract' ? 0.05 : 0.55 * (1 - this.tight) + 0.04;
      const pos = this.linePos.array as Float32Array;
      for (let i = 0; i < LINE_POINTS; i++) {
        const k = i / (LINE_POINTS - 1);
        const x = tip.x + (end.x - tip.x) * k;
        const z = tip.z + (end.z - tip.z) * k;
        const y = tip.y + (end.y + 0.06 - tip.y) * k - Math.sin(k * Math.PI) * sag;
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;
      }
      this.linePos.needsUpdate = true;
    }

    // Rings spread from the bobber while a fish is biting.
    if (this.ringT >= 0) {
      this.ringT += dt;
      const k = (this.ringT % 0.8) / 0.8;
      this.ring.visible = true;
      this.ring.position.set(surface.x, -DECK + 0.045, surface.z);
      this.ring.scale.setScalar(0.12 + k * (this.calm ? 0.35 : 0.6));
      this.ringMat.opacity = 0.85 * (1 - k);
    } else this.ring.visible = false;

    // The fish: out of the water in an arc, then held high, wriggling.
    if (this.held) {
      const h = this.held;
      h.t += dt;
      const up = this.holdPoint();
      const k = Math.min(1, h.t / 0.65);
      if (k < 1) {
        h.fish.position.lerpVectors(h.from, up, k);
        h.fish.position.y += Math.sin(k * Math.PI) * 0.9;
        h.fish.rotation.set(0, k * Math.PI * 2, Math.sin(k * Math.PI) * 0.6);
      } else {
        if (h.label && !h.label.visible) h.label.visible = true;
        h.fish.position.copy(up);
        h.fish.position.y += this.calm ? 0 : Math.sin(this.time * 3) * 0.04;
        h.fish.rotation.set(0, 0.15 + (this.calm ? 0 : Math.sin(this.time * 7) * 0.25), this.calm ? 0 : Math.sin(this.time * 5) * 0.12);
      }
    }
    this.glim.update(dt);
  }

  dispose() {
    this.removeBiteLabel();
    this.clearHeld();
    this.ringMat.dispose();
    (this.line.material as LineBasicMaterial).dispose();
    this.line.geometry.dispose();
    this.glim.dispose();
    this.group.removeFromParent();
  }
}

/* ---------------------------------- tank ---------------------------------- */

/** A little glass tank on the jetty, with the player's kept fish swimming in it. */
class Tank {
  readonly group = new Group();
  private swimmers: { id: number; mesh: Group; a: number; speed: number; r: number; y: number }[] = [];
  private inner = new Group();

  constructor(
    private readonly calm: boolean,
    ink: boolean,
  ) {
    const W = 0.95;
    const H = 0.6;
    const D = 0.5;
    this.group.add(part(G.box, '#e8d49a', [W - 0.04, 0.05, D - 0.04], [0, 0.03, 0]));
    const water = part(G.box, '#41b8ea', [W - 0.04, H * 0.78, D - 0.04], [0, H * 0.42, 0]);
    water.material = toon('#41b8ea', { opacity: 0.32 });
    water.renderOrder = 3;
    this.group.add(water);
    const glass = part(G.box, '#dff4ff', [W, H, D], [0, H / 2, 0]);
    glass.material = toon('#dff4ff', { opacity: 0.18 });
    glass.renderOrder = 4;
    this.group.add(glass);
    for (const z of [-D / 2, D / 2]) this.group.add(part(G.box, '#2e2a3a', [W + 0.02, 0.04, 0.04], [0, H, z]));
    for (const x of [-W / 2, W / 2]) this.group.add(part(G.box, '#2e2a3a', [0.04, 0.04, D + 0.02], [x, H, 0]));
    for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) this.group.add(part(G.box, '#2e2a3a', [0.035, H, 0.035], [x, H / 2, z]));
    const weed = part(G.reed, '#3faa5a', [1.6, 0.42, 1.6], [-0.3, 0.05, -0.1]);
    this.group.add(weed);
    if (ink) outline(glass, '#141022', 0.01);
    this.group.add(this.inner);
  }

  /** Where a fish drops in, in the tank's coordinates. */
  get top(): Vector3 {
    return new Vector3(0, 0.75, 0);
  }

  set(fish: readonly { id: number; species: SpeciesId }[]) {
    const ids = fish.map((f) => f.id);
    for (const s of this.swimmers) if (!ids.includes(s.id)) s.mesh.removeFromParent();
    this.swimmers = this.swimmers.filter((s) => ids.includes(s.id));
    fish.forEach((f, i) => {
      if (this.swimmers.some((s) => s.id === f.id)) return;
      const mesh = fishModel(f.species);
      mesh.scale.setScalar(0.2);
      this.inner.add(mesh);
      this.swimmers.push({ id: f.id, mesh, a: i * 1.3, speed: 0.6 + (i % 3) * 0.2, r: 0.22 + (i % 2) * 0.08, y: 0.16 + (i % 3) * 0.12 });
    });
    this.update(0);
  }

  update(dt: number) {
    for (const s of this.swimmers) {
      if (!this.calm) s.a += dt * s.speed;
      const x = Math.cos(s.a) * s.r;
      const z = Math.sin(s.a) * s.r * 0.45;
      s.mesh.position.set(x, s.y + (this.calm ? 0 : Math.sin(s.a * 2) * 0.02), z);
      s.mesh.rotation.y = Math.atan2(-0.45 * Math.cos(s.a), -Math.sin(s.a));
    }
  }
}

/* ------------------------------ the player's scene ----------------------------- */

export interface CatchOutcome {
  seq: number;
  at: number;
  kind: 'sold' | 'tanked' | 'spooked' | 'escaped';
  fish: { id: number; species: SpeciesId; grams: number; perfect: boolean } | null;
  points: number;
}

export interface CatchState {
  water: WaterId;
  event: 'feeding' | 'golden' | 'school' | null;
  phase: Phase;
  seq: number;
  fish: HeldFish | null;
  outcome: CatchOutcome | null;
  tank: { id: number; species: SpeciesId }[];
}

const outcomeKey = (o: CatchOutcome | null) => (o ? `${o.seq}|${o.at}|${o.kind}` : '');

export class BigCatchScene extends World {
  private side: Waterside;
  private angler: Angler;
  private tank: Tank;
  private tin = new Group();
  private shadows: Shadows;
  private cam: EaseCamera;
  private first = true;
  private seenSeq = 0;
  private seenPhase: Phase = 'idle';
  private seenOutcome = '';
  private event: CatchState['event'] = null;
  private flights: { mesh: Object3D; from: Vector3; to: Vector3; t: number; delay: number; dur: number; arc: number; shrink: number; tank?: boolean }[] = [];
  private you: Label;
  private pendingTank: CatchState['tank'] | null = null;
  private clock = 0;

  constructor(env: StageEnv, look: GlimLook) {
    super(env, RIVER);
    const ink = env.quality.outlines;
    this.side = new Waterside(this, 14);
    this.scene.add(this.side.group);
    this.scene.add(jetty(-16, 0.95));

    this.angler = new Angler(this, { look, scale: 1.3, yaw: 0.35, castTo: new Vector3(1.2, 0, 2.7), mine: true });
    this.angler.group.position.set(0.25, DECK, 0.15);
    this.scene.add(this.angler.group);
    this.you = this.labels.add(this.angler.glim, 'You', { offsetY: 1.3, className: 'me small' });

    this.tank = new Tank(env.reducedMotion, ink);
    this.tank.group.position.set(-1.3, DECK, 0.05);
    this.scene.add(this.tank.group);

    // The money tin that sold fish turn into coins for.
    this.tin.add(part(G.box, '#2f9e6a', [0.36, 0.22, 0.28], [0, 0.11, 0]));
    this.tin.add(part(G.box, '#ffcf3f', [0.38, 0.05, 0.3], [0, 0.23, 0], [0, 0, 0], 0.2));
    const c = props.coin({ scale: 1.2 });
    c.position.set(0, 0.3, 0);
    c.rotation.x = Math.PI / 2;
    this.tin.add(c);
    this.tin.position.set(-0.5, DECK, 0.5);
    this.scene.add(this.tin);

    const count = env.quality.tier === 'low' ? 5 : env.quality.tier === 'medium' ? 8 : 12;
    this.shadows = new Shadows(count, { x: [-4, 6], z: [1.5, 6] }, 23);
    this.scene.add(this.shadows.mesh);
    this.cam = new EaseCamera(this.camera, env.reducedMotion);
    this.side.set('river');
    this.shadowArea(5, [-0.3, 0.5, 0.8]);
  }

  /** The latest view. */
  setState(s: CatchState) {
    this.side.set(s.water);
    this.event = s.event;
    const a = this.angler;
    if (this.first) {
      this.first = false;
      this.seenSeq = s.seq;
      this.seenPhase = s.phase;
      this.seenOutcome = outcomeKey(s.outcome);
      a.snap(s.phase, s.fish);
      this.tank.set(s.tank);
      return;
    }
    const newCast = s.seq !== this.seenSeq;
    if (newCast && (s.phase === 'waiting' || s.phase === 'biting')) a.cast(s.phase === 'biting');
    else if (s.phase === 'biting' && this.seenPhase === 'waiting') a.bite();
    if (s.phase === 'landed' && (this.seenPhase !== 'landed' || newCast) && s.fish) a.land(s.fish);

    const key = outcomeKey(s.outcome);
    if (key && key !== this.seenOutcome && s.outcome) this.playOutcome(s.outcome);
    this.seenOutcome = key;
    this.seenSeq = s.seq;
    this.seenPhase = s.phase;

    // The tank changes once a fish has dropped in; until then keep the old swimmers.
    if (this.flights.some((f) => f.tank)) this.pendingTank = s.tank;
    else this.tank.set(s.tank);
  }

  private playOutcome(o: CatchOutcome) {
    const a = this.angler;
    if (o.kind === 'escaped' || o.kind === 'spooked') {
      a.miss();
      return;
    }
    if (!o.fish) return;
    const fish = o.fish;
    const resolve = () => {
      const held = a.takeHeld();
      if (!held) return;
      const from = held.fish.getWorldPosition(new Vector3());
      held.fish.removeFromParent();
      this.scene.add(held.fish);
      held.fish.position.copy(from);
      if (o.kind === 'tanked') {
        const to = this.tank.group.localToWorld(this.tank.top);
        this.flights.push({ mesh: held.fish, from, to, t: 0, delay: 0, dur: 0.6, arc: 0.6, shrink: 0.9, tank: true });
      } else {
        // Sold: the fish shrinks away into coins that fly to the tin.
        const tin = this.tin.localToWorld(new Vector3(0, 0.35, 0));
        this.flights.push({ mesh: held.fish, from, to: from.clone().add(new Vector3(0, 0.25, 0)), t: 0, delay: 0, dur: 0.3, arc: 0, shrink: 1 });
        const n = Math.min(8, 3 + Math.round(o.points / 15));
        for (let i = 0; i < n; i++) {
          const coin = props.coin({ scale: 1.6 });
          coin.position.copy(from);
          this.scene.add(coin);
          this.flights.push({ mesh: coin, from: from.clone().add(new Vector3((i % 3) * 0.08 - 0.08, 0, 0)), to: tin, t: 0, delay: 0.12 + i * 0.05, dur: 0.45, arc: 0.7, shrink: 0.4 });
        }
        const mark = new Group();
        mark.position.copy(tin);
        this.scene.add(mark);
        setTimeout(() => {
          this.fx.burst(tin, { color: ['#ffd25a', '#fff1a8'], shape: 'star', glow: true, count: 16, speed: 1.8 });
          const label = this.labels.add(mark, `+${String(o.points)}`, { offsetY: 0.2, className: 'pop tone-gold' });
          setTimeout(() => {
            this.labels.remove(label);
            mark.removeFromParent();
          }, 1000);
        }, 550);
      }
    };
    if (a.held && a.held.info.id === fish.id) {
      resolve();
      return;
    }
    // Never seen held (Trophy Hunt sells as it lands): reel it in first, then let it go.
    a.land({ ...fish, cm: cmOf(fish.species, fish.grams) }, () => setTimeout(resolve, 500));
  }

  tick(dt: number, t: number) {
    this.clock += dt;
    this.side.tick(t);
    this.angler.update(dt);
    this.tank.update(dt);
    const calm = this.env.reducedMotion;
    if (!calm) this.shadows.place(dt, this.event === 'feeding' ? 2.2 : 1, this.event === 'school' ? undefined : Math.ceil(this.shadows.mesh.count * 0.6));
    if (this.event === 'golden' && !calm && Math.floor(t * 2) !== Math.floor((t - dt) * 2)) {
      this.fx.burst(new Vector3(-2 + Math.random() * 7, 0.4 + Math.random() * 1.2, 1 + Math.random() * 4), { color: ['#ffd25a', '#fff1a8'], shape: 'star', glow: true, count: 5, speed: 0.5, gravity: -0.3, life: 1.4 });
    }
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]!;
      f.t += dt;
      if (f.t < f.delay) continue;
      const k = Math.min(1, (f.t - f.delay) / f.dur);
      f.mesh.position.lerpVectors(f.from, f.to, k);
      f.mesh.position.y += Math.sin(k * Math.PI) * f.arc;
      const s = f.mesh.userData.startScale ?? (f.mesh.userData.startScale = f.mesh.scale.x);
      f.mesh.scale.setScalar(s * (1 - k * f.shrink));
      if (k >= 1) {
        f.mesh.removeFromParent();
        this.flights.splice(i, 1);
      }
    }
    if (this.pendingTank && !this.flights.some((f) => f.tank)) {
      this.tank.set(this.pendingTank);
      this.pendingTank = null;
    }
    this.you.visible = !this.angler.held;
    // Frame the tank, the angler and the bobber: stand back just far enough for all three to fit across.
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const d = Math.max(5.2, 1.95 / (tan * Math.min(1.6, this.camera.aspect)));
    this.cam.set([0.05, 0.85 + d * 0.3, 1.2 + d], [0.05, 0.85, 1.2]);
    this.cam.update(dt);
  }
}

/** How long a fish of this weight is, as the engine works it out. */
function cmOf(species: SpeciesId, grams: number): number {
  const sp = speciesById(species);
  return sp ? sizeCm(sp, grams) : 40;
}

/* -------------------------------- the big screen ------------------------------- */

export interface JettyAngler {
  playerId: string;
  name: string;
  phase: Phase;
  castAt: number | null;
  species: SpeciesId | null;
  grams: number | null;
  look: GlimLook;
}

const JETTY_MAX = 20;
const GAP = 1.45;

/** One long jetty with every angler along it (the top twenty), for the big screen. */
export class JettyScene extends World {
  private side: Waterside;
  private anglers = new Map<string, { a: Angler; phase: Phase; castAt: number | null; label: Label; name: string }>();
  private order: string[] = [];
  private cam: EaseCamera;
  private shadows: Shadows;

  constructor(env: StageEnv) {
    super(env, RIVER);
    this.side = new Waterside(this, 22);
    this.scene.add(this.side.group);
    this.scene.add(jetty(-24, 24));
    this.shadows = new Shadows(env.quality.tier === 'low' ? 8 : 16, { x: [-18, 18], z: [1.6, 6] }, 41);
    this.scene.add(this.shadows.mesh);
    this.cam = new EaseCamera(this.camera, env.reducedMotion);
    this.side.set('river');
    this.shadowArea(16, [0, 0.5, 0.5]);
  }

  setWater(water: WaterId) {
    this.side.set(water);
  }

  setAnglers(list: JettyAngler[]) {
    const top = list.slice(0, JETTY_MAX);
    const ids = top.map((x) => x.playerId);
    for (const [id, e] of this.anglers) {
      if (!ids.includes(id)) {
        this.labels.remove(e.label);
        e.a.dispose();
        this.anglers.delete(id);
      }
    }
    top.forEach((x, i) => {
      let e = this.anglers.get(x.playerId);
      const fish = x.species && x.grams !== null ? { id: 0, species: x.species, grams: x.grams, cm: cmOf(x.species, x.grams), perfect: false } : null;
      if (!e) {
        const a = new Angler(this, { look: x.look, scale: 1, yaw: 0, castTo: new Vector3(((i * 37) % 5) * 0.1 - 0.2, 0, 2.9 + ((i * 13) % 3) * 0.3), mine: false });
        a.group.position.set(0, DECK, 0.1);
        this.scene.add(a.group);
        a.snap(x.phase, fish);
        const label = this.labels.add(a.glim, x.name, { offsetY: 1.15, className: 'small' });
        e = { a, phase: x.phase, castAt: x.castAt, label, name: x.name };
        this.anglers.set(x.playerId, e);
      }
      e.a.group.position.x = (i - (top.length - 1) / 2) * GAP;
      const a = e.a;
      if (x.phase !== e.phase || (x.castAt !== e.castAt && x.phase === 'waiting')) {
        if ((x.phase === 'waiting' || x.phase === 'biting') && x.castAt !== e.castAt) a.cast(x.phase === 'biting');
        else if (x.phase === 'biting') a.bite();
        else if (x.phase === 'landed' && fish) a.land(fish);
        else if (x.phase === 'idle') {
          if (e.phase === 'landed') a.dropHeld();
          else if (e.phase !== 'idle') a.miss();
        }
      }
      e.phase = x.phase;
      e.castAt = x.castAt;
      e.label.set(x.name);
    });
    this.order = ids;
  }

  tick(dt: number, t: number) {
    this.side.tick(t);
    for (const e of this.anglers.values()) e.a.update(dt);
    if (!this.env.reducedMotion) this.shadows.place(dt, 1);
    // Fit the whole row across, looking in low over the water so the anglers fill the middle of the picture.
    const n = Math.max(4, this.order.length);
    const span = n * GAP + 1.2;
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const dist = Math.max((span * 0.5) / (tan * this.camera.aspect), 6);
    this.cam.set([0, 1.4 + dist * 0.17, dist + 2], [0, 1, 1.8]);
    this.cam.update(dt);
  }
}

/** A Glim look for a player, with a stand-in for anyone who has no avatar. */
export function lookOf(avatar: { art: GlimArt; accessories?: GlimLook['accessories']; rarity?: GlimLook['rarity'] } | null | undefined, fallback: GlimArt): GlimLook {
  return avatar ? { art: avatar.art, accessories: avatar.accessories, rarity: avatar.rarity } : { art: fallback };
}
