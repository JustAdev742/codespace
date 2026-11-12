// The film's engine: one WebGL stage laid out in screen pixels (1920 by 1080 at z = 0), with
// footage on cards, text, lights, confetti and Glim characters, drawn one exact frame at a time.
import {
  AdditiveBlending, AmbientLight, CanvasTexture, Color, DirectionalLight, DoubleSide, DynamicDrawUsage, Group, HalfFloatType, HemisphereLight, InstancedMesh,
  LinearFilter, LinearMipmapLinearFilter, Matrix4, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Quaternion, SRGBColorSpace, Scene,
  ShaderMaterial, Texture, Vector2, Vector3, WebGLRenderTarget, WebGLRenderer, Euler, NormalBlending,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export const W = 1920;
export const H = 1080;
export const FPS = 30;
export const BPM = 120;
/** Seconds at the start of a bar (bars count from 1, four beats each, two seconds a bar). */
export const bar = (n: number, beat = 1) => (n - 1) * 2 + (beat - 1) * 0.5;

/* ------------------------------------------------ maths ------------------------------------------------ */

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** How far `t` is through [a, b], held at 0 before and 1 after. */
export const seg = (t: number, a: number, b: number) => (!Number.isFinite(a) ? 0 : !(b > a) ? (t >= a ? 1 : 0) : clamp01((t - a) / (b - a)));
export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inCubic: (t: number) => t * t * t,
  inQuart: (t: number) => t * t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outElastic: (t: number) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};
/** A seeded random stream, so every render of a frame is the same picture. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------ the stage ------------------------------------------------ */

const FOV = 30;
/** Camera distance at which z = 0 fills the frame one unit to a pixel. */
export const CAM_Z = H / 2 / Math.tan((FOV * Math.PI) / 360);

