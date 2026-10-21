import { memo, useId } from 'react';
import type { LanternArt } from '@ludora/shared';

/*
 * A paper Lantern (a pack): a round paper body on bamboo ribs, a lacquered cap
 * and base, and a tassel. `lit` lights the candle inside. The opening sequence
 * animates the cap and the inner light through `capClassName` and
 * `glowClassName`. Shapes stay bold so the Lantern still reads at 16px.
 */
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
  const paper = `hsl(${art.hue} 78% ${lit ? 64 : 60}%)`;
  const paperEdge = `hsl(${art.hue} 70% ${lit ? 52 : 48}%)`;
  const deep = `hsl(${art.hue} 55% 30%)`;
  const lacquer = `hsl(${art.hue} 45% 22%)`;
  const accent = `hsl(${art.accentHue} 92% 78%)`;
  const clip = `lantern-${uid}`;
  const body = 'M27 42C27 31 41 26 60 26C79 26 93 31 93 42V84C93 95 79 100 60 100C41 100 27 95 27 84Z';
  return (
    <svg viewBox="0 0 120 130" width={size} height={(size * 130) / 120} className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable={false} overflow="visible">
      <defs>
        <clipPath id={clip}>
          <path d={body} />
        </clipPath>
        <radialGradient id={`paper-${uid}`} cx="50%" cy="54%" r="62%">
          <stop offset="0%" stopColor={lit ? '#fffbe6' : paper} />
          <stop offset={lit ? '38%' : '55%'} stopColor={paper} />
          <stop offset="100%" stopColor={paperEdge} />
        </radialGradient>
        <radialGradient id={`halo-${uid}`}>
          <stop offset="0%" stopColor="#ffe08a" stopOpacity="0.75" />
          <stop offset="45%" stopColor={`hsl(${art.hue} 100% 70%)`} stopOpacity="0.32" />
          <stop offset="100%" stopColor={`hsl(${art.hue} 100% 70%)`} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`core-${uid}`}>
          <stop offset="0%" stopColor="#fff6d0" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff6d0" stopOpacity="0" />
        </radialGradient>
      </defs>

      {lit ? <circle cx="60" cy="64" r="60" fill={`url(#halo-${uid})`} /> : null}

      {/* Hanging cord and cap */}
      <path d="M60 2V16" stroke="var(--ink)" strokeWidth="3.2" strokeLinecap="round" />
      <g className={capClassName} style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
        <path d="M46 16H74L79 28H41Z" fill={lacquer} stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" />
        <path d="M48 21H72" stroke={accent} strokeWidth="2.4" strokeLinecap="round" opacity={0.9} />
      </g>

      {/* Paper body */}
      <path d={body} fill={`url(#paper-${uid})`} />
      <g clipPath={`url(#${clip})`}>
        <LanternPattern pattern={art.pattern} color={accent} />
        {lit ? <circle className={glowClassName} cx="60" cy="66" r="26" fill={`url(#core-${uid})`} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} /> : null}
        {/* Bamboo ribs */}
        {[38, 49, 60, 71, 82].map((x) => (
          <path key={x} d={`M${x} 26C${x + (x - 60) * 0.42} 48 ${x + (x - 60) * 0.42} 78 ${x} 100`} fill="none" stroke={deep} strokeWidth="1.8" opacity={0.42} />
        ))}
        <path d="M27 38C40 34 80 34 93 38M27 88C40 92 80 92 93 88" fill="none" stroke={deep} strokeWidth="2.2" opacity={0.5} />
        {/* Paper sheen */}
        <path d="M37 44C34 54 34 72 38 82" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity={0.38} />
      </g>
      <path d={body} fill="none" stroke="var(--ink)" strokeWidth="3.2" />

      {/* Base and tassel */}
      <path d="M43 97H77L73 108H47Z" fill={lacquer} stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="60" cy="112" r="3.6" fill={accent} stroke="var(--ink)" strokeWidth="2" />
      <path d="M55 115.5L53 127M60 116V129M65 115.5L67 127" stroke={accent} strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
});

function LanternPattern({ pattern, color }: { pattern: LanternArt['pattern']; color: string }) {
  const p = { fill: color, opacity: 0.85 };
  switch (pattern) {
    case 'waves':
      return (
        <g fill="none" stroke={color} strokeWidth="4.5" opacity={0.8} strokeLinecap="round">
          <path d="M22 54C32 46 42 46 52 54C62 62 72 62 82 54C88 50 94 50 98 52" />
          <path d="M22 74C32 66 42 66 52 74C62 82 72 82 82 74C88 70 94 70 98 72" />
        </g>
      );
    case 'stars':
      return (
        <g {...p}>
          {[
            [44, 46, 6],
            [74, 54, 5],
            [52, 76, 5.5],
            [79, 84, 4],
            [38, 88, 3.5],
          ].map(([x, y, r], i) => (
            <path key={i} d={`M${x} ${y! - r!}Q${x! + r! * 0.3} ${y! - r! * 0.3} ${x! + r!} ${y}Q${x! + r! * 0.3} ${y! + r! * 0.3} ${x} ${y! + r!}Q${x! - r! * 0.3} ${y! + r! * 0.3} ${x! - r!} ${y}Q${x! - r! * 0.3} ${y! - r! * 0.3} ${x} ${y! - r!}Z`} />
          ))}
        </g>
      );
    case 'leaves':
      return (
        <g {...p}>
          <path d="M36 62C36 49 47 42 61 42C61 55 50 62 36 62Z" />
          <path d="M58 88C58 75 69 68 83 68C83 81 72 88 58 88Z" />
          <path d="M36 62L52 50M58 88L74 76" stroke="var(--ink)" strokeWidth="1.4" opacity={0.25} />
        </g>
      );
    case 'flames':
      return (
        <g {...p}>
          <path d="M46 90C37 81 41 67 50 60C50 69 55 71 57 73C57 62 64 53 71 48C69 59 78 66 76 79C74 88 65 93 58 93C53 93 49 92 46 90Z" />
        </g>
      );
    case 'frost':
      return (
        <g fill="none" stroke={color} strokeWidth="3.4" strokeLinecap="round" opacity={0.9}>
          <path d="M60 44V86M42 54L78 76M42 76L78 54" />
          <path d="M55 47L60 52L65 47M55 83L60 78L65 83" />
        </g>
      );
    case 'circuit':
      return (
        <g fill="none" stroke={color} strokeWidth="3.4" opacity={0.9} strokeLinejoin="round">
          <path d="M28 50H48V63H70V48H92M28 80H54V71H92" />
          <circle cx="48" cy="50" r="3.4" fill={color} />
          <circle cx="70" cy="63" r="3.4" fill={color} />
          <circle cx="54" cy="80" r="3.4" fill={color} />
        </g>
      );
    case 'books':
      return (
        <g {...p}>
          <rect x="38" y="56" width="11" height="32" rx="2" />
          <rect x="52" y="49" width="11" height="39" rx="2" />
          <rect x="66" y="58" width="13" height="30" rx="2" transform="rotate(8 72 72)" />
        </g>
      );
    case 'moons':
      return (
        <g {...p}>
          <path d="M67 42A15 15 0 1 0 78 68A12 12 0 1 1 67 42Z" />
          <circle cx="43" cy="84" r="4.5" />
          <circle cx="79" cy="88" r="3.4" />
          <circle cx="42" cy="50" r="2.6" />
        </g>
      );
    default:
      return null;
  }
}
