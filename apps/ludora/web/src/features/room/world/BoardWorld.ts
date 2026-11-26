/*
 * The board's world (D63): the big screen is a window onto a place, not a coloured background. A
 * round stage stands in the open at night; strings of lights hang over it, lanterns drift up into
 * the sky behind it, beams of light fall through the air, and the class's own Glims stand on it,
 * arrive on it, watch the question and climb the podium on it. The camera moves between the moments
 * of a game. Every game mode has its own world of the same making (themes.ts).
 *
 * Built from the 3D engine's own pieces (three/): toon materials, the Glims players already have, the
 * engine's particles. Fetched on its own and only by a board that will draw it (BoardStage.tsx).
 */

import { AdditiveBlending, BackSide, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, CircleGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Points, PointsMaterial, RingGeometry, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, TorusGeometry, TubeGeometry, Vector3, type Object3D } from 'three';
import { World, type StageEnv } from '../../../three/World.ts';
import { Glim3D } from '../../../three/glim3d.ts';
import type { GlimLook } from '../../../three/glimTexture.ts';
import { toon } from '../../../three/toon.ts';
import * as props from '../../../three/props.ts';
import type { Label } from '../../../three/labels.ts';
import { EaseCamera } from '../../../three/camera.ts';
import type { WorldTheme } from './themes.ts';

export type Shot = 'lobby' | 'ready' | 'question' | 'reveal' | 'standings' | 'podium';

export interface Actor {
  id: string;
  name: string;
  look: GlimLook;
}

/** A place on the podium: who stands there and what their plate says. */
export interface PodiumPlace extends Actor {
  /** 0 is the winner. */
  place: number;
  score: string;
}

const STAGE_R = 6.4;
const BLOCK = [
  { x: 0, h: 1.7, color: '#ffc233' },
  { x: -1.75, h: 1.15, color: '#b9c2e6' },
  { x: 1.75, h: 0.8, color: '#ff8a3d' },
];

/** Where the camera stands and what it looks at, for each moment of a game. */
const SHOTS: Record<Shot, { pos: [number, number, number]; look: [number, number, number] }> = {
  // The crowd fills the lower half of the picture; the join card and the Start button have the upper half.
  lobby: { pos: [0, 3.1, 14.2], look: [0, 4.4, 0] },
  ready: { pos: [0, 2.2, 11.5], look: [0, 2.6, 0] },
  // The stage sinks to the foot of the picture and the question has the rest.
  question: { pos: [0, 4.6, 17.5], look: [0, 8.6, 0] },
  reveal: { pos: [0, 4.2, 16.2], look: [0, 8.2, 0] },
  standings: { pos: [8.5, 3.6, 13.5], look: [-1.5, 6.4, 0] },
  // The podium stands in the left half of the picture: the captions and the host's buttons have the right.
  podium: { pos: [3.4, 3.3, 11.2], look: [3.1, 2.3, 0] },
};

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** A soft round glow as a texture: lantern halos, the moon's light, motes. */
function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

