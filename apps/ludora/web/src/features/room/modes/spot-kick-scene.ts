import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { EaseCamera, Glim3D, World, css, props, toon, type GlimLook, type Lighting, type StageEnv } from '../../../three/index.ts';
import type { Label } from '../../../three/labels.ts';

/*
 * Spot Kick in 3D: a little stadium at night. A striped pitch under four
 * floodlight pylons, a stand behind the goal full of Glims, glowing boards,
 * and a goal whose net bulges when the ball goes in. The keeper, Mitts, is
 * Ludora's own: a round, violet keeper with enormous gold gloves.
 *
 * `PenaltyRig` is one penalty: the goal, the keeper, the ball and a kicker.
 * The player's scene plays their own penalties; the big screen's scene plays
 * a highlights reel of shots from around the class, each with that player's
 * Glim. Scenes only draw what the server decided: the aim, the strength, the
 * outcome and where the keeper dived all come in the view.
 */

export type Aim = 'tl' | 'tr' | 'mid' | 'bl' | 'br';
export type Power = 'placed' | 'blasted';
export type Outcome = 'goal' | 'saved' | 'wide';
export type ShotHow = 'catch' | 'parry' | 'tip' | 'post' | 'bar' | 'over' | 'wide' | 'net';

export interface KickShot {
  seq: number;
  aim: Aim;
  power: Power;
  outcome: Outcome;
  dive: Aim;
  how: ShotHow;
  points: number;
  fire: boolean;
}

/* --------------------------------- measures -------------------------------- */

export const GOAL_W = 5.2;
export const GOAL_H = 1.95;
const NET_D = 1.5;
const SPOT_Z = 6.5;
const BALL_R = 0.14;
const POST_R = 0.06;
/** Where each aim crosses the goal line. */
const TARGET: Record<Aim, [number, number]> = { tl: [-1.95, 1.48], tr: [1.95, 1.48], mid: [0, 0.95], bl: [-1.95, 0.32], br: [1.95, 0.32] };
/** Seconds from the strike to the goal line. */
const FLIGHT: Record<Power, number> = { placed: 0.7, blasted: 0.45 };
/** Seconds of run-up before the strike. */
const RUN = 0.85;

/** The stadium at night: a cool moon fill, and a strong white key from the floodlights. */
const FLOODLIT: Lighting = { skyTop: '#04071c', horizon: '#18224a', ground: '#1d3a2a', sun: '#f2f5ff', sunIntensity: 2.5, fill: 1.15, sunFrom: [-4, 12, 9], fogNear: 34, fogFar: 95 };

/* ------------------------------ shared textures ----------------------------- */

const shared = new Map<string, CanvasTexture>();
function canvasTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): CanvasTexture {
  const hit = shared.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.userData.shared = true;
  shared.set(key, t);
  return t;
}

const glowTexture = () =>
  canvasTexture(
    'glow',
    64,
    64,
    (g) => {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    },
    false,
  );

/** The pitch: mown stripes and white lines, 40 by 40 metres centred on z = 4. */
const PITCH = 40;
const PITCH_Z = 4;
const pitchTexture = () =>
  canvasTexture('pitch', 1024, 1024, (g) => {
    const px = 1024 / PITCH;
    const X = (x: number) => (x + PITCH / 2) * px;
    const Z = (z: number) => (z - (PITCH_Z - PITCH / 2)) * px;
    for (let i = 0; i < 20; i++) {
      g.fillStyle = i % 2 ? '#2f8a47' : '#36994f';
      g.fillRect(0, i * 2 * px, 1024, 2 * px + 1);
    }
    // A soft pool of floodlight around the spot and the goal.
    const pool = g.createRadialGradient(X(0), Z(3), 20, X(0), Z(3), 15 * px);
    pool.addColorStop(0, 'rgba(255,255,240,0.16)');
    pool.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = pool;
    g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 0.12 * px;
    g.beginPath();
    g.moveTo(0, Z(0));
    g.lineTo(1024, Z(0));
    // Six-yard box and penalty box.
    g.rect(X(-GOAL_W / 2 - 1.6), Z(0), (GOAL_W + 3.2) * px, 1.9 * px);
    g.rect(X(-GOAL_W / 2 - 4.6), Z(0), (GOAL_W + 9.2) * px, 9.4 * px);
    g.stroke();
    // The arc at the top of the box.
    g.beginPath();
    g.arc(X(0), Z(SPOT_Z), 4.2 * px, Math.PI * 0.2, Math.PI * 0.8);
    g.stroke();
    // The spot.
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(X(0), Z(SPOT_Z), 0.22 * px, 0, Math.PI * 2);
    g.fill();
  });

const netTexture = () => {
  const t = canvasTexture(
    'net',
    64,
    64,
    (g) => {
      g.clearRect(0, 0, 64, 64);
      g.strokeStyle = 'rgba(255,255,255,1)';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(0, 32);
      g.lineTo(32, 0);
      g.lineTo(64, 32);
      g.lineTo(32, 64);
      g.closePath();
      g.stroke();
    },
    false,
  );
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = NearestFilter;
  return t;
};

const ballTexture = () =>
  canvasTexture('ball', 256, 128, (g) => {
    g.fillStyle = '#f7f7fb';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#1b1f3a';
    const spots: [number, number, number][] = [
      [32, 64, 15],
      [96, 30, 13],
      [96, 98, 13],
      [160, 64, 15],
      [224, 30, 13],
      [224, 98, 13],
      [0, 20, 9],
      [256, 20, 9],
      [128, 6, 8],
      [128, 122, 8],
    ];
    for (const [x, y, r] of spots) {
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.fill();
    }
  });

/** The glowing boards round the pitch: Ludora's own name and the mode's, nothing else. */
const boardTexture = () => {
  const t = canvasTexture('boards', 1024, 64, (g) => {
    g.fillStyle = '#0d1440';
    g.fillRect(0, 0, 1024, 64);
    g.font = '800 italic 40px "Barlow Condensed", system-ui, sans-serif';
    g.textBaseline = 'middle';
    const words = ['SPOT KICK', 'LUDORA', 'GOAL!', 'LUDORA'];
    words.forEach((w, i) => {
      g.fillStyle = i % 2 ? '#ffc233' : '#7fb2ff';
      g.fillText(w, 30 + i * 256, 34);
    });
  });
  t.wrapS = RepeatWrapping;
  return t;
};

/* ------------------------------- shared shapes ------------------------------ */

