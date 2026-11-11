// Development-only gallery of 3D Glims and props, for art work. Served by Vite at /dev/three.html; not part of the app build.
//
// ?collection=meadow  the collection to line up (default meadow)
// ?ids=glim-a,glim-b  particular Glims instead
// ?action=walk|dig|cheer|wave|cast|reel|type|hit  what they do (default: a little of everything)
// ?quality=low|medium|high
import { createRoot } from 'react-dom/client';
import { Mesh, CylinderGeometry, Vector3 } from 'three';
import { GLIMS } from '@ludora/content';
import { createRng, type GlimArt, type PulseView, type Rarity } from '@ludora/shared';
import { FLAGS, type BeamView, type CrateView, type GlowTagHostView, type GlowTagPlayer, type GlowTagPlayerView, type GlowTagPulse, type GlowTagYou } from '@ludora/engine/glow-tag';
import { arenaSize, edgeSpots, generateMap, headingTo, pushOut, walk } from '@ludora/engine/glow-tag-arena';
import '../src/styles/app.css';
import { Stage3D } from '../src/three/Stage3D.tsx';
import { World, DAY, type StageEnv } from '../src/three/World.ts';
import { Glim3D, type GlimAction } from '../src/three/glim3d.ts';
import { toon } from '../src/three/toon.ts';
import * as props from '../src/three/props.ts';
import { storeChoice } from '../src/three/quality.ts';
import { GoldRushScene, GoldFieldScene, type FindKind } from '../src/features/room/modes/gold-rush-scene.ts';
import { CodeBreakersScene, CitySkylineScene, VAULT_ID, type CityEvent, type CityPacket, type CityState, type CityTower } from '../src/features/room/modes/code-breakers-scene.ts';
import { BigCatchScene, JettyScene, type CatchState, type Phase } from '../src/features/room/modes/big-catch-scene.ts';
import { speciesOf, sizeCm, type WaterId } from '@ludora/engine/big-catch';
import { Field } from '../src/features/room/modes/glow-tag-field.ts';
import { GlowTagHostScene, GlowTagScene } from '../src/features/room/modes/glow-tag-scene.ts';
import { SummitHostScene, SummitScene, type MoveKind, type SceneClimber } from '../src/features/room/modes/summit-scene.ts';
import { TowerHostScene, TowerScene, type SceneState as TowerState } from '../src/features/room/modes/tower-scene.ts';
import { RallyField } from '../src/features/room/modes/lantern-rally-field.ts';
import { RallyHostScene, RallyScene } from '../src/features/room/modes/lantern-rally-scene.ts';
import { CIRCUIT_IDS, lapLength, type CircuitId } from '@ludora/engine/lantern-rally';
import { SpotKickReelScene, SpotKickScene, type Aim, type KickShot, type Outcome, type ShotHow } from '../src/features/room/modes/spot-kick-scene.ts';
import { GardenHostScene, GardenScene } from '../src/features/room/modes/glim-garden-scene.ts';
import { KINDS as PLANT_KINDS, PLANTS, type PlotView } from '@ludora/engine/glim-garden';

const params = new URLSearchParams(location.search);
const q = params.get('quality');
if (q === 'low' || q === 'medium' || q === 'high') storeChoice(q);
const ids = params.get('ids')?.split(',');
const collection = params.get('collection') ?? 'meadow';
const picked = GLIMS.filter((g) => (ids ? ids.includes(g.id) : g.collectionId === collection)).slice(0, 14);
const ACTIONS: (GlimAction | 'walk')[] = ['walk', 'wave', 'dig', 'cheer', 'cast', 'reel', 'type', 'hit'];
const fixed = params.get('action') as GlimAction | 'walk' | null;

