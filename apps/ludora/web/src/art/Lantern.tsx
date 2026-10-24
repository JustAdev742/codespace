import { memo, useId, type ReactNode } from 'react';
import type { LanternArt } from '@ludora/shared';

/*
 * A Lantern (a pack): a collectible lantern with a gold frame, a faceted glass
 * housing in the pack's colour, a lacquered cap and base and a ring handle.
 * Its pattern is an emblem on the front pane. The same crisp dark contour as
 * the Glims, and hard cel shading: the side panes sit in shadow, the front
 * pane catches one hard sheen. `lit` lights the core inside. The opening
 * sequence animates the cap and the core through `capClassName` and
 * `glowClassName`. Shapes stay bold so a Lantern still reads at 14px.
 */

const GOLD = 'hsl(44 92% 58%)';
const GOLD_DEEP = 'hsl(36 86% 38%)';

/* The housing, in a 120 x 130 box: a ring handle, the cap, two gold rims round the glass, the base and its foot. */
const HANDLE = 'M50 18.5V13.5A10 10 0 0 1 70 13.5V18.5';
const FINIAL = 'M53 15.5H67V21H53Z';
const CAP = 'M42 20.5H78Q79.6 20.5 80.6 21.8L91.6 32.4Q92.6 34 90.6 34H29.4Q27.4 34 28.4 32.4L39.4 21.8Q40.4 20.5 42 20.5Z';
const RIM_TOP = 'M28.5 33.5H91.5Q93 33.5 93 35V38.5Q93 40 91.5 40H28.5Q27 40 27 38.5V35Q27 33.5 28.5 33.5Z';
const GLASS = 'M30 39.5H90V99.5H30Z';
const RIM_BOTTOM = 'M28.5 99H91.5Q93 99 93 100.5V104Q93 105.5 91.5 105.5H28.5Q27 105.5 27 104V100.5Q27 99 28.5 99Z';
const BASE = 'M32.5 105H87.5L81.6 115.6Q81 117 79.4 117H40.6Q39 117 38.4 115.6Z';
const FOOT = 'M47 116.5H73V121.6Q73 123.5 71.1 123.5H48.9Q47 123.5 47 121.6Z';
const PANE_L = 'M30 40H42V99H30Z';
const PANE_R = 'M78 40H90V99H78Z';
const PILLARS = 'M40.1 40H43.9V99H40.1ZM76.1 40H79.9V99H76.1Z';

export const Lantern = memo(function Lantern({
  art,
  size = 120,
  lit = false,
  className,
  title,
  capClassName,
  glowClassName,
}: {
  art: LanternArt;
  size?: number;
  lit?: boolean;
  className?: string;
  title?: string;
  /** Extra class on the cap, so a reveal can lift it off. */
  capClassName?: string;
  /** Extra class on the inner light, so a reveal can make it pulse. */
  glowClassName?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const h = art.hue;
  const ink = `hsl(${h} 42% 10%)`;
  const front = `hsl(${h} ${lit ? 88 : 72}% ${lit ? 60 : 50}%)`;
  const side = `hsl(${(h + 8) % 360} ${lit ? 72 : 62}% ${lit ? 42 : 34}%)`;
  const lacquer = `hsl(${h} 40% 21%)`;
  const lacquerLight = `hsl(${h} 38% 31%)`;
  const accent = `hsl(${art.accentHue} 95% ${lit ? 74 : 66}%)`;
  const tiny = size <= 28;
  const id = (n: string) => `lantern-${n}-${uid}`;
  const contour = (parts: string[]) => (
    <g fill={ink} stroke={ink} strokeWidth={tiny ? 9 : 6} strokeLinejoin="round" strokeLinecap="round">
      {parts.map((d, i) => (
        <path key={i} d={d} fill={d === HANDLE ? 'none' : ink} strokeWidth={d === HANDLE ? (tiny ? 12 : 9) : undefined} />
      ))}
    </g>
  );
  return (
    <svg viewBox="0 0 120 130" width={size} height={(size * 130) / 120} className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable={false} overflow="visible">
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={id('glass')}>
          <path d={GLASS} />
        </clipPath>
        <radialGradient id={id('core')} cx="0.5" cy="0.55" r="0.5">
          <stop offset="0" stopColor="#fffbe8" stopOpacity="1" />
          <stop offset="0.45" stopColor={`hsl(${h} 100% 86%)`} stopOpacity="0.85" />
          <stop offset="1" stopColor={`hsl(${h} 100% 70%)`} stopOpacity="0" />
        </radialGradient>
        {lit ? (
          <radialGradient id={id('halo')}>
            <stop offset="0" stopColor={`hsl(${h} 100% 70%)`} stopOpacity="0.5" />
            <stop offset="0.55" stopColor={`hsl(${h} 100% 64%)`} stopOpacity="0.16" />
            <stop offset="1" stopColor={`hsl(${h} 100% 64%)`} stopOpacity="0" />
          </radialGradient>
        ) : null}
      </defs>

      {lit ? <circle cx="60" cy="70" r="60" fill={`url(#${id('halo')})`} /> : null}

      {/* One crisp outer contour under the fills. The cap carries its own, so it can lift off whole; the rim is drawn over its lower edge. */}
      {contour([RIM_TOP, GLASS, RIM_BOTTOM, BASE, FOOT])}

      {/* The cap: lifts off as a Lantern opens */}
      <g className={capClassName} style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
        {contour([HANDLE, FINIAL, CAP])}
        <path d={HANDLE} fill="none" stroke={GOLD} strokeWidth={tiny ? 5 : 3.4} strokeLinecap="round" />
        <path d={FINIAL} fill={GOLD} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
        <path d={CAP} fill={lacquer} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
        <path d="M43 24.5H77" stroke={lacquerLight} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M32 30.8H88" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
      </g>

      {/* The glass and what shows through it */}
      <path d={GLASS} fill={front} />
      <g clipPath={`url(#${id('glass')})`}>
        {lit ? <circle className={glowClassName} cx="60" cy="72" r="30" fill={`url(#${id('core')})`} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} /> : null}
        {tiny ? null : <Emblem pattern={art.pattern} fill={accent} line={ink} />}
        <path d={PANE_L} fill={side} opacity={0.9} />
        <path d={PANE_R} fill={side} opacity={0.9} />
        {/* One hard sheen across the front pane */}
        <path d="M52 40H60.5L51 99H42.5Z" fill="#fff" opacity={lit ? 0.3 : 0.2} />
      </g>
      <path d={PILLARS} fill={GOLD} stroke={ink} strokeWidth="1.6" />
      <path d={GLASS} fill="none" stroke={ink} strokeWidth="2" />

      {/* Rims, base and foot in lacquer and gold */}
      <path d={RIM_TOP} fill={GOLD} stroke={ink} strokeWidth="2" />
      <path d="M29 38.2H91" stroke={GOLD_DEEP} strokeWidth="1.8" strokeLinecap="round" />
      <path d={RIM_BOTTOM} fill={GOLD} stroke={ink} strokeWidth="2" />
      <path d="M29 103.8H91" stroke={GOLD_DEEP} strokeWidth="1.8" strokeLinecap="round" />
      <path d={BASE} fill={lacquer} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
      <path d="M39 108.5H81" stroke={lacquerLight} strokeWidth="2.2" strokeLinecap="round" />
      <path d={FOOT} fill={GOLD} stroke={ink} strokeWidth="2" strokeLinejoin="round" />

    </svg>
  );
});

