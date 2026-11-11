import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  type ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EaseCamera, Glim3D, NIGHT, World, css, props, toon, type GlimLook, type StageEnv } from '../../../three/index.ts';
import type { Label } from '../../../three/labels.ts';
import { PLANTS, PLOT_GAP, gardenSize, plotPosition, type PlotView } from '@ludora/engine/glim-garden';
import { stageOf } from './glim-garden-words.ts';
import { petalHue } from './glim-garden-map.tsx';

/*
 * Glim Garden in 3D: a toon garden at night that fills with colour. Raised
 * beds of earth in a lawn, each with its plant at its stage (a seed, a
 * sprout, a bud, a bloom), drooping when thirsty; lantern trees that glow and
 * light the beds next to them; a ring of earlier blooms round each bed; and
 * fireflies gathering over the plots that brought them, a plot glowing gold
 * once it has enough. A pond, hedges and a moon. Each gardener is their own
 * Glim with a watering can beside their bed: it tips the can for a drop, and
 * a gift arcs over to the neighbour's bed.
 *
 * `GardenScene` looks at one player's plot and its neighbours; the big
 * screen's `GardenHostScene` frames every garden whole. Scenes draw what the
 * view says happened: a plot's new `s` (its change count) plays the change.
 */

export interface SceneGarden {
  teamId: string | null;
  name: string | null;
  plots: PlotView[];
}

export interface GardenSceneState {
  gardens: SceneGarden[];
  /** Fireflies that make a plot glow. */
  need: number;
  dark: boolean;
  nightBloom: boolean;
  looks: Map<string, GlimLook>;
  names: Map<string, string>;
}

/* ------------------------------ shared pieces ------------------------------ */

let glowTex: CanvasTexture | null = null;
function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
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

/** A flat glow lying on the ground (a glowing plot, lantern light). */
function groundGlow(colour: string, size: number, opacity: number): Mesh {
  const m = new Mesh(flatGeo, new MeshBasicMaterial({ map: glowTexture(), color: css(colour), transparent: true, depthWrite: false, blending: AdditiveBlending, opacity, fog: false }));
  m.userData.sharedGeometry = true;
  m.scale.set(size, 1, size);
  m.renderOrder = 2;
  return m;
}

const BED_W = 2.4;
const BED_D = 1.8;
const BED_H = 0.32;
/** Plants are drawn larger than life, so they read from the back of the room. */
const PLANT_SCALE = 1.45;

const flatGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const bedGeo = new BoxGeometry(BED_W, BED_H, BED_D).translate(0, BED_H / 2, 0);
const soilGeo = new BoxGeometry(BED_W - 0.26, 0.06, BED_D - 0.26).translate(0, BED_H + 0.01, 0);
const ringGeo = new SphereGeometry(0.11, 8, 6);
const stemGeo = (() => {
  const stem = new CylinderGeometry(0.025, 0.035, 1, 6).translate(0, 0.5, 0);
  const l1 = new SphereGeometry(0.12, 8, 6).scale(1.4, 0.35, 0.7).rotateZ(0.5).translate(-0.13, 0.42, 0);
  const l2 = new SphereGeometry(0.12, 8, 6).scale(1.4, 0.35, 0.7).rotateZ(-0.5).translate(0.13, 0.3, 0);
  return mergeGeometries([stem.toNonIndexed(), l1.toNonIndexed(), l2.toNonIndexed()])!;
})();
const petalsGeo = (() => {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) parts.push(new SphereGeometry(0.11, 8, 6).scale(1, 0.35, 1.7).translate(0, 0, 0.15).rotateY((i / 6) * Math.PI * 2).toNonIndexed());
  return mergeGeometries(parts)!;
})();
const centreGeo = new SphereGeometry(0.075, 10, 8);
const budGeo = new SphereGeometry(0.08, 10, 8).scale(1, 1.6, 1);
const blobGeo = (() => {
  const a = new IcosahedronGeometry(0.5, 1).translate(0, 0.45, 0);
  const b = new IcosahedronGeometry(0.36, 1).translate(-0.38, 0.38, 0.1);
  const c = new IcosahedronGeometry(0.34, 1).translate(0.36, 0.4, -0.05);
  return mergeGeometries([a.toNonIndexed(), b.toNonIndexed(), c.toNonIndexed()])!;
})();
const blossomGeo = (() => {
  const parts: BufferGeometry[] = [];
  const spots: [number, number, number][] = [
    [0.2, 0.85, 0.35],
    [-0.3, 0.7, 0.38],
    [0.45, 0.55, 0.25],
    [-0.55, 0.45, 0.2],
    [0, 0.98, 0.05],
    [0.05, 0.55, 0.5],
  ];
  for (const [x, y, z] of spots) parts.push(new IcosahedronGeometry(0.08, 0).translate(x, y, z).toNonIndexed());
  return mergeGeometries(parts)!;
})();
const trunkGeo = new CylinderGeometry(0.07, 0.11, 1, 7).translate(0, 0.5, 0);
const canopyGeo = (() => {
  const a = new IcosahedronGeometry(0.7, 1).translate(0, 1.45, 0);
  const b = new IcosahedronGeometry(0.5, 1).translate(-0.45, 1.2, 0.15);
  const c = new IcosahedronGeometry(0.48, 1).translate(0.45, 1.25, -0.1);
  return mergeGeometries([a.toNonIndexed(), b.toNonIndexed(), c.toNonIndexed()])!;
})();
const lanternsGeo = (() => {
  const parts: BufferGeometry[] = [];
  const spots: [number, number, number][] = [
    [-0.55, 0.95, 0.35],
    [0.5, 1.0, 0.38],
    [0.05, 0.85, 0.6],
    [-0.15, 1.15, -0.55],
  ];
  for (const [x, y, z] of spots) {
    parts.push(new CylinderGeometry(0.07, 0.08, 0.16, 6).translate(x, y, z).toNonIndexed());
    parts.push(new CylinderGeometry(0.008, 0.008, 0.16, 3).translate(x, y + 0.15, z).toNonIndexed());
  }
  return mergeGeometries(parts)!;
})();
const moundGeo = new SphereGeometry(0.16, 10, 6).scale(1.3, 0.45, 1.1);
const sproutGeo = new CylinderGeometry(0.0, 0.05, 0.16, 5).translate(0, 0.1, 0);
const canBody = new CylinderGeometry(0.075, 0.09, 0.15, 10).translate(0, 0.075, 0);
const canSpout = new CylinderGeometry(0.012, 0.022, 0.2, 6).rotateZ(-1.0).translate(0.12, 0.12, 0);
const canHandle = new TorusGeometry(0.06, 0.012, 5, 10, Math.PI).translate(0, 0.15, 0);
const dropGeo = new SphereGeometry(0.06, 8, 6).scale(1, 1.3, 1);
for (const g of [flatGeo, bedGeo, soilGeo, ringGeo, stemGeo, petalsGeo, centreGeo, budGeo, blobGeo, blossomGeo, trunkGeo, canopyGeo, lanternsGeo, moundGeo, sproutGeo, canBody, canSpout, canHandle, dropGeo]) g.userData.shared = true;

