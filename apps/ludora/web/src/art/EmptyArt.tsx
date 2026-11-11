import { memo, useId, type ReactNode } from 'react';
import type { GlimArt } from '@ludora/shared';
import { Glim } from './glim/Glim.tsx';

/*
 * The picture on an empty state: a little night scene in the covers' style,
 * a Glim on a hill looking up at what belongs here (the page's icon, on the
 * gold slanted plate). Which Glim is fixed by the empty state's title, so the
 * same page always shows the same one. Decoration: the title says it all.
 */

const INK = '#0b1020';
const WAITING: GlimArt[] = [
  { kind: 'glim', body: 'drop', hue: 196, accentHue: 175, saturation: 74, eyes: 'sparkle', mouth: 'smile', pattern: 'none', topper: 'none', cheeks: true, brows: 'soft' },
  { kind: 'glim', body: 'sprout', hue: 108, accentHue: 84, saturation: 64, eyes: 'happy', mouth: 'smile', pattern: 'belly', topper: 'none', cheeks: true, ears: 'leaf' },
  { kind: 'glim', body: 'lantern', hue: 32, accentHue: 270, saturation: 84, eyes: 'star', mouth: 'o', pattern: 'belly', topper: 'flame', cheeks: true, brows: 'soft', tail: 'tassel' },
  { kind: 'glim', body: 'owl', hue: 354, accentHue: 46, saturation: 52, eyes: 'big', mouth: 'o', pattern: 'patch', topper: 'quill', cheeks: true, brows: 'surprised' },
  { kind: 'glim', body: 'mushroom', hue: 92, accentHue: 284, saturation: 44, eyes: 'sparkle', mouth: 'smile', pattern: 'stars', topper: 'antenna', cheeks: true },
];

function pick(seed: string): GlimArt {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return WAITING[h % WAITING.length]!;
}

export const EmptyArt = memo(function EmptyArt({ icon, seed }: { icon: ReactNode; seed: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <div className="relative h-[84px] w-[148px] overflow-hidden rounded-[var(--radius-l)]" aria-hidden>
      <svg viewBox="0 0 148 84" className="absolute inset-0 block h-full w-full" focusable={false}>
        <defs>
          <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.2" stopColor="#0a0f2c" />
            <stop offset="1" stopColor="#24307a" />
          </linearGradient>
          <radialGradient id={`${id}l`} cx="0.7" cy="0.2" r="0.55">
            <stop offset="0" stopColor="#ffc233" stopOpacity="0.45" />
            <stop offset="1" stopColor="#ffc233" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="148" height="84" fill={`url(#${id}s)`} />
        <rect width="148" height="84" fill={`url(#${id}l)`} />
        <path d="M-2 86V64Q30 54 60 60Q100 68 150 56V86Z" fill="#141c4a" />
        <path d="M-2 86V74Q40 66 80 72Q120 78 150 70V86Z" fill={INK} opacity={0.6} />
        <ellipse cx="42" cy="73" rx="16" ry="3" fill={INK} opacity={0.5} />
        <g transform="translate(14 18)">
          <Glim art={pick(seed)} size={58} uniform={false} ground={false} />
        </g>
      </svg>
      {/* The page's icon on the gold slanted plate. */}
      <div className="absolute top-[14px] right-[18px] grid size-[46px] -skew-x-[10deg] place-items-center rounded-[var(--radius-m)] bg-lantern text-on-accent shadow-[inset_0_-4px_0_rgb(0_0_0/0.22)] [&_svg]:size-6 [&_svg]:skew-x-[10deg]">
        {icon}
      </div>
    </div>
  );
});
