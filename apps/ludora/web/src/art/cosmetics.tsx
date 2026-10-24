import { memo, useId, type ReactNode } from 'react';
import type { ItemArt, Rarity } from '@ludora/shared';
import { Glim } from './glim/Glim.tsx';
import { AccessoryPreview } from './glim/accessories.tsx';

/* Previews for every item type, plus the frame and banner used on profiles. Crisp shapes, dark edges, the game's colours. */

type FrameStyle = Extract<ItemArt, { kind: 'frame' }>['style'];
type BannerPattern = Extract<ItemArt, { kind: 'banner' }>['pattern'];

/** A decorative ring drawn around an avatar. Children sit in the middle. */
export function FrameRing({ style, hue, accentHue, size = 96, children }: { style: FrameStyle; hue: number; accentHue?: number | undefined; size?: number; children?: ReactNode }) {
  const c = `hsl(${hue} 86% 60%)`;
  const a = `hsl(${accentHue ?? (hue + 40) % 360} 92% 72%)`;
  /** A dark bezel under every frame, so it reads crisply on light and dark alike. */
  const bezel = `hsl(${hue} 45% 12%)`;
  const ring = (() => {
    switch (style) {
      case 'ring':
        return <circle cx="60" cy="60" r="54" fill="none" stroke={c} strokeWidth="7" />;
      case 'dotted':
        return <circle cx="60" cy="60" r="54" fill="none" stroke={c} strokeWidth="7" strokeDasharray="1 10" strokeLinecap="round" />;
      case 'laurel':
        // Two sprays of leaves rising up the sides, tilted along the ring, open at the top.
        return (
          <g fill={c} stroke={bezel} strokeWidth="1.2">
            {[-1, 1].flatMap((side) =>
              Array.from({ length: 7 }, (_, k) => {
                const deg = side < 0 ? 112 + k * 21 : 68 - k * 21;
                const t = (deg * Math.PI) / 180;
                const x = 60 + 54 * Math.cos(t);
                const y = 60 + 54 * Math.sin(t);
                const tilt = deg + (side < 0 ? 60 : 120);
                return <ellipse key={`${side}-${k}`} cx={x} cy={y} rx="7.5" ry="3.6" transform={`rotate(${tilt} ${x} ${y})`} />;
              }),
            )}
          </g>
        );
      case 'stars':
        return (
          <g>
            <circle cx="60" cy="60" r="54" fill="none" stroke={c} strokeWidth="4" />
            {Array.from({ length: 8 }, (_, i) => {
              const t = (i * 45 * Math.PI) / 180;
              const x = 60 + 54 * Math.cos(t);
              const y = 60 + 54 * Math.sin(t);
              return <path key={i} d={`M${x} ${y - 7}L${x + 2} ${y - 2}L${x + 7} ${y}L${x + 2} ${y + 2}L${x} ${y + 7}L${x - 2} ${y + 2}L${x - 7} ${y}L${x - 2} ${y - 2}Z`} fill={a} stroke={bezel} strokeWidth="1.2" />;
            })}
          </g>
        );
      case 'flames':
        return (
          <g fill={c}>
            {Array.from({ length: 12 }, (_, i) => {
              const t = (i * 30 * Math.PI) / 180;
              const x = 60 + 52 * Math.cos(t);
              const y = 60 + 52 * Math.sin(t);
              return <path key={i} d={`M${x} ${y}c-4 -6 -2 -12 2 -14c0 5 3 6 4 8c1 3 -2 6 -6 6z`} transform={`rotate(${i * 30 + 90} ${x} ${y})`} />;
            })}
            <circle cx="60" cy="60" r="52" fill="none" stroke={a} strokeWidth="3" />
          </g>
        );
      case 'waves':
        return <path d={Array.from({ length: 24 }, (_, i) => { const t = (i * 15 * Math.PI) / 180; const r = i % 2 ? 50 : 57; return `${i ? 'L' : 'M'}${(60 + r * Math.cos(t)).toFixed(1)} ${(60 + r * Math.sin(t)).toFixed(1)}`; }).join('') + 'Z'} fill="none" stroke={c} strokeWidth="5" strokeLinejoin="round" />;
      case 'circuit':
        return (
          <g fill="none" stroke={c} strokeWidth="4">
            <circle cx="60" cy="60" r="54" strokeDasharray="22 8 4 8" />
            {[0, 90, 180, 270].map((d) => (
              <circle key={d} cx={60 + 54 * Math.cos((d * Math.PI) / 180)} cy={60 + 54 * Math.sin((d * Math.PI) / 180)} r="4" fill={a} />
            ))}
          </g>
        );
      case 'petals':
        return (
          <g fill={c} opacity={0.95}>
            {Array.from({ length: 16 }, (_, i) => {
              const t = (i * 22.5 * Math.PI) / 180;
              return <ellipse key={i} cx={60 + 54 * Math.cos(t)} cy={60 + 54 * Math.sin(t)} rx="7" ry="4" transform={`rotate(${i * 22.5} ${60 + 54 * Math.cos(t)} ${60 + 54 * Math.sin(t)})`} />;
            })}
          </g>
        );
      case 'crystal':
        return <path d={Array.from({ length: 12 }, (_, i) => { const t = (i * 30 * Math.PI) / 180; const r = i % 2 ? 50 : 58; return `${i ? 'L' : 'M'}${(60 + r * Math.cos(t)).toFixed(1)} ${(60 + r * Math.sin(t)).toFixed(1)}`; }).join('') + 'Z'} fill="none" stroke={c} strokeWidth="5" strokeLinejoin="round" />;
      case 'aurora':
        return (
          <g fill="none" strokeWidth="6" strokeLinecap="round">
            <path d="M60 6A54 54 0 0 1 114 60" stroke={c} />
            <path d="M114 60A54 54 0 0 1 60 114" stroke={a} />
            <path d="M60 114A54 54 0 0 1 6 60" stroke={`hsl(${(hue + 120) % 360} 80% 66%)`} />
            <path d="M6 60A54 54 0 0 1 60 6" stroke={`hsl(${(hue + 200) % 360} 80% 66%)`} />
          </g>
        );
    }
  })();
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <span className="absolute inset-[9%] grid place-items-center overflow-hidden rounded-full">{children}</span>
      <svg viewBox="0 0 120 120" width={size} height={size} className="pointer-events-none absolute inset-0" aria-hidden>
        <circle cx="60" cy="60" r="54" fill="none" stroke={bezel} strokeWidth="10" />
        {ring}
      </svg>
    </span>
  );
}