/** A beam of light falling through the air: a cone that is brightest along its middle and fades to its foot. */
function beam(color: string, height: number, radius: number, strength: number): Mesh {
  const geo = new ConeGeometry(radius, height, 40, 1, true).translate(0, -height / 2, 0);
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    fog: false,
    uniforms: { color: { value: new Color(color) }, strength: { value: strength }, h: { value: height } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = -position.y; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float strength; uniform float h; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float fall = smoothstep(0.0, 0.08, vY / h) * (1.0 - smoothstep(0.35, 1.0, vY / h)); gl_FragColor = vec4(color * strength * edge * fall, 1.0); }`,
  });
  const m = new Mesh(geo, mat);
  m.renderOrder = 5;
  return m;
}

export class BoardWorld extends World {
  private readonly cam: EaseCamera;
  private shot: Shot = 'lobby';
  private readonly actors = new Map<string, { glim: Glim3D; home: Vector3; born: number; label: Label | null; onPodium: boolean }>();
  private readonly drifting: { o: Object3D; speed: number; sway: number; phase: number; x: number; top: number; floor: number }[] = [];
  private readonly beams: { m: Mesh; base: number; rate: number; phase: number }[] = [];
  private readonly bulbs: { m: Mesh; phase: number }[] = [];
  private readonly podium = new Group();
  private readonly blocks: { m: Mesh; h: number; up: number; target: number; number: Mesh }[] = [];
  private spot: Mesh | null = null;
  private podiumPlaces: PodiumPlace[] = [];
  private podiumLabels: Label[] = [];
  private landed = 0;
  private motes: Points | null = null;
  private clock = 0;
  private dirty = 3;
  /** How bright the place is: it dims while a question is being read. */
  private level = 1;
  private levelTarget = 1;
  private names = true;

  constructor(
    env: StageEnv,
    private readonly theme: WorldTheme,
  ) {
    super(env, theme.light, 42);
    this.cam = new EaseCamera(this.camera, env.reducedMotion);
    const s = SHOTS.lobby;
    this.cam.set(s.pos, s.look);
    this.build();
  }

  /* ----------------------------------- the place ----------------------------------- */

  private build() {
    const t = this.theme;
    const r = seeded(t.seed);
    const glow = glowTexture();
    const rich = this.env.quality.tier !== 'low';

    // The ground the stage stands on, running out into the dark.
    const ground = new Mesh(new CircleGeometry(160, 48).rotateX(-Math.PI / 2), toon(t.ground));
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Stars, and the moon (or this world's own light in the sky) with its halo.
    const starGeo = new BufferGeometry();
    const stars = rich ? 520 : 220;
    const sp = new Float32Array(stars * 3);
    for (let i = 0; i < stars; i++) {
      const a = r() * Math.PI * 2;
      const e = 0.06 + r() * 1.1;
      sp[i * 3] = Math.cos(a) * Math.cos(e) * 320;
      sp[i * 3 + 1] = Math.sin(e) * 320;
      sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 320;
    }
    starGeo.setAttribute('position', new BufferAttribute(sp, 3));
    const starField = new Points(starGeo, new PointsMaterial({ color: t.star, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
    starField.frustumCulled = false;
    this.scene.add(starField);
    const moon = new Mesh(new SphereGeometry(t.moon.size, 32, 20), new MeshBasicMaterial({ color: t.moon.color, fog: false }));
    moon.position.set(...t.moon.at);
    this.scene.add(moon);
    const halo = new Sprite(new SpriteMaterial({ map: glow, color: t.moon.glow, blending: AdditiveBlending, depthWrite: false, fog: false, opacity: 0.38 }));
    halo.scale.setScalar(t.moon.size * 6);
    halo.position.copy(moon.position);
    this.scene.add(halo);

    // Hills in three rows, each further off and fainter in the night air.
    t.hills.forEach((row, depth) => {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = Math.PI * (0.08 + (0.84 * (i + r() * 0.6)) / n);
        const hill = new Mesh(new SphereGeometry(1, 20, 12), toon(row.color));
        const w = row.width * (0.7 + r() * 0.7);
        hill.scale.set(w, row.height * (0.55 + r() * 0.8), w * 0.6);
        hill.position.set(Math.cos(a) * row.at, -0.4, -Math.sin(a) * row.at);
        this.scene.add(hill);
        if (depth === 0 && t.trees) {
          for (let k = 0; k < 3; k++) {
            const tree = props.tree(t.trees, { scale: 1.6 + r() * 1.8, hue: t.treeHue });
            tree.position.set(hill.position.x + (r() - 0.5) * w * 1.4, hill.scale.y * 0.55, hill.position.z + (r() - 0.5) * 4);
            this.scene.add(tree);
          }
        }
      }
    });

    // The stage: a round platform with a lit rim, rings of light set into its floor and a step up to it.
    const deck = new Mesh(new CylinderGeometry(STAGE_R, STAGE_R + 0.5, 0.7, 64), toon(t.stage.side));
    deck.position.y = 0.35;
    deck.receiveShadow = true;
    this.scene.add(deck);
    const top = new Mesh(new CircleGeometry(STAGE_R, 64).rotateX(-Math.PI / 2), toon(t.stage.top));
    top.position.y = 0.705;
    top.receiveShadow = true;
    this.scene.add(top);
    const rim = new Mesh(new TorusGeometry(STAGE_R, 0.09, 10, 96).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: t.stage.rim }));
    rim.position.y = 0.72;
    this.scene.add(rim);
    for (const [radius, opacity] of [[4.6, 0.5], [2.9, 0.38], [1.3, 0.3]] as const) {
      const ring = new Mesh(new RingGeometry(radius - 0.05, radius + 0.05, 72).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: t.stage.ring, transparent: true, opacity, depthWrite: false }));
      ring.position.y = 0.712;
      this.scene.add(ring);
    }
    // A pool of light on the floor, where the beams land.
    const pool = new Sprite(new SpriteMaterial({ map: glow, color: t.stage.pool, blending: AdditiveBlending, depthWrite: false, opacity: 0.55 }));
    pool.scale.set(15, 15, 1);
    pool.position.set(0, 0.9, 0.5);
    this.scene.add(pool);
    const skirt = new Mesh(new CylinderGeometry(STAGE_R + 1.3, STAGE_R + 1.6, 0.28, 64), toon(t.stage.step));
    skirt.position.y = 0.14;
    skirt.receiveShadow = true;
    this.scene.add(skirt);

    // Posts round the back of the stage with strings of lights swung between them.
    const posts: Vector3[] = [];
    const count = 7;
    for (let i = 0; i < count; i++) {
      const a = Math.PI * (0.02 + (0.96 * i) / (count - 1));
      const at = new Vector3(Math.cos(a) * (STAGE_R + 1.2), 0, -Math.sin(a) * (STAGE_R + 1.2) + 0.4);
      const post = props.lampPost({ hue: t.lamps[i % t.lamps.length]!, height: 5.2 });
      post.position.copy(at);
      this.scene.add(post);
      posts.push(at.clone().setY(5.2));
    }
    const bulb = new SphereGeometry(0.11, 10, 8);
    for (let i = 0; i < posts.length - 1; i++) {
      const a = posts[i]!;
      const b = posts[i + 1]!;
      const mid = a.clone().lerp(b, 0.5).setY(4.1);
      const curve = new CatmullRomCurve3([a, mid, b]);
      this.scene.add(new Mesh(new TubeGeometry(curve, 16, 0.018, 5), new MeshBasicMaterial({ color: '#0b0d1f' })));
      const n = rich ? 9 : 5;
      for (let k = 1; k < n; k++) {
        const hue = t.bulbs[(i + k) % t.bulbs.length]!;
        const m = new Mesh(bulb, new MeshBasicMaterial({ color: new Color(`hsl(${hue}, 100%, 72%)`) }));
        m.position.copy(curve.getPoint(k / n));
        m.position.y -= 0.1;
        this.scene.add(m);
        this.bulbs.push({ m, phase: r() * 6.28 });
        if (rich && k % 2 === 0) {
          const h = new Sprite(new SpriteMaterial({ map: glow, color: new Color(`hsl(${hue}, 100%, 62%)`), blending: AdditiveBlending, depthWrite: false, opacity: 0.5 }));
          h.scale.setScalar(1.5);
          h.position.copy(m.position);
          this.scene.add(h);
        }
      }
    }
    // Flags across the front, low, so they frame the stage without covering anyone.
    const flags = props.bunting(STAGE_R * 2.4, { colors: t.flags, sag: 0.9 });
    flags.position.set(0, 5.6, -STAGE_R - 0.6);
    this.scene.add(flags);

    // What this world keeps behind its stage.
    t.dress(this.scene, r);

    // Lanterns let go into the sky, at every distance, drifting up.
    const lanterns = Math.round((rich ? 46 : 20) * t.lanterns);
    for (let i = 0; i < lanterns; i++) {
      const hue = t.lanternHues[i % t.lanternHues.length]!;
      const far = r();
      const o = props.lantern({ hue, scale: 0.7 + r() * 0.9 });
      const x = (r() - 0.5) * (30 + far * 70);
      const z = -8 - far * 70;
      const floor = 1.5 + r() * 3;
      const top = 22 + far * 30;
      o.position.set(x, floor + r() * (top - floor), z);
      this.scene.add(o);
      if (rich) {
        const h = new Sprite(new SpriteMaterial({ map: glow, color: new Color(`hsl(${hue}, 100%, 60%)`), blending: AdditiveBlending, depthWrite: false, opacity: 0.55 }));
        h.scale.setScalar(4.2);
        h.position.y = 0.25;
        o.add(h);
      }
      this.drifting.push({ o, speed: 0.12 + r() * 0.3, sway: 0.3 + r() * 0.9, phase: r() * 6.28, x, top, floor });
    }

    // Beams of light through the air above the stage.
    const lights: [number, number, string, number][] = [
      [-7.5, -2.5, t.beams[0]!, 0.2],
      [7.5, -2.5, t.beams[1]!, 0.2],
      [-3.2, -5.5, t.beams[2]!, 0.13],
      [3.2, -5.5, t.beams[0]!, 0.13],
    ];
    lights.forEach(([x, z, color, strength], i) => {
      const m = beam(color, 17, 2.5, strength);
      m.position.set(x, 16.5, z);
      m.rotation.z = (x < 0 ? -1 : 1) * 0.32;
      m.rotation.x = 0.1;
      this.scene.add(m);
      this.beams.push({ m, base: m.rotation.z, rate: 0.16 + i * 0.03, phase: i * 1.7 });
    });

    // Dust in the light.
    if (rich) {
      const n = 260;
      const mp = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        mp[i * 3] = (r() - 0.5) * 26;
        mp[i * 3 + 1] = 0.8 + r() * 11;
        mp[i * 3 + 2] = -9 + r() * 16;
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(mp, 3));
      this.motes = new Points(g, new PointsMaterial({ map: glow, color: t.motes, size: 0.16, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false }));
      this.scene.add(this.motes);
    }

    // The podium waits under the stage until the end of a game.
    BLOCK.forEach((b, place) => {
      // Each block is lit from inside a little, so it holds its colour in the night, and wears its number.
      const m = new Mesh(new BoxGeometry(1.6, 1, 1.5).translate(0, 0.5, 0), toon(b.color, { glow: 0.42 }));
      m.position.set(b.x, 0.7, 0);
      m.scale.y = 0.001;
      m.visible = false;
      m.castShadow = true;
      this.podium.add(m);
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d')!;
      x.font = '800 104px "Bricolage Grotesque Variable", system-ui, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillStyle = 'rgba(20, 12, 4, 0.82)';
      x.fillText(String(place + 1), 64, 70);
      const number = new Mesh(new PlaneGeometry(0.8, 0.8), new MeshBasicMaterial({ map: new CanvasTexture(c), transparent: true, depthWrite: false }));
      number.position.set(b.x, 0.7, 0.76);
      number.visible = false;
      this.podium.add(number);
      this.blocks.push({ m, h: b.h, up: 0, target: 0, number });
    });
    // A light of the winner's own, straight down on the top step.
    this.spot = beam('#ffe9b0', 12, 1.5, 0.3);
    this.spot.position.set(0, 13.5, 0.1);
    this.spot.visible = false;
    this.scene.add(this.spot);
    this.scene.add(this.podium);
    this.shadowArea(11, [0, 0.7, 0]);
  }

  /* ----------------------------------- the class ----------------------------------- */

  /** Where the i-th of n stands: in rows across the stage, the first row nearest the camera, each row a gentle curve. */
  private home(i: number, n: number): Vector3 {
    const perRow = n <= 8 ? 8 : n <= 18 ? 9 : 11;
    const rows = Math.ceil(n / perRow);
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, n - row * perRow);
    const k = i - row * perRow;
    const gap = Math.min(1.25, (STAGE_R * 1.75) / Math.max(inRow, 1));
    const x = (k - (inRow - 1) / 2) * gap + (row % 2 ? gap * 0.5 : 0) * (inRow < perRow ? 0 : 1);
    const z = 2.9 - row * 1.35 - (rows > 3 ? 0 : 0) - Math.abs(x) * Math.abs(x) * 0.035;
    return new Vector3(x, 0.71, z);
  }

  /** Who is in the room. New arrivals walk on with a wave; people who left are taken off. */
  setCrowd(list: Actor[]) {
    const ids = new Set(list.map((a) => a.id));
    for (const [id, a] of this.actors) {
      if (ids.has(id)) continue;
      this.labels.remove(a.label);
      this.scene.remove(a.glim);
      this.actors.delete(id);
    }
    const first = this.actors.size === 0 && this.clock < 1;
    list.forEach((p, i) => {
      const home = this.home(i, list.length);
      const had = this.actors.get(p.id);
      if (had) {
        had.home.copy(home);
        return;
      }
      const glim = new Glim3D({ look: p.look, quality: this.env.quality, reducedMotion: this.env.reducedMotion });
      glim.position.copy(home);
      // Someone who arrives while the class watches drops in from above; the people already there are simply there.
      const born = first || this.env.reducedMotion ? -10 : this.clock;
      if (born >= 0) glim.position.y += 5;
      this.scene.add(glim);
      const label = this.labels.add(glim, p.name, { offsetY: 1.22, className: 'small world-name', maxDistance: 60 });
      this.actors.set(p.id, { glim, home, born, label, onPodium: false });
      void glim.ready.then(() => this.touch());
    });
    this.showNames();
    this.touch();
  }

  /** A player's Glim does something: hops when its player taps it, throws its arms up for a reaction or a right answer. */
  act(id: string, what: 'hop' | 'cheer' | 'wave') {
    const a = this.actors.get(id);
    if (!a || this.env.reducedMotion) return;
    a.glim.play(what === 'hop' ? 'celebrate' : what);
    if (what === 'cheer') setTimeout(() => a.glim.play('idle'), 1400);
    this.touch(120);
  }

  /** Everyone at once: the room got it right, or the game is won. */
  cheer() {
    if (this.env.reducedMotion) return;
    for (const a of this.actors.values()) a.glim.play('cheer');
    setTimeout(() => {
      for (const a of this.actors.values()) if (!a.onPodium) a.glim.play('idle');
    }, 1800);
    this.touch(150);
  }

  /* ---------------------------------- the camera ---------------------------------- */

  setShot(shot: Shot) {
    if (shot === this.shot) return;
    this.shot = shot;
    const s = SHOTS[shot];
    this.cam.set(s.pos, s.look);
    // While a question is being read the place steps back: dimmer, so the words have the light.
    this.levelTarget = shot === 'question' || shot === 'reveal' ? 0.62 : 1;
    this.names = shot === 'lobby' || shot === 'ready';
    this.showNames();
    if (shot !== 'podium') this.clearPodium();
    this.arrange();
    this.touch(200);
  }

  /** Where everyone stands for this moment: in rows facing the room, or in a curve behind the podium, watching. */
  private arrange() {
    const all = [...this.actors.values()];
    const watching = all.filter((a) => !a.onPodium);
    all.forEach((a, i) => {
      if (a.onPodium) return;
      if (this.shot !== 'podium') {
        a.home.copy(this.home(i, all.length));
        return;
      }
      const k = watching.indexOf(a);
      const n = Math.max(watching.length, 1);
      const turn = Math.PI * (0.16 + (0.68 * (k + 0.5)) / n);
      const ring = k % 2 ? 4.9 : 3.9;
      a.home.set(Math.cos(turn) * ring, 0.71, -Math.sin(turn) * ring * 0.8 - 0.6);
    });
  }

  private showNames() {
    // Names over a whole class are a wall of words: they show while there is room for them.
    const on = this.names && this.actors.size <= 16;
    for (const a of this.actors.values()) if (a.label) a.label.el.style.display = on && !a.onPodium ? '' : 'none';
  }

  /* ---------------------------------- the podium ---------------------------------- */

  /**
   * The end of a game. `risen` blocks have come up out of the stage and `landed` players stand on
   * theirs, in the ceremony's order (third place first); the page's own clock says when (ceremony.ts).
   */
  setPodium(places: PodiumPlace[], order: number[], risen: number, landed: number) {
    if (places !== this.podiumPlaces) {
      this.podiumPlaces = places;
      this.landed = 0;
    }
    order.forEach((place, index) => {
      const b = this.blocks[place];
      if (!b) return;
      b.m.visible = index < risen || b.up > 0;
      b.target = index < risen ? 1 : 0;
      if (this.env.reducedMotion) b.up = b.target;
    });
    for (let index = this.landed; index < landed; index++) {
      const place = order[index];
      const who = places.find((p) => p.place === place);
      const b = place === undefined ? undefined : this.blocks[place];
      if (!who || !b) continue;
      const a = this.actors.get(who.id);
      if (a) {
        a.onPodium = true;
        a.home.set(BLOCK[place!]!.x, 0.7 + b.h, 0.1);
        if (!this.env.reducedMotion) {
          a.glim.position.set(a.home.x, a.home.y + 4, a.home.z);
          a.born = this.clock;
        }
        a.glim.play(place === 0 ? 'celebrate' : 'cheer');
        if (a.label) a.label.el.style.display = 'none';
        const plate = this.labels.add(a.glim, `${who.name} · ${who.score}`, { offsetY: 1.3, className: place === 0 ? 'big tone-gold world-name' : 'world-name', maxDistance: 80 });
        this.podiumLabels.push(plate);
      }
      if (!this.env.reducedMotion) {
        const at = new Vector3(BLOCK[place!]!.x, 0.9 + b.h, 0.4);
        this.fx.burst(at, { count: place === 0 ? 90 : 36, color: this.theme.confetti, shape: 'square', speed: place === 0 ? 7 : 5, spread: 0.55, gravity: 6, life: 2.6, size: 0.16 });
        if (place === 0) this.fx.burst(at, { count: 40, color: ['#ffffff', '#ffe58a'], shape: 'star', speed: 5, spread: 1, gravity: 2, life: 1.6, size: 0.22, glow: true });
      }
    }
    this.landed = Math.max(this.landed, landed);
    this.arrange();
    this.touch(300);
  }

  private clearPodium() {
    if (!this.podiumPlaces.length && !this.blocks.some((b) => b.up > 0)) return;
    this.podiumPlaces = [];
    this.landed = 0;
    for (const l of this.podiumLabels) this.labels.remove(l);
    this.podiumLabels = [];
    for (const b of this.blocks) b.target = 0;
    let i = 0;
    for (const a of this.actors.values()) {
      if (a.onPodium) {
        a.onPodium = false;
        a.home.copy(this.home(i, this.actors.size));
      }
      i++;
    }
  }

  /* ------------------------------------ time ------------------------------------ */

  /** Something changed: draw for a while even if this screen otherwise holds still. */
  private touch(frames = 90) {
    // A still picture needs drawing only a few times to be right: everything in it arrives at once.
    this.dirty = Math.max(this.dirty, this.env.reducedMotion ? 3 : frames);
  }

  override wantsFrame(): boolean {
    // With less motion the place is a still picture, drawn again only when something in it has changed.
    if (!this.env.reducedMotion) return true;
    if (this.dirty <= 0) return false;
    this.dirty--;
    return true;
  }

  tick(dt: number, t: number) {
    this.clock = t;
    const still = this.env.reducedMotion;
    this.level += (this.levelTarget - this.level) * Math.min(1, dt * 2.5);
    this.env.renderer.toneMappingExposure = this.level;

    if (!still) {
      for (const d of this.drifting) {
        d.o.position.y += d.speed * dt;
        if (d.o.position.y > d.top) d.o.position.y = d.floor;
        d.o.position.x = d.x + Math.sin(t * 0.3 + d.phase) * d.sway;
        d.o.rotation.y = Math.sin(t * 0.4 + d.phase) * 0.4;
      }
      for (const b of this.beams) b.m.rotation.z = b.base + Math.sin(t * b.rate + b.phase) * 0.1;
      for (const b of this.bulbs) b.m.scale.setScalar(1 + Math.sin(t * 2.2 + b.phase) * 0.12);
      if (this.motes) {
        this.motes.rotation.y = Math.sin(t * 0.05) * 0.2;
        this.motes.position.y = Math.sin(t * 0.12) * 0.4;
      }
      // The camera is never quite still: it drifts a little round whatever it is watching.
      const s = SHOTS[this.shot];
      this.cam.pos.set(s.pos[0] + Math.sin(t * 0.13) * 0.55, s.pos[1] + Math.sin(t * 0.09) * 0.16, s.pos[2]);
    }
    this.cam.update(dt);

    for (const b of this.blocks) {
      b.up += (b.target - b.up) * Math.min(1, dt * (still ? 100 : 5));
      if (b.target === 0 && b.up < 0.01) {
        b.up = 0;
        b.m.visible = false;
      }
      b.m.scale.y = Math.max(0.001, b.h * b.up);
      b.number.visible = b.up > 0.6;
      b.number.position.y = 0.7 + b.h * b.up * 0.5;
    }
    if (this.spot) this.spot.visible = this.shot === 'podium' && this.landed >= this.podiumPlaces.length && this.podiumPlaces.length > 0;
    let i = 0;
    for (const a of this.actors.values()) {
      const g = a.glim;
      const age = t - a.born;
      // Arriving: down out of the air with a bounce, then a wave to the room.
      if (a.born >= 0 && age < 0.9 && !still) {
        const k = Math.min(1, age / 0.55);
        const fall = 1 - (1 - k) * (1 - k);
        g.position.set(a.home.x, a.home.y + (a.onPodium ? 4 : 5) * (1 - fall) + (k >= 1 ? Math.sin((age - 0.55) * 9) * 0.12 * (0.9 - age) : 0), a.home.z);
        if (age - dt < 0.55 && age >= 0.55) {
          if (!a.onPodium) g.play('wave');
          this.fx.burst(new Vector3(a.home.x, a.home.y + 0.1, a.home.z), { count: 14, color: this.theme.confetti, shape: 'star', speed: 3, spread: 1, gravity: 3, life: 0.9, size: 0.16, glow: true });
        }
      } else {
        g.position.lerp(a.home, Math.min(1, dt * (still ? 100 : 4)));
      }
      // Everyone faces the room; no two stand at quite the same angle.
      g.rotation.y = Math.sin(i * 12.9898) * 0.16 - a.home.x * 0.03;
      g.update(dt);
      i++;
    }
  }
}

/** A dome of light behind a place: an aurora, a nebula, the glow of a market. Used by the worlds' own scenery. */
export function skyGlow(color: string, radius: number, opacity: number): Mesh {
  const m = new Mesh(new SphereGeometry(radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new MeshBasicMaterial({ color, transparent: true, opacity, side: BackSide, blending: AdditiveBlending, depthWrite: false, fog: false }));
  m.renderOrder = -5;
  return m;
}