const G = {
  box: new BoxGeometry(1, 1, 1),
  post: new CylinderGeometry(POST_R, POST_R, 1, 10),
  thin: new CylinderGeometry(0.025, 0.025, 1, 6),
  ball: new SphereGeometry(BALL_R, 20, 14),
  blob: new SphereGeometry(0.2, 8, 6).scale(1, 1.18, 0.95).translate(0, 0.24, 0),
  eye: new SphereGeometry(0.045, 8, 6),
  fanEye: new IcosahedronGeometry(0.032, 0).scale(0.8, 1.25, 0.6),
  ring: new RingGeometry(0.2, 0.27, 28),
  cone: new ConeGeometry(1, 1, 18, 1, true).translate(0, -0.5, 0),
};
for (const g of Object.values(G)) g.computeBoundingSphere();

function solid(geo: BufferGeometry, mat: Material, shadow = false): Mesh {
  const m = new Mesh(geo, mat);
  m.userData.sharedGeometry = true;
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function block(w: number, h: number, d: number, colour: string, x: number, y: number, z: number, glow = 0): Mesh {
  const m = solid(G.box, toon(colour, { glow }));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

function glowSprite(colour: string, size: number, opacity = 0.8): Sprite {
  const s = new Sprite(new SpriteMaterial({ map: glowTexture(), color: css(colour), transparent: true, depthWrite: false, blending: AdditiveBlending, opacity }));
  s.scale.set(size, size, 1);
  return s;
}

/** A bar between two points (goal frames). */
function bar(geo: BufferGeometry, colour: string, a: Vector3, b: Vector3, thick = 1): Mesh {
  const m = solid(geo, toon(colour));
  const d = b.clone().sub(a);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.scale.set(thick, d.length(), thick);
  m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
  return m;
}

const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));

/* ---------------------------------- keeper ---------------------------------- */

/**
 * Mitts, the keeper: a round violet body, a cream face with big eyes and
 * brows, round ears, and the gloves. Poses are set by hand each frame.
 */
class Keeper extends Group {
  private readonly rig = new Group();
  private readonly arms: [Group, Group] = [new Group(), new Group()];
  readonly gloves: [Mesh, Mesh];
  private readonly brows: Mesh[] = [];
  private t = 0;
  /** Where the keeper stands when set (it shifts towards what it has learned). */
  homeX = 0;
  private dive: { aim: Aim; at: number; save: boolean } | null = null;
  private cheerUntil = 0;
  private lean = 0;

  constructor(private readonly calm: boolean) {
    super();
    this.add(this.rig);
    const jersey = toon('#7d5cff');
    const trim = toon('#ffc233');
    const cream = toon('#ffe9c7');
    const dark = toon('#141a3a');
    const body = solid(new SphereGeometry(0.42, 22, 16).scale(1, 1.12, 0.86), jersey, true);
    body.position.y = 0.78;
    this.rig.add(body);
    const collar = solid(new TorusGeometry(0.3, 0.05, 6, 22).rotateX(Math.PI / 2), trim);
    collar.position.y = 1.13;
    this.rig.add(collar);
    const band = solid(new TorusGeometry(0.405, 0.035, 6, 26).rotateX(Math.PI / 2), trim);
    band.position.y = 0.62;
    band.scale.z = 0.86;
    this.rig.add(band);
    const shorts = solid(new CylinderGeometry(0.33, 0.3, 0.26, 16), dark);
    shorts.position.y = 0.36;
    this.rig.add(shorts);
    const face = solid(new SphereGeometry(0.27, 18, 12).scale(1, 0.82, 0.45), cream);
    face.position.set(0, 0.96, 0.27);
    this.rig.add(face);
    for (const side of [-1, 1]) {
      const white = solid(G.eye, toon('#ffffff'));
      white.scale.setScalar(1.7);
      white.position.set(side * 0.1, 1.0, 0.37);
      this.rig.add(white);
      const pupil = solid(G.eye, dark);
      pupil.scale.setScalar(0.85);
      pupil.position.set(side * 0.095, 0.995, 0.43);
      this.rig.add(pupil);
      const brow = block(0.12, 0.03, 0.03, '#141a3a', side * 0.1, 1.11, 0.38);
      brow.rotation.z = side * -0.25;
      this.brows.push(brow);
      this.rig.add(brow);
      const ear = solid(new SphereGeometry(0.1, 10, 8), jersey);
      ear.position.set(side * 0.27, 1.22, 0);
      this.rig.add(ear);
      const boot = solid(new SphereGeometry(0.1, 10, 8).scale(1, 0.6, 1.5), dark, true);
      boot.position.set(side * 0.15, 0.06, 0.05);
      this.rig.add(boot);
      const leg = solid(new CylinderGeometry(0.055, 0.055, 0.22, 8), cream);
      leg.position.set(side * 0.15, 0.18, 0);
      this.rig.add(leg);
    }
    const sleeve = new CapsuleGeometry(0.075, 0.36, 4, 10).translate(0, -0.24, 0);
    const glove = new SphereGeometry(0.16, 14, 10).scale(1, 1.05, 0.7);
    this.gloves = [solid(glove, trim, true), solid(glove, trim, true)];
    this.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      arm.position.set(side * 0.36, 1.0, 0);
      arm.add(solid(sleeve, jersey));
      const g = this.gloves[i]!;
      g.position.y = -0.52;
      arm.add(g);
      this.rig.add(arm);
    });
    // No ink outlines on the keeper: its colours already read against the net on every tier.
    this.add(props.blobShadow(0.55));
  }

  /** Dive to `aim` at time `at` (seconds on this keeper's clock from now). */
  diveTo(aim: Aim, delay: number, save: boolean) {
    this.dive = { aim, at: this.t + delay, save };
  }

  cheer(seconds: number) {
    this.cheerUntil = this.t + seconds;
  }

  reset() {
    this.dive = null;
  }

  /** Where the gloves meet, in world space (a held ball sits there). */
  catchPoint(out: Vector3): Vector3 {
    const a = this.gloves[0].getWorldPosition(new Vector3());
    return this.gloves[1].getWorldPosition(out).add(a).multiplyScalar(0.5);
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const [L, R] = this.arms;
    let x = this.homeX;
    let y = 0;
    let rz = 0;
    let lz = -0.35;
    let rzArm = 0.35;
    let lx = 0;
    let rx = 0;
    let squash = 1;
    if (this.dive && t >= this.dive.at) {
      const k = easeOut(clamp01((t - this.dive.at) / 0.4));
      const [tx, ty] = TARGET[this.dive.aim];
      const high = ty > 1;
      if (this.dive.aim === 'mid') {
        // Stand tall and reach up, or drop to block low.
        y = Math.sin(clamp01((t - this.dive.at) / 0.55) * Math.PI) * 0.35;
        lz = -0.35 - k * 2.2;
        rzArm = 0.35 + k * 2.2;
      } else {
        const side = Math.sign(tx);
        x = this.homeX + (tx * 0.66 - this.homeX) * k;
        const lift = high ? 0.6 : 0.05;
        // Up into the air, then down onto the grass.
        const air = clamp01((t - this.dive.at) / 0.9);
        y = Math.sin(Math.min(1, air * 1.6) * Math.PI * 0.5) * lift * (1 - Math.max(0, air - 0.6) * 2.5);
        y = Math.max(0, y);
        rz = -side * (high ? 1.05 : 1.4) * k;
        // Both arms reach along the dive.
        lz = -0.35 - k * 2.5;
        rzArm = 0.35 + k * 2.5;
        if (!this.dive.save) {
          lx = -0.3 * k;
          rx = -0.3 * k;
        }
      }
    } else if (t < this.cheerUntil) {
      const hop = Math.abs(Math.sin(t * 7));
      y = hop * (this.calm ? 0.03 : 0.16);
      lz = -2.7;
      rzArm = 2.7;
    } else {
      // Set: bouncing on the toes, arms wide, swaying a little.
      const sway = this.calm ? 0 : Math.sin(t * 2.4) * 0.12;
      x = this.homeX + sway;
      squash = 1 - (this.calm ? 0 : Math.abs(Math.sin(t * 4.8)) * 0.03);
      lz = -0.9;
      rzArm = 0.9;
      lx = -0.4;
      rx = -0.4;
    }
    this.lean += (rz - this.lean) * Math.min(1, dt * 18);
    this.position.x = x;
    this.rig.position.y = y;
    this.rig.rotation.z = this.lean;
    this.rig.scale.set(1, squash, 1);
    L.rotation.set(lx, 0, lz);
    R.rotation.set(rx, 0, rzArm);
    for (const b of this.brows) b.position.y = 1.11 + (this.dive ? 0.03 : 0);
  }
}

