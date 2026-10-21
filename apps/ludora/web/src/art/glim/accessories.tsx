import type { AccessoryArt } from '@ludora/shared';
import type { BodyGeometry } from './bodies.ts';

/*
 * Accessories sit on a body's anchors: hats on `top` (scaled to the head's
 * width), eyewear on `face`, neckwear on `neck`. Drawn at a reference head
 * width of 44 and scaled from there.
 */

const OUT = '#1d1846';

function colors(art: AccessoryArt) {
  const accentHue = art.accentHue ?? (art.hue + 50) % 360;
  return {
    main: `hsl(${art.hue} 72% 60%)`,
    dark: `hsl(${art.hue} 60% 40%)`,
    light: `hsl(${art.hue} 85% 82%)`,
    accent: `hsl(${accentHue} 85% 65%)`,
  };
}

function Hat({ shape, c }: { shape: string; c: ReturnType<typeof colors> }) {
  const st = { stroke: OUT, strokeWidth: 2.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  switch (shape) {
    case 'beanie':
      return (
        <>
          <path d="M-22 4C-22 -14 -12 -22 0 -22C12 -22 22 -14 22 4Z" fill={c.main} {...st} />
          <rect x={-24} y={0} width={48} height={8} rx={4} fill={c.dark} {...st} />
          <circle cx={0} cy={-25} r={5} fill={c.light} {...st} />
        </>
      );
    case 'wizard':
      return (
        <>
          <path d="M-14 2L2 -40L16 2Z" fill={c.main} {...st} />
          <ellipse cx={1} cy={3} rx={26} ry={6} fill={c.dark} {...st} />
          <path d="M3 -24l1.5 3 3 .4-2.2 2 .6 3-2.9-1.5-2.9 1.5.6-3-2.2-2 3-.4z" fill="#ffd23f" />
          <circle cx={-3} cy={-10} r={1.8} fill="#ffd23f" />
        </>
      );
    case 'party':
      return (
        <>
          <path d="M-13 3L0 -34L13 3Z" fill={c.main} {...st} />
          <path d="M-9 -8L5 -2M-5 -19L8 -13" stroke={c.accent} strokeWidth={4} strokeLinecap="round" />
          <circle cx={0} cy={-36} r={5} fill={c.accent} {...st} />
        </>
      );
    case 'crown':
      return (
        <>
          <path d="M-20 4L-22 -16L-11 -6L0 -20L11 -6L22 -16L20 4Z" fill="#ffc83d" {...st} />
          <circle cx={0} cy={-5} r={3.4} fill={c.main} stroke={OUT} strokeWidth={1.6} />
          <circle cx={-12} cy={-1} r={2.4} fill={c.accent} />
          <circle cx={12} cy={-1} r={2.4} fill={c.accent} />
        </>
      );
    case 'flowers':
      return (
        <>
          <path d="M-24 2C-12 -6 12 -6 24 2" fill="none" stroke="#3fa34d" strokeWidth={3} strokeLinecap="round" />
          {[-18, -6, 6, 18].map((x, i) => (
            <g key={x} transform={`translate(${x} ${-3 - (i === 1 || i === 2 ? 2 : 0)})`}>
              {[0, 72, 144, 216, 288].map((a) => (
                <circle key={a} cx={4 * Math.cos((a * Math.PI) / 180)} cy={4 * Math.sin((a * Math.PI) / 180)} r={3.4} fill={i % 2 ? c.main : c.accent} stroke={OUT} strokeWidth={1.2} />
              ))}
              <circle r={2.4} fill="#ffd23f" />
            </g>
          ))}
        </>
      );
    case 'mortarboard':
      return (
        <>
          <path d="M-14 -4H14V4C14 7 -14 7 -14 4Z" fill={c.dark} {...st} />
          <path d="M-28 -10L0 -20L28 -10L0 0Z" fill={c.main} {...st} />
          <path d="M0 -10L18 -6V8" fill="none" stroke="#ffc83d" strokeWidth={2.4} strokeLinecap="round" />
          <circle cx={18} cy={10} r={3} fill="#ffc83d" stroke={OUT} strokeWidth={1.5} />
        </>
      );
    case 'headphones':
      // Drawn by the dedicated renderer below because the cups sit at ear level.
      return null;
    case 'bow':
      return (
        <g transform="translate(12 -4) rotate(18)">
          <path d="M0 0C-10 -12 -20 -8 -18 0C-20 8 -10 12 0 0Z" fill={c.main} {...st} />
          <path d="M0 0C10 -12 20 -8 18 0C20 8 10 12 0 0Z" fill={c.main} {...st} />
          <circle r={4} fill={c.dark} {...st} />
        </g>
      );
    case 'tophat':
      return (
        <>
          <rect x={-14} y={-30} width={28} height={30} rx={3} fill={c.dark} {...st} />
          <rect x={-14} y={-10} width={28} height={6} fill={c.accent} />
          <ellipse cx={0} cy={1} rx={25} ry={5.5} fill={c.dark} {...st} />
        </>
      );
    case 'propeller':
      return (
        <>
          <path d="M-20 4C-20 -12 -10 -18 0 -18C10 -18 20 -12 20 4Z" fill={c.main} {...st} />
          <path d="M-20 -4H20" stroke={c.accent} strokeWidth={4} />
          <path d="M0 -18V-25" stroke={OUT} strokeWidth={2.6} />
          <path d="M0 -26C-6 -31 -18 -30 -18 -26C-18 -22 -6 -22 0 -26C6 -30 18 -30 18 -26C18 -22 6 -21 0 -26Z" fill={c.accent} {...st} strokeWidth={2} />
        </>
      );
    case 'chef':
      return (
        <>
          <rect x={-15} y={-8} width={30} height={12} rx={2} fill="#fff" {...st} />
          <path d="M-15 -8C-26 -10 -24 -28 -12 -26C-10 -36 10 -36 12 -26C24 -28 26 -10 15 -8Z" fill="#fff" {...st} />
        </>
      );
    case 'beret':
      return (
        <g transform="rotate(-10)">
          <ellipse cx={2} cy={-4} rx={24} ry={9} fill={c.main} {...st} />
          <path d="M2 -13V-17" stroke={OUT} strokeWidth={3} strokeLinecap="round" />
        </g>
      );
    default:
      return null;
  }
}

function Eyewear({ shape, c }: { shape: string; c: ReturnType<typeof colors> }) {
  const frame = { fill: 'none', stroke: c.dark, strokeWidth: 2.6 };
  switch (shape) {
    case 'round':
      return (
        <>
          <circle cx={-13} cy={0} r={8.5} {...frame} />
          <circle cx={13} cy={0} r={8.5} {...frame} />
          <path d="M-4.5 -1Q0 -4 4.5 -1" {...frame} />
        </>
      );
    case 'stars': {
      const star = (cx: number) => `M${cx} -10L${cx + 3} -3.5L${cx + 10} -3L${cx + 4.6} 1.6L${cx + 6.4} 8.6L${cx} 4.8L${cx - 6.4} 8.6L${cx - 4.6} 1.6L${cx - 10} -3L${cx - 3} -3.5Z`;
      return (
        <>
          <path d={`${star(-13)} ${star(13)}`} fill={c.main} stroke={OUT} strokeWidth={2} strokeLinejoin="round" opacity={0.95} />
          <path d="M-3.5 -1H3.5" stroke={OUT} strokeWidth={2.4} />
        </>
      );
    }
    case 'monocle':
      return (
        <>
          <circle cx={13} cy={0} r={8.5} fill="rgb(255 255 255 / 0.25)" stroke="#d4a017" strokeWidth={2.6} />
          <path d="M20 6Q24 18 18 28" fill="none" stroke="#d4a017" strokeWidth={1.6} />
        </>
      );
    case 'goggles':
      return (
        <>
          <path d="M-30 -2H30" stroke={c.dark} strokeWidth={4} />
          <circle cx={-13} cy={0} r={9} fill={c.light} stroke={OUT} strokeWidth={2.6} opacity={0.9} />
          <circle cx={13} cy={0} r={9} fill={c.light} stroke={OUT} strokeWidth={2.6} opacity={0.9} />
          <circle cx={-16} cy={-3} r={2.4} fill="#fff" />
          <circle cx={10} cy={-3} r={2.4} fill="#fff" />
        </>
      );
    case 'visor':
      return <path d="M-26 -6H26L22 6C10 9 -10 9 -22 6Z" fill={c.main} stroke={OUT} strokeWidth={2.4} strokeLinejoin="round" opacity={0.92} />;
    case 'heart': {
      const heart = (cx: number) => `M${cx} 7C${cx - 12} -1 ${cx - 10} -11 ${cx - 4} -9C${cx - 2} -8 ${cx} -6 ${cx} -4C${cx} -6 ${cx + 2} -8 ${cx + 4} -9C${cx + 10} -11 ${cx + 12} -1 ${cx} 7Z`;
      return (
        <>
          <path d={`${heart(-13)} ${heart(13)}`} fill="#ff6b9a" stroke={OUT} strokeWidth={2} strokeLinejoin="round" opacity={0.92} />
          <path d="M-4 -3H4" stroke={OUT} strokeWidth={2.2} />
        </>
      );
    }
    default:
      return null;
  }
}

function Neckwear({ shape, c }: { shape: string; c: ReturnType<typeof colors> }) {
  const st = { stroke: OUT, strokeWidth: 2.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  switch (shape) {
    case 'scarf':
      return (
        <>
          <path d="M-24 -4C-12 4 12 4 24 -4L24 4C12 12 -12 12 -24 4Z" fill={c.main} {...st} />
          <path d="M10 6L14 22L22 20L18 4Z" fill={c.main} {...st} />
          <path d="M-18 1H-12M-4 4H2M10 3H16" stroke={c.light} strokeWidth={2.4} />
        </>
      );
    case 'bowtie':
      return (
        <>
          <path d="M0 0L-13 -8V8Z" fill={c.main} {...st} />
          <path d="M0 0L13 -8V8Z" fill={c.main} {...st} />
          <rect x={-3.5} y={-4} width={7} height={8} rx={2} fill={c.dark} {...st} />
        </>
      );
    case 'medal':
      return (
        <>
          <path d="M-12 -6L-2 12M12 -6L2 12" stroke={c.main} strokeWidth={5} strokeLinecap="round" />
          <circle cx={0} cy={15} r={7} fill="#ffc83d" {...st} />
          <path d="M0 11l1.3 2.6 2.8.4-2 2 .5 2.8L0 17.5l-2.6 1.3.5-2.8-2-2 2.8-.4z" fill="#fff6c8" />
        </>
      );
    case 'bandana':
      return <path d="M-22 -4C-10 2 10 2 22 -4L0 18Z" fill={c.main} {...st} />;
    case 'pearls':
      return (
        <g fill="#fbf7ff" stroke={OUT} strokeWidth={1.2}>
          {[-18, -12, -6, 0, 6, 12, 18].map((x, i) => (
            <circle key={x} cx={x} cy={Math.abs(x) * -0.18 + 4 + (i % 2) * 0.5} r={3} />
          ))}
        </g>
      );
    case 'bell':
      return (
        <>
          <path d="M-20 -3C-8 4 8 4 20 -3" fill="none" stroke={c.main} strokeWidth={5} strokeLinecap="round" />
          <path d="M-5 4C-5 -1 5 -1 5 4L7 11H-7Z" fill="#ffc83d" {...st} />
          <circle cx={0} cy={12} r={1.8} fill={OUT} />
        </>
      );
    default:
      return null;
  }
}

export function Accessory({ art, geo }: { art: AccessoryArt; geo: BodyGeometry }) {
  const c = colors(art);
  if (art.slot === 'hat') {
    if (art.shape === 'headphones') {
      const w = Math.max(30, geo.headW * 0.62);
      return (
        <g>
          <path d={`M${geo.face.x - w} ${geo.face.y - 4}C${geo.face.x - w} ${geo.top.y - 14} ${geo.face.x + w} ${geo.top.y - 14} ${geo.face.x + w} ${geo.face.y - 4}`} fill="none" stroke={c.dark} strokeWidth={5} strokeLinecap="round" />
          <rect x={geo.face.x - w - 7} y={geo.face.y - 12} width={12} height={18} rx={5} fill={c.main} stroke={OUT} strokeWidth={2.4} />
          <rect x={geo.face.x + w - 5} y={geo.face.y - 12} width={12} height={18} rx={5} fill={c.main} stroke={OUT} strokeWidth={2.4} />
        </g>
      );
    }
    const s = Math.min(1.4, Math.max(0.95, geo.headW / 40));
    return (
      <g transform={`translate(${geo.top.x} ${geo.top.y + 4}) scale(${s.toFixed(3)})`}>
        <Hat shape={art.shape} c={c} />
      </g>
    );
  }
  if (art.slot === 'eyes') {
    return (
      <g transform={`translate(${geo.face.x} ${geo.face.y})`}>
        <Eyewear shape={art.shape} c={c} />
      </g>
    );
  }
  return (
    <g transform={`translate(${geo.face.x} ${geo.neck})`}>
      <Neckwear shape={art.shape} c={c} />
    </g>
  );
}

/** An accessory on its own (shop and locker previews), on a plain head-shaped stand. */
export function AccessoryPreview({ art, size = 72 }: { art: AccessoryArt; size?: number }) {
  const stand: BodyGeometry = { path: '', face: { x: 60, y: 62 }, top: { x: 60, y: 44 }, headW: 50, neck: 84 };
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden>
      <circle cx="60" cy="64" r="30" fill="var(--surface-3)" />
      <Accessory art={art} geo={stand} />
    </svg>
  );
}
