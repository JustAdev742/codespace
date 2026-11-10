import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { EaseCamera, Glim3D, NIGHT, World, css, props, toon, type GlimLook, type StageEnv } from '../../../three/index.ts';
import { toonRamp } from '../../../three/toon.ts';
import type { Label } from '../../../three/labels.ts';
import { BASE_R, CLIMB_H, ledgePoint, pathDirection, radiusAt } from './summit-layout.ts';

/*
 * Summit Scramble in 3D. A broad mountain at night, its front face climbed by
 * a path of ledges in switchbacks, with a camp at every turn: a tent, a flag
 * and a warm lantern. Two bands of cloud wrap the mountain, snow lies above
 * the second and falls near the top, and when the wind blows streaks of air
 * and snow race across the face. Every climber is their own Glim with a
 * lantern; ropes hang down from the ledges that hold them.
 *
 * `SummitScene` follows one climber (a player's own device); `SummitHostScene`
 * shows the whole mountain and every climber with their name. Scenes only
 * draw what the view says happened: a climber's new `seq` plays the move.
 */

export type MoveKind = 'climb' | 'leap' | 'slip' | 'pull' | 'pulled';

export interface SceneClimber {
  playerId: string;
  name: string;
  ledge: number;
  seq: number;
  kind: MoveKind | null;
  finished: number | null;
  isYou: boolean;
  look: GlimLook;
}

export interface SceneState {
  summit: number;
  climbers: SceneClimber[];
  ropes: number[];
  /** null: still air; false: the wind is coming; true: it is blowing. */
  wind: boolean | null;
  /** Camps somebody has reached (their ledges), for the flags. */
  reached: number[];
}

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

const ledgeGeo = new BoxGeometry(1.25, 0.26, 1.5);
const campGeo = new CylinderGeometry(1.5, 1.7, 0.34, 9);
const coilGeo = new TorusGeometry(0.17, 0.06, 5, 12).rotateX(Math.PI / 2);
const hangGeo = new CylinderGeometry(0.03, 0.03, 1, 4).translate(0, -0.5, 0);
const poleGeo = new CylinderGeometry(0.04, 0.05, 1, 6).translate(0, 0.5, 0);
const puffGeo = new IcosahedronGeometry(1, 1);
const coneGeo = new ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
const trunkGeo = new CylinderGeometry(0.1, 0.14, 1, 5).translate(0, 0.5, 0);
const streakGeo = new PlaneGeometry(1, 1);
for (const g of [ledgeGeo, campGeo, coilGeo, hangGeo, poleGeo, puffGeo, coneGeo, trunkGeo, streakGeo]) g.userData.shared = true;

function shared<T extends Mesh | InstancedMesh>(m: T): T {
  m.userData.sharedGeometry = true;
  return m;
}

const m4 = new Matrix4();
const q = new Quaternion();
const v = new Vector3();
const s3 = new Vector3();

/** A tiny noise from a seed, smooth enough for rock. */
function bumps(a: number, y: number): number {
  return Math.sin(a * 5 + y * 0.7) * 0.35 + Math.sin(a * 11 - y * 1.3) * 0.22 + Math.sin(a * 23 + y * 2.1) * 0.12;
}

/** The mountain: a faceted cone of rock with a snow cap, coloured by height in one mesh. */
function mountain(): Mesh {
  const pts: Vector2[] = [];
  const top = CLIMB_H + 0.4;
  pts.push(new Vector2(0.01, -1.5));
  pts.push(new Vector2(BASE_R + 2.5, -1.5));
  for (let i = 0; i <= 22; i++) {
    const y = (i / 22) * top;
    pts.push(new Vector2(radiusAt(y) - 0.25, y));
  }
  // A rounded snowy summit above the last ledge.
  const rTop = radiusAt(top) - 0.25;
  for (let i = 1; i <= 5; i++) {
    const k = i / 5;
    pts.push(new Vector2(Math.max(0.01, rTop * Math.cos((k * Math.PI) / 2)), top + Math.sin((k * Math.PI) / 2) * 2.2));
  }
  const lathe = new LatheGeometry(pts, 40);
  const geo = lathe.toNonIndexed();
  lathe.dispose();
  const pos = geo.getAttribute('position');
  const colours: number[] = [];
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.05 && y > -1.4) {
      const a = Math.atan2(z, x);
      // Push the rock in and out a little; less on the front face, where the ledges sit.
      const front = z > 0 ? 0.55 : 1;
      const k = 1 + (bumps(a, y) * front * 0.9) / Math.max(4, r);
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
  }
  geo.computeVertexNormals();
  // Colour each face by its height: dark forest at the foot, blue-grey rock, snow from the second cloud band up.
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const n = Math.sin(x * 1.7 + y * 0.9) * 0.5 + Math.sin(x * 0.6 - y * 2.3) * 0.5;
    if (y > 13.6 + n * 1.4) c.set(n > 0.3 ? '#f2f6ff' : '#d8e1f6');
    else if (y > 12.2 + n * 1.2) c.set('#a9b6dc');
    else if (y < 2.2 + n * 1.2) c.set(n > 0 ? '#3b5f62' : '#34565a');
    else {
      const l = 38 + n * 6 + (y / 14) * 12;
      c.copy(css(`hsl(${228 + n * 10} ${13 + n * 5}% ${l}%)`));
    }
    for (let k = 0; k < 3; k++) colours.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new Float32BufferAttribute(colours, 3));
  const mat = new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  const m = new Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

