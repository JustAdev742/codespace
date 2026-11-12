import { useState, type CSSProperties, type ReactNode } from 'react';
import { Check, Mountain } from 'lucide-react';
import { Button } from '../../../ui/Button.tsx';
import { Dialog } from '../../../ui/primitives.tsx';
import { usePrefs } from '../../../lib/usePrefs.ts';

/*
 * Big-screen backdrops: scenes the host picks for the lobby and the moments
 * between questions. Each is a handful of flat SVG shapes in the stage's own
 * navy, lit the way the stage is (a floodlight from the top, arena glows low in
 * the corners), so white text keeps its contrast anywhere on top. One layer in
 * each moves, slowly, by transform or opacity only: cheap for a Chromebook.
 * It holds still with reduced motion, data saver or calm mode (stage.css).
 * Drawn for Ludora; no other product's art.
 */

export const BACKDROPS = ['floodlights', 'hills', 'harbour', 'aurora', 'rooftops', 'forest', 'plain'] as const;
export type BackdropId = (typeof BACKDROPS)[number];
export const DEFAULT_BACKDROP: BackdropId = 'floodlights';

export const BACKDROP_NAMES: Record<BackdropId, string> = {
  floodlights: 'Floodlights',
  hills: 'Night hills',
  harbour: 'Harbour',
  aurora: 'Northern lights',
  rooftops: 'Rooftops',
  forest: 'Pine forest',
  plain: 'Plain stage',
};

export function isBackdrop(v: unknown): v is BackdropId {
  return typeof v === 'string' && (BACKDROPS as readonly string[]).includes(v);
}

/** A seeded run of numbers, so a scene is drawn the same way every time. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const W = 1600;
const H = 900;

/** One moving layer: the animation lives in stage.css, keyed by name. */
const move = (name: string, seconds: number, origin = 'center', delay = 0, box: 'fill-box' | 'view-box' = 'fill-box'): CSSProperties => ({
  animation: `${name} ${seconds}s ease-in-out ${delay}s infinite alternate`,
  transformOrigin: origin,
  transformBox: box,
});

