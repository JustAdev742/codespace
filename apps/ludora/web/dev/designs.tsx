// Development-only check sheets for personal designs. Served by Vite at /dev/designs.html; not part of the app build.
//
// ?view=sheet  a grid of random designs in 2D (default). &n=60 &size=46 &seed=1 &school=1 (Hills Grammar uniform)
// ?view=3d     a 3D crowd, with frame timing in window.__perf once built. &n=40 &designs=0 (catalogue Glims) &wait=8000 (ms more before timing)
// Add &theme=light or &theme=dark.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GLIMS } from '@ludora/content';
import type { GlimArt, Rarity } from '@ludora/shared';
import '../src/styles/app.css';
import { Glim } from '../src/art/glim/Glim.tsx';
import { Stage3D } from '../src/three/Stage3D.tsx';
import { World, DAY, type StageEnv } from '../src/three/World.ts';
import { Glim3D } from '../src/three/glim3d.ts';
import { randomDesignArt } from '@ludora/shared';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'sheet';
const n = Number(params.get('n') ?? (view === '3d' ? 40 : 60));
const size = Number(params.get('size') ?? 46);
const seed = Number(params.get('seed') ?? 1);
const designs = params.get('designs') !== '0';
const theme = params.get('theme');
if (theme) document.documentElement.dataset.theme = theme;
if (params.get('school') === '1') document.documentElement.dataset.school = 'hills-grammar';

function looks(count: number): { art: GlimArt; rarity?: Rarity }[] {
  // &strip=1 takes off everything the richer schema added, to tell its cost from the random mix of parts.
  const strip = (a: GlimArt): GlimArt => {
    if (params.get('strip') !== '1') return a;
    const { width: _w, height: _h, eyeSize: _e, feet: _f, gradient: _g, paint: _p, idle: _i, thirdHue: _t, ...rest } = a;
    return rest;
  };
  if (designs) return Array.from({ length: count }, (_, i) => ({ art: strip(randomDesignArt(seed * 1000 + i)) }));
  return Array.from({ length: count }, (_, i) => {
    const g = GLIMS[i % GLIMS.length]!;
    return { art: g.art as GlimArt, rarity: g.rarity as Rarity };
  });
}

function Sheet() {
  const all = looks(n);
  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 text-text">
      <h1 className="mb-3 text-lg font-bold">
        {n} {designs ? 'random designs' : 'catalogue Glims'} at {size} px
      </h1>
      <ul className="flex flex-wrap gap-2">
        {all.map((l, i) => (
          <li key={i} className="grid place-items-center rounded-[var(--radius-m)] bg-raised p-1">
            <Glim art={l.art} rarity={l.rarity} size={size} title={`Design ${i + 1}`} />
          </li>
        ))}
      </ul>
    </main>
  );
}

class Crowd extends World {
  glims: Glim3D[] = [];
  constructor(env: StageEnv) {
    super(env, DAY, 45);
    const all = looks(n);
    const cols = Math.ceil(Math.sqrt(n * 1.6));
    all.forEach((l, i) => {
      const g = new Glim3D({ look: { art: l.art, rarity: l.rarity, uniform: false }, quality: env.quality, reducedMotion: env.reducedMotion });
      g.position.set(((i % cols) - (cols - 1) / 2) * 0.9, 0, Math.floor(i / cols) * -0.9);
      this.scene.add(g);
      this.glims.push(g);
    });
    this.camera.position.set(0, 5, 7);
    this.camera.lookAt(0, 0, -2);
  }
  tick(dt: number) {
    for (const g of this.glims) g.update(dt);
  }
}

declare global {
  interface Window {
    __perf?: { frames: number; p50: number; p95: number; max: number; over50: number; buildMs: number };
  }
}

function Three() {
  const [world, setWorld] = useState<Crowd | null>(null);
  useEffect(() => {
    if (!world) return;
    const t0 = performance.now();
    let stop = false;
    const wait = Number(params.get('wait') ?? 0);
    void Promise.all(world.glims.map((g) => g.ready)).then(() => new Promise((r) => setTimeout(r, wait))).then(() => {
      const buildMs = performance.now() - t0;
      const frames: number[] = [];
      let last = performance.now();
      const tick = (t: number) => {
        frames.push(t - last);
        last = t;
        if (!stop && frames.length < 360) requestAnimationFrame(tick);
        else {
          const f = frames.slice(1).sort((a, b) => a - b);
          const p = (q: number) => f[Math.min(f.length - 1, Math.floor(q * f.length))] ?? 0;
          window.__perf = { frames: f.length, p50: p(0.5), p95: p(0.95), max: f[f.length - 1] ?? 0, over50: f.filter((x) => x > 50).length, buildMs };
        }
      };
      requestAnimationFrame(tick);
    });
    return () => {
      stop = true;
    };
  }, [world]);
  return (
    <main className="h-screen bg-[var(--bg)]">
      <Stage3D<Crowd> label="A crowd of Glims" create={(env) => new Crowd(env)} onWorld={setWorld} className="h-full" season={false} />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(view === '3d' ? <Three /> : <Sheet />);