function part(g: BufferGeometry, colour: string, glow = 0): Mesh {
  const m = new Mesh(g, toon(colour, { glow }));
  m.userData.sharedGeometry = true;
  m.castShadow = true;
  return m;
}

const LEAF = '#3fae5c';
const LEAF_DARK = '#2c8a49';
const LEAF_DROOP = '#7a8a4a';
const BED = '#93603a';
const SOIL = '#5a3923';

function wateringCan(): Group {
  const g = new Group();
  const tin = '#7fb4d8';
  g.add(part(canBody, tin), part(canSpout, tin), part(canHandle, '#5d8fb4'));
  return g;
}

/** A plant at its stage, at full size (the plot scales it as it grows). */
function plantModel(p: PlotView, asleep: boolean): Group {
  const g = new Group();
  const stage = stageOf(p);
  const leaf = p.d ? LEAF_DROOP : LEAF;
  if (stage === 'seed') {
    g.add(part(moundGeo, '#5a3a24'));
    const s = part(sproutGeo, leaf);
    s.position.y = 0.04;
    g.add(s);
    return g;
  }
  if (p.k === 'flower') {
    const hue = petalHue(p.id);
    // Three stems, so a flower bed reads from the back of a classroom.
    const spots: [number, number, number][] = [
      [0, 0, 0],
      [-0.42, -0.12, 0.18],
      [0.4, -0.18, -0.16],
    ];
    for (const [x, dy, z] of spots) {
      const h = 0.75 + dy;
      const stem = part(stemGeo, p.d ? LEAF_DROOP : LEAF_DARK);
      stem.scale.set(1, h, 1);
      stem.position.set(x, 0, z);
      g.add(stem);
      if (p.b && !asleep) {
        const petals = part(petalsGeo, `hsl(${hue} 85% 66%)`, 0.15);
        petals.position.set(x, h, z);
        petals.rotation.x = 0.35;
        const centre = part(centreGeo, '#ffd24a', 0.5);
        centre.position.set(x, h + 0.03, z + 0.01);
        g.add(petals, centre);
      } else if (stage === 'bud' || stage === 'bloom') {
        const bud = part(budGeo, `hsl(${hue} 70% ${asleep ? 38 : 55}%)`);
        bud.position.set(x, h + 0.08, z);
        g.add(bud);
      }
    }
    return g;
  }
  if (p.k === 'bush') {
    g.add(part(blobGeo, p.d ? LEAF_DROOP : LEAF_DARK));
    if (p.b) g.add(part(blossomGeo, '#ff9cc2', 0.35));
    else if (stage === 'bud') {
      const buds = part(blossomGeo, '#d97aa3');
      buds.scale.setScalar(0.7);
      buds.position.y = 0.15;
      g.add(buds);
    }
    return g;
  }
  // Lantern tree.
  g.add(part(trunkGeo, '#6b4a2f'));
  g.children[0]!.scale.set(1, 1.15, 1);
  g.add(part(canopyGeo, p.d ? LEAF_DROOP : leaf === LEAF ? '#2f8f55' : leaf));
  if (p.b || stage === 'bud') {
    const lit = p.b && !asleep;
    g.add(part(lanternsGeo, lit ? '#ffd36b' : '#9a8558', lit ? 0.9 : 0));
  }
  return g;
}

/* --------------------------------- a plot --------------------------------- */

interface Anim {
  kind: 'water' | 'gift' | 'bloom' | 'plant' | 'perk' | 'light' | 'droop';
  t: number;
}

interface Flight {
  from: Vector3;
  to: Vector3;
  t: number;
  mesh: Mesh;
  target: PlotObj;
}

interface PlotObj {
  id: string;
  root: Group;
  plant: Group | null;
  key: string;
  grow: number;
  growTo: number;
  seq: number;
  view: PlotView;
  glow: Mesh;
  light: Mesh;
  treeGlow: Sprite | null;
  glim: Glim3D | null;
  can: Group | null;
  label: Label | null;
  anim: Anim | null;
  canTip: number;
}

