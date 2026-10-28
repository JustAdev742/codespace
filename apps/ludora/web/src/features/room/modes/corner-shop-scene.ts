import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Euler,
  Float32BufferAttribute,
  BufferGeometry as Geometry,
  Group,
  InstancedMesh,
  type Material,
  Matrix3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { GlimArt } from '@ludora/shared';
import type { CrateId, LineId, ProductId } from '@ludora/engine/corner-shop';
import { LINES, PRODUCTS } from '@ludora/engine/corner-shop';
import { DAY, EaseCamera, Glim3D, World, css, props, toon, type GlimLook, type StageEnv } from '../../../three/index.ts';
import { toonRamp } from '../../../three/toon.ts';
import type { Label } from '../../../three/labels.ts';
import { GLIMS } from '../../home/glims.ts';

/*
 * Corner Shop in 3D. The player's scene is a little shop seen from the front
 * like a doll's house: shelves along the back wall that fill and empty with
 * the stock, a counter and till with the player's Glim behind it, and a
 * queue of customer Glims from the counter to the door. Through the window
 * and the open side is the street, where the Delivery Truck pulls up and the
 * Rush Hour crowd gathers. The big screen shows a high street of every
 * player's shopfront with its queue outside.
 *
 * Scenes only draw what the view says happened: a new sale's `seq` sends
 * items hopping to the customer and coins to the till; a new delivery's
 * `seq` drops a crate that pops open. The static shop is merged into a few
 * vertex-coloured meshes and repeated products are instanced, to keep draw
 * calls low on school laptops.
 */

/* ---------------------------------- kit ---------------------------------- */

type V3 = [number, number, number];

interface Part {
  geo: BufferGeometry;
  color: string;
  p?: V3;
  s?: V3;
  r?: V3;
}

const _v = new Vector3();
const _n = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _nm = new Matrix3();
const _one = new Vector3(1, 1, 1);
const _s = new Vector3(1, 1, 1);

/** Merge parts (each a geometry, a colour and a placement) into one vertex-coloured geometry: one draw call. */
function merge(parts: Part[]): Geometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  for (const part of parts) {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo;
    _m.compose(_v.set(...(part.p ?? [0, 0, 0])), _q.setFromEuler(_e.set(...(part.r ?? [0, 0, 0]))), part.s ? new Vector3(...part.s) : _one);
    _nm.getNormalMatrix(_m);
    const P = g.getAttribute('position');
    const N = g.getAttribute('normal');
    const c = css(part.color);
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(_m);
      pos.push(_v.x, _v.y, _v.z);
      _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
      nor.push(_n.x, _n.y, _n.z);
      col.push(c.r, c.g, c.b);
    }
    if (g !== part.geo) g.dispose();
  }
  const out = new Geometry();
  out.setAttribute('position', new Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 12);
const ball = new SphereGeometry(1, 12, 8);
const cone = new ConeGeometry(1, 1, 8);

/** A box from its size and centre. */
const B = (w: number, h: number, d: number, color: string, x: number, y: number, z: number, r?: V3): Part => ({ geo: box, color, p: [x, y, z], s: [w, h, d], r });

let glowTex: CanvasTexture | null = null;
function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new CanvasTexture(c);
  glowTex.userData.shared = true;
  return glowTex;
}

function glowSprite(color: string, size: number, opacity = 0.5): Sprite {
  const s = new Sprite(new SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity }));
  s.scale.set(size, size, 1);
  return s;
}

/* -------------------------------- products -------------------------------- */

/** Toy-style products, each one merged geometry standing on y = 0, about 0.2 m across. */
const PRODUCT_GEO: Record<ProductId, Geometry> = {
  apples: merge([
    { geo: ball, color: '#e8413c', p: [0, 0.075, 0], s: [0.078, 0.072, 0.078] },
    { geo: cyl, color: '#6b4423', p: [0, 0.16, 0], s: [0.009, 0.04, 0.009] },
    { geo: ball, color: '#4caf50', p: [0.025, 0.165, 0], s: [0.032, 0.01, 0.018] },
  ]),
  melons: merge([
    { geo: ball, color: '#3f9e4d', p: [0, 0.085, 0], s: [0.115, 0.088, 0.1] },
    { geo: ball, color: '#2f7a3a', p: [0, 0.086, 0], s: [0.117, 0.03, 0.102] },
    { geo: cyl, color: '#6b4423', p: [0, 0.175, 0], s: [0.01, 0.025, 0.01] },
  ]),
  bread: merge([
    { geo: new CapsuleGeometry(0.055, 0.12, 4, 10), color: '#d79a52', p: [0, 0.052, 0], s: [1, 0.85, 1.05], r: [0, 0, Math.PI / 2] },
    { geo: box, color: '#f0c584', p: [0, 0.098, 0], s: [0.14, 0.012, 0.05] },
  ]),
  cakes: merge([
    { geo: cyl, color: '#f2a7c3', p: [0, 0.035, 0], s: [0.08, 0.07, 0.08] },
    { geo: cyl, color: '#fff6ee', p: [0, 0.078, 0], s: [0.083, 0.02, 0.083] },
    { geo: ball, color: '#d81b3c', p: [0, 0.1, 0], s: [0.02, 0.02, 0.02] },
  ]),
  comics: merge([
    { geo: box, color: '#ffcc33', p: [0, 0.095, 0], s: [0.14, 0.19, 0.025] },
    { geo: box, color: '#e53935', p: [0, 0.155, 0.001], s: [0.142, 0.045, 0.027] },
    { geo: box, color: '#2a62c9', p: [0.02, 0.07, 0.001], s: [0.06, 0.06, 0.027] },
  ]),
  storybooks: merge([
    { geo: box, color: '#3d6fd8', p: [0, 0.105, 0], s: [0.16, 0.21, 0.045] },
    { geo: box, color: '#f2c14e', p: [0, 0.055, 0.001], s: [0.162, 0.025, 0.047] },
    { geo: box, color: '#fff2d6', p: [0, 0.105, -0.001], s: [0.15, 0.2, 0.044] },
  ]),
  basil: merge([
    { geo: new CylinderGeometry(0.06, 0.045, 0.08, 10), color: '#c8643b', p: [0, 0.04, 0] },
    { geo: ball, color: '#3fa34d', p: [0, 0.115, 0], s: [0.05, 0.04, 0.05] },
    { geo: ball, color: '#55bb5f', p: [0.03, 0.14, 0.01], s: [0.035, 0.03, 0.035] },
    { geo: ball, color: '#2f8f3f', p: [-0.03, 0.135, -0.01], s: [0.035, 0.03, 0.035] },
  ]),
  succulents: merge([
    { geo: new CylinderGeometry(0.05, 0.04, 0.06, 10), color: '#8d8a9a', p: [0, 0.03, 0] },
    { geo: cone, color: '#8fd1a0', p: [0, 0.09, 0], s: [0.065, 0.06, 0.065] },
    { geo: ball, color: '#b7e4c0', p: [0, 0.105, 0], s: [0.03, 0.03, 0.03] },
  ]),
  yoyos: merge([
    { geo: cyl, color: '#e53935', p: [0, 0.065, 0.018], s: [0.06, 0.022, 0.06], r: [Math.PI / 2, 0, 0] },
    { geo: cyl, color: '#e53935', p: [0, 0.065, -0.018], s: [0.06, 0.022, 0.06], r: [Math.PI / 2, 0, 0] },
    { geo: cyl, color: '#fff6ee', p: [0, 0.065, 0], s: [0.016, 0.016, 0.016], r: [Math.PI / 2, 0, 0] },
  ]),
  teddies: merge([
    { geo: ball, color: '#a86b3c', p: [0, 0.075, 0], s: [0.07, 0.078, 0.062] },
    { geo: ball, color: '#a86b3c', p: [0, 0.18, 0], s: [0.055, 0.052, 0.05] },
    { geo: ball, color: '#8a5530', p: [0.042, 0.225, 0], s: [0.02, 0.02, 0.014] },
    { geo: ball, color: '#8a5530', p: [-0.042, 0.225, 0], s: [0.02, 0.02, 0.014] },
    { geo: ball, color: '#e8c39e', p: [0, 0.17, 0.042], s: [0.024, 0.018, 0.016] },
    { geo: ball, color: '#e8c39e', p: [0, 0.07, 0.05], s: [0.035, 0.035, 0.016] },
  ]),
};

