import {
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type MeshToonMaterial,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { glimColors, glimFrame } from '../art/glim/Glim.tsx';
import { glimCanvas, lookKey, type Expression, type GlimLook } from './glimTexture.ts';
import { inflate, type Inflated } from './inflate.ts';
import type { Quality } from './quality.ts';
import { inkMaterial, outline, toon } from './toon.ts';

/*
 * A Glim in 3D. The body is the Glim's own drawing blown up into a soft vinyl
 * toy (inflate.ts), so every Glim in the catalogue, and every new one, works
 * with no modelling. Arms and feet are real 3D parts placed where the drawing
 * puts them, so the Glim can walk, wave, dig, cast and cheer. Faces change for
 * moments (a surprised face when tagged, a grin on a big find) by swapping the
 * front picture.
 *
 * Everything moves procedurally: no animation files to load. Under reduced
 * motion the idle breathing and hovering stop; moves that are part of the
 * game (walking, digging) still show, gently.
 */

export type GlimAction = 'idle' | 'wave' | 'cheer' | 'dig' | 'cast' | 'reel' | 'hit' | 'type' | 'serve' | 'point' | 'sit' | 'celebrate';

/** How long one-off actions last, in seconds. Looping actions run until changed. */
const ONE_SHOT: Partial<Record<GlimAction, number>> = { hit: 0.6, cast: 0.7, celebrate: 1.6, wave: 1.8 };

const BOX = 120;
const M = 1 / 100;
const GRID: Record<Quality['tier'], number> = { low: 34, medium: 46, high: 58 };

interface Body {
  inflated: Inflated;
  front: Texture;
  back: Texture;
  scale: number;
}

const bodies = new Map<string, Promise<Body>>();
const faces = new Map<string, Promise<Texture>>();

function texture(canvas: HTMLCanvasElement): Texture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Build (once per look and quality) the inflated body and its two pictures. */
function loadBody(look: GlimLook, q: Quality): Promise<Body> {
  const key = lookKey(look, `${q.tier}`);
  let hit = bodies.get(key);
  if (hit) return hit;
  hit = (async () => {
    const size = q.texture;
    const [frontCanvas, backCanvas] = await Promise.all([glimCanvas(look, size), glimCanvas(look, size, { faceless: true })]);
    const alpha = frontCanvas.getContext('2d')!.getImageData(0, 0, size, size).data;
    const { scale, ground } = glimFrame(look.art, look.accessories);
    const inflated = inflate(alpha, size, { grid: GRID[q.tier], ground });
    return { inflated, front: texture(frontCanvas), back: texture(backCanvas), scale };
  })();
  bodies.set(key, hit);
  hit.catch(() => bodies.delete(key));
  return hit;
}

function loadFace(look: GlimLook, q: Quality, expression: Expression): Promise<Texture> {
  const key = lookKey(look, `${q.texture}|${expression}`);
  let hit = faces.get(key);
  if (!hit) {
    hit = glimCanvas(look, q.texture, { expression }).then(texture);
    faces.set(key, hit);
  }
  return hit;
}

let shadowTex: Texture | null = null;
function blobShadowTexture(): Texture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  shadowTex = new CanvasTexture(c);
  return shadowTex;
}

const shadowGeo = new CircleGeometry(0.5, 24).rotateX(-Math.PI / 2);
const armGeo = new CapsuleGeometry(0.05, 0.07, 4, 10).translate(0, -0.06, 0);
const footGeo = new SphereGeometry(0.07, 14, 10).scale(1, 0.62, 1.2);

export interface Glim3DOptions {
  look: GlimLook;
  quality: Quality;
  reducedMotion: boolean;
}