export interface SceneOptions {
  host: boolean;
  me: string | null;
}

const m4 = new Matrix4();
const v3 = new Vector3();
const DAY_SKY = { top: '#4f8fe0', horizon: '#bfe0ff', ground: '#4f7a3c' };
const NIGHT_SKY = { top: NIGHT.skyTop, horizon: NIGHT.horizon, ground: NIGHT.ground };

abstract class GardenWorld extends World {
  protected plots = new Map<string, PlotObj>();
  protected order: string[] = [];
  protected positions = new Map<string, Vector3>();
  protected bounds = { minX: -2, maxX: 2, minZ: -2, maxZ: 2 };
  protected pondEdge = 6;
  private signs: { name: string | null; x: number }[] = [];
  private beds: InstancedMesh | null = null;
  private soil: InstancedMesh | null = null;
  private ring: InstancedMesh | null = null;
  private flies: Points;
  private flyData: { plot: string; a: number; r: number; h: number; speed: number }[] = [];
  private flyKey = '';
  private flights: Flight[] = [];
  private scenery = new Group();
  private layoutKey = '';
  private dark = true;
  private darkLevel = 1;
  private crowds: { anchor: Object3D; label: Label }[] = [];
  private crowdClock = 0;
  protected state: GardenSceneState | null = null;
  private glimCap: number;

