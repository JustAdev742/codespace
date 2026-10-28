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

function App() {
  return (
    <main style={{ height: '100vh', display: 'grid' }}>
      <Stage3D label="3D Glim gallery" create={(env) => new Gallery(env)} className="h-full w-full" />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
