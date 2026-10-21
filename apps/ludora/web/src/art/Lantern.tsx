import { memo, useId } from 'react';
import type { LanternArt } from '@ludora/shared';

/** A paper Lantern (a pack). `lit` adds the inner glow used while opening. */
export const Lantern = memo(function Lantern({ art, size = 120, lit = false, className, title }: { art: LanternArt; size?: number; lit?: boolean; className?: string; title?: string }) {
  const uid = useId().replace(/:/g, '');
  const paper = `hsl(${art.hue} 75% 62%)`;
  const deep = `hsl(${art.hue} 55% 34%)`;
  const accent = `hsl(${art.accentHue} 90% 80%)`;
  const clip = `lantern-${uid}`;
  const body = 'M30 38C30 30 44 26 60 26C76 26 90 30 90 38V86C90 94 76 98 60 98C44 98 30 94 30 86Z';
  return (
    <svg viewBox="0 0 120 130" width={size} height={(size * 130) / 120} className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <clipPath id={clip}>
          <path d={body} />
        </clipPath>
        <radialGradient id={`glow-${uid}`}>
          <stop offset="0%" stopColor="#fff6c8" stopOpacity={lit ? 0.95 : 0.55} />
          <stop offset="60%" stopColor="#ffb020" stopOpacity={lit ? 0.5 : 0.18} />
          <stop offset="100%" stopColor="#ffb020" stopOpacity={0} />
        </radialGradient>
      </defs>
      {lit ? <circle cx="60" cy="62" r="58" fill={`url(#glow-${uid})`} /> : null}
      <path d="M60 4V18" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
      <rect x="44" y="16" width="32" height="12" rx="4" fill={deep} stroke="var(--ink)" strokeWidth="3" />
      <path d={body} fill={paper} />
      <g clipPath={`url(#${clip})`}>
        <circle cx="60" cy="62" r="34" fill={`url(#glow-${uid})`} />
        <LanternPattern pattern={art.pattern} color={accent} />
        {[42, 60, 78].map((x) => (
          <path key={x} d={`M${x} 26C${x + (x - 60) * 0.25} 50 ${x + (x - 60) * 0.25} 74 ${x} 98`} fill="none" stroke={deep} strokeWidth="1.6" opacity={0.55} />
        ))}
      </g>
      <path d={body} fill="none" stroke="var(--ink)" strokeWidth="3" />
      <rect x="44" y="96" width="32" height="10" rx="4" fill={deep} stroke="var(--ink)" strokeWidth="3" />
      <path d="M54 106V120M60 106V124M66 106V120" stroke={accent} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
});

function LanternPattern({ pattern, color }: { pattern: LanternArt['pattern']; color: string }) {
  const p = { fill: color, opacity: 0.8 };
  switch (pattern) {
    case 'waves':
      return (
        <g fill="none" stroke={color} strokeWidth="4" opacity={0.75} strokeLinecap="round">
          <path d="M24 52C34 44 44 44 54 52C64 60 74 60 84 52C90 48 94 48 98 50" />
          <path d="M24 72C34 64 44 64 54 72C64 80 74 80 84 72C90 68 94 68 98 70" />
        </g>
      );
    case 'stars':
      return (
        <g {...p}>
          {[
            [44, 44, 5],
            [72, 52, 4],
            [52, 74, 4.5],
            [78, 82, 3.5],
            [40, 88, 3],
          ].map(([x, y, r], i) => (
            <path key={i} d={`M${x} ${y! - r!}Q${x! + r! * 0.3} ${y! - r! * 0.3} ${x! + r!} ${y}Q${x! + r! * 0.3} ${y! + r! * 0.3} ${x} ${y! + r!}Q${x! - r! * 0.3} ${y! + r! * 0.3} ${x! - r!} ${y}Q${x! - r! * 0.3} ${y! - r! * 0.3} ${x} ${y! - r!}Z`} />
          ))}
        </g>
      );
    case 'leaves':
      return (
        <g {...p}>
          <path d="M40 60C40 48 50 42 62 42C62 54 52 60 40 60Z" />
          <path d="M60 84C60 72 70 66 82 66C82 78 72 84 60 84Z" />
        </g>
      );
    case 'flames':
      return (
        <g {...p}>
          <path d="M48 86C40 78 44 66 52 60C52 68 56 70 58 72C58 62 64 54 70 50C68 60 76 66 74 78C72 86 64 90 58 90C54 90 50 88 48 86Z" />
        </g>
      );
    case 'frost':
      return (
        <g fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" opacity={0.85}>
          <path d="M60 46V82M44 55L76 73M44 73L76 55" />
          <path d="M56 48L60 52L64 48M56 80L60 76L64 80" />
        </g>
      );
    case 'circuit':
      return (
        <g fill="none" stroke={color} strokeWidth="3" opacity={0.85} strokeLinejoin="round">
          <path d="M34 50H50V62H70V48H86M34 78H56V70H86" />
          <circle cx="50" cy="50" r="3" fill={color} />
          <circle cx="70" cy="62" r="3" fill={color} />
          <circle cx="56" cy="78" r="3" fill={color} />
        </g>
      );
    case 'books':
      return (
        <g {...p}>
          <rect x="40" y="56" width="10" height="30" rx="2" />
          <rect x="53" y="50" width="10" height="36" rx="2" />
          <rect x="66" y="58" width="12" height="28" rx="2" transform="rotate(8 72 72)" />
        </g>
      );
    case 'moons':
      return (
        <g {...p}>
          <path d="M66 42A14 14 0 1 0 76 66A11 11 0 1 1 66 42Z" />
          <circle cx="44" cy="82" r="4" />
          <circle cx="78" cy="86" r="3" />
        </g>
      );
    default:
      return null;
  }
}
