import {
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  type WebGLRenderer,
} from 'three';
import { LabelLayer } from './labels.ts';
import { Particles } from './particles.ts';
import type { Quality } from './quality.ts';
import { disposeTree } from './toon.ts';

/*
 * The base of every 3D scene. A mode's scene extends World, builds its things
 * in the constructor, takes the latest game view in a method of its own, and
 * moves things along in `tick`. World gives it a camera, a sky, sun and fill
 * light, fog, DOM labels and particles, and frees everything on dispose.
 *
 * Scenes never decide anything about the game: they draw the view the server
 * sent, smoothing between updates.
 */

export interface StageEnv {
  quality: Quality;
  reducedMotion: boolean;
  /** HTML layer over the canvas (labels). */
  overlay: HTMLElement;
  renderer: WebGLRenderer;
}

export interface Lighting {
  /** Sky colour at the top of the dome. */
  skyTop: string;
  /** Sky colour at the horizon (and the fog). */
  horizon: string;
  /** Colour bounced up from the ground. */
  ground: string;
  /** Sun colour and strength. */
  sun: string;
  sunIntensity: number;
  /** Fill light from the sky. */
  fill: number;
  /** Where the sun comes from (a direction, not a position). */
  sunFrom?: [number, number, number];
  /** Fog start and end in metres; 0 for none. */
  fogNear?: number;
  fogFar?: number;
}

export const DAY: Lighting = { skyTop: '#5aa9ff', horizon: '#cfe8ff', ground: '#6a8f4e', sun: '#fff1d6', sunIntensity: 2.6, fill: 1.25, sunFrom: [6, 10, 4], fogNear: 40, fogFar: 140 };
export const DUSK: Lighting = { skyTop: '#2b2a6b', horizon: '#ff9f6e', ground: '#4a3a52', sun: '#ffc48a', sunIntensity: 2.1, fill: 1.0, sunFrom: [-8, 5, 3], fogNear: 30, fogFar: 120 };
export const NIGHT: Lighting = { skyTop: '#070b24', horizon: '#1d2a5c', ground: '#1a1530', sun: '#9fb6ff', sunIntensity: 1.1, fill: 0.9, sunFrom: [4, 10, -6], fogNear: 25, fogFar: 100 };

function skyDome(top: string, horizon: string, ground: string): Mesh {
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new Color(top) }, horizon: { value: new Color(horizon) }, bottom: { value: new Color(ground) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 1.6), 0.7)) : mix(horizon, bottom, min(1.0, -h * 4.0)); gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      }`,
  });
  const dome = new Mesh(new SphereGeometry(400, 24, 12), mat);
  dome.name = 'sky';
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  return dome;
}

export abstract class World {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly labels: LabelLayer;
  readonly fx: Particles;
  readonly sun: DirectionalLight;
  readonly fill: HemisphereLight;
  protected width = 1;
  protected height = 1;
  private sky: Mesh;

  constructor(
    readonly env: StageEnv,
    lighting: Lighting = DAY,
    fov = 50,
  ) {
    this.camera = new PerspectiveCamera(fov, 1, 0.1, 500);
    this.labels = new LabelLayer(env.overlay);
    this.fx = new Particles(env.quality.particles, env.reducedMotion);
    for (const o of this.fx.objects) this.scene.add(o);

    this.fill = new HemisphereLight(lighting.skyTop, lighting.ground, lighting.fill);
    this.scene.add(this.fill);
    this.sun = new DirectionalLight(lighting.sun, lighting.sunIntensity);
    const [x, y, z] = lighting.sunFrom ?? [6, 10, 4];
    this.sun.position.set(x, y, z);
    this.scene.add(this.sun, this.sun.target);
    this.sky = skyDome(lighting.skyTop, lighting.horizon, lighting.ground);
    this.scene.add(this.sky);
    if (lighting.fogFar) this.scene.fog = new Fog(lighting.horizon, lighting.fogNear ?? 30, lighting.fogFar);
    this.applyShadows(env.quality.shadows);
  }

  /**
   * Shadow maps on high quality. `size` is the half-width in metres of the
   * area the sun's shadow covers, centred on `focus` (keep it tight: sharper
   * and cheaper). Lower tiers rely on blob shadows, which scenes always draw.
   */
  protected shadowArea(size: number, focus: [number, number, number] = [0, 0, 0]) {
    const cam = this.sun.shadow.camera;
    cam.left = -size;
    cam.right = size;
    cam.top = size;
    cam.bottom = -size;
    cam.near = 0.5;
    cam.far = 80;
    cam.updateProjectionMatrix();
    const [fx, fy, fz] = focus;
    const dir = this.sun.position.clone().sub(this.sun.target.position).normalize();
    this.sun.target.position.set(fx, fy, fz);
    this.sun.position.set(fx, fy, fz).addScaledVector(dir, 30);
  }

  private applyShadows(on: boolean) {
    const r = this.env.renderer;
    r.shadowMap.enabled = on;
    r.shadowMap.type = PCFShadowMap;
    this.sun.castShadow = on;
    if (on) {
      this.sun.shadow.mapSize.set(1024, 1024);
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.02;
    }
  }

  /** The stage lowered the quality tier while running. */
  setQuality(q: Quality) {
    this.env.quality = q;
    this.applyShadows(q.shadows);
    this.scene.traverse((o) => {
      if (o instanceof Mesh && o.name === 'ink') o.visible = q.outlines;
    });
  }

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.fx.setViewHeight(h / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
  }

  /** Move things along. `dt` is seconds since the last frame (capped), `t` seconds since the scene began. */
  abstract tick(dt: number, t: number): void;

  /** Called by the stage each frame. */
  frame(dt: number, t: number) {
    this.tick(dt, t);
    this.fx.update(dt);
    this.sky.position.copy(this.camera.position);
  }

  /** Called by the stage after each render. */
  afterRender() {
    this.labels.update(this.camera, this.width, this.height);
  }

  /** Free the scene. Subclasses that hold their own resources call super.dispose(). */
  dispose() {
    this.labels.clear();
    this.fx.dispose();
    disposeTree(this.scene);
    this.scene.clear();
  }

  /** Match the background colour (for a canvas edge while resizing). */
  get background(): Color {
    return (this.scene.fog as Fog | null)?.color ?? new Color('#000');
  }
}