  constructor(
    env: StageEnv,
    protected readonly o: SceneOptions,
  ) {
    // Moonlight: bright enough that the garden's colours read on a classroom projector.
    super(env, { ...NIGHT, ground: '#3a4a5a', sun: '#d4ddff', sunIntensity: 2.3, fill: 1.75, fogNear: 40, fogFar: 140 }, 45);
    const ground = props.ground(260, 260, '#1d4029');
    ground.position.y = -0.02;
    this.scene.add(ground, this.scenery);
    const max = Math.round(700 * Math.max(0.3, env.quality.particles));
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(max * 3), 3));
    geo.setDrawRange(0, 0);
    this.flies = new Points(geo, new PointsMaterial({ map: glowTexture(), color: css('#ffe27a'), size: this.o.host ? 0.6 : 0.42, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false }));
    this.flies.frustumCulled = false;
    this.flies.userData.max = max;
    this.scene.add(this.flies);
    // The moon, low behind the garden.
    const moon = new Mesh(new SphereGeometry(3, 20, 14), new MeshBasicMaterial({ color: css('#f4f1d8'), fog: false }));
    moon.position.set(-30, 26, -90);
    const halo = glowSprite('#c9d6ff', 26, 0.35);
    halo.position.copy(moon.position);
    this.scene.add(moon, halo);
    this.glimCap = o.host ? (env.quality.tier === 'low' ? 16 : 30) : 14;
  }

  setState(st: GardenSceneState) {
    this.state = st;
    this.setDark(!st.nightBloom || st.dark);
    const all = st.gardens.flatMap((g) => g.plots);
    const key = st.gardens.map((g) => `${g.teamId ?? ''}:${g.plots.map((p) => p.id).join(',')}`).join('|');
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.layout(st);
    }
    const seen = new Set<string>();
    const glimIds = this.glimIds(st);
    st.gardens.forEach((g) =>
      g.plots.forEach((p) => {
        seen.add(p.id);
        let obj = this.plots.get(p.id);
        if (!obj) obj = this.addPlot(p);
        this.place(obj);
        this.updatePlot(obj, p, st, glimIds.has(p.id));
      }),
    );
    for (const [id, obj] of this.plots) if (!seen.has(id)) this.dropPlot(id, obj);
    this.updateRing(all);
    this.updateFlies(all, st.need);
  }

  /** Which plots get a Glim: on a phone, yours and the ones round it; on the big screen, the front rows first. */
  protected glimIds(st: GardenSceneState): Set<string> {
    const ids = st.gardens.flatMap((g) => g.plots.map((p) => p.id));
    if (this.o.host || !this.o.me) return new Set(ids.slice(0, this.glimCap));
    const mine = this.positions.get(this.o.me);
    if (!mine) return new Set(ids.slice(0, this.glimCap));
    return new Set([...ids].sort((a, b) => (this.positions.get(a)?.distanceTo(mine) ?? 99) - (this.positions.get(b)?.distanceTo(mine) ?? 99)).slice(0, this.glimCap));
  }

  /** Work out where every plot stands (gardens side by side), and build the beds, lawn and scenery round them. */
  private layout(st: GardenSceneState) {
    this.positions.clear();
    this.signs = [];
    const gap = PLOT_GAP * 1.6;
    const widths = st.gardens.map((g) => gardenSize(g.plots.length).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (st.gardens.length - 1);
    let x = -total / 2;
    let depth = 0;
    st.gardens.forEach((g, gi) => {
      const cx = x + widths[gi]! / 2;
      g.plots.forEach((p, i) => {
        const pos = plotPosition(i, g.plots.length);
        this.positions.set(p.id, new Vector3(cx + pos.x, 0, pos.z));
      });
      depth = Math.max(depth, gardenSize(g.plots.length).depth);
      this.signs.push({ name: g.name, x: cx });
      x += widths[gi]! + gap;
    });
    this.bounds = { minX: -total / 2 - PLOT_GAP * 0.5, maxX: total / 2 + PLOT_GAP * 0.5, minZ: -depth + PLOT_GAP * 0.5, maxZ: PLOT_GAP * 0.5 };
    const n = this.positions.size;
    for (const im of [this.beds, this.soil]) {
      im?.removeFromParent();
      im?.dispose();
    }
    this.beds = new InstancedMesh(bedGeo, toon(BED), Math.max(1, n));
    this.soil = new InstancedMesh(soilGeo, toon(SOIL), Math.max(1, n));
    for (const im of [this.beds, this.soil]) {
      im.userData.sharedGeometry = true;
      im.receiveShadow = true;
      im.castShadow = im === this.beds;
      this.scene.add(im);
    }
    [...this.positions.values()].forEach((p, i) => {
      m4.makeTranslation(p.x, 0, p.z);
      this.beds!.setMatrixAt(i, m4);
      this.soil!.setMatrixAt(i, m4);
    });
    this.beds.count = this.soil.count = n;
    this.beds.instanceMatrix.needsUpdate = this.soil.instanceMatrix.needsUpdate = true;
    this.buildScenery(st);
    if (this.env.quality.shadows) {
      const w = Math.max(this.bounds.maxX - this.bounds.minX, this.bounds.maxZ - this.bounds.minZ);
      this.shadowArea(this.o.host ? w * 0.6 + 4 : 9, this.o.host ? [0, 0, (this.bounds.minZ + this.bounds.maxZ) / 2] : [this.positions.get(this.o.me ?? '')?.x ?? 0, 0, this.positions.get(this.o.me ?? '')?.z ?? 0]);
    }
  }

  private buildScenery(st: GardenSceneState) {
    this.scenery.traverse((o) => {
      if (o instanceof Mesh && o.userData.pond) o.geometry.dispose();
    });
    this.scenery.clear();
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const ink = this.env.quality.outlines && !this.o.host;
    // The lawn, a little lighter than the meadow, with a path round it.
    const lawn = props.ground(maxX - minX + 1.4, maxZ - minZ + 1.4, '#2f6a3c');
    lawn.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const path = props.ground(maxX - minX + 3.2, maxZ - minZ + 3.2, '#7a705c');
    path.position.set(lawn.position.x, -0.01, lawn.position.z);
    this.scenery.add(path, lawn);
    // The pond, beside the garden: round, with a rim of stones, lily pads and the moon in it.
    // A small class's pond is small, so the beds stay the heart of the picture.
    const pw = Math.max(2.4, Math.min(4.6, (maxX - minX) * 0.3));
    const pd = Math.min(7, Math.max(2.6, (maxZ - minZ) * 0.85));
    const pond = new Mesh(new CylinderGeometry(0.5, 0.5, 0.04, 40), toon('#2d5fa8', { glow: 0.25 }));
    pond.userData.pond = true;
    pond.scale.set(pw, 1, pd);
    pond.position.set(maxX + 1.4 + pw / 2, 0.02, (minZ + maxZ) / 2);
    this.pondEdge = maxX + 1.6 + pw;
    this.scenery.add(pond);
    const shine = groundGlow('#cfe0ff', 1.8, 0.5);
    shine.position.set(pond.position.x - 0.6, 0.06, pond.position.z - pd * 0.15);
    this.scenery.add(shine);
    const rnd = props.seeded(st.gardens.length * 7 + this.positions.size);
    for (let i = 0; i < 12; i++) {
      const r = props.rock({ scale: 0.25 + rnd() * 0.22, color: '#7b8199', ink });
      const a = (i / 12) * Math.PI * 2;
      r.position.set(pond.position.x + Math.cos(a) * (pw / 2 + 0.1), 0.05, pond.position.z + Math.sin(a) * (pd / 2 + 0.1));
      this.scenery.add(r);
    }
    for (let i = 0; i < 4; i++) {
      const pad = new Mesh(new CylinderGeometry(0.32, 0.32, 0.03, 10), toon('#4cc06a'));
      pad.userData.pond = true;
      pad.position.set(pond.position.x - 1.2 + i * 0.75, 0.07, pond.position.z - pd * 0.3 + rnd() * pd * 0.6);
      this.scenery.add(pad);
      if (i % 2 === 0) {
        const bloom = part(centreGeo, '#ff9cc2', 0.4);
        bloom.position.set(pad.position.x, 0.12, pad.position.z);
        this.scenery.add(bloom);
      }
    }
    // Hedges and trees behind and beside the garden, kept low at the front so nothing hides a bed.
    const back = minZ - 3;
    const count = Math.max(4, Math.round((maxX - minX) / 4));
    for (let i = 0; i <= count; i++) {
      const x = minX - 1.5 + (i / count) * (maxX - minX + 3);
      const t = props.tree(i % 3 === 0 ? 'round' : 'pine', { scale: 0.9 + rnd() * 0.5, ink });
      t.position.set(x + (rnd() - 0.5) * 1.2, 0, back - rnd() * 2.5);
      this.scenery.add(t);
      if (i % 2 === 0) {
        const b = props.bush({ scale: 0.8 + rnd() * 0.4, ink, color: '#2c6e43' });
        b.position.set(x, 0, back + 1.4);
        this.scenery.add(b);
      }
    }
    for (const side of [minX - 2.2, maxX + 7]) {
      const t = props.tree('round', { scale: 1.1 + rnd() * 0.4, ink });
      t.position.set(side, 0, minZ + rnd() * 2);
      this.scenery.add(t);
    }
    // Team gardens: a sign with the team's name in front of each.
    for (const sg of this.signs) {
      if (!sg.name) continue;
      const board = props.sign(sg.name.length > 18 ? `${sg.name.slice(0, 17)}…` : sg.name, { width: 2.6, ink });
      board.position.set(sg.x, 0, maxZ + 0.9);
      board.scale.setScalar(this.o.host ? 1.3 : 1);
      this.scenery.add(board);
    }
    // A lamp post at each back corner: warm light on the path, never in front of a bed.
    for (const x of [minX - 1.2, maxX + 1.2]) {
      const lamp = props.lampPost({ hue: 44, ink, height: 2.4 });
      lamp.position.set(x, 0, minZ - 1.2);
      const glow = glowSprite('#ffcf7a', 2.6, 0.45);
      glow.position.set(x, 2.45, minZ - 1.2);
      this.scenery.add(lamp, glow);
    }
  }

  private addPlot(p: PlotView): PlotObj {
    const root = new Group();
    this.scene.add(root);
    const glow = groundGlow('#ffd25a', 4.6, 0.85);
    glow.position.y = 0.04;
    glow.visible = false;
    const light = groundGlow('#ffb85a', 3.4, 0.4);
    light.position.y = 0.05;
    light.visible = false;
    root.add(glow, light);
    const obj: PlotObj = { id: p.id, root, plant: null, key: '', grow: 0, growTo: 0, seq: p.s, view: p, glow, light, treeGlow: null, glim: null, can: null, label: null, anim: null, canTip: 0 };
    this.plots.set(p.id, obj);
    return obj;
  }

  private place(obj: PlotObj) {
    const pos = this.positions.get(obj.id);
    if (pos) obj.root.position.copy(pos);
  }

  private dropPlot(id: string, obj: PlotObj) {
    this.labels.remove(obj.label);
    obj.glim?.dispose();
    obj.root.removeFromParent();
    this.plots.delete(id);
  }

  private updatePlot(obj: PlotObj, p: PlotView, st: GardenSceneState, withGlim: boolean) {
    const asleep = st.nightBloom && !st.dark && p.k === 'flower';
    const stage = stageOf(p);
    const key = `${p.k}|${stage === 'bloom' ? 'b' : stage === 'bud' ? 'u' : stage === 'seed' ? 's' : stage === 'bare' ? '-' : 'g'}|${p.d ? 1 : 0}|${asleep ? 1 : 0}`;
    if (key !== obj.key) {
      obj.key = key;
      if (obj.plant) {
        obj.plant.removeFromParent();
      }
      obj.plant = p.k ? plantModel(p, asleep) : null;
      if (obj.plant) {
        obj.plant.position.set(-0.15, BED_H + 0.03, -0.1);
        obj.root.add(obj.plant);
      }
    }
    obj.growTo = p.k ? (p.b ? 1 : stage === 'seed' ? 1 : 0.4 + 0.6 * Math.min(1, p.g / PLANTS[p.k].need)) : 0;
    if (!obj.grow) obj.grow = obj.growTo;
    obj.glow.visible = p.j >= st.need;
    obj.light.visible = Boolean(p.l);
    // A grown lantern tree shines (only at night in Night Bloom).
    const shines = p.k === 'tree' && p.b === 1 && !(st.nightBloom && !st.dark);
    if (shines && !obj.treeGlow) {
      obj.treeGlow = glowSprite('#ffcf6b', 4.5, 0.5);
      obj.treeGlow.position.set(-0.15, BED_H + 1.3, -0.1);
      obj.root.add(obj.treeGlow);
    } else if (!shines && obj.treeGlow) {
      obj.treeGlow.removeFromParent();
      obj.treeGlow = null;
    }
    // Glims and name tags.
    if (withGlim && !obj.glim) {
      const look = st.looks.get(p.id);
      if (look) {
        const glim = new Glim3D({ look, quality: this.env.quality, reducedMotion: this.env.reducedMotion });
        glim.scale.setScalar(this.o.host ? 1.35 : 1.15);
        glim.position.set(BED_W / 2 + 0.2, 0, BED_D / 2 - 0.05);
        const can = wateringCan();
        can.position.set(0.26, 0.2, 0.1);
        glim.add(can);
        obj.root.add(glim);
        obj.glim = glim;
        obj.can = can;
      }
    } else if (!withGlim && obj.glim) {
      obj.glim.dispose();
      obj.glim.removeFromParent();
      obj.glim = null;
      obj.can = null;
    }
    const you = p.id === this.o.me;
    const wantLabel = obj.glim !== null && (this.o.host || you || this.isNear(p.id));
    const name = you ? 'You' : (st.names.get(p.id) ?? 'A player');
    if (wantLabel && !obj.label) obj.label = this.labels.add(obj.glim!, name, { offsetY: this.o.host ? 1.3 : 1.15, className: you ? 'me small' : 'small', maxDistance: 400 });
    else if (!wantLabel && obj.label) {
      this.labels.remove(obj.label);
      obj.label = null;
    }
    if (obj.label) {
      obj.label.set(name);
      if (!this.o.host) obj.label.el.style.maxWidth = '9rem';
      obj.label.el.style.overflow = 'hidden';
      obj.label.el.style.textOverflow = 'ellipsis';
      obj.label.el.style.whiteSpace = 'nowrap';
    }
    // A change the scene has not shown yet.
    if (p.s !== obj.seq) {
      obj.seq = p.s;
      if (p.e) this.play(obj, p);
    }
    obj.view = p;
  }

  protected isNear(id: string): boolean {
    if (!this.o.me) return false;
    const a = this.positions.get(this.o.me);
    const b = this.positions.get(id);
    return Boolean(a && b && a.distanceTo(b) < PLOT_GAP * 1.6);
  }

  private play(obj: PlotObj, p: PlotView) {
    const e = p.e!;
    obj.anim = { kind: e, t: 0 };
    const top = obj.root.position.clone().add(new Vector3(-0.15, BED_H + 0.6, -0.1));
    if (e === 'water') {
      obj.canTip = 1;
      this.fx.burst(top, { color: ['#8fd3ff', '#cfeeff'], shape: 'dot', count: 14, speed: 1.4, gravity: 6, size: 0.09, life: 0.7 });
    } else if (e === 'gift' && p.by) {
      const from = this.plots.get(p.by);
      if (from) {
        from.canTip = 1;
        const start = (from.glim ? from.glim.getWorldPosition(new Vector3()) : from.root.position.clone()).add(new Vector3(0.3, 0.6, 0));
        const drop = new Mesh(dropGeo, toon('#8fd3ff', { glow: 0.5 }));
        drop.userData.sharedGeometry = true;
        drop.scale.setScalar(this.o.host ? 2.2 : 1.6);
        this.scene.add(drop);
        this.flights.push({ from: start, to: top, t: 0, mesh: drop, target: obj });
      } else this.fx.burst(top, { color: ['#8fd3ff', '#ffe27a'], shape: 'dot', count: 14, speed: 1.4, gravity: 5, size: 0.09 });
    } else if (e === 'bloom') {
      this.fx.burst(top.add(new Vector3(0, 0.3, 0)), { color: ['#ffd25a', '#ffffff', '#ff9cc2', '#9fe7ff'], shape: 'star', glow: true, count: 40, speed: 2.6, gravity: 1.2, size: this.o.host ? 0.3 : 0.2 });
      obj.glim?.play('cheer');
      obj.glim?.setExpression('happy', 2);
      if (p.by) {
        const giver = this.plots.get(p.by);
        giver?.glim?.setExpression('proud', 1.6);
      }
    } else if (e === 'plant') {
      obj.grow = 0.2;
      obj.glim?.play('dig');
      this.fx.burst(obj.root.position.clone().add(new Vector3(-0.15, BED_H + 0.1, -0.1)), { color: ['#6b4630', '#8a5c3c'], shape: 'square', count: 10, speed: 1.2, gravity: 5, size: 0.07 });
    } else if (e === 'droop') obj.glim?.setExpression('sad', 1.6);
    else if (e === 'perk') obj.glim?.setExpression('happy', 1.2);
    else if (e === 'light') this.fx.burst(top, { color: ['#ffd36b'], shape: 'spark', glow: true, count: 8, speed: 0.8, gravity: -0.3, size: 0.12 });
  }

  private updateRing(all: PlotView[]) {
    const total = all.reduce((n, p) => n + Math.min(14, p.r[0] + p.r[1] + p.r[2]), 0);
    if (!this.ring || this.ring.instanceMatrix.count < total) {
      this.ring?.removeFromParent();
      this.ring?.dispose();
      this.ring = new InstancedMesh(ringGeo, toon('#ffffff', { glow: 0.25 }), Math.max(16, Math.ceil(total * 1.5)));
      this.ring.userData.sharedGeometry = true;
      this.scene.add(this.ring);
    }
    let i = 0;
    const c = new Color();
    for (const p of all) {
      const pos = this.positions.get(p.id);
      if (!pos) continue;
      const kinds = [...Array(p.r[0]).fill(0), ...Array(p.r[1]).fill(1), ...Array(p.r[2]).fill(2)].slice(0, 14) as number[];
      kinds.forEach((k, j) => {
        // Round the rim of the bed: along the front first, then the sides.
        const side = j % 2 ? 1 : -1;
        const along = Math.floor(j / 2);
        const x = along < 4 ? side * (0.3 + along * 0.27) : side * (BED_W / 2 - 0.12);
        const z = along < 4 ? BED_D / 2 - 0.12 : BED_D / 2 - 0.4 - (along - 4) * 0.33;
        m4.makeTranslation(pos.x + x, BED_H + 0.08, pos.z + z);
        this.ring!.setMatrixAt(i, m4);
        this.ring!.setColorAt(i, c.set(k === 0 ? `hsl(${petalHue(p.id)}, 85%, 66%)` : k === 1 ? '#ff9cc2' : '#ffd36b'));
        i++;
      });
    }
    this.ring.count = i;
    this.ring.instanceMatrix.needsUpdate = true;
    if (this.ring.instanceColor) this.ring.instanceColor.needsUpdate = true;
  }

  /** Fireflies gather over the plots that brought them: up to 10 a plot, fewer on lower tiers. */
  private updateFlies(all: PlotView[], need: number) {
    const max = this.flies.userData.max as number;
    const per = this.env.quality.tier === 'low' ? 5 : this.env.quality.tier === 'medium' ? 7 : 10;
    const key = all.map((p) => `${p.id}:${Math.min(per, p.j)}`).join(',');
    if (key === this.flyKey) return;
    this.flyKey = key;
    const rnd = props.seeded(7);
    const next: typeof this.flyData = [];
    for (const p of all) {
      const n = Math.min(per, p.j, Math.max(0, max - next.length));
      const glowing = p.j >= need;
      for (let i = 0; i < n; i++) next.push({ plot: p.id, a: rnd() * Math.PI * 2, r: 0.5 + rnd() * (glowing ? 1.2 : 0.8), h: 0.8 + rnd() * 1.4, speed: 0.3 + rnd() * 0.5 });
    }
    this.flyData = next;
    this.flies.geometry.setDrawRange(0, next.length);
  }

  private setDark(dark: boolean) {
    this.dark = dark;
  }

  /** Everything that moves, for both scenes. */
  protected tickWorld(dt: number, t: number) {
    const calm = this.env.reducedMotion;
    // Night and day (Night Bloom): the sky, the light and the fog ease between them.
    const want = this.dark ? 1 : 0;
    if (Math.abs(this.darkLevel - want) > 0.001) {
      this.darkLevel += (want - this.darkLevel) * Math.min(1, dt * (calm ? 10 : 1.2));
      const k = this.darkLevel;
      const sky = this.scene.getObjectByName('sky') as Mesh | undefined;
      const u = (sky?.material as ShaderMaterial | undefined)?.uniforms;
      if (u) {
        (u.top!.value as Color).set(DAY_SKY.top).lerp(css(NIGHT_SKY.top), k);
        (u.horizon!.value as Color).set(DAY_SKY.horizon).lerp(css(NIGHT_SKY.horizon), k);
        (u.bottom!.value as Color).set(DAY_SKY.ground).lerp(css(NIGHT_SKY.ground), k);
      }
      // Day (Night Bloom) is plainly brighter than the moonlit night.
      this.sun.intensity = 3.2 - 0.9 * k;
      this.fill.intensity = 2.2 - 0.45 * k;
      this.sun.color.set('#fff1d6').lerp(css('#d4ddff'), k);
      this.fill.color.set('#bfe0ff').lerp(css(NIGHT_SKY.top), k);
      this.fill.groundColor.set('#6a8f4e').lerp(css('#3a4a5a'), k);
      (this.flies.material as PointsMaterial).opacity = 0.35 + 0.65 * k;
    }
    for (const obj of this.plots.values()) {
      obj.grow += (obj.growTo - obj.grow) * Math.min(1, dt * (calm ? 12 : 4));
      if (obj.plant) {
        let s = obj.grow;
        let tilt = obj.view.d ? 0.32 : 0;
        const a = obj.anim;
        if (a) {
          a.t += dt;
          if (a.kind === 'bloom' && !calm) s *= 1 + Math.sin(Math.min(1, a.t / 0.6) * Math.PI) * 0.18;
          if (a.kind === 'perk' && !calm) tilt *= 1 - Math.min(1, a.t / 0.5);
          if (a.t > 1.2) obj.anim = null;
        }
        if (!calm && !obj.view.d) tilt += Math.sin(t * 1.3 + obj.root.position.x) * 0.03;
        obj.plant.scale.setScalar(Math.max(0.05, s) * PLANT_SCALE);
        obj.plant.rotation.z += (tilt - obj.plant.rotation.z) * Math.min(1, dt * 5);
      }
      if (obj.can) {
        obj.canTip = Math.max(0, obj.canTip - dt * 0.9);
        const tip = Math.sin(Math.min(1, obj.canTip) * Math.PI);
        obj.can.rotation.z = -tip * 0.9;
        obj.can.position.y = 0.2 + tip * 0.15;
      }
      if (obj.glim) {
        // Glims face the camera, turned a little towards their bed.
        const g = obj.glim;
        g.getWorldPosition(v3);
        const toCam = Math.atan2(this.camera.position.x - v3.x, this.camera.position.z - v3.z);
        g.rotation.y = toCam - 0.35;
        g.update(dt);
      }
      if (obj.treeGlow && !calm) (obj.treeGlow.material as SpriteMaterial).opacity = 0.45 + Math.sin(t * 2 + obj.root.position.x) * 0.06;
    }
    // Gifts in flight: a drop arcs from the giver to the neighbour's bed.
    this.flights = this.flights.filter((f) => {
      f.t += dt / (calm ? 0.5 : 0.85);
      const k = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, f.to, k);
      f.mesh.position.y += Math.sin(k * Math.PI) * (calm ? 0.4 : 1.4);
      if (k >= 1) {
        f.mesh.removeFromParent();
        this.fx.burst(f.to, { color: ['#8fd3ff', '#ffe27a', '#ffffff'], shape: 'dot', count: 18, speed: 1.6, gravity: 4, size: 0.1 });
        return false;
      }
      return true;
    });
    // Fireflies drift round their plots.
    const pos = this.flies.geometry.getAttribute('position') as Float32BufferAttribute;
    const arr = pos.array as Float32Array;
    this.flyData.forEach((f, i) => {
      const at = this.positions.get(f.plot);
      if (!at) return;
      const a = f.a + (calm ? 0 : t * f.speed);
      arr[i * 3] = at.x + Math.cos(a) * f.r * 1.2;
      arr[i * 3 + 1] = f.h + (calm ? 0 : Math.sin(t * 1.7 + f.a * 3) * 0.18);
      arr[i * 3 + 2] = at.z + Math.sin(a) * f.r * 0.9;
    });
    pos.needsUpdate = true;
    if (this.o.host) {
      this.crowdClock -= dt;
      if (this.crowdClock <= 0) {
        this.crowdClock = 0.3;
        this.stackTags();
      }
    }
  }

  /**
   * On the big screen, name tags that would overlap on screen stack into one
   * tag listing those names (at most five, then "and N more").
   */
  private stackTags() {
    const w = this.width;
    const h = this.height;
    const items: { obj: PlotObj; x: number; y: number }[] = [];
    for (const obj of this.plots.values()) {
      if (!obj.label || !obj.glim) continue;
      obj.glim.getWorldPosition(v3);
      v3.y += 1.0;
      v3.project(this.camera);
      items.push({ obj, x: ((v3.x + 1) / 2) * w, y: ((1 - v3.y) / 2) * h });
    }
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    // Tags are as wide as the gap between neighbouring beds on screen allows, so a row of long names
    // never runs together; tags that still meet (a crowded corner, a small screen) stack into one.
    let gap = Infinity;
    for (const a of items) for (const b of items) if (a !== b && Math.abs(a.y - b.y) < 12) gap = Math.min(gap, Math.abs(a.x - b.x));
    const maxW = Math.max(56, Math.min(144, (Number.isFinite(gap) ? gap : 144) - 8));
    for (const it of items) it.obj.label!.el.style.maxWidth = `${maxW}px`;
    const used = new Set<PlotObj>();
    const clusters: (typeof items)[] = [];
    for (const it of items) {
      if (used.has(it.obj)) continue;
      const group = items.filter((o) => !used.has(o.obj) && Math.abs(o.x - it.x) < maxW && Math.abs(o.y - it.y) < 22);
      group.forEach((g) => used.add(g.obj));
      clusters.push(group);
    }
    let ci = 0;
    for (const group of clusters) {
      if (group.length < 2) {
        if (group[0]) group[0].obj.label!.visible = true;
        continue;
      }
      for (const g of group) g.obj.label!.visible = false;
      let tag = this.crowds[ci];
      if (!tag) {
        const anchor = new Object3D();
        this.scene.add(anchor);
        const label = this.labels.add(anchor, '', { offsetY: 1.0, className: 'small', maxDistance: 400 });
        Object.assign(label.el.style, { whiteSpace: 'pre-line', borderRadius: '10px', textAlign: 'center', lineHeight: '1.25', maxWidth: '10rem' });
        tag = { anchor, label };
        this.crowds[ci] = tag;
      }
      ci++;
      const centre = new Vector3();
      for (const g of group) centre.add(g.obj.glim!.getWorldPosition(new Vector3()));
      centre.divideScalar(group.length);
      tag.anchor.position.copy(centre);
      tag.label.visible = true;
      const names = group.map((g) => (g.obj.id === this.o.me ? 'You' : (this.state?.names.get(g.obj.id) ?? 'A player'))).sort((a, b) => a.localeCompare(b));
      const shown = names.length > 5 ? [...names.slice(0, 4), `and ${names.length - 4} more`] : names;
      tag.label.set(shown.map((n) => (n.length > 16 ? `${n.slice(0, 15)}…` : n)).join('\n'));
    }
    for (let i = ci; i < this.crowds.length; i++) this.crowds[i]!.label.visible = false;
  }

  override dispose() {
    for (const [id, obj] of this.plots) this.dropPlot(id, obj);
    for (const f of this.flights) f.mesh.removeFromParent();
    this.ring?.dispose();
    this.beds?.dispose();
    this.soil?.dispose();
    super.dispose();
  }
}