class Gallery extends World {
  glims: Glim3D[] = [];
  water: ReturnType<typeof props.water> | null = null;
  constructor(env: StageEnv) {
    super(env, DAY);
    (window as unknown as { __world: unknown }).__world = this;
    const ground = new Mesh(new CylinderGeometry(14, 14, 0.4, 48), toon('#7fbf5a'));
    ground.position.y = -0.2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const ink = env.quality.outlines;
    const kit: [ReturnType<typeof props.tree> | ReturnType<typeof props.rock>, number, number][] = [
      [props.tree('round', { ink }), -6, -5],
      [props.tree('gum', { ink }), -3.5, -7],
      [props.tree('pine', { ink }), 4, -6],
      [props.tree('palm', { ink }), 7, -4],
      [props.bush({ ink }), -5, -2.5],
      [props.rock({ ink, scale: 0.7 }), 5.5, -2],
      [props.crate({ ink }), 3, -3.5],
      [props.barrel({ ink }), 4.2, -3],
      [props.tent({ ink }), -1, -6],
      [props.lampPost({ ink }), 1.8, -4.5],
      [props.sign('Ludora', { ink }), -2.8, -3.6],
      [props.fence(4, { ink }), 0.5, -8],
    ];
    for (const [o, x, z] of kit) {
      o.position.set(x, 0, z);
      this.scene.add(o);
    }
    const w = props.water(10, 4);
    w.position.set(0, 0.05, -11);
    this.scene.add(w);
    this.water = w;
    for (const [i, m] of [props.nugget({ ink }), props.gem({ ink }), props.coin({ ink }), props.lantern({ ink, scale: 0.7 })].entries()) {
      m.position.set(-1.5 + i, 0.15, 2.2);
      this.scene.add(m);
    }
    const cols = Math.min(7, picked.length);
    picked.forEach((g, i) => {
      const glim = new Glim3D({ look: { art: g.art as GlimArt, rarity: g.rarity as Rarity }, quality: env.quality, reducedMotion: env.reducedMotion });
      const row = Math.floor(i / cols);
      const col = i % cols;
      glim.position.set((col - (cols - 1) / 2) * 1.25, 0, row * -1.6);
      this.scene.add(glim);
      this.labels.add(glim, g.name, { offsetY: 1.25, className: 'small' });
      this.glims.push(glim);
    });
    this.camera.position.set(0, 2.2, 7.5);
    this.camera.lookAt(new Vector3(0, 0.6, -0.8));
    this.shadowArea(8, [0, 0, -1]);
  }
  tick(dt: number, t: number) {
    this.water?.time(t);
    if (Math.floor(t * 2) !== Math.floor((t - dt) * 2) && Math.floor(t) % 3 === 0) this.fx.burst(new Vector3(0, 0.4, 2.2), { color: ['#ffd25a', '#fff2b0'], shape: 'star', glow: true, count: 18 });
    this.glims.forEach((g, i) => {
      const a = fixed ?? ACTIONS[(Math.floor(t / 3) + i) % ACTIONS.length]!;
      if (a === 'walk') g.setMoving(1.5);
      else {
        g.setMoving(0);
        g.play(a);
      }
      g.update(dt);
    });
  }
}

// ?scene=gold&depth=6  the Gold Rush mine, digging a find every few seconds. ?scene=field  the big screen's goldfield.
const sceneName = params.get('scene');
const depth = Number(params.get('depth') ?? 5);
const KINDS: FindKind[] = ['nugget', 'dust', 'bonanza', 'vein', 'water', 'relic', 'map', 'cavein'];

function makeGold(env: StageEnv) {
  const g = GLIMS.find((x) => x.id === (ids?.[0] ?? 'glim-sprig'))!;
  const w = new GoldRushScene(env, { art: g.art as GlimArt, rarity: g.rarity as Rarity }, 12);
  (window as unknown as { __world: unknown }).__world = w;
  w.setState({ depth, cart: 120, find: null, bankedAt: 0, lastBank: 0, event: 'fever' });
  let seq = 1;
  let d = depth;
  setInterval(() => {
    const kind = KINDS[seq % KINDS.length]!;
    d = kind === 'cavein' ? 0 : Math.min(12, d + 1);
    w.setState({ depth: d, cart: 120 + seq * 30, find: { seq: ++seq, kind, level: kind === 'cavein' ? d + 1 : d, gold: 60 + seq * 5, big: kind === 'bonanza' }, bankedAt: 0, lastBank: 0, event: 'fever' });
  }, 4000);
  return w;
}

function makeField(env: StageEnv) {
  const w = new GoldFieldScene(env, 12);
  (window as unknown as { __world: unknown }).__world = w;
  const miners = GLIMS.slice(0, 10).map((g, i) => ({ playerId: g.id, name: g.name, depth: (i * 3) % 11, cart: i * 40, banked: 900 - i * 70, lastKind: null, lastSeq: 0, bankedAt: 0, look: { art: g.art as GlimArt, rarity: g.rarity as Rarity } }));
  w.setMiners(miners);
  return w;
}

// ?scene=city  Code Breakers' desk and city, with hacks flying every few seconds. ?scene=skyline  the big screen's city.
// &heist=1 adds the vault; &event=storm|bounty|glitch sets the sky.
const heist = params.get('heist') === '1';
const cityEvent = params.get('event') as CityEvent | null;

function fakeCity(n: number, me: string | null): CityState {
  const towers: CityTower[] = GLIMS.slice(0, n).map((g, i) => ({ playerId: g.id, name: g.name, bits: Math.round(2600 / (1 + i * 0.45)), firewall: i % 4 === 1 ? 1 : i % 7 === 3 ? 2 : 0, twoFactor: i % 3 === 0, hue: (i * 47) % 360, me: g.id === me }));
  return { towers, vault: heist ? { bits: 640, cracks: 0 } : null, event: cityEvent, bounty: cityEvent === 'bounty' ? [towers[0]!.playerId] : null, packets: [] };
}