export const BannerArt = memo(function BannerArt({ pattern, hue, accentHue, className }: { pattern: BannerPattern; hue: number; accentHue: number; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const bg = `hsl(${hue} 55% 34%)`;
  const mid = `hsl(${hue} 60% 46%)`;
  const a = `hsl(${accentHue} 90% 72%)`;
  const content = (() => {
    switch (pattern) {
      case 'constellation':
        return (
          <g>
            <path d="M30 60L80 30L130 52L190 22L250 48L300 30" fill="none" stroke={a} strokeWidth="1.5" opacity={0.6} />
            {[[30, 60], [80, 30], [130, 52], [190, 22], [250, 48], [300, 30], [60, 80], [220, 74], [160, 86]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i % 3 ? 2 : 3.2} fill={a} />
            ))}
          </g>
        );
      case 'waves':
        return (
          <g fill="none" stroke={a} strokeWidth="5" opacity={0.6}>
            {[30, 55, 80].map((y) => (
              <path key={y} d={`M0 ${y}Q40 ${y - 16} 80 ${y}T160 ${y}T240 ${y}T320 ${y}`} />
            ))}
          </g>
        );
      case 'confetti':
        return (
          <g>
            {Array.from({ length: 28 }, (_, i) => (
              <rect key={i} x={(i * 53) % 320} y={(i * 37) % 100} width="5" height="13" rx="1" fill={i % 3 === 0 ? a : i % 3 === 1 ? '#fff' : mid} transform={`rotate(${(i * 47) % 180} ${(i * 53) % 320} ${(i * 37) % 100})`} opacity={0.85} />
            ))}
          </g>
        );
      case 'stripes':
        return (
          <g fill={mid}>
            {Array.from({ length: 12 }, (_, i) => (
              <rect key={i} x={i * 34 - 40} y="-20" width="16" height="160" transform="rotate(25)" />
            ))}
          </g>
        );
      case 'grid':
        return (
          <g stroke={a} strokeWidth="1" opacity={0.35}>
            {Array.from({ length: 33 }, (_, i) => <line key={`v${i}`} x1={i * 10} y1="0" x2={i * 10} y2="100" />)}
            {Array.from({ length: 11 }, (_, i) => <line key={`h${i}`} x1="0" y1={i * 10} x2="320" y2={i * 10} />)}
          </g>
        );
      case 'hills':
        return (
          <g>
            <path d="M0 70Q80 30 160 70T320 60V100H0Z" fill={mid} />
            <path d="M0 85Q90 55 180 85T320 80V100H0Z" fill={a} opacity={0.5} />
            <circle cx="260" cy="26" r="12" fill={a} />
          </g>
        );
      case 'lanterns':
        // A printed row of Lantern marks: cap, glowing body, base.
        return (
          <g>
            {[30, 90, 150, 210, 270].map((x, i) => (
              <g key={x} transform={`translate(${x} ${i % 2 ? 54 : 30})`}>
                <rect x="-7" y="-14" width="14" height="5" rx="1.5" fill={mid} />
                <rect x="-10" y="-9" width="20" height="24" rx="3" fill={i % 2 ? a : 'var(--lantern)'} opacity={0.92} />
                <rect x="-2" y="-9" width="4" height="24" fill={bg} opacity={0.35} />
                <rect x="-7" y="15" width="14" height="5" rx="1.5" fill={mid} />
              </g>
            ))}
          </g>
        );
      case 'circuit':
        return (
          <g fill="none" stroke={a} strokeWidth="2" opacity={0.6}>
            <path d="M0 30H60V60H130V20H210V70H320M20 90H90V75H170V90H260V50" />
            {[[60, 30], [130, 60], [210, 20], [90, 75], [260, 50]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="4" fill={a} />
            ))}
          </g>
        );
      case 'bubbles':
        return (
          <g fill="none" stroke={a} strokeWidth="2" opacity={0.6}>
            {Array.from({ length: 16 }, (_, i) => (
              <circle key={i} cx={(i * 61) % 320} cy={(i * 29) % 100} r={4 + ((i * 7) % 12)} />
            ))}
          </g>
        );
      case 'aurora':
        return (
          <g opacity={0.7}>
            <path d="M0 50C60 20 120 70 180 40S280 10 320 40V0H0Z" fill={a} />
            <path d="M0 70C70 40 130 90 200 60S290 40 320 60V0H0Z" fill={mid} opacity={0.6} />
          </g>
        );
    }
  })();
  return (
    <svg viewBox="0 0 320 100" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <clipPath id={`b-${uid}`}>
          <rect width="320" height="100" />
        </clipPath>
      </defs>
      <g clipPath={`url(#b-${uid})`}>
        <rect width="320" height="100" fill={bg} />
        {content}
      </g>
    </svg>
  );
});

