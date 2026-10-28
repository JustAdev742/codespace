import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  IcosahedronGeometry,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import { CRATE_INFO, FLAGS, type ArenaMap, type CrateKind } from '@ludora/engine/glow-tag';
import { raycast } from '@ludora/engine/glow-tag-arena';
import { EaseCamera, FollowCamera, Glim3D, NIGHT, OrbitCamera, World, css, props, toon, type GlimLook, type StageEnv } from '../../../three/index.ts';
import type { Label } from '../../../three/labels.ts';
import type { Drawn, Field } from './glow-tag-field.ts';

/*
 * Glow Tag in 3D: a park at night. Hedges strung with fairy lights, stacks of
 * wooden boxes, climbing frames and slides, trees, lamp posts and a glowing
 * fence round the edge, all built from the map in the view. The safe ring is
 * a glowing wall that shrinks on the server's timetable, with the ground
 * outside it tinted and the next ring dashed on the grass. Players are their
 * Glims in a glowing band of their team's colour; beams are streaks of light.
 *
 * Scenes draw what `Field` holds (the server's views and pulses, and your own
 * predicted walking); they never decide anything. The park is shared by the
 * player's third-person scene and the big screen's overview.
 */

/* ------------------------------ shared pieces ----------------------------- */

const unitBox = new BoxGeometry(1, 1, 1);
const unitBall = new IcosahedronGeometry(1, 1);
const unitPost = new CylinderGeometry(1, 1, 1, 8);
const roofGeo = new ConeGeometry(0.72, 1, 4).rotateY(Math.PI / 4);
const lightGeo = new SphereGeometry(1, 6, 4);
const plane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const bandGeo = new TorusGeometry(1, 0.11, 6, 28).rotateX(Math.PI / 2);
const footRingGeo = new TorusGeometry(0.42, 0.035, 5, 32).rotateX(Math.PI / 2);
const bubbleGeo = new SphereGeometry(0.95, 20, 14);
const beamGeo = new CylinderGeometry(1, 1, 1, 6, 1, true);
const crateGeo = new BoxGeometry(0.72, 0.72, 0.72);
for (const g of [unitBox, unitBall, unitPost, roofGeo, lightGeo, plane, bandGeo, footRingGeo, bubbleGeo, beamGeo, crateGeo]) g.computeBoundingSphere();

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

const basicCache = new Map<string, MeshBasicMaterial>();
/** An unlit material: lights, glowing rims, beams. Cached by colour and opacity unless it will be faded. */
function lit(colour: string, opacity = 1, additive = false): MeshBasicMaterial {
  const key = `${colour}|${opacity}|${additive ? 1 : 0}`;
  let m = basicCache.get(key);
  if (!m) {
    m = new MeshBasicMaterial({ color: css(colour), transparent: opacity < 1 || additive, opacity, depthWrite: opacity >= 1 && !additive, blending: additive ? AdditiveBlending : NormalBlending });
    m.userData.cached = true;
    basicCache.set(key, m);
  }
  return m;
}

function sharedMesh(geometry: BufferGeometry, material: Material | Material[]): Mesh {
  const m = new Mesh(geometry, material);
  m.userData.sharedGeometry = true;
  return m;
}

function glowSprite(colour: string, size: number, opacity = 0.6): Sprite {
  const s = new Sprite(new SpriteMaterial({ map: glowTexture(), color: css(colour), transparent: true, depthWrite: false, blending: AdditiveBlending, opacity }));
  s.scale.set(size, size, 1);
  return s;
}

/** Many copies of one shape in one draw call: `parts` are [matrix, colour]. */
function many(geometry: BufferGeometry, material: Material, parts: [Matrix4, Color][], shadows: boolean): InstancedMesh | null {
  if (!parts.length) return null;
  const m = new InstancedMesh(geometry, material, parts.length);
  m.userData.sharedGeometry = true;
  parts.forEach(([mat, col], i) => {
    m.setMatrixAt(i, mat);
    m.setColorAt(i, col);
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = shadows;
  m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}

const q0 = new Quaternion();
const yAxis = new Vector3(0, 1, 0);
function at(x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY = 0, rotZ = 0): Matrix4 {
  const q = new Quaternion().setFromAxisAngle(yAxis, rotY);
  if (rotZ) q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), rotZ));
  return new Matrix4().compose(new Vector3(x, y, z), rotY || rotZ ? q : q0, new Vector3(sx, sy, sz));
}

export const CRATE_COLOUR: Record<CrateKind, string> = { charge: '#ffd25a', shield: '#5ad1ff', speed: '#5cf29a' };
const RING_COLOUR = '#ff5fa8';
/**
 * Metres outside the fence: how far the player's camera may go (everyone starts on the edge facing in, and
 * the camera sits about 7 metres behind them), and where the lamp posts and the outer trees stand, beyond it.
 */
const CAMERA_LIMIT = 5;
const LAMP_OUT = 6.5;
const TREES_OUT = 8;
/** How long a dimmed player takes to sink out of the arena, ms. */
const FADE_MS = 1200;