const FINISH = {
  uniforms: {
    tDiffuse: { value: null as Texture | null },
    uFlash: { value: 0 }, uFade: { value: 1 }, uAberration: { value: 0 }, uGrain: { value: 0.006 }, uSeed: { value: 0 }, uVignette: { value: 0.42 },
    uBlur: { value: new Vector2(0, 0) }, uZoomBlur: { value: 0 }, uTint: { value: new Color(1, 1, 1) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uFlash, uFade, uAberration, uGrain, uSeed, uVignette, uZoomBlur; uniform vec2 uBlur; uniform vec3 uTint;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    vec3 pick(vec2 uv){
      vec2 d = (uv - 0.5) * uAberration;
      return vec3(texture2D(tDiffuse, uv + d).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d).b);
    }
    void main(){
      vec3 c = vec3(0.0);
      // A smear along a direction (whip pans) and outward from the centre (hits), in one loop.
      if (dot(uBlur, uBlur) > 0.0000001 || uZoomBlur > 0.0001) {
        const int N = 20;
        for (int i = 0; i < N; i++) {
          float k = (float(i) / float(N - 1)) - 0.5;
          vec2 uv = vUv + uBlur * k + (vUv - 0.5) * uZoomBlur * k;
          c += pick(uv);
        }
        c /= float(N);
      } else c = pick(vUv);
      float r = length((vUv - 0.5) * vec2(1.0, 0.72));
      c *= mix(1.0, smoothstep(0.86, 0.18, r), uVignette);
      c *= uTint;
      c += (hash(vUv * vec2(1920.0, 1080.0) + uSeed) - 0.5) * uGrain * (0.4 + 2.0 * dot(c, vec3(0.33)));
      c = mix(c, vec3(1.0), clamp(uFlash, 0.0, 1.0));
      gl_FragColor = vec4(c * uFade, 1.0);
    }`,
};

export class Stage {
  renderer: WebGLRenderer;
  scene = new Scene();
  camera = new PerspectiveCamera(FOV, W / H, 10, 12000);
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  finish: ShaderPass;
  sun: DirectionalLight;
  /** A layer fixed to the lens: captions here sit still on screen however the camera moves. Units are pixels. */
  hud = new Group();
  private fwd = new Vector3();

  constructor() {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.renderer.setClearColor(0x05060f, 1);
    this.scene.add(new AmbientLight(0xffffff, 0.55));
    this.scene.add(new HemisphereLight(0xcfd8ff, 0x1a1530, 1.15));
    this.sun = new DirectionalLight(0xfff1d6, 2.2);
    this.sun.position.set(600, 1400, 1600);
    this.scene.add(this.sun);
    const target = new WebGLRenderTarget(W, H, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new Vector2(W, H), 0.35, 0.6, 1.0);
    this.composer.addPass(this.bloom);
    this.finish = new ShaderPass(FINISH);
    this.composer.addPass(this.finish);
    this.composer.addPass(new OutputPass());
    this.scene.add(this.hud);
    this.resetCamera();
  }
  /** The plain view: z = 0 fills the frame. */
  resetCamera() {
    this.camera.position.set(0, 0, CAM_Z);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
    this.camera.fov = FOV;
    this.camera.updateProjectionMatrix();
  }
  /** Move the camera: where it looks, how far it is pushed in, and a roll in radians. */
  view(o: { x?: number; y?: number; dolly?: number; lookX?: number; lookY?: number; roll?: number; orbitX?: number; orbitY?: number }) {
    const d = CAM_Z - (o.dolly ?? 0);
    const ox = o.orbitX ?? 0, oy = o.orbitY ?? 0;
    const lx = o.lookX ?? o.x ?? 0, ly = o.lookY ?? o.y ?? 0;
    this.camera.position.set((o.x ?? 0) + Math.sin(oy) * d, (o.y ?? 0) + Math.sin(ox) * d, Math.cos(oy) * Math.cos(ox) * d);
    this.camera.up.set(Math.sin(o.roll ?? 0), Math.cos(o.roll ?? 0), 0);
    this.camera.lookAt(lx, ly, 0);
  }
  get fx() { return this.finish.uniforms as typeof FINISH.uniforms; }
  render() {
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.fwd);
    this.hud.position.copy(this.camera.position).addScaledVector(this.fwd, CAM_Z);
    this.hud.quaternion.copy(this.camera.quaternion);
    this.composer.render();
    // Wait for the picture to be drawn before anyone photographs it.
    const gl = this.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }
}

/* ------------------------------------------------ footage ------------------------------------------------ */

const pad = (n: number) => String(n).padStart(5, '0');

/** A shot filmed from the app: numbered pictures on disk, loaded as they are needed. */
export class Clip {
  frames = 0;
  ok = false;
  /** Frame numbers the camera noted while filming (the tap, the leaderboard opening). */
  marks: Record<string, number> = {};
  private cache = new Map<number, Texture>();
  private loading = new Map<number, Promise<Texture>>();
  constructor(readonly name: string) {}
  async init() {
    try {
      const r = await fetch(`/media/footage/${this.name}/meta.json`);
      if (r.ok) { const meta = await r.json(); this.frames = meta.frames; this.marks = meta.marks ?? {}; this.ok = this.frames > 0; }
    } catch { /* not filmed yet */ }
    return this;
  }
  /** The picture for frame `i` (1 is the first; clamped to the clip). */
  frame(i: number): Promise<Texture | null> {
    if (!this.ok) return Promise.resolve(null);
    const n = Math.max(1, Math.min(this.frames, Math.round(i)));
    const hit = this.cache.get(n);
    if (hit) return Promise.resolve(hit);
    let p = this.loading.get(n);
    if (!p) {
      p = loadTexture(`/media/footage/${this.name}/${pad(n)}.jpg`).then((t) => {
        this.cache.set(n, t);
        this.loading.delete(n);
        // Keep a few; a clip is played forwards, so the oldest can go.
        if (this.cache.size > 4) {
          const first = this.cache.keys().next().value as number;
          this.cache.get(first)?.dispose();
          this.cache.delete(first);
        }
        return t;
      });
      this.loading.set(n, p);
    }
    return p;
  }
}

export async function loadTexture(url: string): Promise<Texture> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const bmp = await createImageBitmap(await res.blob(), { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const t = new Texture(bmp as unknown as HTMLImageElement);
  t.flipY = false;
  t.colorSpace = SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export async function loadStill(name: string): Promise<Texture | null> {
  try { return await loadTexture(`/media/stills/${name}.png`); } catch { return null; }
}

/* ------------------------------------------------ cards ------------------------------------------------ */

const CARD_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SD = 'float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }';
const CARD_FS = /* glsl */ `
  uniform sampler2D map; uniform vec2 uSize; uniform float uRadius, uOpacity, uBright, uHasMap, uSheen, uRim; uniform vec4 uCrop; uniform vec3 uColor, uRimColor;
  varying vec2 vUv; ${SD}
  void main(){
    vec2 p = (vUv - 0.5) * uSize;
    float d = sdRound(p, uSize * 0.5, uRadius);
    float aa = max(fwidth(d), 0.0001);
    float a = 1.0 - smoothstep(-aa, aa, d);
    vec2 uv = vec2(mix(uCrop.x, uCrop.z, vUv.x), mix(1.0 - uCrop.w, 1.0 - uCrop.y, vUv.y));
    vec3 c = mix(uColor, texture2D(map, uv).rgb, uHasMap) * uBright;
    // A band of light that can sweep across the glass.
    float band = smoothstep(0.07, 0.0, abs((vUv.x + vUv.y * 0.35) - uSheen));
    c += band * 0.05;
    // A thin bright edge, so a dark screen still has a shape against a dark stage.
    float rim = smoothstep(uRim + aa, uRim - aa, -d) ;
    c = mix(c, uRimColor, rim * 0.9 * step(0.001, uRim));
    gl_FragColor = vec4(c, a * uOpacity);
  }`;
const SHADOW_FS = /* glsl */ `
  uniform vec2 uSize, uInner; uniform float uRadius, uBlur, uOpacity; uniform vec3 uColor; varying vec2 vUv; ${SD}
  void main(){
    vec2 p = (vUv - 0.5) * uSize;
    float d = sdRound(p, uInner * 0.5, uRadius);
    float a = 1.0 - smoothstep(-uBlur, uBlur, d);
    gl_FragColor = vec4(uColor, a * a * uOpacity);
  }`;
const unit = new PlaneGeometry(1, 1);

export interface CardOptions { w: number; h: number; radius?: number; shadow?: number; color?: string; rim?: number; rimColor?: string; glow?: string }

/** A rounded rectangle that shows a picture (or a flat colour), with a soft shadow under it. */
export class Card extends Group {
  readonly face: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly shade: Mesh<PlaneGeometry, ShaderMaterial> | null = null;
  readonly halo: Mesh<PlaneGeometry, ShaderMaterial> | null = null;
  w: number; h: number;
  constructor(o: CardOptions) {
    super();
    this.w = o.w; this.h = o.h;
    const radius = o.radius ?? 26;
    if (o.glow) {
      const m = 260;
      this.halo = new Mesh(unit, new ShaderMaterial({
        uniforms: { uSize: { value: new Vector2(o.w + m * 2, o.h + m * 2) }, uInner: { value: new Vector2(o.w * 0.9, o.h * 0.9) }, uRadius: { value: radius }, uBlur: { value: m * 0.9 }, uOpacity: { value: 0.55 }, uColor: { value: new Color(o.glow) } },
        vertexShader: CARD_VS, fragmentShader: SHADOW_FS, transparent: true, depthWrite: false, blending: AdditiveBlending,
      }));
      this.halo.scale.set(o.w + m * 2, o.h + m * 2, 1);
      this.halo.position.z = -3;
      this.halo.renderOrder = -2;
      this.add(this.halo);
    }
    if (o.shadow !== 0) {
      const m = 140;
      this.shade = new Mesh(unit, new ShaderMaterial({
        uniforms: { uSize: { value: new Vector2(o.w + m * 2, o.h + m * 2) }, uInner: { value: new Vector2(o.w, o.h) }, uRadius: { value: radius }, uBlur: { value: 70 }, uOpacity: { value: o.shadow ?? 0.6 }, uColor: { value: new Color(0x000008) } },
        vertexShader: CARD_VS, fragmentShader: SHADOW_FS, transparent: true, depthWrite: false,
      }));
      this.shade.scale.set(o.w + m * 2, o.h + m * 2, 1);
      this.shade.position.set(0, -34, -2);
      this.shade.renderOrder = -1;
      this.add(this.shade);
    }
    this.face = new Mesh(unit, new ShaderMaterial({
      uniforms: {
        map: { value: null }, uSize: { value: new Vector2(o.w, o.h) }, uRadius: { value: radius }, uOpacity: { value: 1 }, uBright: { value: 1 }, uHasMap: { value: 0 }, uSheen: { value: -1 },
        uCrop: { value: [0, 0, 1, 1] }, uColor: { value: new Color(o.color ?? '#10142e') }, uRim: { value: o.rim ?? 0 }, uRimColor: { value: new Color(o.rimColor ?? '#5b6cff') },
      },
      vertexShader: CARD_VS, fragmentShader: CARD_FS, transparent: true, depthWrite: false,
    }));
    this.face.scale.set(o.w, o.h, 1);
    this.add(this.face);
  }
  get u() { return this.face.material.uniforms; }
  /** Show a picture; `crop` is left, top, right, bottom as fractions of the picture. */
  show(tex: Texture | null, crop?: [number, number, number, number]) {
    this.u.map!.value = tex;
    this.u.uHasMap!.value = tex ? 1 : 0;
    if (crop) this.u.uCrop!.value = crop;
  }
  set opacity(v: number) {
    this.u.uOpacity!.value = v;
    if (this.shade) this.shade.material.uniforms.uOpacity!.value = 0.6 * v;
    if (this.halo) this.halo.material.uniforms.uOpacity!.value = 0.55 * v;
    this.visible = v > 0.002;
  }
}

/** A phone: a dark body with a bright edge, and a screen card set into it. */
export class Phone extends Group {
  readonly body: Card;
  readonly screen: Card;
  constructor(screenW = 300) {
    super();
    const sh = (screenW * 844) / 390;
    const bez = screenW * 0.045;
    this.body = new Card({ w: screenW + bez * 2, h: sh + bez * 2, radius: screenW * 0.16, color: '#060714', rim: 2.2, rimColor: '#8a93c8', shadow: 0.7 });
    this.screen = new Card({ w: screenW, h: sh, radius: screenW * 0.12, shadow: 0 });
    this.screen.position.z = 1;
    this.add(this.body, this.screen);
  }
  set opacity(v: number) { this.body.opacity = v; this.screen.opacity = v; this.visible = v > 0.002; }
}

/** The classroom's big screen: a thin dark frame with a glow behind it. */
export class BigScreen extends Group {
  readonly frame: Card;
  readonly screen: Card;
  constructor(w = 1280, glow = '#3b4bff') {
    super();
    const h = (w * 9) / 16;
    this.frame = new Card({ w: w + 28, h: h + 28, radius: 30, color: '#04050d', rim: 2, rimColor: '#7f8be0', glow, shadow: 0.75 });
    this.screen = new Card({ w, h, radius: 18, shadow: 0 });
    this.screen.position.z = 1;
    this.add(this.frame, this.screen);
  }
  set opacity(v: number) { this.frame.opacity = v; this.screen.opacity = v; this.visible = v > 0.002; }
}

/* ------------------------------------------------ text ------------------------------------------------ */

export interface TextOptions { size: number; font?: 'display' | 'sans'; weight?: number; italic?: boolean; color?: string; tracking?: number; glow?: number; stroke?: string; strokeWidth?: number; shadow?: boolean }
const FONT = { display: '"Barlow Condensed"', sans: '"Atkinson Hyperlegible Next Variable"' } as const;
const SS = 2; // Text is drawn at twice its size so a push-in stays sharp.

function fontOf(o: TextOptions) {
  const fam = FONT[o.font ?? 'display'];
  return `${o.italic ? 'italic ' : ''}${o.weight ?? (o.font === 'sans' ? 700 : 800)} ${o.size * SS}px ${fam}`;
}

export type TextMesh = Mesh<PlaneGeometry, MeshBasicMaterial> & { w: number; h: number };

/** One line of text as a flat picture in the scene. Its origin is its centre. */
export function text(str: string, o: TextOptions): TextMesh {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = fontOf(o);
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(o.tracking ?? 0) * SS}px`;
  const m = ctx.measureText(str);
  const padX = o.size * 0.5 * SS, padY = o.size * 0.45 * SS;
  const asc = Math.max(m.actualBoundingBoxAscent, o.size * 0.72 * SS), desc = Math.max(m.actualBoundingBoxDescent, o.size * 0.22 * SS);
  c.width = Math.ceil(m.width + padX * 2);
  c.height = Math.ceil(asc + desc + padY * 2);
  ctx.font = fontOf(o);
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(o.tracking ?? 0) * SS}px`;
  ctx.textBaseline = 'alphabetic';
  if (o.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = (o.strokeWidth ?? 6) * SS; ctx.strokeStyle = o.stroke; ctx.strokeText(str, padX, padY + asc); }
  if (o.shadow) { ctx.shadowColor = 'rgba(2,3,18,0.85)'; ctx.shadowBlur = o.size * 0.22 * SS; ctx.shadowOffsetY = o.size * 0.05 * SS; }
  ctx.fillStyle = o.color ?? '#ffffff';
  ctx.fillText(str, padX, padY + asc);
  if (o.shadow) { ctx.shadowBlur = o.size * 0.08 * SS; ctx.fillText(str, padX, padY + asc); }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new Color(1, 1, 1).multiplyScalar(1 + (o.glow ?? 0)) });
  const mesh = new Mesh(new PlaneGeometry(c.width / SS, c.height / SS), mat) as TextMesh;
  mesh.w = m.width / SS;
  mesh.h = (asc + desc) / SS;
  mesh.renderOrder = 20;
  return mesh;
}

/** A line set word by word, so each word can arrive on its own. Centred on the group's origin. */
export function words(str: string, o: TextOptions, gap = 0.26): { group: Group; items: TextMesh[]; width: number } {
  const group = new Group();
  const items = str.split(' ').map((w) => text(w, o));
  const space = o.size * gap;
  const width = items.reduce((s, m) => s + m.w, 0) + space * (items.length - 1);
  let x = -width / 2;
  for (const m of items) { m.position.x = x + m.w / 2; m.userData.x = m.position.x; x += m.w + space; group.add(m); }
  return { group, items, width };
}

/** Moves a set line so its left edge (or right edge) is at the group's origin. */
export function alignWords(line: { group: Group; items: TextMesh[]; width: number }, how: 'left' | 'right') {
  const shift = how === 'left' ? line.width / 2 : -line.width / 2;
  for (const m of line.items) m.position.x += shift;
  return line;
}

/** Words that rise into place one after another; `t` is seconds since the line began. */
export function riseIn(items: TextMesh[], t: number, { each = 0.07, dur = 0.42, rise = 46, out = Infinity, outDur = 0.25 }: { each?: number; dur?: number; rise?: number; out?: number; outDur?: number } = {}) {
  items.forEach((m, i) => {
    const p = ease.outBack(seg(t, i * each, i * each + dur), 1.4);
    const gone = seg(t, out + i * 0.025, out + i * 0.025 + outDur);
    m.position.y = (1 - p) * -rise + ease.inCubic(gone) * rise * 0.8;
    m.material.opacity = clamp01(seg(t, i * each, i * each + dur * 0.5)) * (1 - gone);
    m.visible = m.material.opacity > 0.002;
    const s = 0.86 + 0.14 * p;
    m.scale.set(s, s, 1);
  });
}

/** A soft dark patch to sit behind words that cross a busy picture. */
export function scrim(w: number, h: number, opacity = 0.6): Mesh<PlaneGeometry, ShaderMaterial> {
  const m = Math.min(w, h) * 0.5;
  const mesh = new Mesh(unit, new ShaderMaterial({
    uniforms: { uSize: { value: new Vector2(w + m * 2, h + m * 2) }, uInner: { value: new Vector2(w * 0.7, h * 0.6) }, uRadius: { value: h * 0.3 }, uBlur: { value: m }, uOpacity: { value: opacity }, uColor: { value: new Color(0x02030f) } },
    vertexShader: CARD_VS, fragmentShader: SHADOW_FS, transparent: true, depthWrite: false,
  }));
  mesh.scale.set(w + m * 2, h + m * 2, 1);
  mesh.renderOrder = 15;
  return mesh;
}

/** A plain coloured bar or pill. */
export function slab(w: number, h: number, color: string, radius = h / 2, glow = 0) {
  const card = new Card({ w, h, radius, color, shadow: 0 });
  if (glow) card.u.uBright!.value = 1 + glow;
  return card;
}

/* ------------------------------------------------ light and air ------------------------------------------------ */

function gradientTexture(draw: (ctx: CanvasRenderingContext2D, s: number) => void, s = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = s;
  draw(c.getContext('2d')!, s);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
export const softDot = gradientTexture((ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
});
const coneTex = gradientTexture((ctx, s) => {
  const img = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const v = y / s; // 0 at the lamp
    const half = 0.04 + v * 0.46;
    const u = Math.abs(x / s - 0.5) / half;
    const a = Math.max(0, 1 - u * u) * Math.pow(1 - v, 1.4);
    const i = (y * s + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
});

/** A glow: a soft additive disc. Values above 1 bloom. */
export function glow(size: number, color: string, strength = 1): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const m = new Mesh(unit, new MeshBasicMaterial({ map: softDot, transparent: true, depthWrite: false, blending: AdditiveBlending, color: new Color(color).multiplyScalar(strength) }));
  m.scale.set(size, size, 1);
  m.renderOrder = -5;
  return m;
}
/** A stage light: a cone of light hanging from a point, swung by its rotation. */
export function cone(length: number, color: string, strength = 0.5): Group {
  const g = new Group();
  const m = new Mesh(unit, new MeshBasicMaterial({ map: coneTex, transparent: true, depthWrite: false, blending: AdditiveBlending, color: new Color(color).multiplyScalar(strength) }));
  m.scale.set(length * 0.95, length, 1);
  m.position.y = -length / 2;
  m.renderOrder = -6;
  g.add(m);
  return g;
}

const BG_FS = /* glsl */ `
  uniform float uT, uWarm, uEnergy; varying vec2 vUv;
  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  void main(){
    vec2 p = vUv - 0.5; p.x *= 1.7778;
    vec3 top = vec3(0.004, 0.006, 0.030), low = vec3(0.016, 0.012, 0.070);
    vec3 c = mix(low, top, smoothstep(-0.45, 0.5, p.y));
    // Slow coloured weather: violet and blue, with gold when the scene is warm.
    float n1 = noise(p * 1.4 + vec2(uT * 0.05, -uT * 0.03)), n2 = noise(p * 2.3 - vec2(uT * 0.04, uT * 0.02) + 7.0);
    c += vec3(0.030, 0.018, 0.120) * smoothstep(0.30, 0.95, n1) * (0.6 + uEnergy * 1.1);
    c += vec3(0.006, 0.040, 0.105) * smoothstep(0.40, 1.0, n2) * (0.5 + uEnergy * 1.0);
    c += vec3(0.20, 0.10, 0.012) * uWarm * smoothstep(0.85, 0.0, length(p - vec2(0.0, -0.46)));
    gl_FragColor = vec4(c, 1.0);
  }`;

/** The air behind everything: a deep night with slow colour, far enough back to stay still when the camera moves. */
export class Backdrop extends Group {
  readonly sky: Mesh<PlaneGeometry, ShaderMaterial>;
  private dots: InstancedMesh;
  private seeds: number[][] = [];
  constructor(count = 110) {
    super();
    this.sky = new Mesh(unit, new ShaderMaterial({ uniforms: { uT: { value: 0 }, uWarm: { value: 0 }, uEnergy: { value: 0 } }, vertexShader: CARD_VS, fragmentShader: BG_FS, depthWrite: false }));
    this.sky.scale.set(W * 4.2, H * 4.2, 1);
    this.sky.position.z = -3600;
    this.sky.renderOrder = -100;
    this.add(this.sky);
    const r = rng(77);
    this.dots = new InstancedMesh(unit, new MeshBasicMaterial({ map: softDot, transparent: true, depthWrite: false, blending: AdditiveBlending }), count);
    this.dots.instanceMatrix.setUsage(DynamicDrawUsage);
    this.dots.renderOrder = -50;
    const col = new Color();
    const tones = ['#7c8cff', '#ffc233', '#5fe0d0', '#b68cff', '#ffffff'];
    for (let i = 0; i < count; i++) {
      this.seeds.push([r() * 2 - 1, r() * 2 - 1, r(), r(), r(), r()]);
      this.dots.setColorAt(i, col.set(tones[Math.floor(r() * tones.length)]!).multiplyScalar(0.25 + r() * 0.5));
    }
    this.add(this.dots);
  }
  update(T: number, warm = 0, energy = 0) {
    const u = this.sky.material.uniforms;
    u.uT!.value = T; u.uWarm!.value = warm; u.uEnergy!.value = energy;
    const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), p = new Vector3();
    this.seeds.forEach((d, i) => {
      const depth = -400 - d[2]! * 2400;
      const k = 1 - depth / CAM_Z;
      p.set(d[0]! * W * 0.62 * k + Math.sin(T * 0.11 + d[3]! * 9) * 40, (((d[1]! * 0.5 + 0.5 + T * (0.006 + d[4]! * 0.012)) % 1) * 2 - 1) * H * 0.6 * k, depth);
      const size = (10 + d[5]! * 46) * (0.8 + 0.2 * Math.sin(T * (0.7 + d[3]! * 1.3) + d[4]! * 20));
      s.set(size, size, 1);
      this.dots.setMatrixAt(i, m.compose(p, q, s));
    });
    this.dots.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------ confetti ------------------------------------------------ */

const PAPER = ['#ffc233', '#ff5d73', '#4dd6ff', '#7cf29a', '#b68cff', '#ffffff', '#ff9a3d'];

/** Paper thrown from a point: where each piece is depends only on the time since the throw. */
export class Confetti extends Group {
  private mesh: InstancedMesh;
  private bits: { v: Vector3; spin: Vector3; phase: number; size: number; delay: number; start: Vector3 }[] = [];
  constructor(count = 260, seed = 5, o: { spread?: number; power?: number; up?: number; width?: number; rain?: boolean } = {}) {
    super();
    const r = rng(seed);
    this.mesh = new InstancedMesh(unit, new MeshBasicMaterial({ side: DoubleSide, transparent: true, depthWrite: false, blending: NormalBlending }), count);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.renderOrder = 30;
    this.mesh.frustumCulled = false;
    const col = new Color();
    for (let i = 0; i < count; i++) {
      const a = (r() - 0.5) * (o.spread ?? 2.2) + Math.PI / 2;
      const power = (o.power ?? 1500) * (0.45 + r() * 0.75);
      const rain = o.rain === true;
      this.bits.push({
        v: rain ? new Vector3((r() - 0.5) * 160, -260 - r() * 240, (r() - 0.5) * 100) : new Vector3(Math.cos(a) * power, Math.sin(a) * power * (o.up ?? 1), (r() - 0.5) * 700),
        spin: new Vector3(r() * 9 + 2, r() * 9 + 2, r() * 6),
        phase: r() * 6.28, size: 12 + r() * 16, delay: rain ? r() * 2.6 : r() * 0.08,
        start: rain ? new Vector3((r() - 0.5) * (o.width ?? W * 1.2), H * 0.62 + r() * 200, (r() - 0.5) * 500) : new Vector3((r() - 0.5) * (o.width ?? 60), 0, 0),
      });
      this.mesh.setColorAt(i, col.set(PAPER[Math.floor(r() * PAPER.length)]!).multiplyScalar(1.05));
    }
    this.add(this.mesh);
    this.visible = false;
  }
  /** `t` seconds after the throw. Before it, nothing shows. */
  update(t: number, life = 4.2) {
    this.visible = t >= 0 && t < life;
    if (!this.visible) return;
    const m = new Matrix4(), q = new Quaternion(), e = new Euler(), s = new Vector3(), p = new Vector3();
    const fade = 1 - seg(t, life - 0.9, life);
    (this.mesh.material as MeshBasicMaterial).opacity = fade;
    this.bits.forEach((b, i) => {
      const u = Math.max(0, t - b.delay);
      // Thrown hard, slowed by the air, then falling and swaying.
      const drag = 1.9, k = (1 - Math.exp(-drag * u)) / drag;
      p.set(b.start.x + b.v.x * k + Math.sin(u * 2.3 + b.phase) * 28 * Math.min(1, u), b.start.y + b.v.y * k - 330 * u * u * 0.5 * Math.min(1, u * 1.2) - 90 * u, b.start.z + b.v.z * k);
      e.set(u * b.spin.x + b.phase, u * b.spin.y, u * b.spin.z + b.phase);
      q.setFromEuler(e);
      const z = u <= 0 ? 0 : 1;
      s.set(b.size * z, b.size * 0.55 * z, 1);
      this.mesh.setMatrixAt(i, m.compose(p, q, s));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A ring of light that opens from a point: the mark of a hit. */
export function ring(color = '#ffc233') {
  const mat = new ShaderMaterial({
    uniforms: { uP: { value: 0 }, uColor: { value: new Color(color) }, uOpacity: { value: 1 } },
    vertexShader: CARD_VS,
    fragmentShader: 'uniform float uP, uOpacity; uniform vec3 uColor; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float w = 0.035 + (1.0 - uP) * 0.05; float a = smoothstep(w, 0.0, abs(r - uP * 0.96)); gl_FragColor = vec4(uColor * 2.4, a * uOpacity); }',
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const m = new Mesh(unit, mat);
  m.renderOrder = 25;
  return m;
}

export function hide(o: Object3D) { o.visible = false; }