/** Distant ranges behind the mountain, dark against the sky with pale tips. */
function ranges(): Group {
  const g = new Group();
  const rnd = props.seeded(77);
  const rock = toon('#1c2650');
  const far = toon('#151d40');
  const snow = toon('#9fb0dc');
  for (let i = 0; i < 9; i++) {
    const h = 10 + rnd() * 14;
    const w = 10 + rnd() * 12;
    const back = i % 2 === 0;
    const peak = shared(new Mesh(coneGeo, back ? far : rock));
    peak.scale.set(w, h, w * 0.6);
    peak.position.set(-90 + i * 22 + rnd() * 8, -1, back ? -95 - rnd() * 15 : -62 - rnd() * 10);
    g.add(peak);
    const tip = shared(new Mesh(coneGeo, snow));
    tip.scale.set(w * 0.3, h * 0.3, w * 0.18);
    tip.position.set(peak.position.x, peak.position.y + h * 0.7, peak.position.z + 0.2);
    g.add(tip);
  }
  return g;
}

function starField(): Points {
  const rnd = props.seeded(404);
  const pos: number[] = [];
  for (let i = 0; i < 260; i++) {
    const a = Math.PI * (0.15 + rnd() * 0.7);
    const y = 0.12 + rnd() * 0.88;
    const r = Math.sqrt(1 - y * y);
    pos.push(Math.cos(a) * r * 300, y * 300, -Math.sin(a) * r * 300);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  const p = new Points(g, new PointsMaterial({ color: '#dfe6ff', size: 1.5, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
  p.frustumCulled = false;
  p.renderOrder = -9;
  return p;
}

/** Things that bob, flap and flicker each frame. */
interface Flag {
  cloth: Mesh;
  phase: number;
}

/* ------------------------------- a climber -------------------------------- */

interface Anim {
  kind: MoveKind | 'arrive';
  t: number;
  from: number;
  to: number;
  /** Where a slip was heading before it fell back. */
  aim: number;
  /** For a pull: where the rope comes from. */
  rope: Vector3 | null;
  celebrate: 'camp' | 'summit' | null;
}

interface Climber {
  id: string;
  /** The name tag reads this (or a crowd tag lists it). */
  name: string;
  glim: Glim3D;
  lamp: Group | null;
  glow: Sprite | null;
  label: Label | null;
  /** The ledge drawn now (fractional while moving). */
  shown: number;
  /** The ledge the view says. */
  target: number;
  seq: number;
  finished: number | null;
  anim: Anim | null;
  queue: Anim[];
  slot: Vector3;
  facing: number;
  rope: Mesh | null;
}

export interface SummitOptions {
  host: boolean;
  night: boolean;
  summit: number;
  /** The climber this device follows (player screens). */
  me: string | null;
}

const ROPE_COLOUR = '#d9b77a';

/** The mountain and everything on it: both scenes are this with a different camera. */
export abstract class SummitWorld extends World {
  protected readonly summit: number;
  protected climbers = new Map<string, Climber>();
  protected readonly o: SummitOptions;
  private ropeGroup = new Group();
  private ropeKey = '';
  private flags: Flag[] = [];
  private campLights: Sprite[] = [];
  private streaks: InstancedMesh;
  private streakData: { x: number; y: number; z: number; speed: number; len: number }[] = [];
  private snow: Points | null = null;
  private snowBase: Float32Array | null = null;
  private stars: Points;
  private cloudGroups: Group[] = [];
  private cloudY: number[] = [];
  /** 0 still, 0.35 when it is coming, 1 while it blows: eased. */
  protected windLevel = 0;
  private windTarget = 0;
  private reached = new Set<number>();
  private campPos = new Map<number, Vector3>();
  private glimScale: number;
  private time = 0;
  private lookOf = new Map<string, GlimLook>();
  private crowds = new Map<number, { anchor: Object3D; label: Label }>();

  constructor(env: StageEnv, o: SummitOptions) {
    const lighting = o.night ? { ...NIGHT, sunIntensity: 1.1, fill: 0.9, fogNear: o.host ? 80 : 30, fogFar: o.host ? 200 : 110 } : { ...NIGHT, sunIntensity: 1.9, fill: 1.35, fogNear: o.host ? 90 : 40, fogFar: o.host ? 240 : 150 };
    super(env, { ...lighting, sun: '#dfe4ff', skyTop: '#0a1030', ground: '#2a2f48', sunFrom: [-6, 9, 10], horizon: '#24346e' }, o.host ? 40 : 50);
    this.o = o;
    this.summit = o.summit;
    this.glimScale = o.host ? 1.85 : 1.05;
    const q0 = env.quality;
    const ink = q0.outlines;

    this.scene.add(mountain());
    this.scene.add(ranges());
    this.stars = starField();
    this.scene.add(this.stars);
    // The moon, low behind the left shoulder, and a cold glow round it.
    const moon = new Mesh(new IcosahedronGeometry(1, 2), new MeshBasicMaterial({ color: '#f3efe0', fog: false }));
    moon.scale.setScalar(7);
    moon.position.set(-70, 62, -150);
    this.scene.add(moon);
    const moonGlow = glowSprite('#bfcaff', 55, 0.3);
    moonGlow.position.copy(moon.position);
    this.scene.add(moonGlow);

    // The ground round the foot: a dark meadow with pines.
    const meadow = props.ground(260, 200, '#1e3440');
    meadow.position.set(0, -1.45, -20);
    this.scene.add(meadow);
    this.forest(q0.drawDistance);

    // The path: a pale trail through every ledge, then the ledges themselves.
    const pts: Vector3[] = [];
    for (let l = 0; l <= this.summit; l += 0.25) {
      const p = ledgePoint(l, this.summit);
      pts.push(new Vector3(p.x, p.y + 0.05, p.z + 0.25));
    }
    const trail = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), this.summit * 6, 0.09, 4, false), toon('#e9d6a8', { glow: 0.22 }));
    this.scene.add(trail);
    const ledges = shared(new InstancedMesh(ledgeGeo, toon('#e2c690', { glow: 0.14 }), this.summit));
    let n = 0;
    for (let l = 1; l < this.summit; l++) {
      if (l % 10 === 0) continue;
      const p = ledgePoint(l, this.summit);
      const dir = pathDirection(l, this.summit);
      q.setFromAxisAngle(v.set(0, 1, 0), Math.atan2(p.x, p.z) * 0.6 + dir * 0.05);
      m4.compose(v.set(p.x, p.y - 0.13, p.z - 0.25), q, s3.set(1, 1, 1));
      ledges.setMatrixAt(n++, m4);
    }
    ledges.count = n;
    ledges.receiveShadow = true;
    this.scene.add(ledges);

    // Boulders and outcrops on the face, off the path.
    {
      const rnd = props.seeded(17);
      const rockGeo = new IcosahedronGeometry(1, 0);
      const parts: Matrix4[] = [];
      for (let i = 0; i < 140 && parts.length < 70; i++) {
        const y = rnd() * (CLIMB_H - 1);
        const a = Math.PI * (0.08 + rnd() * 0.84);
        const r = radiusAt(y) - 0.15;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        let clear = true;
        for (let l = 0; l <= this.summit && clear; l += 0.5) {
          const p = ledgePoint(l, this.summit);
          if (Math.abs(p.y - y) < 1.2 && Math.abs(p.x - x) < 1.6) clear = false;
        }
        if (!clear) continue;
        const sz = 0.25 + rnd() * 0.45;
        q.setFromAxisAngle(v.set(rnd(), rnd(), rnd()).normalize(), rnd() * 3);
        parts.push(new Matrix4().compose(new Vector3(x, y, z), q.clone(), new Vector3(sz * 1.3, sz * 0.8, sz)));
      }
      const rocks = shared(new InstancedMesh(rockGeo, toon('#ffffff'), parts.length));
      const tint = new Color();
      parts.forEach((m, i) => {
        rocks.setMatrixAt(i, m);
        const y = m.elements[13]!;
        rocks.setColorAt(i, tint.copy(css(y > 13.5 ? 'hsl(225 20% 82%)' : `hsl(${226 + (i % 3) * 6} 12% ${44 + (i % 4) * 4}%)`)));
      });
      rocks.castShadow = env.quality.shadows;
      this.scene.add(rocks);
    }

    // Camps at every turn, the base camp at the foot and the summit at the top.
    for (let c = 0; c <= this.summit; c += 10) this.camp(c, ink);

    // Two bands of cloud wrapped round the mountain.
    for (const [y, seed] of [
      [7.5, 3],
      [13.8, 9],
    ] as const)
      this.cloudBand(y, seed);

    // Wind: streaks of air that race across the face while it blows.
    const streakMat = new MeshBasicMaterial({ color: '#dfe8ff', transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
    const streakCount = Math.round(40 * Math.max(0.4, q0.particles));
    this.streaks = shared(new InstancedMesh(streakGeo, streakMat, streakCount));
    this.streaks.frustumCulled = false;
    const rs = props.seeded(21);
    for (let i = 0; i < streakCount; i++) {
      const y = rs() * (CLIMB_H + 3);
      this.streakData.push({ x: -40 + rs() * 80, y, z: radiusAt(y) * 0.6 + 2 + rs() * 6, speed: 14 + rs() * 12, len: 2 + rs() * 4 });
    }
    this.scene.add(this.streaks);

    // Snow falling round the top (not on low graphics, and still under reduced motion).
    if (q0.tier !== 'low') {
      const count = Math.round(260 * q0.particles);
      const rnd = props.seeded(5);
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const y = 11 + rnd() * 16;
        const r = radiusAt(Math.min(y, CLIMB_H)) + 1 + rnd() * 9;
        const a = rnd() * Math.PI;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = Math.sin(a) * r;
      }
      this.snowBase = pos.slice();
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      this.snow = new Points(g, new PointsMaterial({ color: '#f2f6ff', size: o.host ? 0.18 : 0.09, transparent: true, opacity: 0.85, depthWrite: false }));
      this.snow.frustumCulled = false;
      this.scene.add(this.snow);
    }
    this.scene.add(this.ropeGroup);
    this.shadowArea(14, [0, 10, 8]);
  }

  private forest(drawDistance: number) {
    const rnd = props.seeded(31);
    const spots: [number, number, number, number][] = [];
    for (let i = 0; i < 70; i++) {
      const a = Math.PI * (0.02 + rnd() * 0.96);
      const r = BASE_R + 2 + rnd() * 26;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.75 - 4;
      if (Math.hypot(x, z) > drawDistance) continue;
      // Keep the base camp clear.
      const foot = ledgePoint(0, this.summit);
      if (Math.hypot(x - foot.x, z - foot.z) < 5) continue;
      spots.push([x, z, 0.8 + rnd() * 0.9, -1.45]);
    }
    // Pines on the lower slopes too, but never on the path.
    for (let i = 0; i < 40; i++) {
      const y = rnd() * 2.6;
      const a = Math.PI * (0.03 + rnd() * 0.94);
      const r = radiusAt(y) - 0.3;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      let clear = true;
      for (let l = 0; l <= this.summit * 0.25 && clear; l += 0.5) {
        const p = ledgePoint(l, this.summit);
        if (Math.hypot(x - p.x, z - p.z) < 2.6 && Math.abs(y - p.y) < 2.5) clear = false;
      }
      if (clear) spots.push([x, z, 0.55 + rnd() * 0.45, y]);
    }
    const trunks = shared(new InstancedMesh(trunkGeo, toon('#3a2a30'), spots.length));
    const lower = shared(new InstancedMesh(coneGeo, toon('#1f4a48'), spots.length));
    const upper = shared(new InstancedMesh(coneGeo, toon('#2a5e58'), spots.length));
    spots.forEach(([x, z, s, y], i) => {
      q.identity();
      m4.compose(v.set(x, y, z), q, s3.set(s, s * 0.7, s));
      trunks.setMatrixAt(i, m4);
      m4.compose(v.set(x, y + s * 0.5, z), q, s3.set(s * 1.1, s * 1.6, s * 1.1));
      lower.setMatrixAt(i, m4);
      m4.compose(v.set(x, y + s * 1.3, z), q, s3.set(s * 0.75, s * 1.3, s * 0.75));
      upper.setMatrixAt(i, m4);
    });
    this.scene.add(trunks, lower, upper);
  }

  private camp(ledge: number, ink: boolean) {
    const p = ledgePoint(ledge, this.summit);
    const at = new Vector3(p.x, p.y, p.z - 0.4);
    this.campPos.set(ledge, at);
    const g = new Group();
    g.position.copy(at);
    const base = ledge === 0;
    const top = ledge === this.summit;
    const pad = shared(new Mesh(campGeo, toon(top ? '#e9eefb' : '#bba27a')));
    pad.position.y = -0.17;
    pad.scale.set(base ? 2.2 : 1, 1, base ? 1.6 : 0.95);
    pad.receiveShadow = true;
    g.add(pad);
    if (!top) {
      const tent = props.tent({ ink, color: base ? '#e7d6b0' : ledge % 20 === 0 ? '#ff8a5a' : '#ffc45a', scale: 0.55 });
      tent.position.set(pathDirection(ledge, this.summit) * (base ? 1.8 : -0.75), 0, -0.55);
      tent.rotation.y = 0.3;
      g.add(tent);
    }
    // The flag: a pole and a cloth that flaps (harder in the wind).
    const pole = shared(new Mesh(poleGeo, toon('#3a3550')));
    const h = top ? 3 : 1.9;
    pole.scale.y = h;
    const fx = top ? 0 : pathDirection(ledge, this.summit) * 0.85;
    pole.position.set(fx, 0, 0.1);
    g.add(pole);
    const cloth = new Mesh(new PlaneGeometry(top ? 1.3 : 0.8, top ? 0.8 : 0.5, 6, 1).translate(top ? 0.65 : 0.4, 0, 0), toon(top ? '#ffc233' : '#ff4d6a', { unique: true }));
    (cloth.material as MeshToonMaterial).side = DoubleSide;
    cloth.position.set(fx, h - (top ? 0.45 : 0.3), 0.1);
    g.add(cloth);
    this.flags.push({ cloth, phase: ledge * 0.37 });
    // A lantern on a post, and its warm light as a glow (a point light would cut hard discs in toon shading).
    {
      const lamp = props.lampPost({ ink, height: top ? 1.6 : 1.25, hue: 40 });
      lamp.scale.setScalar(0.7);
      const lx = top ? -0.9 : -fx * 0.9;
      lamp.position.set(lx, 0, 0.35);
      g.add(lamp);
      const glow = glowSprite('#ffc27a', top ? 6 : 4.2, 0.5);
      glow.position.set(lx, (top ? 1.6 : 1.25) * 0.7 + 0.2, 0.4);
      g.add(glow);
      this.campLights.push(glow);
    }
    if (top) {
      const beacon = glowSprite('#ffd27a', 12, 0.35);
      beacon.position.set(0, 1.8, 0);
      g.add(beacon);
      this.campLights.push(beacon);
    }
    this.scene.add(g);
    if (this.o.host && ledge > 0) {
      const tag = new Object3D();
      tag.position.copy(at).add(new Vector3(0, top ? 3.6 : 2.4, 0));
      this.scene.add(tag);
      this.labels.add(tag, top ? 'Summit' : `Camp ${ledge / 10}`, { offsetY: 0, className: 'small tone-dim' });
    }
  }

  private cloudBand(y: number, seed: number) {
    const rnd = props.seeded(seed);
    const parts: { p: Vector3; s: Vector3 }[] = [];
    for (let i = 0; i < 60; i++) {
      const a = Math.PI * (-0.1 + rnd() * 1.2);
      const r = radiusAt(y) + 0.5 + rnd() * 5;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Thin in front of the path, so the climbers still show through.
      if (z > 0 && Math.abs(x) < radiusAt(y) * 0.95 && rnd() < 0.85) continue;
      const s = 0.9 + rnd() * 1.4;
      parts.push({ p: new Vector3(x, y + (rnd() - 0.5) * 1.4, z), s: new Vector3(s * 1.8, s * 0.7, s * 1.2) });
    }
    const g = new Group();
    for (const [colour, opacity, k] of [
      ['#9fb0e0', 0.2, 1.25],
      ['#dfe6fa', 0.42, 0.8],
    ] as const) {
      const mat = toon(colour, { transparent: true, opacity, unique: true });
      mat.depthWrite = false;
      const puffs = shared(new InstancedMesh(puffGeo, mat, parts.length));
      parts.forEach((c, i) => {
        q.identity();
        m4.compose(c.p, q, s3.copy(c.s).multiplyScalar(k));
        puffs.setMatrixAt(i, m4);
      });
      puffs.renderOrder = 2;
      g.add(puffs);
    }
    this.cloudGroups.push(g);
    this.cloudY.push(y);
    this.scene.add(g);
  }

  /* ------------------------------- the state ------------------------------- */

  setState(s: SceneState) {
    // Wind.
    this.windTarget = s.wind === true ? 1 : s.wind === false ? 0.35 : 0;
    // Camp flags go up once someone has reached the camp.
    for (const c of s.reached) this.reached.add(c);
    // Ropes hanging from the ledges that hold them.
    const key = s.ropes.join(',');
    if (key !== this.ropeKey) {
      this.ropeKey = key;
      for (const child of this.ropeGroup.children) if (child instanceof Sprite) child.material.dispose();
      this.ropeGroup.clear();
      const coilMat = toon(ROPE_COLOUR);
      for (const l of s.ropes) {
        const p = ledgePoint(l, this.summit);
        const dir = pathDirection(l, this.summit);
        const coil = shared(new Mesh(coilGeo, coilMat));
        coil.position.set(p.x + dir * 0.35, p.y + 0.06, p.z - 0.15);
        this.ropeGroup.add(coil);
        const hang = shared(new Mesh(hangGeo, coilMat));
        hang.position.set(p.x - dir * 0.4, p.y, p.z + 0.45);
        hang.scale.set(this.o.host ? 2.2 : 1.2, 2.6, this.o.host ? 2.2 : 1.2);
        hang.rotation.z = dir * 0.12;
        this.ropeGroup.add(hang);
        const tip = glowSprite('#ffe1a0', 0.9, 0.55);
        tip.position.set(p.x - dir * 0.4, p.y + 0.15, p.z + 0.5);
        this.ropeGroup.add(tip);
      }
    }
    // Climbers.
    const ids = new Set(s.climbers.map((c) => c.playerId));
    for (const [id, c] of this.climbers) if (!ids.has(id)) this.drop(id, c);
    for (const sc of s.climbers) {
      this.lookOf.set(sc.playerId, sc.look);
      let c = this.climbers.get(sc.playerId);
      if (!c) {
        c = this.add(sc);
        continue;
      }
      c.name = this.labelText(sc);
      if (c.label) c.label.set(c.name);
      if (sc.seq !== c.seq) {
        const from = c.target;
        c.seq = sc.seq;
        c.target = sc.ledge;
        const celebrate = sc.finished !== null && c.finished === null ? 'summit' : this.passedCamp(from, sc.ledge) ? 'camp' : null;
        c.finished = sc.finished;
        const kind = sc.kind ?? 'climb';
        const anim: Anim = { kind, t: 0, from, to: sc.ledge, aim: Math.min(this.summit, from + 3), rope: null, celebrate };
        if (kind === 'pulled') {
          // The rope comes down from the climber who threw it: whoever is just above.
          const above = [...this.climbers.values()].filter((o) => o !== c && o.target >= sc.ledge).sort((a, b) => a.target - b.target)[0];
          anim.rope = above ? above.glim.position.clone().add(new Vector3(0, 0.6 * this.glimScale, 0)) : null;
        }
        c.queue.push(anim);
      } else if (sc.ledge !== c.target && !c.anim && !c.queue.length) {
        c.target = sc.ledge;
        c.shown = sc.ledge;
      }
    }
  }

  protected labelText(sc: SceneClimber): string {
    if (sc.isYou) return 'You';
    return sc.finished ? `${sc.name} (summit)` : sc.name;
  }

  private passedCamp(from: number, to: number): boolean {
    for (let c = 10; c < this.summit; c += 10) if (from < c && to >= c) return true;
    return false;
  }

  private add(sc: SceneClimber): Climber {
    const glim = new Glim3D({ look: sc.look, quality: this.env.quality, reducedMotion: this.env.reducedMotion });
    glim.scale.setScalar(this.glimScale);
    this.scene.add(glim);
    // Lanterns in hand: a real lantern for the climbers near you, just its glow on the big screen.
    let lamp: Group | null = null;
    let glow: Sprite | null = null;
    if (!this.o.host || sc.isYou) {
      lamp = props.lantern({ scale: 0.32, ink: this.env.quality.outlines && sc.isYou });
      lamp.position.set(0.32, 0.32, 0.12);
      glim.add(lamp);
    }
    if (this.env.quality.tier !== 'low' || sc.isYou || !this.o.host) {
      glow = glowSprite('#ffcf7a', sc.isYou ? 2.4 : this.o.host ? 1.6 : 1.6, sc.isYou ? 0.55 : 0.4);
      glow.position.set(0.32, 0.45, 0.15);
      glim.add(glow);
    }
    const label = this.o.host || sc.isYou || this.climbers.size < 8 ? this.labels.add(glim, this.labelText(sc), { offsetY: (sc.isYou ? 1.25 : 1.0) * this.glimScale, className: sc.isYou ? 'me small' : 'small', maxDistance: this.o.host ? 200 : 30 }) : null;
    const c: Climber = { id: sc.playerId, name: this.labelText(sc), glim, lamp, glow, label, shown: sc.ledge, target: sc.ledge, seq: sc.seq, finished: sc.finished, anim: null, queue: [], slot: new Vector3(), facing: 0, rope: null };
    this.climbers.set(sc.playerId, c);
    return c;
  }

  private drop(id: string, c: Climber) {
    this.labels.remove(c.label);
    c.rope?.removeFromParent();
    c.glim.dispose();
    this.climbers.delete(id);
  }

  /* -------------------------------- drawing -------------------------------- */

  /** Where a climber stands on a (fractional) ledge, with their place in the crowd on it. */
  protected spot(ledge: number, slot: Vector3, out = new Vector3()): Vector3 {
    const p = ledgePoint(ledge, this.summit);
    return out.set(p.x + slot.x, p.y + slot.y, p.z - 0.25 + slot.z);
  }

  /** Spread climbers who share a ledge, so nobody hides behind anyone. */
  private placeSlots() {
    const groups = new Map<number, Climber[]>();
    for (const c of this.climbers.values()) {
      const l = Math.round(c.target);
      const list = groups.get(l) ?? [];
      list.push(c);
      groups.set(l, list);
    }
    for (const [ledge, list] of groups) {
      list.sort((a, b) => (a.id === this.o.me ? -1 : b.id === this.o.me ? 1 : a.id.localeCompare(b.id)));
      const wide = ledge === 0 ? 7 : ledge % 10 === 0 ? 4 : 3;
      const gap = ledge === 0 ? 0.95 : ledge % 10 === 0 ? 0.75 : 0.62;
      const dir = pathDirection(ledge, this.summit);
      list.forEach((c, i) => {
        const col = i % wide;
        const row = Math.floor(i / wide);
        const x = (col - (Math.min(wide, list.length) - 1) / 2) * gap * (this.o.host ? 1.5 : 1);
        c.slot.set(x - (ledge === 0 ? dir * 1.2 : 0), 0, row * 0.55 - (ledge === 0 ? 0.6 : 0));
        if (c.label) c.label.offsetY = (c.id === this.o.me ? 1.25 : 1.0) * this.glimScale;
      });
    }
    this.crowdTags(groups);
  }

  /**
   * Climbers who share a ledge would cover each other's name tags, so a crowd gets one tag that
   * lists them all, stacked, instead (on the big screen from two climbers; on a phone from three,
   * with your own "You" tag kept).
   */
  private crowdTags(groups: Map<number, Climber[]>) {
    const min = this.o.host ? 2 : 3;
    const seen = new Set<number>();
    // Climbers on the same or the next ledge count as one crowd: their tags would touch.
    const clusters: { ledges: number[]; list: Climber[] }[] = [];
    for (const ledge of [...groups.keys()].sort((a, b) => a - b)) {
      const last = clusters[clusters.length - 1];
      if (last && ledge - last.ledges[last.ledges.length - 1]! <= 1) {
        last.ledges.push(ledge);
        last.list.push(...groups.get(ledge)!);
      } else clusters.push({ ledges: [ledge], list: [...groups.get(ledge)!] });
    }
    for (const { ledges, list } of clusters) {
      const ledge = ledges[0]!;
      const others = list.filter((c) => c.id !== this.o.me && (this.o.host || c.label));
      const crowded = others.length >= min;
      for (const c of others) if (c.label) c.label.visible = !crowded;
      if (!crowded) continue;
      seen.add(ledge);
      let tag = this.crowds.get(ledge);
      if (!tag) {
        const anchor = new Object3D();
        this.scene.add(anchor);
        const label = this.labels.add(anchor, '', { offsetY: 1.15 * this.glimScale, className: 'small', maxDistance: this.o.host ? 200 : 30 });
        // A stacked list rather than a pill: one name per line.
        Object.assign(label.el.style, { whiteSpace: 'pre-line', borderRadius: '10px', textAlign: 'center', lineHeight: '1.3', maxWidth: '13rem' });
        tag = { anchor, label };
        this.crowds.set(ledge, tag);
      }
      const p = ledgePoint((ledges[0]! + ledges[ledges.length - 1]!) / 2, this.summit);
      tag.anchor.position.set(p.x, p.y, p.z - 0.25);
      const names = others.map((c) => c.name).sort((a, b) => a.localeCompare(b));
      const shown = names.length > 6 ? [...names.slice(0, 5), `and ${names.length - 5} more`] : names;
      tag.label.set(shown.join('\n'));
    }
    for (const [ledge, tag] of this.crowds) {
      if (seen.has(ledge)) continue;
      this.labels.remove(tag.label);
      tag.anchor.removeFromParent();
      this.crowds.delete(ledge);
    }
  }

  private easeInOut(k: number) {
    return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  }

  private stepClimber(c: Climber, dt: number) {
    const calm = this.env.reducedMotion;
    if (!c.anim && c.queue.length) {
      c.anim = c.queue.shift()!;
      this.startAnim(c, c.anim);
    }
    const g = c.glim;
    const base = this.spot(c.shown, c.slot, v);
    let lift = 0;
    let squash = 1;
    const a = c.anim;
    if (a) {
      a.t += dt;
      const fast = c.queue.length > 1 ? 2.2 : 1;
      a.t += dt * (fast - 1);
      switch (a.kind) {
        case 'climb': {
          const k = Math.min(1, a.t / 0.55);
          c.shown = a.from + (a.to - a.from) * this.easeInOut(k);
          lift = Math.sin(k * Math.PI) * (calm ? 0.15 : 0.55);
          if (k >= 1) this.endAnim(c);
          break;
        }
        case 'leap': {
          // Wind up (a crouch), then a big jump.
          if (a.t < 0.35) squash = 1 - Math.sin((a.t / 0.35) * Math.PI * 0.5) * 0.25;
          else {
            const k = Math.min(1, (a.t - 0.35) / 0.8);
            c.shown = a.from + (a.to - a.from) * this.easeInOut(k);
            lift = Math.sin(k * Math.PI) * (calm ? 0.4 : 1.8);
            squash = k < 0.15 ? 1.15 : 1;
            if (k >= 1) this.endAnim(c);
          }
          break;
        }
        case 'slip': {
          // The same wind-up and jump, but it falls short and scrambles back down.
          if (a.t < 0.35) squash = 1 - Math.sin((a.t / 0.35) * Math.PI * 0.5) * 0.25;
          else if (a.t < 0.85) {
            const k = (a.t - 0.35) / 0.5;
            c.shown = a.from + (a.aim - a.from) * 0.45 * k;
            lift = Math.sin(k * Math.PI * 0.6) * (calm ? 0.3 : 1.3);
          } else {
            const k = Math.min(1, (a.t - 0.85) / 0.6);
            const top = a.from + (a.aim - a.from) * 0.45;
            c.shown = top + (a.to - top) * k;
            lift = Math.sin(0.6 * Math.PI) * (calm ? 0.3 : 1.3) * (1 - k);
            if (k >= 1) {
              g.play('hit');
              g.setExpression('dizzy', 1.6);
              this.fx.burst(this.spot(a.to, c.slot), { color: ['#c4d0ec', '#8c9cc4'], shape: 'dot', count: 22, speed: 2, gravity: 4, size: 0.18 });
              this.endAnim(c);
            }
          }
          break;
        }
        case 'pulled': {
          const k = Math.min(1, a.t / 1.2);
          c.shown = a.from + (a.to - a.from) * this.easeInOut(k);
          if (a.rope) this.drawRope(c, a.rope, this.spot(c.shown, c.slot, new Vector3()).add(new Vector3(0, 0.5 * this.glimScale, 0)));
          if (k >= 1) {
            c.rope?.removeFromParent();
            c.rope = null;
            g.setExpression('happy', 1.4);
            this.endAnim(c);
          }
          break;
        }
        case 'pull': {
          if (a.t > 1.2) this.endAnim(c);
          break;
        }
        default:
          this.endAnim(c);
      }
    } else if (Math.abs(c.shown - c.target) > 0.001) c.shown = c.target;
    this.spot(c.shown, c.slot, base);
    g.position.set(base.x, base.y + lift, base.z);
    g.scale.set(this.glimScale * (2 - squash) * 0.5 + this.glimScale * 0.5, this.glimScale * squash, this.glimScale);
    // Face the way the path runs while moving; face out of the mountain at rest.
    const moving = a && (a.kind === 'climb' || a.kind === 'leap' || a.kind === 'pulled' || a.kind === 'slip');
    // Glims are flat-ish figures, so they turn to the camera (and lean into the path while they move).
    const toCam = Math.atan2(this.camera.position.x - g.position.x, this.camera.position.z - g.position.z);
    const want = toCam + (moving ? (a.to >= a.from ? 1 : -1) * pathDirection(c.shown, this.summit) * 0.8 : 0);
    c.facing += (want - c.facing) * Math.min(1, dt * 8);
    g.rotation.y = c.facing;
    g.setMoving(moving && a.kind === 'climb' ? 0.8 : 0);
    g.update(dt);
  }

  private startAnim(c: Climber, a: Anim) {
    if (a.kind === 'leap' || a.kind === 'slip') c.glim.setExpression('determined', 1.2);
    if (a.kind === 'pull') {
      c.glim.play('point');
      c.glim.setExpression('proud', 1.4);
    }
  }

  private endAnim(c: Climber) {
    const a = c.anim;
    c.anim = null;
    if (!a) return;
    c.shown = a.to;
    if (a.celebrate === 'summit') {
      c.glim.play('celebrate');
      c.glim.setExpression('happy', 2.5);
      this.fx.burst(this.spot(a.to, c.slot).add(new Vector3(0, 1, 0)), { color: ['#ffc233', '#ffffff', '#ff8a5a', '#3d9bff'], shape: 'star', glow: true, count: 70, speed: 5 });
    } else if (a.celebrate === 'camp') {
      c.glim.play('cheer');
      c.glim.setExpression('happy', 1.8);
      this.fx.burst(this.spot(a.to, c.slot).add(new Vector3(0, 1, 0)), { color: ['#ffc233', '#ff4d6a', '#1fd38f', '#ffffff'], shape: 'square', count: 36, speed: 3.5, gravity: 5 });
    } else if (a.kind === 'leap') {
      c.glim.play('cheer');
      this.fx.burst(this.spot(a.to, c.slot), { color: ['#ffe1a0', '#ffffff'], shape: 'spark', glow: true, count: 14, speed: 2 });
    }
  }

  private drawRope(c: Climber, from: Vector3, to: Vector3) {
    if (!c.rope) {
      c.rope = shared(new Mesh(hangGeo, toon(ROPE_COLOUR)));
      this.scene.add(c.rope);
    }
    const d = to.clone().sub(from);
    c.rope.position.copy(from);
    c.rope.scale.set(1.4, d.length(), 1.4);
    c.rope.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), d.normalize());
  }

  protected tickWorld(dt: number, t: number) {
    this.time += dt;
    const calm = this.env.reducedMotion;
    this.windLevel += (this.windTarget - this.windLevel) * Math.min(1, dt * 1.5);
    this.placeSlots();
    for (const c of this.climbers.values()) this.stepClimber(c, dt);
    // Flags flap, harder in the wind.
    for (const f of this.flags) {
      const pos = f.cloth.geometry.getAttribute('position');
      const amp = calm ? 0.02 : 0.05 + this.windLevel * 0.18;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, Math.sin(x * 6 - t * (3 + this.windLevel * 9) + f.phase) * amp * x);
      }
      pos.needsUpdate = true;
    }
    // Lantern flicker.
    if (!calm) this.campLights.forEach((l, i) => ((l.material as SpriteMaterial).opacity = 0.42 + Math.sin(t * 7 + i * 1.7) * 0.05 + Math.sin(t * 13 + i) * 0.03));
    // Wind streaks.
    const sm = this.streaks.material as MeshBasicMaterial;
    sm.opacity = this.windLevel * (calm ? 0.25 : 0.45);
    this.streaks.visible = this.windLevel > 0.02;
    if (this.streaks.visible) {
      const speedK = calm ? 0.3 : 0.4 + this.windLevel * 0.9;
      this.streakData.forEach((d, i) => {
        d.x += d.speed * dt * speedK;
        if (d.x > 40) d.x = -40;
        q.identity();
        m4.compose(v.set(d.x, d.y + Math.sin(d.x * 0.3 + i) * 0.3, d.z), q, s3.set(d.len * (0.4 + this.windLevel) * (this.o.host ? 1.6 : 1), this.o.host ? 0.16 : 0.05, 1));
        this.streaks.setMatrixAt(i, m4);
      });
      this.streaks.instanceMatrix.needsUpdate = true;
    }
    // Snow: drifts down, and sideways in the wind.
    if (this.snow && this.snowBase && !calm) {
      const pos = this.snow.geometry.getAttribute('position') as Float32BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1]! -= dt * (0.6 + (i % 7) * 0.08);
        arr[i]! += dt * (Math.sin(t + i) * 0.2 + this.windLevel * 7);
        if (arr[i + 1]! < 11) {
          arr[i + 1] = 27;
          arr[i] = this.snowBase[i]!;
        }
        if (arr[i]! > 30) arr[i] = -30;
      }
      pos.needsUpdate = true;
    }
    // Clouds drift slowly, and thin out round a camera passing through them.
    this.cloudGroups.forEach((g, i) => {
      if (!calm) g.rotation.y = Math.sin(t * 0.03 + i) * 0.04;
      const near = Math.min(1, Math.max(0.25, Math.abs(this.camera.position.y - (this.cloudY[i] ?? 0)) / 3.5));
      g.children.forEach((m, k) => (((m as Mesh).material as MeshToonMaterial).opacity = (k === 0 ? 0.2 : 0.42) * near));
    });
    this.stars.position.copy(this.camera.position);
  }

  /** A climber's Glim, for the camera to follow. */
  protected climberPos(id: string | null): Vector3 | null {
    const c = id ? this.climbers.get(id) : undefined;
    return c ? c.glim.position : null;
  }

  protected shownLedge(id: string | null): number | null {
    const c = id ? this.climbers.get(id) : undefined;
    return c ? c.shown : null;
  }

  override dispose() {
    for (const [id, c] of this.climbers) this.drop(id, c);
    super.dispose();
  }
}