/** A mini Glim (a body and two eyes) for crowds and queues drawn by the hundred: tinted per copy. */
const MINI_GEO = merge([
  { geo: ball, color: '#ffffff', p: [0, 0.22, 0], s: [0.2, 0.22, 0.18] },
  { geo: ball, color: '#ffffff', p: [0.11, 0.06, 0.03], s: [0.06, 0.05, 0.07] },
  { geo: ball, color: '#ffffff', p: [-0.11, 0.06, 0.03], s: [0.06, 0.05, 0.07] },
  { geo: ball, color: '#1a1426', p: [0.065, 0.27, 0.16], s: [0.028, 0.04, 0.02] },
  { geo: ball, color: '#1a1426', p: [-0.065, 0.27, 0.16], s: [0.028, 0.04, 0.02] },
]);

const CROWN_GEO = merge([
  { geo: new CylinderGeometry(0.11, 0.1, 0.07, 10, 1), color: '#ffcf3f', p: [0, 0.035, 0] },
  ...[0, 1, 2, 3, 4].map((i): Part => ({ geo: cone, color: '#ffcf3f', p: [Math.sin((i / 5) * Math.PI * 2) * 0.09, 0.1, Math.cos((i / 5) * Math.PI * 2) * 0.09], s: [0.03, 0.07, 0.03] })),
  { geo: ball, color: '#e8413c', p: [0, 0.04, 0.105], s: [0.022, 0.022, 0.012] },
]);

const COIN_GEO = new CylinderGeometry(0.06, 0.06, 0.018, 12).rotateX(Math.PI / 2);

/**
 * A customer's Glim: a real catalogue Glim, picked by the customer's look seed so it stays the same
 * all game. Eight of them: each look's 3D body is built once, and that is the costly part.
 */
const CUSTOMER_ARTS: GlimArt[] = [GLIMS.sprig, GLIMS.dewdrop, GLIMS.buzzbean, GLIMS.briarcat, GLIMS.pebblet, GLIMS.dappledew, GLIMS.quillington, GLIMS.anglet];
export function customerArt(look: number): GlimArt {
  return CUSTOMER_ARTS[Math.abs(Math.floor(look)) % CUSTOMER_ARTS.length]!;
}

function vmat(): MeshToonMaterial {
  return new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
}

