import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  type Texture,
  Vector3,
} from 'three';

/*
 * Bursts of sparks, coins, splashes and confetti. One pool of points per
 * scene, drawn in a single call, so a burst costs nothing to start. Shapes
 * come from a small atlas drawn on a canvas at load: a soft dot, a star, a
 * diamond spark and a confetti square. Counts are scaled by the quality tier,
 * and under reduced motion bursts are smaller and do not fly far.
 */

export type ParticleShape = 'dot' | 'star' | 'spark' | 'square';
const SHAPES: ParticleShape[] = ['dot', 'star', 'spark', 'square'];

export interface BurstOptions {
  count?: number;
  /** One colour, or several to pick from. */
  color?: string | string[];
  shape?: ParticleShape;
  /** Metres per second. */
  speed?: number;
  /** 0: straight up; 1: every direction. */
  spread?: number;
  /** Metres per second squared, downwards. */
  gravity?: number;
  /** Seconds. */
  life?: number;
  /** Size in metres at the start. */
  size?: number;
  /** Additive glow (sparks, light) instead of solid paint (confetti, drops). */
  glow?: boolean;
}

let atlas: Texture | null = null;

function makeAtlas(): Texture {
  if (atlas) return atlas;
  const n = 64;
  const c = document.createElement('canvas');
  c.width = n * 4;
  c.height = n;
  const g = c.getContext('2d')!;
  // dot
  const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, n, n);
  // star
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? n * 0.2 : n * 0.48;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(n + n / 2 + Math.cos(a) * r, n / 2 + Math.sin(a) * r);
  }
  g.fill();
  // spark (diamond)
  g.beginPath();
  g.moveTo(2 * n + n / 2, 2);
  g.lineTo(2 * n + n * 0.62, n / 2);
  g.lineTo(2 * n + n / 2, n - 2);
  g.lineTo(2 * n + n * 0.38, n / 2);
  g.fill();
  // square
  g.fillRect(3 * n + n * 0.2, n * 0.28, n * 0.6, n * 0.44);
  atlas = new CanvasTexture(c);
  atlas.userData.shared = true;
  return atlas;
}

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aShape;
attribute vec3 aColor;
varying float vAlpha;
varying float vShape;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vShape = aShape;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying float vAlpha;
varying float vShape;
varying vec3 vColor;
void main() {
  vec2 uv = vec2((gl_PointCoord.x + vShape) / 4.0, 1.0 - gl_PointCoord.y);
  vec4 t = texture2D(uAtlas, uv);
  float a = t.a * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor, a);
}`;

interface Particle {
  life: number;
  max: number;
  vel: Vector3;
  gravity: number;
  size: number;
}

class Pool {
  readonly points: Points;
  private pos: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private shape: Float32Array;
  private color: Float32Array;
  private parts: (Particle | null)[];
  private next = 0;
  private live = 0;

  constructor(
    readonly capacity: number,
    glow: boolean,
  ) {
    const geo = new BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.shape = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 3);
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new BufferAttribute(this.alpha, 1));
    geo.setAttribute('aShape', new BufferAttribute(this.shape, 1));
    geo.setAttribute('aColor', new BufferAttribute(this.color, 3));
    const mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uAtlas: { value: makeAtlas() }, uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: glow ? AdditiveBlending : NormalBlending,
    });
    this.points = new Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.parts = Array.from({ length: capacity }, () => null);
  }

  setScale(px: number) {
    (this.points.material as ShaderMaterial).uniforms.uScale!.value = px;
  }

  spawn(at: Vector3, vel: Vector3, color: Color, shape: number, life: number, gravity: number, size: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    if (!this.parts[i]) this.live++;
    this.parts[i] = { life, max: life, vel, gravity, size };
    this.pos.set([at.x, at.y, at.z], i * 3);
    this.color.set([color.r, color.g, color.b], i * 3);
    this.shape[i] = shape;
    this.size[i] = size;
    this.alpha[i] = 1;
  }

  update(dt: number) {
    if (!this.live) return;
    for (let i = 0; i < this.capacity; i++) {
      const p = this.parts[i];
      if (!p) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.parts[i] = null;
        this.live--;
        this.alpha[i] = 0;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(1 - Math.min(0.9, dt * 0.8));
      this.pos[i * 3]! += p.vel.x * dt;
      this.pos[i * 3 + 1]! += p.vel.y * dt;
      this.pos[i * 3 + 2]! += p.vel.z * dt;
      const k = p.life / p.max;
      this.alpha[i] = Math.min(1, k * 2.2);
      this.size[i] = p.size * (0.5 + 0.5 * k);
    }
    const g = this.points.geometry;
    g.attributes.position!.needsUpdate = true;
    g.attributes.aAlpha!.needsUpdate = true;
    g.attributes.aSize!.needsUpdate = true;
    g.attributes.aShape!.needsUpdate = true;
    g.attributes.aColor!.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as ShaderMaterial).dispose();
  }
}

const tmp = new Color();

export class Particles {
  private paint: Pool;
  private light: Pool;

  constructor(
    private readonly scale: number,
    private readonly reducedMotion: boolean,
  ) {
    const cap = Math.max(80, Math.round(500 * scale));
    this.paint = new Pool(cap, false);
    this.light = new Pool(cap, true);
  }

  get objects() {
    return [this.paint.points, this.light.points];
  }

  /** Point size scale: the canvas height in pixels works well. */
  setViewHeight(px: number) {
    this.paint.setScale(px);
    this.light.setScale(px);
  }

  burst(at: Vector3, o: BurstOptions = {}) {
    const calm = this.reducedMotion;
    const count = Math.max(1, Math.round((o.count ?? 16) * this.scale * (calm ? 0.4 : 1)));
    const colors = Array.isArray(o.color) ? o.color : [o.color ?? '#ffd25a'];
    const shape = SHAPES.indexOf(o.shape ?? 'dot');
    const speed = (o.speed ?? 3) * (calm ? 0.35 : 1);
    const spread = o.spread ?? 0.6;
    const pool = o.glow ? this.light : this.paint;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 1 - Math.random() * spread;
      const side = Math.sqrt(Math.max(0, 1 - up * up));
      const s = speed * (0.55 + Math.random() * 0.6);
      const vel = new Vector3(Math.cos(a) * side * s, up * s, Math.sin(a) * side * s);
      tmp.set(colors[i % colors.length]!);
      pool.spawn(at, vel, tmp, shape, (o.life ?? 0.9) * (0.7 + Math.random() * 0.5), o.gravity ?? 6, (o.size ?? 0.12) * (0.7 + Math.random() * 0.6));
    }
  }

  update(dt: number) {
    this.paint.update(dt);
    this.light.update(dt);
  }

  dispose() {
    this.paint.dispose();
    this.light.dispose();
  }
}
