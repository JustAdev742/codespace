// "What's new": the second Ludora film. Everything added since the first one, filmed on The Hills
// Grammar School's copy with every Glim in the school's uniform. One timeline in bars (120 beats a
// minute, two seconds a bar), drawn a frame at a time: window.film.render(n) draws frame n and
// tools/film/render.mjs photographs it (FILM_URL=http://127.0.0.1:5188/updates.html).
import '@fontsource/lato/400.css';
import '@fontsource/lato/700.css';
import '@fontsource/lato/900.css';
import '@fontsource/barlow-condensed/800-italic.css';
import { Color } from 'three';
import { Backdrop, FPS, H, HILLS_NIGHT, Stage, W, bar, rng } from './engine.ts';
import type { Film, Shot } from './film.ts';
import { open } from './news/open.ts';
import { home } from './news/home.ts';
import { calm } from './news/calm.ts';
import { economy } from './news/economy.ts';
import { school } from './news/school.ts';
import { guard } from './news/guard.ts';
import { end } from './news/end.ts';

export const DURATION = bar(45); // 88 seconds
export const FRAMES = Math.round(DURATION * FPS);

async function main() {
  await Promise.all([
    document.fonts.load('900 80px "Lato"'), document.fonts.load('700 40px "Lato"'), document.fonts.load('400 40px "Lato"'),
    document.fonts.load('italic 800 80px "Barlow Condensed"'),
  ]);
  // Anything random in the cast (a blink, a sway) comes from one seeded stream, so a frame is the same every time it is drawn.
  Math.random = rng(20261119);

  const stage = new Stage();
  // The colour behind everything when the backdrop is hidden (linear values): the hall with the lights out.
  const BASE = new Color(0.0012, 0.006, 0.004);
  stage.renderer.setClearColor(BASE, 1);
  const backdrop = new Backdrop(120, HILLS_NIGHT);
  stage.scene.add(backdrop);
  const film: Film = { stage, backdrop, warm: 0, energy: 0 };
  // ?only=guard,end builds just those scenes, for working on one without loading every clip.
  const only = new URLSearchParams(location.search).get('only')?.split(',') ?? null;
  const scenes: [string, (f: Film) => Promise<Shot[]>][] = [['open', open], ['home', home], ['calm', calm], ['economy', economy], ['school', school], ['guard', guard], ['end', end]];
  const shots: Shot[] = [];
  for (const [name, make] of scenes) if (!only || only.includes(name)) shots.push(...(await make(film)));
  for (const s of shots) { s.group.visible = false; stage.scene.add(s.group); if (s.hud) { s.hud.visible = false; stage.hud.add(s.hud); } }

  async function render(frame: number) {
    const T = frame / FPS;
    stage.resetCamera();
    const fx = stage.fx;
    fx.uFlash.value = 0; fx.uFade.value = 1; fx.uAberration.value = 0.0009; fx.uBlur.value.set(0, 0); fx.uZoomBlur.value = 0; fx.uSeed.value = frame * 0.37; fx.uVignette.value = 0.4; fx.uTint.value.setRGB(1, 1, 1);
    stage.bloom.strength = 0.3;
    film.warm = 0; film.energy = 0;
    backdrop.visible = true;
    stage.renderer.setClearColor(BASE, 1);
    const waits: Promise<unknown>[] = [];
    for (const s of shots) {
      const on = T >= s.a && T < s.b;
      s.group.visible = on;
      if (s.hud) s.hud.visible = on;
      if (on) { const w = s.update(T - s.a, T); if (w) waits.push(...w); }
    }
    backdrop.update(T, film.warm, film.energy);
    await Promise.all(waits);
    stage.render();
  }
  if (new URLSearchParams(location.search).has('clean')) stage.hud.visible = false;
  (window as unknown as { film: unknown }).film = { render, frames: FRAMES, fps: FPS, duration: DURATION, width: W, height: H, stage, backdrop };
  document.title = 'ready';
}
main().catch((e) => { console.error(e); document.title = `error: ${String(e)}`; });
