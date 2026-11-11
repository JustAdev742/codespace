import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Fog,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { EaseCamera, Glim3D, NIGHT, World, css, props, toon, type GlimLook, type StageEnv } from '../../../three/index.ts';
import { toonRamp } from '../../../three/toon.ts';
import type { Label } from '../../../three/labels.ts';
import { heightText, spotAngle, spotOf, stackNames, towerBlocks, type Block, type BlockKind, type TowerShape } from './tower-layout.ts';

/*
 * Tower Together in 3D. A grassy hill at night under a sky that warms towards
 * dawn as the time runs out; on top, the class's tower of timber (warm brown
 * planks), stone (cool grey blocks) and lantern braces (glowing gold bands).
 * Glims stand on a scaffold round the top and place pieces; the tower leans
 * and sways with the gauge, streaks of wind race in before a gust, and when a
 * gust topples it, the floors above the highest brace tumble off downwind.
 *
 * `TowerScene` looks at the top from one builder's own side (a player's
 * device); `TowerHostScene` shows the whole tower (or both, in Two Towers),
 * the target line and the star lines. Scenes draw what the view says: a new
 * piece's `seq`, a new gust result's `seq`.
 */

export interface SceneTower extends TowerShape {
  id: string;
  sway: number;
  /** The last gust's result on this tower. */
  gust: { seq: number; held: boolean; from: number; to: number; kinds: string } | null;
  last: { seq: number; kind: BlockKind } | null;
  hue: number | null;
}

export interface SceneBuilder {
  playerId: string;
  name: string;
  tower: string;
  seq: number;
  kind: BlockKind | null;
  isYou: boolean;
  look: GlimLook;
}

export interface SceneState {
  towers: SceneTower[];
  builders: SceneBuilder[];
  /** null: calm; otherwise how strong the coming gust is (0 to 1) and whether it is announced. */
  wind: { strength: number; announced: boolean; landsAt: number } | null;
  startedAt: number;
  endsAt: number;
}

export interface TowerOptions {
  host: boolean;
  me: string | null;
  towers: string[];
  gameNow: () => number;
}

/* ------------------------------ shared pieces ------------------------------ */

/** The tallest the tower is drawn, in metres. */
const VIS_H = 22;
const HILL_Y = 0;
/** The hill is a low dome: a slice of a sphere this big. */
const HILL_R = 80;

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