/** The pack's emblem on the front pane: one bold mark per pattern, in the accent colour with a dark edge. */
function Emblem({ pattern, fill, line }: { pattern: LanternArt['pattern']; fill: string; line: string }): ReactNode {
  const st = { fill, stroke: line, strokeWidth: 1.8, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const stroked = (w: number) => ({ fill: 'none', stroke: fill, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });
  switch (pattern) {
    case 'waves':
      return (
        <>
          <path d="M46 62C50 57 54 57 58 62C62 67 66 67 70 62C72 60 74 59.5 76 60M46 76C50 71 54 71 58 76C62 81 66 81 70 76C72 74 74 73.5 76 74" fill="none" stroke={line} strokeWidth="7" strokeLinecap="round" />
          <path d="M46 62C50 57 54 57 58 62C62 67 66 67 70 62C72 60 74 59.5 76 60M46 76C50 71 54 71 58 76C62 81 66 81 70 76C72 74 74 73.5 76 74" {...stroked(3.8)} />
        </>
      );
    case 'stars':
      return (
        <>
          <path d="M60 52L63.3 63.2L74.5 66.5L63.3 69.8L60 81L56.7 69.8L45.5 66.5L56.7 63.2Z" {...st} />
          <path d="M71.5 52L72.8 55.2L76 56.5L72.8 57.8L71.5 61L70.2 57.8L67 56.5L70.2 55.2Z" {...st} strokeWidth={1.2} />
        </>
      );
    case 'leaves':
      return (
        <>
          <path d="M47 80C47 63 57 53 73 52C73 69 63 80 47 80Z" {...st} />
          <path d="M49 78L66 60" fill="none" stroke={line} strokeWidth="1.8" strokeLinecap="round" />
        </>
      );
    case 'flames':
      return <path d="M60 50C63 57 71 61 71 71C71 78 66 83 60 83C54 83 49 78 49 72C49 66 53 63 55 58C56 62 58 64 60 65C58 60 58 55 60 50Z" {...st} />;
    case 'frost':
      return (
        <>
          <path d="M60 51V82M47 58.5L73 74.5M47 74.5L73 58.5M55.5 52.5L60 57L64.5 52.5M55.5 80.5L60 76L64.5 80.5" fill="none" stroke={line} strokeWidth="6.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M60 51V82M47 58.5L73 74.5M47 74.5L73 58.5M55.5 52.5L60 57L64.5 52.5M55.5 80.5L60 76L64.5 80.5" {...stroked(3)} />
        </>
      );
    case 'circuit':
      return (
        <>
          <path d="M46 58H55V66H66V56H75M46 76H58V70H75" fill="none" stroke={line} strokeWidth="6.4" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M46 58H55V66H66V56H75M46 76H58V70H75" {...stroked(3)} />
          <path d="M55 58m-3.2 0a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0M66 66m-3.2 0a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0M58 76m-3.2 0a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0" {...st} />
        </>
      );
    case 'books':
      return (
        <>
          <path d="M48 58H55V82H48ZM57 52H64V82H57Z" {...st} />
          <path d="M66.5 59.5L72.5 58.6L76 81.4L70 82.3Z" {...st} />
          <path d="M48 62H55M57 56H64M48 77H55M57 77H64" fill="none" stroke={line} strokeWidth="1.4" />
        </>
      );
    case 'moons':
      return (
        <>
          <path d="M66 51A16 16 0 1 0 75.5 77A12.5 12.5 0 1 1 66 51Z" {...st} />
          <path d="M71.5 61m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0" {...st} strokeWidth={1.2} />
        </>
      );
    case 'plain':
    default:
      // Plain Lanterns carry a simple lozenge, so every pattern draws something.
      return <path d="M60 55L68 67L60 79L52 67Z" {...st} />;
  }
}
