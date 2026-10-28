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
                  : new Gallery(env);
  return (
    <main style={{ height: '100vh', display: 'grid' }}>
      <Stage3D label="3D gallery" create={create} className="h-full w-full" />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