function Floodlights() {
  return (
    <>
      <defs>
        <linearGradient id="bd-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9db7ff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#9db7ff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="bd-floor" cx="0.5" cy="1" r="0.6">
          <stop offset="0" stopColor="#3a6bff" stopOpacity="0.2" />
          <stop offset="1" stopColor="#3a6bff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="560" width={W} height="340" fill="url(#bd-floor)" />
      {/* Two light towers, their beams sweeping slowly across the floor. */}
      <g style={move('bd-sweep', 13, 'top left')}>
        <polygon points="120,-20 190,-20 900,900 420,900" fill="url(#bd-beam)" />
      </g>
      <g style={move('bd-sweep-back', 15, 'top right')}>
        <polygon points="1410,-20 1480,-20 1180,900 700,900" fill="url(#bd-beam)" />
      </g>
    </>
  );
}

function Hills() {
  return (
    <>
      <defs>
        <radialGradient id="bd-mist" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#b9c9ff" stopOpacity="0.1" />
          <stop offset="1" stopColor="#b9c9ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bd-moonglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#c9d8ff" stopOpacity="0.2" />
          <stop offset="1" stopColor="#c9d8ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="1470" cy="150" r="150" fill="url(#bd-moonglow)" />
      <circle cx="1470" cy="150" r="44" fill="#c9d8ff" opacity="0.24" />
      <path d="M0 610 C 220 520 380 560 560 600 S 960 500 1180 560 S 1480 610 1600 560 V 900 H 0 Z" fill="#111b4c" />
      <g style={move('bd-drift', 38)}>
        <ellipse cx="350" cy="640" rx="560" ry="60" fill="url(#bd-mist)" />
        <ellipse cx="1350" cy="690" rx="480" ry="50" fill="url(#bd-mist)" />
      </g>
      <path d="M0 700 C 260 640 420 690 640 700 S 1060 630 1300 690 S 1520 720 1600 690 V 900 H 0 Z" fill="#0c1439" />
      <path d="M0 800 C 300 760 520 790 800 800 S 1260 760 1600 790 V 900 H 0 Z" fill="#080d28" />
    </>
  );
}

function Harbour() {
  const r = seeded(7);
  const streaks = Array.from({ length: 16 }, () => ({ x: 980 + r() * 340, y: 690 + r() * 190, w: 30 + r() * 90 }));
  return (
    <>
      <defs>
        <linearGradient id="bd-sweep-light" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffd77a" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffd77a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* A headland with a lighthouse whose beam turns slowly over the water. */}
      <path d="M760 690 C 900 620 1040 600 1160 620 C 1260 636 1380 650 1600 640 V 690 Z" fill="#101a48" />
      <rect x="1150" y="520" width="26" height="104" fill="#18245c" />
      <rect x="1144" y="508" width="38" height="16" rx="3" fill="#ffd77a" opacity="0.75" />
      <g style={move('bd-beam-turn', 9, '1163px 516px', 0, 'view-box')}>
        <polygon points="1163,516 160,420 160,612" fill="url(#bd-sweep-light)" />
      </g>
      <rect x="0" y="690" width={W} height="210" fill="#070c25" />
      <g style={move('bd-shimmer', 6)}>
        {streaks.map((s, i) => (
          <rect key={i} x={s.x} y={s.y} width={s.w} height="3" rx="1.5" fill="#ffd77a" opacity={0.08 + (i % 4) * 0.04} />
        ))}
      </g>
    </>
  );
}

function Aurora() {
  return (
    <>
      <defs>
        <linearGradient id="bd-ribbon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22cfc3" stopOpacity="0" />
          <stop offset="0.55" stopColor="#22cfc3" stopOpacity="0.24" />
          <stop offset="1" stopColor="#2bd47e" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bd-ribbon-2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3d9bff" stopOpacity="0" />
          <stop offset="0.6" stopColor="#3d9bff" stopOpacity="0.2" />
          <stop offset="1" stopColor="#22cfc3" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g style={move('bd-ribbon-sway', 17)}>
        <path d="M-100 120 C 300 40 520 260 860 170 S 1400 40 1700 150 L 1700 420 C 1400 330 1200 470 860 400 S 280 300 -100 380 Z" fill="url(#bd-ribbon)" />
      </g>
      <g style={move('bd-ribbon-sway', 23, 'center', -8)}>
        <path d="M-100 260 C 260 200 600 360 940 280 S 1420 200 1700 300 L 1700 520 C 1380 450 1100 560 820 500 S 240 430 -100 500 Z" fill="url(#bd-ribbon-2)" />
      </g>
      <path d="M0 760 L 180 700 L 300 740 L 470 660 L 640 735 L 820 690 L 1010 750 L 1200 680 L 1390 740 L 1600 700 V 900 H 0 Z" fill="#0c1439" />
      <path d="M0 830 C 400 800 900 820 1600 800 V 900 H 0 Z" fill="#080d28" />
    </>
  );
}

function Rooftops() {
  const r = seeded(31);
  const blocks: { x: number; w: number; h: number }[] = [];
  for (let x = -20; x < W; ) {
    const w = 70 + Math.floor(r() * 120);
    blocks.push({ x, w, h: 110 + Math.floor(r() * 190) });
    x += w + 6;
  }
  const windows: { x: number; y: number; blink: boolean }[] = [];
  for (const b of blocks) {
    for (let wy = H - b.h + 26; wy < H - 30; wy += 34) {
      for (let wx = b.x + 14; wx < b.x + b.w - 20; wx += 26) if (r() < 0.16) windows.push({ x: wx, y: wy, blink: r() < 0.18 });
    }
  }
  return (
    <>
      <g fill="#0c1439">
        {blocks.map((b, i) => (
          <rect key={i} x={b.x} y={H - b.h} width={b.w} height={b.h} />
        ))}
      </g>
      {windows.map((w, i) => (
        <rect key={i} x={w.x} y={w.y} width="9" height="12" rx="1.5" fill="#ffc233" opacity={0.34} style={w.blink ? { animation: `bd-window ${9 + (i % 5) * 3}s steps(1) ${-(i % 7)}s infinite` } : undefined} />
      ))}
      <rect x="0" y={H - 30} width={W} height="30" fill="#070b22" />
    </>
  );
}

function Forest() {
  const row = (seed: number, base: number, size: number, fill: string) => {
    const r = seeded(seed);
    const trees: ReactNode[] = [];
    for (let x = -40; x < W + 40; x += size * (0.55 + r() * 0.35)) {
      const h = size * (0.8 + r() * 0.5);
      trees.push(<polygon key={x} points={`${x},${base} ${x + h * 0.28},${base - h} ${x + h * 0.56},${base}`} />);
    }
    return (
      <g fill={fill}>
        {trees}
        <rect x="0" y={base - 2} width={W} height={H - base + 2} />
      </g>
    );
  };
  return (
    <>
      <defs>
        <radialGradient id="bd-fog" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#a9bcff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#a9bcff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {row(3, 690, 190, '#121c4f')}
      <g style={move('bd-drift', 42)}>
        <ellipse cx="300" cy="690" rx="600" ry="60" fill="url(#bd-fog)" />
        <ellipse cx="1300" cy="645" rx="500" ry="55" fill="url(#bd-fog)" />
      </g>
      {row(11, 790, 160, '#0c1439')}
      {row(19, 880, 130, '#070c24')}
    </>
  );
}

const SCENES: Record<Exclude<BackdropId, 'plain'>, () => ReactNode> = { floodlights: Floodlights, hills: Hills, harbour: Harbour, aurora: Aurora, rooftops: Rooftops, forest: Forest };

/** The scene itself, filling its box (the screen behind the room, or a small preview). */
export function BackdropScene({ id, className = '' }: { id: BackdropId; className?: string }) {
  if (id === 'plain') return null;
  const Scene = SCENES[id];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className={`backdrop block ${className}`} aria-hidden focusable="false">
      <Scene />
    </svg>
  );
}

/**
 * The chosen scene behind the whole big screen. `on` fades it in for the lobby and between
 * questions, and out while a question is up, so the picture belongs to the game then.
 */
export function Backdrop({ id, on }: { id: BackdropId; on: boolean }) {
  if (id === 'plain') return null;
  return (
    <div className={`pointer-events-none fixed inset-0 -z-10 transition-opacity duration-500 ease-[var(--ease-out)] ${on ? 'opacity-100' : 'opacity-0'}`} aria-hidden data-backdrop={id}>
      <BackdropScene id={id} className="size-full" />
    </div>
  );
}

/** The host's backdrop: saved to their account (so it follows the teacher to any computer), or to this device when signed out. */
export function useBackdrop(): [BackdropId, (id: BackdropId) => void] {
  const { prefs, save, signedIn } = usePrefs();
  const [local, setLocal] = useState<BackdropId>(() => {
    try {
      const v = localStorage.getItem(LOCAL_KEY);
      return isBackdrop(v) ? v : DEFAULT_BACKDROP;
    } catch {
      return DEFAULT_BACKDROP;
    }
  });
  const chosen = signedIn ? (prefs as { stageBackdrop?: string }).stageBackdrop : local;
  const set = (id: BackdropId) => {
    // The host picked one: it wins over a set's own backdrop for the rest of this visit (setFeel.tsx).
    try {
      sessionStorage.setItem('ludora.backdrop.chosen', '1');
    } catch {
      /* private mode: the set's backdrop may come back next game */
    }
    if (signedIn) save({ stageBackdrop: id });
    else {
      setLocal(id);
      try {
        localStorage.setItem(LOCAL_KEY, id);
      } catch {
        /* private mode: it lasts this visit */
      }
    }
  };
  return [isBackdrop(chosen) ? chosen : DEFAULT_BACKDROP, set];
}
const LOCAL_KEY = 'ludora.backdrop';

/** The lobby's "Backdrop" button and its picker: a preview of each scene, one tap to choose. */
export function BackdropPicker() {
  const [open, setOpen] = useState(false);
  const [id, set] = useBackdrop();
  return (
    <>
      <Button icon={<Mountain className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
        Backdrop
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Backdrop for the big screen" description="Shown behind the lobby and between questions. It holds still for anyone who asked for less motion." size="lg">
        <div role="radiogroup" aria-label="Backdrop" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {BACKDROPS.map((b) => {
            const on = b === id;
            return (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set(b)}
                className={`group flex flex-col gap-1.5 rounded-[var(--radius-l)] p-1.5 text-left font-bold ${on ? 'bg-lantern text-on-accent' : 'bg-surface-2 text-text hover:bg-surface-3'}`}
              >
                <span className="stage relative block aspect-video overflow-hidden rounded-[var(--radius-m)]">
                  <BackdropScene id={b} className="absolute inset-0 size-full" />
                </span>
                <span className="flex items-center gap-1.5 px-1 pb-0.5">
                  {on ? <Check className="size-4 shrink-0" strokeWidth={3} aria-hidden /> : null}
                  {BACKDROP_NAMES[b]}
                </span>
              </button>
            );
          })}
        </div>
      </Dialog>
    </>
  );
}