export function EmoteGlyph({ glyph, hue, size = 40 }: { glyph: string; hue?: number; size?: number }) {
  const face = `hsl(${hue ?? 42} 95% 60%)`;
  const ink = 'hsl(232 45% 11%)';
  const eyes = <><circle cx="15" cy="17" r="2.2" fill={ink} /><circle cx="25" cy="17" r="2.2" fill={ink} /></>;
  const base = <circle cx="20" cy="20" r="16" fill={face} stroke={ink} strokeWidth="2" />;
  const content = (() => {
    switch (glyph) {
      case 'wave':
        return <>{base}{eyes}<path d="M14 24Q20 29 26 24" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" /><path d="M33 6l3 3M36 12l3 1M30 4l1 3" stroke={ink} strokeWidth="2" strokeLinecap="round" /></>;
      case 'laugh':
        return <>{base}<path d="M12 16Q15 13 18 16M22 16Q25 13 28 16" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" /><path d="M12 22Q20 34 28 22Z" fill={ink} /></>;
      case 'wow':
        return <>{base}<circle cx="15" cy="16" r="3" fill="#fff" stroke={ink} strokeWidth="1.5" /><circle cx="25" cy="16" r="3" fill="#fff" stroke={ink} strokeWidth="1.5" /><ellipse cx="20" cy="27" rx="3.5" ry="4.5" fill={ink} /></>;
      case 'gg':
        return <><rect x="3" y="8" width="34" height="24" rx="8" fill={face} stroke={ink} strokeWidth="2" /><text x="20" y="25" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="14" fill={ink}>GG</text></>;
      case 'heart':
        return <path d="M20 35C8 26 3 20 3 13C3 7 8 4 13 4C16 4 19 6 20 9C21 6 24 4 27 4C32 4 37 7 37 13C37 20 32 26 20 35Z" fill={`hsl(${hue ?? 350} 90% 64%)`} stroke={ink} strokeWidth="2" />;
      case 'fire':
        return <path d="M20 3C22 10 30 13 31 21C32 30 26 37 20 37C14 37 8 32 8 25C8 19 12 16 14 11C15 15 17 17 19 18C17 12 18 7 20 3Z" fill="#ff8a1f" stroke={ink} strokeWidth="2" strokeLinejoin="round" />;
      case 'think':
        return <>{base}{eyes}<path d="M15 26H25" stroke={ink} strokeWidth="2" strokeLinecap="round" /><circle cx="32" cy="8" r="2" fill={ink} /><circle cx="36" cy="3" r="1.4" fill={ink} /></>;
      case 'clap':
        return <><path d="M10 30L6 14C5 11 9 10 10 13L13 22M13 22L11 9C10 6 14 5 15 8L18 20M18 20L18 8C18 5 22 5 22 8L23 22L26 16C28 13 31 15 30 18L26 30C24 35 14 36 10 30Z" fill={face} stroke={ink} strokeWidth="1.8" strokeLinejoin="round" /><path d="M30 6l2-3M34 10l3-1" stroke={ink} strokeWidth="2" strokeLinecap="round" /></>;
      case 'party':
        return <><path d="M6 36L16 8L32 26Z" fill={face} stroke={ink} strokeWidth="2" strokeLinejoin="round" /><circle cx="30" cy="8" r="2.5" fill="var(--glim)" /><circle cx="36" cy="16" r="2" fill="var(--sky)" /><rect x="22" y="2" width="3" height="6" rx="1" fill="var(--ember)" transform="rotate(30 23 5)" /></>;
      case 'cool':
        return <>{base}<path d="M8 15H32V18C32 21 29 22 26 22C23 22 21 20 20 18C19 20 17 22 14 22C11 22 8 21 8 18Z" fill={ink} /><path d="M15 27Q21 30 26 26" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" /></>;
      case 'sleepy':
        return <>{base}<path d="M12 17Q15 19 18 17M22 17Q25 19 28 17" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" /><ellipse cx="20" cy="27" rx="2.5" ry="2" fill={ink} /><text x="31" y="11" fontSize="9" fontWeight="800" fill={ink}>z</text></>;
      case 'star':
        return <path d="M20 3L24.5 13.5L36 14.5L27.5 22L30 33.5L20 27.5L10 33.5L12.5 22L4 14.5L15.5 13.5Z" fill={face} stroke={ink} strokeWidth="2" strokeLinejoin="round" />;
      default:
        return base;
    }
  })();
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden>
      {content}
    </svg>
  );
}