/** Planks for timber and coursed blocks for stone, drawn once on a canvas: legible from across a room. */
function faceTexture(kind: 'timber' | 'stone'): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  if (kind === 'timber') {
    g.fillStyle = '#b7743d';
    g.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#a5652f' : '#c3814a';
      g.fillRect(0, i * 16 + 1, 128, 14);
    }
    g.strokeStyle = '#5b3418';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, 125, 61);
    // A cross brace.
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(4, 60);
    g.lineTo(124, 4);
    g.stroke();
  } else {
    g.fillStyle = '#7f8aa6';
    g.fillRect(0, 0, 128, 64);
    g.strokeStyle = '#3e4660';
    g.lineWidth = 3;
    for (let row = 0; row < 2; row++) {
      const y = row * 32;
      g.strokeRect(0, y + 1.5, 128, 30);
      for (let x = row ? 32 : 0; x < 128; x += 64) {
        g.beginPath();
        g.moveTo(x + 1.5, y);
        g.lineTo(x + 1.5, y + 32);
        g.stroke();
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(4, 4, 56, 8);
    g.fillRect(36, 36, 56, 8);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const unitBox = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const pieceBox = new BoxGeometry(1, 1, 1);
const windowGeo = new PlaneGeometry(0.34, 0.46);
const windowMat = new MeshBasicMaterial({ color: '#ffd27a', fog: false });
windowGeo.userData.shared = true;
const poleGeo = new CylinderGeometry(0.05, 0.05, 1, 5).translate(0, 0.5, 0);
const streakGeo = new PlaneGeometry(1, 1);
for (const g of [unitBox, pieceBox, poleGeo, streakGeo]) g.userData.shared = true;

const WIDTH: Record<BlockKind, number> = { timber: 2.9, stone: 3.2, lantern: 3.5 };
const BAND = 0.3;

const m4 = new Matrix4();
const q = new Quaternion();
const v = new Vector3();
const s3 = new Vector3();
const up = new Vector3(0, 0, 1);
const yAxis = new Vector3(0, 1, 0);

interface Rig {
  id: string;
  x: number;
  group: Group;
  timber: InstancedMesh;
  stone: InstancedMesh;
  lantern: InstancedMesh;
  glows: Sprite[];
  /** Lit windows on the braced floors: the lanterns light the tower below them. */
  windows: InstancedMesh;
  scaffold: Group;
  targetRing: Mesh;
  starRings: Mesh[];
  targetTag: Label | null;
  blocks: Block[];
  key: string;
  /** Metres per floor, eased between views. */
  scale: number;
  scaleTo: number;
  topY: number;
  sway: number;
  swayShown: number;
  /** A shake when a gust hits and the tower holds. */
  shake: number;
  gustSeq: number;
  lastSeq: number;
  falling: { group: Group; t: number; parts: { mesh: Mesh; vx: number; vy: number; spin: number }[] }[];
  target: number;
}

interface Builder {
  id: string;
  tower: string;
  name: string;
  glim: Glim3D;
  label: Label | null;
  seq: number;
  spot: number;
  slot: number;
  pos: Vector3;
  flying: { mesh: Mesh; t: number; from: Vector3 } | null;
  isYou: boolean;
}

/* ----------------------------------- world ---------------------------------- */

export abstract class TowerWorld extends World {
  protected rigs = new Map<string, Rig>();
  protected builders = new Map<string, Builder>();
  private tags = new Map<string, { anchor: Object3D; label: Label }>();
  private streaks: InstancedMesh;
  private streakData: { x: number; y: number; z: number; speed: number; len: number }[] = [];
  private stars: Points | null = null;
  private moon: Group;
  private skyMat: ShaderMaterial | null;
  private windLevel = 0;
  private windTarget = 0;
  private burst = 0;
  private wind: SceneState['wind'] = null;
  private dawn = { startedAt: 0, endsAt: 1 };
  private materials: Record<BlockKind, MeshToonMaterial>;
  private textures: CanvasTexture[] = [];
  protected time = 0;
  protected glimScale: number;

  constructor(
    env: StageEnv,
    protected readonly o: TowerOptions,
  ) {
    super(env, { ...NIGHT, fogNear: 40, fogFar: 140, sunFrom: [-6, 10, 8] }, o.host ? 42 : 50);
    this.glimScale = o.host ? 1.4 : 0.8;
    this.skyMat = ((this.scene.getObjectByName('sky') as Mesh | undefined)?.material as ShaderMaterial | undefined) ?? null;
    const timberTex = faceTexture('timber');
    const stoneTex = faceTexture('stone');
    this.textures.push(timberTex, stoneTex);
    this.materials = {
      // A little light of their own, so the night side of the tower still reads across a room.
      timber: new MeshToonMaterial({ color: '#ffffff', map: timberTex, gradientMap: toonRamp(), emissive: '#ffffff', emissiveMap: timberTex, emissiveIntensity: 0.32 }),
      stone: new MeshToonMaterial({ color: '#ffffff', map: stoneTex, gradientMap: toonRamp(), emissive: '#ffffff', emissiveMap: stoneTex, emissiveIntensity: 0.3 }),
      lantern: toon('#ffc233', { glow: 0.85, unique: true }),
    };

    // The hill, and the night round it.
    this.scene.add(this.hill());
    this.scene.add(this.trees());
    this.moon = new Group();
    const moonDisc = new Mesh(new SphereGeometry(3.2, 16, 12), new MeshBasicMaterial({ color: '#f3efe0', fog: false }));
    this.moon.add(moonDisc);
    const halo = glowSprite('#bfcaff', 22, 0.25);
    this.moon.add(halo);
    this.moon.position.set(-38, 44, -90);
    this.scene.add(this.moon);
    if (env.quality.tier !== 'low') {
      const n = 360;
      const pos: number[] = [];
      const rnd = props.seeded(5);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const e = 0.08 + rnd() * 1.2;
        pos.push(Math.cos(a) * Math.cos(e) * 180, Math.sin(e) * 180, Math.sin(a) * Math.cos(e) * 180);
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      this.stars = new Points(g, new PointsMaterial({ color: '#dfe6ff', size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
      this.scene.add(this.stars);
    }

    // The towers, side by side in Two Towers.
    const n = o.towers.length;
    o.towers.forEach((id, i) => this.rigs.set(id, this.rig(id, n === 1 ? 0 : (i - (n - 1) / 2) * 9)));

    // Wind: streaks of air racing across the hill, more as a gust nears.
    const count = env.quality.tier === 'low' ? 26 : 60;
    this.streaks = new InstancedMesh(streakGeo, new MeshBasicMaterial({ color: '#e6eeff', transparent: true, opacity: 0, depthWrite: false, fog: false }), count);
    this.streaks.instanceMatrix.setUsage(DynamicDrawUsage);
    this.streaks.userData.sharedGeometry = true;
    this.streaks.frustumCulled = false;
    const rnd = props.seeded(11);
    for (let i = 0; i < count; i++) this.streakData.push({ x: -40 + rnd() * 80, y: 1 + rnd() * (VIS_H + 6), z: -6 + rnd() * 12, speed: 14 + rnd() * 16, len: 1.5 + rnd() * 3.5 });
    this.scene.add(this.streaks);
    this.shadowArea(14, [0, 4, 0]);
  }

  private hill(): Group {
    const g = new Group();
    // A broad dome of grass, darker at the edges, with a path of light-coloured earth up to the tower.
    const geo = new SphereGeometry(HILL_R, 48, 16, 0, Math.PI * 2, 0, 0.42);
    const pos = geo.getAttribute('position');
    const colours: number[] = [];
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const n = Math.sin(x * 0.7) * 0.5 + Math.sin(z * 0.9 + x * 0.2) * 0.5;
      const path = z > 2 && Math.abs(x - Math.sin(z * 0.25) * 1.5) < 1.1 - z * 0.01;
      if (path) c.set('#8a7a5c');
      else c.copy(css(`hsl(${150 + n * 8} ${32 + n * 6}% ${24 - r * 0.22 + n * 3}%)`));
      colours.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new Float32BufferAttribute(colours, 3));
    const dome = new Mesh(geo, new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() }));
    dome.position.y = HILL_Y - HILL_R;
    dome.receiveShadow = true;
    g.add(dome);
    // Far hills.
    const far = toon('#16234a');
    const rnd = props.seeded(21);
    for (let i = 0; i < 9; i++) {
      const m = new Mesh(new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), far);
      m.scale.set(22 + rnd() * 18, 8 + rnd() * 9, 14);
      m.position.set(-110 + i * 28 + rnd() * 10, -14, -85 - rnd() * 20);
      g.add(m);
    }
    return g;
  }

  private trees(): Group {
    const g = new Group();
    const rnd = props.seeded(9);
    const n = this.env.quality.tier === 'low' ? 8 : 18;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 13 + rnd() * 16;
      // Keep the path and the front of the hill clear.
      if (Math.sin(a) * r > 2 && Math.abs(Math.cos(a) * r) < 16) continue;
      const t = props.tree(rnd() > 0.5 ? 'pine' : 'round', { scale: 1.6 + rnd() * 1.4, ink: this.env.quality.outlines });
      const y = this.groundY(Math.cos(a) * r, Math.sin(a) * r);
      t.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      g.add(t);
    }
    // Lanterns along the path.
    for (let i = 0; i < 4; i++) {
      const z = 6 + i * 4.5;
      const x = Math.sin(z * 0.25) * 1.5 + (i % 2 ? 1.6 : -1.6);
      const lamp = props.lampPost({ height: 1.6 });
      lamp.position.set(x, this.groundY(x, z), z);
      g.add(lamp);
      const glow = glowSprite('#ffcf7a', 2.6, 0.45);
      glow.position.set(x, this.groundY(x, z) + 1.7, z);
      g.add(glow);
    }
    return g;
  }

  /** Height of the hill's surface. */
  protected groundY(x: number, z: number): number {
    const r = Math.hypot(x, z);
    return HILL_Y + Math.sqrt(Math.max(0, HILL_R * HILL_R - r * r)) - HILL_R;
  }

  private rig(id: string, x: number): Rig {
    const group = new Group();
    group.position.x = x;
    const y0 = this.groundY(x, 0);
    group.position.y = y0;
    this.scene.add(group);
    // A stone plinth to build on.
    const plinth = new Mesh(new CylinderGeometry(2.7, 3.1, 0.6, 8), toon('#4a5370'));
    plinth.position.y = -0.25;
    plinth.receiveShadow = true;
    group.add(plinth);
    const max = 220;
    const make = (kind: BlockKind) => {
      const m = new InstancedMesh(unitBox, this.materials[kind], max);
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.userData.sharedGeometry = true;
      m.count = 0;
      m.castShadow = this.env.quality.shadows;
      m.receiveShadow = this.env.quality.shadows;
      m.frustumCulled = false;
      group.add(m);
      return m;
    };
    const windows = new InstancedMesh(windowGeo, windowMat, 260);
    windows.instanceMatrix.setUsage(DynamicDrawUsage);
    windows.userData.sharedGeometry = true;
    windows.count = 0;
    windows.frustumCulled = false;
    group.add(windows);
    const scaffold = new Group();
    const deck = new Mesh(new RingGeometry(1.6, 2.9, 16).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#6b4a2e', side: 2 }));
    scaffold.add(deck);
    const rail = toon('#8a6038');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = new Mesh(poleGeo, rail);
      p.userData.sharedGeometry = true;
      p.scale.set(1, 2.6, 1);
      p.position.set(Math.cos(a) * 2.75, -2.6, Math.sin(a) * 2.75);
      scaffold.add(p);
    }
    group.add(scaffold);
    const ringMat = new MeshBasicMaterial({ color: '#ffc233', transparent: true, opacity: 0.85, side: 2, fog: false, depthWrite: false });
    const targetRing = new Mesh(new RingGeometry(3.7, 3.95, 40).rotateX(-Math.PI / 2), ringMat);
    group.add(targetRing);
    const starRings = [0, 1].map(() => {
      const r = new Mesh(new RingGeometry(3.7, 3.82, 40).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.4, side: 2, fog: false, depthWrite: false }));
      group.add(r);
      return r;
    });
    const tagAnchor = new Object3D();
    targetRing.add(tagAnchor);
    tagAnchor.position.set(-4.1, 0, 0);
    // The screen names the target beside the picture; the ring is enough in it.
    const targetTag: Label | null = null;
    return { id, x, group, timber: make('timber'), stone: make('stone'), lantern: make('lantern'), glows: [], windows, scaffold, targetRing, starRings, targetTag, blocks: [], key: '', scale: 0, scaleTo: 0, topY: 0, sway: 0, swayShown: 0, shake: 0, gustSeq: -1, lastSeq: -1, falling: [], target: 1 };
  }

  /* ------------------------------- the state ------------------------------- */

  setState(s: SceneState) {
    this.dawn = { startedAt: s.startedAt, endsAt: s.endsAt };
    this.wind = s.wind;
    this.windTarget = s.wind ? (s.wind.announced ? 0.35 + s.wind.strength * 0.65 : 0.12) : 0.04;
    for (const t of s.towers) {
      const rig = this.rigs.get(t.id);
      if (!rig) continue;
      rig.sway = t.sway;
      rig.target = t.target;
      // Drawn to the tower, not the target: tall enough to be the hero of the picture from the first
      // minute, shrinking to fit as it grows. The target is a ring above (and a marker on the screen).
      const scale = VIS_H / Math.max(t.height * 1.15, t.target * 0.15, 10);
      rig.scaleTo = scale;
      if (!rig.scale) rig.scale = scale;
      // A gust: the top falls, or the tower shakes and holds.
      if (t.gust && t.gust.seq !== rig.gustSeq) {
        const fresh = rig.gustSeq !== -1;
        rig.gustSeq = t.gust.seq;
        if (fresh) {
          if (!t.gust.held && t.gust.from > t.gust.to) this.fall(rig, t.gust);
          else rig.shake = 1;
          this.burst = 1;
        }
      }
      const key = `${t.height}|${t.base}|${t.kinds.length}|${t.brace}|${t.target}|${t.kinds.slice(-4)}`;
      if (key !== rig.key) {
        rig.key = key;
        rig.blocks = towerBlocks(t, 0.34 / scale);
        rig.lastSeq = t.last?.seq ?? rig.lastSeq;
      }
      const label = rig.targetTag;
      if (label) label.set(`Target ${heightText(t.target, t.target)}`);
    }
    // Builders on the scaffolds.
    const ids = new Set(s.builders.map((b) => b.playerId));
    for (const [id, b] of this.builders) if (!ids.has(id)) this.drop(id, b);
    for (const sb of s.builders) {
      let b = this.builders.get(sb.playerId);
      if (!b) {
        b = this.add(sb);
        continue;
      }
      b.name = sb.name;
      if (sb.seq !== b.seq) {
        b.seq = sb.seq;
        if (sb.kind) this.placeAnim(b, sb.kind);
      }
    }
    this.placeSlots();
  }

  private add(sb: SceneBuilder): Builder {
    const glim = new Glim3D({ look: sb.look, quality: this.env.quality, reducedMotion: this.env.reducedMotion });
    glim.scale.setScalar(this.glimScale);
    this.scene.add(glim);
    const label = sb.isYou ? this.labels.add(glim, 'You', { offsetY: 1.3 * this.glimScale, className: 'me small', maxDistance: 400 }) : null;
    const b: Builder = { id: sb.playerId, tower: sb.tower, name: sb.name, glim, label, seq: sb.seq, spot: spotOf(sb.playerId), slot: 0, pos: new Vector3(), flying: null, isYou: sb.isYou };
    this.builders.set(sb.playerId, b);
    return b;
  }

  private drop(id: string, b: Builder) {
    this.labels.remove(b.label);
    b.flying?.mesh.removeFromParent();
    b.glim.dispose();
    this.builders.delete(id);
  }

  /** Builders who share a place round the scaffold stand side by side there. */
  private placeSlots() {
    const groups = new Map<string, Builder[]>();
    for (const b of this.builders.values()) {
      const key = `${b.tower}|${b.spot}`;
      const list = groups.get(key) ?? [];
      list.push(b);
      groups.set(key, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.id.localeCompare(b.id));
      list.forEach((b, i) => (b.slot = i));
    }
  }

  /**
   * Name tags. Builders' Glims stand close together round a small scaffold, so
   * their tags would cover each other: instead each tower has one stacked tag
   * for the builders on its left as the camera sees it, one for the front and
   * one for the right (your own "You" tag stays on your Glim). Builders round
   * the back are hidden by the tower and get none.
   */
  private sideTags() {
    const want = new Map<string, { rig: Rig; side: -1 | 0 | 1; names: string[] }>();
    for (const b of this.builders.values()) {
      if (b.isYou) continue;
      const rig = this.rigs.get(b.tower);
      if (!rig) continue;
      const camDir = Math.atan2(this.camera.position.x - rig.x, this.camera.position.z);
      const d = Math.atan2(Math.sin(spotAngle(b.spot) - camDir), Math.cos(spotAngle(b.spot) - camDir));
      if (Math.abs(d) > Math.PI * 0.62) continue;
      // A phone's picture is narrow, and Two Towers' are side by side: one tag a tower there.
      const side = !this.o.host || this.rigs.size > 1 || Math.abs(d) < Math.PI * 0.17 ? 0 : d < 0 ? -1 : 1;
      const key = `${rig.id}|${side}`;
      const entry = want.get(key) ?? { rig, side, names: [] };
      entry.names.push(b.name);
      want.set(key, entry);
    }
    for (const [key, w] of want) {
      let tag = this.tags.get(key);
      if (!tag) {
        const anchor = new Object3D();
        this.scene.add(anchor);
        const label = this.labels.add(anchor, '', { offsetY: 0, className: 'small', maxDistance: 400 });
        Object.assign(label.el.style, { whiteSpace: 'pre-line', borderRadius: '10px', textAlign: 'center', lineHeight: '1.3', maxWidth: '12rem' });
        tag = { anchor, label };
        this.tags.set(key, tag);
      }
      const text = stackNames(w.names, this.o.host ? 6 : 4).join('\n');
      if (tag.label.el.textContent !== text) tag.label.set(text);
      // Left and right tags stand out to the sides; the front one above the Glims (and above "You").
      const camDir = Math.atan2(this.camera.position.x - w.rig.x, this.camera.position.z);
      // Far enough out to clear the front tag, at any distance the camera has pulled back to.
      const far = this.camera.position.distanceTo(v.set(w.rig.x, w.rig.group.position.y + w.rig.topY, 0));
      const out = w.side * Math.max(4.4, far * 0.16);
      const y = w.rig.group.position.y + w.rig.topY + (w.side === 0 ? 2.1 : 1.1) * this.glimScale;
      tag.anchor.position.set(w.rig.x + this.leanAt(w.rig, w.rig.topY) + Math.cos(camDir) * out, y, -Math.sin(camDir) * out);
    }
    for (const [key, tag] of this.tags) {
      if (want.has(key)) continue;
      this.labels.remove(tag.label);
      tag.anchor.removeFromParent();
      this.tags.delete(key);
    }
  }

  /** Where a builder stands: their place round the scaffold at the top of their tower. */
  private standAt(b: Builder, out: Vector3): Vector3 {
    const rig = this.rigs.get(b.tower);
    const a = spotAngle(b.spot) + (b.slot % 3 === 1 ? 0.22 : b.slot % 3 === 2 ? -0.22 : 0) * (1 + Math.floor(b.slot / 3) * 0.6);
    const r = 2.3 + Math.floor(b.slot / 3) * 0.12;
    const x = (rig?.x ?? 0) + Math.sin(a) * r + (rig ? this.leanAt(rig, rig.topY) : 0);
    const y = (rig?.group.position.y ?? 0) + (rig?.topY ?? 0);
    return out.set(x, y, Math.cos(a) * r);
  }

  private placeAnim(b: Builder, kind: BlockKind) {
    b.glim.play('hit');
    if (b.flying) b.flying.mesh.removeFromParent();
    const mesh = new Mesh(pieceBox, this.materials[kind]);
    mesh.userData.sharedGeometry = true;
    mesh.scale.set(0.7, kind === 'lantern' ? 0.18 : kind === 'timber' ? 0.5 : 0.32, 0.7);
    this.scene.add(mesh);
    b.flying = { mesh, t: 0, from: b.glim.position.clone().add(new Vector3(0, 0.6 * this.glimScale, 0)) };
  }

  private fall(rig: Rig, g: NonNullable<SceneTower['gust']>) {
    // The fallen floors, drawn as they stood, then tumbling off downwind.
    const blocks = towerBlocks({ height: g.from, base: g.to, kinds: g.kinds, brace: -1, target: rig.target }, 0.34 / rig.scale).filter((b) => b.from >= g.to);
    const group = new Group();
    group.position.copy(rig.group.position);
    this.scene.add(group);
    const parts: Rig['falling'][number]['parts'] = [];
    const calm = this.env.reducedMotion;
    for (const b of blocks.slice(-40)) {
      const h = b.kind === 'lantern' ? BAND : Math.max(0.12, (b.to - b.from) * rig.scale);
      const mesh = new Mesh(unitBox, this.materials[b.kind]);
      mesh.userData.sharedGeometry = true;
      mesh.scale.set(WIDTH[b.kind], h, WIDTH[b.kind]);
      mesh.position.set(0, b.from * rig.scale, 0);
      group.add(mesh);
      const k = (b.from - g.to) / Math.max(1, g.from - g.to);
      parts.push({ mesh, vx: calm ? 0 : 2 + k * 5 + Math.sin(b.from) * 1.2, vy: calm ? 0 : 1 + k * 2, spin: calm ? 0 : (0.6 + k * 1.6) * (b.from % 2 ? 1 : -1) });
    }
    rig.falling.push({ group, t: 0, parts });
    this.fx.burst(new Vector3(rig.x, rig.group.position.y + g.to * rig.scale + 0.5, 0), { color: ['#c9b08a', '#9aa5c4', '#ffe1a0'], shape: 'dot', count: 40, speed: 4, gravity: 4, size: 0.2 });
  }

  /** How far the tower leans at a height, from the gauge (and a gust's shake). */
  protected leanAt(rig: Rig, y: number): number {
    if (this.env.reducedMotion) return 0;
    const k = Math.pow(Math.max(0, y) / VIS_H, 1.6);
    const sway = rig.swayShown / 100;
    const wobble = Math.sin(this.time * (1.1 + sway * 1.6) + rig.x) * (0.25 + sway * 1.3);
    const lean = sway * 0.6 + this.windLevel * sway * 0.8;
    return k * (wobble + lean) + k * rig.shake * Math.sin(this.time * 14) * 0.8;
  }

  private drawRig(rig: Rig, dt: number) {
    rig.scale += (rig.scaleTo - rig.scale) * Math.min(1, dt * 3);
    rig.swayShown += (rig.sway - rig.swayShown) * Math.min(1, dt * 2.5);
    rig.shake = Math.max(0, rig.shake - dt * 0.8);
    const counts: Record<BlockKind, number> = { timber: 0, stone: 0, lantern: 0 };
    const meshes: Record<BlockKind, InstancedMesh> = { timber: rig.timber, stone: rig.stone, lantern: rig.lantern };
    let top = 0;
    const braces: number[] = [];
    for (const b of rig.blocks) {
      const mesh = meshes[b.kind];
      const i = counts[b.kind];
      if (i >= mesh.instanceMatrix.count) continue;
      const y = b.from * rig.scale;
      const h = b.kind === 'lantern' ? BAND : Math.max(0.06, (b.to - b.from) * rig.scale);
      const yy = b.kind === 'lantern' ? y - BAND / 2 : y;
      const lean = this.leanAt(rig, yy + h / 2);
      const tilt = this.env.reducedMotion ? 0 : (this.leanAt(rig, yy + h) - this.leanAt(rig, yy)) / Math.max(0.05, h) * 0.6;
      q.setFromAxisAngle(up, -Math.atan(tilt));
      // Pieces alternate a quarter turn, as a builder would lay them.
      m4.compose(v.set(lean, yy, 0), q, s3.set(WIDTH[b.kind], h, WIDTH[b.kind]));
      mesh.setMatrixAt(i, m4);
      counts[b.kind] = i + 1;
      top = Math.max(top, b.to * rig.scale);
      if (b.kind === 'lantern') braces.push(y);
    }
    for (const k of ['timber', 'stone', 'lantern'] as BlockKind[]) {
      meshes[k].count = counts[k];
      meshes[k].instanceMatrix.needsUpdate = true;
    }
    rig.topY += (top - rig.topY) * Math.min(1, dt * 6);
    // Windows lit on every floor below the highest brace: two to a face, every metre or so.
    const lit = braces.length ? braces[braces.length - 1]! : 0;
    let w = 0;
    const cap = rig.windows.instanceMatrix.count;
    for (let y = 0.55; y < lit - 0.3 && w + 8 <= cap; y += 1.15) {
      const lean = this.leanAt(rig, y);
      for (let f = 0; f < 4; f++) {
        const a = (f * Math.PI) / 2;
        const half = WIDTH.stone / 2 + 0.02;
        for (const side of [-0.55, 0.55]) {
          q.setFromAxisAngle(yAxis, a);
          v.set(Math.sin(a) * half + Math.cos(a) * side + lean, y, Math.cos(a) * half - Math.sin(a) * side);
          m4.compose(v, q, s3.set(1, 1, 1));
          rig.windows.setMatrixAt(w++, m4);
        }
      }
    }
    rig.windows.count = w;
    rig.windows.instanceMatrix.needsUpdate = true;
    // Lantern glow at the braces (the top few), so a lit tower glows from across a room.
    const want = braces.slice(-6);
    while (rig.glows.length < want.length) {
      const g = glowSprite('#ffcf7a', 5, 0.55);
      rig.group.add(g);
      rig.glows.push(g);
    }
    rig.glows.forEach((g, i) => {
      const y = want[i];
      g.visible = y !== undefined;
      if (y !== undefined) g.position.set(this.leanAt(rig, y), y, 0);
      if (!this.env.reducedMotion) (g.material as SpriteMaterial).opacity = 0.5 + Math.sin(this.time * 5 + i * 1.3) * 0.06;
    });
    rig.scaffold.position.set(this.leanAt(rig, rig.topY), rig.topY, 0);
    rig.targetRing.position.y = rig.target * rig.scale;
    // Star lines come into the picture as the tower nears them.
    [1.25, 1.5].forEach((k, i) => {
      const ring = rig.starRings[i]!;
      ring.position.y = Math.ceil(rig.target * k) * rig.scale;
      ring.visible = ring.position.y < Math.max(rig.topY * 1.25, rig.target * rig.scale * 1.1);
    });
    // Falling floors tumble off downwind and fade.
    for (const f of rig.falling) {
      f.t += dt;
      const calm = this.env.reducedMotion;
      for (const p of f.parts) {
        if (!calm) {
          p.mesh.position.x += p.vx * dt;
          p.mesh.position.y += p.vy * dt;
          p.vy -= 9 * dt;
          p.mesh.rotation.z -= p.spin * dt;
          const floor = this.groundY(rig.x + p.mesh.position.x, 0) - rig.group.position.y;
          if (p.mesh.position.y < floor) {
            p.mesh.position.y = floor;
            p.vy = Math.abs(p.vy) * 0.25;
            p.vx *= 0.6;
            p.spin *= 0.5;
          }
        }
      }
      const fade = Math.max(0, 1 - Math.max(0, f.t - (calm ? 0.2 : 1.6)) / 0.8);
      f.group.visible = fade > 0.02;
      for (const p of f.parts) p.mesh.scale.y = p.mesh.scale.y > 0 ? p.mesh.scale.y * (fade > 0.98 ? 1 : 0.9 + fade * 0.1) : 0;
    }
    rig.falling = rig.falling.filter((f) => {
      if (f.t < (this.env.reducedMotion ? 1.0 : 2.4)) return true;
      f.group.removeFromParent();
      return false;
    });
  }

  private stepBuilder(b: Builder, dt: number) {
    const want = this.standAt(b, v);
    if (b.pos.lengthSq() === 0) b.pos.copy(want);
    else b.pos.lerp(want, Math.min(1, dt * 5));
    b.glim.position.copy(b.pos);
    // Face out from the tower, a little towards the camera.
    const rig = this.rigs.get(b.tower);
    const out = Math.atan2(b.pos.x - (rig?.x ?? 0), b.pos.z);
    const toCam = Math.atan2(this.camera.position.x - b.pos.x, this.camera.position.z - b.pos.z);
    const d = Math.atan2(Math.sin(toCam - out), Math.cos(toCam - out));
    b.glim.rotation.y = out + d * 0.6;
    b.glim.update(dt);
    const f = b.flying;
    if (f && rig) {
      f.t += dt / 0.45;
      const k = Math.min(1, f.t);
      const to = new Vector3(rig.x + this.leanAt(rig, rig.topY), rig.group.position.y + rig.topY + 0.2, 0);
      f.mesh.position.lerpVectors(f.from, to, k);
      f.mesh.position.y += Math.sin(k * Math.PI) * 0.9;
      f.mesh.rotation.y = k * Math.PI;
      if (k >= 1) {
        f.mesh.removeFromParent();
        b.flying = null;
        this.fx.burst(to, { color: ['#ffe1a0', '#ffffff'], shape: 'spark', glow: true, count: 8, speed: 1.6 });
      }
    }
  }

  private skyAt(p: number) {
    // Night to first light: the horizon warms to amber and the top of the sky lifts to a deep blue.
    const k = Math.pow(Math.max(0, Math.min(1, p)), 1.6);
    // Through blue, never through purple: the horizon lightens first, then warms in the last stretch.
    const top = new Color(NIGHT.skyTop).lerp(new Color('#1f3f7a'), k);
    const horizon = k < 0.55 ? new Color(NIGHT.horizon).lerp(new Color('#3f6aa8'), k / 0.55) : new Color('#3f6aa8').lerp(new Color('#f4bf5c'), (k - 0.55) / 0.45);
    if (this.skyMat) {
      (this.skyMat.uniforms.top!.value as Color).copy(top);
      (this.skyMat.uniforms.horizon!.value as Color).copy(horizon);
    }
    const fog = this.scene.fog as Fog | null;
    if (fog) fog.color.copy(new Color(NIGHT.horizon).lerp(new Color('#3a5486'), k));
    this.sun.intensity = NIGHT.sunIntensity + k * 1.1;
    this.sun.color.copy(new Color(NIGHT.sun).lerp(new Color('#ffd2a0'), k));
    this.fill.intensity = NIGHT.fill + k * 0.5;
    if (this.stars) (this.stars.material as PointsMaterial).opacity = 0.85 * (1 - k);
    this.moon.position.y = 44 - k * 30;
  }

  protected tickWorld(dt: number) {
    this.time += dt;
    const now = this.o.gameNow();
    this.skyAt((now - this.dawn.startedAt) / Math.max(1, this.dawn.endsAt - this.dawn.startedAt));
    // A gust in its last seconds blows harder still.
    let target = this.windTarget;
    if (this.wind?.announced) {
      const left = (this.wind.landsAt - now) / 1000;
      if (left < 3) target = Math.min(1, target + (3 - Math.max(0, left)) * 0.12);
    }
    this.burst = Math.max(0, this.burst - dt * 0.6);
    this.windLevel += (Math.max(target, this.burst) - this.windLevel) * Math.min(1, dt * 1.5);
    for (const rig of this.rigs.values()) this.drawRig(rig, dt);
    for (const b of this.builders.values()) this.stepBuilder(b, dt);
    this.sideTags();
    const calm = this.env.reducedMotion;
    const sm = this.streaks.material as MeshBasicMaterial;
    sm.opacity = Math.min(0.6, this.windLevel * (calm ? 0.35 : 0.6));
    this.streaks.visible = this.windLevel > 0.03;
    if (this.streaks.visible) {
      const speedK = calm ? 0.15 : 0.35 + this.windLevel * 1.1;
      this.streakData.forEach((d, i) => {
        d.x += d.speed * dt * speedK;
        if (d.x > 40) d.x = -40;
        q.copy(this.camera.quaternion);
        m4.compose(v.set(d.x, d.y + Math.sin(d.x * 0.25 + i) * 0.4, d.z), q, s3.set(d.len * (0.5 + this.windLevel * 1.2) * (this.o.host ? 1.5 : 1), this.o.host ? 0.09 : 0.05, 1));
        this.streaks.setMatrixAt(i, m4);
      });
      this.streaks.instanceMatrix.needsUpdate = true;
    }
    if (this.stars) this.stars.position.copy(this.camera.position);
  }

  /** The top of a tower, in world space. */
  protected topOf(id: string | null): Vector3 {
    const rig = (id ? this.rigs.get(id) : undefined) ?? [...this.rigs.values()][0]!;
    return new Vector3(rig.x, rig.group.position.y + rig.topY, 0);
  }

  protected tallest(): number {
    let y = 0;
    for (const r of this.rigs.values()) y = Math.max(y, r.topY, r.target * r.scale <= r.topY + 4 ? r.target * r.scale + 1 : 0);
    return y;
  }

  override dispose() {
    for (const [id, b] of this.builders) this.drop(id, b);
    for (const t of this.textures) t.dispose();
    this.materials.timber.dispose();
    this.materials.stone.dispose();
    this.materials.lantern.dispose();
    super.dispose();
  }
}