/* ------------------------------ a player's view ----------------------------- */

/** Follows one climber up the mountain. */
export class SummitScene extends SummitWorld {
  private cam: EaseCamera;
  private look = new Vector3();

  constructor(env: StageEnv, o: Omit<SummitOptions, 'host'>) {
    super(env, { ...o, host: false });
    this.cam = new EaseCamera(this.camera, env.reducedMotion);
  }

  tick(dt: number, t: number) {
    this.tickWorld(dt, t);
    const pos = this.climberPos(this.o.me);
    const ledge = this.shownLedge(this.o.me) ?? 0;
    const p = pos ?? this.spot(0, new Vector3());
    // Look along the path to the ledges ahead; narrow screens stand further back.
    const dir = pathDirection(ledge, this.summit);
    const far = this.camera.aspect < 0.8 ? 1.2 : this.camera.aspect < 1.2 ? 1.08 : 1;
    const ahead = Math.min(this.summit, ledge + 2.5);
    const a = ledgePoint(ahead, this.summit);
    this.look.set(p.x + (a.x - p.x) * 0.3, p.y + (a.y - p.y) * 0.3 + 0.6, p.z + (a.z - p.z) * 0.3);
    const out = new Vector3(p.x, 0, p.z).normalize();
    if (!Number.isFinite(out.x)) out.set(0, 0, 1);
    const camAt = new Vector3(p.x + out.x * 6.2 * far - dir * 1.2, p.y + 2.1 * far, p.z + out.z * 6.2 * far + 1.4);
    this.cam.set(camAt, this.look);
    this.cam.update(dt);
  }
}

/* -------------------------------- the big screen ------------------------------ */

/** The whole mountain, every climber and their names. */
export class SummitHostScene extends SummitWorld {
  private cam: EaseCamera;

  constructor(env: StageEnv, o: Omit<SummitOptions, 'host' | 'me'>) {
    super(env, { ...o, host: true, me: null });
    this.cam = new EaseCamera(this.camera, env.reducedMotion);
  }

  tick(dt: number, t: number) {
    this.tickWorld(dt, t);
    // Fit the whole face: its width at the foot and its height to the summit flag.
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const w = BASE_R * 1.62;
    const h = CLIMB_H + 7;
    const dist = Math.max(w / 2 / (tan * this.camera.aspect), h / 2 / tan) * 1.02;
    const midY = CLIMB_H / 2 + 1.2;
    const drift = this.env.reducedMotion ? 0 : Math.sin(t * 0.05) * 1.2;
    this.cam.set([drift, midY + 2, dist + 12], [0, midY - 0.4, 6]);
    this.cam.update(dt);
  }
}