/* -------------------------------- the ring -------------------------------- */

function ringWall(): Mesh & { material: ShaderMaterial } {
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: css(RING_COLOUR) }, uTime: { value: 0 }, uOpacity: { value: 0.75 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uOpacity; varying vec2 vUv;
      void main(){ float fade = pow(1.0 - vUv.y, 1.7); float bands = 0.7 + 0.3 * sin(vUv.y * 22.0 - uTime * 2.2); gl_FragColor = vec4(uColor, fade * bands * uOpacity);
      #include <colorspace_fragment>
      }`,
  });
  const g = new CylinderGeometry(1, 1, 1, 128, 1, true).translate(0, 0.5, 0);
  const m = new Mesh(g, mat) as Mesh & { material: ShaderMaterial };
  m.frustumCulled = false;
  m.renderOrder = 2;
  return m;
}

/** The park's ground outside the ring, tinted, with a glowing edge and the next ring dashed on the grass. Only the arena is tinted, not the lawn beyond the fence. */
function ringGround(size: number): Mesh & { material: ShaderMaterial } {
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: { uRing: { value: new Vector3(0, 0, 100) }, uNext: { value: new Vector3(0, 0, -1) }, uTint: { value: 0.34 } },
    vertexShader: `varying vec2 vXZ; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uRing; uniform vec3 uNext; uniform float uTint; varying vec2 vXZ;
      void main(){
        float d = distance(vXZ, uRing.xy);
        float outside = smoothstep(uRing.z - 0.2, uRing.z + 0.2, d);
        float edge = exp(-pow((d - uRing.z) / 0.4, 2.0));
        vec3 col = mix(vec3(0.42, 0.04, 0.2), vec3(1.0, 0.5, 0.78), edge);
        float a = outside * uTint + edge * 0.6;
        if (uNext.z > 0.0) {
          float dn = distance(vXZ, uNext.xy);
          float line = 1.0 - smoothstep(0.03, 0.08, abs(dn - uNext.z));
          float ang = atan(vXZ.y - uNext.y, vXZ.x - uNext.x);
          float dash = step(0.0, sin(ang * uNext.z * 1.5708));
          float l = line * dash;
          a = max(a, l * 0.6);
          col = mix(col, vec3(1.0, 0.95, 0.85), l);
        }
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
  const m = new Mesh(plane, mat) as Mesh & { material: ShaderMaterial };
  m.userData.sharedGeometry = true;
  m.scale.set(size, 1, size);
  m.position.y = 0.025;
  m.renderOrder = 1;
  return m;
}

/* ---------------------------------- players ------------------------------- */

interface Avatar {
  glim: Glim3D;
  band: Mesh;
  foot: Mesh;
  bubble: Mesh;
  label: Label | null;
  colour: string;
  /** 'in': in the arena; 'fading': just dimmed; 'gone': out of the arena or hidden. */
  state: 'in' | 'fading' | 'gone';
  /** Game time the fade began, so it lasts the same on a slow device as on a fast one. */
  fadeAt: number;
  trailT: number;
  glow: number;
  labelText: string;
}

/** Fit a glowing band round a Glim's middle, once its body has been built. */
function fitBand(glim: Glim3D, band: Mesh) {
  const pos = glim.position.clone();
  const rot = glim.rotation.y;
  const scale = glim.scale.x;
  glim.position.set(0, 0, 0);
  glim.rotation.y = 0;
  glim.scale.setScalar(1);
  // Measure the body without the band itself.
  band.removeFromParent();
  glim.updateMatrixWorld(true);
  const box = new Box3().setFromObject(glim.body);
  glim.body.add(band);
  glim.position.copy(pos);
  glim.rotation.y = rot;
  glim.scale.setScalar(scale);
  if (box.isEmpty()) return;
  const w = box.max.x - box.min.x;
  const d = box.max.z - box.min.z;
  const h = box.max.y - box.min.y;
  band.scale.set(w / 2 + 0.035, 0.55, Math.max(0.12, d / 2 + 0.035));
  band.position.y = box.min.y + h * 0.42;
  band.visible = true;
}

/* ---------------------------------- beams --------------------------------- */

interface Beam {
  core: Mesh;
  halo: Mesh;
  life: number;
  t: number;
}

/* ---------------------------------- crates -------------------------------- */

interface CrateObj {
  group: Mesh;
  glow: Sprite;
  label: Label;
  kind: CrateKind;
  x: number;
  z: number;
  phase: number;
}

/* ----------------------------------- park --------------------------------- */

export interface ParkOptions {
  /** The big screen: everyone labelled, seen from above. */
  host: boolean;
  lightsOut: boolean;
}

/** The park and everything in it, shared by the player's scene and the big screen's. */
export abstract class Park extends World {
  protected readonly map: ArenaMap;
  protected readonly half: number;
  private avatars = new Map<string, Avatar>();
  private crates = new Map<number, CrateObj>();
  private seenBeams = new Set<number>();
  private beams: Beam[] = [];
  private wall: Mesh & { material: ShaderMaterial };
  private tint: Mesh & { material: ShaderMaterial };
  private stars: Points;
  private bubbleMat = lit('#6fdcff', 0.28, true);
  /** Glims are drawn a little big, and bigger on the big screen, so players stand out from the cover. */
  private readonly glimScale: number;

  constructor(
    env: StageEnv,
    protected readonly field: Field,
    protected readonly looks: (id: string) => GlimLook,
    protected readonly o: ParkOptions,
  ) {
    super(env, o.lightsOut ? { ...NIGHT, sunIntensity: 0.45, fill: 0.35, fogNear: o.host ? 60 : 5, fogFar: o.host ? 200 : 24 } : { ...NIGHT, fogNear: o.host ? 80 : 30, fogFar: o.host ? 240 : 110 });
    this.map = field.map;
    this.half = this.map.size / 2;
    this.glimScale = o.host ? 1.9 : 1.35;
    this.buildPark();
    this.wall = ringWall();
    this.tint = ringGround(this.map.size);
    this.scene.add(this.wall, this.tint);
    this.stars = this.starField();
    this.scene.add(this.stars);
    if (o.lightsOut && this.scene.fog instanceof Fog) this.scene.fog.color.set('#05060f');
  }

  /* -------------------------------- building -------------------------------- */

  private buildPark() {
    const { size, boxes, trees } = this.map;
    const half = size / 2;
    const q = this.env.quality;
    const ink = q.outlines;
    const shadows = q.shadows;
    // Ground: dark lawn outside, the arena's lawn, and paths along the open lanes and round the edge.
    const outside = props.ground(size + 120, size + 120, '#2a5a3c');
    this.scene.add(outside);
    const lawn = props.ground(size, size, '#4c9a5c');
    lawn.position.y = 0.004;
    this.scene.add(lawn);
    const path = toon('#8a83a3');
    const strips: [number, number, number, number][] = [
      [0, 0, 5, size],
      [0, 0, size, 5],
      [0, half - 2.5, size, 4],
      [0, -half + 2.5, size, 4],
      [half - 2.5, 0, 4, size],
      [-half + 2.5, 0, 4, size],
    ];
    strips.forEach(([x, z, w, d], i) => {
      const s = sharedMesh(plane, path);
      s.scale.set(w, 1, d);
      s.position.set(x, 0.008 + i * 0.0005, z);
      s.receiveShadow = true;
      this.scene.add(s);
    });

    // Cover, a few draw calls for the whole park.
    const hedgeBody: [Matrix4, Color][] = [];
    const hedgeTop: [Matrix4, Color][] = [];
    const fairy: [Matrix4, Color][] = [];
    const wood: [Matrix4, Color][] = [];
    const paint: [Matrix4, Color][] = [];
    const posts: [Matrix4, Color][] = [];
    const roofs: [Matrix4, Color][] = [];
    const lamps: [Matrix4, Color][] = [];
    const trunks: [Matrix4, Color][] = [];
    const leaves: [Matrix4, Color][] = [];
    const fairyCols = ['#fff1c4', '#ffb8e1', '#9fe8ff', '#ffe08a'].map((c) => css(c));
    const rnd = props.seeded(size * 7 + boxes.length);
    for (const [kind, x, z, w, d] of boxes) {
      const long = Math.max(w, d);
      const alongX = w >= d;
      if (kind === 0) {
        // A hedge: a clipped body with round bushes along the top, strung with fairy lights.
        hedgeBody.push([at(x, 0.5, z, w, 1, d), css('#3b9a56')]);
        const n = Math.max(2, Math.round(long / 0.75));
        const r = Math.min(w, d) * 0.62;
        for (let i = 0; i < n; i++) {
          const u = -long / 2 + (long / n) * (i + 0.5);
          const bx = alongX ? x + u : x;
          const bz = alongX ? z : z + u;
          hedgeTop.push([at(bx, 1.0, bz, r, r * 0.7, r), css(i % 2 ? '#4fb468' : '#46a85f')]);
        }
        const lights = Math.max(3, Math.round(long / 0.55));
        for (let i = 0; i <= lights; i++) {
          const u = -long / 2 + (long / lights) * i;
          for (const side of [-1, 1]) {
            const off = (alongX ? d : w) / 2 + 0.03;
            const lx = alongX ? x + u : x + side * off;
            const lz = alongX ? z + side * off : z + u;
            fairy.push([at(lx, 0.82 + ((i % 2) * 0.12), lz, 0.055, 0.055, 0.055), fairyCols[(i + (side > 0 ? 1 : 0)) % fairyCols.length]!]);
          }
        }
      } else if (kind === 1) {
        // A stack of wooden boxes, with a little lamp on top.
        wood.push([at(x, 0.55, z, w, 1.1, d), css(rnd() < 0.5 ? '#b9783f' : '#a86b36')]);
        const tw = w * 0.55;
        const td = d * 0.6;
        const ox = alongX ? w * 0.18 : 0;
        const oz = alongX ? 0 : d * 0.18;
        wood.push([at(x + ox, 1.45, z + oz, tw, 0.7, td), css('#cf9150')]);
        wood.push([at(x, 0.9, z, w * 1.02, 0.08, d * 1.02), css('#6e4321')]);
        lamps.push([at(x + ox, 1.92, z + oz, 0.14, 0.14, 0.14), css('#ffe2a0')]);
      } else if (kind === 2) {
        // A climbing frame: four posts, a deck and a pointed roof.
        const colour = css(rnd() < 0.5 ? '#e5484d' : '#3d9bff');
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) posts.push([at(x + sx * (w / 2 - 0.12), 1.1, z + sz * (d / 2 - 0.12), 0.09, 2.2, 0.09), colour]);
        paint.push([at(x, 1.1, z, w * 0.94, 0.16, d * 0.94), css('#ffc233')]);
        paint.push([at(x, 0.35, z, w * 0.9, 0.1, 0.1, 0), css('#f4f0e0')]);
        roofs.push([at(x, 2.55, z, w * 0.98, 0.8, d * 0.98), css('#ffc233')]);
        lamps.push([at(x, 3.0, z, 0.13, 0.13, 0.13), css('#fff1c4')]);
      } else {
        // A slide: a little tower and a ramp down the long side.
        const towerLen = 1.2;
        const tx = alongX ? x - long / 2 + towerLen / 2 : x;
        const tz = alongX ? z : z - long / 2 + towerLen / 2;
        paint.push([at(tx, 0.9, tz, alongX ? towerLen : w, 1.8, alongX ? d : towerLen), css('#c86bff')]);
        const rampLen = long - towerLen;
        const drop = 1.55;
        const slope = Math.atan2(drop, rampLen);
        const len = Math.hypot(rampLen, drop);
        const mx = alongX ? x + towerLen / 2 : x;
        const mz = alongX ? z : z + towerLen / 2;
        const short = Math.min(w, d) * 0.72;
        // Lay the ramp along the long axis, sloping down away from the tower.
        if (alongX) paint.push([at(mx, 0.2 + drop / 2, mz, len, 0.12, short, 0, -slope), css('#ffc233')]);
        else paint.push([at(mx, 0.2 + drop / 2, mz, len, 0.12, short, -Math.PI / 2, -slope), css('#ffc233')]);
        lamps.push([at(tx, 1.95, tz, 0.13, 0.13, 0.13), css('#ffe2a0')]);
      }
    }
    // Trees in the park, and a ring of them outside the fence.
    const treeList: [number, number, number][] = [...trees];
    const far = props.seeded(size * 3 + 1);
    const ringN = Math.round(size / 2.2);
    for (let i = 0; i < ringN; i++) {
      // A spot round a square band outside the lamp posts, so no tree stands in the park or in front of the camera.
      const u = ((i + far() * 0.6) / ringN) * 4;
      const side = Math.floor(u);
      const t = (u - side) * 2 - 1;
      const d = half + TREES_OUT + far() * 9;
      const along = t * d;
      const [x, z] = side === 0 ? [along, -d] : side === 1 ? [d, along] : side === 2 ? [-along, d] : [-d, -along];
      treeList.push([x, z, 0.7 + far() * 0.6]);
    }
    for (const [x, z, r] of treeList) {
      trunks.push([at(x, 0.8, z, r * 0.32, 1.6, r * 0.32), css('#6b4a2e')]);
      const g = 0.75 + far() * 0.25;
      leaves.push([at(x, 1.5 + r * 0.9, z, r * 1.3, r * 1.15, r * 1.3), new Color().setHSL(0.36, 0.45, 0.28 * g + 0.04)]);
      leaves.push([at(x + r * 0.35, 2.0 + r * 1.0, z - r * 0.2, r * 0.75, r * 0.7, r * 0.75), new Color().setHSL(0.34, 0.5, 0.36 * g)]);
    }
    for (const m of [
      many(unitBox, toon('#ffffff'), hedgeBody, shadows),
      many(unitBall, toon('#ffffff'), hedgeTop, shadows),
      many(lightGeo, lit('#ffffff'), fairy, false),
      many(unitBox, toon('#ffffff'), wood, shadows),
      many(unitBox, toon('#ffffff'), paint, shadows),
      many(unitPost, toon('#ffffff'), posts, shadows),
      many(roofGeo, toon('#ffffff'), roofs, shadows),
      many(lightGeo, lit('#ffffff'), lamps, false),
      many(unitPost, toon('#ffffff'), trunks, shadows),
      many(unitBall, toon('#ffffff'), leaves, shadows),
    ]) {
      if (m) this.scene.add(m);
    }
    // Soft glows over the box-stack and climbing-frame lamps.
    for (const [m] of lamps) {
      const p = new Vector3().setFromMatrixPosition(m);
      const g = glowSprite('#ffd27a', 2.2, 0.45);
      g.position.copy(p);
      this.scene.add(g);
    }

    // The edge: a low fence with a glowing rail, and lamp posts at the corners and halfway along.
    const fence: [Matrix4, Color][] = [];
    const n = Math.round(size / 2.5);
    for (let i = 0; i < n; i++) {
      const u = -half + (size / n) * i;
      for (const [x, z] of [
        [u, -half],
        [half, u],
        [-u, half],
        [-half, -u],
      ] as const)
        fence.push([at(x, 0.45, z, 0.07, 0.9, 0.07), css('#3a3456')]);
    }
    const fenceMesh = many(unitPost, toon('#ffffff'), fence, shadows);
    if (fenceMesh) this.scene.add(fenceMesh);
    for (const [x, z, w, d] of [
      [0, -half, size, 0.08],
      [0, half, size, 0.08],
      [-half, 0, 0.08, size],
      [half, 0, 0.08, size],
    ] as const) {
      const rail = sharedMesh(unitBox, lit('#7fe3ff', 0.85));
      rail.scale.set(w, 0.07, d);
      rail.position.set(x, 0.86, z);
      this.scene.add(rail);
    }
    // Lamp posts stand outside the fence, beyond where the player's camera goes (see GlowTagScene).
    const out = half + LAMP_OUT;
    for (const [x, z] of [
      [-out, -out],
      [out, -out],
      [out, out],
      [-out, out],
      [0, -out],
      [out, 0],
      [0, out],
      [-out, 0],
    ] as const) {
      const lamp = props.lampPost({ ink, height: 3.2, hue: 44 });
      lamp.position.set(x, 0, z);
      this.scene.add(lamp);
      const g = glowSprite('#ffcf7a', 4.5, 0.5);
      g.position.set(x, 3.4, z);
      this.scene.add(g);
    }
    // A moon.
    const moon = sharedMesh(lightGeo, lit('#f3efe0'));
    moon.scale.setScalar(9);
    moon.position.set(-140, 110, -190);
    this.scene.add(moon);
    const moonGlow = glowSprite('#cfd8ff', 60, 0.35);
    moonGlow.position.copy(moon.position);
    this.scene.add(moonGlow);
  }

  private starField(): Points {
    const rnd = props.seeded(404);
    const pos: number[] = [];
    for (let i = 0; i < 320; i++) {
      const a = rnd() * Math.PI * 2;
      const y = 0.15 + rnd() * 0.85;
      const r = Math.sqrt(1 - y * y);
      pos.push(Math.cos(a) * r * 300, y * 300, Math.sin(a) * r * 300);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const p = new Points(g, new PointsMaterial({ color: '#dfe6ff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
    p.frustumCulled = false;
    p.renderOrder = -9;
    return p;
  }

  /* -------------------------------- each frame ------------------------------- */

  protected tickPark(dt: number, t: number) {
    const now = this.field.now();
    this.updateRing(t, now);
    this.updatePlayers(dt, t, now);
    this.updateCrates(dt, t);
    this.updateBeams(dt, now);
    this.stars.position.copy(this.camera.position);
  }

  private updateRing(t: number, now: number) {
    const ring = this.field.ring(now);
    if (!ring) {
      this.wall.visible = false;
      return;
    }
    const { cur, next } = ring;
    this.wall.visible = true;
    this.wall.position.set(cur.x, 0, cur.z);
    this.wall.scale.set(cur.r, this.o.host ? 4 : 3.2, cur.r);
    this.wall.material.uniforms.uTime!.value = this.env.reducedMotion ? 0 : t;
    this.tint.material.uniforms.uRing!.value.set(cur.x, cur.z, cur.r);
    this.tint.material.uniforms.uNext!.value.set(next?.x ?? 0, next?.z ?? 0, next ? next.r : -1);
  }

  private makeAvatar(p: Drawn): Avatar {
    const q = this.env.quality;
    const glim = new Glim3D({ look: this.looks(p.id), quality: q, reducedMotion: this.env.reducedMotion });
    glim.scale.setScalar(this.glimScale);
    const band = sharedMesh(bandGeo, toon(p.colour, { glow: 0.9 }));
    band.visible = false;
    glim.body.add(band);
    void glim.ready.then(() => fitBand(glim, band));
    const foot = sharedMesh(footRingGeo, lit(p.colour, 0.9));
    foot.position.y = 0.03;
    glim.add(foot);
    const bubble = sharedMesh(bubbleGeo, this.bubbleMat);
    bubble.position.y = 0.55;
    bubble.visible = false;
    glim.add(bubble);
    glim.position.set(p.x, 0, p.z);
    // Hidden until the first frame that shows them in the arena: someone already dimmed when the scene is built stays out.
    glim.visible = false;
    this.scene.add(glim);
    // Big-screen tags are full size, until a crowded park would bury it in them.
    const hostClass = this.field.players().length > 16 ? 'small' : '';
    const label = this.labels.add(glim, p.me ? 'You' : p.name, { offsetY: this.o.host ? 2.1 : 1.55, className: p.me ? 'me small' : this.o.host ? hostClass : 'small', maxDistance: this.o.host ? 400 : 34 });
    return { glim, band, foot, bubble, label, colour: p.colour, state: 'gone', fadeAt: 0, trailT: 0, glow: -1, labelText: '' };
  }

  private updatePlayers(dt: number, t: number, now: number) {
    const drawn = this.field.players(now);
    const ids = new Set<string>();
    const max = this.field.maxGlow;
    const calm = this.env.reducedMotion;
    for (const p of drawn) {
      ids.add(p.id);
      let a = this.avatars.get(p.id);
      if (!a) {
        a = this.makeAvatar(p);
        this.avatars.set(p.id, a);
      }
      const g = a.glim;
      if (a.colour !== p.colour) {
        a.colour = p.colour;
        a.band.material = toon(p.colour, { glow: 0.9 });
        a.foot.material = lit(p.colour, 0.9);
      }
      if (p.visible) {
        if (a.state !== 'in') {
          // Back in the arena (relit, or seen again): appear where they are.
          if (a.state === 'gone' && p.in && a.glow === 0) this.fx.burst(new Vector3(p.x, 0.8, p.z), { color: [p.colour, '#ffffff'], shape: 'star', glow: true, count: 26, speed: 3 });
          a.state = 'in';
          g.visible = true;
          g.setDim(false);
          g.position.y = 0;
          g.scale.setScalar(this.glimScale);
        }
        g.position.x = p.x;
        g.position.z = p.z;
        g.rotation.y = p.h;
        g.setMoving(p.speed > 0.3 ? Math.min(6, p.speed) : 0);
        const safe = Boolean(p.f & FLAGS.safe);
        g.body.visible = !(safe && !calm && Math.floor(t * 12) % 2 === 0);
        a.bubble.visible = Boolean(p.f & FLAGS.shield);
        a.foot.material = safe ? lit('#ffffff', 0.9) : lit(p.colour, 0.35 + 0.15 * Math.min(3, p.glow));
        if (p.f & FLAGS.speed && p.speed > 0.5) {
          a.trailT -= dt;
          if (a.trailT <= 0) {
            a.trailT = calm ? 0.4 : 0.12;
            this.fx.burst(new Vector3(p.x - Math.sin(p.h) * 0.5, 0.25, p.z - Math.cos(p.h) * 0.5), { color: CRATE_COLOUR.speed, shape: 'spark', glow: true, count: 3, speed: 0.6, gravity: 0, life: 0.4, size: 0.18 });
          }
        }
      } else if (a.state === 'in') {
        if (!p.in) {
          // Dimmed: greyed out, sinking out of the arena.
          a.state = 'fading';
          a.fadeAt = now;
          g.play('hit');
          g.setDim(true);
          a.bubble.visible = false;
          g.body.visible = true;
        } else {
          a.state = 'gone';
          g.visible = false;
        }
      }
      if (a.state === 'fading') {
        const k = Math.min(1, Math.max(0, now - a.fadeAt) / FADE_MS);
        g.position.y = -k * 0.9;
        g.scale.setScalar(this.glimScale * (1 - k * 0.4));
        if (k >= 1) {
          a.state = 'gone';
          g.visible = false;
        }
      }
      if (a.glow !== p.glow || a.labelText === '') {
        a.glow = p.glow;
        const pips = `${'●'.repeat(Math.max(0, Math.min(max, p.glow)))}${'○'.repeat(Math.max(0, max - p.glow))}`;
        a.labelText = `${p.me ? 'You' : p.name} ${pips}`;
        a.label?.set(a.labelText);
      }
      g.update(dt);
    }
    for (const [id, a] of this.avatars) {
      if (ids.has(id)) continue;
      this.labels.remove(a.label);
      a.glim.dispose();
      this.avatars.delete(id);
    }
  }

  private updateCrates(dt: number, t: number) {
    const list = this.field.crates();
    const ids = new Set(list.map((c) => c.id));
    for (const [id, c] of this.crates) {
      if (ids.has(id)) continue;
      // Picked up (or gone): a puff of its colour.
      this.fx.burst(new Vector3(c.x, 0.6, c.z), { color: [CRATE_COLOUR[c.kind], '#ffffff'], shape: 'star', glow: true, count: 18, speed: 2.5 });
      this.labels.remove(c.label);
      c.group.removeFromParent();
      c.glow.removeFromParent();
      c.glow.material.dispose();
      this.crates.delete(id);
    }
    for (const c of list) {
      let obj = this.crates.get(c.id);
      if (!obj) {
        const box = sharedMesh(crateGeo, toon(CRATE_COLOUR[c.kind], { glow: 0.55 }));
        box.castShadow = this.env.quality.shadows;
        const glow = glowSprite(CRATE_COLOUR[c.kind], 2.4, 0.55);
        glow.position.set(c.x, 0.55, c.z);
        box.position.set(c.x, 0.5, c.z);
        this.scene.add(box, glow);
        const label = this.labels.add(box, CRATE_INFO[c.kind].label, { offsetY: 0.75, className: 'small', maxDistance: this.o.host ? 0 : 16 });
        obj = { group: box, glow, label, kind: c.kind, x: c.x, z: c.z, phase: c.id * 1.7 };
        this.crates.set(c.id, obj);
      }
      if (!this.env.reducedMotion) {
        obj.group.position.y = 0.5 + Math.sin(t * 2.2 + obj.phase) * 0.09;
        obj.group.rotation.y += dt * 0.8;
      }
    }
  }

  private spawnBeam(x1: number, z1: number, x2: number, z2: number, colour: string) {
    let b = this.beams.find((s) => s.t >= s.life);
    if (!b) {
      if (this.beams.length >= 12) b = this.beams[0]!;
      else {
        const core = sharedMesh(beamGeo, new MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: AdditiveBlending }));
        const halo = sharedMesh(beamGeo, new MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.5 }));
        core.frustumCulled = false;
        halo.frustumCulled = false;
        this.scene.add(core, halo);
        b = { core, halo, life: 0.42, t: 0 };
        this.beams.push(b);
      }
    }
    const from = new Vector3(x1, 0.75, z1);
    const to = new Vector3(x2, 0.75, z2);
    const len = Math.max(0.1, from.distanceTo(to));
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const dir = to.clone().sub(from).normalize();
    const quat = new Quaternion().setFromUnitVectors(yAxis, dir);
    for (const [m, r] of [
      [b.core, 0.045],
      [b.halo, 0.17],
    ] as const) {
      m.position.copy(mid);
      m.quaternion.copy(quat);
      m.scale.set(r, len, r);
      m.visible = true;
    }
    (b.halo.material as MeshBasicMaterial).color.copy(css(colour));
    (b.core.material as MeshBasicMaterial).color.copy(css(colour)).lerp(new Color('#ffffff'), 0.65);
    b.t = 0;
  }

  private updateBeams(dt: number, now: number) {
    const drawn = new Map(this.field.players(now).map((p) => [p.id, p]));
    for (const beam of this.field.beams()) {
      if (this.seenBeams.has(beam.n)) continue;
      this.seenBeams.add(beam.n);
      if (now - beam.at > 700) continue;
      const by = drawn.get(beam.by);
      const colour = by?.colour ?? '#ffffff';
      const tagger = this.avatars.get(beam.by);
      tagger?.glim.play('cast');
      this.spawnBeam(beam.x1, beam.z1, beam.x2, beam.z2, colour);
      const end = new Vector3(beam.x2, 0.8, beam.z2);
      if (beam.outcome === 'hit' || beam.outcome === 'dimmed') {
        this.fx.burst(end, { color: [colour, '#ffffff'], shape: 'star', glow: true, count: beam.outcome === 'dimmed' ? 44 : 22, speed: beam.outcome === 'dimmed' ? 4.5 : 3 });
        const target = this.avatars.get(beam.to);
        if (target && beam.outcome === 'hit') target.glim.play('hit');
      } else if (beam.outcome === 'shield') {
        this.fx.burst(end, { color: ['#6fdcff', '#ffffff'], shape: 'spark', glow: true, count: 26, speed: 3.5 });
        const target = this.avatars.get(beam.to);
        if (target) {
          target.bubble.visible = true;
          target.bubble.scale.setScalar(1.35);
        }
      } else this.fx.burst(end, { color: [colour], shape: 'dot', glow: true, count: 8, speed: 1.2, gravity: 0.5 });
    }
    if (this.seenBeams.size > 200) this.seenBeams = new Set([...this.seenBeams].slice(-60));
    for (const b of this.beams) {
      if (b.t >= b.life) continue;
      b.t += dt;
      const k = Math.max(0, 1 - b.t / b.life);
      (b.core.material as MeshBasicMaterial).opacity = k;
      (b.halo.material as MeshBasicMaterial).opacity = k * 0.55;
      if (b.t >= b.life) {
        b.core.visible = false;
        b.halo.visible = false;
      }
    }
    for (const a of this.avatars.values()) {
      if (a.bubble.scale.x > 1) a.bubble.scale.setScalar(Math.max(1, a.bubble.scale.x - dt * 1.2));
    }
  }

  override dispose() {
    for (const a of this.avatars.values()) a.glim.dispose();
    this.avatars.clear();
    for (const b of this.beams) {
      (b.core.material as Material).dispose();
      (b.halo.material as Material).dispose();
    }
    // Sprites are not meshes, so the base class leaves their materials.
    this.scene.traverse((o) => {
      if (o instanceof Sprite) o.material.dispose();
    });
    this.wall.geometry.dispose();
    this.wall.material.dispose();
    this.tint.material.dispose();
    (this.stars.material as Material).dispose();
    this.stars.geometry.dispose();
    super.dispose();
  }
}