/** Any item, drawn by its art kind. Used across the shop, collection and locker. */
export function ItemArtView({ art, rarity, size = 96, owned = true }: { art: ItemArt; rarity?: Rarity; size?: number; owned?: boolean }) {
  switch (art.kind) {
    case 'glim':
      return <Glim art={art} size={size} rarity={owned ? (rarity ?? null) : null} silhouette={!owned} />;
    case 'accessory':
      return <AccessoryPreview art={art} size={size} />;
    case 'frame':
      return (
        <FrameRing style={art.style} hue={art.hue} accentHue={art.accentHue} size={size}>
          <span className="block h-full w-full bg-surface-3" />
        </FrameRing>
      );
    case 'banner':
      return <BannerArt pattern={art.pattern} hue={art.hue} accentHue={art.accentHue} className="h-full w-full rounded-[var(--radius-m)]" />;
    case 'title':
      return (
        <span className="plate plate-gold max-w-full text-center" style={{ fontSize: Math.max(10, Math.min(18, size * 0.15)), paddingInline: size < 80 ? '0.45em' : undefined }}>
          <span className="block truncate">{art.text}</span>
        </span>
      );
    case 'emote':
      return <EmoteGlyph glyph={art.glyph} hue={art.hue} size={size * 0.7} />;
    case 'victory':
      return <VictoryPreview style={art.style} hue={art.hue} size={size} />;
    case 'theme':
      return (
        <span className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-m)] border border-line-strong shadow-[0_6px_16px_-8px_rgb(2_5_20/0.6)]" style={{ width: size * 0.8, height: size * 0.6 }}>
          <span style={{ background: `hsl(${art.hue} 70% 55%)` }} />
          <span style={{ background: `hsl(${art.accentHue} 85% 70%)` }} />
          <span style={{ background: `hsl(${art.hue} 45% 22%)` }} />
          <span style={{ background: `hsl(${art.accentHue} 60% 40%)` }} />
        </span>
      );
    case 'effect':
      return <EffectPreview style={art.style} hue={art.hue} size={size} />;
  }
}