/* ------------------------------ a player's view ----------------------------- */

/** Looks at one player's plot and the plots round it. */
export class GardenScene extends GardenWorld {
  private cam: EaseCamera;

  constructor(env: StageEnv, me: string) {
    super(env, { host: false, me });
    this.cam = new EaseCamera(this.camera, env.reducedMotion);
  }

  tick(dt: number, t: number) {
    this.tickWorld(dt, t);
    const p = this.positions.get(this.o.me ?? '') ?? new Vector3();
    // Wide enough for the beds either side; a narrow phone stands further back.
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const halfW = PLOT_GAP * 1.45;
    const dist = Math.max(7.5, halfW / (tan * this.camera.aspect)) * 0.95;
    const el = 0.62;
    const drift = this.env.reducedMotion ? 0 : Math.sin(t * 0.12) * 0.4;
    this.cam.set([p.x + drift, p.y + Math.sin(el) * dist + 0.6, p.z + Math.cos(el) * dist + 0.4], [p.x, 0.5, p.z - 0.35]);
    this.cam.update(dt);
  }
}

/* -------------------------------- the big screen ------------------------------ */

/** Every garden whole, from in front and above, filling the picture. */
export class GardenHostScene extends GardenWorld {
  private cam: EaseCamera;

  constructor(env: StageEnv) {
    super(env, { host: true, me: null });
    this.cam = new EaseCamera(this.camera, env.reducedMotion);
  }

  tick(dt: number, t: number) {
    this.tickWorld(dt, t);
    const { minX, minZ, maxZ } = this.bounds;
    // The pond sits beside the garden, so the frame takes it in.
    const left = minX - 0.6;
    const right = this.pondEdge + 0.2;
    const cx = (left + right) / 2;
    const cz = (minZ + maxZ) / 2;
    const width = right - left;
    const depth = maxZ - minZ;
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    // A wide, shallow garden (team gardens side by side) is seen from lower down, so it fills the picture.
    const el = 0.55 + 0.4 * Math.min(1, (depth / Math.max(1, width)) * 1.5);
    const distW = width / 2 / (tan * this.camera.aspect);
    const distH = (depth * Math.sin(el) + 2.6) / 2 / tan;
    const dist = Math.max(distW, distH, 8) * 1.04;
    const drift = this.env.reducedMotion ? 0 : Math.sin(t * 0.05) * 0.6;
    this.cam.set([cx + drift, Math.sin(el) * dist + 0.4, cz + Math.cos(el) * dist + 0.4], [cx, 0.4, cz + 0.4]);
    this.cam.update(dt);
  }
}