/* ----------------------------------- crowd ---------------------------------- */

/** The stand behind the goal: tiers, a roof, instanced Glim-like fans, and a front row of real Glims. */
class Crowd {
  readonly group = new Group();
  private fans: InstancedMesh;
  private eyes: InstancedMesh;
  private seats: { x: number; y: number; z: number; phase: number; colour: Color }[] = [];
  private glims: Glim3D[] = [];
  private cheerT = -10;
  private cheering = false;
  private frame = 0;
  private oohT = -10;
  private t = 0;
  private m = new Matrix4();
  private q = new Quaternion();
  private s = new Vector3(1, 1, 1);
  private p = new Vector3();

  /** Other stands that react with this one. */
  readonly also: Crowd[] = [];

  constructor(
    world: World,
    looks: GlimLook[],
    private readonly calm: boolean,
    o: { width?: number; seed?: number; real?: boolean } = {},
  ) {
    const q = world.env.quality;
    const tiers = 6;
    const width = o.width ?? 26;
    for (let i = 0; i < tiers; i++) {
      const y = 0.45 + i * 0.5;
      const z = -5.6 - i * 0.85;
      this.group.add(block(width, y, 0.85, i % 2 ? '#1c2452' : '#222c60', 0, y / 2, z));
      // A strip of seat backs in Ludora blue.
      this.group.add(block(width, 0.12, 0.1, '#2f4fd0', 0, y + 0.06, z - 0.36));
    }
    // The back wall and the roof, with a strip of light along its edge.
    this.group.add(block(width + 1, 4.4, 0.4, '#141a40', 0, 2.2, -11.2));
    const roof = block(width + 2, 0.2, 5.6, '#0e1330', 0, 4.9, -8.5);
    roof.rotation.x = -0.08;
    this.group.add(roof);
    this.group.add(block(width + 2, 0.12, 0.12, '#dfe8ff', 0, 4.82, -5.7, 1));
    const lamps = q.tier === 'low' ? 0 : Math.round(width / 5);
    for (let i = 0; i < lamps; i++) {
      const s = glowSprite('#cfe0ff', 3, 0.5);
      s.position.set(-width / 2 + 2.5 + i * 5, 4.7, -5.6);
      this.group.add(s);
    }
    for (const x of [-width / 2 - 0.6, width / 2 + 0.6]) this.group.add(block(0.4, 5, 6, '#141a40', x, 2.5, -8.3));

    // Fans: every seat a little round Glim in its own colour.
    const per = Math.round(((q.tier === 'high' ? 34 : q.tier === 'medium' ? 26 : 14) * width) / 26);
    const rnd = props.seeded(o.seed ?? 77);
    for (let i = 0; i < tiers; i++) {
      for (let j = 0; j < per; j++) {
        if (rnd() < 0.12) continue;
        const x = -width / 2 + 0.5 + (j + 0.5 + (rnd() - 0.5) * 0.3) * ((width - 1) / per);
        const hue = Math.floor(rnd() * 360);
        this.seats.push({ x, y: 0.45 + i * 0.5, z: -5.55 - i * 0.85 + 0.05, phase: rnd() * Math.PI * 2, colour: css(`hsl(${hue} ${60 + rnd() * 25}% ${52 + rnd() * 14}%)`) });
      }
    }
    // The front row is real Glims, the class's own when there are enough.
    const real = o.real === false ? 0 : q.tier === 'high' ? 8 : q.tier === 'medium' ? 4 : 0;
    const front = this.seats.filter((s) => s.z > -5.7).sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
    const chosen = new Set(front.slice(0, Math.min(real, looks.length)));
    let li = 0;
    for (const seat of chosen) {
      // Fans are small on screen: the low-tier body, no outline and no shadow, whatever the tier.
      const glim = new Glim3D({ look: looks[li++ % looks.length]!, quality: { ...q, tier: 'low', outlines: false, shadows: false }, reducedMotion: calm });
      glim.scale.setScalar(0.8);
      glim.position.set(seat.x, seat.y, seat.z);
      this.group.add(glim);
      this.glims.push(glim);
    }
    const crowd = this.seats.filter((s) => !chosen.has(s));
    this.seats = crowd;
    this.fans = new InstancedMesh(G.blob, toon('#ffffff'), crowd.length);
    // Small dark eyes, the Glims' own: one instanced draw for the whole stand.
    this.eyes = new InstancedMesh(G.fanEye, toon('#141a3a'), crowd.length * 2);
    for (const m of [this.fans, this.eyes]) {
      m.userData.sharedGeometry = true;
      this.group.add(m);
    }
    crowd.forEach((s, i) => this.fans.setColorAt(i, s.colour));
    if (this.fans.instanceColor) this.fans.instanceColor.needsUpdate = true;
    this.place(0);
  }

  /** The crowd goes up for a goal. */
  cheer() {
    for (const c of this.also) c.cheer();
    this.cheerT = this.t;
    this.cheering = true;
    for (const g of this.glims) g.play('cheer');
  }

  /** An "ooh" for a save or a miss. */
  ooh() {
    for (const c of this.also) c.ooh();
    this.oohT = this.t;
    for (const g of this.glims) g.setExpression('surprised', 1.4);
  }

