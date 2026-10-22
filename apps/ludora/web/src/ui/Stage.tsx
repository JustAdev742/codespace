import { useId, type ReactNode } from 'react';

/*
 * The stage: the dusk sky of a lantern festival. Game screens, the landing
 * hero and the join flow sit on it. Paper lanterns drift at the edges, clear of
 * the content; they are decoration, hidden from assistive technology, and hold
 * still under reduced motion (the global motion rules stop their animation).
 */

interface SkyLantern {
  /** Position as a percentage of the stage. */
  x: number;
  y: number;
  size: number;
  hue: number;
  /** Seconds for one drift cycle; varied so the lanterns never move in step. */
  drift: number;
  delay: number;
  opacity: number;
  /** Shown on wide screens only, where there is room beside the content. */
  wide?: boolean;
}

const LANTERNS: SkyLantern[] = [
  { x: 4, y: 10, size: 46, hue: 38, drift: 9, delay: 0, opacity: 0.95, wide: true },
  { x: 13, y: 62, size: 30, hue: 340, drift: 11, delay: -3, opacity: 0.7, wide: true },
  { x: 1, y: 86, size: 22, hue: 160, drift: 8, delay: -5, opacity: 0.55 },
  { x: 88, y: 8, size: 34, hue: 200, drift: 10, delay: -2, opacity: 0.75, wide: true },
  { x: 93, y: 46, size: 52, hue: 30, drift: 12, delay: -6, opacity: 0.95, wide: true },
  { x: 90, y: 90, size: 22, hue: 300, drift: 9.5, delay: -4, opacity: 0.6 },
  { x: 46, y: 2, size: 18, hue: 48, drift: 8.5, delay: -1, opacity: 0.45, wide: true },
];

/** Full-width game screens put headings and pills along the top, so the big top-left lantern hangs lower there. */
const GAME_LANTERNS: SkyLantern[] = LANTERNS.map((l) => (l.x < 10 && l.y < 20 ? { ...l, y: 52 } : l));

function PaperLantern({ hue, size }: { hue: number; size: number }) {
  const id = `sky-lantern-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size * 1.5} viewBox="0 0 40 60" aria-hidden focusable={false}>
      <defs>
        <radialGradient id={id} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#fff7d6" />
          <stop offset="55%" stopColor={`hsl(${hue} 95% 68%)`} />
          <stop offset="100%" stopColor={`hsl(${hue} 80% 52%)`} />
        </radialGradient>
        <radialGradient id={`${id}-halo`}>
          <stop offset="0%" stopColor={`hsl(${hue} 100% 70%)`} stopOpacity="0.55" />
          <stop offset="100%" stopColor={`hsl(${hue} 100% 70%)`} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="28" r="20" fill={`url(#${id}-halo)`} />
      <rect x="14" y="7" width="12" height="5" rx="2" fill={`hsl(${hue} 60% 30%)`} />
      <path d="M8 18C8 13 13 11 20 11C27 11 32 13 32 18V38C32 43 27 45 20 45C13 45 8 43 8 38Z" fill={`url(#${id})`} />
      <path d="M14 11.5C12 22 12 34 14 44.5M26 11.5C28 22 28 34 26 44.5" fill="none" stroke={`hsl(${hue} 70% 40%)`} strokeWidth="1.2" opacity="0.45" />
      <rect x="14" y="44" width="12" height="4" rx="2" fill={`hsl(${hue} 60% 30%)`} />
      <path d="M20 48V56" stroke={`hsl(${hue} 90% 75%)`} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SkyLanterns({ count = LANTERNS.length, layout = 'hero' }: { count?: number; layout?: 'hero' | 'game' }) {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      {(layout === 'game' ? GAME_LANTERNS : LANTERNS).slice(0, count).map((l, i) => (
        <div
          key={i}
          className={l.wide ? 'absolute hidden md:block' : 'absolute'}
          style={{
            left: `${l.x}%`,
            top: `${l.y}%`,
            opacity: l.opacity,
            animation: `lantern-drift ${l.drift}s ease-in-out ${l.delay}s infinite`,
          }}
        >
          <PaperLantern hue={l.hue} size={l.size} />
        </div>
      ))}
    </div>
  );
}

/** `lanterns`: false for none; 'game' keeps the top band clear for a game screen's headings. */
export function Stage({ children, className = '', lanterns = true, as: As = 'div' }: { children: ReactNode; className?: string; lanterns?: boolean | 'game'; as?: 'div' | 'section' | 'main' }) {
  return (
    <As className={`stage relative isolate overflow-hidden ${className}`}>
      {lanterns ? <SkyLanterns layout={lanterns === 'game' ? 'game' : 'hero'} /> : null}
      {children}
    </As>
  );
}
