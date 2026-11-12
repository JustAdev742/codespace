import { BoxGeometry, CatmullRomCurve3, Group, InstancedMesh, Matrix4, Mesh, Object3D, Vector3, ConeGeometry, CylinderGeometry } from 'three';
import type { Blueprint, GlimArt } from '@ludora/shared';
import { DAY, DUSK, NIGHT, EaseCamera, Glim3D, World, disposeTree, props, toon, type GlimLook, type StageEnv } from '../../../three/index.ts';

/*
 * The 3D scene family for made races and climbs: a path of stepping stones through one of five
 * places (meadow, harbour, canyon, snowfield, old town), shaped straight, zigzag or as a loop, with
 * the maker's props, colours, time of day and camera. Built only from the engine's own pieces
 * (toon materials, props, Glims). It draws the view; it decides nothing.
 */

export interface PathRunner {
  playerId: string;
  name: string;
  score: number;
  look: GlimLook;
  me: boolean;
}

/** Most Glims drawn at once (the engine's budget is about 30 on screen). */
export const MAX_RUNNERS = 30;

const PLACES: Record<Blueprint['look']['scene']['place'], { ground: string; path: string; side: string }> = {
  meadow: { ground: '#78ad55', path: '#e8d9b0', side: '#5f9443' },
  harbour: { ground: '#9fb7c6', path: '#d9cdb4', side: '#6f8798' },
  canyon: { ground: '#c98a5a', path: '#ead2a8', side: '#a8653b' },
  snowfield: { ground: '#e9f1f8', path: '#9cb7cf', side: '#c9d9e8' },
  'old-town': { ground: '#8d8a86', path: '#d7c49c', side: '#6c6764' },
};

function curveFor(shape: Blueprint['look']['scene']['shape'], climb: boolean): CatmullRomCurve3 {
  const pts: Vector3[] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let x = 0;
    let z = -t * 40;
    if (shape === 'zigzag') x = Math.sin(t * Math.PI * 3) * 6;
    if (shape === 'loop') {
      const a = t * Math.PI * 1.7;
      x = Math.sin(a) * 12;
      z = -(1 - Math.cos(a)) * 12;
    }
    pts.push(new Vector3(x, climb ? t * 14 : 0, z));
  }
  return new CatmullRomCurve3(pts);
}

export class MadePathScene extends World {
  private readonly curve: CatmullRomCurve3;
  private readonly steps: number;
  private readonly runners = new Map<string, { glim: Glim3D; label: ReturnType<World['labels']['add']> | null; at: number; want: number; lane: number }>();
  private readonly cam: EaseCamera;
  private readonly world = new Group();
  private me: string | null = null;