  private place(t: number) {
    const sinceCheer = t - this.cheerT;
    const sinceOoh = t - this.oohT;
    const hopAmp = this.calm ? 0.02 : 0.22;
    this.seats.forEach((s, i) => {
      let y = s.y;
      if (sinceCheer < 2.4) y += Math.abs(Math.sin(sinceCheer * 8 + s.phase)) * hopAmp * (1 - sinceCheer / 2.4);
      else if (sinceOoh < 1.2) y += Math.sin(clamp01(sinceOoh / 0.5) * Math.PI) * hopAmp * 0.3;
      else if (!this.calm) y += Math.max(0, Math.sin(t * 1.3 + s.phase * 3)) * 0.015;
      this.p.set(s.x, y, s.z);
      this.m.compose(this.p, this.q, this.s);
      this.fans.setMatrixAt(i, this.m);
      for (const side of [-1, 1]) {
        const j = i * 2 + (side < 0 ? 0 : 1);
        this.p.set(s.x + side * 0.07, y + 0.31, s.z + 0.18);
        this.m.compose(this.p, this.q, this.s);
        this.eyes.setMatrixAt(j, this.m);
      }
    });
    this.fans.instanceMatrix.needsUpdate = true;
    this.eyes.instanceMatrix.needsUpdate = true;
  }

  update(dt: number) {
    this.t += dt;
    // The idle shuffle is cheap but not free: skip it on calm screens unless someone is cheering.
    // The crowd moves every frame while it reacts; the idle shuffle only every third frame, and not at all on calm screens.
    const reacting = this.t - this.cheerT < 2.5 || this.t - this.oohT < 1.3;
    this.frame++;
    if (reacting || (!this.calm && this.frame % 3 === 0)) this.place(this.t);
    for (const c of this.also) c.update(dt);
    if (this.cheering && this.t - this.cheerT > 2.2) {
      this.cheering = false;
      for (const g of this.glims) g.play('idle');
    }
    for (const g of this.glims) g.update(dt);
  }
}

/* --------------------------------- stadium --------------------------------- */

/** Floodlight pylons, boards, the pitch and everything that never moves. Returns the boards' texture to scroll. */
function buildStadium(world: World, crowdLooks: GlimLook[], sideStand = false): { crowd: Crowd; boards: CanvasTexture } {
  const q = world.env.quality;
  const scene = world.scene;
  const surround = props.ground(160, 160, '#10261a');
  surround.position.set(0, -0.02, 0);
  scene.add(surround);
  // Lit (for real shadows) on high; below that the floodlight pool is already painted in, so it is drawn unlit, which is far cheaper.
  const pitchMat = q.shadows ? toon('#ffffff', { map: pitchTexture() }) : new MeshBasicMaterial({ map: pitchTexture(), color: '#e4ecf2' });
  const pitch = new Mesh(new PlaneGeometry(PITCH, PITCH).rotateX(-Math.PI / 2), pitchMat);
  pitch.position.set(0, 0, PITCH_Z);
  pitch.receiveShadow = true;
  scene.add(pitch);

  // The boards behind the goal and down the sides.
  const boards = boardTexture().clone();
  boards.needsUpdate = true;
  boards.wrapS = RepeatWrapping;
  boards.repeat.set(3, 1);
  const boardMat = new MeshBasicMaterial({ map: boards, color: '#ffffff' });
  const back = new Mesh(new PlaneGeometry(26, 0.75), boardMat);
  back.position.set(0, 0.38, -3.9);
  scene.add(back);
  scene.add(block(26, 0.75, 0.12, '#0a0f2c', 0, 0.38, -3.98));
  for (const side of [-1, 1]) {
    const b = new Mesh(new PlaneGeometry(20, 0.75), boardMat);
    b.rotation.y = -side * Math.PI / 2;
    b.position.set(side * 12.5, 0.38, 6);
    scene.add(b);
  }

  // Floodlight pylons at the four corners, each with a bank of lamps and, above low, a beam of light.
  const corners: [number, number][] = [
    [-14.5, -10.5],
    [14.5, -10.5],
    [-15.5, 18],
    [15.5, 18],
  ];
  for (const [x, z] of corners) {
    const pylon = new Group();
    pylon.add(bar(G.post, '#596085', new Vector3(0, 0, 0), new Vector3(0, 12, 0), 2.6));
    const head = block(2.6, 1.5, 0.3, '#2a3058', 0, 12.4, 0);
    pylon.add(head);
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 3; c++) {
        const lamp = block(0.6, 0.48, 0.1, '#f4f8ff', -0.8 + c * 0.8, 12.05 + r * 0.7, 0.18, 1);
        pylon.add(lamp);
      }
    // One soft glow over the whole bank of lamps: cheaper than one per lamp, and it reads the same from the pitch.
    const glow = glowSprite('#e6efff', q.tier === 'low' ? 5 : 5.5, 0.85);
    glow.position.set(0, 12.4, 0.4);
    pylon.add(glow);
    pylon.position.set(x, 0, z);
    pylon.lookAt(0, 0, 4);
    pylon.rotation.x = 0;
    scene.add(pylon);
    if (q.tier === 'high' && z < 0) {
      // A faint beam from the lamps to the middle of the pitch.
      const from = new Vector3(x, 12.4, z);
      const to = new Vector3(x * 0.25, 0, 3 + (z - 3) * 0.25);
      const len = from.distanceTo(to);
      const beam = new Mesh(G.cone, new MeshBasicMaterial({ color: '#c8d8ff', transparent: true, opacity: 0.045, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }));
      beam.userData.sharedGeometry = true;
      beam.scale.set(4.5, len, 4.5);
      beam.position.copy(from);
      beam.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), to.clone().sub(from).normalize());
      scene.add(beam);
    }
  }

  const crowd = new Crowd(world, crowdLooks, world.env.reducedMotion);
  scene.add(crowd.group);
  // The broadcast cameras look across the pitch, so the big screen gets a stand down the side too.
  if (sideStand && q.tier !== 'low') {
    const side = new Crowd(world, crowdLooks, world.env.reducedMotion, { width: 22, seed: 31, real: false });
    side.group.rotation.y = Math.PI / 2;
    side.group.position.set(-7.5, 0, 6);
    scene.add(side.group);
    crowd.also.push(side);
  }
  return { crowd, boards };
}

/* ---------------------------------- the rig --------------------------------- */

type BallState =
  | { kind: 'rest' }
  | { kind: 'hidden' }
  | { kind: 'flight'; from: Vector3; ctrl: Vector3; to: Vector3; t: number; dur: number; onArrive: () => void }
  | { kind: 'free'; v: Vector3; inNet: boolean }
  | { kind: 'held' };

interface Step {
  at: number;
  run: () => void;
}

