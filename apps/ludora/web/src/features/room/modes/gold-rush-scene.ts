import { AdditiveBlending, BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, SphereGeometry, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { GlimArt } from '@ludora/shared';
import { DAY, EaseCamera, Glim3D, World, css, props, toon, type GlimLook, type StageEnv } from '../../../three/index.ts';

/*
 * Gold Rush in 3D. A goldfield cut open like a cake: the shaft runs down
 * through layers of soil, clay, gravel, quartz and bedrock, each level held
 * up by timber once it is dug. Your Glim digs at the bottom by lantern light,
 * finds pop out and drop into the bucket, cave-ins tumble down, and banking
 * sends the cart along the rails to the bank.
 *
 * `Shaft` is one mine; the player's scene has one big shaft with the
 * goldfield behind it, and the big screen lines up a row of small ones, one
 * per miner. Scenes only draw what the view says happened.
 */

export const LEVEL_H = 1.25;

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
const SLAB_BACK = -2.2;

/** Soil by depth: the colours of each band of levels. */
function layerColour(level: number, levels: number): string {
  const band = level / levels;
  const v = (level * 37) % 7;
  if (band <= 0.17) return `hsl(26 38% ${30 + v}%)`;
  if (band <= 0.42) return `hsl(22 55% ${42 + v}%)`;
  if (band <= 0.67) return `hsl(32 18% ${46 + v}%)`;
  if (band <= 0.92) return `hsl(240 6% ${58 + v}%)`;
  return `hsl(262 10% ${34 + v}%)`;
}

export type FindKind = 'dust' | 'nugget' | 'bonanza' | 'vein' | 'relic' | 'map' | 'water' | 'cavein';

export interface ShaftFind {
  seq: number;
  kind: FindKind;
  level: number;
  gold: number;
  big: boolean;
}

interface Step {
  at: number;
  run: () => void;
}

const box = new BoxGeometry(1, 1, 1);
const post = new CylinderGeometry(0.06, 0.07, 1, 6);
const rope = new CylinderGeometry(0.015, 0.015, 1, 4).translate(0, -0.5, 0);
const bucketGeo = new CylinderGeometry(0.22, 0.17, 0.32, 10);
const rockGeo = new SphereGeometry(0.22, 6, 5);

function block(w: number, h: number, d: number, colour: string, x: number, y: number, z: number): Mesh {
  const m = new Mesh(box, toon(colour));
  m.userData.sharedGeometry = true;
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

export interface ShaftOptions {
  levels: number;
  /** Width of the whole cut (metres); the shaft itself is 1.5 wide. */
  width: number;
  look: GlimLook;
  /** Wall nuggets and timber detail (the player's own big shaft). */
  detail: boolean;
  lamp: boolean;
}

/** One mine: a slice of goldfield with a shaft, timber, a headframe, a bucket and its miner. */
export class Shaft {
  readonly group = new Group();
  readonly glim: Glim3D;
  /** The depth drawn now (eases towards the view's). */
  shown = 0;
  private target = 0;
  private plugs: Mesh[] = [];
  private timbers: Group[] = [];
  private bucket = new Group();
  private bucketGold: Mesh[] = [];
  private ropeMesh: Mesh;
  private glow: Sprite | null = null;
  private lamp: Group;
  private steps: Step[] = [];
  private time = 0;
  private rocks: { mesh: Mesh; vy: number; floor: number }[] = [];
  private pop: { mesh: Mesh; t: number; from: Vector3 } | null = null;
  readonly half: number;

  constructor(
    private readonly world: World,
    private readonly o: ShaftOptions,
  ) {
    const q = world.env.quality;
    const ink = q.outlines;
    const half = o.width / 2;
    this.half = half;
    const sw = 0.75;
    const sideW = half - sw;
    // The layers, left and right of the shaft, and a plug of earth in the shaft for every level not yet dug.
    for (let i = 1; i <= o.levels; i++) {
      const colour = layerColour(i, o.levels);
      const y = -(i - 0.5) * LEVEL_H;
      this.group.add(block(sideW, LEVEL_H, -SLAB_BACK, colour, -sw - sideW / 2, y, SLAB_BACK / 2));
      this.group.add(block(sideW, LEVEL_H, -SLAB_BACK, colour, sw + sideW / 2, y, SLAB_BACK / 2));
      // The back wall of the dug shaft, a shade darker.
      this.group.add(block(sw * 2, LEVEL_H, 0.8, css(colour).multiplyScalar(0.62).getStyle(), 0, y, SLAB_BACK + 0.4));
      const plug = block(sw * 2 - 0.02, LEVEL_H - 0.02, -SLAB_BACK - 0.8, css(colour).multiplyScalar(0.9).getStyle(), 0, y, (SLAB_BACK + 0.8) / 2);
      this.plugs.push(plug);
      this.group.add(plug);
      const timber = new Group();
      for (const side of [-1, 1]) {
        const p = new Mesh(post, toon('#8a5a2c'));
        p.userData.sharedGeometry = true;
        p.scale.y = LEVEL_H;
        p.position.set(side * (sw - 0.08), y, -0.25);
        timber.add(p);
      }
      const beam = block(sw * 2, 0.12, 0.14, '#7a4a22', 0, y + LEVEL_H / 2 - 0.06, -0.25);
      timber.add(beam);
      timber.visible = false;
      this.timbers.push(timber);
      this.group.add(timber);
    }
    // Strata: a dark seam between levels, and stones set in the cut face.
    for (let i = 1; i < o.levels; i++) {
      for (const side of [-1, 1]) this.group.add(block(sideW, 0.05, 0.02, 'hsl(20 30% 14%)', side * (sw + sideW / 2), -i * LEVEL_H, 0.005));
    }
    if (o.detail) {
      const rs = props.seeded(o.levels * 13 + 3);
      for (let i = 0; i < o.levels * 2; i++) {
        const level = 1 + Math.floor(rs() * o.levels);
        const stone = props.rock({ scale: 0.1 + rs() * 0.14, seed: i + 1, color: `hsl(${20 + rs() * 30} ${10 + rs() * 15}% ${30 + rs() * 25}%)` });
        stone.castShadow = false;
        const side = rs() < 0.5 ? -1 : 1;
        stone.position.set(side * (sw + 0.25 + rs() * (sideW - 0.5)), -(level - 0.15 - rs() * 0.7) * LEVEL_H, 0.02);
        this.group.add(stone);
      }
    }
    // Bedrock under the last level.
    this.group.add(block(o.width, 3, -SLAB_BACK, 'hsl(262 12% 24%)', 0, -o.levels * LEVEL_H - 1.5, SLAB_BACK / 2));
    // Grass on top.
    for (const side of [-1, 1]) this.group.add(block(sideW, 0.16, -SLAB_BACK, '#6fae4f', side * (sw + sideW / 2), 0.08, SLAB_BACK / 2));
    // Glints of gold in the walls of the deeper levels.
    if (o.detail) {
      const rnd = props.seeded(o.levels * 7 + Math.round(o.width));
      for (let i = 0; i < Math.round(o.levels * 1.5); i++) {
        const level = 2 + Math.floor(rnd() * (o.levels - 1));
        const n = props.nugget({ scale: 0.6 + rnd() * 0.4 + (level / o.levels) * 0.7 });
        n.castShadow = false;
        const side = rnd() < 0.5 ? -1 : 1;
        n.position.set(side * (sw + 0.3 + rnd() * (sideW - 0.6)), -(level - 0.2 - rnd() * 0.6) * LEVEL_H, 0.02);
        n.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        this.group.add(n);
      }
    }
    // The headframe and windlass over the shaft.
    const frame = new Group();
    for (const side of [-1, 1]) {
      const leg = new Mesh(post, toon('#7a4a22'));
      leg.userData.sharedGeometry = true;
      leg.scale.set(1.4, 2.9, 1.4);
      leg.position.set(side * 0.95, 1.35, -0.6);
      leg.rotation.z = side * 0.18;
      frame.add(leg);
    }
    const drum = new Mesh(new CylinderGeometry(0.16, 0.16, 2.1, 10).rotateZ(Math.PI / 2), toon('#9a6234'));
    drum.position.set(0, 2.6, -0.6);
    frame.add(drum);
    this.group.add(frame);
    this.ropeMesh = new Mesh(rope, toon('#d8c9a8'));
    this.ropeMesh.userData.sharedGeometry = true;
    this.ropeMesh.position.set(0.42, 2.6, -0.6);
    this.group.add(this.ropeMesh);
    const pail = new Mesh(bucketGeo, toon('#6a6a78'));
    pail.userData.sharedGeometry = true;
    this.bucket.add(pail);
    for (let i = 0; i < 8; i++) {
      const g = props.nugget({ scale: 0.55 });
      g.position.set(((i % 3) - 1) * 0.1, 0.12 + Math.floor(i / 3) * 0.06, ((i % 2) - 0.5) * 0.08);
      g.visible = false;
      this.bucketGold.push(g);
      this.bucket.add(g);
    }
    this.group.add(this.bucket);

    this.glim = new Glim3D({ look: o.look, quality: q, reducedMotion: world.env.reducedMotion });
    this.glim.scale.setScalar(1.2);
    this.group.add(this.glim);

    this.lamp = props.lantern({ scale: 0.45, ink });
    this.group.add(this.lamp);
    // Lamplight as a soft glow rather than a light: toon shading would turn a point light into a hard disc.
    if (o.lamp) {
      this.glow = new Sprite(new SpriteMaterial({ map: glowTexture(), color: '#ffcf7a', transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.55 }));
      this.glow.scale.set(3.2, 3.2, 1);
      this.glow.position.y = 0.2;
      this.lamp.add(this.glow);
    }
    this.place(true);
  }

  /** The floor of a level, in the shaft's own coordinates. */
  floor(level: number): number {
    return level <= 0 ? 0 : -level * LEVEL_H;
  }

  /** Where the miner stands at the depth drawn now. */
  private place(snap: boolean) {
    const d = this.shown;
    const y = this.floor(d);
    const want = d <= 0 ? new Vector3(-1.35, 0.16, -0.5) : new Vector3(-0.15, y, -0.65);
    if (snap) this.glim.position.copy(want);
    else this.glim.position.lerp(want, 0.18);
    for (let i = 0; i < this.plugs.length; i++) {
      this.plugs[i]!.visible = i >= Math.round(d);
      this.timbers[i]!.visible = i < Math.round(d);
    }
    const bucketY = d <= 0 ? 0.6 : y + 0.18;
    this.bucket.position.set(0.42, this.bucket.position.y + (bucketY - this.bucket.position.y) * (snap ? 1 : 0.15), -0.6);
    this.ropeMesh.scale.y = Math.max(0.1, 2.6 - this.bucket.position.y - 0.16);
    this.lamp.position.set(-0.6, d <= 0 ? 1.0 : y + 0.95, -0.95);
  }

  /** Gold in the bucket: a few nuggets that show how full the cart is. */
  setCart(gold: number) {
    const n = gold <= 0 ? 0 : Math.min(8, 1 + Math.floor(gold / 40));
    this.bucketGold.forEach((g, i) => (g.visible = i < n));
  }

  /** Go straight to a depth with no fuss (first sight, catching up). */
  jump(depth: number) {
    this.shown = depth;
    this.target = depth;
    this.place(true);
  }

  private later(seconds: number, run: () => void) {
    this.steps.push({ at: this.time + seconds, run });
  }

  /** A dig: swing, break through, go down, and show what came up. */
  dig(find: ShaftFind, onReveal: (pos: Vector3) => void) {
    const g = this.glim;
    g.play('dig');
    this.later(0.75, () => {
      const plug = this.plugs[find.level - 1];
      const at = new Vector3(0, this.floor(find.level) + LEVEL_H * 0.5, -0.3);
      this.world.fx.burst(this.worldPos(at), { color: [layerColour(find.level, this.o.levels), '#5a3a22'], shape: 'square', count: 22, speed: 3, gravity: 9, size: 0.12 });
      if (plug) plug.visible = false;
      this.target = find.level;
    });
    this.later(1.35, () => {
      g.play('idle');
      const pos = new Vector3(0.1, this.floor(find.level) + 0.35, -0.2);
      this.showFind(find, pos);
      onReveal(this.worldPos(pos.clone().add(new Vector3(0, 0.9, 0))));
    });
  }

  private showFind(find: ShaftFind, pos: Vector3) {
    const fx = this.world.fx;
    const wp = this.worldPos(pos);
    let mesh: Mesh | null = null;
    switch (find.kind) {
      case 'dust':
        fx.burst(wp, { color: ['#ffd25a', '#fff1a8'], shape: 'star', glow: true, count: 18, speed: 2.4, gravity: 2 });
        break;
      case 'nugget':
        mesh = props.nugget({ scale: 1.8, ink: this.world.env.quality.outlines });
        fx.burst(wp, { color: ['#ffd25a', '#fff1a8'], shape: 'star', glow: true, count: 24, speed: 3 });
        break;
      case 'bonanza':
        mesh = props.nugget({ scale: 3.4, ink: this.world.env.quality.outlines });
        fx.burst(wp, { color: ['#ffd25a', '#ff9a2b', '#fff1a8'], shape: 'star', glow: true, count: 60, speed: 5 });
        this.glim.play('celebrate');
        this.glim.setExpression('happy', 2.2);
        break;
      case 'vein':
        mesh = props.gem({ color: '#f4f0e0', scale: 1.8, ink: this.world.env.quality.outlines });
        fx.burst(wp, { color: ['#ffffff', '#ffd25a'], shape: 'spark', glow: true, count: 18 });
        break;
      case 'relic':
        mesh = props.gem({ color: '#c86bff', scale: 1.6, ink: this.world.env.quality.outlines });
        fx.burst(wp, { color: ['#c86bff', '#ffd25a'], shape: 'star', glow: true, count: 18 });
        break;
      case 'map':
        mesh = block(0.5, 0.36, 0.02, '#f1e2bf', 0, 0, 0);
        fx.burst(wp, { color: ['#f1e2bf', '#ff4d6a'], shape: 'square', count: 14 });
        this.glim.setExpression('proud', 1.6);
        break;
      case 'water':
        fx.burst(wp, { color: ['#7fd4ff', '#2fa6d6'], shape: 'dot', count: 26, speed: 2.6, gravity: 7 });
        this.glim.setExpression('sad', 1.2);
        break;
      default:
        break;
    }
    if (find.big && find.kind !== 'bonanza') {
      this.glim.play('cheer');
      this.glim.setExpression('happy', 1.6);
      this.later(1.2, () => this.glim.play('idle'));
    }
    if (mesh) {
      mesh.position.copy(pos);
      this.group.add(mesh);
      this.pop = { mesh, t: 0, from: pos.clone() };
    }
  }

  /** The shaft caves in: rocks fall, the miner is knocked silly, and the shaft fills in again. */
  caveIn(level: number) {
    const top = 2;
    const floor = this.floor(Math.max(1, level));
    for (let i = 0; i < 9; i++) {
      const r = new Mesh(rockGeo, toon(i % 2 ? '#7d6a5a' : '#9a8878'));
      r.userData.sharedGeometry = true;
      r.position.set((Math.random() - 0.5) * 1.1, top + i * 0.6, -0.2 - Math.random() * 0.8);
      r.scale.setScalar(0.7 + Math.random() * 0.8);
      this.group.add(r);
      this.rocks.push({ mesh: r, vy: 0, floor: floor + 0.15 + Math.random() * 0.3 });
    }
    this.target = Math.max(1, level - 1);
    this.later(0.7, () => {
      this.glim.play('hit');
      this.glim.setExpression('dizzy', 1.8);
      this.world.fx.burst(this.worldPos(new Vector3(0, floor + 0.6, -0.3)), { color: ['#9a8878', '#c8b8a0'], shape: 'dot', count: 40, speed: 2.5, gravity: 1.5, size: 0.3, life: 1.4 });
    });
    this.later(2.0, () => {
      for (const r of this.rocks) r.mesh.removeFromParent();
      this.rocks = [];
      this.jump(0);
    });
  }

  /** The cart goes to the bank. */
  bank() {
    this.glim.play('wave');
    this.setCart(0);
  }

  worldPos(local: Vector3): Vector3 {
    return local.clone().applyMatrix4(this.group.matrixWorld);
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
    if (Math.abs(this.shown - this.target) > 0.001) {
      this.shown += (this.target - this.shown) * Math.min(1, dt * 5);
      if (Math.abs(this.shown - this.target) < 0.01) this.shown = this.target;
      this.glim.setMoving(0.6);
    } else this.glim.setMoving(0);
    this.place(false);
    for (const r of this.rocks) {
      r.vy -= 14 * dt;
      r.mesh.position.y += r.vy * dt;
      if (r.mesh.position.y < r.floor) {
        r.mesh.position.y = r.floor;
        r.vy = Math.abs(r.vy) > 1 ? -r.vy * 0.25 : 0;
      }
    }
    if (this.pop) {
      const p = this.pop;
      p.t += dt;
      const k = Math.min(1, p.t / 0.6);
      p.mesh.position.set(p.from.x, p.from.y + Math.sin(k * Math.PI * 0.5) * 0.9, p.from.z + 0.3);
      p.mesh.rotation.y += dt * 3;
      if (p.t > 1.4) {
        const into = Math.min(1, (p.t - 1.4) / 0.4);
        p.mesh.position.lerp(this.bucket.position.clone().add(new Vector3(0, 0.2, 0)), into);
        p.mesh.scale.multiplyScalar(1 - into * 0.2);
      }
      if (p.t > 1.9) {
        p.mesh.removeFromParent();
        this.pop = null;
      }
    }
    this.glim.update(dt);
  }
}

/* ------------------------------- the player's mine ------------------------------ */

export interface MineState {
  depth: number;
  cart: number;
  find: ShaftFind | null;
  bankedAt: number;
  lastBank: number;
  event: string | null;
}

export class GoldRushScene extends World {
  private shaft: Shaft;
  private cam: EaseCamera;
  private cart: Group;
  private cartX = 1.3;
  private cartTo = 1.3;
  private water: ReturnType<typeof props.water>;
  private seenFind = -1;
  private seenBank = -1;
  private fever = 0;
  onFind: ((find: ShaftFind) => void) | null = null;

  constructor(env: StageEnv, look: GlimLook, levels: number) {
    super(env, { ...DAY, fogNear: 30, fogFar: 110 });
    const ink = env.quality.outlines;
    this.shaft = new Shaft(this, { levels, width: 16, look, detail: true, lamp: true });
    this.scene.add(this.shaft.group);
    this.cam = new EaseCamera(this.camera, env.reducedMotion);

    // The goldfield behind the cut.
    const field = props.ground(140, 90, '#7fae55');
    field.position.set(0, 0, -47);
    this.scene.add(field);
    const rnd = props.seeded(11);
    for (let i = 0; i < 16; i++) {
      const t = props.tree(i % 4 === 0 ? 'round' : 'gum', { ink, scale: 0.8 + rnd() * 0.5 });
      t.position.set(-30 + rnd() * 60, 0, -8 - rnd() * 30);
      if (Math.abs(t.position.x) < 4 && t.position.z > -12) t.position.x += 8;
      this.scene.add(t);
    }
    for (let i = 0; i < 6; i++) {
      const tent = props.tent({ ink, color: i % 2 ? '#efe2c4' : '#e6d2a6' });
      tent.position.set(-14 + i * 4.8 + rnd() * 1.5, 0, -6 - rnd() * 4);
      tent.rotation.y = (rnd() - 0.5) * 0.8;
      this.scene.add(tent);
    }
    for (let i = 0; i < 5; i++) {
      const hill = new Mesh(new SphereGeometry(1, 16, 10), toon(i % 2 ? '#8fb86a' : '#a3c47a'));
      hill.scale.set(18 + rnd() * 10, 6 + rnd() * 5, 10);
      hill.position.set(-48 + i * 24, -1, -55 - rnd() * 10);
      this.scene.add(hill);
    }
    this.water = props.water(60, 5, { calm: true });
    this.water.position.set(0, 0.04, -22);
    this.scene.add(this.water);

    // The bank, at the end of the rails.
    const bank = new Group();
    bank.add(block(2.6, 1.9, 2, '#d9a35b', 0, 0.95, 0));
    const roof = new Mesh(new CylinderGeometry(0, 2.1, 1.1, 4, 1).rotateY(Math.PI / 4), toon('#9a3b2e'));
    roof.position.y = 2.45;
    roof.scale.set(1, 1, 0.8);
    bank.add(roof);
    bank.add(block(0.7, 1.1, 0.05, '#3a2a2a', 0, 0.55, 1.02));
    const plate = props.sign('Bank', { width: 1.6, post: false, ink });
    plate.position.set(0, 1.55, 1.08);
    bank.add(plate);
    bank.position.set(6.2, 0.16, -1.2);
    this.scene.add(bank);
    for (let i = 0; i < 6; i++) {
      const sleeper = block(0.18, 0.06, 0.9, '#6a4426', 1.2 + i * 0.8, 0.19, -0.5);
      this.scene.add(sleeper);
    }
    for (const z of [-0.2, -0.8]) this.scene.add(block(4.4, 0.05, 0.05, '#6a6a78', 3.2, 0.24, z));
    this.cart = new Group();
    this.cart.add(block(0.9, 0.45, 0.6, '#7a7a88', 0, 0.45, 0));
    for (const x of [-0.3, 0.3]) for (const z of [-0.32, 0.32]) {
      const wheel = new Mesh(new CylinderGeometry(0.12, 0.12, 0.06, 10).rotateX(Math.PI / 2), toon('#2e2a3a'));
      wheel.position.set(x, 0.22, z);
      this.cart.add(wheel);
    }
    this.cart.position.set(this.cartX, 0.16, -0.5);
    this.scene.add(this.cart);
    this.labels.add(this.shaft.glim, 'You', { offsetY: 1.25, className: 'me small' });
    this.shadowArea(9, [0, -2, -1]);
  }

  /** The latest view. */
  setState(s: MineState) {
    this.shaft.setCart(s.cart);
    this.fever = s.event === 'fever' ? 1 : 0;
    if (this.seenFind < 0 && this.seenBank < 0) {
      // First sight: go straight to where things are.
      this.seenFind = s.find?.seq ?? 0;
      this.seenBank = s.bankedAt;
      this.shaft.jump(s.depth);
      return;
    }
    if (s.find && s.find.seq !== this.seenFind) {
      this.seenFind = s.find.seq;
      const find = s.find;
      if (find.kind === 'cavein') this.shaft.caveIn(find.level);
      else
        this.shaft.dig(find, (pos) => {
          if (find.gold > 0) {
            const marker = new Group();
            marker.position.copy(pos);
            this.scene.add(marker);
            const label = this.labels.add(marker, `+${String(find.gold)}`, { offsetY: 0, className: `pop ${find.big ? 'big tone-gold' : 'tone-gold'}` });
            setTimeout(() => {
              this.labels.remove(label);
              marker.removeFromParent();
            }, 1000);
          }
          this.onFind?.(find);
        });
    }
    if (s.bankedAt !== this.seenBank) {
      this.seenBank = s.bankedAt;
      this.shaft.jump(0);
      this.shaft.bank();
      this.cartX = 1.3;
      this.cartTo = 5.2;
      if (s.lastBank > 0) {
        const at = new Vector3(6.2, 2.2, -0.2);
        setTimeout(() => this.fx.burst(at, { color: ['#ffd25a', '#fff1a8'], shape: 'star', glow: true, count: 40, speed: 4 }), 900);
      }
    }
  }

  tick(dt: number, t: number) {
    this.shaft.update(dt);
    this.water.time(t);
    // The cart rolls to the bank and back.
    if (Math.abs(this.cartX - this.cartTo) > 0.01) {
      this.cartX += Math.sign(this.cartTo - this.cartX) * Math.min(Math.abs(this.cartTo - this.cartX), dt * 4);
      if (Math.abs(this.cartX - this.cartTo) < 0.02 && this.cartTo > 2) setTimeout(() => (this.cartTo = 1.3), 600);
    }
    this.cart.position.x = this.cartX;
    if (this.fever && Math.floor(t * 3) !== Math.floor((t - dt) * 3)) {
      this.fx.burst(new Vector3((Math.random() - 0.5) * 8, 1 + Math.random() * 3, -1), { color: ['#ffd25a', '#fff1a8'], shape: 'star', glow: true, count: 6, speed: 0.6, gravity: -0.4, life: 1.6 });
    }
    // Frame the miner: close in when down the shaft, wider at the top. Narrow screens stand further back.
    const d = this.shaft.shown;
    const y = this.shaft.floor(d);
    const far = this.camera.aspect < 0.8 ? 1.65 : this.camera.aspect < 1.2 ? 1.25 : 1;
    if (d <= 0.05) this.cam.set([3.2, 3.2 * far, 11 * far], [1.8, 0.2, -1]);
    else this.cam.set([1.9, y + 1.7 * far, 6.6 * far], [0.25, y + 0.55, -0.7]);
    this.cam.update(dt);
  }
}

/* ------------------------------- the big screen ------------------------------- */

export interface FieldMiner {
  playerId: string;
  name: string;
  depth: number;
  cart: number;
  banked: number;
  lastKind: FindKind | null;
  lastSeq: number;
  bankedAt: number;
  look: GlimLook;
}

const FIELD_MAX = 12;

/** A row of mines, one per miner (the top twelve), for the big screen. */
export class GoldFieldScene extends World {
  private shafts = new Map<string, { shaft: Shaft; seq: number; bankedAt: number; label: ReturnType<World['labels']['add']> }>();
  private order: string[] = [];
  private levels: number;
  private cam: EaseCamera;
  private water: ReturnType<typeof props.water>;

  constructor(env: StageEnv, levels: number) {
    super(env, { ...DAY, fogNear: 50, fogFar: 160 });
    this.levels = levels;
    this.cam = new EaseCamera(this.camera, env.reducedMotion);
    const field = props.ground(200, 90, '#7fae55');
    field.position.set(0, 0, -47);
    this.scene.add(field);
    const rnd = props.seeded(5);
    for (let i = 0; i < 22; i++) {
      const t = props.tree(i % 3 === 0 ? 'round' : 'gum', { ink: env.quality.outlines, scale: 0.9 + rnd() * 0.6 });
      t.position.set(-50 + rnd() * 100, 0, -9 - rnd() * 30);
      this.scene.add(t);
    }
    this.water = props.water(120, 6, { calm: true });
    this.water.position.set(0, 0.04, -26);
    this.scene.add(this.water);
  }

  setMiners(miners: FieldMiner[]) {
    const top = miners.slice(0, FIELD_MAX);
    const ids = top.map((m) => m.playerId);
    for (const [id, s] of this.shafts) {
      if (!ids.includes(id)) {
        s.shaft.group.removeFromParent();
        s.shaft.glim.dispose();
        this.labels.remove(s.label);
        this.shafts.delete(id);
      }
    }
    const width = 3.4;
    top.forEach((m, i) => {
      let s = this.shafts.get(m.playerId);
      if (!s) {
        const shaft = new Shaft(this, { levels: this.levels, width, look: m.look, detail: false, lamp: false });
        this.scene.add(shaft.group);
        shaft.jump(m.depth);
        const label = this.labels.add(shaft.glim, m.name, { offsetY: 1.2, className: 'small' });
        s = { shaft, seq: m.lastSeq, bankedAt: m.bankedAt, label };
        this.shafts.set(m.playerId, s);
      }
      s.shaft.group.position.x = (i - (top.length - 1) / 2) * width;
      s.shaft.setCart(m.cart);
      if (m.lastSeq !== s.seq) {
        s.seq = m.lastSeq;
        if (m.lastKind === 'cavein') s.shaft.caveIn(Math.max(1, s.shaft.shown + 1));
        else if (m.lastKind) s.shaft.dig({ seq: m.lastSeq, kind: m.lastKind, level: m.depth, gold: 0, big: false }, () => {});
      }
      if (m.bankedAt !== s.bankedAt) {
        s.bankedAt = m.bankedAt;
        s.shaft.jump(0);
        s.shaft.bank();
      }
      s.label.set(`${m.name}  ${m.banked}`);
    });
    this.order = ids;
  }

  tick(dt: number, t: number) {
    for (const s of this.shafts.values()) s.shaft.update(dt);
    this.water.time(t);
    const n = Math.max(1, this.order.length);
    const span = n * 3.4 + 1;
    const deepest = Math.min(this.levels, Math.max(2, ...[...this.shafts.values()].map((s) => s.shaft.shown)));
    // Fit the whole row across, and from the sky above the headframes down to the deepest miner.
    const top = 3.4;
    const bottom = -(deepest + 0.8) * LEVEL_H;
    const midY = (top + bottom) / 2;
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const dist = Math.max((span * 0.52) / (tan * this.camera.aspect), ((top - bottom) * 0.55) / tan, 9);
    // When the row's width sets the distance, keep the top of the picture just above the headframes rather than in the sky.
    const centreY = Math.max(bottom - 1, Math.min(midY, top + 0.8 - dist * tan));
    this.cam.set([0, centreY + 1.2, dist], [0, centreY, -1]);
    this.cam.update(dt);
  }
}

/** A Glim look for a player, with a stand-in for anyone who has no avatar. */
export function lookOf(avatar: { art: GlimArt; accessories?: GlimLook['accessories']; rarity?: GlimLook['rarity'] } | null | undefined, fallback: GlimArt): GlimLook {
  return avatar ? { art: avatar.art, accessories: avatar.accessories, rarity: avatar.rarity } : { art: fallback };
}
