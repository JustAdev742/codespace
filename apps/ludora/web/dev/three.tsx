// Development-only gallery of 3D Glims and props, for art work. Served by Vite at /dev/three.html; not part of the app build.
//
// ?collection=meadow  the collection to line up (default meadow)
// ?ids=glim-a,glim-b  particular Glims instead
// ?action=walk|dig|cheer|wave|cast|reel|type|hit  what they do (default: a little of everything)
// ?quality=low|medium|high
import { createRoot } from 'react-dom/client';
import { Mesh, CylinderGeometry, Vector3 } from 'three';
import { GLIMS } from '@ludora/content';
import type { GlimArt, Rarity } from '@ludora/shared';
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

function App() {
  return (
    <main style={{ height: '100vh', display: 'grid' }}>
      <Stage3D
        label="3D gallery"
        create={(env) => (sceneName === 'gold' ? makeGold(env) : sceneName === 'field' ? makeField(env) : sceneName === 'city' ? makeCity(env) : sceneName === 'skyline' ? makeSkyline(env) : sceneName === 'catch' ? makeCatch(env) : sceneName === 'jetty' ? makeJetty(env) : new Gallery(env))}
        className="h-full w-full"
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