export class Glim3D extends Group {
  /** Turns and tilts with the body; arms hang from it. */
  readonly body = new Group();
  /** Resolves when the real body has replaced the stand-in. */
  readonly ready: Promise<void>;
  private mesh: Mesh | null = null;
  private frontMat: MeshToonMaterial | null = null;
  private backMat: MeshToonMaterial | null = null;
  private frontTex: Texture | null = null;
  private placeholder: Mesh;
  private shadow: Mesh;
  private arms: [Group, Group] = [new Group(), new Group()];
  private feet: [Mesh, Mesh];
  private floats: boolean;
  private colors: ReturnType<typeof glimColors>;
  private walkPhase = 0;
  private speed = 0;
  private action: GlimAction = 'idle';
  private actionT = 0;
  private actionLoop = true;
  private flashT = 0;
  private dim = false;
  private expressionUntil = 0;
  private clock = 0;
  private disposed = false;
  private mythicInk: MeshBasicMaterial | null = null;

  constructor(private readonly opts: Glim3DOptions) {
    super();
    const { look, quality } = opts;
    this.colors = glimColors(look.art);
    const { geo } = glimFrame(look.art, look.accessories);
    this.floats = !geo.foot;
    this.add(this.body);

    this.shadow = new Mesh(shadowGeo, new MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }));
    this.shadow.position.y = 0.01;
    this.shadow.renderOrder = 1;
    this.add(this.shadow);

    // A soft stand-in in the Glim's colour until its body has been built.
    this.placeholder = new Mesh(new SphereGeometry(0.32, 16, 12), toon(this.colors.body));
    this.placeholder.position.y = 0.34;
    this.body.add(this.placeholder);

    const limb = toon(geo.armStyle === 'wing' ? this.colors.deep : this.colors.body);
    for (const arm of this.arms) {
      const m = new Mesh(armGeo, limb);
      m.userData.sharedGeometry = true;
      arm.add(m);
      if (quality.outlines) outline(m, this.colors.outline, 0.012);
      arm.visible = Boolean(geo.arm);
      this.body.add(arm);
    }
    const footMat = toon(this.colors.deep);
    this.feet = [new Mesh(footGeo, footMat), new Mesh(footGeo, footMat)];
    for (const f of this.feet) {
      f.userData.sharedGeometry = true;
      f.visible = !this.floats;
      if (quality.outlines) outline(f, this.colors.outline, 0.012);
      this.add(f);
    }
    this.placeLimbs(1, null);
    this.ready = loadBody(look, quality).then((b) => {
      if (!this.disposed) this.useBody(b);
    });
  }

  private placeLimbs(scale: number, inflated: Inflated | null) {
    const { geo, ground } = glimFrame(this.opts.look.art, this.opts.look.accessories);
    const at = (p: { x: number; y: number }) => ({ x: ground.x + (p.x - ground.x) * scale, y: ground.y + (p.y - ground.y) * scale });
    if (geo.arm) {
      const a = at(geo.arm);
      const z = inflated ? inflated.surfaceAt(a.x, a.y) * 0.55 : 0.12;
      this.arms[0].position.set((a.x - ground.x) * M, (ground.y - a.y) * M, z);
      this.arms[1].position.set((BOX - a.x - ground.x) * M, (ground.y - a.y) * M, z);
      for (const arm of this.arms) arm.scale.setScalar(scale);
    }
    if (geo.foot) {
      const f = at(geo.foot);
      this.feet[0].position.set((f.x - ground.x) * M, 0.035, 0.03);
      this.feet[1].position.set((BOX - f.x - ground.x) * M, 0.035, 0.03);
      for (const foot of this.feet) foot.scale.setScalar(Math.max(0.75, scale));
    }
    this.shadow.scale.setScalar(this.floats ? 0.55 : 0.8);
  }

  private useBody(b: Body) {
    this.frontTex = b.front;
    this.frontMat = toon('#ffffff', { map: b.front, unique: true });
    this.backMat = toon('#ffffff', { map: b.back, unique: true });
    const mesh = new Mesh(b.inflated.geometry, [this.frontMat, this.backMat]);
    mesh.userData.sharedGeometry = true;
    mesh.castShadow = this.opts.quality.shadows;
    if (this.opts.quality.outlines) {
      const rarity = this.opts.look.rarity ?? 'common';
      const ink = rarity === 'legendary' ? '#ffcf3f' : this.colors.outline;
      const shell = outline(mesh, ink, 0.014);
      if (rarity === 'mythic') {
        this.mythicInk = inkMaterial('#ff6ad5', 0.016).clone();
        shell.material = this.mythicInk;
      }
    }
    this.body.remove(this.placeholder);
    this.placeholder.geometry.dispose();
    this.mesh = mesh;
    this.body.add(mesh);
    this.placeLimbs(b.scale, b.inflated);
    if (this.dim) this.setDim(true);
  }

  /** Walking speed in metres per second (0 to stand). Feet, sway and lean follow it. */
  setMoving(speed: number) {
    this.speed = speed;
  }

  /** Play an action. One-off actions (hit, cast, celebrate, wave) return to idle by themselves. */
  play(action: GlimAction) {
    if (this.action === action && this.actionLoop) return;
    this.action = action;
    this.actionT = 0;
    this.actionLoop = !(action in ONE_SHOT);
    if (action === 'hit') {
      this.flashT = 0.35;
      this.setExpression('surprised', 1.2);
    }
  }

  /** Show a face for a while (seconds), then go back to the Glim's own. */
  setExpression(expression: Expression | null, seconds = 1.5) {
    if (!this.frontMat || !this.frontTex) return;
    if (!expression) {
      this.frontMat.map = this.frontTex;
      this.expressionUntil = 0;
      return;
    }
    this.expressionUntil = this.clock + seconds;
    void loadFace(this.opts.look, this.opts.quality, expression).then((t) => {
      if (this.frontMat && this.clock < this.expressionUntil) {
        this.frontMat.map = t;
        this.frontMat.needsUpdate = true;
      }
    });
  }

  /** Greyed out and see-through: dimmed in Glow Tag, waiting to relight. */
  setDim(on: boolean) {
    this.dim = on;
    for (const m of [this.frontMat, this.backMat]) {
      if (!m) continue;
      m.transparent = on;
      m.opacity = on ? 0.4 : 1;
      m.color.set(on ? '#8a8aa0' : '#ffffff');
      m.needsUpdate = true;
    }
  }

  /** Move things along. */
  update(dt: number) {
    this.clock += dt;
    const calm = this.opts.reducedMotion;
    if (this.expressionUntil && this.clock >= this.expressionUntil) this.setExpression(null);
    this.actionT += dt;
    const oneShot = ONE_SHOT[this.action];
    if (oneShot && this.actionT >= oneShot) {
      this.action = 'idle';
      this.actionT = 0;
      this.actionLoop = true;
    }
    const t = this.actionT;
    const [R, L] = this.arms;
    const body = this.body;
    body.position.set(0, this.floats ? 0.12 + (calm ? 0 : Math.sin(this.clock * 2.2) * 0.03) : 0, 0);
    body.rotation.set(0, 0, 0);
    body.scale.set(1, 1, 1);
    // Arms rest hanging a little outward. Turning about z lifts an arm sideways (positive for the right
    // arm, which sits at +x); a negative turn about x swings it forward and up.
    let rz = 0.55;
    let lz = -0.55;
    let rx = 0;
    let lx = 0;

    // Walking.
    const moving = this.speed > 0.05;
    if (moving) {
      this.walkPhase += dt * (5 + this.speed * 2.2);
      const s = Math.sin(this.walkPhase);
      const stride = Math.min(0.09, 0.03 + this.speed * 0.02);
      if (!this.floats) {
        this.feet[0].position.z = 0.03 + s * stride;
        this.feet[1].position.z = 0.03 - s * stride;
        this.feet[0].position.y = 0.035 + Math.max(0, -Math.cos(this.walkPhase)) * 0.04;
        this.feet[1].position.y = 0.035 + Math.max(0, Math.cos(this.walkPhase)) * 0.04;
      }
      body.position.y += Math.abs(s) * (calm ? 0.01 : 0.035);
      body.rotation.x = Math.min(0.18, this.speed * 0.035);
      body.rotation.z = s * (calm ? 0.02 : 0.06);
      rx = s * 0.7;
      lx = -s * 0.7;
    } else if (!this.floats) {
      for (const f of this.feet) {
        f.position.z += (0.03 - f.position.z) * Math.min(1, dt * 10);
        f.position.y += (0.035 - f.position.y) * Math.min(1, dt * 10);
      }
      if (!calm && this.action === 'idle') body.scale.y = 1 + Math.sin(this.clock * 2) * 0.012;
    }

    switch (this.action) {
      case 'wave':
        rz = 2.5 + Math.sin(t * 9) * 0.35;
        break;
      case 'cheer':
      case 'celebrate': {
        rz = 2.7;
        lz = -2.7;
        const hop = Math.abs(Math.sin(t * 6));
        body.position.y += hop * (calm ? 0.02 : 0.12);
        if (this.action === 'celebrate' && !calm) body.rotation.y = t * 4;
        break;
      }
      case 'dig': {
        const c = (t * 1.6) % 1;
        const swing = c < 0.35 ? -2.4 * (c / 0.35) : -2.4 + 2.9 * ((c - 0.35) / 0.65);
        rx = lx = swing;
        rz = 0.25;
        lz = -0.25;
        body.rotation.x = c > 0.35 && c < 0.6 ? 0.25 : 0.05;
        break;
      }
      case 'cast': {
        const k = Math.min(1, t / 0.7);
        rx = k < 0.4 ? -2.6 * (k / 0.4) : -2.6 + 3.4 * ((k - 0.4) / 0.6);
        rz = 0.3;
        break;
      }
      case 'reel':
        rx = -1.2 + Math.sin(t * 10) * 0.25;
        lx = -1.2 + Math.cos(t * 10) * 0.25;
        rz = 0.2;
        lz = -0.2;
        break;
      case 'type':
        rx = -1.3 + Math.sin(t * 16) * 0.12;
        lx = -1.3 + Math.sin(t * 16 + 2) * 0.12;
        rz = 0.15;
        lz = -0.15;
        break;
      case 'serve':
        rx = -1.5;
        rz = 0.2;
        break;
      case 'point':
        rx = -1.6;
        rz = 0.1;
        break;
      case 'sit':
        body.position.y -= 0.08;
        break;
      case 'hit': {
        const k = Math.min(1, t / 0.6);
        body.rotation.x = -Math.sin(k * Math.PI) * 0.35;
        body.scale.set(1 + Math.sin(k * Math.PI) * 0.08, 1 - Math.sin(k * Math.PI) * 0.08, 1);
        rz = 1.2;
        lz = -1.2;
        break;
      }
      default:
        if (!calm && !moving) {
          rz -= Math.sin(this.clock * 1.7) * 0.05;
          lz += Math.sin(this.clock * 1.7) * 0.05;
        }
    }
    R.rotation.set(rx, 0, rz);
    L.rotation.set(lx, 0, lz);

    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      const k = this.flashT / 0.35;
      for (const m of [this.frontMat, this.backMat]) if (m) m.emissive.setScalar(k * 0.8);
    }
    if (this.mythicInk) this.mythicInk.color.setHSL((this.clock * 0.15) % 1, 0.9, 0.65);
    this.shadow.position.y = 0.01;
  }

  override dispose() {
    this.disposed = true;
    this.frontMat?.dispose();
    this.backMat?.dispose();
    this.mythicInk?.dispose();
    (this.shadow.material as MeshBasicMaterial).dispose();
    this.removeFromParent();
    super.dispose();
  }
}

/** The Glim a player shows: their own buddy, or a stand-in that is always the same for them. */
export function lookFor(avatar: { art: GlimLook['art']; accessories?: GlimLook['accessories']; rarity?: GlimLook['rarity'] } | null | undefined, fallback: GlimLook['art']): GlimLook {
  return avatar ? { art: avatar.art, accessories: avatar.accessories, rarity: avatar.rarity } : { art: fallback };
}