function shared(m: Mesh | InstancedMesh, cast = false): Mesh | InstancedMesh {
  m.userData.sharedGeometry = true;
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/* ------------------------------- layout ---------------------------------- */

const WALL_H = 2.7;
const BACK_Z = -3.2;
const FRONT_Z = 2.6;
const LEFT_X = -4;
const RIGHT_X = 4;
const SHELF_Z = -2.86;
const UNIT_W = 1.45;
const UNIT_GAP = 0.1;
const ROW_Y: [number, number] = [1.36, 0.74];
const PER_ROW = 5;
const ITEM_GAP = 0.26;
const ITEM_SCALE = 1.5;
const COUNTER_W = 2.6;
const COUNTER: V3 = [1.3, 0.9, -1.1];
const CLERK: V3 = [1.3, 0.3, -1.95];
const TILL: V3 = [2.2, 0.9, -1.15];
/** Shelves lean left of the counter while there are few of them. */
const shelfCentre = (slots: number) => (slots <= 3 ? -0.9 : 0);
/** The window and the door in the left wall (z ranges). */
const WINDOW: [number, number] = [-2.4, -0.6];
const DOOR: [number, number] = [1.15, 2.15];
const DOOR_Z = (DOOR[0] + DOOR[1]) / 2;
const LANDING: V3 = [-1.9, 0, -0.7];
/** The queue runs from the counter towards the front, then along to the door. */
const QUEUE_PATH: [number, number][] = [
  [1.3, -0.4],
  [1.3, 1.95],
  [-3.3, 1.95],
  [-3.3, -1.2],
];
const QUEUE_STEP = 0.78;
const EXIT_PATH: [number, number][] = [
  [-3.4, DOOR_Z],
  [-5, DOOR_Z],
  [-7.4, 3.2],
];
/** The street outside the left wall. */
const ROAD_X = -10.5;

function queueSpot(k: number): { x: number; z: number; heading: number } {
  let d = k * QUEUE_STEP;
  for (let i = 0; i < QUEUE_PATH.length - 1; i++) {
    const [ax, az] = QUEUE_PATH[i]!;
    const [bx, bz] = QUEUE_PATH[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (d <= len || i === QUEUE_PATH.length - 2) {
      const t = Math.min(1, d / len);
      // Face back along the line, towards the counter.
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(ax - bx, az - bz) };
    }
    d -= len;
  }
  return { x: 0, z: 0, heading: Math.PI };
}

function unitX(i: number, slots: number): number {
  return shelfCentre(slots) + (i - (slots - 1) / 2) * (UNIT_W + UNIT_GAP);
}

/* ------------------------------- the scene -------------------------------- */

export type CustomerKind = 'regular' | 'vip' | 'hurry';

export interface SceneCustomer {
  id: number;
  name: string;
  look: number;
  kind: CustomerKind;
  items: { product: ProductId; qty: number; have: number }[];
  patienceMs: number;
  leavesAt: number;
}

export interface SceneSale {
  seq: number;
  customer: { id: number; kind: CustomerKind };
  kind: 'full' | 'partial' | 'sorry';
  got: { product: ProductId; qty: number }[];
  paid: number;
  tip: number;
}

export interface SceneDelivery {
  seq: number;
  crate: CrateId | null;
  added: { product: ProductId; qty: number }[];
  cash: number;
}

export interface ShopState {
  shopName: string;
  lines: LineId[];
  slots: number;
  cap: number;
  stock: Partial<Record<ProductId, number>>;
  up: { shelf: number; till: number; decor: number; sign: number };
  queue: SceneCustomer[];
  sales: SceneSale[];
  delivery: SceneDelivery | null;
  event: 'rush' | 'sale' | 'truck' | null;
}

interface Shopper {
  id: number;
  kind: CustomerKind;
  group: Group;
  glim: Glim3D;
  label: Label | null;
  text: HTMLElement | null;
  bar: HTMLElement | null;
  barWidth: number;
  patienceMs: number;
  leavesAt: number;
  target: Vector3;
  heading: number;
  /** Walking out: the points still to visit. */
  exit: Vector3[] | null;
  /** Seconds to wait before walking out (a cheer first). */
  wait: number;
  wantKey: string;
}

interface Flyer {
  obj: Object3D;
  from: Vector3;
  to: Vector3;
  t: number;
  delay: number;
  dur: number;
  arc: number;
  spin: number;
  onLand?: () => void;
}

interface Later {
  at: number;
  run: () => void;
}

/** The words a customer's bubble shows: what they want, short. */
function wantText(items: SceneCustomer['items']): string {
  return items
    .map((it) => {
      const p = PRODUCTS[it.product];
      return it.qty === 1 ? p.one : `${it.qty} ${p.many}`;
    })
    .join(', ');
}

const STOPWATCH = '<svg viewBox="0 0 24 24" width="12" height="12" style="display:inline-block;vertical-align:-1px;margin-right:3px" aria-hidden="true"><circle cx="12" cy="14" r="7" fill="none" stroke="currentColor" stroke-width="3"/><path d="M12 14V10M9 3h6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
const CROWN = '<svg viewBox="0 0 24 24" width="12" height="12" style="display:inline-block;vertical-align:-1px;margin-right:3px" aria-hidden="true"><path d="M3 18h18l-2-10-5 4-2-7-2 7-5-4z" fill="currentColor"/></svg>';

export class CornerShopScene extends World {
  private cam: EaseCamera;
  private vm = vmat();
  private basic = new MeshBasicMaterial({ vertexColors: true });
  private clerk: Glim3D;
  private mates: Glim3D[] = [];
  private shelfMesh: Mesh | null = null;
  private tillMesh: Group | null = null;
  private decorMesh: Group | null = null;
  private signMesh: Group | null = null;
  private products = new Map<ProductId, InstancedMesh>();
  private rowOf = new Map<ProductId, { x: number; y: number }>();
  private shoppers = new Map<number, Shopper>();
  private flyers: Flyer[] = [];
  private later: Later[] = [];
  private time = 0;
  private seenSale = -1;
  private seenDelivery = -1;
  private hold = new Map<ProductId, { until: number; value: number }>();
  private state: ShopState | null = null;
  private built = { slots: -1, lines: '', shelf: -1, till: -1, decor: -1, sign: -1, name: '' };
  private crowd: InstancedMesh;
  private crowdSpots: { x: number; z: number; phase: number }[] = [];
  private bunting: Group;
  private saleSign: Group;
  private truck: Group;
  private truckZ = -40;
  private truckTo = -40;
  private road: Mesh;
  private event: ShopState['event'] = null;

  constructor(
    env: StageEnv,
    look: GlimLook,
    private readonly clock: () => number,
    teammates: GlimLook[] = [],
  ) {
    super(env, { ...DAY, sunFrom: [5, 11, 9], fogNear: 40, fogFar: 120 });
    this.cam = new EaseCamera(this.camera, env.reducedMotion);
    const q = env.quality;

    // Outside: pavement, road, the houses across it, trees and lamp posts.
    const pave = props.ground(80, 60, '#cbc4b6');
    pave.position.set(-8, -0.01, 4);
    this.scene.add(pave);
    this.road = props.ground(5, 120, '#4a4a58');
    this.road.position.set(ROAD_X, 0.005, 0);
    this.scene.add(this.road);
    const dashes: Part[] = [];
    for (let z = -50; z < 50; z += 3) dashes.push(B(0.12, 0.01, 1.4, '#f2e9d0', ROAD_X, 0.012, z));
    const street: Part[] = [...dashes];
    const rnd = props.seeded(17);
    for (let i = 0; i < 6; i++) {
      const z = -22 + i * 8;
      const hue = Math.round(rnd() * 360);
      const hx = ROAD_X - 6.5;
      street.push(B(5.5, 4 + rnd() * 2, 5, `hsl(${hue} 35% 78%)`, hx, 2.4, z));
      street.push({ geo: cone, color: `hsl(${(hue + 180) % 360} 30% 42%)`, p: [hx, 5.6 + rnd(), z], s: [4.2, 1.6, 4.2], r: [0, Math.PI / 4, 0] });
      street.push(B(0.05, 1.2, 1, '#bfe4ff', hx + 2.8, 2, z - 1.2));
      street.push(B(0.05, 1.2, 1, '#bfe4ff', hx + 2.8, 2, z + 1.2));
      street.push(B(0.05, 1.8, 1, '#5a3a2a', hx + 2.8, 0.9, z));
    }
    this.scene.add(shared(new Mesh(merge(street), this.vm)));
    for (const [x, z] of [
      [ROAD_X + 3.2, -6],
      [ROAD_X + 3.2, 7],
      [ROAD_X - 3.6, -12],
      [ROAD_X - 3.6, 13],
    ] as const) {
      const t = props.tree('round', { ink: q.outlines, scale: 0.9 });
      t.position.set(x, 0, z);
      this.scene.add(t);
    }
    for (const z of [-2, 9]) {
      const lamp = props.lampPost({ ink: q.outlines, height: 3.2 });
      lamp.position.set(ROAD_X + 2.6, 0, z);
      this.scene.add(lamp);
    }

    this.scene.add(shared(new Mesh(this.roomGeometry(), this.vm)));

    // The player's Glim behind the counter, and teammates beside them in a team shop.
    this.clerk = new Glim3D({ look, quality: q, reducedMotion: env.reducedMotion });
    this.clerk.scale.setScalar(1.1);
    this.clerk.position.set(...CLERK);
    this.scene.add(this.clerk);
    this.labels.add(this.clerk, 'You', { offsetY: 1.25, className: 'me small' });
    teammates.slice(0, 3).forEach((m, i) => {
      const g = new Glim3D({ look: m, quality: q, reducedMotion: env.reducedMotion });
      g.position.set(CLERK[0] + (i % 2 ? 0.9 : -0.9) * (1 + Math.floor(i / 2) * 0.9), CLERK[1], CLERK[2] - 0.15);
      this.scene.add(g);
      this.mates.push(g);
    });

    // Product instances: one mesh per product, as many copies as a shelf row shows.
    for (const p of Object.keys(PRODUCTS) as ProductId[]) {
      const m = new InstancedMesh(PRODUCT_GEO[p], this.vm, PER_ROW);
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.count = 0;
      shared(m);
      m.frustumCulled = false;
      this.products.set(p, m);
      this.scene.add(m);
    }

    // Events: the Rush Hour crowd outside, Sale Day bunting and sign, the Delivery Truck.
    this.crowd = new InstancedMesh(MINI_GEO, this.vm, 14);
    shared(this.crowd);
    this.crowd.frustumCulled = false;
    const cr = props.seeded(5);
    for (let i = 0; i < 14; i++) {
      // Half on the pavement in front of the shop, half pressed against the window and the door.
      this.crowdSpots.push(i % 2 ? { x: -3.6 + cr() * 3.4, z: FRONT_Z + 0.5 + cr() * 1.1, phase: cr() * 6 } : { x: LEFT_X - 0.6 - cr() * 1.4, z: -2.6 + cr() * 5.4, phase: cr() * 6 });
      this.crowd.setColorAt(i, css(`hsl(${Math.round(cr() * 360)} 70% 62%)`));
    }
    this.crowd.visible = false;
    this.scene.add(this.crowd);
    this.bunting = new Group();
    for (const [x, len] of [
      [-2.5, 5],
      [2.5, 5],
    ] as const) {
      const b = props.bunting(len, { sag: 0.35 });
      b.position.set(x, WALL_H - 0.05, FRONT_Z - 0.3);
      this.bunting.add(b);
    }
    this.bunting.visible = false;
    this.scene.add(this.bunting);
    this.saleSign = props.sign('Sale! A fifth off', { width: 1.7, ink: q.outlines, color: '#ffd9d9' });
    this.saleSign.position.set(LEFT_X - 1.2, 0, FRONT_Z + 0.6);
    this.saleSign.rotation.y = 0.35;
    this.saleSign.visible = false;
    this.scene.add(this.saleSign);
    this.truck = this.truckModel();
    this.truck.position.set(ROAD_X + 0.8, 0, this.truckZ);
    this.truck.visible = false;
    this.scene.add(this.truck);

    this.shadowArea(6, [0, 0, -0.4]);
  }

  /* ----------------------------- building ----------------------------- */

  /** Floor, walls with a window and a door, the counter: one merged mesh. */
  private roomGeometry(): Geometry {
    const parts: Part[] = [];
    // Floorboards in two shades.
    const boards = 14;
    const bw = (RIGHT_X - LEFT_X) / boards;
    for (let i = 0; i < boards; i++) parts.push(B(bw - 0.02, 0.06, FRONT_Z - BACK_Z, i % 2 ? '#c99a64' : '#b9895a', LEFT_X + bw * (i + 0.5), 0.03, (FRONT_Z + BACK_Z) / 2));
    parts.push(B(RIGHT_X - LEFT_X + 0.4, 0.04, 0.12, '#8a5a34', 0, 0.02, FRONT_Z + 0.06));
    // Back wall, with a dado rail.
    parts.push(B(RIGHT_X - LEFT_X + 0.4, WALL_H, 0.2, '#f3e3c7', 0, WALL_H / 2, BACK_Z - 0.1));
    parts.push(B(RIGHT_X - LEFT_X, 0.9, 0.04, '#d9b98f', 0, 0.45, BACK_Z + 0.02));
    // Right wall.
    parts.push(B(0.2, WALL_H, FRONT_Z - BACK_Z, '#ecd8b8', RIGHT_X + 0.1, WALL_H / 2, (FRONT_Z + BACK_Z) / 2));
    parts.push(B(0.04, 0.9, FRONT_Z - BACK_Z, '#d9b98f', RIGHT_X - 0.02, 0.45, (FRONT_Z + BACK_Z) / 2));
    // Left wall, around a window and a door.
    const wall = '#ecd8b8';
    const lx = LEFT_X - 0.1;
    const seg = (z0: number, z1: number, y0: number, y1: number) => parts.push(B(0.2, y1 - y0, z1 - z0, wall, lx, (y0 + y1) / 2, (z0 + z1) / 2));
    const [w0, w1] = WINDOW;
    const [d0, d1] = DOOR;
    const sill = 0.85;
    const lintel = 2.1;
    const doorTop = 2.05;
    seg(BACK_Z, w0, 0, WALL_H);
    seg(w0, w1, 0, sill);
    seg(w0, w1, lintel, WALL_H);
    seg(w1, d0, 0, WALL_H);
    seg(d0, d1, doorTop, WALL_H);
    seg(d1, FRONT_Z, 0, WALL_H);
    // Window frame, glazing bar and sill; door frame.
    const wood = '#8a5a34';
    const wm = (w0 + w1) / 2;
    const wh = lintel - sill;
    parts.push(B(0.3, 0.08, w1 - w0 + 0.1, wood, lx, sill, wm), B(0.3, 0.08, w1 - w0 + 0.1, wood, lx, lintel, wm), B(0.3, wh, 0.08, wood, lx, (sill + lintel) / 2, w0), B(0.3, wh, 0.08, wood, lx, (sill + lintel) / 2, w1), B(0.26, wh, 0.05, wood, lx, (sill + lintel) / 2, wm));
    parts.push(B(0.3, doorTop, 0.1, wood, lx, doorTop / 2, d0), B(0.3, doorTop, 0.1, wood, lx, doorTop / 2, d1), B(0.3, 0.1, d1 - d0 + 0.1, wood, lx, doorTop, DOOR_Z));
    // The door, open outwards.
    parts.push(B(d1 - d0 - 0.05, doorTop - 0.08, 0.06, '#3f7f6a', lx - (d1 - d0) / 2, (doorTop - 0.08) / 2, d0 + 0.02));
    // Wall tops.
    for (const [w, d, x, z] of [
      [RIGHT_X - LEFT_X + 0.4, 0.26, 0, BACK_Z - 0.1],
      [0.26, FRONT_Z - BACK_Z, RIGHT_X + 0.1, (FRONT_Z + BACK_Z) / 2],
      [0.26, FRONT_Z - BACK_Z, lx, (FRONT_Z + BACK_Z) / 2],
    ] as const)
      parts.push(B(w, 0.08, d, '#a8754a', x, WALL_H + 0.04, z));
    // The counter, with a wooden top.
    const [cx, ch, cz] = COUNTER;
    parts.push(B(COUNTER_W, ch - 0.06, 0.6, '#8f5e3a', cx, (ch - 0.06) / 2, cz), B(COUNTER_W + 0.16, 0.06, 0.72, '#c98f5a', cx, ch - 0.03, cz));
    // The step the clerk stands on.
    parts.push(B(COUNTER_W - 0.2, CLERK[1], 0.75, '#7a4f2e', cx, CLERK[1] / 2, CLERK[2]));
    for (let i = 0; i < 4; i++) parts.push(B(0.52, 0.55, 0.02, '#a46c44', cx - (COUNTER_W / 2 - 0.4) + i * ((COUNTER_W - 0.8) / 3), 0.42, cz + 0.31));
    // A drinks fridge on the right wall, a chalkboard price list and a clock on the back wall,
    // crates by the window and a mat at the door.
    parts.push(B(0.75, 1.85, 0.7, '#e9eef2', RIGHT_X - 0.42, 0.925, -2.2), B(0.04, 1.6, 0.6, '#bfe8ff', RIGHT_X - 0.81, 1.0, -2.2), B(0.06, 0.5, 0.04, '#8d96a0', RIGHT_X - 0.84, 1.0, -1.95));
    for (const y of [0.55, 1.0, 1.45]) for (const k of [-1, 0, 1]) parts.push({ geo: cyl, color: k === 0 ? '#ff7a59' : k > 0 ? '#59b8ff' : '#7bd35f', p: [RIGHT_X - 0.7, y, -2.2 + k * 0.17], s: [0.05, 0.22, 0.05] });
    parts.push(B(1.15, 0.8, 0.04, '#8a5a34', 3.05, 1.65, BACK_Z + 0.03), B(1.03, 0.68, 0.05, '#2f4a3a', 3.05, 1.65, BACK_Z + 0.04));
    for (let i = 0; i < 4; i++) parts.push(B(0.6 - (i % 2) * 0.2, 0.05, 0.06, '#f2efe4', 2.9 - (i % 2) * 0.1, 1.85 - i * 0.14, BACK_Z + 0.06));
    parts.push({ geo: cyl, color: '#8a5a34', p: [-3.1, 2.05, BACK_Z + 0.04], s: [0.3, 0.05, 0.3], r: [Math.PI / 2, 0, 0] }, { geo: cyl, color: '#fff8ea', p: [-3.1, 2.05, BACK_Z + 0.07], s: [0.25, 0.05, 0.25], r: [Math.PI / 2, 0, 0] }, B(0.03, 0.18, 0.02, '#2a1c14', -3.1, 2.11, BACK_Z + 0.1), B(0.13, 0.03, 0.02, '#2a1c14', -3.05, 2.05, BACK_Z + 0.1));
    parts.push(B(0.6, 0.45, 0.55, '#c48a4a', LEFT_X + 0.45, 0.225, -2.85), B(0.5, 0.38, 0.5, '#b57c40', LEFT_X + 0.42, 0.64, -2.85), B(0.55, 0.4, 0.5, '#c48a4a', LEFT_X + 1.1, 0.2, -2.9));
    parts.push(B(0.8, 0.02, 1.1, '#6a4a7a', LEFT_X + 0.5, 0.065, DOOR_Z));
    return merge(parts);
  }

  /** Shelf units along the back wall, one per product-line slot. */
  private buildShelves(s: ShopState) {
    if (this.shelfMesh) {
      this.shelfMesh.removeFromParent();
      this.shelfMesh.geometry.dispose();
    }
    const parts: Part[] = [];
    const tall = 2.0 + s.up.shelf * 0.1;
    this.rowOf.clear();
    for (let i = 0; i < s.slots; i++) {
      const x = unitX(i, s.slots);
      const line = s.lines[i];
      const wood = s.up.shelf >= 2 ? '#7a4f9a' : s.up.shelf === 1 ? '#a8693f' : '#9a6234';
      parts.push(B(UNIT_W, tall, 0.06, '#e9d3ac', x, tall / 2, SHELF_Z - 0.23));
      for (const side of [-1, 1]) parts.push(B(0.07, tall, 0.5, wood, x + (side * (UNIT_W - 0.07)) / 2, tall / 2, SHELF_Z));
      for (const y of [0.1, ROW_Y[1], ROW_Y[0], tall - 0.04]) parts.push(B(UNIT_W - 0.04, 0.05, 0.48, wood, x, y - 0.025, SHELF_Z));
      if (line) {
        // A plaque in the line's colour on top of the unit.
        const hue = { fruit: 8, bakery: 32, books: 220, plants: 120, toys: 300 }[line];
        parts.push(B(UNIT_W * 0.6, 0.24, 0.05, `hsl(${hue} 70% 58%)`, x, tall + 0.12, SHELF_Z - 0.2));
        parts.push(B(UNIT_W * 0.62, 0.04, 0.06, '#fff4dd', x, tall + 0.25, SHELF_Z - 0.2));
        const [a, b] = LINES[line].products;
        this.rowOf.set(a, { x, y: ROW_Y[0] });
        this.rowOf.set(b, { x, y: ROW_Y[1] });
        // Spare stock boxes on the bottom shelf.
        parts.push(B(0.34, 0.26, 0.3, '#c48a4a', x - 0.36, 0.1 + 0.13, SHELF_Z), B(0.28, 0.2, 0.28, '#b57c40', x + 0.34, 0.1 + 0.1, SHELF_Z));
      }
    }
    this.shelfMesh = shared(new Mesh(merge(parts), this.vm), this.env.quality.shadows) as Mesh;
    this.scene.add(this.shelfMesh);
  }

  private buildTill(level: number) {
    if (this.tillMesh) {
      this.tillMesh.removeFromParent();
      this.disposeGroup(this.tillMesh);
    }
    const g = new Group();
    const one = (x: number) => {
      const body = level >= 1 ? '#e8b84a' : '#7a7f8c';
      const parts: Part[] = [B(0.5, 0.18, 0.38, body, 0, 0.09, 0), B(0.46, 0.08, 0.2, level >= 1 ? '#c9952e' : '#5d6270', 0, 0.2, 0.06, [-0.4, 0, 0]), B(0.06, 0.28, 0.06, '#4a4f5c', 0, 0.3, -0.12), B(0.44, 0.06, 0.04, '#ffcf3f', 0, 0.07, 0.2)];
      const m = shared(new Mesh(merge(parts), this.vm), this.env.quality.shadows);
      m.position.x = x;
      g.add(m);
      const screen = new Mesh(box, toon(level >= 1 ? '#7fffd4' : '#b8f0c8', { glow: level >= 1 ? 0.8 : 0.3 }));
      screen.userData.sharedGeometry = true;
      screen.scale.set(0.26, 0.14, 0.03);
      screen.position.set(x, 0.48, -0.12);
      g.add(screen);
    };
    one(0);
    if (level >= 2) one(-1.5);
    g.position.set(...TILL);
    this.tillMesh = g;
    this.scene.add(g);
  }

  private buildDecor(level: number) {
    if (this.decorMesh) {
      this.decorMesh.removeFromParent();
      this.disposeGroup(this.decorMesh);
    }
    const g = new Group();
    if (level >= 1) {
      const plant = (x: number, z: number, big: number): Part[] => [
        { geo: new CylinderGeometry(0.22, 0.17, 0.36, 10), color: '#c8643b', p: [x, 0.18, z] },
        { geo: ball, color: '#3f9e4d', p: [x, 0.62 * big, z], s: [0.34 * big, 0.36 * big, 0.34 * big] },
        { geo: ball, color: '#55bb5f', p: [x + 0.15, 0.82 * big, z + 0.05], s: [0.2 * big, 0.2 * big, 0.2 * big] },
      ];
      const parts: Part[] = [
        // A rug in front of the counter.
        B(2.4, 0.02, 1.5, '#b8433f', 0.4, 0.07, 0.6),
        B(2.0, 0.022, 1.1, '#e3a33f', 0.4, 0.075, 0.6),
        B(1.5, 0.024, 0.65, '#b8433f', 0.4, 0.08, 0.6),
        ...plant(LEFT_X + 0.45, BACK_Z + 0.5, 0.9),
        ...plant(RIGHT_X - 0.5, FRONT_Z - 0.6, 1),
      ];
      if (level >= 2) {
        parts.push(...plant(RIGHT_X - 0.5, BACK_Z + 0.55, 1.1), ...plant(LEFT_X + 0.45, 0.3, 0.8));
        // Framed pictures on the right wall.
        parts.push(B(0.05, 0.7, 1.0, '#8a5a34', RIGHT_X - 0.05, 1.75, -1.4), B(0.05, 0.56, 0.86, '#7fb6e8', RIGHT_X - 0.08, 1.75, -1.4), B(0.05, 0.62, 0.62, '#8a5a34', RIGHT_X - 0.05, 1.65, 0.5), B(0.05, 0.48, 0.48, '#f2a7c3', RIGHT_X - 0.08, 1.65, 0.5));
      }
      g.add(shared(new Mesh(merge(parts), this.vm), this.env.quality.shadows));
    }
    if (level >= 2) {
      // Fairy lights along the top of the back wall: unlit colours read as glowing bulbs.
      const bulbs: Part[] = [];
      const colours = ['#ffd25a', '#ff7a9a', '#7fd4ff', '#9dffb0'];
      for (let i = 0; i < 26; i++) {
        const t = i / 25;
        const x = LEFT_X + 0.2 + t * (RIGHT_X - LEFT_X - 0.4);
        const y = WALL_H - 0.18 - Math.sin(((t * 4) % 1) * Math.PI) * 0.18;
        bulbs.push({ geo: ball, color: colours[i % colours.length]!, p: [x, y, BACK_Z + 0.05], s: [0.05, 0.06, 0.05] });
      }
      const lights = new Mesh(merge(bulbs), this.basic);
      lights.userData.sharedGeometry = false;
      g.add(lights);
      if (this.env.quality.tier !== 'low') {
        for (let i = 0; i < 6; i++) {
          const s = glowSprite(colours[i % colours.length]!, 1.1, 0.35);
          s.position.set(LEFT_X + 0.8 + i * 1.28, WALL_H - 0.3, BACK_Z + 0.15);
          g.add(s);
        }
      }
    }
    this.decorMesh = g;
    this.scene.add(g);
  }

  private buildSign(level: number, name: string) {
    if (this.signMesh) {
      this.signMesh.removeFromParent();
      this.disposeGroup(this.signMesh);
      this.signMesh = null;
    }
    if (level <= 0) return;
    const g = new Group();
    const board = props.sign(name, { width: 1.9, post: false, ink: this.env.quality.outlines, color: level >= 2 ? '#fff3a8' : '#f6e7c8' });
    g.add(board);
    // A bracket from the wall.
    const arm = new Mesh(box, toon('#2e2a3a'));
    arm.userData.sharedGeometry = true;
    arm.scale.set(0.06, 0.06, 1.2);
    arm.position.set(0, 0.42, -0.5);
    g.add(arm);
    if (level >= 2) {
      g.add(glowSprite('#ffe27a', 3.2, 0.55));
      const bulbs: Part[] = [];
      for (let i = 0; i < 10; i++) bulbs.push({ geo: ball, color: i % 2 ? '#ff7a9a' : '#ffd25a', p: [-0.95 + (i / 9) * 1.9, 0.36, 0.05], s: [0.045, 0.045, 0.045] });
      for (let i = 0; i < 10; i++) bulbs.push({ geo: ball, color: i % 2 ? '#ffd25a' : '#ff7a9a', p: [-0.95 + (i / 9) * 1.9, -0.36, 0.05], s: [0.045, 0.045, 0.045] });
      g.add(new Mesh(merge(bulbs), this.basic));
    }
    // Hung outside the left wall, by the door, facing the street and the camera.
    g.position.set(LEFT_X - 0.9, 2.4, FRONT_Z - 0.15);
    g.rotation.y = 0.2;
    this.signMesh = g;
    this.scene.add(g);
  }

  private truckModel(): Group {
    const g = new Group();
    const parts: Part[] = [
      B(1.9, 1.9, 3.6, '#f4f1ea', 0, 1.35, -0.6),
      B(1.92, 0.3, 3.62, '#e53935', 0, 1.0, -0.6),
      B(1.8, 1.3, 1.3, '#e53935', 0, 1.0, 1.9),
      B(1.7, 0.55, 0.05, '#bfe4ff', 0, 1.35, 2.56),
      B(0.05, 0.5, 0.8, '#bfe4ff', 0.91, 1.35, 1.95),
      B(0.05, 0.5, 0.8, '#bfe4ff', -0.91, 1.35, 1.95),
      B(1.9, 0.25, 5, '#3a3a48', 0, 0.42, 0),
    ];
    for (const z of [-1.6, 0.2, 1.9]) for (const x of [-0.95, 0.95]) parts.push({ geo: cyl, color: '#232030', p: [x, 0.36, z], s: [0.36, 0.25, 0.36], r: [0, 0, Math.PI / 2] });
    g.add(shared(new Mesh(merge(parts), this.vm), this.env.quality.shadows));
    const label = props.sign('Deliveries', { width: 1.6, post: false });
    label.position.set(0.97, 1.6, -0.6);
    label.rotation.y = Math.PI / 2;
    g.add(label);
    return g;
  }

  private disposeGroup(g: Group) {
    g.traverse((o) => {
      if (o instanceof Mesh && !o.userData.sharedGeometry) o.geometry.dispose();
      if (o instanceof Sprite) (o.material as Material).dispose();
    });
  }

  /* ------------------------------ the view ----------------------------- */

  setState(s: ShopState) {
    const first = this.state === null;
    this.state = s;
    const b = this.built;
    const lines = s.lines.join(',');
    if (b.slots !== s.slots || b.lines !== lines || b.shelf !== s.up.shelf) {
      this.buildShelves(s);
      b.slots = s.slots;
      b.lines = lines;
      b.shelf = s.up.shelf;
    }
    if (b.till !== s.up.till) {
      if (!first) this.celebrate(new Vector3(...TILL).add(new Vector3(0, 0.5, 0)));
      this.buildTill(s.up.till);
      b.till = s.up.till;
    }
    if (b.decor !== s.up.decor) {
      if (!first && s.up.decor > 0) this.celebrate(new Vector3(0.6, 0.6, 0.8));
      this.buildDecor(s.up.decor);
      b.decor = s.up.decor;
    }
    if (b.sign !== s.up.sign || b.name !== s.shopName) {
      this.buildSign(s.up.sign, s.shopName);
      if (!first && b.sign !== s.up.sign) this.celebrate(new Vector3(LEFT_X - 0.9, 2.4, FRONT_Z));
      b.sign = s.up.sign;
      b.name = s.shopName;
    }
    this.setEvent(s.event, first);

    if (first) {
      this.seenSale = Math.max(0, ...s.sales.map((x) => x.seq));
      this.seenDelivery = s.delivery?.seq ?? 0;
    }
    // Sales first: the customers they served walk out happy, with their things.
    const fresh = s.sales.filter((x) => x.seq > this.seenSale);
    if (fresh.length) this.seenSale = Math.max(...fresh.map((x) => x.seq));
    fresh.forEach((sale, i) => this.playSale(sale, i * 0.35));

    if (s.delivery && s.delivery.seq !== this.seenDelivery) {
      this.seenDelivery = s.delivery.seq;
      this.playDelivery(s.delivery, s.stock);
    }

    // The queue: new customers walk in from the street; ones who have gone walk out.
    const ids = new Set(s.queue.map((c) => c.id));
    const now = this.clock();
    for (const sh of this.shoppers.values()) {
      if (ids.has(sh.id) || sh.exit) continue;
      // Gone without a sale of ours: out of patience (sad), or served by a teammate (happy).
      const gaveUp = sh.leavesAt <= now + 400;
      if (gaveUp) {
        sh.glim.setExpression('sad', 4);
        this.toast(sh.group, 'Gave up', 'small tone-bad');
      } else sh.glim.play('cheer');
      this.leave(sh, gaveUp ? 0.2 : 0.8);
    }
    s.queue.forEach((c, k) => {
      let sh = this.shoppers.get(c.id);
      if (!sh) {
        sh = this.addShopper(c, first);
        this.shoppers.set(c.id, sh);
      }
      const spot = queueSpot(k);
      sh.target.set(spot.x, 0, spot.z);
      sh.heading = spot.heading;
      sh.patienceMs = c.patienceMs;
      sh.leavesAt = c.leavesAt;
      const key = `${c.kind}|${wantText(c.items)}|${c.items.map((it) => (it.have >= it.qty ? 1 : 0)).join('')}`;
      if (key !== sh.wantKey && sh.text) {
        sh.wantKey = key;
        const ready = c.items.every((it) => it.have >= it.qty);
        sh.text.innerHTML = `${c.kind === 'vip' ? CROWN : c.kind === 'hurry' ? STOPWATCH : ''}${escapeHtml(wantText(c.items))}${ready ? '' : ' <span style="opacity:.7">(short)</span>'}`;
      }
    });
    this.showStock();
  }

  private addShopper(c: SceneCustomer, first: boolean): Shopper {
    const glim = new Glim3D({ look: { art: customerArt(c.look) }, quality: this.env.quality, reducedMotion: this.env.reducedMotion });
    glim.scale.setScalar(1.0);
    const group = new Group();
    group.add(glim);
    if (c.kind === 'vip') {
      const crown = new Mesh(CROWN_GEO, toon('#ffcf3f', { glow: 0.35 }));
      crown.userData.sharedGeometry = true;
      crown.position.y = 0.98;
      glim.body.add(crown);
    }
    const start = first ? queueSpot(this.shoppers.size) : { x: EXIT_PATH[1]![0], z: EXIT_PATH[1]![1], heading: -Math.PI / 2 };
    group.position.set(start.x, 0, start.z);
    group.rotation.y = start.heading;
    this.scene.add(group);
    const label = this.labels.add(group, '', { offsetY: 1.38, className: `small ${c.kind === 'vip' ? 'tone-gold' : ''}` });
    label.el.innerHTML = '<span data-t></span><span style="display:block;height:4px;border-radius:2px;background:rgba(0,0,0,.18);margin-top:2px;overflow:hidden"><span data-bar style="display:block;height:100%;width:100%;background:#1fd38f;transform-origin:left"></span></span>';
    const text = label.el.querySelector<HTMLElement>('[data-t]');
    const bar = label.el.querySelector<HTMLElement>('[data-bar]');
    return { id: c.id, kind: c.kind, group, glim, label, text, bar, barWidth: -1, patienceMs: c.patienceMs, leavesAt: c.leavesAt, target: new Vector3(start.x, 0, start.z), heading: start.heading, exit: null, wait: 0, wantKey: '' };
  }

  private leave(sh: Shopper, wait: number) {
    this.labels.remove(sh.label);
    sh.label = null;
    sh.text = null;
    sh.bar = null;
    sh.wait = wait;
    sh.exit = EXIT_PATH.map(([x, z]) => new Vector3(x, 0, z));
  }

  private toast(target: Object3D, text: string, className: string, offsetY = 1.5) {
    const label = this.labels.add(target, text, { offsetY, className: `pop ${className}` });
    this.later.push({ at: this.time + 1.1, run: () => this.labels.remove(label) });
  }

  private celebrate(at: Vector3) {
    this.fx.burst(at, { color: ['#ffd25a', '#ff7a9a', '#7fd4ff', '#9dffb0'], shape: 'star', glow: true, count: 30, speed: 3 });
  }

  /** A sale: the clerk serves, items hop from the shelves to the customer, coins fly to the till, and the customer leaves. */
  private playSale(sale: SceneSale, delay: number) {
    const sh = this.shoppers.get(sale.customer.id);
    const at = (s: number, run: () => void) => this.later.push({ at: this.time + delay + s, run });
    at(0, () => {
      this.clerk.play('serve');
      this.clerk.setExpression(sale.kind === 'sorry' ? 'sad' : 'happy', 1.2);
    });
    at(0.9, () => this.clerk.play('idle'));
    const to = sh ? sh.group.position.clone().add(new Vector3(0, 0.55, 0)) : new Vector3(COUNTER[0], 1.1, COUNTER[2] + 0.6);
    let n = 0;
    for (const g of sale.got) {
      const row = this.rowOf.get(g.product);
      const pieces = Math.min(3, g.qty);
      for (let i = 0; i < pieces && n < 6; i++, n++) {
        const from = row ? new Vector3(row.x + (i - 1) * 0.26, row.y + 0.1, SHELF_Z + 0.1) : new Vector3(CLERK[0], 1.2, CLERK[2]);
        const m = new Mesh(PRODUCT_GEO[g.product], this.vm);
        m.userData.sharedGeometry = true;
        m.scale.setScalar(ITEM_SCALE);
        m.visible = false;
        this.scene.add(m);
        this.flyers.push({ obj: m, from, to: to.clone(), t: 0, delay: delay + n * 0.08, dur: 0.6, arc: 0.9, spin: 6 });
      }
    }
    if (sale.paid + sale.tip > 0) {
      const till = new Vector3(...TILL).add(new Vector3(0, 0.35, 0));
      const coins = Math.min(6, 2 + Math.round((sale.paid + sale.tip) / 6));
      for (let i = 0; i < coins; i++) {
        const c = new Mesh(COIN_GEO, toon('#ffcf3f', { glow: 0.25 }));
        c.userData.sharedGeometry = true;
        c.visible = false;
        this.scene.add(c);
        const last = i === coins - 1;
        this.flyers.push({
          obj: c,
          from: to.clone(),
          to: till.clone(),
          t: 0,
          delay: delay + 0.65 + i * 0.07,
          dur: 0.5,
          arc: 0.7,
          spin: 10,
          onLand: last
            ? () => {
                this.fx.burst(till, { color: ['#ffd25a', '#fff1a8'], shape: 'star', glow: true, count: 18, speed: 2.4 });
                const marker = new Object3D();
                marker.position.copy(till);
                this.scene.add(marker);
                this.toast(marker, `+$${sale.paid + sale.tip}`, sale.customer.kind === 'vip' ? 'big tone-gold' : 'tone-gold', 0.3);
                this.later.push({ at: this.time + 1.2, run: () => marker.removeFromParent() });
              }
            : undefined,
        });
      }
    }
    if (sh && !sh.exit) {
      if (sale.kind === 'sorry') {
        sh.glim.setExpression('sad', 3);
        this.leave(sh, delay + 0.5);
      } else {
        at(0.7, () => {
          sh.glim.play('cheer');
          sh.glim.setExpression('happy', 2);
        });
        this.leave(sh, delay + 1.5);
      }
    }
  }

  /** A delivery: a crate drops in, pops open and its stock flies onto the shelves. */
  private playDelivery(d: SceneDelivery, stock: ShopState['stock']) {
    const mystery = d.crate !== null;
    const crate = props.crate({ size: 0.7, ink: this.env.quality.outlines, color: mystery ? '#8a5ad6' : '#c48a4a' });
    const land = new Vector3(...LANDING);
    crate.position.set(land.x, 3.6, land.z);
    this.scene.add(crate);
    this.flyers.push({ obj: crate, from: new Vector3(land.x, 3.6, land.z), to: land.clone(), t: 0, delay: 0, dur: 0.45, arc: 0, spin: 0 });
    // Hold the shelves at their old counts until the stock arrives.
    const arrive = this.time + 1.5;
    for (const a of d.added) this.hold.set(a.product, { until: arrive, value: Math.max(0, (stock[a.product] ?? 0) - a.qty) });
    this.later.push({
      at: this.time + 0.75,
      run: () => {
        const pop = land.clone().add(new Vector3(0, 0.5, 0));
        this.fx.burst(pop, { color: mystery ? ['#c86bff', '#ffd25a', '#ffffff'] : ['#c48a4a', '#8a5a2c', '#f0c584'], shape: mystery ? 'star' : 'square', glow: mystery, count: 26, speed: 3 });
        crate.removeFromParent();
        this.disposeGroup(crate);
        if (mystery) this.toast(crate, '?', 'big tone-gold', 0);
        let n = 0;
        for (const a of d.added) {
          const row = this.rowOf.get(a.product);
          if (!row) continue;
          const pieces = Math.min(4, Math.max(1, Math.ceil(a.qty / 3)));
          for (let i = 0; i < pieces; i++, n++) {
            const m = new Mesh(PRODUCT_GEO[a.product], this.vm);
            m.userData.sharedGeometry = true;
            m.scale.setScalar(ITEM_SCALE);
            m.visible = false;
            this.scene.add(m);
            this.flyers.push({ obj: m, from: pop.clone(), to: new Vector3(row.x + (i - 1.5) * 0.3, row.y + 0.05, SHELF_Z + 0.05), t: 0, delay: Math.min(0.6, n * 0.05), dur: 0.65, arc: 1.2, spin: 5 });
          }
        }
        if (d.cash > 0) {
          const till = new Vector3(...TILL).add(new Vector3(0, 0.35, 0));
          for (let i = 0; i < 5; i++) {
            const c = new Mesh(COIN_GEO, toon('#ffcf3f', { glow: 0.25 }));
            c.userData.sharedGeometry = true;
            c.visible = false;
            this.scene.add(c);
            this.flyers.push({ obj: c, from: pop.clone(), to: till.clone(), t: 0, delay: i * 0.08, dur: 0.6, arc: 1, spin: 10 });
          }
        }
      },
    });
  }

  private showStock() {
    const s = this.state;
    if (!s) return;
    for (const [p, mesh] of this.products) {
      const row = this.rowOf.get(p);
      if (!row) {
        mesh.count = 0;
        continue;
      }
      const held = this.hold.get(p);
      const stock = held && held.until > this.time ? held.value : (s.stock[p] ?? 0);
      const n = stock <= 0 ? 0 : Math.max(1, Math.min(PER_ROW, Math.ceil((stock / Math.max(1, s.cap)) * PER_ROW)));
      const rs = props.seeded(p.length * 31 + Math.round(row.x * 10));
      for (let i = 0; i < n; i++) {
        const x = row.x + (i - (PER_ROW - 1) / 2) * ITEM_GAP;
        _m.compose(_v.set(x, row.y + 0.002, SHELF_Z + 0.04), _q.setFromEuler(_e.set(0, (rs() - 0.5) * 0.5, 0)), _s.setScalar(ITEM_SCALE));
        mesh.setMatrixAt(i, _m);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private setEvent(ev: ShopState['event'], first: boolean) {
    if (ev === this.event) return;
    const was = this.event;
    this.event = ev;
    this.crowd.visible = ev === 'rush';
    this.bunting.visible = ev === 'sale';
    this.saleSign.visible = ev === 'sale';
    if (ev === 'truck') {
      this.truck.visible = true;
      this.truckZ = first ? 4.5 : -40;
      this.truckTo = 4.5;
    } else if (was === 'truck') this.truckTo = 45;
  }

  /* ------------------------------- frames ------------------------------ */

  tick(dt: number, t: number) {
    this.time += dt;
    for (let i = this.later.length - 1; i >= 0; i--) {
      const l = this.later[i]!;
      if (this.time >= l.at) {
        this.later.splice(i, 1);
        l.run();
      }
    }
    const calm = this.env.reducedMotion;
    this.clerk.update(dt);
    for (const m of this.mates) m.update(dt);

    // Customers walk to their places (or out of the shop), facing where they go.
    const now = this.clock();
    for (const sh of this.shoppers.values()) {
      const g = sh.group;
      let goal: Vector3 | null = sh.target;
      if (sh.exit) {
        if (sh.wait > 0) {
          sh.wait -= dt;
          goal = null;
        } else {
          goal = sh.exit[0] ?? null;
          if (goal && g.position.distanceTo(goal) < 0.15) {
            sh.exit.shift();
            goal = sh.exit[0] ?? null;
          }
          if (!goal) {
            g.removeFromParent();
            sh.glim.dispose();
            this.shoppers.delete(sh.id);
            continue;
          }
        }
      }
      let moving = 0;
      if (goal) {
        const dx = goal.x - g.position.x;
        const dz = goal.z - g.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.03) {
          const speed = sh.exit ? 3 : 2.4;
          const step = Math.min(dist, speed * dt);
          g.position.x += (dx / dist) * step;
          g.position.z += (dz / dist) * step;
          turn(g, Math.atan2(dx, dz), dt);
          moving = speed;
        } else if (!sh.exit) turn(g, sh.heading, dt);
      }
      sh.glim.setMoving(moving);
      // Customers in a hurry bounce on their toes.
      g.position.y = sh.kind === 'hurry' && !moving && !calm && !sh.exit ? Math.abs(Math.sin(t * 9 + sh.id)) * 0.04 : 0;
      sh.glim.update(dt);
      if (sh.bar) {
        const frac = Math.max(0, Math.min(1, (sh.leavesAt - now) / Math.max(1, sh.patienceMs)));
        const w = Math.round(frac * 50) / 50;
        if (w !== sh.barWidth) {
          sh.barWidth = w;
          sh.bar.style.transform = `scaleX(${w})`;
          sh.bar.style.background = w > 0.5 ? '#1fd38f' : w > 0.25 ? '#ffc233' : '#ff4d6a';
        }
      }
    }

    // Things in flight.
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i]!;
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.obj.visible = true;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const e = f.arc === 0 ? k * k : k;
      f.obj.position.lerpVectors(f.from, f.to, e);
      f.obj.position.y += Math.sin(k * Math.PI) * f.arc;
      if (f.spin && !calm) f.obj.rotation.y += dt * f.spin;
      if (k >= 1) {
        this.flyers.splice(i, 1);
        f.onLand?.();
        // The crate stays where it landed until it pops; everything else is gone on arrival.
        if (f.arc !== 0 || f.spin !== 0) f.obj.removeFromParent();
      }
    }

    // Held shelves catch up when their stock lands.
    if (this.hold.size) {
      let changed = false;
      for (const [p, h] of this.hold)
        if (h.until <= this.time) {
          this.hold.delete(p);
          changed = true;
        }
      if (changed) this.showStock();
    }

    // Events outside.
    if (this.crowd.visible) {
      this.crowdSpots.forEach((c, i) => {
        const hop = calm ? 0 : Math.abs(Math.sin(t * 5 + c.phase)) * 0.15;
        // Everyone faces the shop.
        _m.compose(_v.set(c.x, hop, c.z), _q.setFromEuler(_e.set(0, c.z > FRONT_Z ? Math.PI : Math.PI / 2, 0)), _s.setScalar(1.5));
        this.crowd.setMatrixAt(i, _m);
      });
      this.crowd.instanceMatrix.needsUpdate = true;
    }
    if (this.truck.visible) {
      const d = this.truckTo - this.truckZ;
      if (Math.abs(d) > 0.02) this.truckZ += Math.sign(d) * Math.min(Math.abs(d), dt * Math.max(2, Math.abs(d) * 1.4));
      this.truck.position.z = this.truckZ;
      if (this.truckZ > 40) this.truck.visible = false;
    }

    // Frame the shop; narrow screens stand further back.
    const a = this.camera.aspect;
    const far = a < 0.8 ? 1.65 : a < 1.2 ? 1.3 : a < 1.5 ? 1.1 : 1;
    this.cam.set([1.1 * far, 1.6 + 2.0 * far, 0.2 + 6.9 * far], [-0.5, 1.0, -1.0]);
    this.cam.update(dt);
  }

  override dispose() {
    for (const sh of this.shoppers.values()) sh.glim.dispose();
    this.clerk.dispose();
    for (const m of this.mates) m.dispose();
    super.dispose();
    this.vm.dispose();
    this.basic.dispose();
  }
}

function turn(o: Object3D, heading: number, dt: number) {
  let d = heading - o.rotation.y;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  o.rotation.y += d * Math.min(1, dt * 8);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/* ------------------------------- the big screen ------------------------------- */

export interface StreetShop {
  id: string;
  name: string;
  cash: number;
  stars: number;
  queue: number;
  vip: boolean;
  fill: number;
  lines: number;
  look: GlimLook;
}

const STREET_MAX = 16;
const FRONT_W = 3.6;
const ROW_DZ = 8;
const ROW_DY = 3.4;
/** Queuers drawn outside each shop: two short rows from the door, so a long queue stays in front of its own shop. */
const MINI_PER_SHOP = 10;
const MINI_ROW = 5;

interface Front {
  group: Group;
  keeper: Glim3D;
  label: Label;
  sign: Group;
  name: string;
  index: number;
}

/** A high street of shopfronts (the first sixteen), each with its keeper and its queue outside. */
export class HighStreetScene extends World {
  private fronts = new Map<string, Front>();
  private order: StreetShop[] = [];
  private minis: InstancedMesh;
  private cam: EaseCamera;
  private vm = vmat();
  private sparkleT = 0;
  private bounds = { minX: -4, maxX: 4, rows: 1 };
  private ground: Group = new Group();

  constructor(env: StageEnv) {
    super(env, { ...DAY, sunFrom: [4, 12, 10], fogNear: 60, fogFar: 180 });
    this.cam = new EaseCamera(this.camera, env.reducedMotion);
    const pave = props.ground(220, 120, '#cbc4b6');
    pave.position.set(0, -0.01, -20);
    this.scene.add(pave);
    const road = props.ground(220, 4.4, '#4a4a58');
    road.position.set(0, 0.005, 5.4);
    this.scene.add(road);
    const dashes: Part[] = [];
    for (let x = -100; x < 100; x += 3) dashes.push(B(1.4, 0.01, 0.12, '#f2e9d0', x, 0.012, 5.4));
    this.scene.add(shared(new Mesh(merge(dashes), this.vm)));
    const grass = props.ground(220, 40, '#7fae55');
    grass.position.set(0, -0.005, -48);
    this.scene.add(grass);
    this.scene.add(this.ground);
    this.minis = new InstancedMesh(MINI_GEO, this.vm, STREET_MAX * MINI_PER_SHOP);
    shared(this.minis);
    this.minis.frustumCulled = false;
    this.minis.count = 0;
    const rnd = props.seeded(23);
    for (let i = 0; i < STREET_MAX * MINI_PER_SHOP; i++) this.minis.setColorAt(i, css(`hsl(${Math.round(rnd() * 360)} 68% 62%)`));
    this.scene.add(this.minis);
  }

  private frontGeometry(hue: number): Geometry {
    const w = FRONT_W - 0.25;
    const parts: Part[] = [
      B(w, 3.4, 2.6, `hsl(${hue} 40% 84%)`, 0, 1.7, -1.3),
      B(w + 0.1, 0.55, 2.7, `hsl(${hue} 55% 42%)`, 0, 3.55, -1.3),
      B(w + 0.2, 0.12, 2.8, '#f6efe2', 0, 3.86, -1.3),
      // Window, door and step.
      B(1.7, 1.5, 0.06, '#bfe4ff', -0.6, 1.45, 0.01),
      B(1.86, 0.1, 0.12, '#f6efe2', -0.6, 0.66, 0.03),
      B(0.9, 2.05, 0.06, `hsl(${(hue + 150) % 360} 40% 38%)`, 1.05, 1.03, 0.01),
      B(1.2, 0.1, 0.4, '#a9a29a', 1.05, 0.05, 0.2),
    ];
    // A striped awning over the window.
    for (let i = 0; i < 6; i++) parts.push(B(0.32, 0.06, 0.95, i % 2 ? '#fff6ee' : `hsl(${hue} 72% 56%)`, -1.4 + i * 0.32, 2.42, 0.42, [0.42, 0, 0]));
    // A shelf of goods in the window.
    for (let i = 0; i < 5; i++) parts.push(B(0.22, 0.2 + (i % 2) * 0.08, 0.2, `hsl(${(hue + i * 60) % 360} 70% 60%)`, -1.25 + i * 0.32, 0.86, -0.15));
    return merge(parts);
  }

  setShops(shops: StreetShop[]) {
    const top = shops.slice(0, STREET_MAX);
    const keep = new Set(top.map((s) => s.id));
    for (const [id, f] of this.fronts) {
      if (keep.has(id)) continue;
      f.group.removeFromParent();
      f.keeper.dispose();
      this.labels.remove(f.label);
      this.disposeTree(f.group);
      this.fronts.delete(id);
    }
    const rows = top.length > 4 ? 2 : 1;
    const perRow = Math.ceil(top.length / rows) || 1;
    top.forEach((s, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const inRow = row === rows - 1 ? top.length - row * perRow : perRow;
      const x = (col - (inRow - 1) / 2) * FRONT_W;
      let f = this.fronts.get(s.id);
      if (!f || f.index !== i) {
        if (f) {
          f.group.removeFromParent();
          f.keeper.dispose();
          this.labels.remove(f.label);
          this.disposeTree(f.group);
        }
        const group = new Group();
        const hue = (i * 47 + 20) % 360;
        group.add(shared(new Mesh(this.frontGeometry(hue), this.vm), this.env.quality.shadows));
        const keeper = new Glim3D({ look: s.look, quality: this.env.quality, reducedMotion: this.env.reducedMotion });
        keeper.position.set(1.05, 0.1, 0.6);
        keeper.scale.setScalar(1.35);
        group.add(keeper);
        const sign = props.sign(s.name, { width: FRONT_W * 0.78, post: false, color: '#fff6e6' });
        sign.position.set(0, 3.55, 0.08);
        group.add(sign);
        const label = this.labels.add(group, '', { offsetY: 4.5 });
        f = { group, keeper, label, sign, name: s.name, index: i };
        this.fronts.set(s.id, f);
        this.scene.add(group);
      }
      f.group.position.set(x, row * ROW_DY, -row * ROW_DZ);
      f.label.set(`★ ${s.stars.toFixed(1)} · $${s.cash.toLocaleString('en-GB')}`);
      if (f.name !== s.name) {
        f.group.remove(f.sign);
        this.disposeTree(f.sign);
        f.sign = props.sign(s.name, { width: FRONT_W * 0.78, post: false, color: '#fff6e6' });
        f.sign.position.set(0, 3.55, 0.08);
        f.group.add(f.sign);
        f.name = s.name;
      }
    });
    // The back row stands on a raised terrace.
    this.ground.clear();
    if (rows > 1) {
      const terrace = new Mesh(box, toon('#b9b1a3'));
      terrace.userData.sharedGeometry = true;
      terrace.scale.set(perRow * FRONT_W + 4, ROW_DY, 4.2);
      terrace.position.set(0, ROW_DY / 2, -ROW_DZ + 0.4);
      this.ground.add(terrace);
    }
    this.order = top;
    this.bounds = { minX: -(perRow * FRONT_W) / 2, maxX: (perRow * FRONT_W) / 2, rows };
    this.placeMinis();
  }

  private placeMinis() {
    let n = 0;
    for (const s of this.order) {
      const f = this.fronts.get(s.id);
      if (!f) continue;
      const q = Math.min(MINI_PER_SHOP, s.queue);
      for (let k = 0; k < q; k++) {
        const p = f.group.position;
        const row = Math.floor(k / MINI_ROW);
        const col = k % MINI_ROW;
        _m.compose(_v.set(p.x + 0.9 - col * 0.62 - row * 0.3, p.y, p.z + 1.35 + row * 0.6), _q.setFromEuler(_e.set(0, -Math.PI / 2 + 0.35, 0)), _s.setScalar(1.7));
        this.minis.setMatrixAt(n++, _m);
      }
    }
    this.minis.count = n;
    this.minis.instanceMatrix.needsUpdate = true;
  }

  private disposeTree(g: Group) {
    g.traverse((o) => {
      if (o instanceof Mesh && !o.userData.sharedGeometry) o.geometry.dispose();
    });
  }

  tick(dt: number, t: number) {
    for (const f of this.fronts.values()) f.keeper.update(dt);
    // VIPs in a queue sparkle.
    this.sparkleT += dt;
    if (this.sparkleT > 0.9) {
      this.sparkleT = 0;
      for (const s of this.order) {
        if (!s.vip) continue;
        const f = this.fronts.get(s.id);
        if (f) this.fx.burst(f.group.position.clone().add(new Vector3(0.2, 1.2, 1.3)), { color: ['#ffd25a', '#fff1a8'], shape: 'star', glow: true, count: 8, speed: 1.2, gravity: -0.3, life: 1.1 });
      }
    }
    void t;
    // Fit the street across, the back row's roofs to the front row's queues.
    const span = this.bounds.maxX - this.bounds.minX + 2;
    const top = 4.6 + (this.bounds.rows - 1) * ROW_DY;
    const bottom = 0;
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const depth = (this.bounds.rows - 1) * ROW_DZ;
    const dist = Math.max((span * 0.55) / (tan * this.camera.aspect), ((top - bottom) * 0.75) / tan + depth * 0.5, 8);
    const lookZ = -depth / 2;
    this.cam.set([0, 3 + dist * 0.42, lookZ + dist], [0, (top + bottom) / 2 - 0.4, lookZ]);
    this.cam.update(dt);
  }

  override dispose() {
    for (const f of this.fronts.values()) f.keeper.dispose();
    super.dispose();
    this.vm.dispose();
  }
}