/* ------------------------------ a player's view ----------------------------- */

/** Looks at the top of the tower from the player's own side of the scaffold. */
export class TowerScene extends TowerWorld {
  private cam: EaseCamera;
  private side: number;
  private towerId: string;

  constructor(env: StageEnv, o: Omit<TowerOptions, 'host'> & { tower: string }) {
    super(env, { ...o, host: false });
    this.cam = new EaseCamera(this.camera, env.reducedMotion);
    this.side = o.me ? spotAngle(spotOf(o.me)) : 0;
    this.towerId = o.tower;
  }

  tick(dt: number) {
    this.tickWorld(dt);
    const top = this.topOf(this.towerId);
    const far = this.camera.aspect < 0.8 ? 1.35 : this.camera.aspect < 1.2 ? 1.12 : 1;
    const dist = 11 * far;
    const drift = this.env.reducedMotion ? 0 : Math.sin(this.time * 0.07) * 0.12;
    const a = this.side + drift;
    // The top of the tower, where the building happens, sits a little above the middle of the picture,
    // leaving room above it for the builders' name tags.
    const camAt = new Vector3(top.x + Math.sin(a) * dist, top.y + 2.2 * far, Math.cos(a) * dist);
    this.cam.set(camAt, new Vector3(top.x, Math.max(1.6, top.y + 0.4), 0));
    this.cam.update(dt);
  }
}

/* -------------------------------- the big screen ------------------------------ */

/** The whole tower (both, in Two Towers), the target line and the star lines. */
export class TowerHostScene extends TowerWorld {
  private cam: EaseCamera;

  constructor(env: StageEnv, o: Omit<TowerOptions, 'host' | 'me'>) {
    super(env, { ...o, host: true, me: null });
    this.cam = new EaseCamera(this.camera, env.reducedMotion);
  }

  tick(dt: number) {
    this.tickWorld(dt);
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    // From a little below the foot of the tower (room for the builders and their tags when it is
    // short) to above the target line or the top, whichever is higher.
    const h = Math.max(10, this.tallest() + 11);
    const w = this.rigs.size > 1 ? 22 : 12;
    const dist = Math.max(w / 2 / (tan * this.camera.aspect), h / 2 / tan) * 1.06;
    const midY = this.groundY(0, 0) - 2.2 + h / 2;
    const drift = this.env.reducedMotion ? 0 : Math.sin(this.time * 0.05) * 1.5;
    this.cam.set([drift, midY + 2.5, dist], [0, midY, 0]);
    this.cam.update(dt);
  }
}

