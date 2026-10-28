import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type Fog,
} from 'three';
import { EaseCamera, Glim3D, OrbitCamera, World, hsl, props, toon, type GlimLook, type Lighting, type StageEnv } from '../../../three/index.ts';
import type { Label } from '../../../three/labels.ts';

/*
 * Code Breakers in 3D: a night-time data city. Every player is a tower whose
 * height follows their bits, with a roof in their own colour and windows that
 * light up as they get richer. A firewall is a shimmering dome over the
 * tower, 2FA a ring orbiting it, and in Heist the vault is a big locked cube
 * in the middle. Hacks fly between towers as glowing packets on an arc and
 * land with a green burst (cracked), a shield flash (firewall), a violet
 * ring (2FA) or a red fizzle (wrong guess).
 *
 * The player's scene puts their Glim at a desk of screens in front of their
 * own tower; the big screen orbits the whole skyline. Towers, their windows
 * and the far-off skyline are instanced (one shader draws every window), so a
 * city of sixty towers costs a handful of draw calls. Scenes only draw what
 * the view said happened.
 */

export type PacketOutcome = 'stolen' | 'firewall' | 'twoFactor' | 'wrong';
export type CityEvent = 'storm' | 'bounty' | 'glitch';

export interface CityTower {
  playerId: string;
  name: string;
  bits: number;
  firewall: number;
  twoFactor: boolean;
  /** The player's colour (hue in degrees): their roof and highlights. */
  hue: number;
  me?: boolean;
}

export interface CityPacket {
  id: string;
  from: string;
  to: string;
  outcome: PacketOutcome;
  bits: number;
}

export interface CityState {
  towers: CityTower[];
  vault: { bits: number; cracks: number } | null;
  event: CityEvent | null;
  bounty: string[] | null;
  /** Recent hacks, newest first. The scene flies the ones it has not seen. */
  packets: CityPacket[];
}

/** How long a packet takes to fly between towers. Screens hold an outcome's words back this long. */
export const PACKET_FLIGHT_MS = 1100;
export const VAULT_ID = '#vault';

const CITY: Lighting = { skyTop: '#050824', horizon: '#1a2563', ground: '#0a0f2e', sun: '#b4c4ff', sunIntensity: 1.3, fill: 1.1, sunFrom: [5, 12, 9], fogNear: 30, fogFar: 125 };
const SKIES: Record<'calm' | CityEvent, { top: string; horizon: string }> = {
  calm: { top: '#050824', horizon: '#1a2563' },
  storm: { top: '#02182a', horizon: '#0d6577' },
  bounty: { top: '#170e03', horizon: '#734913' },
  glitch: { top: '#13052b', horizon: '#561f86' },
};

const OUTCOME_COLOUR: Record<PacketOutcome, string[]> = {
  stolen: ['#1fd38f', '#b8ffe0'],
  firewall: ['#5fd0ff', '#d6f4ff'],
  twoFactor: ['#a98bff', '#e3d9ff'],
  wrong: ['#ff4d6a', '#ffb3c0'],
};

const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');

/* --------------------------------- shared bits -------------------------------- */

let glowTex: CanvasTexture | null = null;
function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new CanvasTexture(c);
  glowTex.userData.shared = true;
  return glowTex;
}

let gridTex: CanvasTexture | null = null;
/** City streets seen from above: a dark grid with soft blue lines. */
function gridTexture(): CanvasTexture {
  if (gridTex) return gridTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0b1234';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(70,120,255,0.32)';
  g.fillRect(0, 0, 128, 3);
  g.fillRect(0, 0, 3, 128);
  g.fillStyle = 'rgba(70,120,255,0.12)';
  g.fillRect(0, 64, 128, 1);
  g.fillRect(64, 0, 1, 128);
  gridTex = new CanvasTexture(c);
  gridTex.wrapS = gridTex.wrapT = RepeatWrapping;
  gridTex.colorSpace = SRGBColorSpace;
  gridTex.anisotropy = 4;
  gridTex.userData.shared = true;
  return gridTex;
}

function glowSprite(colour: string, size: number, opacity = 0.7): Sprite {
  const s = new Sprite(new SpriteMaterial({ map: glowTexture(), color: colour, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity }));
  s.scale.set(size, size, 1);
  return s;
}

/** Towers have their base at y = 0 and are one metre on a side before scaling. */
function unitTower(): BoxGeometry {
  return new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
}

/*
 * One material draws every tower and every window. Walls get a little fake
 * light by facing (the city is lit by its windows, not the moon), windows are
 * a grid in metres on each face, lit at random up to the tower's lit share,
 * and the roof glows in the owner's colour.
 */
function towerMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    fog: true,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uGlitch: { value: 0 },
        uBoost: { value: 0 },
        uWall: { value: new Color('#1c2557') },
        uWarm: { value: new Color('#ffe2a6') },
      },
    ]),
    vertexShader: `
      #include <fog_pars_vertex>
      attribute float aSeed;
      attribute float aLit;
      attribute float aGlow;
      varying vec3 vLocal;
      varying vec3 vNrm;
      varying vec3 vScale;
      varying vec3 vColor;
      varying float vSeed;
      varying float vLit;
      varying float vGlow;
      void main() {
        vLocal = position;
        vNrm = normal;
        vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vColor = instanceColor;
        vSeed = aSeed;
        vLit = aLit;
        vGlow = aGlow;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform float uGlitch;
      uniform float uBoost;
      uniform vec3 uWall;
      uniform vec3 uWarm;
      varying vec3 vLocal;
      varying vec3 vNrm;
      varying vec3 vScale;
      varying vec3 vColor;
      varying float vSeed;
      varying float vLit;
      varying float vGlow;
      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        vec3 n = normalize(vNrm);
        float shade = n.y > 0.5 ? 1.0 : (abs(n.x) > 0.5 ? (n.x > 0.0 ? 0.82 : 0.56) : (n.z > 0.0 ? 0.95 : 0.6));
        vec3 wall = mix(uWall, vColor * 0.32, 0.22) * shade;
        vec3 col = wall;
        if (abs(n.y) < 0.5) {
          float u = abs(n.x) > 0.5 ? vLocal.z * vScale.z : vLocal.x * vScale.x;
          float v = vLocal.y * vScale.y;
          vec2 cell = vec2(u / 0.34 + 0.5, v / 0.4);
          vec2 id = floor(cell);
          vec2 f = fract(cell);
          float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.75);
          win *= step(0.55, v) * step(v, vScale.y - 0.2);
          float face = n.x * 3.0 + n.z * 7.0;
          float r = hash12(id + vec2(vSeed * 13.7 + face, face));
          float scramble = step(0.5, hash12(id + vec2(floor(uTime * 10.0), vSeed)));
          float on = mix(step(r, clamp(vLit + uBoost, 0.0, 1.0)), scramble, uGlitch);
          float flick = 0.9 + 0.1 * sin(uTime * (0.6 + r * 2.0) + r * 50.0);
          vec3 tint = hash12(id.yx + vSeed) > 0.62 ? vColor * 1.05 + 0.18 : uWarm;
          col = mix(col, tint * flick, win * on);
          col = mix(col, wall * 0.5, win * (1.0 - on));
          col = mix(col, vColor * 0.85, step(v, 0.16) * 0.75);
        } else if (n.y > 0.5) {
          col = vColor * 0.85 + 0.12;
        }
        col += vColor * vGlow;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

/** An instanced block of towers sharing the one tower material. */
class TowerSet {
  readonly mesh: InstancedMesh;
  private seed: InstancedBufferAttribute;
  private lit: InstancedBufferAttribute;
  private glow: InstancedBufferAttribute;
  private m = new Matrix4();

  constructor(material: ShaderMaterial, readonly capacity: number) {
    const geo = unitTower();
    this.seed = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.lit = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.glow = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    geo.setAttribute('aSeed', this.seed);
    geo.setAttribute('aLit', this.lit);
    geo.setAttribute('aGlow', this.glow);
    this.mesh = new InstancedMesh(geo, material, capacity);
    this.mesh.frustumCulled = false;
    const black = new Color(0, 0, 0);
    for (let i = 0; i < capacity; i++) {
      this.seed.setX(i, (i * 0.618034) % 1);
      this.m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, black);
    }
  }

  set(i: number, x: number, z: number, w: number, h: number) {
    this.m.makeScale(w, Math.max(0.01, h), w);
    this.m.setPosition(x, 0, z);
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  hide(i: number) {
    this.m.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  colour(i: number, c: Color) {
    this.mesh.setColorAt(i, c);
    this.mesh.instanceColor!.needsUpdate = true;
  }

  look(i: number, lit: number, glow: number) {
    if (this.lit.getX(i) !== lit) {
      this.lit.setX(i, lit);
      this.lit.needsUpdate = true;
    }
    if (this.glow.getX(i) !== glow) {
      this.glow.setX(i, glow);
      this.glow.needsUpdate = true;
    }
  }
}

interface TowerRec {
  slot: number;
  lot: Vector3;
  width: number;
  shown: number;
  target: number;
  bits: number;
  name: string;
  me: boolean;
  colour: Color;
  anchor: Object3D;
  label: Label | null;
  domes: Mesh[];
  ring: Object3D | null;
  coin: Mesh | null;
  flash: number;
  firewall: number;
  twoFactor: boolean;
}

interface Flight {
  from: Vector3;
  to: Vector3;
  mid: Vector3;
  t: number;
  duration: number;
  sprite: Sprite;
  trail: number;
  colour: string;
  onLand: () => void;
}

const domeGeo = new SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2);
/** A sparser shell for the dome's shimmering lines. */
const domeWireGeo = new SphereGeometry(1.01, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
const ringGeo = new TorusGeometry(1, 0.045, 6, 48).rotateX(Math.PI / 2);
const flashGeo = new TorusGeometry(1, 0.08, 6, 40).rotateX(Math.PI / 2);

/* ---------------------------------- the city --------------------------------- */

export interface CityLayout {
  /** Where each player's tower may stand, best first. */
  lots: Vector3[];
  /** A lot kept for the viewer's own tower (the player's screen). */
  mine?: Vector3;
  /** Decorative skyline: position, width, height. */
  fillers: [number, number, number, number][];
  vault: Vector3;
  /** The vault's size (the big screen draws it larger). */
  vaultScale: number;
  towerWidth: number;
  maxHeight: number;
  /** Only the first this many towers (in the order they arrive) get a name tag, so a crowded skyline stays readable. */
  labelled: number;
}

abstract class CityWorld extends World {
  protected towers = new Map<string, TowerRec>();
  private freeSlots: number[] = [];
  private usedLots = new Set<Vector3>();
  private set: TowerSet;
  private material: ShaderMaterial;
  private skyUniforms: { top: { value: Color }; horizon: { value: Color } } | null = null;
  private skyFrom = { top: new Color(SKIES.calm.top), horizon: new Color(SKIES.calm.horizon) };
  private skyTo = { top: new Color(SKIES.calm.top), horizon: new Color(SKIES.calm.horizon) };
  private skyK = 1;
  private event: CityEvent | null = null;
  private glitch = 0;
  private flights: Flight[] = [];
  private seen = new Set<string>();
  private first = true;
  private domeMat: MeshBasicMaterial;
  private domeWire: MeshBasicMaterial;
  private ringMat: MeshBasicMaterial;
  private vault: { group: Group; shackle: Mesh; glow: Sprite; label: Label; cracks: number; open: number; bits: number } | null = null;
  private stormT = 0;
  /** Sprites with their own materials, freed on dispose. */
  protected sprites: Sprite[] = [];
  private extra: { geometry: BufferGeometry; material: { dispose(): void } }[] = [];
  private maxBits = 400;
  private time = 0;

  constructor(
    env: StageEnv,
    protected readonly layout: CityLayout,
  ) {
    super(env, CITY, 50);
    this.material = towerMaterial();
    this.set = new TowerSet(this.material, Math.max(4, layout.lots.length + 1));
    for (let i = this.set.capacity - 1; i >= 0; i--) this.freeSlots.push(i);
    this.scene.add(this.set.mesh);
    const sky = this.scene.getObjectByName('sky') as Mesh | undefined;
    if (sky) this.skyUniforms = (sky.material as ShaderMaterial).uniforms as unknown as { top: { value: Color }; horizon: { value: Color } };

    // The ground: dark streets with a soft grid.
    const tex = gridTexture();
    const groundMat = new MeshBasicMaterial({ map: tex });
    const ground = new Mesh(new PlaneGeometry(320, 320).rotateX(-Math.PI / 2), groundMat);
    (ground.material as MeshBasicMaterial).map!.repeat.set(80, 80);
    this.scene.add(ground);

    // The far skyline: plain towers with fewer lights, in one instanced draw.
    const fill = new TowerSet(this.material, layout.fillers.length);
    layout.fillers.forEach(([x, z, w, h], i) => {
      fill.set(i, x, z, w, h);
      fill.colour(i, hsl(222 + ((i * 37) % 30), 45, 42 + ((i * 13) % 12)));
      fill.look(i, 0.18 + ((i * 7) % 10) / 40, 0);
    });
    this.scene.add(fill.mesh);

    // Stars.
    const n = 260;
    const pos = new Float32Array(n * 3);
    const rnd = props.seeded(42);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const up = 0.18 + rnd() * 0.8;
      pos[i * 3] = Math.cos(a) * Math.cos(up) * 300;
      pos[i * 3 + 1] = Math.sin(up) * 300;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(up) * 300;
    }
    const starGeo = new BufferGeometry();
    starGeo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const starMat = new PointsMaterial({ color: '#d4dcff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.75, depthWrite: false });
    this.scene.add(new Points(starGeo, starMat));
    this.extra.push({ geometry: starGeo, material: starMat });

    this.domeMat = new MeshBasicMaterial({ color: '#4cc6ff', transparent: true, opacity: 0.07, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
    this.domeWire = new MeshBasicMaterial({ color: '#8fe0ff', wireframe: true, transparent: true, opacity: 0.12, depthWrite: false, blending: AdditiveBlending });
    this.ringMat = new MeshBasicMaterial({ color: '#b39bff', transparent: true, opacity: 0.95 });
  }

  /* ------------------------------ towers ------------------------------ */

  private heightFor(bits: number): number {
    const k = Math.pow(Math.max(0, bits) / this.maxBits, 0.75);
    return 1.3 + (this.layout.maxHeight - 1.3) * Math.min(1, k);
  }

  private takeLot(me: boolean): Vector3 | null {
    if (me && this.layout.mine && !this.usedLots.has(this.layout.mine)) return this.layout.mine;
    return this.layout.lots.find((l) => !this.usedLots.has(l)) ?? null;
  }

  protected setTowers(list: CityTower[]) {
    this.maxBits = Math.max(400, ...list.map((t) => t.bits));
    const ids = new Set(list.map((t) => t.playerId));
    for (const [id, rec] of this.towers) if (!ids.has(id)) this.dropTower(id, rec);
    list.forEach((t, index) => {
      let rec = this.towers.get(t.playerId);
      if (!rec) {
        const lot = this.takeLot(Boolean(t.me));
        const slot = this.freeSlots.pop();
        if (!lot || slot === undefined) {
          if (slot !== undefined) this.freeSlots.push(slot);
          return;
        }
        this.usedLots.add(lot);
        const anchor = new Object3D();
        this.scene.add(anchor);
        const h = this.heightFor(t.bits);
        rec = {
          slot,
          lot,
          width: this.layout.towerWidth * (t.me ? 1.1 : 1),
          shown: this.first ? h : 0.2,
          target: h,
          bits: t.bits,
          name: t.name,
          me: Boolean(t.me),
          colour: hsl(t.hue, 85, 60),
          anchor,
          label: null,
          domes: [],
          ring: null,
          coin: null,
          flash: 0,
          firewall: 0,
          twoFactor: false,
        };
        this.set.colour(slot, rec.colour);
        this.set.set(slot, lot.x, lot.z, rec.width, rec.shown);
        this.towers.set(t.playerId, rec);
      }
      rec.bits = t.bits;
      rec.name = t.name;
      rec.target = this.heightFor(t.bits);
      // Name tags for the first few (the list comes richest first) and always for you.
      const tagged = rec.me || index < this.layout.labelled;
      if (tagged && !rec.label) rec.label = this.labels.add(rec.anchor, '', { offsetY: 0.35, className: rec.me ? 'me' : 'small', maxDistance: 160 });
      else if (!tagged && rec.label) {
        this.labels.remove(rec.label);
        rec.label = null;
      }
      rec.label?.set(rec.me ? `You · ${fmt(t.bits)}` : `${t.name} · ${fmt(t.bits)}`);
      this.setDefences(rec, t.firewall, t.twoFactor);
      const lit = 0.3 + 0.55 * Math.min(1, t.bits / this.maxBits);
      this.set.look(rec.slot, lit, rec.me ? 0.1 : 0);
    });
  }

  private dropTower(id: string, rec: TowerRec) {
    if (rec.label) this.labels.remove(rec.label);
    rec.anchor.removeFromParent();
    for (const d of rec.domes) d.removeFromParent();
    rec.ring?.removeFromParent();
    rec.coin?.removeFromParent();
    this.set.hide(rec.slot);
    this.freeSlots.push(rec.slot);
    this.usedLots.delete(rec.lot);
    this.towers.delete(id);
  }

  private setDefences(rec: TowerRec, firewall: number, twoFactor: boolean) {
    if (firewall !== rec.firewall) {
      for (const d of rec.domes) d.removeFromParent();
      rec.domes = [];
      for (let i = 0; i < Math.min(2, firewall); i++) {
        const dome = new Mesh(domeGeo, this.domeMat);
        dome.userData.sharedGeometry = true;
        const wire = new Mesh(domeWireGeo, this.domeWire);
        wire.userData.sharedGeometry = true;
        dome.add(wire);
        dome.position.copy(rec.lot);
        dome.userData.layer = i;
        this.scene.add(dome);
        rec.domes.push(dome);
      }
      rec.firewall = firewall;
    }
    if (twoFactor !== rec.twoFactor) {
      if (twoFactor) {
        // A tilted ring on a pivot that turns: it orbits the tower rather than lying flat.
        const ring = new Mesh(ringGeo, this.ringMat);
        ring.userData.sharedGeometry = true;
        ring.rotation.x = 0.55;
        const pivot = new Group();
        pivot.add(ring);
        rec.ring = pivot;
        this.scene.add(pivot);
      } else {
        rec.ring?.removeFromParent();
        rec.ring = null;
      }
      rec.twoFactor = twoFactor;
    }
  }

  /** The top of a tower (or the vault), for packets and pops. */
  protected topOf(id: string): Vector3 | null {
    if (id === VAULT_ID) return this.vault ? this.vault.group.position.clone().add(new Vector3(0, 3.6 * this.layout.vaultScale, 0)) : null;
    const rec = this.towers.get(id);
    return rec ? new Vector3(rec.lot.x, rec.shown + 0.25, rec.lot.z) : null;
  }

  /* ------------------------------ the vault ----------------------------- */

  protected setVault(v: { bits: number; cracks: number } | null) {
    if (!v) {
      if (this.vault) {
        this.labels.remove(this.vault.label);
        this.vault.group.removeFromParent();
        this.vault = null;
      }
      return;
    }
    if (!this.vault) {
      const g = new Group();
      g.position.copy(this.layout.vault);
      g.scale.setScalar(this.layout.vaultScale);
      const body = new Mesh(new BoxGeometry(3.2, 3.2, 3.2), toon('#252d63'));
      body.position.y = 1.6;
      g.add(body);
      const edges = new LineSegments(new EdgesGeometry(body.geometry), new LineBasicMaterial({ color: '#ffc233' }));
      edges.position.y = 1.6;
      g.add(edges);
      this.extra.push({ geometry: edges.geometry, material: edges.material as LineBasicMaterial });
      for (const side of [1, -1]) {
        const lock = new Group();
        const plate = new Mesh(new BoxGeometry(1.2, 1.0, 0.24), toon('#ffc233', { glow: 0.25 }));
        lock.add(plate);
        const hole = new Mesh(new CylinderGeometry(0.11, 0.11, 0.26, 10).rotateX(Math.PI / 2), toon('#1a1530'));
        hole.position.set(0, 0.05, 0.02);
        lock.add(hole);
        lock.position.set(0, 1.35, side * 1.72);
        lock.rotation.y = side > 0 ? 0 : Math.PI;
        g.add(lock);
      }
      const shackle = new Mesh(new TorusGeometry(0.42, 0.1, 8, 24, Math.PI), toon('#dfe3f2'));
      shackle.position.set(0, 1.85, 1.72);
      g.add(shackle);
      const glow = glowSprite('#ffc233', 6, 0.35);
      glow.position.y = 1.8;
      g.add(glow);
      this.sprites.push(glow);
      const base = new Mesh(new CylinderGeometry(3.4, 3.6, 0.3, 32), toon('#1a2150'));
      base.position.y = 0.15;
      g.add(base);
      this.scene.add(g);
      const anchor = new Object3D();
      anchor.position.y = 3.4;
      g.add(anchor);
      const label = this.labels.add(anchor, '', { offsetY: 0.3, className: 'tone-gold', maxDistance: 160 });
      this.vault = { group: g, shackle, glow, label, cracks: v.cracks, open: 0, bits: v.bits };
    }
    const vault = this.vault;
    if (v.cracks > vault.cracks && !this.first) {
      vault.open = 1.6;
      this.fx.burst(vault.group.position.clone().add(new Vector3(0, 3.4 * this.layout.vaultScale, 0)), { color: ['#ffd25a', '#fff1a8', '#ffc233'], shape: 'star', glow: true, count: 60, speed: 5 });
    }
    vault.cracks = v.cracks;
    vault.bits = v.bits;
    vault.label.set(`Vault · ${fmt(v.bits)}`);
    const s = 4 + Math.min(6, Math.sqrt(v.bits) / 6);
    vault.glow.scale.set(s, s, 1);
  }

  /* ------------------------------ events ------------------------------ */

  protected setEvent(e: CityEvent | null) {
    if (e === this.event) return;
    this.event = e;
    const sky = SKIES[e ?? 'calm'];
    this.skyFrom.top.copy(this.skyUniforms?.top.value ?? new Color(sky.top));
    this.skyFrom.horizon.copy(this.skyUniforms?.horizon.value ?? new Color(sky.horizon));
    this.skyTo.top.set(sky.top);
    this.skyTo.horizon.set(sky.horizon);
    // At first sight the sky is simply that colour; later it fades over a second and a half.
    if (this.first) this.skyFrom = { top: this.skyTo.top.clone(), horizon: this.skyTo.horizon.clone() };
    this.skyK = 0;
    if (e === 'glitch' && !this.env.reducedMotion) this.glitch = 1;
  }

  protected setBounty(ids: string[] | null) {
    const on = new Set(ids ?? []);
    for (const [id, rec] of this.towers) {
      if (on.has(id) && !rec.coin) {
        rec.coin = props.coin({ scale: this.layout.maxHeight / 2.2, ink: this.env.quality.outlines });
        this.scene.add(rec.coin);
      } else if (!on.has(id) && rec.coin) {
        rec.coin.removeFromParent();
        rec.coin = null;
      }
    }
  }

  /* ------------------------------ packets ------------------------------ */

  protected setPackets(list: CityPacket[]) {
    if (this.first) {
      for (const p of list) this.seen.add(p.id);
      return;
    }
    for (const p of [...list].reverse()) {
      if (this.seen.has(p.id)) continue;
      this.seen.add(p.id);
      this.launch(p);
    }
    if (this.seen.size > 200) this.seen = new Set(list.map((p) => p.id));
  }

  private launch(p: CityPacket) {
    const from = this.topOf(p.from);
    const to = this.topOf(p.to);
    if (!from || !to || this.flights.length > 12) {
      this.landed(p);
      return;
    }
    this.fly(from, to, '#cfe6ff', PACKET_FLIGHT_MS / 1000, 0.9, () => this.land(p, to));
  }

  private fly(from: Vector3, to: Vector3, colour: string, duration: number, size: number, onLand: () => void) {
    const dist = from.distanceTo(to);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    mid.y += 2 + dist * 0.32;
    const sprite = glowSprite(colour, size, 1);
    sprite.position.copy(from);
    this.scene.add(sprite);
    this.flights.push({ from, to, mid, t: 0, duration, sprite, trail: 0, colour, onLand });
  }

  private land(p: CityPacket, at: Vector3) {
    const colour = OUTCOME_COLOUR[p.outcome];
    const target = this.towers.get(p.to);
    if (target) target.flash = 1;
    switch (p.outcome) {
      case 'stolen': {
        this.fx.burst(at, { color: colour, shape: 'star', glow: true, count: 34, speed: 3.2 });
        if (p.bits > 0) this.pop(at, `−${fmt(p.bits)}`, 'tone-bad');
        // The bits fly home to the hacker.
        const home = this.topOf(p.from);
        if (home)
          this.fly(at.clone(), home, '#1fd38f', 0.7, 0.6, () => {
            this.fx.burst(home, { color: colour, shape: 'star', glow: true, count: 16, speed: 2 });
            if (p.bits > 0) this.pop(home, `+${fmt(p.bits)}`, 'tone-good');
            const back = this.towers.get(p.from);
            if (back) back.flash = 1;
          });
        break;
      }
      case 'firewall':
      case 'twoFactor':
        this.ringFlash(at, colour[0]!, target ? target.width : 1.6);
        this.fx.burst(at, { color: colour, shape: 'spark', glow: true, count: 22, speed: 2.4 });
        break;
      case 'wrong':
        this.fx.burst(at, { color: colour, shape: 'dot', count: 18, speed: 1.4, gravity: 6, life: 0.7, size: 0.18 });
        break;
    }
    this.landed(p);
  }

  /** A packet arrived (or could not be drawn). Scenes react here. */
  protected landed(_p: CityPacket): void {}

  private flashes: { mesh: Mesh; t: number; r: number }[] = [];
  private ringFlash(at: Vector3, colour: string, width: number) {
    const mat = new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending });
    const m = new Mesh(flashGeo, mat);
    m.userData.sharedGeometry = true;
    m.position.copy(at);
    m.position.y -= 0.6;
    this.scene.add(m);
    this.flashes.push({ mesh: m, t: 0, r: width * 0.8 });
  }

  protected pop(at: Vector3, text: string, tone: string) {
    const marker = new Object3D();
    marker.position.copy(at);
    marker.position.y += 0.6;
    this.scene.add(marker);
    const label = this.labels.add(marker, text, { offsetY: 0, className: `pop ${tone}`, maxDistance: 160 });
    setTimeout(() => {
      this.labels.remove(label);
      marker.removeFromParent();
    }, 1000);
  }

  /** The latest view. */
  protected apply(s: CityState) {
    this.setTowers(s.towers);
    this.setVault(s.vault);
    this.setEvent(s.event);
    this.setBounty(s.event === 'bounty' ? s.bounty : null);
    this.setPackets(s.packets);
    this.first = false;
  }

  /* ------------------------------ each frame ------------------------------ */

  protected tickCity(dt: number) {
    const calm = this.env.reducedMotion;
    this.time += dt;
    const u = this.material.uniforms;
    if (!calm) u.uTime!.value = this.time;
    this.glitch = Math.max(0, this.glitch - dt * 0.45);
    u.uGlitch!.value = this.event === 'glitch' ? this.glitch : 0;
    u.uBoost!.value += ((this.event === 'storm' ? 0.18 : 0) - u.uBoost!.value) * Math.min(1, dt * 2);

    // The sky fades to the event's colour.
    if (this.skyK < 1 && this.skyUniforms) {
      this.skyK = Math.min(1, this.skyK + dt / 1.5);
      this.skyUniforms.top.value.copy(this.skyFrom.top).lerp(this.skyTo.top, this.skyK);
      this.skyUniforms.horizon.value.copy(this.skyFrom.horizon).lerp(this.skyTo.horizon, this.skyK);
      (this.scene.fog as Fog | null)?.color.copy(this.skyUniforms.horizon.value);
    }

    // Towers grow and shrink towards their bits.
    this.domeMat.opacity = calm ? 0.07 : 0.06 + Math.sin(this.time * 2.2) * 0.025;
    this.domeWire.opacity = calm ? 0.12 : 0.1 + Math.sin(this.time * 2.2 + 1) * 0.05;
    for (const rec of this.towers.values()) {
      if (Math.abs(rec.shown - rec.target) > 0.002) {
        rec.shown += (rec.target - rec.shown) * Math.min(1, dt * 2.5);
        this.set.set(rec.slot, rec.lot.x, rec.lot.z, rec.width, rec.shown);
      }
      if (rec.flash > 0) {
        rec.flash = Math.max(0, rec.flash - dt * 1.6);
        this.set.look(rec.slot, 0.3 + 0.55 * Math.min(1, rec.bits / this.maxBits), (rec.me ? 0.1 : 0) + rec.flash * 0.7);
      }
      rec.anchor.position.set(rec.lot.x, rec.shown, rec.lot.z);
      rec.domes.forEach((d, i) => {
        const r = rec.width * (0.95 + i * 0.22);
        d.scale.set(r, rec.shown + 0.5 + i * 0.35, r);
      });
      if (rec.ring) {
        rec.ring.position.set(rec.lot.x, Math.max(1, rec.shown * 0.7), rec.lot.z);
        const r = rec.width * 0.78 + 0.3;
        rec.ring.scale.set(r, r, r);
        if (!calm) {
          rec.ring.rotation.y += dt * 1.1;
          rec.ring.position.y += Math.sin(this.time * 1.3 + rec.slot) * 0.2;
        } else rec.ring.rotation.y = 0.6;
      }
      if (rec.coin) {
        rec.coin.position.set(rec.lot.x, rec.shown + 1.4, rec.lot.z);
        if (!calm) rec.coin.rotation.y += dt * 2.4;
      }
    }

    // The vault's shackle pops open when it is cracked, then locks again.
    if (this.vault) {
      const v = this.vault;
      v.open = Math.max(0, v.open - dt);
      const k = v.open > 0 ? Math.min(1, (1.6 - v.open) * 4) * Math.min(1, v.open * 2) : 0;
      v.shackle.position.y = 1.85 + k * 0.45;
      v.shackle.rotation.y = k * 0.9;
      if (!calm) v.glow.material.opacity = 0.3 + Math.sin(this.time * 1.7) * 0.06 + k * 0.4;
    }

    // Data rain in a Data Storm.
    if (this.event === 'storm') {
      this.stormT += dt;
      if (this.stormT > 0.25) {
        this.stormT = 0;
        const lot = this.layout.lots[Math.floor(Math.random() * this.layout.lots.length)];
        if (lot) this.fx.burst(new Vector3(lot.x + (Math.random() - 0.5) * 4, 12 + Math.random() * 4, lot.z), { color: ['#5fe1ff', '#c8f6ff'], shape: 'square', glow: true, count: 6, speed: 0.4, gravity: 3, life: 1.8, size: 0.12 });
      }
    }

    // Packets in flight.
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]!;
      f.t += dt / f.duration;
      const t = Math.min(1, f.t);
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      f.sprite.position.set(a * f.from.x + b * f.mid.x + c * f.to.x, a * f.from.y + b * f.mid.y + c * f.to.y, a * f.from.z + b * f.mid.z + c * f.to.z);
      f.trail += dt;
      if (f.trail > 0.035) {
        f.trail = 0;
        this.fx.burst(f.sprite.position.clone(), { color: f.colour, shape: 'dot', glow: true, count: 1, speed: 0.15, life: 0.45, size: 0.22, gravity: 0 });
      }
      if (f.t >= 1) {
        f.sprite.removeFromParent();
        f.sprite.material.dispose();
        this.flights.splice(i, 1);
        f.onLand();
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]!;
      f.t += dt;
      const k = f.t / 0.7;
      const r = f.r * (1 + k * 1.6);
      f.mesh.scale.set(r, r, r);
      (f.mesh.material as MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) {
        f.mesh.removeFromParent();
        (f.mesh.material as MeshBasicMaterial).dispose();
        this.flashes.splice(i, 1);
      }
    }
  }

  override dispose() {
    for (const f of this.flights) f.sprite.material.dispose();
    for (const f of this.flashes) (f.mesh.material as MeshBasicMaterial).dispose();
    for (const s of this.sprites) s.material.dispose();
    for (const e of this.extra) {
      e.geometry.dispose();
      e.material.dispose();
    }
    this.domeMat.dispose();
    this.domeWire.dispose();
    this.ringMat.dispose();
    this.material.dispose();
    super.dispose();
  }
}

/* --------------------------------- layouts -------------------------------- */

function rng(seed: number) {
  return props.seeded(seed);
}

/** The player's city: lots fanned out behind the desk, best (most central) first, and a far skyline. */
function deskLayout(heist: boolean): CityLayout {
  const mine = new Vector3(-3.7, 0, -2.4);
  const vault = new Vector3(1.2, 0, -12);
  const lots: Vector3[] = [];
  const r = rng(7);
  for (let row = 0; row < 7; row++) {
    const z = -6 - row * 3.6;
    for (let col = -5; col <= 5; col++) {
      const x = col * 3.4 + (row % 2 ? 1.7 : 0) + (r() - 0.5) * 0.6;
      const lot = new Vector3(x, 0, z + (r() - 0.5) * 0.8);
      if (z > -7.5 && Math.abs(x) < 2) continue;
      if (lot.distanceTo(mine) < 3) continue;
      if (heist && lot.distanceTo(vault) < 4.6) continue;
      lots.push(lot);
    }
  }
  const score = (l: Vector3) => Math.abs(l.x) * 0.9 + Math.abs(l.z + 9) * 0.8;
  lots.sort((a, b) => score(a) - score(b));
  const fillers: [number, number, number, number][] = [];
  const f = rng(19);
  for (let i = 0; i < 80; i++) {
    const back = i < 55;
    const x = back ? -46 + f() * 92 : (f() < 0.5 ? -1 : 1) * (21 + f() * 18);
    const z = back ? -33 - f() * 30 : -4 - f() * 28;
    fillers.push([x, z, 1.4 + f() * 2.2, 2 + f() * (back ? 11 : 7)]);
  }
  return { lots: lots.slice(0, 44), mine, fillers, vault, vaultScale: 1, towerWidth: 1.7, maxHeight: 7, labelled: 44 };
}

/** The big screen's city: rings of lots around the middle (the vault, or a plaza), and a skyline all round. */
function skylineLayout(): CityLayout {
  const lots: Vector3[] = [];
  const rings: [number, number][] = [
    [9.5, 8],
    [14, 11],
    [18.5, 14],
    [23, 17],
  ];
  rings.forEach(([radius, count], ri) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ri * 0.37;
      lots.push(new Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
  });
  // The skyline stands beyond the camera's orbit, so nothing ever blocks the view of the city.
  const fillers: [number, number, number, number][] = [];
  const f = rng(23);
  for (let i = 0; i < 120; i++) {
    const a = f() * Math.PI * 2;
    const radius = 58 + f() * 34;
    fillers.push([Math.cos(a) * radius, Math.sin(a) * radius, 2 + f() * 3.5, 4 + f() * 16]);
  }
  return { lots, fillers, vault: new Vector3(0, 0, 0), vaultScale: 1.5, towerWidth: 2, maxHeight: 12, labelled: 16 };
}

/* ------------------------------- the player's desk ------------------------------ */

export interface DeskState extends CityState {
  /** The viewer's player id. */
  me: string;
  /** A hack is open (choosing a target, guessing, answering 2FA): the Glim types. */
  hacking: boolean;
}

type ScreenMood = 'calm' | 'busy' | 'alert' | 'win';

/** One of the desk's screens: abstract data that scrolls, tinted by the mood. No words. */
class DeskScreen {
  readonly mesh: Mesh;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  readonly texture: CanvasTexture;
  private rows: number[];

  constructor(
    w: number,
    h: number,
    private readonly kind: number,
  ) {
    this.canvas.width = 192;
    this.canvas.height = 112;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const r = rng(kind * 31 + 5);
    this.rows = Array.from({ length: 12 }, () => 0.2 + r() * 0.75);
    this.mesh = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    this.draw('calm', 0);
  }

  draw(mood: ScreenMood, t: number) {
    const g = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const tint = mood === 'alert' ? '#ff4d6a' : mood === 'win' ? '#1fd38f' : mood === 'busy' ? '#ffc233' : '#5fb8ff';
    g.fillStyle = mood === 'alert' ? '#2a0c1c' : mood === 'win' ? '#062a20' : '#0b1638';
    g.fillRect(0, 0, W, H);
    if (this.kind === 1) {
      // The middle screen: a lock, open on a win.
      g.strokeStyle = tint;
      g.lineWidth = 7;
      g.beginPath();
      const open = mood === 'win' ? 14 : 0;
      g.arc(W / 2, H / 2 - 6 - open, 17, Math.PI, 0);
      g.stroke();
      g.fillStyle = tint;
      g.fillRect(W / 2 - 26, H / 2 - 6, 52, 40);
      g.fillStyle = mood === 'alert' ? '#2a0c1c' : '#0b1638';
      g.beginPath();
      g.arc(W / 2, H / 2 + 10, 6, 0, Math.PI * 2);
      g.fill();
      // A progress bar while hacking.
      if (mood === 'busy') {
        g.fillStyle = 'rgba(255,255,255,0.15)';
        g.fillRect(24, H - 16, W - 48, 6);
        g.fillStyle = tint;
        g.fillRect(24, H - 16, (W - 48) * ((t * 0.6) % 1), 6);
      }
      return;
    }
    // Side screens: rows of data bars scrolling up, and a little skyline graph.
    const scroll = (t * (mood === 'busy' ? 3 : 1)) % 1;
    for (let i = 0; i < this.rows.length; i++) {
      const y = 8 + ((i - scroll + this.rows.length) % this.rows.length) * 8.4;
      const len = this.rows[(i + Math.floor(t * (mood === 'busy' ? 3 : 1))) % this.rows.length]!;
      g.fillStyle = i % 4 === 0 ? tint : 'rgba(170,200,255,0.55)';
      g.fillRect(10, y, (W * 0.55 - 10) * len, 4);
    }
    g.fillStyle = tint;
    for (let i = 0; i < 6; i++) {
      const bh = 10 + ((Math.sin(t * 0.7 + i * 1.3 + this.kind) + 1) / 2) * 42;
      g.fillRect(W * 0.62 + i * 11, H - 10 - bh, 7, bh);
    }
  }

  dispose() {
    this.texture.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.mesh.geometry.dispose();
  }
}

export class CodeBreakersScene extends CityWorld {
  private glim: Glim3D;
  private cam: EaseCamera;
  private screens: DeskScreen[] = [];
  private mood: ScreenMood = 'calm';
  private moodUntil = 0;
  private hacking = false;
  private me = '';
  private clock = 0;
  private drawT = 0;
  private glows: Sprite[] = [];
  private cheerUntil = 0;

  constructor(env: StageEnv, look: GlimLook, heist: boolean) {
    super(env, deskLayout(heist));
    const ink = env.quality.outlines;
    const desk = new Group();
    desk.position.set(0, 0, 3);
    // The rooftop deck the desk sits on, with a light along its edge.
    const deck = new Mesh(new BoxGeometry(7.5, 0.14, 4), toon('#141b44'));
    deck.position.set(0, 0.07, 0.2);
    deck.receiveShadow = true;
    desk.add(deck);
    const edge = new Mesh(new BoxGeometry(7.5, 0.05, 0.05), toon('#3d9bff', { glow: 0.9 }));
    edge.position.set(0, 0.15, 2.2);
    desk.add(edge);
    // The console of screens behind the Glim, facing us.
    const frame = new Mesh(new BoxGeometry(4.6, 1.3, 0.16), toon('#1d2350'));
    frame.position.set(0, 1.35, -0.75);
    desk.add(frame);
    for (const x of [-1.9, 1.9]) {
      const leg = new Mesh(new BoxGeometry(0.12, 0.8, 0.12), toon('#262d5c'));
      leg.position.set(x, 0.5, -0.75);
      desk.add(leg);
    }
    const layout: [number, number, number, number, number][] = [
      [-1.5, 1.32, -0.66, 1.25, 0.25],
      [0, 1.4, -0.66, 1.45, 0],
      [1.5, 1.32, -0.66, 1.25, -0.25],
    ];
    layout.forEach(([x, y, z, w, ry], i) => {
      const s = new DeskScreen(w, w * 0.6, i);
      s.mesh.position.set(x, y, z);
      s.mesh.rotation.y = ry;
      desk.add(s.mesh);
      this.screens.push(s);
      const glow = glowSprite('#5fb8ff', 2.2, 0.28);
      glow.position.set(x, y, z + 0.35);
      desk.add(glow);
      this.glows.push(glow);
    });
    // The desk in front of the Glim, with a laptop and a mug.
    const top = new Mesh(new BoxGeometry(2.6, 0.08, 0.85), toon('#2f3a78'));
    top.position.set(0, 0.5, 0.75);
    top.castShadow = env.quality.shadows;
    top.receiveShadow = true;
    desk.add(top);
    const front = new Mesh(new BoxGeometry(2.6, 0.36, 0.06), toon('#232c66'));
    front.position.set(0, 0.32, 1.16);
    desk.add(front);
    const strip = new Mesh(new BoxGeometry(2.5, 0.04, 0.02), toon('#ffc233', { glow: 0.8 }));
    strip.position.set(0, 0.42, 1.2);
    desk.add(strip);
    const laptop = new Group();
    const base = new Mesh(new BoxGeometry(0.62, 0.03, 0.42), toon('#9aa5c4'));
    laptop.add(base);
    const lid = new Mesh(new BoxGeometry(0.62, 0.4, 0.03), toon('#9aa5c4'));
    lid.position.set(0, 0.2, 0.2);
    lid.rotation.x = -0.25;
    laptop.add(lid);
    const logo = glowSprite('#7fd4ff', 0.35, 0.8);
    logo.position.set(0, 0.22, 0.25);
    laptop.add(logo);
    this.glows.push(logo);
    laptop.position.set(0.72, 0.56, 0.72);
    laptop.rotation.y = 0.2;
    desk.add(laptop);
    const mug = new Mesh(new CylinderGeometry(0.08, 0.07, 0.17, 12), toon('#ff5ca8'));
    mug.position.set(-0.85, 0.62, 0.8);
    desk.add(mug);
    const plant = props.bush({ ink, scale: 0.45 });
    plant.position.set(-3.1, 0.14, 0.9);
    desk.add(plant);
    this.scene.add(desk);

    this.glim = new Glim3D({ look, quality: env.quality, reducedMotion: env.reducedMotion });
    this.glim.scale.setScalar(1.25);
    this.glim.position.set(0, 0.14, 3.15);
    this.scene.add(this.glim);
    this.labels.add(this.glim, 'You', { offsetY: 1.15, className: 'me small' });

    this.cam = new EaseCamera(this.camera, env.reducedMotion);
    this.shadowArea(4, [0, 0.5, 3]);
  }

  setState(s: DeskState) {
    this.me = s.me;
    this.hacking = s.hacking;
    this.apply(s);
    if (this.hacking) this.glim.play('type');
    else if (this.clock >= this.cheerUntil) this.glim.play('idle');
  }

  protected override landed(p: CityPacket) {
    if (p.to === this.me) {
      if (p.outcome === 'stolen') {
        this.glim.play('hit');
        this.glim.setExpression('dizzy', 2.2);
        this.moodFor('alert', 2.2);
      } else if (p.outcome === 'wrong') {
        this.glim.setExpression('proud', 1.6);
        this.moodFor('win', 1.2);
      } else {
        this.glim.setExpression('surprised', 1.6);
        this.moodFor('alert', 1.2);
      }
    } else if (p.from === this.me) {
      if (p.outcome === 'stolen') {
        this.glim.play('cheer');
        this.glim.setExpression('happy', 2);
        this.cheerUntil = this.clock + 1.6;
        this.moodFor('win', 2);
      } else if (p.outcome === 'wrong') {
        this.glim.setExpression('sad', 1.5);
      } else {
        this.glim.setExpression('surprised', 1.5);
        this.moodFor('alert', 1);
      }
    }
  }

  private moodFor(m: ScreenMood, seconds: number) {
    this.mood = m;
    this.moodUntil = this.clock + seconds;
    this.drawScreens();
  }

  private drawScreens() {
    const mood = this.clock < this.moodUntil ? this.mood : this.hacking ? 'busy' : 'calm';
    const tint = mood === 'alert' ? '#ff4d6a' : mood === 'win' ? '#1fd38f' : mood === 'busy' ? '#ffc233' : '#5fb8ff';
    for (const s of this.screens) {
      s.draw(mood, this.clock);
      s.texture.needsUpdate = true;
    }
    for (const g of this.glows.slice(0, 3)) g.material.color.set(tint);
  }

  tick(dt: number) {
    this.clock += dt;
    this.tickCity(dt);
    // Screens redraw a few times a second (once per change under reduced motion).
    this.drawT += dt;
    if (this.drawT > (this.env.reducedMotion ? 1.5 : 0.2)) {
      this.drawT = 0;
      this.drawScreens();
    }
    if (!this.hacking && this.clock >= this.cheerUntil && this.cheerUntil > 0) {
      this.cheerUntil = 0;
      this.glim.play('idle');
    }
    this.glim.update(dt);
    // Frame the desk in front and the city behind; narrow screens stand further back.
    const a = this.camera.aspect;
    const far = a < 0.8 ? 1.5 : a < 1.15 ? 1.2 : 1;
    this.cam.set([0.4, 3.0 + far * 0.25, 9.4 * far], [-0.3, 1.35 + (far - 1) * 1.4, -3]);
    this.cam.update(dt);
  }

  override dispose() {
    for (const s of this.screens) s.dispose();
    for (const g of this.glows) g.material.dispose();
    this.glim.dispose();
    super.dispose();
  }
}

/* ------------------------------- the big screen ------------------------------ */

/** The whole skyline from a slow orbit: every tower (the top 30), the vault in Heist, packets flying. */
export class CitySkylineScene extends CityWorld {
  private orbit: OrbitCamera;
  private spire: Group;

  constructor(env: StageEnv) {
    super(env, skylineLayout());
    // The far skyline stands well back; let it fade further out than the player's city does.
    const fog = this.scene.fog as Fog | null;
    if (fog) {
      fog.near = 45;
      fog.far = 175;
    }
    this.orbit = new OrbitCamera(this.camera, env.reducedMotion);
    this.orbit.radius = 38;
    this.orbit.height = 22;
    this.orbit.speed = 0.035;
    this.orbit.centre.set(0, 3, 0);
    // A data spire in the plaza (hidden in Heist, where the vault stands).
    this.spire = new Group();
    const shaft = new Mesh(new CylinderGeometry(0.25, 0.9, 7, 6), toon('#2a3478'));
    shaft.position.y = 3.5;
    this.spire.add(shaft);
    const tip = glowSprite('#7fd4ff', 3, 0.75);
    tip.position.y = 7.3;
    this.spire.add(tip);
    this.sprites.push(tip);
    const base = new Mesh(new CylinderGeometry(3.2, 3.4, 0.25, 32), toon('#1a2150'));
    base.position.y = 0.12;
    this.spire.add(base);
    this.scene.add(this.spire);
  }

  setState(s: CityState) {
    this.spire.visible = !s.vault;
    this.apply(s);
  }

  tick(dt: number) {
    this.tickCity(dt);
    const a = this.camera.aspect;
    this.orbit.radius = a < 1 ? 54 : a < 1.4 ? 45 : 38;
    this.orbit.update(dt);
  }
}
