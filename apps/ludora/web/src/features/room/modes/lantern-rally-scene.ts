import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Fog,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LANE_WIDTH, laneOffset, lapPos, pointAt, trackBounds, trackPath, type CircuitId, type TrackPath } from '@ludora/engine/lantern-rally';
import { Glim3D, NIGHT, World, css, outline, props, toon, type GlimLook, type Lighting, type StageEnv } from '../../../three/index.ts';
import { toonRamp } from '../../../three/toon.ts';
import type { Label } from '../../../three/labels.ts';
import { FLAG, type FieldKart, type RallyField } from './lantern-rally-field.ts';

/*
 * Lantern Rally in 3D. A circuit of three lanes at night, strung with
 * lanterns on poles either side, in one of three places: a harbour (the quay,
 * the water, boats and a lighthouse), a wood (tall pines and fireflies) or the
 * rooftops of a city (towers with lit windows, water tanks, blinking masts).
 * Toon karts built from a few simple shapes, each with its driver's Glim at
 * the wheel and a little lantern on a mast behind; boosts leave a trail,
 * puddles splash, cones knock sparks.
 *
 * `RallyScene` is a player's device: a chase camera behind their own kart.
 * `RallyHostScene` is the big screen: the whole circuit from above, cutting
 * to the trackside for the race at the front and the latest overtake. Both
 * draw the karts from a RallyField and decide nothing.
 */

export interface SceneItem {
  at: number;
  lane: number;
  kind: 0 | 1 | 2;
}

export interface RallySceneOptions {
  circuit: CircuitId;
  host: boolean;
  me: string | null;
  trial: boolean;
  looks: (id: string) => GlimLook;
  hueOf: (id: string) => number;
}

/** Each place's light, sky and colours. */
interface Look {
  lighting: Lighting;
  ground: string;
  asphalt: string;
  lantern: string;
  glow: string;
}

const LOOKS: Record<CircuitId, Look> = {
  harbour: {
    lighting: { ...NIGHT, skyTop: '#081232', horizon: '#2b3f7a', ground: '#2a3150', sunIntensity: 1.7, fill: 1.7, fogNear: 70, fogFar: 260 },
    ground: '#6f6874',
    asphalt: '#3d3f52',
    lantern: '#ffc864',
    glow: '#ffcf7a',
  },
  forest: {
    lighting: { ...NIGHT, skyTop: '#06121c', horizon: '#1d3b45', ground: '#1f3a2c', sunIntensity: 1.6, fill: 1.7, fogNear: 60, fogFar: 220 },
    ground: '#2f6644',
    asphalt: '#48464f',
    lantern: '#ffd76a',
    glow: '#ffe28a',
  },
  rooftops: {
    lighting: { ...NIGHT, skyTop: '#140b2e', horizon: '#4a2c6e', ground: '#2e2440', sunIntensity: 1.7, fill: 1.7, fogNear: 80, fogFar: 300 },
    ground: '#6a6580',
    asphalt: '#3a3a50',
    lantern: '#ff9fd0',
    glow: '#ffb3dc',
  },
};

/** Half the width of the road, kerbs not included. */
const HALF = LANE_WIDTH * 1.5 + 0.7;

/* ------------------------------ shared pieces ------------------------------ */

let glowTex: CanvasTexture | null = null;
function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new CanvasTexture(c);
  glowTex.userData.shared = true;
  return glowTex;
}

function glowSprite(colour: string, size: number, opacity = 0.6): Sprite {
  const s = new Sprite(new SpriteMaterial({ map: glowTexture(), color: css(colour), transparent: true, depthWrite: false, blending: AdditiveBlending, opacity, fog: false }));
  s.scale.set(size, size, 1);
  return s;
}

/** A cloud of glows in one draw call: lantern light along the strings, fireflies, masts. */
function glowPoints(positions: number[], colour: string, size: number, opacity = 0.75): Points {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return new Points(g, new PointsMaterial({ map: glowTexture(), color: css(colour), size, sizeAttenuation: true, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending, fog: false }));
}

let checkerTex: CanvasTexture | null = null;
function checkerTexture(): CanvasTexture {
  if (checkerTex) return checkerTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 16;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
    g.fillStyle = (x + y) % 2 ? '#141022' : '#f4f1ff';
    g.fillRect(x * 4, y * 4, 4, 4);
  }
  checkerTex = new CanvasTexture(c);
  checkerTex.userData.shared = true;
  return checkerTex;
}

let trailTex: CanvasTexture | null = null;
/** A streak that fades out behind a boosting kart. */
function trailTexture(): CanvasTexture {
  if (trailTex) return trailTex;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 64);
  const side = g.createLinearGradient(0, 0, 16, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.5, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = side;
  g.fillRect(0, 0, 16, 64);
  trailTex = new CanvasTexture(c);
  trailTex.userData.shared = true;
  return trailTex;
}

let windowTex: CanvasTexture | null = null;
function windowTexture(): CanvasTexture {
  if (windowTex) return windowTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a2440';
  g.fillRect(0, 0, 64, 128);
  const rnd = props.seeded(5);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 6; x++) {
      const lit = rnd() < 0.42;
      g.fillStyle = lit ? (rnd() < 0.5 ? '#ffd98a' : '#ffe9c0') : '#1b1730';
      g.fillRect(4 + x * 10, 4 + y * 8, 6, 5);
    }
  windowTex = new CanvasTexture(c);
  windowTex.wrapS = windowTex.wrapT = RepeatWrapping;
  windowTex.userData.shared = true;
  return windowTex;
}

const m4 = new Matrix4();
const q = new Quaternion();
const v1 = new Vector3();
const s1 = new Vector3();
const UP = new Vector3(0, 1, 0);

function placeInstance(mesh: InstancedMesh, i: number, x: number, y: number, z: number, rotY: number, sx: number, sy = sx, sz = sx) {
  q.setFromAxisAngle(UP, rotY);
  m4.compose(v1.set(x, y, z), q, s1.set(sx, sy, sz));
  mesh.setMatrixAt(i, m4);
}

/** Distance from a point to the track's centre line (coarse, for keeping scenery off the road). */
function distToTrack(path: TrackPath, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < path.xs.length; i += 4) best = Math.min(best, Math.hypot(path.xs[i]! - x, path.zs[i]! - z));
  return best;
}

/* ---------------------------------- karts ---------------------------------- */