const OUTCOMES: CityPacket['outcome'][] = ['stolen', 'firewall', 'wrong', 'twoFactor'];

function makeCity(env: StageEnv) {
  const g = GLIMS.find((x) => x.id === (ids?.[0] ?? 'glim-sprig')) ?? GLIMS[0]!;
  const w = new CodeBreakersScene(env, { art: g.art as GlimArt, rarity: g.rarity as Rarity }, heist);
  (window as unknown as { __world: unknown }).__world = w;
  const base = fakeCity(12, GLIMS[3]!.id);
  w.setState({ ...base, me: GLIMS[3]!.id, hacking: false });
  let k = 0;
  setInterval(() => {
    k++;
    const towers = base.towers;
    const mine = k % 2 === 0;
    const other = towers[(k * 5) % towers.length]!.playerId;
    const from = mine ? GLIMS[3]!.id : other;
    const to = mine ? (heist && k % 4 === 0 ? VAULT_ID : towers[(k * 3) % towers.length]!.playerId) : GLIMS[3]!.id;
    const packets: CityPacket[] = [{ id: String(k), from, to: from === to ? towers[0]!.playerId : to, outcome: OUTCOMES[k % OUTCOMES.length]!, bits: 120 }];
    w.setState({ ...base, vault: heist ? { bits: 640 + k * 20, cracks: Math.floor(k / 4) } : null, me: GLIMS[3]!.id, hacking: k % 3 === 0, packets });
  }, 3000);
  return w;
}

function makeSkyline(env: StageEnv) {
  const w = new CitySkylineScene(env);
  (window as unknown as { __world: unknown }).__world = w;
  const base = fakeCity(30, null);
  w.setState(base);
  let k = 0;
  setInterval(() => {
    k++;
    const t = base.towers;
    const packets: CityPacket[] = [0, 1].map((j) => ({ id: `${k}-${j}`, from: t[(k * 7 + j) % t.length]!.playerId, to: heist && j === 1 ? VAULT_ID : t[(k * 3 + j + 1) % t.length]!.playerId, outcome: OUTCOMES[(k + j) % OUTCOMES.length]!, bits: 150 }));
    w.setState({ ...base, vault: heist ? { bits: 900, cracks: Math.floor(k / 3) } : null, packets });
  }, 2500);
  return w;
}

// ?scene=catch&water=river|estuary|reef  Big Catch's jetty, fishing round and round: cast, bite, land, then sell or tank.
// ?scene=jetty&water=reef  the big screen's long jetty with fourteen anglers in every state.
const water = (params.get('water') ?? 'river') as WaterId;

function makeCatch(env: StageEnv) {
  const g = GLIMS.find((x) => x.id === (ids?.[0] ?? 'glim-sprig'))!;
  const w = new BigCatchScene(env, { art: g.art as GlimArt, rarity: g.rarity as Rarity });
  (window as unknown as { __world: unknown }).__world = w;
  const fishes = speciesOf(water);
  const tank: CatchState['tank'] = [];
  let seq = 0;
  let id = 0;
  const base = (): CatchState => ({ water, event: 'golden', phase: 'idle', seq, fish: null, outcome: null, tank: [...tank] });
  w.setState(base());
  const step = (k: number) => {
    const sp = fishes[seq % fishes.length]!;
    const grams = Math.round(((sp.kg[0] + sp.kg[1]) / 2) * 1000);
    const fish = { id: ++id, species: sp.id, grams, cm: sizeCm(sp, grams), perfect: seq % 2 === 0 };
    if (k === 0) {
      seq++;
      w.setState({ ...base(), phase: 'waiting', seq });
    } else if (k === 1) w.setState({ ...base(), phase: 'biting' });
    else if (k === 2) w.setState({ ...base(), phase: 'landed', fish });
    else {
      const kind = seq % 3 === 0 ? 'escaped' : seq % 2 ? 'sold' : 'tanked';
      if (kind === 'tanked' && tank.length < 6) tank.push({ id: fish.id, species: fish.species });
      w.setState({ ...base(), outcome: { seq, at: Date.now(), kind, fish: kind === 'escaped' ? null : fish, points: Math.round(grams / 100) } });
    }
  };
  let k = 0;
  setInterval(() => step(k++ % 4), 2200);
  return w;
}

function makeJetty(env: StageEnv) {
  const w = new JettyScene(env);
  (window as unknown as { __world: unknown }).__world = w;
  w.setWater(water);
  const phases: Phase[] = ['idle', 'waiting', 'biting', 'landed'];
  const fishes = speciesOf(water);
  const anglers = (t: number) =>
    GLIMS.slice(0, 14).map((g, i) => {
      const phase = phases[(i + t) % 4]!;
      const sp = fishes[i % fishes.length]!;
      return { playerId: g.id, name: g.name, phase, castAt: phase === 'idle' ? null : t, species: phase === 'landed' ? sp.id : null, grams: phase === 'landed' ? Math.round(sp.kg[1] * 600) : null, look: { art: g.art as GlimArt, rarity: g.rarity as Rarity } };
    });
  let t = 0;
  w.setAnglers(anglers(t));
  setInterval(() => w.setAnglers(anglers(++t)), 8000);
  return w;
}