function VictoryPreview({ style, hue, size }: { style: string; hue: number; size: number }) {
  const c = `hsl(${hue} 90% 66%)`;
  return (
    <svg viewBox="0 0 80 80" width={size * 0.8} height={size * 0.8} aria-hidden>
      <path d="M26 66H54L50 52H30Z" fill="var(--surface-3)" stroke="var(--ink)" strokeWidth="2" />
      <path d="M28 22H52V34C52 42 46 46 40 46C34 46 28 42 28 34Z" fill="var(--lantern)" stroke="var(--ink)" strokeWidth="2" />
      {style === 'fireworks' && [0, 60, 120, 180, 240, 300].map((a) => <line key={a} x1={40 + 14 * Math.cos((a * Math.PI) / 180)} y1={14 + 14 * Math.sin((a * Math.PI) / 180) - 4} x2={40 + 22 * Math.cos((a * Math.PI) / 180)} y2={14 + 22 * Math.sin((a * Math.PI) / 180) - 4} stroke={c} strokeWidth="3" strokeLinecap="round" />)}
      {style === 'confetti' && [10, 22, 58, 70, 16, 64].map((x, i) => <rect key={i} x={x} y={8 + (i % 3) * 12} width="4" height="8" rx="1" fill={i % 2 ? c : 'var(--glim)'} transform={`rotate(${i * 40} ${x} ${8 + (i % 3) * 12})`} />)}
      {style === 'lanterns' && [16, 40, 64].map((x) => <rect key={x} x={x - 5} y={x === 40 ? 2 : 8} width="10" height="13" rx="2" fill={c} stroke="var(--ink)" strokeWidth="1.5" />)}
      {style === 'comets' && [14, 36, 58].map((x) => <path key={x} d={`M${x} 18l10 -10M${x - 2} 20a3 3 0 1 0 0.1 0`} stroke={c} strokeWidth="3" strokeLinecap="round" fill={c} />)}
      {style === 'bubbles' && [12, 26, 54, 68, 40].map((x, i) => <circle key={x} cx={x} cy={10 + (i % 3) * 8} r={3 + (i % 3)} fill="none" stroke={c} strokeWidth="2" />)}
      {style === 'petals' && [12, 28, 52, 68].map((x, i) => <ellipse key={x} cx={x} cy={12 + (i % 2) * 10} rx="5" ry="3" fill={c} transform={`rotate(${i * 50} ${x} ${12 + (i % 2) * 10})`} />)}
    </svg>
  );
}

function EffectPreview({ style, hue, size }: { style: string; hue: number; size: number }) {
  const c = `hsl(${hue} 90% 68%)`;
  return (
    <svg viewBox="0 0 80 80" width={size * 0.8} height={size * 0.8} aria-hidden>
      <rect x="18" y="28" width="44" height="24" rx="8" fill="var(--glim)" stroke="var(--ink)" strokeWidth="2" />
      <path d="M31 40l6 6 12-12" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {style === 'sparkle' && [[12, 18], [66, 20], [64, 60], [14, 62]].map(([x, y], i) => <path key={i} d={`M${x} ${y! - 6}L${x! + 1.6} ${y! - 1.6}L${x! + 6} ${y}L${x! + 1.6} ${y! + 1.6}L${x} ${y! + 6}L${x! - 1.6} ${y! + 1.6}L${x! - 6} ${y}L${x! - 1.6} ${y! - 1.6}Z`} fill={c} />)}
      {style === 'bubbles' && [[12, 20, 5], [68, 18, 4], [66, 62, 6], [12, 60, 3]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth="2" />)}
      {style === 'stars' && [[14, 16], [66, 18], [62, 64], [16, 64]].map(([x, y], i) => <path key={i} d={`M${x} ${y! - 6}l1.8 3.8 4.2.6-3 2.9.7 4.1-3.7-2-3.7 2 .7-4.1-3-2.9 4.2-.6z`} fill={c} />)}
      {style === 'ripple' && <><rect x="12" y="22" width="56" height="36" rx="12" fill="none" stroke={c} strokeWidth="2" /><rect x="6" y="16" width="68" height="48" rx="16" fill="none" stroke={c} strokeWidth="1.5" opacity={0.5} /></>}
      {style === 'leaves' && [[12, 18], [66, 22], [62, 62], [16, 60]].map(([x, y], i) => <path key={i} d={`M${x} ${y}c0 -6 4 -9 9 -9c0 6 -4 9 -9 9z`} fill={c} />)}
      {style === 'embers' && [[14, 20], [64, 16], [68, 60], [12, 62], [40, 10]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2 + (i % 2)} fill={c} />)}
    </svg>
  );
}