/** One kart's body in two meshes: the painted shell (coloured per driver) and the dark parts. */
function kartGeometries() {
  const paint: BufferGeometry[] = [];
  const dark: BufferGeometry[] = [];
  paint.push(new BoxGeometry(1.3, 0.34, 2.1).translate(0, 0.42, 0));
  paint.push(new BoxGeometry(0.9, 0.26, 0.8).translate(0, 0.4, 1.35));
  paint.push(new BoxGeometry(1.6, 0.08, 0.36).translate(0, 0.95, -1.15));
  paint.push(new BoxGeometry(0.34, 0.24, 1.4).translate(-0.8, 0.36, 0.05));
  paint.push(new BoxGeometry(0.34, 0.24, 1.4).translate(0.8, 0.36, 0.05));
  const wheel = new CylinderGeometry(0.3, 0.3, 0.26, 12).rotateZ(Math.PI / 2);
  for (const [x, z] of [
    [-0.78, 0.82],
    [0.78, 0.82],
    [-0.8, -0.78],
    [0.8, -0.78],
  ] as const)
    dark.push(wheel.clone().translate(x, 0.3, z));
  dark.push(new BoxGeometry(0.08, 0.38, 0.08).translate(-0.55, 0.75, -1.15), new BoxGeometry(0.08, 0.38, 0.08).translate(0.55, 0.75, -1.15));
  // The mast for the kart's lantern.
  dark.push(new CylinderGeometry(0.03, 0.03, 1.0, 5).translate(0.45, 1.05, -0.95));
  dark.push(new BoxGeometry(0.9, 0.12, 0.5).translate(0, 0.62, -0.35));
  const toNonIndexed = (list: BufferGeometry[]) => list.map((g) => (g.index ? g.toNonIndexed() : g));
  const p = mergeGeometries(toNonIndexed(paint))!;
  const d = mergeGeometries(toNonIndexed(dark))!;
  p.userData.shared = true;
  d.userData.shared = true;
  return { paint: p, dark: d };
}

let kartGeo: ReturnType<typeof kartGeometries> | null = null;
const shieldGeo = new SphereGeometry(1.7, 16, 10);
const headGeo = new SphereGeometry(0.32, 10, 8);
const puddleGeo = new CircleGeometry(1.2, 14).rotateX(-Math.PI / 2);
const coneGeo = (() => {
  const g = new ConeGeometry(0.34, 0.8, 10).translate(0, 0.4, 0);
  const pos = g.getAttribute('position');
  const col: number[] = [];
  const orange = new Color('#ff7a2e');
  const white = new Color('#f4f1ff');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const c = y > 0.32 && y < 0.5 ? white : orange;
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
})();
const pickupGeo = new IcosahedronGeometry(0.42, 1).scale(1, 1.25, 1);
const poleGeo = new CylinderGeometry(0.06, 0.08, 1, 5).translate(0, 0.5, 0);
const bulbGeo = new SphereGeometry(0.16, 8, 6);
const pineGeo = new ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
const trunkGeo = new CylinderGeometry(0.1, 0.14, 1, 5).translate(0, 0.5, 0);
const boxGeo = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const tankGeo = new CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0);
const trailGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
for (const g of [shieldGeo, headGeo, puddleGeo, coneGeo, pickupGeo, poleGeo, bulbGeo, pineGeo, trunkGeo, boxGeo, tankGeo, trailGeo]) g.userData.shared = true;

function shared<T extends Mesh | InstancedMesh>(m: T): T {
  m.userData.sharedGeometry = true;
  return m;
}

interface KartObj {
  id: string;
  group: Group;
  body: Group;
  glim: Glim3D | null;
  trail: Mesh;
  trailMat: MeshBasicMaterial;
  shield: Mesh;
  aura: Sprite;
  label: Label | null;
  flags: number;
  wobble: number;
  name: string;
}

/* ---------------------------------- world ---------------------------------- */

export abstract class RallyWorld extends World {
  protected readonly path: TrackPath;
  protected readonly look: Look;
  protected readonly karts = new Map<string, KartObj>();
  private items: SceneItem[] = [];
  private itemKey = '';
  private puddles: InstancedMesh | null = null;
  private cones: InstancedMesh | null = null;
  private pickups: InstancedMesh | null = null;
  private pickupGlow: Points | null = null;
  private pickupList: { i: number; x: number; z: number }[] = [];
  private got = new Set<number>();
  private gotKey = '';
  private water: ReturnType<typeof props.water> | null = null;
  private lights: Mesh[] = [];
  private lightMats: MeshBasicMaterial[] = [];
  private startAt = 0;
  private crowds = new Map<string, { anchor: Object3D; label: Label }>();
  private blink: Points | null = null;
  protected time = 0;
  protected ghost: { mesh: Group; samples: number[] | null; lapStart: number } | null = null;

  constructor(
    env: StageEnv,
    readonly field: RallyField,
    readonly o: RallySceneOptions,
  ) {
    super(env, LOOKS[o.circuit].lighting, o.host ? 45 : 58);
    this.path = trackPath(o.circuit);
    this.look = LOOKS[o.circuit];
    // Lantern-lit, not moonlit: a warmer fill so the toon colours read at night.
    this.fill.color.set('#cfc8f2');
    this.fill.groundColor.set('#7a604e');
    this.sun.color.set('#ffe6c4');
    this.buildGround();
    this.buildTrack();
    this.buildStrings();
    this.buildGantry();
    if (o.circuit === 'harbour') this.buildHarbour();
    else if (o.circuit === 'forest') this.buildForest();
    else this.buildRooftops();
    if (o.trial && !o.host) this.buildGhost();
  }

  /* ------------------------------- the circuit ------------------------------ */

  private buildGround() {
    const b = trackBounds(this.path);
    const g = props.ground(Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + 220, Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + 220, this.look.ground);
    g.position.set((b.minX + b.maxX) / 2, -0.02, (b.minZ + b.maxZ) / 2);
    g.receiveShadow = true;
    this.scene.add(g);
  }