/* -------------------------------- the player ------------------------------- */

/** Your view: third person behind your Glim, or high over the ring while you are dimmed. */
export class GlowTagScene extends Park {
  private follow: FollowCamera;
  private overview: EaseCamera;
  private shadowFocus = new Vector3(1e9, 0, 0);
  private me = new Vector3();
  /** Cover tall enough to hide you from the camera (climbing frames, slides and trees), for pulling the camera in. */
  private tall: ArenaMap;

  constructor(env: StageEnv, field: Field, looks: (id: string) => GlimLook, lightsOut: boolean) {
    super(env, field, looks, { host: false, lightsOut });
    this.follow = new FollowCamera(this.camera, env.reducedMotion);
    this.overview = new EaseCamera(this.camera, env.reducedMotion);
    this.tall = { size: this.map.size, boxes: this.map.boxes.filter(([k]) => k >= 2), trees: this.map.trees };
  }

  override tick(dt: number, t: number) {
    this.tickPark(dt, t);
    const you = this.field.players().find((p) => p.me);
    const narrow = this.camera.aspect < 0.85;
    if (you?.in) {
      this.me.set(you.x, 0, you.z);
      // Behind you, but never out past the lamp posts: at the edge the camera comes in closer and looks down more.
      const want = narrow ? 8.2 : 6.8;
      const dist = Math.max(3.2, Math.min(want, this.roomBehind(you.x, you.z, you.h)));
      this.follow.distance = dist;
      this.follow.height = (narrow ? 5.2 : 4.1) + (want - dist) * 0.25;
      this.follow.follow(this.me, you.h);
      this.follow.update(dt);
    } else {
      // Dimmed or watching: look down on the ring from above.
      const ring = this.field.ring()?.cur ?? { x: 0, z: 0, r: this.half };
      const lift = Math.max(14, Math.min(this.half * 1.6, ring.r * 1.7)) * (narrow ? 1.4 : 1);
      this.overview.set([ring.x, lift, ring.z + lift * 0.75], [ring.x, 0, ring.z]);
      this.overview.update(dt);
      this.me.set(ring.x, 0, ring.z);
    }
    if (this.env.quality.shadows && this.me.distanceTo(this.shadowFocus) > 4) {
      this.shadowFocus.copy(this.me);
      this.shadowArea(16, [this.me.x, 0, this.me.z]);
    }
  }

