import { AdditiveBlending, BoxGeometry, CanvasTexture, CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, Plane, Raycaster, Sprite, SpriteMaterial, Vector2, Vector3 } from 'three';
import type { GlimArt } from '@ludora/shared';
import { Glim3D, World, outlineAll, props, toon, type GlimLook, type Lighting, type Quality, type StageEnv } from '../../../three/index.ts';

/*
 * The yard: the home menu as a place. The player's buddy stands on a low dais in the middle of a
 * paved circle at dusk, and round it are six things to walk up to: a board to host from, a
 * practice target, an arcade cabinet, a noticeboard of quests, a lantern stall and a podium of
 * Glims. Each is the picture behind one link of the real menu (Place.tsx), which sits over it.
 *
 * It is calm on purpose. Nothing here moves by itself except the lantern light, which breathes
 * over several seconds. Everything else answers the player: the camera leans a few degrees with
 * the pointer (or the tilt of a tablet), a drag looks round, the buddy turns to face the pointer,
 * and the place whose link is under the pointer or has keyboard focus lights up and the buddy
 * points to it. Held still (reduced motion, or Calm in Settings) it is a picture: the stage is
 * told not to draw another frame until something changes, and a change shows at once, unanimated.
 */

export type StationId = 'host' | 'solo' | 'modes' | 'quests' | 'lanterns' | 'glims';
export const STATIONS: readonly StationId[] = ['host', 'solo', 'modes', 'quests', 'lanterns', 'glims'];

/** Where a link belongs on the picture, in pixels from the stage's top left. */
export type Anchors = Record<StationId | 'buddy', { x: number; y: number }>;

/** The yard's colours. Ludora's own is a navy night under gold lanterns; a school's look passes its own. */
export interface YardPalette {
  sky: string;
  /** Meets the page's header, so the picture runs on from the chrome. */
  horizon: string;
  field: string;
  stone: string;
  stoneEdge: string;
  dais: string;
  wood: string;
  paper: string;
  /** Large painted surfaces: the cabinet, the awning. */
  brand: string;
  /** Lantern light and highlights. */
  accent: string;
  good: string;
  trim: string;
  /** The hue of the trees behind. */
  leaves: number;
  sun: string;
  sunIntensity: number;
  fill: number;
}

export const LUDORA_YARD: YardPalette = {
  sky: '#27336f',
  horizon: '#121c55',
  field: '#0e1542',
  stone: '#3a416f',
  stoneEdge: '#22284f',
  dais: '#4b5388',
  wood: '#8a5a2c',
  paper: '#f2f4ff',
  brand: '#3a6bff',
  accent: '#ffc233',
  good: '#1fd38f',
  trim: '#ff4d6a',
  leaves: 226,
  sun: '#ffe9c4',
  sunIntensity: 1.7,
  fill: 1.05,
};

export interface YardOptions {
  look: GlimLook;
  /** Two more Glims for the podium (left out on the lowest quality). */
  friends: GlimArt[];
  palette: YardPalette;
  /** Hold still: reduced motion, or Calm. */
  still: boolean;
  /** The stacked layout of a phone (see setCompact). */
  compact?: boolean;
  onAnchors: (anchors: Anchors) => void;
  /** The first second or two ran below about 20 frames a second. */
  onSlow?: (() => void) | undefined;
  /** Everything is built and the first picture is up. */
  onReady?: (() => void) | undefined;
}

const UNIT_BOX = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const UNIT_CYL = new CylinderGeometry(1, 1, 1, 28).translate(0, 0.5, 0);
const UNIT_DISC = new CylinderGeometry(1, 1, 1, 28).rotateX(Math.PI / 2);
const FLAT_DISC = new CircleGeometry(1, 40).rotateX(-Math.PI / 2);