  /** The road, kerbs, lane lines and the start line, in one mesh coloured by vertex. */
  private buildTrack() {
    const pos: number[] = [];
    const col: number[] = [];
    const n = this.path.xs.length - 1;
    const asphalt = css(this.look.asphalt);
    const asphalt2 = css(this.look.asphalt).multiplyScalar(1.12);
    const red = css('#e8435a');
    const white = css('#efeaff');
    const line = css('#d9d4f0');
    const quad = (a: Vector3, b: Vector3, c: Vector3, d: Vector3, colour: Color, y = 0) => {
      for (const p of [a, b, c, a, c, d]) {
        pos.push(p.x, p.y + y, p.z);
        col.push(colour.r, colour.g, colour.b);
      }
    };
    const edge = (i: number, off: number) => {
      const p = pointAt(this.path, (i / n) * this.path.length, off);
      return new Vector3(p.x, 0, p.z);
    };
    for (let i = 0; i < n; i++) {
      const s = (i / n) * this.path.length;
      // Road, in two tones so the surface reads at speed.
      quad(edge(i, -HALF), edge(i + 1, -HALF), edge(i + 1, HALF), edge(i, HALF), Math.floor(s / 8) % 2 ? asphalt : asphalt2, 0.02);
      // Kerbs, red and white every 3 metres.
      const kerb = Math.floor(s / 3) % 2 ? red : white;
      quad(edge(i, -HALF - 0.9), edge(i + 1, -HALF - 0.9), edge(i + 1, -HALF), edge(i, -HALF), kerb, 0.04);
      quad(edge(i, HALF), edge(i + 1, HALF), edge(i + 1, HALF + 0.9), edge(i, HALF + 0.9), kerb, 0.04);
      // Dashed lines between lanes.
      if (Math.floor(s / 3) % 2 === 0)
        for (const off of [-LANE_WIDTH / 2, LANE_WIDTH / 2]) quad(edge(i, off - 0.08), edge(i + 1, off - 0.08), edge(i + 1, off + 0.08), edge(i, off + 0.08), line, 0.05);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    // Faces wound either way are fine: the road is only seen from above.
    const road = new Mesh(g, new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), side: DoubleSide }));
    road.receiveShadow = true;
    this.scene.add(road);
    // The start and finish line.
    const start = pointAt(this.path, 0);
    const chequer = new Mesh(new PlaneGeometry(HALF * 2, 1.6).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: checkerTexture() }));
    chequer.position.set(start.x, 0.07, start.z);
    chequer.rotation.y = start.heading;
    this.scene.add(chequer);
  }

  /** Poles either side of the road with strings of lanterns between them: the circuit's signature. */
  private buildStrings() {
    const low = this.env.quality.tier === 'low';
    const every = low ? 22 : 16;
    const spans = Math.floor(this.path.length / every);
    const perSpan = low ? 3 : 5;
    const poles = shared(new InstancedMesh(poleGeo, toon('#2b2638'), spans * 2));
    const bulbs = shared(new InstancedMesh(bulbGeo, toon(this.look.lantern, { glow: 0.9 }), spans * 2 * perSpan));
    const glows: number[] = [];
    const lines: number[] = [];
    let b = 0;
    const H = 4.2;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < spans; i++) {
        const d0 = i * every + (side > 0 ? every / 2 : 0);
        const p = pointAt(this.path, d0, side * (HALF + 2.2));
        placeInstance(poles, (side > 0 ? spans : 0) + i, p.x, 0, p.z, 0, 1, H, 1);
        const q2 = pointAt(this.path, d0 + every, side * (HALF + 2.2));
        let prev: [number, number, number] = [p.x, H, p.z];
        for (let k = 1; k <= perSpan + 1; k++) {
          const t = k / (perSpan + 1);
          const x = p.x + (q2.x - p.x) * t;
          const z = p.z + (q2.z - p.z) * t;
          const y = H - Math.sin(t * Math.PI) * 0.9;
          lines.push(...prev, x, y, z);
          prev = [x, y, z];
          if (k <= perSpan) {
            placeInstance(bulbs, b++, x, y - 0.22, z, 0, 1);
            glows.push(x, y - 0.22, z);
          }
        }
      }
    }
    poles.instanceMatrix.needsUpdate = true;
    bulbs.instanceMatrix.needsUpdate = true;
    this.scene.add(poles, bulbs);
    const lg = new BufferGeometry();
    lg.setAttribute('position', new Float32BufferAttribute(lines, 3));
    this.scene.add(new LineSegments(lg, new LineBasicMaterial({ color: '#1a1626' })));
    this.scene.add(glowPoints(glows, this.look.glow, this.o.host ? 3.2 : 2.4, 0.7));
  }

  /** The start gantry: posts, a chequered banner and five lights for the countdown. */
  private buildGantry() {
    const s = pointAt(this.path, -0.5);
    const g = new Group();
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.heading;
    const postMat = toon('#2b2638');
    for (const x of [-HALF - 1.4, HALF + 1.4]) {
      const p = shared(new Mesh(boxGeo, postMat));
      p.scale.set(0.35, 5.6, 0.35);
      p.position.x = x;
      g.add(p);
    }
    const bar = shared(new Mesh(boxGeo, toon('#3a3350')));
    bar.scale.set(HALF * 2 + 3.2, 0.9, 0.4);
    bar.position.y = 5.2;
    g.add(bar);
    const banner = new Mesh(new PlaneGeometry(HALF * 2 + 2.6, 0.5), new MeshBasicMaterial({ map: checkerTexture(), side: DoubleSide }));
    banner.position.set(0, 5.65, 0.21);
    g.add(banner);
    for (let i = 0; i < 5; i++) {
      const mat = new MeshBasicMaterial({ color: '#3a2030' });
      const l = new Mesh(bulbGeo, mat);
      l.userData.sharedGeometry = true;
      l.scale.setScalar(1.6);
      l.position.set((i - 2) * 0.7, 5.15, -0.25);
      g.add(l);
      this.lights.push(l);
      this.lightMats.push(mat);
    }
    this.scene.add(g);
  }

  private buildHarbour() {
    const b = trackBounds(this.path);
    // The sea along the quay to the south, and round the lighthouse pier to the east.
    const w = props.water(400, 140, { color: '#1d4f86', deep: '#0e2a52', segments: this.env.quality.tier === 'low' ? 24 : 48 });
    w.position.set(0, -0.35, b.maxZ + 80);
    this.scene.add(w);
    this.water = w;
    const quay = shared(new Mesh(boxGeo, toon('#5a5f78')));
    quay.scale.set(400, 0.5, 1.6);
    quay.position.set(0, -0.3, b.maxZ + 10);
    this.scene.add(quay);
    // Boats moored off the quay.
    const hulls = shared(new InstancedMesh(boxGeo, toon('#c84a4a'), 8));
    const cabins = shared(new InstancedMesh(boxGeo, toon('#efe6d6'), 8));
    const masts = shared(new InstancedMesh(poleGeo, toon('#3a3048'), 8));
    const rnd = props.seeded(11);
    const lamps: number[] = [];
    for (let i = 0; i < 8; i++) {
      const x = b.minX + 10 + i * ((b.maxX - b.minX) / 8) + rnd() * 6;
      const z = b.maxZ + 18 + rnd() * 14;
      const r = rnd() * 0.6 - 0.3;
      placeInstance(hulls, i, x, -0.4, z, r, 6, 1.2, 2.2);
      placeInstance(cabins, i, x - 0.8, 0.8, z, r, 2.2, 1.1, 1.6);
      placeInstance(masts, i, x + 1, 0.8, z, r, 1, 6, 1);
      lamps.push(x + 1, 6.8, z);
    }
    for (const m of [hulls, cabins, masts]) m.instanceMatrix.needsUpdate = true;
    this.scene.add(hulls, cabins, masts);
    // Boat sheds and stacked crates inland.
    const sheds = shared(new InstancedMesh(boxGeo, toon('#4b5a7a'), 10));
    let n = 0;
    for (let i = 0; i < 40 && n < 10; i++) {
      const x = b.minX - 10 + rnd() * (b.maxX - b.minX + 20);
      const z = b.minZ - 26 - rnd() * 20;
      if (distToTrack(this.path, x, z) < 14) continue;
      placeInstance(sheds, n++, x, 0, z, rnd() * 0.4, 12 + rnd() * 6, 5 + rnd() * 3, 9);
    }
    sheds.count = n;
    sheds.instanceMatrix.needsUpdate = true;
    this.scene.add(sheds);
    const crates = shared(new InstancedMesh(boxGeo, toon('#b98a5a'), 24));
    n = 0;
    for (let i = 0; i < 160 && n < 24; i++) {
      const x = b.minX + rnd() * (b.maxX - b.minX);
      const z = b.minZ + rnd() * (b.maxZ - b.minZ);
      const dt = distToTrack(this.path, x, z);
      if (dt < 10 || dt > 22) continue;
      const s = 1 + rnd() * 0.6;
      placeInstance(crates, n++, x, 0, z, rnd(), s, s, s);
    }
    crates.count = n;
    crates.instanceMatrix.needsUpdate = true;
    this.scene.add(crates);
    // The lighthouse beyond the pier hairpin.
    const lh = new Group();
    const tower = new Mesh(new CylinderGeometry(1.4, 2.2, 14, 12).translate(0, 7, 0), toon('#f2ecf7'));
    lh.add(tower);
    for (const y of [3, 7.5]) {
      const band = new Mesh(new CylinderGeometry(1.75 - y * 0.03, 1.95 - y * 0.03, 1.6, 12), toon('#d63a52'));
      band.position.y = y;
      lh.add(band);
    }
    const lamp = shared(new Mesh(bulbGeo, toon('#fff2b0', { glow: 1 })));
    lamp.scale.setScalar(6);
    lamp.position.y = 15;
    lh.add(lamp);
    const beam = glowSprite('#fff2b0', 18, 0.5);
    beam.position.y = 15;
    lh.add(beam);
    lh.position.set(b.maxX + 16, 0, (b.minZ + b.maxZ) / 2 - 4);
    this.scene.add(lh);
    this.scene.add(glowPoints(lamps, '#ffe7a8', 2.2, 0.8));
  }

  private buildForest() {
    const b = trackBounds(this.path);
    const low = this.env.quality.tier === 'low';
    const count = low ? 140 : 260;
    const pines = shared(new InstancedMesh(pineGeo, toon('#1f5a45'), count));
    const pines2 = shared(new InstancedMesh(pineGeo, toon('#2c6e52'), count));
    const trunks = shared(new InstancedMesh(trunkGeo, toon('#4a3326'), count));
    const rnd = props.seeded(23);
    let n = 0;
    for (let i = 0; i < count * 6 && n < count; i++) {
      const x = b.minX - 50 + rnd() * (b.maxX - b.minX + 100);
      const z = b.minZ - 50 + rnd() * (b.maxZ - b.minZ + 100);
      if (distToTrack(this.path, x, z) < HALF + 5) continue;
      const h = 6 + rnd() * 7;
      const w = 1.6 + rnd() * 1.4;
      placeInstance(trunks, n, x, 0, z, 0, 1, h * 0.35, 1);
      placeInstance(pines, n, x, h * 0.2, z, rnd() * 3, w, h * 0.75, w);
      placeInstance(pines2, n, x, h * 0.55, z, rnd() * 3, w * 0.7, h * 0.5, w * 0.7);
      n++;
    }
    for (const m of [pines, pines2, trunks]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      this.scene.add(m);
    }
    // Fireflies drifting in the trees.
    const flies: number[] = [];
    for (let i = 0; i < (low ? 60 : 140); i++) flies.push(b.minX - 20 + rnd() * (b.maxX - b.minX + 40), 0.6 + rnd() * 4, b.minZ - 20 + rnd() * (b.maxZ - b.minZ + 40));
    this.blink = glowPoints(flies, '#c8ff8a', 0.9, 0.85);
    this.scene.add(this.blink);
    // Rocks by the roadside.
    const rocks = new InstancedMesh(new IcosahedronGeometry(1, 0), toon('#5a5f6e'), 20);
    n = 0;
    for (let i = 0; i < 200 && n < 20; i++) {
      const x = b.minX + rnd() * (b.maxX - b.minX);
      const z = b.minZ + rnd() * (b.maxZ - b.minZ);
      const d = distToTrack(this.path, x, z);
      if (d < HALF + 2.5 || d > HALF + 8) continue;
      const s = 0.5 + rnd() * 0.9;
      placeInstance(rocks, n++, x, 0, z, rnd() * 3, s, s * 0.7, s);
    }
    rocks.count = n;
    rocks.instanceMatrix.needsUpdate = true;
    this.scene.add(rocks);
  }

  private buildRooftops() {
    const b = trackBounds(this.path);
    const rnd = props.seeded(31);
    const low = this.env.quality.tier === 'low';
    // Towers around the roof the circuit runs on, with lit windows.
    const count = low ? 40 : 70;
    const winMat = new MeshToonMaterial({ map: windowTexture(), gradientMap: toonRamp(), emissive: css('#ffffff'), emissiveMap: windowTexture(), emissiveIntensity: 0.55 });
    const towers = shared(new InstancedMesh(boxGeo, winMat, count));
    const lamps: number[] = [];
    let n = 0;
    for (let i = 0; i < count * 8 && n < count; i++) {
      const ang = rnd() * Math.PI * 2;
      const r = 1 + rnd() * 0.9;
      const x = (b.minX + b.maxX) / 2 + Math.cos(ang) * (b.maxX - b.minX) * 0.5 * r + (rnd() - 0.5) * 20;
      const z = (b.minZ + b.maxZ) / 2 + Math.sin(ang) * (b.maxZ - b.minZ) * 0.5 * r + (rnd() - 0.5) * 20;
      if (distToTrack(this.path, x, z) < 22) continue;
      const w = 8 + rnd() * 10;
      const h = 8 + rnd() * 34;
      placeInstance(towers, n++, x, -14, z, Math.round(rnd() * 4) * (Math.PI / 2), w, h + 14, w * (0.7 + rnd() * 0.5));
      if (rnd() < 0.45) lamps.push(x, h + 1.5, z);
    }
    towers.count = n;
    towers.instanceMatrix.needsUpdate = true;
    this.scene.add(towers);
    // Water tanks, vents and skylights on this roof, off the road.
    const tanks = shared(new InstancedMesh(tankGeo, toon('#8a6a52'), 10));
    const vents = shared(new InstancedMesh(boxGeo, toon('#6a6884'), 26));
    let t = 0;
    let vcount = 0;
    for (let i = 0; i < 400 && (t < 10 || vcount < 26); i++) {
      const x = b.minX + rnd() * (b.maxX - b.minX);
      const z = b.minZ + rnd() * (b.maxZ - b.minZ);
      const d = distToTrack(this.path, x, z);
      if (d < HALF + 4) continue;
      if (t < 10 && d > 10 && rnd() < 0.3) {
        placeInstance(tanks, t++, x, 2.2, z, 0, 1.6, 2.6, 1.6);
        // Legs, cheaply: a dark box under the tank.
        continue;
      }
      if (vcount < 26) placeInstance(vents, vcount++, x, 0, z, rnd(), 1 + rnd() * 2, 0.6 + rnd() * 1.2, 1 + rnd() * 2);
    }
    tanks.count = t;
    vents.count = vcount;
    for (const m of [tanks, vents]) {
      m.instanceMatrix.needsUpdate = true;
      this.scene.add(m);
    }
    // Parapet walls round the roof's edge.
    const wall = shared(new InstancedMesh(boxGeo, toon('#4c4862'), 4));
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const W = b.maxX - b.minX + 34;
    const D = b.maxZ - b.minZ + 34;
    placeInstance(wall, 0, cx, 0, b.minZ - 17, 0, W, 1, 0.6);
    placeInstance(wall, 1, cx, 0, b.maxZ + 17, 0, W, 1, 0.6);
    placeInstance(wall, 2, b.minX - 17, 0, cz, 0, 0.6, 1, D);
    placeInstance(wall, 3, b.maxX + 17, 0, cz, 0, 0.6, 1, D);
    wall.instanceMatrix.needsUpdate = true;
    this.scene.add(wall);
    // Red lights blinking on the masts.
    this.blink = glowPoints(lamps, '#ff4d6a', 2.6, 0.9);
    this.scene.add(this.blink);
  }

  private buildGhost() {
    kartGeo ??= kartGeometries();
    const g = new Group();
    const mat = toon('#bfe8ff', { opacity: 0.35, transparent: true, glow: 0.4 });
    g.add(shared(new Mesh(kartGeo.paint, mat)), shared(new Mesh(kartGeo.dark, mat)));
    g.visible = false;
    this.scene.add(g);
    this.ghost = { mesh: g, samples: null, lapStart: 0 };
  }

  /* --------------------------------- state --------------------------------- */

  /** Puddles, cones and lanterns round the lap. */
  setItems(items: SceneItem[]) {
    const key = items.map((i) => `${i.at}:${i.lane}:${i.kind}`).join('|');
    if (key === this.itemKey) return;
    this.itemKey = key;
    this.items = items;
    for (const m of [this.puddles, this.cones, this.pickups, this.pickupGlow]) {
      if (!m) continue;
      m.removeFromParent();
      if (m instanceof Points) m.geometry.dispose();
    }
    const puddles = items.filter((i) => i.kind === 0);
    const cones = items.filter((i) => i.kind === 1);
    const lanterns = items.filter((i) => i.kind === 2);
    this.puddles = shared(new InstancedMesh(puddleGeo, toon('#4fa8ff', { opacity: 0.8, transparent: true, glow: 0.25 }), Math.max(1, puddles.length)));
    this.puddles.count = puddles.length;
    puddles.forEach((it, i) => {
      const p = pointAt(this.path, it.at, laneOffset(it.lane));
      placeInstance(this.puddles!, i, p.x, 0.08, p.z, p.heading, 1, 1, 1.4);
    });
    // Three cones across the lane, so a cone row reads from far off.
    this.cones = shared(new InstancedMesh(coneGeo, new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() }), Math.max(1, cones.length * 3)));
    this.cones.count = cones.length * 3;
    cones.forEach((it, i) => {
      for (let k = 0; k < 3; k++) {
        const p = pointAt(this.path, it.at + (k === 1 ? 0.6 : 0), laneOffset(it.lane) + (k - 1) * 0.9);
        placeInstance(this.cones!, i * 3 + k, p.x, 0, p.z, 0, 1);
      }
    });
    this.pickups = shared(new InstancedMesh(pickupGeo, toon(this.look.lantern, { glow: 0.95 }), Math.max(1, lanterns.length)));
    this.pickups.count = lanterns.length;
    const glows: number[] = [];
    this.pickupList = [];
    items.forEach((it, idx) => {
      if (it.kind !== 2) return;
      const p = pointAt(this.path, it.at, laneOffset(it.lane));
      this.pickupList.push({ i: idx, x: p.x, z: p.z });
      glows.push(p.x, 1.2, p.z);
    });
    this.pickupGlow = glowPoints(glows, this.look.glow, 3, 0.75);
    for (const m of [this.puddles, this.cones, this.pickups]) m.instanceMatrix.needsUpdate = true;
    this.scene.add(this.puddles, this.cones, this.pickups, this.pickupGlow);
    this.placePickups(0);
  }

  /** Lanterns your kart has collected this lap: they dim until the next lap. */
  setGot(got: number[]) {
    const key = got.join(',');
    if (key === this.gotKey) return;
    this.gotKey = key;
    this.got = new Set(got);
    this.placePickups(this.time);
  }

  setStart(startAt: number) {
    this.startAt = startAt;
  }

  setGhost(samples: number[] | null, lapStart: number) {
    if (!this.ghost) return;
    this.ghost.samples = samples && samples.length > 2 ? samples : null;
    this.ghost.lapStart = lapStart;
  }

  private placePickups(t: number) {
    if (!this.pickups) return;
    const calm = this.env.reducedMotion;
    const pos = this.pickupGlow?.geometry.getAttribute('position') as BufferAttribute | undefined;
    this.pickupList.forEach((p, n) => {
      const gone = this.got.has(p.i) && !this.o.host;
      const y = 1.1 + (calm ? 0 : Math.sin(t * 2.4 + n) * 0.15);
      placeInstance(this.pickups!, n, p.x, y, p.z, calm ? 0 : t * 1.2 + n, gone ? 0.0001 : 1);
      if (pos) pos.setXYZ(n, p.x, gone ? -50 : y + 0.1, p.z);
    });
    this.pickups.instanceMatrix.needsUpdate = true;
    if (pos) pos.needsUpdate = true;
  }

  /* --------------------------------- karts --------------------------------- */

  /** How many karts get a real Glim (the rest wear a helmet): the budget for Glims on one screen. */
  protected abstract glimBudget(): number;
  /** Karts to draw: a player's own and those near it, or the front of the field on the big screen. */
  protected abstract shown(list: FieldKart[]): FieldKart[];

  private kartColour(id: string, teamId: string | null): Color {
    return css(`hsl(${this.o.hueOf(teamId ?? id)} 78% 58%)`);
  }

  private addKart(k: FieldKart, withGlim: boolean): KartObj {
    kartGeo ??= kartGeometries();
    const group = new Group();
    const body = new Group();
    group.add(body);
    const paint = shared(new Mesh(kartGeo.paint, toon(this.kartColour(k.id, k.teamId))));
    const dark = shared(new Mesh(kartGeo.dark, toon('#23202e')));
    paint.castShadow = dark.castShadow = this.env.quality.shadows && (k.me || this.o.host);
    body.add(paint, dark);
    if (this.env.quality.outlines && (k.me || !this.o.host)) {
      outline(paint, '#141022', 0.03);
      outline(dark, '#141022', 0.03);
    }
    const blob = props.blobShadow(1.5);
    blob.scale.z = 4;
    group.add(blob);
    let glim: Glim3D | null = null;
    if (withGlim) {
      // On the big screen Glims are small: no ink outlines, which halves what each costs.
      glim = new Glim3D({ look: this.o.looks(k.id), quality: this.o.host ? { ...this.env.quality, outlines: false } : this.env.quality, reducedMotion: this.env.reducedMotion });
      glim.scale.setScalar(1.05);
      // Sat high enough that shoulders (and a school uniform) show above the cockpit.
      glim.position.set(0, 0.74, -0.15);
      body.add(glim);
    } else {
      const head = shared(new Mesh(headGeo, toon(this.kartColour(k.id, k.teamId).clone().multiplyScalar(0.7))));
      head.position.set(0, 0.95, -0.1);
      body.add(head);
    }
    // The kart's own little lantern on its mast.
    const lamp = glowSprite(this.look.glow, this.o.host ? 2.4 : 1.6, 0.65);
    lamp.position.set(0.45, 1.6, -0.95);
    body.add(lamp);
    const trailMat = new MeshBasicMaterial({ color: css('#7fd8ff'), map: trailTexture(), transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
    const trail = shared(new Mesh(trailGeo, trailMat));
    trail.position.set(0, 0.35, -1.1);
    trail.scale.set(0.9, 1, 0.01);
    group.add(trail);
    const shield = shared(new Mesh(shieldGeo, toon('#8fd3ff', { opacity: 0.22, transparent: true, glow: 0.6 })));
    shield.position.y = 0.8;
    shield.visible = false;
    group.add(shield);
    const aura = glowSprite('#ffd36a', 4, 0);
    aura.position.y = 0.8;
    group.add(aura);
    // On the big screen karts are drawn larger, so they read from the back of the room.
    if (this.o.host) group.scale.setScalar(1.9);
    this.scene.add(group);
    const name = k.me ? 'You' : k.name;
    const showLabel = this.o.host || k.me || this.karts.size < 9;
    const label = showLabel ? this.labels.add(group, name, { offsetY: this.o.host ? 4.2 : 2.2, className: k.me ? 'me small' : 'small', maxDistance: this.o.host ? 400 : 70 }) : null;
    const obj: KartObj = { id: k.id, group, body, glim, trail, trailMat, shield, aura, label, flags: k.flags, wobble: 0, name };
    this.karts.set(k.id, obj);
    return obj;
  }

  private dropKart(id: string, o: KartObj) {
    this.labels.remove(o.label);
    o.glim?.dispose();
    o.trailMat.dispose();
    o.group.traverse((c) => {
      if (c instanceof Sprite) c.material.dispose();
    });
    o.group.removeFromParent();
    this.karts.delete(id);
  }

  /** The item nearest a kart just behind it in its lane, to tell a splash from a knock. */
  private hitKind(k: FieldKart): 0 | 1 | null {
    const pos = lapPos(k.d, this.path.length);
    let best: { kind: 0 | 1; gap: number } | null = null;
    for (const it of this.items) {
      if (it.kind === 2 || it.lane !== Math.round(k.lane)) continue;
      const gap = lapPos(pos - it.at, this.path.length);
      if (gap < 8 && (!best || gap < best.gap)) best = { kind: it.kind, gap };
    }
    return best?.kind ?? null;
  }

  private syncKarts(dt: number) {
    const list = this.shown(this.field.list());
    const ids = new Set(list.map((k) => k.id));
    for (const [id, o] of this.karts) if (!ids.has(id)) this.dropKart(id, o);
    const budget = this.glimBudget();
    let glims = [...this.karts.values()].filter((o) => o.glim).length;
    const calm = this.env.reducedMotion;
    for (const k of list) {
      let o = this.karts.get(k.id);
      if (!o) {
        const withGlim = k.me || glims < budget;
        if (withGlim) glims++;
        o = this.addKart(k, withGlim);
      }
      const p = pointAt(this.path, k.d, laneOffset(k.lane));
      o.group.visible = !this.blocks(k);
      o.group.position.set(p.x, 0, p.z);
      o.group.rotation.y = p.heading;
      // Lean into a lane change; wobble after a knock.
      const steer = k.srvLane - k.lane;
      o.wobble = Math.max(0, o.wobble - dt);
      o.body.rotation.z = -steer * 0.18 + (calm ? 0 : Math.sin(o.wobble * 30) * o.wobble * 0.25);
      o.body.rotation.y = steer * 0.25 + (calm ? 0 : Math.sin(o.wobble * 22) * o.wobble * 0.35);
      o.body.position.y = calm ? 0 : Math.sin(this.time * 18 + k.d) * 0.02;
      const f = k.flags;
      const was = o.flags;
      const rose = (bit: number) => (f & bit) !== 0 && (was & bit) === 0;
      const boosting = (f & FLAG.boost) !== 0;
      const target = boosting ? 1 : 0;
      o.trailMat.opacity += (target * 0.6 - o.trailMat.opacity) * Math.min(1, dt * 6);
      o.trail.scale.z = 0.01 + o.trailMat.opacity * (calm ? 4 : 7);
      o.trail.visible = o.trailMat.opacity > 0.02;
      o.shield.visible = (f & FLAG.shield) !== 0;
      const auraMat = o.aura.material;
      auraMat.opacity += (((f & FLAG.glow) !== 0 ? 0.55 : 0) - auraMat.opacity) * Math.min(1, dt * 5);
      o.aura.visible = auraMat.opacity > 0.02;
      if (rose(FLAG.boost)) {
        o.glim?.setExpression('determined', 2);
        if (!calm) this.fx.burst(new Vector3(p.x, 0.5, p.z), { color: ['#7fd8ff', '#ffffff'], shape: 'spark', glow: true, count: 14, speed: 3, size: 0.25 });
      }
      if (rose(FLAG.slow)) {
        const kind = this.hitKind(k);
        o.wobble = 0.6;
        o.glim?.setExpression('dizzy', 1.4);
        if (kind === 1) this.fx.burst(new Vector3(p.x, 0.6, p.z), { color: ['#ff7a2e', '#ffe0b0'], shape: 'square', count: 16, speed: 3.5, gravity: 7, size: 0.18 });
        else this.fx.burst(new Vector3(p.x, 0.2, p.z), { color: ['#8fd3ff', '#d8f1ff', '#4fa8ff'], shape: 'dot', count: 26, speed: 4, gravity: 9, spread: 0.6, size: 0.18 });
      }
      if (rose(FLAG.cough)) this.fx.burst(new Vector3(p.x, 0.8, p.z).addScaledVector(new Vector3(Math.sin(p.heading), 0, Math.cos(p.heading)), -1.3), { color: ['#5d5a6e', '#8b889c'], shape: 'dot', count: 10, speed: 1.2, gravity: -1, size: 0.3 });
      if (rose(FLAG.glow)) this.fx.burst(new Vector3(p.x, 1.2, p.z), { color: [this.look.glow, '#ffffff'], shape: 'star', glow: true, count: 12, speed: 2.5, size: 0.3 });
      if (rose(FLAG.finished)) {
        o.glim?.play('celebrate');
        o.glim?.setExpression('happy', 3);
        this.fx.burst(new Vector3(p.x, 1.5, p.z), { color: ['#ffc233', '#ffffff', '#ff8a5a', '#3d9bff'], shape: 'star', glow: true, count: 50, speed: 5 });
      }
      o.flags = f;
      o.glim?.setMoving(0);
      o.glim?.update(dt);
      const name = k.me ? 'You' : k.finished ? `${k.name} (${ordinal(k.finished)})` : k.name;
      if (name !== o.name) {
        o.name = name;
        o.label?.set(name);
      }
    }
    this.crowdTags(list);
  }

  /**
   * Karts close together would cover each other's name tags, so a bunch gets one tag listing
   * them all, stacked (on the big screen from two karts; on a phone from three, with your own
   * "You" tag kept).
   */
  private crowdTags(list: FieldKart[]) {
    const near = this.crowdGap();
    const min = this.o.host ? 2 : 3;
    const others = list.filter((k) => !k.me && this.karts.get(k.id)?.label).map((k) => ({ k, p: lapPos(k.d, this.path.length) }));
    others.sort((a, b) => a.p - b.p);
    const clusters: { k: FieldKart; p: number }[][] = [];
    for (const o of others) {
      const last = clusters[clusters.length - 1];
      if (last && o.p - last[last.length - 1]!.p <= near) last.push(o);
      else clusters.push([o]);
    }
    const seen = new Set<string>();
    for (const c of clusters) {
      const crowded = c.length >= min;
      for (const { k } of c) {
        const lab = this.karts.get(k.id)?.label;
        if (lab) lab.visible = !crowded;
      }
      if (!crowded) continue;
      const key = c[0]!.k.id;
      seen.add(key);
      let tag = this.crowds.get(key);
      if (!tag) {
        const anchor = new Object3D();
        this.scene.add(anchor);
        const label = this.labels.add(anchor, '', { offsetY: this.o.host ? 4.6 : 2.4, className: 'small', maxDistance: this.o.host ? 400 : 70 });
        Object.assign(label.el.style, { whiteSpace: 'pre-line', borderRadius: '10px', textAlign: 'center', lineHeight: '1.3', maxWidth: '13rem' });
        tag = { anchor, label };
        this.crowds.set(key, tag);
      }
      const mid = (c[0]!.p + c[c.length - 1]!.p) / 2;
      const pt = pointAt(this.path, mid);
      tag.anchor.position.set(pt.x, 0, pt.z);
      const names = c.map(({ k }) => this.karts.get(k.id)!.name).sort((a, b) => a.localeCompare(b));
      const lines = names.length > 6 ? [...names.slice(0, 5), `and ${names.length - 5} more`] : names;
      tag.label.set(lines.join('\n'));
    }
    for (const [key, tag] of this.crowds) {
      if (seen.has(key)) continue;
      this.labels.remove(tag.label);
      tag.anchor.removeFromParent();
      this.crowds.delete(key);
    }
  }

  /** Whether a kart would block the view of your own (a player's chase camera hides those just behind you). */
  protected blocks(_k: FieldKart): boolean {
    return false;
  }

  /** Metres along the track within which karts share one name tag. */
  protected crowdGap(): number {
    return this.o.host ? 9 : 4;
  }

  protected kartPos(id: string | null): Vector3 | null {
    const o = id ? this.karts.get(id) : undefined;
    return o ? o.group.position : null;
  }

  protected tickWorld(dt: number, t: number) {
    this.time = t;
    const now = this.field.update();
    this.syncKarts(dt);
    this.placePickups(t);
    this.water?.time(t);
    if (this.blink && !this.env.reducedMotion) (this.blink.material as PointsMaterial).opacity = 0.55 + Math.sin(t * (this.o.circuit === 'rooftops' ? 3 : 1.4)) * 0.3;
    // The countdown: five lights come on one by one, then all go green at the start.
    const left = this.startAt - now;
    this.lightMats.forEach((m, i) => {
      const on = left > 0 ? left < 4000 - 700 * (i + 1) + 700 : false;
      const green = left <= 0 && left > -2500;
      m.color.set(green ? '#3dff8a' : on ? '#ff3b4a' : '#3a2030');
    });
    // The ghost of your best lap.
    if (this.ghost) {
      const g = this.ghost;
      const me = this.field.me();
      if (g.samples && me && me.d >= 0 && !me.finished) {
        const f = (now - g.lapStart) / 500;
        const i = Math.floor(f);
        if (i >= 0 && i + 1 < g.samples.length) {
          const a = g.samples[i]! / 10;
          let b = g.samples[i + 1]! / 10;
          if (b < a) b += this.path.length;
          const lapStartD = me.d - lapPos(me.d, this.path.length);
          const p = pointAt(this.path, lapStartD + a + (b - a) * (f - i), laneOffset(1));
          g.mesh.position.set(p.x, 0.05, p.z);
          g.mesh.rotation.y = p.heading;
          g.mesh.visible = true;
        } else g.mesh.visible = false;
      } else g.mesh.visible = false;
    }
  }

  override dispose() {
    for (const [id, o] of this.karts) this.dropKart(id, o);
    for (const m of this.lightMats) m.dispose();
    super.dispose();
  }
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

/* ------------------------------ a player's view ----------------------------- */

/** A chase camera behind your own kart. */
export class RallyScene extends RallyWorld {
  private fovKick = 0;

  constructor(env: StageEnv, field: RallyField, o: Omit<RallySceneOptions, 'host'>) {
    super(env, field, { ...o, host: false });
  }

  protected glimBudget() {
    return 16;
  }

  protected shown(list: FieldKart[]) {
    const me = list.find((k) => k.me);
    if (this.o.trial) return me ? [me] : [];
    if (!me) return list.slice(0, 16);
    const len = this.path.length;
    const gap = (k: FieldKart) => {
      const d = Math.abs(lapPos(k.d - me.d + len / 2, len) - len / 2);
      return d;
    };
    return [me, ...list.filter((k) => !k.me && gap(k) < 90).sort((a, b) => gap(a) - gap(b)).slice(0, 15)];
  }

  protected override blocks(k: FieldKart): boolean {
    const me = this.field.me();
    if (!me || k.me) return false;
    const behind = me.d - k.d;
    return behind > 0.5 && behind < 8 && Math.abs(k.lane - me.lane) < 1.2;
  }

  tick(dt: number, t: number) {
    this.tickWorld(dt, t);
    const me = this.field.me();
    const d = me?.d ?? -2;
    const lane = me?.lane ?? 1;
    const off = laneOffset(lane) * 0.85;
    // Narrow screens stand a little further back.
    const far = this.camera.aspect < 0.8 ? 1.12 : 1;
    const behind = pointAt(this.path, d - 6.5 * far, off);
    const ahead = pointAt(this.path, d + 7, off);
    // Fixed to the kart rather than eased after it: on a slow device an eased camera falls far
    // behind a kart at speed. The kart's own lane change is already smoothed by the field.
    this.camera.position.set(behind.x, 3.1 * far, behind.z);
    this.camera.lookAt(ahead.x, 0.7, ahead.z);
    const boosting = me ? (me.flags & FLAG.boost) !== 0 : false;
    if (!this.env.reducedMotion) {
      this.fovKick += ((boosting ? 1 : 0) - this.fovKick) * Math.min(1, dt * 3);
      this.camera.fov = 58 + this.fovKick * 8;
      this.camera.updateProjectionMatrix();
    }
  }
}

/* -------------------------------- the big screen ------------------------------ */

/** The whole circuit from above, cutting to the trackside for the front of the race and the latest overtake. */
export class RallyHostScene extends RallyWorld {
  private focus: string | null = null;
  private focusUntil = 0;
  private nextCut = 8;
  private trackside = false;
  private spotD: number | null = null;

  constructor(env: StageEnv, field: RallyField, o: Omit<RallySceneOptions, 'host' | 'me'>) {
    super(env, field, { ...o, host: true, me: null });
    // The overview stands far back: push the fog out so the circuit stays clear.
    if (this.scene.fog instanceof Fog) {
      this.scene.fog.near = 260;
      this.scene.fog.far = 700;
    }
  }

  protected glimBudget() {
    return 24;
  }

  protected shown(list: FieldKart[]) {
    return [...list].sort((a, b) => (a.place || 999) - (b.place || 999)).slice(0, 40);
  }

  protected override crowdGap() {
    return this.trackside ? 9 : 12;
  }

  /** Cut to a kart for a few seconds (an overtake, a new leader). Ignored under reduced motion. */
  cutTo(id: string) {
    if (this.env.reducedMotion) return;
    this.focus = id;
    this.focusUntil = this.time + 6;
    this.trackside = true;
    this.nextCut = this.time + 6;
  }

  /** Whether the camera is at the trackside now (for the words beside the picture). */
  get atTrackside() {
    return this.trackside;
  }

  tick(dt: number, t: number) {
    this.tickWorld(dt, t);
    const b = trackBounds(this.path);
    // Alternate the overview with the battle at the front, unless motion is reduced.
    if (!this.env.reducedMotion && t >= this.nextCut) {
      this.trackside = !this.trackside;
      this.nextCut = t + (this.trackside ? 6 : 9);
      if (this.trackside && t > this.focusUntil) {
        const lead = this.field.list().filter((k) => !k.finished).sort((a, b) => (a.place || 999) - (b.place || 999))[0];
        this.focus = lead?.id ?? null;
      }
    }
    const k = this.focus ? this.field.karts.get(this.focus) : undefined;
    if (this.trackside && k && !this.env.reducedMotion) {
      // A camera standing on the kerb ahead, inside the lantern poles, watching the karts come by; when they
      // have gone past, it moves on up the road.
      if (this.spotD === null || k.d - this.spotD > 6 || this.spotD - k.d > 40) this.spotD = k.d + 26;
      const spot = pointAt(this.path, this.spotD, HALF + 1.2);
      const at = pointAt(this.path, k.d, 0);
      this.camera.position.set(spot.x, 3.4, spot.z);
      this.camera.lookAt(at.x, 0.8, at.z);
      return;
    }
    this.trackside = false;
    this.spotD = null;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const w = b.maxX - b.minX + 30;
    const h = b.maxZ - b.minZ + 30;
    const dist = Math.max(w / 2 / (tan * this.camera.aspect), h / 2 / tan) * 1.08;
    const drift = this.env.reducedMotion ? 0 : Math.sin(t * 0.05) * 6;
    // The overview hardly moves (a slow drift), so it is placed each frame rather than eased:
    // coming back from the trackside is a clean cut, as on television.
    this.camera.position.set(cx + drift, dist * 0.9, cz + dist * 0.42);
    this.camera.lookAt(cx, 0, cz + 6);
  }
}