  constructor(
    env: StageEnv,
    private readonly bp: Blueprint,
    private readonly big: boolean,
  ) {
    super(env, bp.look.scene.time === 'night' ? NIGHT : bp.look.scene.time === 'dusk' ? DUSK : DAY, 50);
    const k = bp.kind;
    const climb = k.type === 'climb';
    this.steps = k.type === 'race' ? k.length : k.type === 'climb' ? k.height : 20;
    this.curve = curveFor(bp.look.scene.shape, climb);
    this.cam = new EaseCamera(this.camera, env.reducedMotion);
    const place = PLACES[bp.look.scene.place];
    const ink = env.quality.outlines;
    this.scene.add(this.world);

    const field = props.ground(160, 160, place.ground);
    field.position.set(0, -0.02, -20);
    this.world.add(field);
    if (bp.look.scene.place === 'harbour') {
      const sea = props.water(160, 40, { calm: true });
      sea.position.set(0, 0.03, 30);
      this.world.add(sea);
    }

    // The stepping stones: one instanced mesh for the path, in the maker's colours.
    const stone = new BoxGeometry(1.6, 0.25, 1.1);
    const stones = new InstancedMesh(stone, toon(`hsl(${bp.look.hue} 60% 62%)`), this.steps + 1);
    const m = new Matrix4();
    const o = new Object3D();
    for (let i = 0; i <= this.steps; i++) {
      const p = this.curve.getPointAt(i / this.steps);
      const ahead = this.curve.getTangentAt(Math.min(1, i / this.steps));
      o.position.copy(p);
      o.rotation.set(0, Math.atan2(ahead.x, ahead.z), 0);
      o.updateMatrix();
      m.copy(o.matrix);
      stones.setMatrixAt(i, m);
    }
    stones.receiveShadow = env.quality.shadows;
    this.world.add(stones);
    // Climbs: a rock face rising behind the path.
    if (climb) {
      const cliff = new Mesh(new ConeGeometry(30, 22, 7), toon(place.side));
      cliff.position.set(0, 4, -50);
      this.world.add(cliff);
    }
    // The finish: a flag pole in the accent colour.
    const end = this.curve.getPointAt(1);
    const pole = new Mesh(new CylinderGeometry(0.06, 0.06, 3, 8), toon('#e9e4d8'));
    pole.position.set(end.x + 1.2, end.y + 1.5, end.z);
    const flag = new Mesh(new BoxGeometry(1, 0.6, 0.05), toon(`hsl(${bp.look.accent} 85% 60%)`));
    flag.position.set(end.x + 1.7, end.y + 2.6, end.z);
    this.world.add(pole, flag);

    // Props along both sides, seeded from the blueprint so every screen draws the same place.
    const rnd = props.seeded(bp.look.hue * 7 + this.steps);
    const chosen = bp.look.scene.props.length ? bp.look.scene.props : ['trees'];
    const count = env.quality.tier === 'low' ? 14 : 28;
    for (let i = 0; i < count; i++) {
      const t = rnd();
      const p = this.curve.getPointAt(t);
      const side = rnd() < 0.5 ? -1 : 1;
      const kind = chosen[i % chosen.length];
      let thing: Object3D;
      switch (kind) {
        case 'rocks':
          thing = props.rock({ scale: 0.5 + rnd() * 0.6, seed: i + 1, ink });
          break;
        case 'crates':
          thing = props.crate({ ink });
          break;
        case 'lamps':
          thing = props.lampPost({ hue: bp.look.accent, ink });
          break;
        case 'tents':
          thing = props.tent({ ink, color: `hsl(${bp.look.accent} 50% 82%)` });
          break;
        case 'flags':
          thing = props.bunting(3, { colors: [`hsl(${bp.look.hue} 80% 60%)`, `hsl(${bp.look.accent} 80% 60%)`] });
          break;
        default:
          thing = props.tree(bp.look.scene.place === 'snowfield' ? 'pine' : bp.look.scene.place === 'harbour' ? 'palm' : 'round', { ink, scale: 0.8 + rnd() * 0.5 });
      }
      thing.position.set(p.x + side * (2.4 + rnd() * 4), p.y, p.z + (rnd() - 0.5) * 2);
      this.world.add(thing);
    }
    this.shadowArea(30, [0, 0, -20]);
  }

  private pointFor(score: number, lane: number): Vector3 {
    const t = Math.max(0, Math.min(1, score / this.steps));
    const p = this.curve.getPointAt(t);
    const tan = this.curve.getTangentAt(t);
    // Lanes side by side across the path, so a crowd on one stone stays readable.
    const across = new Vector3(tan.z, 0, -tan.x).normalize();
    return p.addScaledVector(across, lane).add(new Vector3(0, 0.15, 0));
  }

  /** Draw calls and triangles of the last frame, kept on the canvas so a test can read the scene's cost. */
  override afterRender() {
    super.afterRender();
    const info = this.env.renderer.info.render;
    const el = this.env.renderer.domElement;
    el.dataset.calls = String(info.calls);
    el.dataset.triangles = String(info.triangles);
    el.dataset.glims = String(this.runners.size);
  }