/** One penalty: goal, net, keeper, ball and kicker, and the timeline of a shot. */
class PenaltyRig {
  readonly keeper: Keeper;
  readonly ball: Mesh;
  readonly kicker = new Group();
  glim: Glim3D | null = null;
  private ballState: BallState = { kind: 'rest' };
  private net: Mesh;
  private netBase: Float32Array;
  private bulge: { x: number; y: number; t: number; amp: number } | null = null;
  private steps: Step[] = [];
  private t = 0;
  private kickFrom = new Vector3(-0.7, 0, SPOT_Z + 1.05);
  private kickTo = new Vector3(-0.42, 0, SPOT_Z + 0.36);
  private run: { t: number; dur: number; from: Vector3; to: Vector3 } | null = null;
  private faceCamera = 0;
  private lunge = 0;
  private fire = false;
  private markers: Mesh[] = [];
  private aimRing: Mesh;
  private captionAnchor = new Group();
  /** Something happened worth showing off: the scene moves its camera. */
  onMoment: ((m: 'strike' | 'goal' | 'saved' | 'wide' | 'celebrate' | 'reset') => void) | null = null;
  readonly calm: boolean;

  constructor(
    private readonly world: World,
    private readonly crowd: Crowd,
  ) {
    const scene = world.scene;
    this.calm = world.env.reducedMotion;
    const white = '#f5f7ff';
    const frame = new Group();
    const L = -GOAL_W / 2;
    const R = GOAL_W / 2;
    frame.add(bar(G.post, white, new Vector3(L, 0, 0), new Vector3(L, GOAL_H, 0)));
    frame.add(bar(G.post, white, new Vector3(R, 0, 0), new Vector3(R, GOAL_H, 0)));
    frame.add(bar(G.post, white, new Vector3(L - POST_R, GOAL_H, 0), new Vector3(R + POST_R, GOAL_H, 0)));
    for (const x of [L, R]) {
      frame.add(bar(G.thin, '#aab3d6', new Vector3(x, GOAL_H, 0), new Vector3(x, GOAL_H * 0.85, -NET_D)));
      frame.add(bar(G.thin, '#aab3d6', new Vector3(x, GOAL_H * 0.85, -NET_D), new Vector3(x, 0, -NET_D)));
      frame.add(bar(G.thin, '#aab3d6', new Vector3(x, 0, -NET_D), new Vector3(x, 0, 0)));
    }
    frame.add(bar(G.thin, '#aab3d6', new Vector3(L, 0, -NET_D), new Vector3(R, 0, -NET_D)));
    frame.add(bar(G.thin, '#aab3d6', new Vector3(L, GOAL_H * 0.85, -NET_D), new Vector3(R, GOAL_H * 0.85, -NET_D)));
    frame.traverse((o) => {
      if (o instanceof Mesh) o.castShadow = world.env.quality.shadows;
    });
    scene.add(frame);

    // The nets: a back net that bulges, sides and a roof.
    const tex = netTexture();
    const netMat = (w: number, h: number) => {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(w / 0.16, h / 0.16);
      return new MeshBasicMaterial({ map: t, color: '#eef2ff', transparent: true, alphaTest: 0.35, side: DoubleSide, depthWrite: false, opacity: 0.85 });
    };
    const backH = GOAL_H * 0.85;
    const backGeo = new PlaneGeometry(GOAL_W, backH, 26, 10);
    this.net = new Mesh(backGeo, netMat(GOAL_W, backH));
    this.net.position.set(0, backH / 2, -NET_D);
    scene.add(this.net);
    this.netBase = Float32Array.from(backGeo.attributes.position!.array as ArrayLike<number>);
    const roof = new Mesh(new PlaneGeometry(GOAL_W, NET_D + 0.05), netMat(GOAL_W, NET_D));
    roof.rotation.x = -Math.PI / 2 - Math.atan2(GOAL_H - backH, NET_D);
    roof.position.set(0, (GOAL_H + backH) / 2, -NET_D / 2);
    scene.add(roof);
    for (const side of [-1, 1]) {
      const sideNet = new Mesh(new PlaneGeometry(NET_D, GOAL_H), netMat(NET_D, GOAL_H));
      sideNet.rotation.y = Math.PI / 2;
      sideNet.position.set(side * GOAL_W / 2, GOAL_H / 2, -NET_D / 2);
      scene.add(sideNet);
    }

    this.keeper = new Keeper(this.calm);
    this.keeper.position.set(0, 0, 0.35);
    scene.add(this.keeper);

    this.ball = solid(G.ball, toon('#ffffff', { map: ballTexture() }), true);
    this.ball.position.set(0, BALL_R, SPOT_Z);
    scene.add(this.ball);
    const ballShadow = props.blobShadow(0.2);
    ballShadow.name = 'ballShadow';
    scene.add(ballShadow);
    this.ball.userData.shadow = ballShadow;

    this.kicker.position.copy(this.kickFrom);
    this.kicker.rotation.y = Math.PI;
    scene.add(this.kicker);

    // Keeper duty's guarded places, and the place a player is about to aim at.
    for (let i = 0; i < 2; i++) {
      const m = new Mesh(G.ring, new MeshBasicMaterial({ color: '#ffc233', transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide }));
      m.userData.sharedGeometry = true;
      m.scale.setScalar(1.7);
      m.visible = false;
      scene.add(m);
      this.markers.push(m);
    }
    this.aimRing = new Mesh(G.ring, new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, side: DoubleSide }));
    this.aimRing.userData.sharedGeometry = true;
    this.aimRing.visible = false;
    scene.add(this.aimRing);
    this.captionAnchor.position.set(0, GOAL_H + 0.75, 0);
    scene.add(this.captionAnchor);
  }

  /** The kicker for the next shot: a player's Glim. */
  setKicker(look: GlimLook) {
    if (this.glim) {
      this.glim.dispose();
      this.glim = null;
    }
    const glim = new Glim3D({ look, quality: this.world.env.quality, reducedMotion: this.calm });
    glim.scale.setScalar(1.15);
    this.kicker.add(glim);
    this.glim = glim;
  }

  /** The ball waits on the spot (or not, with no footballs left). */
  setBallReady(ready: boolean) {
    if (this.ballState.kind === 'rest' || this.ballState.kind === 'hidden') {
      this.ballState = { kind: ready ? 'rest' : 'hidden' };
      this.ball.position.set(0, BALL_R, SPOT_Z);
    }
  }

  setFire(on: boolean) {
    this.fire = on;
  }

  /** Keeper duty: rings on the two places the keeper guards. */
  setGuard(places: readonly Aim[] | null) {
    this.markers.forEach((m, i) => {
      const a = places?.[i];
      m.visible = Boolean(a);
      if (a) m.position.set(TARGET[a][0], TARGET[a][1], 0.02);
    });
  }

  /** A ring where the player is about to aim. */
  setAim(aim: Aim | null) {
    this.aimRing.visible = Boolean(aim);
    if (aim) this.aimRing.position.set(TARGET[aim][0], TARGET[aim][1], 0.03);
  }

  busy(): boolean {
    return this.steps.length > 0 || this.run !== null;
  }

  private later(seconds: number, run: () => void) {
    this.steps.push({ at: this.t + seconds, run });
  }

  /** Play one shot, then go back to the start on the scene's own clock (frames can run slow on old laptops). */
  shootThenReset(shot: KickShot, ballReady: () => boolean, onResult?: () => void) {
    this.shoot(shot, onResult);
    this.later(RUN + FLIGHT[shot.power] + 3.1, () => this.reset(ballReady()));
  }

  /** Play one shot. `onResult` fires when the ball arrives, with the words for the moment. */
  shoot(shot: KickShot, onResult?: () => void) {
    this.steps = [];
    this.keeper.reset();
    this.ballState = { kind: 'rest' };
    this.ball.position.set(0, BALL_R, SPOT_Z);
    this.kicker.position.copy(this.kickFrom);
    this.kicker.rotation.y = Math.PI - 0.35;
    this.faceCamera = 0;
    this.setAim(null);
    this.run = { t: 0, dur: RUN, from: this.kickFrom.clone(), to: this.kickTo.clone() };
    this.glim?.setMoving(3);
    const fire = shot.fire || this.fire;
    this.later(RUN, () => this.strike(shot, fire, onResult));
  }

  private strike(shot: KickShot, fire: boolean, onResult?: () => void) {
    this.run = null;
    this.glim?.setMoving(0);
    this.glim?.setExpression('determined', 1.2);
    this.lunge = 1;
    this.onMoment?.('strike');
    const [tx, ty] = TARGET[shot.aim];
    const from = new Vector3(0, BALL_R, SPOT_Z);
    let to = new Vector3(tx, ty, 0);
    if (shot.outcome === 'wide') {
      if (shot.how === 'over') to = new Vector3(tx * 1.05, GOAL_H + 0.9, 0);
      else if (shot.how === 'wide') to = new Vector3(Math.sign(tx || 1) * (GOAL_W / 2 + 0.7), ty, 0);
      else if (shot.how === 'post') to = new Vector3(Math.sign(tx || 1) * (GOAL_W / 2 - 0.02), ty, 0.06);
      else to = new Vector3(tx * 0.9, GOAL_H, 0.06);
    }
    const dur = FLIGHT[shot.power];
    // Placed shots curl and float a little; blasts go straight and flat.
    const curl = shot.power === 'placed' ? 0.9 : 0.15;
    const ctrl = from.clone().lerp(to, 0.5);
    ctrl.x -= Math.sign(to.x || 1) * curl * 0.4;
    ctrl.y += shot.power === 'placed' ? 0.45 : 0.1;
    // The keeper dives a moment after the strike: blasts beat a late dive.
    const save = shot.outcome === 'saved';
    this.keeper.diveTo(shot.dive, save ? Math.max(0.02, dur - 0.42) : 0.08, save);
    this.ballState = {
      kind: 'flight',
      from,
      ctrl,
      to,
      t: 0,
      dur,
      onArrive: () => this.arrive(shot, fire, onResult),
    };
  }

  private caption(text: string, tone: string) {
    const labels = this.world.labels;
    const label = labels.add(this.captionAnchor, text, { offsetY: 0, className: `pop big ${tone}` });
    this.later(1.1, () => labels.remove(label));
  }

  private arrive(shot: KickShot, fire: boolean, onResult?: () => void) {
    const fx = this.world.fx;
    const at = this.ball.position.clone();
    onResult?.();
    this.caption(shot.outcome === 'goal' ? (fire ? 'Double goal!' : 'Goal!') : shot.outcome === 'saved' ? 'Saved' : shot.how === 'post' || shot.how === 'bar' ? `Off the ${shot.how}` : 'Wide', shot.outcome === 'goal' ? 'tone-gold' : shot.outcome === 'saved' ? 'tone-dim' : 'tone-bad');
    if (shot.outcome === 'goal') {
      this.onMoment?.('goal');
      this.ballState = { kind: 'flight', from: at, ctrl: at.clone().add(new Vector3(0, 0.05, -0.6)), to: new Vector3(at.x * 0.95, Math.max(BALL_R, at.y * 0.9), -NET_D + BALL_R), t: 0, dur: 0.14, onArrive: () => {} };
      this.later(0.14, () => {
        this.bulge = { x: at.x, y: at.y, t: 0, amp: shot.power === 'blasted' ? 0.55 : 0.4 };
        this.ballState = { kind: 'free', v: new Vector3(0, -0.5, 0.4), inNet: true };
        fx.burst(new Vector3(at.x, at.y, -NET_D + 0.2), { color: fire ? ['#ff9a2b', '#ffd25a', '#ff4d6a'] : ['#ffffff', '#ffd25a'], shape: 'spark', glow: true, count: fire ? 40 : 22, speed: 3 });
      });
      this.later(0.3, () => {
        this.crowd.cheer();
        fx.burst(new Vector3(0, 3.2, -4.6), { color: ['#ffc233', '#3d9bff', '#1fd38f', '#ff5c8a', '#ffffff'], shape: 'square', count: fire ? 120 : 70, speed: 5, gravity: 4, spread: 1, life: 2.4, size: 0.1 });
      });
      this.later(1.0, () => {
        this.onMoment?.('celebrate');
        this.faceCamera = 1;
        this.glim?.play(fire ? 'celebrate' : 'cheer');
        this.glim?.setExpression('happy', 2.6);
      });
      this.later(2.4, () => this.glim?.play('idle'));
    } else if (shot.outcome === 'saved') {
      this.onMoment?.('saved');
      if (shot.how === 'catch') this.ballState = { kind: 'held' };
      else if (shot.how === 'tip') this.ballState = { kind: 'free', v: new Vector3(Math.sign(at.x) * 0.6, 3.2, -2.6), inNet: false };
      else this.ballState = { kind: 'free', v: new Vector3(Math.sign(at.x || 1) * 2.4, 1.6, 3.4), inNet: false };
      fx.burst(at, { color: ['#ffffff', '#ffc233'], shape: 'star', glow: true, count: 16, speed: 2.2 });
      this.later(0.25, () => this.crowd.ooh());
      this.later(0.9, () => this.keeper.cheer(1.2));
      this.later(0.9, () => this.glim?.setExpression('sad', 2));
    } else {
      this.onMoment?.('wide');
      if (shot.how === 'post' || shot.how === 'bar') {
        const v = shot.how === 'post' ? new Vector3(-Math.sign(at.x || 1) * 1.2, 0.8, 4) : new Vector3(0.3, 3, 3.2);
        this.ballState = { kind: 'free', v, inNet: false };
        fx.burst(at, { color: ['#ffffff'], shape: 'spark', glow: true, count: 14, speed: 2 });
      } else {
        const dir = new Vector3().subVectors(at, new Vector3(0, BALL_R, SPOT_Z)).normalize().multiplyScalar(shot.power === 'blasted' ? 14 : 9);
        this.ballState = { kind: 'free', v: dir, inNet: false };
      }
      this.later(0.25, () => this.crowd.ooh());
      this.later(0.9, () => this.glim?.setExpression('sad', 2));
    }
  }

  /** Back to the start for the next one. */
  reset(ballReady: boolean) {
    this.steps = [];
    this.run = null;
    this.keeper.reset();
    this.faceCamera = 0;
    this.lunge = 0;
    this.kicker.position.copy(this.kickFrom);
    this.kicker.rotation.y = Math.PI;
    this.ballState = { kind: ballReady ? 'rest' : 'hidden' };
    this.ball.position.set(0, BALL_R, SPOT_Z);
    this.onMoment?.('reset');
  }

  update(dt: number) {
    this.t += dt;
    const steps = this.steps;
    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i]!;
      if (this.t >= s.at) {
        steps.splice(i, 1);
        s.run();
      }
    }
    // The run-up.
    if (this.run) {
      this.run.t += dt;
      const k = clamp01(this.run.t / this.run.dur);
      this.kicker.position.lerpVectors(this.run.from, this.run.to, k);
    }
    // The strike: a quick lean through the ball.
    if (this.lunge > 0) {
      this.lunge = Math.max(0, this.lunge - dt * 2.5);
      this.kicker.rotation.x = -Math.sin(this.lunge * Math.PI) * 0.35;
    } else this.kicker.rotation.x = 0;
    // Turn round to the camera to celebrate.
    const wantYaw = this.faceCamera ? 0.25 : this.run ? Math.PI - 0.35 : Math.PI;
    this.kicker.rotation.y += (wantYaw - this.kicker.rotation.y) * Math.min(1, dt * (this.calm ? 20 : 6));

    const b = this.ball;
    const st = this.ballState;
    b.visible = st.kind !== 'hidden';
    if (st.kind === 'flight') {
      st.t += dt;
      const k = clamp01(st.t / st.dur);
      const a = st.from.clone().lerp(st.ctrl, k);
      const c = st.ctrl.clone().lerp(st.to, k);
      b.position.copy(a.lerp(c, k));
      b.rotation.x -= dt * 22;
      if (this.fire || st.dur < 0.5) {
        if (this.fire) this.world.fx.burst(b.position, { color: ['#ff9a2b', '#ffd25a', '#ff4d6a'], shape: 'dot', glow: true, count: 3, speed: 0.4, gravity: -1, life: 0.45, size: 0.16 });
      }
      if (k >= 1) {
        const onArrive = st.onArrive;
        this.ballState = { kind: 'free', v: new Vector3(), inNet: false };
        onArrive();
      }
    } else if (st.kind === 'free') {
      st.v.y -= 9.8 * dt;
      b.position.addScaledVector(st.v, dt);
      b.rotation.x -= st.v.length() * dt * 3;
      if (b.position.y < BALL_R) {
        b.position.y = BALL_R;
        st.v.y = Math.abs(st.v.y) > 0.8 ? -st.v.y * 0.45 : 0;
        st.v.x *= 0.85;
        st.v.z *= 0.85;
      }
      if (st.inNet) {
        b.position.z = Math.max(-NET_D + BALL_R, Math.min(-0.2, b.position.z));
        b.position.x = Math.max(-GOAL_W / 2 + BALL_R, Math.min(GOAL_W / 2 - BALL_R, b.position.x));
      }
    } else if (st.kind === 'held') {
      this.keeper.catchPoint(b.position);
      b.position.z += 0.12;
    }
    const shadow = b.userData.shadow as Mesh;
    shadow.visible = b.visible;
    shadow.position.set(b.position.x, 0.012, b.position.z);
    shadow.scale.setScalar(Math.max(0.2, 0.42 - b.position.y * 0.08));

    // The net settles after a bulge, with a gentle breeze between shots.
    const pos = this.net.geometry.attributes.position!;
    const arr = pos.array as Float32Array;
    const base = this.netBase;
    const bulge = this.bulge;
    if (bulge) bulge.t += dt;
    const breeze = this.calm ? 0 : Math.sin(this.t * 1.1) * 0.025;
    const backH = GOAL_H * 0.85;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i]!;
      const y = base[i + 1]! + backH / 2;
      let dz = breeze * (1 - Math.abs(x) / (GOAL_W / 2)) * (y / backH);
      if (bulge && bulge.t < 1.6) {
        const d2 = (x - bulge.x) ** 2 + (y - bulge.y) ** 2;
        const wave = Math.exp(-bulge.t * 3.2) * Math.cos(bulge.t * 11);
        dz -= bulge.amp * Math.exp(-d2 / 0.45) * wave;
      }
      arr[i + 2] = base[i + 2]! + dz;
    }
    pos.needsUpdate = true;
    if (bulge && bulge.t >= 1.6) this.bulge = null;

    this.keeper.update(dt);
    this.glim?.update(dt);
  }

  kickerPos(): Vector3 {
    return this.kicker.position.clone();
  }
}