function shared<T extends Mesh>(m: T, shadow = true): T {
  m.userData.sharedGeometry = true;
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}
/** A box standing on y = 0. */
function box(w: number, h: number, d: number, color: string, at: [number, number, number] = [0, 0, 0], glow = 0): Mesh {
  const m = shared(new Mesh(UNIT_BOX, toon(color, { glow })));
  m.scale.set(w, h, d);
  m.position.set(...at);
  return m;
}
/** An upright cylinder standing on y = 0. */
function drum(r: number, h: number, color: string, at: [number, number, number] = [0, 0, 0], glow = 0): Mesh {
  const m = shared(new Mesh(UNIT_CYL, toon(color, { glow })));
  m.scale.set(r, h, r);
  m.position.set(...at);
  return m;
}
/** A disc facing forward (+z), centred on its position. */
function plate(r: number, thick: number, color: string, at: [number, number, number], glow = 0): Mesh {
  const m = shared(new Mesh(UNIT_DISC, toon(color, { glow })));
  m.scale.set(r, r, thick);
  m.position.set(...at);
  return m;
}

/** A soft round light: white in the middle, nothing at the edge. Tinted by whatever uses it. */
function softLight(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  // Shared by every glow here; freed once in dispose().
  t.userData.shared = true;
  return t;
}

interface Station {
  id: StationId;
  group: Group;
  /** The pool of light on the ground that comes up when this place is the one pointed at. */
  pool: MeshBasicMaterial;
  /** 0 at rest, 1 lit. */
  lit: number;
  /** Where its link sits: above its top. */
  top: Vector3;
}

/** Where each place stands: degrees round the buddy from the camera's side (negative is left), and metres out. */
const SPOTS: Record<StationId, { angle: number; radius: number; height: number }> = {
  host: { angle: -52, radius: 4.6, height: 2.2 },
  solo: { angle: -108, radius: 6.0, height: 2.3 },
  modes: { angle: -150, radius: 5.2, height: 2.3 },
  quests: { angle: 150, radius: 5.2, height: 2.35 },
  lanterns: { angle: 108, radius: 6.0, height: 2.6 },
  glims: { angle: 52, radius: 4.6, height: 1.85 },
};