  setRunners(runners: PathRunner[]) {
    const top = runners.slice(0, MAX_RUNNERS);
    const ids = new Set(top.map((r) => r.playerId));
    for (const [id, r] of this.runners) {
      if (!ids.has(id)) {
        r.glim.removeFromParent();
        disposeTree(r.glim);
        this.labels.remove(r.label);
        this.runners.delete(id);
      }
    }
    top.forEach((r, i) => {
      let got = this.runners.get(r.playerId);
      const lane = ((i % 5) - 2) * 0.45;
      if (!got) {
        const glim = new Glim3D({ look: r.look, quality: this.env.quality, reducedMotion: this.env.reducedMotion });
        glim.scale.setScalar(0.7);
        glim.position.copy(this.pointFor(r.score, lane));
        this.world.add(glim);
        // Name tags for you and the leaders only: a crowd of tags hides the picture.
        const label = r.me || i < 8 ? this.labels.add(glim, r.me ? 'You' : r.name, { offsetY: 1.0, className: r.me ? 'me small' : 'small' }) : null;
        got = { glim, label, at: r.score, want: r.score, lane };
        this.runners.set(r.playerId, got);
      }
      const tagged = r.me || i < 8;
      if (tagged && !got.label) got.label = this.labels.add(got.glim, r.me ? 'You' : r.name, { offsetY: 1.0, className: r.me ? 'me small' : 'small' });
      if (!tagged && got.label) {
        this.labels.remove(got.label);
        got.label = null;
      }
      if (r.score > got.want) got.glim.play('cheer');
      got.want = r.score;
      got.lane = lane;
      if (r.me) this.me = r.playerId;
    });
  }

  tick(dt: number) {
    let lead: Vector3 | null = null;
    let leadAt = -1;
    let mine: Vector3 | null = null;
    for (const [id, r] of this.runners) {
      const before = r.at;
      r.at += (r.want - r.at) * Math.min(1, dt * 3);
      if (Math.abs(r.want - r.at) < 0.01) r.at = r.want;
      const pos = this.pointFor(r.at, r.lane);
      const ahead = this.pointFor(r.at + 0.3, r.lane);
      r.glim.position.copy(pos);
      r.glim.rotation.y = Math.atan2(ahead.x - pos.x, ahead.z - pos.z);
      r.glim.setMoving(Math.abs(r.at - before) / Math.max(dt, 1e-3) > 0.05 ? 2 : 0);
      r.glim.update(dt);
      if (r.at > leadAt) {
        leadAt = r.at;
        lead = pos;
      }
      if (id === this.me) mine = pos;
    }
    const focus = (this.big ? lead : (mine ?? lead)) ?? this.curve.getPointAt(0);
    const camMode = this.bp.look.scene.camera;
    if (camMode === 'overview' || (this.big && camMode !== 'side')) {
      // The whole track in view: from behind the start line, high enough to see the finish.
      const a = this.curve.getPointAt(0);
      const b = this.curve.getPointAt(1);
      const mid = this.curve.getPointAt(0.5);
      const span = a.distanceTo(b) + 12;
      this.cam.set([(a.x + b.x) / 2, mid.y + span * 0.5, a.z + span * 0.32], [(a.x + b.x) / 2, mid.y, (a.z + b.z) / 2 + 3]);
    } else if (camMode === 'side') this.cam.set([focus.x + 12, focus.y + 5, focus.z + 3], [focus.x, focus.y + 0.5, focus.z - 2]);
    else this.cam.set([focus.x, focus.y + 4.5, focus.z + 8], [focus.x, focus.y + 0.6, focus.z - 4]);
    this.cam.update(dt);
  }
}

export function lookOf(avatar: { art: GlimArt; accessories?: GlimLook['accessories']; rarity?: GlimLook['rarity']; uniform?: GlimLook['dress'] } | null | undefined, fallback: GlimArt): GlimLook {
  return avatar ? { art: avatar.art, accessories: avatar.accessories, rarity: avatar.rarity, dress: avatar.uniform ?? null } : { art: fallback, dress: null };
}
