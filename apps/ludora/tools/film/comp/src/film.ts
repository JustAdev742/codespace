// Ludora, the film. One timeline in bars (120 beats a minute, two seconds a bar), drawn a frame at a time.
// window.film.render(n) draws frame n; tools/film/render.mjs photographs each one.
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { Backdrop, FPS, H, Stage, W, bar, rng } from './engine.ts';
import { opening } from './shots/opening.ts';
import { play } from './shots/play.ts';
import { modes } from './shots/modes.ts';
import { making } from './shots/making.ts';
import { finale } from './shots/finale.ts';

export interface Shot {
  /** Seconds, from and to (to is not included). */
  a: number;
  b: number;
  group: Group;
  /** Captions and anything else that stays put on screen (pixels, centre origin). */
  hud?: Group;
  /** `t` is seconds into the shot, `T` seconds into the film. Returns pictures that must load before the frame is drawn. */
  update(t: number, T: number): Promise<unknown>[] | void;
}
export interface Film { stage: Stage; backdrop: Backdrop; warm: number; energy: number }

export const DURATION = bar(35); // 68 seconds
export const FRAMES = Math.round(DURATION * FPS);

/** The Ludora mark: the gold tile with its L, leaning forward, drawn the way the app draws it. */
export function logoTile(size: number) {
  const s = 8;
  const c = document.createElement('canvas');
  c.width = c.height = 64 * s;
  const ctx = c.getContext('2d')!;
  ctx.scale(s, s);
  ctx.translate(32, 32); ctx.transform(1, 0, Math.tan((-10 * Math.PI) / 180), 1, 0, 0); ctx.translate(-32, -32);
  const rr = (x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); };
  ctx.fillStyle = '#E9A400'; rr(9, 5, 46, 54, 9);
  ctx.fillStyle = '#FFC233'; rr(9, 5, 46, 49, 9);
  ctx.fillStyle = '#0B1020';
  ctx.beginPath(); ctx.moveTo(22, 14); ctx.lineTo(31.5, 14); ctx.lineTo(31.5, 38.5); ctx.lineTo(44, 38.5); ctx.lineTo(44, 47); ctx.lineTo(22, 47); ctx.closePath(); ctx.fill();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new Mesh(new PlaneGeometry(size, size), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.renderOrder = 21;
  return m;
}

async function main() {
  await Promise.all([
    document.fonts.load('800 80px "Barlow Condensed"'), document.fonts.load('italic 800 80px "Barlow Condensed"'), document.fonts.load('700 80px "Barlow Condensed"'),
    document.fonts.load('600 80px "Barlow Condensed"'), document.fonts.load('700 40px "Atkinson Hyperlegible Next Variable"'), document.fonts.load('400 40px "Atkinson Hyperlegible Next Variable"'),
  ]);
  // Anything random in the cast (a blink, a sway) comes from one seeded stream, so a frame is the same every time it is drawn.
  const seeded = rng(20261112);
  Math.random = seeded;

  const stage = new Stage();
  const backdrop = new Backdrop();
  stage.scene.add(backdrop);
  const film: Film = { stage, backdrop, warm: 0, energy: 0 };
  const shots: Shot[] = [...(await opening(film)), ...(await play(film)), ...(await modes(film)), ...(await making(film)), ...(await finale(film))];
  for (const s of shots) { s.group.visible = false; stage.scene.add(s.group); if (s.hud) { s.hud.visible = false; stage.hud.add(s.hud); } }

  async function render(frame: number) {
    const T = frame / FPS;
    stage.resetCamera();
    const fx = stage.fx;
    fx.uFlash.value = 0; fx.uFade.value = 1; fx.uAberration.value = 0.0012; fx.uBlur.value.set(0, 0); fx.uZoomBlur.value = 0; fx.uSeed.value = frame * 0.37; fx.uVignette.value = 0.42; fx.uTint.value.setRGB(1, 1, 1);
    stage.bloom.strength = 0.35;
    film.warm = 0; film.energy = 0;
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
  // ?clean: no captions and no name, for pictures used in the slides.
  if (new URLSearchParams(location.search).has('clean')) stage.hud.visible = false;
  (window as unknown as { film: unknown }).film = { render, frames: FRAMES, fps: FPS, duration: DURATION, width: W, height: H };
  document.title = 'ready';
}
main().catch((e) => { console.error(e); document.title = `error: ${String(e)}`; });