const BUDDY_AT = new Vector3(0, 0.16, 0.5);
const LOOK_AT = new Vector3(0, 1.9, -0.6);
const LOOK_CLOSE = new Vector3(0, 1.1, -0.9);
const GROUND = new Plane(new Vector3(0, 1, 0), 0);
const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class YardScene extends World {
  private readonly light = softLight();
  private readonly stations = new Map<StationId, Station>();
  private readonly buddy: Glim3D;
  private readonly friends: Glim3D[] = [];
  /** Trees, bunting and the podium's Glims: left out on the lowest quality. */
  private readonly extras = new Group();
  private readonly lamps: SpriteMaterial[] = [];
  private readonly ray = new Raycaster();
  private readonly tmp = new Vector3();
  private readonly ndc = new Vector2();
  private still: boolean;
  private dirty = true;
  private active: StationId | null = null;
  /** The pointer in the picture, -1 to 1 each way, or null when it is elsewhere. */
  private pointer: { x: number; y: number } | null = null;
  /** A tablet's tilt, -1 to 1 each way. */
  private tilt = { x: 0, y: 0 };
  private dragYaw = 0;
  private dragPitch = 0;
  private yaw = 0;
  private pitch = 0;
  private distance = 14.8;
  /** A phone's stacked menu: no links stand over the picture, so the camera comes in close on the buddy. */
  private compact = false;
  private buddyYaw = 0;
  private pointing = false;
  private placed = false;
  private last: Anchors | null = null;
  private frames = 0;
  private stamps: number[] = [];
  private stamp = 0;
  private ready = false;
  /** Until when the player's own input (or the start) keeps the scene drawing every frame. */
  private busyUntil = 0;
  private lastDrawn = 0;

  constructor(
    env: StageEnv,
    private readonly opts: YardOptions,
  ) {
    const p = opts.palette;
    const lighting: Lighting = { skyTop: p.sky, horizon: p.horizon, ground: p.field, sun: p.sun, sunIntensity: p.sunIntensity, fill: p.fill, sunFrom: [-5, 9, 7], fogNear: 13, fogFar: 34 };
    super(env, lighting, 38);
    this.still = opts.still;
    this.compact = opts.compact ?? false;
    const ink = env.quality.outlines;

    // The ground beyond the yard runs off into the dusk; the yard is a paved circle with a kerb.
    const field = props.ground(120, 120, p.field);
    field.position.y = -0.14;
    this.scene.add(field);
    this.scene.add(drum(7.1, 0.14, p.stoneEdge, [0, -0.14, 0]));
    this.scene.add(drum(6.8, 0.04, p.stone, [0, -0.02, 0]));
    // A ring set into the paving, and the dais the buddy stands on.
    const ring = shared(new Mesh(FLAT_DISC, toon(p.stoneEdge)), false);
    ring.scale.setScalar(2.9);
    ring.position.y = 0.025;
    this.scene.add(ring);
    const inner = shared(new Mesh(FLAT_DISC, toon(p.stone)), false);
    inner.scale.setScalar(2.72);
    inner.position.y = 0.03;
    this.scene.add(inner);
    this.scene.add(drum(1.25, 0.1, p.stoneEdge, [BUDDY_AT.x, 0.02, BUDDY_AT.z]));
    this.scene.add(drum(1.12, 0.14, p.dais, [BUDDY_AT.x, 0.02, BUDDY_AT.z]));
    // Lantern light pooled on the dais.
    const pool = new Mesh(FLAT_DISC, new MeshBasicMaterial({ map: this.light, color: p.accent, transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false, fog: false }));
    pool.userData.sharedGeometry = true;
    pool.scale.setScalar(3.4);
    pool.position.set(BUDDY_AT.x, 0.05, BUDDY_AT.z);
    pool.renderOrder = 2;
    this.scene.add(pool);

    for (const id of STATIONS) this.addStation(id, ink);

    // Lamp posts behind, and trees fading into the dusk.
    for (const [x, z, h] of [
      [-1.5, -6.9, 2.3],
      [1.5, -6.9, 2.3],
      [-6.3, -4.4, 2.9],
      [6.3, -4.4, 2.9],
    ] as const) {
      const post = props.lampPost({ hue: 42, ink, height: h });
      post.position.set(x, -0.1, z);
      this.scene.add(post);
      this.addGlow(x, h + 0.15, z, 3.2, 0.45);
    }
    const rnd = props.seeded(11);
    for (let i = 0; i < 9; i++) {
      const a = (-76 + i * 19 + (rnd() - 0.5) * 8) * DEG;
      const r = 13 + rnd() * 7;
      const t = props.tree(i % 3 === 1 ? 'pine' : 'round', { scale: 1.5 + rnd() * 0.9, hue: p.leaves + (rnd() - 0.5) * 14, ink: false });
      t.position.set(Math.sin(a) * r, -0.14, -Math.cos(a) * r);
      this.extras.add(t);
    }
    this.scene.add(this.extras);
    this.extras.visible = env.quality.tier !== 'low';

    // The buddy. Its own idle (some bounce or wiggle) is left off: here it only breathes.
    this.buddy = new Glim3D({ look: opts.look, quality: env.quality, reducedMotion: true });
    this.buddy.position.copy(BUDDY_AT);
    this.buddy.scale.setScalar(1.6);
    this.scene.add(this.buddy);
    const waiting = [this.buddy.ready];
    if (env.quality.tier !== 'low') {
      const podium = this.stations.get('glims')!.group;
      opts.friends.slice(0, 2).forEach((art, i) => {
        const g = new Glim3D({ look: { art }, quality: env.quality, reducedMotion: true });
        g.position.set(i === 0 ? 0 : -0.78, i === 0 ? 0.74 : 0.46, 0);
        g.scale.setScalar(0.78);
        podium.add(g);
        this.friends.push(g);
        waiting.push(g.ready);
      });
    }
    void Promise.allSettled(waiting).then(() => {
      this.ready = true;
      this.dirty = true;
    });

    this.shadowArea(9, [0, 0, -1]);
    this.aim(1);
  }

  private addGlow(x: number, y: number, z: number, size: number, opacity: number) {
    const m = new SpriteMaterial({ map: this.light, color: this.opts.palette.accent, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false });
    m.userData.base = opacity;
    const s = new Sprite(m);
    s.scale.setScalar(size);
    s.position.set(x, y, z);
    s.renderOrder = 3;
    this.scene.add(s);
    this.lamps.push(m);
  }

  private addStation(id: StationId, ink: boolean) {
    const spot = SPOTS[id];
    const a = spot.angle * DEG;
    const group = this.build(id);
    group.position.set(Math.sin(a) * spot.radius, 0, Math.cos(a) * spot.radius);
    // Turned towards a point between the buddy and the camera, so each shows its face to both.
    group.rotation.y = Math.atan2(0 - group.position.x, 4.2 - group.position.z);
    if (ink) outlineAll(group, '#141022', 0.018);
    this.scene.add(group);
    const pool = new MeshBasicMaterial({ map: this.light, color: this.opts.palette.accent, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false });
    const disc = new Mesh(FLAT_DISC, pool);
    disc.userData.sharedGeometry = true;
    disc.userData.noInk = true;
    disc.scale.setScalar(2.5);
    disc.position.set(group.position.x, 0.06, group.position.z);
    disc.renderOrder = 2;
    this.scene.add(disc);
    this.stations.set(id, { id, group, pool, lit: 0, top: new Vector3(group.position.x, spot.height, group.position.z) });
  }

  /** The six places, each a few toy-like solids standing on y = 0 and facing +z. */
  private build(id: StationId): Group {
    const p = this.opts.palette;
    const g = new Group();
    switch (id) {
      case 'host': {
        // A board on an easel with a question on it: four answer tiles under a heading strip.
        g.add(box(0.1, 1.9, 0.1, p.wood, [-0.78, 0, -0.08]), box(0.1, 1.9, 0.1, p.wood, [0.78, 0, -0.08]), box(1.9, 0.1, 0.5, p.wood, [0, 0, 0]));
        g.add(box(1.8, 1.15, 0.1, p.paper, [0, 0.72, 0], 0.22));
        g.add(box(1.5, 0.16, 0.04, p.brand, [0, 1.58, 0.06]));
        const tiles = ['#ff8a2a', '#3d9bff', p.good, p.trim];
        tiles.forEach((c, i) => g.add(box(0.68, 0.24, 0.04, c, [i % 2 ? 0.39 : -0.39, i < 2 ? 1.2 : 0.88, 0.06], 0.25)));
        break;
      }
      case 'solo': {
        // A practice target on a stand.
        g.add(drum(0.5, 0.12, p.stoneEdge), box(0.14, 1.1, 0.14, p.wood, [0, 0.1, 0]));
        g.add(plate(0.78, 0.12, p.paper, [0, 1.3, 0], 0.15), plate(0.56, 0.14, p.trim, [0, 1.3, 0.01], 0.2), plate(0.34, 0.16, p.paper, [0, 1.3, 0.02], 0.15), plate(0.14, 0.18, p.trim, [0, 1.3, 0.03], 0.2));
        break;
      }
      case 'modes': {
        // An arcade cabinet: a lit screen, a marquee, a stick and two buttons.
        g.add(box(1.05, 1.0, 0.9, p.brand, [0, 0, 0]), box(1.05, 0.85, 0.62, p.brand, [0, 1.0, -0.14]), box(1.15, 0.26, 0.74, p.accent, [0, 1.85, -0.12], 0.55));
        const screen = box(0.82, 0.58, 0.05, '#bfe6ff', [0, 1.12, 0.17], 0.75);
        g.add(screen, box(1.05, 0.08, 0.34, p.paper, [0, 1.0, 0.28]));
        g.add(drum(0.03, 0.16, '#20203a', [-0.25, 1.08, 0.3]), drum(0.07, 0.07, p.trim, [-0.25, 1.22, 0.3], 0.3), drum(0.06, 0.03, p.good, [0.14, 1.08, 0.3], 0.4), drum(0.06, 0.03, p.accent, [0.32, 1.08, 0.3], 0.4));
        break;
      }
      case 'quests': {
        // A noticeboard under a little roof, with notes pinned to it.
        g.add(box(0.12, 1.95, 0.12, p.wood, [-0.85, 0, 0]), box(0.12, 1.95, 0.12, p.wood, [0.85, 0, 0]), box(1.7, 1.05, 0.08, '#b98a5a', [0, 0.75, 0]));
        g.add(box(2.1, 0.12, 0.5, p.brand, [0, 1.95, 0]));
        const notes: [number, number, number, number, string][] = [
          [-0.52, 1.3, 0.46, 0.4, p.paper],
          [0.02, 1.36, 0.42, 0.34, p.accent],
          [0.52, 1.28, 0.44, 0.42, p.paper],
          [-0.3, 0.86, 0.5, 0.32, p.good],
          [0.32, 0.86, 0.5, 0.3, p.paper],
        ];
        for (const [x, y, w, h, c] of notes) g.add(box(w, h, 0.03, c, [x, y, 0.05], 0.18));
        break;
      }
      case 'lanterns': {
        // A stall with a striped awning and three lit lanterns on the counter.
        g.add(box(1.9, 0.85, 0.8, p.wood, [0, 0, 0]), box(2.0, 0.08, 0.9, '#b98a5a', [0, 0.85, 0]));
        g.add(box(0.09, 2.2, 0.09, p.wood, [-0.92, 0, -0.34]), box(0.09, 2.2, 0.09, p.wood, [0.92, 0, -0.34]));
        for (let i = 0; i < 5; i++) {
          const stripe = box(0.42, 0.07, 1.15, i % 2 ? p.paper : p.brand, [-0.84 + i * 0.42, 2.12, 0.06]);
          stripe.rotation.x = 0.32;
          g.add(stripe);
        }
        [-0.6, 0, 0.6].forEach((x, i) => {
          const l = props.lantern({ hue: [42, 18, 150][i]!, scale: i === 1 ? 0.95 : 0.75 });
          l.position.set(x, 0.93, 0.05);
          g.add(l);
        });
        break;
      }
      case 'glims': {
        // A podium: three steps and a gem, with two Glims on the steps where the device can afford them.
        g.add(drum(0.52, 0.72, p.accent, [0, 0, 0]), drum(0.46, 0.44, p.paper, [-0.78, 0, 0]), drum(0.46, 0.28, p.paper, [0.78, 0, 0]));
        const gem = props.gem({ scale: 1.4 });
        gem.position.set(0.78, 0.5, 0);
        g.add(gem);
        break;
      }
    }
    return g;
  }

  /* ----------------------------- what the page tells the scene ---------------------------- */

  /** The place whose link is under the pointer or has keyboard focus. */
  setActive(id: StationId | null) {
    if (id === this.active) return;
    this.active = id;
    this.dirty = true;
    this.wake();
  }

  /** The pointer over the picture, -1 to 1 each way (y up), or null when it has left. */
  setPointer(x: number | null, y = 0) {
    this.pointer = x === null ? null : { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
    this.wake();
  }

  /** A tablet or phone tilted in the hand, -1 to 1 each way. */
  setTilt(x: number, y: number) {
    this.tilt.x = clamp(x, -1, 1);
    this.tilt.y = clamp(y, -1, 1);
    this.wake();
  }

  /** A drag across the picture, in pixels: look round, a little. */
  drag(dx: number, dy: number) {
    if (this.still) return;
    this.dragYaw = clamp(this.dragYaw - dx * 0.0042, -0.6, 0.6);
    this.dragPitch = clamp(this.dragPitch + dy * 0.0026, -0.1, 0.2);
    this.wake();
  }

  setStill(still: boolean) {
    if (still === this.still) return;
    this.still = still;
    this.dirty = true;
  }

  /** Whether a point in the picture (-1 to 1 each way) is on the buddy. */
  onBuddy(x: number, y: number): boolean {
    this.ray.setFromCamera(this.ndc.set(x, y), this.camera);
    return this.ray.ray.distanceToPoint(this.tmp.set(BUDDY_AT.x, BUDDY_AT.y + 0.75, BUDDY_AT.z)) < 0.85;
  }

  /** The buddy says hello: a wave and a smile, when pressed. Nothing under reduced motion. */
  greet() {
    if (this.still) return;
    this.buddy.play('wave');
    this.buddy.setExpression('happy', 1.8);
    this.wake(2.5);
  }

  /* ----------------------------------------- frames --------------------------------------- */

  /** Draw every frame for a while: the player did something, and the scene answers smoothly. */
  private wake(seconds = 1.6) {
    this.busyUntil = Math.max(this.busyUntil, performance.now() + seconds * 1000);
  }

  /**
   * Held still: only when something changed. Otherwise every frame while the player is doing
   * something (and while the first frames are being timed), and at rest about 15 times a second,
   * which is plenty for breathing and lamplight that change over seconds, and leaves a school
   * laptop's processor mostly idle on the home page.
   */
  override wantsFrame(): boolean {
    if (this.still) return this.dirty;
    const now = performance.now();
    if (this.dirty || now < this.busyUntil || (this.opts.onSlow && this.frames >= 0) || now - this.lastDrawn >= 1000 / 15) {
      this.lastDrawn = now;
      return true;
    }
    return false;
  }

  override setQuality(q: Quality) {
    super.setQuality(q);
    this.extras.visible = q.tier !== 'low';
    for (const f of this.friends) f.visible = q.tier !== 'low';
    this.dirty = true;
  }

  /** The stacked layout (a phone): the links are a list under the picture, so frame the buddy closely. */
  setCompact(compact: boolean) {
    if (compact === this.compact) return;
    this.compact = compact;
    this.frameView();
  }

  override resize(w: number, h: number) {
    super.resize(w, h);
    this.frameView();
  }

  private frameView() {
    // Wide: the whole circle, with room over each place for its link; narrow boxes stand further
    // back. Compact: in close, the buddy large and the places round it at the edges.
    this.distance = this.compact ? 11.2 * Math.max(1, 1.5 / this.camera.aspect) : 14.8 * Math.max(1, 1.7 / this.camera.aspect);
    this.dirty = true;
    this.last = null;
    this.aim(1);
  }

  /** Put the camera where the pointer, the tilt and any drag say, easing by `k` (1 is at once). */
  private aim(k: number) {
    const lean = this.still ? { x: 0, y: 0 } : this.pointer ? this.pointer : this.tilt;
    const yaw = (this.still ? 0 : this.dragYaw) + lean.x * 0.075;
    const pitch = 26 * DEG + (this.still ? 0 : this.dragPitch) - lean.y * 0.03;
    this.yaw += (yaw - this.yaw) * k;
    this.pitch += (pitch - this.pitch) * k;
    const d = this.distance;
    const look = this.compact ? LOOK_CLOSE : LOOK_AT;
    this.camera.position.set(look.x + Math.sin(this.yaw) * Math.cos(this.pitch) * d, look.y + Math.sin(this.pitch) * d, look.z + Math.cos(this.yaw) * Math.cos(this.pitch) * d);
    this.camera.lookAt(look);
  }

  tick(dt: number, t: number) {
    const still = this.still;
    const ease = (rate: number) => (still || !this.placed ? 1 : 1 - Math.exp(-dt * rate));
    this.aim(ease(3.2));

    // Each place: its pool of light comes up, and it rises a few centimetres, while it is the one.
    for (const s of this.stations.values()) {
      const want = s.id === this.active ? 1 : 0;
      s.lit += (want - s.lit) * ease(7);
      s.pool.opacity = s.lit * 0.85;
      s.group.position.y = still ? 0 : s.lit * 0.07;
    }

    // The buddy faces the place being pointed at, or the pointer, or the camera. Still: the camera.
    let face = 0;
    let pointing = false;
    if (!still) {
      const s = this.active ? this.stations.get(this.active) : null;
      if (s) {
        face = Math.atan2(s.group.position.x - BUDDY_AT.x, s.group.position.z - BUDDY_AT.z);
        pointing = true;
      } else if (this.pointer) {
        this.ray.setFromCamera(this.ndc.set(this.pointer.x, this.pointer.y), this.camera);
        if (this.ray.ray.intersectPlane(GROUND, this.tmp)) face = Math.atan2(this.tmp.x - BUDDY_AT.x, this.tmp.z - BUDDY_AT.z);
        else face = this.pointer.x * 1.2;
      } else face = this.yaw * 0.6;
      // Never further round than its face stays in view: it turns its head, it does not turn its back.
      face = clamp(face, -1.05, 1.05);
    }
    this.buddyYaw += (face - this.buddyYaw) * ease(5);
    this.buddy.rotation.y = this.buddyYaw;
    if (pointing !== this.pointing) {
      this.pointing = pointing;
      this.buddy.play(pointing ? 'point' : 'idle');
    }
    // Slow breathing, and lantern light that swells and settles over about eight seconds.
    const breath = still ? 0 : Math.sin(t * 0.9);
    this.buddy.scale.set(1.6, 1.6 * (1 + breath * 0.012), 1.6);
    const swell = still ? 0 : Math.sin(t * 0.78) * 0.08;
    for (const m of this.lamps) m.opacity = (m.userData.base as number) + swell;
    this.buddy.update(dt);
    for (const f of this.friends) f.update(dt);

    this.placed = true;
    this.dirty = false;
    this.measure();
  }

  /** How the first frames went: a device that cannot manage 20 a second gets the flat menu back at once. */
  private measure() {
    if (this.still || !this.opts.onSlow || this.frames < 0) return;
    const now = performance.now();
    if (this.ready && this.frames++ > 8) this.stamps.push(now - this.stamp);
    this.stamp = now;
    if (this.stamps.length < 36) return;
    this.stamps.sort((a, b) => a - b);
    const median = this.stamps[18]!;
    this.frames = -1;
    this.stamps = [];
    if (median > 50) this.opts.onSlow();
  }

  override afterRender() {
    super.afterRender();
    // Where each link sits on the picture now. Only sent when something has moved.
    const out = {} as Anchors;
    let moved = !this.last;
    const put = (key: StationId | 'buddy', at: Vector3) => {
      this.tmp.copy(at).project(this.camera);
      const x = ((this.tmp.x + 1) / 2) * this.width;
      const y = ((1 - this.tmp.y) / 2) * this.height;
      out[key] = { x, y };
      const was = this.last?.[key];
      if (!was || Math.abs(was.x - x) > 0.25 || Math.abs(was.y - y) > 0.25) moved = true;
    };
    for (const s of this.stations.values()) put(s.id, s.top);
    put('buddy', FEET);
    if (moved) {
      this.last = out;
      this.opts.onAnchors(out);
    }
    if (this.ready && this.opts.onReady) {
      const done = this.opts.onReady;
      this.opts.onReady = undefined;
      done();
    }
  }

  override dispose() {
    for (const g of [this.buddy, ...this.friends]) g.dispose();
    super.dispose();
    this.light.dispose();
  }
}

/** Just in front of the buddy's feet: where its name tag hangs. */
const FEET = new Vector3(BUDDY_AT.x, 0.1, BUDDY_AT.z + 1.15);

/** The yard in The Hills Grammar School's colours: cream stone, bottle-green paint, red only as trim. */
export const HILLS_YARD: YardPalette = {
  sky: '#0c4a37',
  horizon: '#083a2b',
  field: '#07301f',
  stone: '#a99f84',
  stoneEdge: '#7c735c',
  dais: '#d9cfb3',
  wood: '#7a5a3a',
  paper: '#fffdf8',
  brand: '#00603f',
  accent: '#f6ecd2',
  good: '#00a766',
  trim: '#ee3350',
  leaves: 156,
  sun: '#fff0d2',
  sunIntensity: 1.5,
  fill: 1.15,
};