  /**
   * How far the camera can go straight behind (x, z), facing h: up to its limit outside the fence, and
   * short of any tall cover behind you (low hedges and box stacks stay under the camera's line).
   */
  private roomBehind(x: number, z: number, h: number): number {
    const lim = this.half + CAMERA_LIMIT;
    const bx = -Math.sin(h);
    const bz = -Math.cos(h);
    let room = raycast(this.tall, x, z, bx, bz, 20) - 0.5;
    if (Math.abs(bx) > 1e-6) room = Math.min(room, (Math.sign(bx) * lim - x) / bx);
    if (Math.abs(bz) > 1e-6) room = Math.min(room, (Math.sign(bz) * lim - z) / bz);
    return room;
  }
}

/* ------------------------------- the big screen ----------------------------- */

/** The whole park from above at an angle, turning slowly (still under reduced motion). */
export class GlowTagHostScene extends Park {
  private orbit: OrbitCamera;
  /** The fence's corners (and the tops of the corner lamps), which the camera keeps in view. */
  private corners: Vector3[];
  private dir = new Vector3();
  private right = new Vector3();
  private up = new Vector3();

  constructor(env: StageEnv, field: Field, looks: (id: string) => GlimLook, lightsOut: boolean) {
    super(env, field, looks, { host: true, lightsOut });
    this.orbit = new OrbitCamera(this.camera, env.reducedMotion);
    this.orbit.speed = 0.025;
    this.orbit.angle = 0.35;
    this.shadowArea(this.half * 1.1);
    const c = this.half + 0.5;
    this.corners = [-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [new Vector3(sx * c, 0, sz * c), new Vector3(sx * c, 2.5, sz * c)]));
  }

  override tick(dt: number, t: number) {
    this.tickPark(dt, t);
    // Back off until every corner of the park fits, for this angle and this screen's shape.
    const pitch = 0.92; // radians above the horizon
    this.dir.set(Math.sin(this.orbit.angle) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.orbit.angle) * Math.cos(pitch));
    this.right.set(Math.cos(this.orbit.angle), 0, -Math.sin(this.orbit.angle));
    this.up.crossVectors(this.dir, this.right).normalize();
    const tanV = Math.tan((this.camera.fov * Math.PI) / 360) * 0.94;
    const tanH = tanV * this.camera.aspect;
    let dist = this.half;
    for (const p of this.corners) {
      const depth = p.dot(this.dir);
      dist = Math.max(dist, depth + Math.abs(p.dot(this.right)) / tanH, depth + Math.abs(p.dot(this.up)) / tanV);
    }
    this.orbit.radius = dist * Math.cos(pitch);
    this.orbit.height = dist * Math.sin(pitch);
    this.orbit.update(dt);
  }
}