/* ---------------------------- the player's penalty ---------------------------- */

export interface PenaltyState {
  balls: number;
  /** What the keeper has learned of each place. */
  reads: Record<Aim, number>;
  /** Keeper duty: the places the keeper you face guards. */
  guard: readonly Aim[] | null;
  onFire: boolean;
  shot: KickShot | null;
}

/** A player's own penalties, seen from behind the spot. */
export class SpotKickScene extends World {
  private rig: PenaltyRig;
  private crowd: Crowd;
  private boards: CanvasTexture;
  private cam: EaseCamera;
  private seen = -1;
  private balls = 0;
  private mode: 'set' | 'push' = 'set';
  private youLabel: Label;
  private onFire = false;
  /** The ball has arrived for the shot with this seq: the screen's words can follow. */
  onResult: ((seq: number) => void) | null = null;

  constructor(env: StageEnv, look: GlimLook, crowd: GlimLook[]) {
    super(env, FLOODLIT, 40);
    const built = buildStadium(this, crowd);
    this.crowd = built.crowd;
    this.boards = built.boards;
    this.rig = new PenaltyRig(this, this.crowd);
    this.rig.setKicker(look);
    this.rig.onMoment = (m) => {
      if (this.env.reducedMotion) return;
      if (m === 'goal') this.mode = 'push';
      if (m === 'reset') this.mode = 'set';
    };
    this.cam = new EaseCamera(this.camera, env.reducedMotion);
    this.youLabel = this.labels.add(this.rig.kicker, 'You', { offsetY: 1.2, className: 'me small' });
    this.shadowArea(9, [0, 0, 3]);
  }

