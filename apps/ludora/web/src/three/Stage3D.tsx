import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NeutralToneMapping, WebGLRenderer } from 'three';
import { prefersReducedMotion } from '../lib/prefs.ts';
import { FrameMonitor, qualityFor, startingQuality, storeChoice, storedChoice, type Quality, type QualityChoice } from './quality.ts';
import type { StageEnv, World } from './World.ts';
import { SeasonDrift } from './seasonDrift.ts';
import { seasonTheme } from '../lib/season.ts';
import './stage3d.css';

/*
 * Mounts a 3D scene: makes the renderer and canvas, sizes them to the box,
 * runs the frame loop, watches frame times, and shows `fallback` when WebGL
 * is missing, the player turned 3D off, or the GPU gives up. The scene is a
 * picture: the mode's real controls are ordinary HTML around it, so the game
 * plays the same either way.
 *
 * The loop stops while the tab is hidden or the stage is scrolled away, and
 * each stage has its own renderer, freed when it unmounts.
 */

export interface Stage3DProps<W extends World> {
  /** Build the scene. Called once per mount (and again if the quality is changed by the player). */
  create: (env: StageEnv) => W;
  /** Receives the scene once built, and null when it goes. */
  onWorld?: (world: W | null) => void;
  /** What the picture shows, for screen readers. */
  label: string;
  className?: string;
  /** Shown instead of the scene when there is no 3D. */
  fallback?: ReactNode;
  /** The little graphics menu in the corner. */
  controls?: boolean;
  /** The season's drift of confetti, petals or motes in front of the camera. On by default. */
  season?: boolean;
}

type StageState = { kind: 'ready' } | { kind: 'fallback'; reason: 'off' | 'unsupported' | 'lost' };

const LOWER: Record<Quality['tier'], Quality['tier'] | null> = { high: 'medium', medium: 'low', low: null };

export function Stage3D<W extends World>({ create, onWorld, label, className = '', fallback = null, controls = true, season = true }: Stage3DProps<W>) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<StageState>({ kind: 'ready' });
  const [generation, setGeneration] = useState(0);
  const createRef = useRef(create);
  createRef.current = create;
  const onWorldRef = useRef(onWorld);
  onWorldRef.current = onWorld;
  const seasonRef = useRef(season);
  seasonRef.current = season;
  const labelRef = useRef(label);
  labelRef.current = label;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // The picture's description follows the game (what is in your cart, who is near), without a rebuild.
  useEffect(() => {
    canvasRef.current?.setAttribute('aria-label', label);
  }, [label]);

  // The player changed the graphics setting (here or in another stage): rebuild.
  useEffect(() => {
    const again = () => {
      setState({ kind: 'ready' });
      setGeneration((g) => g + 1);
    };
    window.addEventListener('ludora:graphics', again);
    return () => window.removeEventListener('ludora:graphics', again);
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || state.kind !== 'ready') return;
    let quality = startingQuality();
    if (!quality) {
      setState({ kind: 'fallback', reason: storedChoice() === 'off' ? 'off' : 'unsupported' });
      return;
    }
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: quality.antialias, powerPreference: 'default', stencil: false, alpha: false });
    } catch {
      setState({ kind: 'fallback', reason: 'unsupported' });
      return;
    }
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    const canvas = renderer.domElement;
    canvas.className = 's3-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', labelRef.current);
    canvasRef.current = canvas;
    const overlay = document.createElement('div');
    el.prepend(canvas);
    el.appendChild(overlay);

    const env: StageEnv = { quality, reducedMotion: prefersReducedMotion(), overlay, renderer };
    let world: W;
    try {
      world = createRef.current(env);
    } catch (err) {
      console.error('The 3D scene could not be built', err);
      renderer.dispose();
      canvas.remove();
      overlay.remove();
      setState({ kind: 'fallback', reason: 'unsupported' });
      return;
    }
    onWorldRef.current?.(world);

    // The season's drift rides with the camera; none on low graphics or with reduced motion.
    let drift: SeasonDrift | null = null;
    if (seasonRef.current && quality.tier !== 'low' && !env.reducedMotion) {
      drift = new SeasonDrift(seasonTheme(), quality.particles);
      if (!world.camera.parent) world.scene.add(world.camera);
      drift.attach(world.camera);
    }

    let scale = 1;
    const size = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      renderer.setPixelRatio(quality!.dpr * scale);
      renderer.setSize(w, h, false);
      world.resize(w, h);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);

    const monitor = new FrameMonitor((step) => {
      if (step === 'resolution') {
        scale = monitor.scale;
        size();
        return;
      }
      const lower = LOWER[quality!.tier];
      if (!lower) return;
      quality = qualityFor(lower);
      world.setQuality(quality);
      if (lower === 'low') {
        drift?.dispose();
        drift = null;
      }
      size();
    });

    let onScreen = true;
    const io = new IntersectionObserver(([e]) => (onScreen = Boolean(e?.isIntersecting)));
    io.observe(el);

    let raf = 0;
    let last = performance.now();
    const start = last;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dtMs = now - last;
      last = now;
      if (!onScreen) return;
      const dt = Math.min(0.05, dtMs / 1000);
      world.frame(dt, (now - start) / 1000);
      drift?.update(dt, (now - start) / 1000);
      renderer.render(world.scene, world.camera);
      world.afterRender();
      monitor.sample(dtMs, now);
    };
    raf = requestAnimationFrame(loop);

    const lost = (e: Event) => {
      e.preventDefault();
      setState({ kind: 'fallback', reason: 'lost' });
    };
    canvas.addEventListener('webglcontextlost', lost);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('webglcontextlost', lost);
      onWorldRef.current?.(null);
      drift?.dispose();
      world.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      canvasRef.current = null;
      overlay.remove();
    };
    // The label is kept up to date by its own effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind, generation]);

  if (state.kind === 'fallback') {
    return (
      <div className={`s3-stage s3-fallback ${className}`}>
        {fallback}
        {controls ? <GraphicsMenu note={state.reason === 'lost' ? 'The 3D view stopped. Pick a setting to try again.' : state.reason === 'unsupported' ? 'This device cannot show 3D.' : null} /> : null}
      </div>
    );
  }
  return (
    <div ref={box} className={`s3-stage ${className}`}>
      {controls ? <GraphicsMenu /> : null}
    </div>
  );
}

const CHOICES: { value: QualityChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'off', label: '3D off' },
];

/** Graphics quality for this device: a small menu in the stage's corner. */
export function GraphicsMenu({ note = null }: { note?: string | null }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<QualityChoice>(storedChoice);
  return (
    <div className="s3-menu">
      <button type="button" className="s3-menu-button" aria-expanded={open} aria-label="Graphics settings" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.6 4.9-1.9 1.1.1 2.2-2.1 1.2-1.8-1.2-2 .9L12.4 20h-2.4l-.5-2.4-2-.9-1.8 1.2-2.1-1.2.1-2.2-1.9-1.1v-2.4l1.9-1.1-.1-2.2 2.1-1.2 1.8 1.2 2-.9.5-2.4h2.4l.5 2.4 2 .9 1.8-1.2 2.1 1.2-.1 2.2 1.9 1.1z" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div className="s3-menu-panel" role="group" aria-label="Graphics">
          {note ? <p className="s3-menu-note">{note}</p> : null}
          {CHOICES.map((c) => (
            <label key={c.value} className="s3-menu-option">
              <input
                type="radio"
                name="ludora-graphics"
                checked={choice === c.value}
                onChange={() => {
                  setChoice(c.value);
                  storeChoice(c.value);
                  setOpen(false);
                }}
              />
              {c.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