// ?scene=glowtag  Glow Tag's park behind your Glim, with bots walking and tagging (fake views and pulses, no rules).
// ?scene=glowtag-host  the big screen's overview. &players=12  &dimmed=1 (you are dimmed)  &walk=1 (you walk in circles)  &lights=out
function makeGlowTag(env: StageEnv, host: boolean) {
  const n = Math.max(2, Math.min(40, Number(params.get('players') ?? 12)));
  const size = arenaSize(n);
  const half = size / 2;
  const map = generateMap(size, createRng(`gallery-${n}`));
  const rnd = createRng('gallery-walk');
  const t0 = performance.now();
  const now = () => performance.now() - t0 + 100_000;
  const dimmed = params.get('dimmed') === '1';
  const lightsOut = params.get('lights') === 'out';
  const meId = host ? null : 'me';
  const field = new Field(map, meId, now);
  const glims = GLIMS.slice(0, n);
  const lookOfId = (id: string) => {
    const g = glims[Math.abs([...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % glims.length]!;
    return { art: g.art as GlimArt, rarity: g.rarity as Rarity };
  };
  // Everyone starts round the edge; you stand a few steps in, with a few bots ahead of you.
  const spots = edgeSpots(size, n, 0.07);
  const bots = spots.map((sp, i) => {
    const id = i === 0 ? 'me' : `bot-${i}`;
    let { x, z } = sp;
    if (i === 0) [x, z] = walk(map, x, z, x * 0.62, z * 0.62);
    else if (i <= 3) [x, z] = pushOut(map, spots[0]!.x * 0.3 + (i - 2) * 4, spots[0]!.z * 0.3 + (i - 2) * 2.5);
    return { id, name: i === 0 ? 'You' : (glims[i]?.name ?? `Bot ${i}`), x, z, h: i === 0 ? headingTo(x, z, 0, 0) : sp.h, glow: 1 + (i % 3), tx: x, tz: z };
  });
  const ring = { x: 2, z: -3, r: Math.round(half * 0.7 * 10) / 10 };
  const next = { x: 4, z: -1, r: Math.round(half * 0.45 * 10) / 10, startAt: now() + 40_000, endAt: now() + 55_000 };
  const crates: CrateView[] = (['charge', 'shield', 'speed'] as const).map((kind, i) => {
    const [x, z] = pushOut(map, bots[0]!.x * 0.5 + (i - 1) * 3, bots[0]!.z * 0.5 + 2);
    return { id: i + 1, kind, x, z };
  });
  const beams: BeamView[] = [];
  const flags = (b: (typeof bots)[number]) => (b.id === 'me' && dimmed ? 0 : FLAGS.in) | (b.id === 'bot-2' ? FLAGS.shield : 0);
  const row = (b: (typeof bots)[number]): GlowTagPlayer => [b.id, b.name, null, b.x, b.z, b.h, b.id === 'me' && dimmed ? 0 : b.glow, flags(b)];
  const me = bots[0]!;
  const you = (): GlowTagYou => ({
    id: 'me',
    team: null,
    x: me.x,
    z: me.z,
    h: me.h,
    glow: dimmed ? 0 : 3,
    maxGlow: 3,
    charges: 4,
    maxCharges: 8,
    cooldownUntil: 0,
    in: !dimmed,
    out: false,
    relight: dimmed ? { have: 1, need: 2 } : null,
    safeUntil: 0,
    shield: false,
    speedUntil: 0,
    lastTag: null,
    lastHit: null,
    score: 300,
    rank: 2,
    tags: 3,
    dims: 1,
    cheer: 0,
    streak: 2,
    question: null,
    last: null,
  });
  const view = (): GlowTagPlayerView & GlowTagHostView => ({
    at: now(),
    endsAt: now() + 180_000,
    map,
    rules: { glow: 3, relight: 2, lightsOut, squads: false },
    ring: { ...ring, from: ring, to: ring, startAt: now() - 30_000, endAt: now() - 15_000, next, phase: 1, phases: 3, final: false, finalAt: now() + 120_000, drainEveryMs: 3000 },
    crates,
    crateOdds: [
      { kind: 'charge', percent: 50 },
      { kind: 'shield', percent: 25 },
      { kind: 'speed', percent: 25 },
    ],
    players: bots.map(row),
    beams: [...beams],
    board: [],
    teams: null,
    glowing: n,
    you: host ? null : you(),
    stats: { tags: 0, dims: 0, relights: 0, crates: 0, ring: 0 },
  });
  field.applyView(view());
  // Bots wander, ten pulses a second; every couple of seconds one of them tags the nearest other player.
  let beamN = 0;
  setInterval(() => {
    for (const b of bots) {
      if (b.id === 'me') continue;
      if (Math.hypot(b.tx - b.x, b.tz - b.z) < 0.6 || rnd.next() < 0.01) {
        b.tx = (rnd.next() - 0.5) * size * 0.85;
        b.tz = (rnd.next() - 0.5) * size * 0.85;
      }
      const d = Math.hypot(b.tx - b.x, b.tz - b.z) || 1;
      const step = Math.min(d, 0.45);
      const [nx, nz] = walk(map, b.x, b.z, b.x + ((b.tx - b.x) / d) * step, b.z + ((b.tz - b.z) / d) * step);
      if (Math.hypot(nx - b.x, nz - b.z) > 0.02) b.h = headingTo(b.x, b.z, nx, nz);
      else b.tx = b.x;
      b.x = nx;
      b.z = nz;
    }
    const t = now();
    const p: PulseView<GlowTagPulse> = {
      gameNow: t,
      d: { t, ring: [ring.x * 10, ring.z * 10, ring.r * 10], p: bots.map((b) => [b.id, Math.round(b.x * 10), Math.round(b.z * 10), Math.round(b.h * 100), flags(b), b.glow]) },
    };
    field.applyPulse(p);
  }, 100);
  setInterval(() => {
    const by = bots[1 + (beamN % (bots.length - 1))]!;
    const target = bots.filter((b) => b !== by && !(b.id === 'me' && dimmed)).sort((a, b) => Math.hypot(a.x - by.x, a.z - by.z) - Math.hypot(b.x - by.x, b.z - by.z))[0]!;
    by.h = headingTo(by.x, by.z, target.x, target.z);
    beams.push({ n: ++beamN, by: by.id, to: target.id, x1: by.x, z1: by.z, x2: target.x, z2: target.z, at: now(), outcome: target.id === 'bot-2' ? 'shield' : 'hit' });
    if (beams.length > 6) beams.shift();
    field.applyView(view());
  }, 1800);
  if (params.get('walk') === '1' && !host) {
    const input = { x: 0.35, y: 1, stick: false };
    let last = performance.now();
    const loop = (t: number) => {
      requestAnimationFrame(loop);
      field.step(Math.min(0.1, (t - last) / 1000), input, false, () => {});
      last = t;
    };
    requestAnimationFrame(loop);
  }
  const w = host ? new GlowTagHostScene(env, field, lookOfId, lightsOut) : new GlowTagScene(env, field, lookOfId, lightsOut);
  (window as unknown as { __world: unknown }).__world = w;
  return w;
}

// ?scene=summit  Summit Scramble from one climber's device (&ledge=12 where they start, &players=8, &wind=1, &night=1).
// ?scene=summit-host  the big screen's whole mountain.
function makeSummit(env: StageEnv, host: boolean) {
  const summit = Number(params.get('summit') ?? 30);
  const n = Number(params.get('players') ?? 10);
  const night = params.get('night') === '1';
  const climbers: SceneClimber[] = GLIMS.slice(0, n).map((g, i) => ({ playerId: g.id, name: g.name, ledge: i === 0 ? Number(params.get('ledge') ?? 8) : Math.max(0, Math.min(summit, (i * 7) % (summit + 1))), seq: 0, kind: null, finished: null, isYou: !host && i === 0, look: { art: g.art as GlimArt, rarity: g.rarity as Rarity } }));
  const ropes = [3, 7, 12, 16, 24, 27].filter((l) => l < summit);
  const wind = params.get('wind') === '1' ? true : null;
  const w = host ? new SummitHostScene(env, { night, summit }) : new SummitScene(env, { night, summit, me: climbers[0]!.playerId });
  (window as unknown as { __world: unknown }).__world = w;
  w.setState({ summit, climbers, ropes, wind, reached: [10] });
  if (params.get('still') !== '1') {
    const kinds: MoveKind[] = ['climb', 'climb', 'leap', 'climb', 'slip', 'climb', 'pulled'];
    let k = 0;
    setInterval(() => {
      k++;
      const i = host ? k % climbers.length : 0;
      const c = climbers[i]!;
      const kind = kinds[k % kinds.length]!;
      const to = kind === 'leap' ? c.ledge + 3 : kind === 'slip' ? c.ledge - 1 : kind === 'pulled' ? c.ledge + 2 : c.ledge + 1;
      climbers[i] = { ...c, ledge: Math.max(0, Math.min(summit, to)), seq: c.seq + 1, kind, finished: to >= summit ? 1 : null };
      w.setState({ summit, climbers: [...climbers], ropes, wind, reached: [10] });
    }, 2200);
  }
  return w;
}

// ?scene=spotkick  a player's penalties, one every few seconds (&shot=goal|saved|wide to fix the outcome, &fire=1, &guard=1).
// ?scene=spotkick-host  the big screen's highlights reel.
const SK_AIMS: Aim[] = ['tl', 'br', 'mid', 'tr', 'bl'];
const SK_OUT: [Outcome, ShotHow][] = [['goal', 'net'], ['saved', 'catch'], ['goal', 'net'], ['wide', 'over'], ['saved', 'parry'], ['wide', 'post']];
function skShot(seq: number): KickShot {
  const fixed = params.get('shot') as Outcome | null;
  const pick = fixed ? (SK_OUT.find((o) => o[0] === fixed) ?? SK_OUT[0]!) : SK_OUT[seq % SK_OUT.length]!;
  const aim = SK_AIMS[seq % SK_AIMS.length]!;
  const dive = pick[0] === 'saved' ? aim : SK_AIMS[(seq + 2) % SK_AIMS.length]!;
  return { seq, aim, power: seq % 2 ? 'blasted' : 'placed', outcome: pick[0], how: pick[1], dive: dive === aim && pick[0] === 'goal' ? (aim === 'tl' ? 'br' : 'tl') : dive, points: pick[0] === 'goal' ? 1 : 0, fire: params.get('fire') === '1' };
}
const skLooks = () => GLIMS.slice(0, 16).map((g) => ({ art: g.art as GlimArt, rarity: g.rarity as Rarity }));
function makeSpotKick(env: StageEnv) {
  const looks = skLooks();
  const w = new SpotKickScene(env, looks[0]!, looks);
  (window as unknown as { __world: unknown }).__world = w;
  const reads = { tl: 2, tr: 0, mid: 0, bl: 0, br: 1 };
  const guard: Aim[] | null = params.get('guard') === '1' ? ['tl', 'mid'] : null;
  w.setState({ balls: 2, reads, guard, onFire: params.get('fire') === '1', shot: null });
  if (params.get('still') === '1') return w;
  let seq = 1;
  setTimeout(function go() {
    w.setState({ balls: 2, reads, guard, onFire: params.get('fire') === '1', shot: skShot(++seq) });
    setTimeout(go, 5600);
  }, 1200);
  return w;
}
function makeSpotKickHost(env: StageEnv) {
  const looks = skLooks();
  const w = new SpotKickReelScene(env, looks);
  (window as unknown as { __world: unknown }).__world = w;
  w.setShots([]);
  let id = 1;
  setInterval(() => {
    const s = skShot(++id);
    w.setShots([{ ...s, id, name: GLIMS[id % 16]!.name, look: looks[id % 16]! }]);
  }, 5000);
  return w;
}

// ?scene=tower  Tower Together from one builder's device (&players=12, &crew=30 for the class size, &share=0.7 of the target built,
// &sway=40, &gust=breeze|gust|gale, &dawn=0.8, &fall=1 to topple it every few seconds). ?scene=tower-host the big screen (&two=1).
function makeTower(env: StageEnv, host: boolean) {
  const n = Number(params.get('players') ?? 12);
  const crew = Number(params.get('crew') ?? 30);
  const target = Math.round(crew * 36 - 4);
  const two = host && params.get('two') === '1';
  const ids = two ? ['team:a', 'team:b'] : ['class'];
  const share = Number(params.get('share') ?? 0.7);
  const kindsFor = (floors: number) => {
    let s = '';
    let h = 0;
    let since = 0;
    for (let i = 0; h < floors; i++) {
      const k = since >= target * 0.25 ? 'L' : i % 5 === 1 || i % 5 === 3 ? 'S' : 'T';
      s += k;
      h += k === 'T' ? 2 : k === 'S' ? 1 : 0;
      since = k === 'L' ? 0 : since + (k === 'T' ? 2 : 1);
    }
    return s;
  };
  const gust = params.get('gust');
  const now = Date.now();
  const dawn = Number(params.get('dawn') ?? 0.3);
  const state = (seq: number, fell: boolean): TowerState => ({
    towers: ids.map((id, i) => {
      const kinds = kindsFor(target * share * (i ? 0.8 : 1)).slice(-900);
      let height = 0;
      for (const k of kinds) height += k === 'T' ? 2 : k === 'S' ? 1 : 0;
      return { id, height, base: 0, kinds, brace: kinds.lastIndexOf('L'), target, sway: Number(params.get('sway') ?? 40), hue: i ? 350 : 200, last: { seq, kind: 'timber' }, gust: fell ? { seq, held: false, from: height + 40, to: height, kinds: 'TTSTTSTTSTTSTTSTTSTTS' } : null };
    }),
    builders: GLIMS.slice(0, n).map((g, i) => ({ playerId: g.id, name: i === 3 ? 'Maximilian Featherstonehaugh-Smythe' : g.name, tower: ids[i % ids.length]!, seq: seq + (i % 3 === seq % 3 ? 1 : 0), kind: (['timber', 'stone', 'lantern'] as const)[i % 3]!, isYou: !host && i === 0, look: { art: g.art as GlimArt, rarity: g.rarity as Rarity } })),
    wind: gust ? { strength: gust === 'gale' ? 1 : gust === 'gust' ? 0.6 : 0.25, announced: true, landsAt: now + 6000 } : null,
    startedAt: now - dawn * 360_000,
    endsAt: now + (1 - dawn) * 360_000,
  });
  const gameNow = () => Date.now();
  const w = host ? new TowerHostScene(env, { towers: ids, gameNow }) : new TowerScene(env, { me: GLIMS[0]!.id, tower: 'class', towers: ids, gameNow });
  (window as unknown as { __world: unknown }).__world = w;
  w.setState(state(1, false));
  if (params.get('still') !== '1') {
    let seq = 1;
    setInterval(() => w.setState(state(++seq, params.get('fall') === '1' && seq % 3 === 0)), 2500);
  }
  return w;
}

// ?scene=rally  Lantern Rally from one driver's kart (&circuit=harbour|forest|rooftops, &players=10, &trial=1).
// ?scene=rally-host  the big screen. &manual=1 holds the clock still: step it with window.__step(ms) to check whole sequences.
function makeRally(env: StageEnv, host: boolean) {
  const circuit = (CIRCUIT_IDS as string[]).includes(params.get('circuit') ?? '') ? (params.get('circuit') as CircuitId) : 'harbour';
  const n = Number(params.get('players') ?? 10);
  const trial = params.get('trial') === '1';
  const manual = params.get('manual') === '1';
  let clock = 0;
  const field = new RallyField(host ? null : GLIMS[0]!.id, () => clock);
  const len = lapLength(circuit);
  const rng = createRng(7);
  const items: { at: number; lane: number; kind: 0 | 1 | 2 }[] = [];
  for (let at = 45; at < len - 25; at += 22 + rng.int(0, 12)) {
    const r = rng.next();
    const lanes = rng.shuffle([0, 1, 2]);
    if (r < 0.35) items.push({ at, lane: lanes[0]!, kind: rng.next() < 0.5 ? 0 : 1 });
    else if (r < 0.55) items.push({ at, lane: lanes[0]!, kind: 0 }, { at, lane: lanes[1]!, kind: 1 });
    else if (r < 0.8) items.push({ at, lane: lanes[0]!, kind: 2 });
    else items.push({ at, lane: lanes[0]!, kind: 1 }, { at, lane: lanes[1]!, kind: 2 });
  }
  const bots = GLIMS.slice(0, n).map((g, i) => ({ id: g.id, name: g.name, d: -1 - Math.floor(i / 3) * 5, lane: [1, 0, 2][i % 3]!, v: 10, boostUntil: 0, slowUntil: 0 }));
  const looks = new Map(GLIMS.map((g) => [g.id, { art: g.art as GlimArt, rarity: g.rarity as Rarity }]));
  const opts = { circuit, trial, looks: (id: string) => looks.get(id) ?? { art: GLIMS[0]!.art as GlimArt }, hueOf: (id: string) => (id.length * 47) % 360 };
  const w = host ? new RallyHostScene(env, field, opts) : new RallyScene(env, field, { ...opts, me: GLIMS[0]!.id });
  w.setItems(items);
  w.setStart(3000);
  field.applyView({ length: len, at: 0, karts: bots.map((b, i) => ({ playerId: b.id, name: b.name, teamId: null, d: b.d, lane: b.lane, v: 0, flags: 0, place: i + 1, lap: 1, finished: null, isYou: !host && i === 0 })) });
  const sim = (ms: number) => {
    for (let t = 0; t < ms; t += 50) {
      clock += 50;
      if (clock < 3000) continue;
      for (const b of bots) {
        if (rng.next() < 0.004) b.boostUntil = clock + 3000;
        if (rng.next() < 0.006) b.lane = Math.max(0, Math.min(2, b.lane + (rng.next() < 0.5 ? -1 : 1)));
        const pos = ((b.d % len) + len) % len;
        if (b.slowUntil < clock && items.some((it) => it.kind !== 2 && it.lane === b.lane && pos < it.at && pos + b.v * 0.05 >= it.at)) b.slowUntil = clock + 1300;
        b.v = 10 + (b.boostUntil > clock ? 8 : 0) - (b.slowUntil > clock ? 5 : 0) + (b.id.length % 3) * 0.4;
        b.d += b.v * 0.05;
      }
    }
    const order = [...bots].sort((a, b) => b.d - a.d);
    field.applyView({ length: len, at: clock, karts: bots.map((b, i) => ({ playerId: b.id, name: b.name, teamId: null, d: b.d, lane: b.lane, v: b.v, flags: (b.boostUntil > clock ? 1 : 0) | (b.slowUntil > clock ? 2 : 0) | (i === 2 ? 4 : 0), place: order.indexOf(b) + 1, lap: Math.max(1, Math.floor(b.d / len) + 1), finished: null, isYou: !host && i === 0 })) });
  };
  (window as unknown as { __step: (ms: number) => void }).__step = sim;
  if (!manual) setInterval(() => sim(100), 100);
  (window as unknown as { __world: unknown }).__world = w;
  return w;
}

// ?scene=garden  Glim Garden from one player's plot (&players=12, &day=1 for Night Bloom's day, &teams=1).
// ?scene=garden-host  the big screen's whole garden (&players=30, &names=long for long names).
function makeGarden(env: StageEnv, host: boolean) {
  const n = Number(params.get('players') ?? (host ? 30 : 12));
  const rnd = props.seeded(11);
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const long = params.get('names') === 'long';
  const names = new Map(ids.map((id, i) => [id, long ? `${GLIMS[i % GLIMS.length]!.name} the Magnificent Gardener` : (GLIMS[i % GLIMS.length]?.name ?? `Gardener ${i}`)]));
  const looks = new Map(ids.map((id, i) => [id, { art: GLIMS[i % GLIMS.length]!.art as GlimArt, rarity: GLIMS[i % GLIMS.length]!.rarity as Rarity }]));
  const plots: PlotView[] = ids.map((id, i) => {
    const k = i % 5 === 4 ? null : PLANT_KINDS[Math.floor(rnd() * 3)]!;
    const need = k ? PLANTS[k].need : 0;
    const g = k ? Math.floor(rnd() * (need + 1)) : 0;
    const v: PlotView = { id, k, g: Math.min(g, need), r: [Math.floor(rnd() * 3), Math.floor(rnd() * 2), rnd() < 0.15 ? 1 : 0], j: Math.floor(rnd() * 9), s: 0, e: null };
    if (k && g >= need) v.b = 1;
    if (k && !v.b && rnd() < 0.15) v.d = 1;
    return v;
  });
  const teams = params.get('teams') === '1';
  const gardens = teams ? [{ teamId: 't1', name: 'Owls', plots: plots.filter((_, i) => i % 2 === 0) }, { teamId: 't2', name: 'Foxes', plots: plots.filter((_, i) => i % 2 === 1) }] : [{ teamId: null, name: null, plots }];
  const w = host ? new GardenHostScene(env) : new GardenScene(env, 'p0');
  const day = params.get('day') === '1';
  const state = () => ({ gardens, need: 6, dark: !day, nightBloom: day, looks, names });
  w.setState(state());
  (window as unknown as { __world: unknown }).__world = w;
  if (params.get('still') === '1') return w;
  setInterval(() => {
    // Something happens somewhere: a drop, a gift or a bloom.
    const i = Math.floor(rnd() * plots.length);
    const p = plots[i]!;
    if (!p.k) return;
    if (!p.b) p.g++;
    if (p.k && p.g >= PLANTS[p.k].need) p.b = 1;
    p.s++;
    p.e = p.b ? 'bloom' : rnd() < 0.5 ? 'gift' : 'water';
    if (p.e === 'gift') p.by = plots[(i + 1) % plots.length]!.id;
    p.j++;
    w.setState(state());
  }, 1400);
  return w;
}

function App() {
  const create = (env: StageEnv) =>
    sceneName === 'gold'
      ? makeGold(env)
      : sceneName === 'field'
        ? makeField(env)
        : sceneName === 'city'
          ? makeCity(env)
          : sceneName === 'skyline'
            ? makeSkyline(env)
            : sceneName === 'catch'
              ? makeCatch(env)
              : sceneName === 'jetty'
                ? makeJetty(env)
                : sceneName === 'glowtag' || sceneName === 'glowtag-host'
                  ? makeGlowTag(env, sceneName === 'glowtag-host')
                  : sceneName === 'summit' || sceneName === 'summit-host'
                    ? makeSummit(env, sceneName === 'summit-host')
                    : sceneName === 'spotkick'
                      ? makeSpotKick(env)
                      : sceneName === 'spotkick-host'
                        ? makeSpotKickHost(env)
                        : sceneName === 'tower' || sceneName === 'tower-host'
                          ? makeTower(env, sceneName === 'tower-host')
                        : sceneName === 'rally' || sceneName === 'rally-host'
                          ? makeRally(env, sceneName === 'rally-host')
                          : sceneName === 'garden' || sceneName === 'garden-host'
                            ? makeGarden(env, sceneName === 'garden-host')
                            : new Gallery(env);
  return (
    <main style={{ height: '100vh', display: 'grid' }}>
      <Stage3D label="3D gallery" create={create} className="h-full w-full" />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