  setState(s: PenaltyState) {
    this.balls = s.balls;
    this.onFire = s.onFire;
    this.rig.setFire(s.onFire);
    this.rig.setGuard(s.guard);
    // The keeper stands a little towards the places it has learned.
    const lean = (Object.entries(s.reads) as [Aim, number][]).reduce((n, [a, r]) => n + TARGET[a][0] * r, 0);
    this.rig.keeper.homeX = Math.max(-0.7, Math.min(0.7, lean * 0.09));
    if (this.seen < 0) {
      this.seen = s.shot?.seq ?? 0;
      this.rig.setBallReady(s.balls > 0);
      return;
    }
    if (s.shot && s.shot.seq !== this.seen) {
      this.seen = s.shot.seq;
      const seq = s.shot.seq;
      this.rig.shootThenReset(s.shot, () => this.balls > 0, () => this.onResult?.(seq));
      return;
    }
    if (!this.rig.busy()) this.rig.setBallReady(s.balls > 0);
  }

  setAim(aim: Aim | null) {
    if (!this.rig.busy()) this.rig.setAim(aim);
  }

  tick(dt: number, t: number) {
    this.rig.update(dt);
    this.crowd.update(dt);
    if (!this.env.reducedMotion) this.boards.offset.x = (t * 0.05) % 1;
    // A ring of sparks round the ball on the spot while on fire.
    if (this.onFire && this.rig.ball.visible && !this.rig.busy() && Math.floor(t * 6) !== Math.floor((t - dt) * 6)) {
      this.fx.burst(this.rig.ball.position, { color: ['#ff9a2b', '#ffd25a'], shape: 'dot', glow: true, count: 3, speed: 0.5, gravity: -1.2, life: 0.6, size: 0.14 });
    }
    // Narrower stages (phones) stand further back so the kicker and the whole goal stay in the picture.
    const aspect = this.camera.aspect;
    const narrow = aspect < 1.6;
    const back = aspect < 0.85 ? 5.5 : aspect < 1.6 ? 2.6 + (1.6 - aspect) * 3 : 0.9;
    const x = narrow ? 1.2 : 1.75;
    if (this.mode === 'push') this.cam.set([x - 0.4, 1.85 + back * 0.25, SPOT_Z + 3.4 + back], [-0.25, 0.95, 0.4]);
    else this.cam.set([x, 2.15 + back * 0.3, SPOT_Z + 4.5 + back], [-0.2, 0.9, 0]);
    this.cam.update(dt);
  }

}

