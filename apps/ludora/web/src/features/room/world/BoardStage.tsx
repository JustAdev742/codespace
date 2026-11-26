import { useEffect, useRef } from 'react';
import { NeutralToneMapping, Vector2, WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { prefersReducedMotion } from '../../../lib/prefs.ts';
import { schoolLook } from '../../../lib/school.ts';
import { qualityFor, softwareRenderer } from '../../../three/quality.ts';
import { fxAsked, fxLevel } from '../../../fx/index.ts';
import '../../../three/stage3d.css';
import './world.css';
import { BoardWorld } from './BoardWorld.ts';
import { themeFor } from './themes.ts';
import { onTold, told, worldSetUp, type Actor, type Shot } from './gate.ts';

/** The world is a backdrop: 30 pictures a second is plenty, and leaves the graphics chip room for the page. */
const FRAME_MS = 1000 / 30;

/**
 * The board's world, drawn (D63). A canvas behind the whole room with the scene in it, the camera
 * following the game. It is fetched and mounted only by a board that will draw it (gate.ts); if it
 * cannot start, loses its graphics context or frames turn slow, it takes itself away and the board
 * shows what it always showed. With less motion it is a still picture, drawn again when something
 * in it changes.
 */
export default function BoardStage({ actors, shot, modeId, hidden }: { actors: Actor[]; shot: Shot; modeId: string; hidden: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const world = useRef<BoardWorld | null>(null);
  const latest = useRef({ actors, shot });
  latest.current = { actors, shot };
  const paused = useRef(hidden);
  paused.current = hidden;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const rich = fxLevel() === 'rich';
    const quality = qualityFor(rich ? 'high' : 'medium');
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: false, stencil: false, powerPreference: 'high-performance' });
    } catch {
      return;
    }
    renderer.toneMapping = NeutralToneMapping;
    const canvas = renderer.domElement;
    canvas.className = 'world-canvas';
    const overlay = document.createElement('div');
    el.append(canvas, overlay);
    let w: BoardWorld;
    try {
      w = new BoardWorld({ quality, reducedMotion: prefersReducedMotion(), overlay, renderer }, themeFor(modeId, schoolLook()));
    } catch (err) {
      console.error('The world could not be built', err);
      renderer.dispose();
      canvas.remove();
      overlay.remove();
      return;
    }
    world.current = w;
    w.setCrowd(latest.current.actors);
    w.setShot(latest.current.shot);

    // A device drawing this with its processor was asked to by name (fx/index.ts), and one picture costs it
    // a fifth of a second. Unless it was asked to show everything, the world keeps out of the page's way
    // there: small, without its glow, and a few pictures a second, so a tap on the page is still answered at once.
    const light = softwareRenderer() && fxAsked() !== 'show';
    const frameMs = light ? 1000 / 5 : FRAME_MS;

    // Light that spills: lanterns, bulbs and the stage's rim glow into the air round them.
    let composer: EffectComposer | null = null;
    if (rich && !light) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(w.scene, w.camera));
      composer.addPass(new UnrealBloomPass(new Vector2(256, 256), 0.62, 0.72, 0.8));
      composer.addPass(new OutputPass());
    }
    let scale = light ? 0.5 : 1;
    const size = () => {
      const width = Math.max(1, el.clientWidth);
      const height = Math.max(1, el.clientHeight);
      const ratio = Math.min(window.devicePixelRatio || 1, rich ? 1.5 : 1) * scale;
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      composer?.setPixelRatio(ratio);
      composer?.setSize(width, height);
      w.resize(width, height);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);

    let raf = 0;
    let last = performance.now();
    const began = last;
    let slow = 0;
    let dead = false;
    const give = () => {
      if (dead) return;
      dead = true;
      // Out of the way at once: the board's own backdrop takes its place.
      el.dataset.hidden = 'true';
      worldSetUp(false);
    };
    // Asked for by name on a slow device: it is not judged on its frames, it has already been cut down.
    const measured = !softwareRenderer();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dtMs = now - last;
      if (dtMs < frameMs - 2 || document.hidden || paused.current || dead) return;
      last = now;
      if (!w.wantsFrame()) return;
      w.frame(Math.min(0.1, dtMs / 1000), (now - began) / 1000);
      if (composer) composer.render();
      else renderer.render(w.scene, w.camera);
      w.afterRender();
      // Frames that keep arriving late: draw it smaller, then without the glow, then not at all.
      if (!measured || dtMs > 500) return;
      slow = dtMs > 60 ? slow + 1 : Math.max(0, slow - 1);
      if (slow < 45) return;
      slow = 0;
      if (scale > 0.6) {
        scale = scale > 0.8 ? 0.75 : 0.55;
        size();
      } else if (composer) {
        composer.dispose();
        composer = null;
      } else give();
    };
    raf = requestAnimationFrame(loop);
    const lost = (e: Event) => {
      e.preventDefault();
      give();
    };
    canvas.addEventListener('webglcontextlost', lost);

    // What the page says: the podium as the ceremony stands, a Glim that hopped, a cheer.
    let cheers = told.cheers;
    const hear = () => {
      const p = told.podium;
      if (p) w.setPodium(p.places, p.order, p.risen, p.landed);
      for (const a of told.acts.splice(0)) w.act(a.id, a.what);
      if (told.cheers !== cheers) {
        cheers = told.cheers;
        w.cheer();
      }
    };
    const off = onTold(hear);
    hear();
    worldSetUp(true);

    return () => {
      cancelAnimationFrame(raf);
      off();
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', lost);
      world.current = null;
      worldSetUp(false);
      composer?.dispose();
      w.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      overlay.remove();
    };
  }, [modeId]);

  useEffect(() => world.current?.setCrowd(actors), [actors]);
  useEffect(() => world.current?.setShot(shot), [shot]);

  return <div ref={box} className="world-stage" aria-hidden data-hidden={hidden} data-shot={shot} />;
}