/* ------------------------------- the big screen ------------------------------- */

export interface ReelShot extends KickShot {
  id: number;
  name: string;
  look: GlimLook;
}

const ANGLES: { pos: [number, number, number]; look: [number, number, number] }[] = [
  { pos: [1.4, 2.9, SPOT_Z + 8.2], look: [-0.3, 0.8, 0.6] },
  { pos: [10.2, 3.1, 4.4], look: [-0.2, 0.75, 3.9] },
  { pos: [-3.5, 1.6, -5.2], look: [0, 0.8, 3.5] },
];

/**
 * The big screen: the same stadium from the broadcast cameras, playing every
 * shot around the class in turn, each with the kicker's own Glim and name.
 * A queue keeps up with a busy class by skipping to the newest shots.
 */
export class SpotKickReelScene extends World {
  private rig: PenaltyRig;
  private crowd: Crowd;
  private boards: CanvasTexture;
  private cam: EaseCamera;
  private queue: ReelShot[] = [];
  private seen = new Set<number>();
  private first = true;
  private playing: ReelShot | null = null;
  private until = 0;
  private t = 0;
  private angle = 0;
  private celebrate = false;
  private angleNext = false;
  private name: Label;
  onPlay: ((shot: ReelShot) => void) | null = null;
  onResult: ((shot: ReelShot) => void) | null = null;

  constructor(env: StageEnv, crowd: GlimLook[]) {
    super(env, FLOODLIT, 44);
    const built = buildStadium(this, crowd, true);
    this.crowd = built.crowd;
    this.boards = built.boards;
    this.rig = new PenaltyRig(this, this.crowd);
    this.rig.onMoment = (m) => {
      if (m === 'celebrate' && !this.env.reducedMotion) this.celebrate = true;
      if (m === 'reset') this.celebrate = false;
    };
    this.cam = new EaseCamera(this.camera, env.reducedMotion);
    this.name = this.labels.add(this.rig.kicker, '', { offsetY: 1.25, className: 'big' });
    this.name.visible = false;
    this.shadowArea(9, [0, 0, 3]);
  }

  /** The newest shots (newest first, as the view lists them). */
  setShots(shots: ReelShot[]) {
    if (this.first) {
      // Shots from before this screen opened are history, not highlights.
      for (const s of shots) this.seen.add(s.id);
      this.first = false;
      return;
    }
    for (const s of [...shots].reverse()) {
      if (this.seen.has(s.id)) continue;
      this.seen.add(s.id);
      this.queue.push(s);
    }
    // A busy class: keep the newest few.
    if (this.queue.length > 3) this.queue = this.queue.slice(-3);
  }

  private next() {
    const shot = this.queue.shift();
    if (!shot) return;
    this.playing = shot;
    this.rig.setKicker(shot.look);
    this.rig.setFire(shot.fire);
    this.rig.reset(true);
    this.name.set(shot.name);
    this.name.visible = true;
    this.onPlay?.(shot);
    this.angleNext = true;
    this.rig.shoot(shot, () => this.onResult?.(shot));
    // Quicker when more are waiting.
    this.until = this.t + RUN + FLIGHT[shot.power] + (this.queue.length ? 2.2 : 3.4);
  }

  tick(dt: number, t: number) {
    // Scene time, not wall time: on a slow laptop frames are capped and the rig's timeline runs slower too.
    this.t += dt;
    if (this.playing && t >= this.until) {
      this.playing = null;
      // The next shot from another camera.
      if (this.angleNext && !this.env.reducedMotion) this.angle = (this.angle + 1) % ANGLES.length;
      this.angleNext = false;
      this.rig.reset(true);
      this.name.visible = false;
    }
    if (!this.playing && this.queue.length) this.next();
    this.rig.update(dt);
    this.crowd.update(dt);
    if (!this.env.reducedMotion) this.boards.offset.x = (t * 0.05) % 1;
    const wide = this.camera.aspect > 1.5 ? 0 : 2.5;
    const a = ANGLES[this.angle]!;
    // After a goal the camera leans in on the celebration.
    const push = this.celebrate && this.angle === 0 ? 1.6 : 0;
    this.cam.set([a.pos[0], a.pos[1] + wide * 0.2 - push * 0.2, a.pos[2] + (this.angle === 0 ? wide : 0) - push], a.look);
    this.cam.update(dt);
  }
}
