import type { AccessoryArt } from '@ludora/shared';
import { BODIES, type BodyGeometry } from './bodies.ts';

/*
 * Accessories sit on a body's anchors: hats on `top` (scaled to the head's
 * width), eyewear on `face` (lenses over the eyes, at the body's eye gap),
 * neckwear on `neck`. Drawn in the same crisp style as the Glims: flat fills,
 * a near-black outline tinted from the accessory's hue, a small highlight.
 */

function colors(art: AccessoryArt) {
  const accentHue = art.accentHue ?? (art.hue + 50) % 360;
  return {
    main: `hsl(${art.hue} 72% 60%)`,
    dark: `hsl(${art.hue} 58% 42%)`,
    light: `hsl(${art.hue} 85% 84%)`,
    accent: `hsl(${accentHue} 88% 64%)`,
    out: `hsl(${art.hue} 45% 10%)`,
  };
}

type C = ReturnType<typeof colors>;
const GOLD = 'hsl(44 100% 62%)';
const GOLD_LIGHT = 'hsl(48 100% 86%)';
const SHINE = { fill: '#fff', opacity: 0.55 };

function Hat({ shape, c }: { shape: string; c: C }) {
  const st = { stroke: c.out, strokeWidth: 2.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  switch (shape) {
    case 'beanie':
      return (
        <>
          <path d="M-22 4C-22 -14 -12 -22 0 -22C12 -22 22 -14 22 4Z" fill={c.main} {...st} />
          <path d="M-8 -19C-11 -14 -12 -8 -12 0M2 -21V0M11 -18C13 -13 13.5 -7 13.5 0" fill="none" stroke={c.dark} strokeWidth={1.6} opacity={0.5} />
          <rect x={-24.5} y={-0.5} width={49} height={9} rx={4.5} fill={c.dark} {...st} />
          <circle cx={0} cy={-25} r={5.5} fill={c.light} {...st} />
          <ellipse cx={-11} cy={-13} rx={3.4} ry={2} transform="rotate(-35 -11 -13)" {...SHINE} />
        </>
      );
    case 'wizard':
      return (
        <>
          <path d="M-15 2C-8 -14 -2 -30 4 -42C6 -38 9 -36 12 -35C10 -24 13 -10 17 2Z" fill={c.main} {...st} />
          <ellipse cx={1} cy={3} rx={27} ry={6.5} fill={c.dark} {...st} />
          <path d="M4 -24l1.6 3.2 3.4.5-2.5 2.4.6 3.4-3.1-1.6-3.1 1.6.6-3.4-2.5-2.4 3.4-.5z" fill={GOLD} />
          <circle cx={-4} cy={-9} r={1.9} fill={GOLD} />
          <circle cx={8} cy={-6} r={1.3} fill={GOLD} />
        </>
      );
    case 'party':
      return (
        <>
          <path d="M-14 3L0 -34L14 3Z" fill={c.main} {...st} />
          <path d="M-9.5 -8L6 -2M-5 -19L9 -13" stroke={c.accent} strokeWidth={4.4} strokeLinecap="round" />
          <circle cx={0} cy={-36} r={5.5} fill={c.accent} {...st} />
          <path d="M-14 3L0 -34L14 3Z" fill="none" {...st} />
        </>
      );
    case 'crown':
      return (
        <>
          <path d="M-20 4L-22.5 -16L-11 -6L0 -21L11 -6L22.5 -16L20 4Z" fill={GOLD} {...st} />
          <path d="M-19 -1H19" stroke="hsl(36 90% 46%)" strokeWidth={1.6} opacity={0.6} />
          <circle cx={0} cy={-6} r={3.6} fill={c.main} stroke={c.out} strokeWidth={1.8} />
          <circle cx={-12} cy={-1.5} r={2.5} fill={c.accent} stroke={c.out} strokeWidth={1.2} />
          <circle cx={12} cy={-1.5} r={2.5} fill={c.accent} stroke={c.out} strokeWidth={1.2} />
          <path d="M-15 -7L-17 -13" stroke={GOLD_LIGHT} strokeWidth={2} strokeLinecap="round" />
        </>
      );
    case 'flowers':
      return (
        <>
          <path d="M-25 2C-12 -6 12 -6 25 2" fill="none" stroke="hsl(122 45% 34%)" strokeWidth={5.2} strokeLinecap="round" />
          <path d="M-25 2C-12 -6 12 -6 25 2" fill="none" stroke="hsl(112 55% 52%)" strokeWidth={2.6} strokeLinecap="round" />
          {[-18, -6, 6, 18].map((x, i) => (
            <g key={x} transform={`translate(${x} ${-3 - (i === 1 || i === 2 ? 2.5 : 0)})`}>
              {[0, 72, 144, 216, 288].map((a) => (
                <circle key={a} cx={4.2 * Math.cos((a * Math.PI) / 180)} cy={4.2 * Math.sin((a * Math.PI) / 180)} r={3.6} fill={i % 2 ? c.main : c.accent} stroke={c.out} strokeWidth={1.4} />
              ))}
              <circle r={2.6} fill={GOLD} stroke={c.out} strokeWidth={1} />
            </g>
          ))}
        </>
      );
    case 'mortarboard':
      return (
        <>
          <path d="M-14 -4H14V4C14 7.5 -14 7.5 -14 4Z" fill={c.dark} {...st} />
          <path d="M-29 -10L0 -21L29 -10L0 1Z" fill={c.main} {...st} />
          <path d="M0 -10L18 -6V8" fill="none" stroke={GOLD} strokeWidth={2.6} strokeLinecap="round" />
          <circle cx={18} cy={10.5} r={3.4} fill={GOLD} stroke={c.out} strokeWidth={1.6} />
          <circle cx={0} cy={-10} r={2} fill={GOLD} />
        </>
      );
    case 'headphones':
      // Drawn by the dedicated renderer below because the cups sit at ear level.
      return null;
    case 'bow':
      return (
        <g transform="translate(13 -4) rotate(18)">
          <path d="M0 0C-10 -13 -21 -9 -19 0C-21 9 -10 13 0 0Z" fill={c.main} {...st} />
          <path d="M0 0C10 -13 21 -9 19 0C21 9 10 13 0 0Z" fill={c.main} {...st} />
          <path d="M-14 -4C-11 -6 -8 -5 -6 -3M14 -4C11 -6 8 -5 6 -3" fill="none" stroke={c.dark} strokeWidth={1.4} opacity={0.6} />
          <circle r={4.4} fill={c.dark} {...st} />
        </g>
      );
    case 'tophat':
      return (
        <>
          <rect x={-14} y={-31} width={28} height={31} rx={3} fill={c.dark} {...st} />
          <rect x={-14} y={-11} width={28} height={6.5} fill={c.accent} stroke={c.out} strokeWidth={1.6} />
          <ellipse cx={0} cy={1} rx={25.5} ry={6} fill={c.dark} {...st} />
          <path d="M-9 -27V-15" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" opacity={0.3} />
        </>
      );
    case 'propeller':
      return (
        <>
          <path d="M-20 4C-20 -12 -10 -18 0 -18C10 -18 20 -12 20 4Z" fill={c.main} {...st} />
          <path d="M-20 -4H20" stroke={c.accent} strokeWidth={4.4} />
          <path d="M-20 4C-20 -12 -10 -18 0 -18C10 -18 20 -12 20 4Z" fill="none" {...st} />
          <path d="M0 -18V-25" stroke={c.out} strokeWidth={3} />
          <path d="M0 -26C-6 -31.5 -19 -30.5 -19 -26C-19 -21.5 -6 -21.5 0 -26C6 -30.5 19 -30.5 19 -26C19 -21.5 6 -20.5 0 -26Z" fill={c.accent} {...st} strokeWidth={2.2} />
          <circle cx={0} cy={-26} r={2.4} fill={c.dark} stroke={c.out} strokeWidth={1.4} />
        </>
      );
    case 'chef':
      return (
        <>
          <rect x={-15} y={-8} width={30} height={12} rx={2.5} fill="#fff" {...st} />
          <path d="M-15 -8C-27 -10 -25 -29 -12 -27C-10 -37 10 -37 12 -27C25 -29 27 -10 15 -8Z" fill="#fff" {...st} />
          <path d="M-6 -8V-18M6 -8V-18" stroke={c.out} strokeWidth={1.4} opacity={0.3} />
        </>
      );
    case 'beret':
      return (
        <g transform="rotate(-10)">
          <ellipse cx={2} cy={-4} rx={25} ry={9.5} fill={c.main} {...st} />
          <path d="M-18 -1C-6 3 10 3 24 -2" fill="none" stroke={c.dark} strokeWidth={1.6} opacity={0.5} />
          <path d="M2 -13.5V-18" stroke={c.out} strokeWidth={3.4} strokeLinecap="round" />
        </g>
      );
    default:
      return null;
  }
}

function Eyewear({ shape, c, g, r }: { shape: string; c: C; g: number; r: number }) {
  const frame = { fill: 'none', stroke: c.dark, strokeWidth: 2.8 };
  const bridge = `M${-g + r} -1Q0 -4.5 ${g - r} -1`;
  switch (shape) {
    case 'round':
      return (
        <>
          <circle cx={-g} cy={0} r={r} {...frame} fill="#fff" fillOpacity={0.14} />
          <circle cx={g} cy={0} r={r} {...frame} fill="#fff" fillOpacity={0.14} />
          <path d={bridge} {...frame} />
          <path d={`M${-g - r * 0.5} ${-r * 0.45}l${r * 0.3} ${-r * 0.25}M${g - r * 0.5} ${-r * 0.45}l${r * 0.3} ${-r * 0.25}`} stroke="#fff" strokeWidth={1.8} strokeLinecap="round" opacity={0.7} />
        </>
      );
    case 'stars': {
      const k = r / 10;
      const star = (cx: number) =>
        `M${cx} ${-10.5 * k}L${cx + 3.1 * k} ${-3.6 * k}L${cx + 10.4 * k} ${-3.1 * k}L${cx + 4.8 * k} ${1.7 * k}L${cx + 6.6 * k} ${8.9 * k}L${cx} ${5 * k}L${cx - 6.6 * k} ${8.9 * k}L${cx - 4.8 * k} ${1.7 * k}L${cx - 10.4 * k} ${-3.1 * k}L${cx - 3.1 * k} ${-3.6 * k}Z`;
      return (
        <>
          <path d={`${star(-g)} ${star(g)}`} fill={c.main} stroke={c.out} strokeWidth={2.2} strokeLinejoin="round" opacity={0.94} />
          <path d={`M${-g + 9 * k} -1H${g - 9 * k}`} stroke={c.out} strokeWidth={2.6} />
        </>
      );
    }
    case 'monocle':
      return (
        <>
          <circle cx={g} cy={0} r={r} fill="#fff" fillOpacity={0.22} stroke={GOLD} strokeWidth={2.8} />
          <circle cx={g} cy={0} r={r + 1.6} fill="none" stroke="hsl(36 80% 34%)" strokeWidth={0.9} opacity={0.6} />
          <path d={`M${g + r * 0.7} ${r * 0.7}Q${g + r + 4} ${r + 10} ${g + 4} ${r + 18}`} fill="none" stroke={GOLD} strokeWidth={1.7} />
        </>
      );
    case 'goggles':
      return (
        <>
          <path d={`M${-g - r - 8} -2H${g + r + 8}`} stroke={c.dark} strokeWidth={4.6} strokeLinecap="round" />
          <circle cx={-g} cy={0} r={r + 0.5} fill={c.light} stroke={c.out} strokeWidth={2.8} opacity={0.92} />
          <circle cx={g} cy={0} r={r + 0.5} fill={c.light} stroke={c.out} strokeWidth={2.8} opacity={0.92} />
          <circle cx={-g - r * 0.35} cy={-r * 0.35} r={r * 0.26} fill="#fff" />
          <circle cx={g - r * 0.35} cy={-r * 0.35} r={r * 0.26} fill="#fff" />
        </>
      );
    case 'visor':
      return (
        <>
          <path d={`M${-g - r - 2} -7H${g + r + 2}L${g + r - 2} 6C${g * 0.6} 9.5 ${-g * 0.6} 9.5 ${-g - r + 2} 6Z`} fill={c.main} stroke={c.out} strokeWidth={2.6} strokeLinejoin="round" opacity={0.9} />
          <path d={`M${-g - r + 4} -3H${-g + 2}`} stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
        </>
      );
    case 'heart': {
      const k = r / 10;
      const heart = (cx: number) =>
        `M${cx} ${8 * k}C${cx - 13 * k} ${-1 * k} ${cx - 11 * k} ${-12 * k} ${cx - 4.5 * k} ${-10 * k}C${cx - 2 * k} ${-9 * k} ${cx} ${-6.5 * k} ${cx} ${-4.5 * k}C${cx} ${-6.5 * k} ${cx + 2 * k} ${-9 * k} ${cx + 4.5 * k} ${-10 * k}C${cx + 11 * k} ${-12 * k} ${cx + 13 * k} ${-1 * k} ${cx} ${8 * k}Z`;
      return (
        <>
          <path d={`${heart(-g)} ${heart(g)}`} fill="hsl(340 95% 70%)" stroke={c.out} strokeWidth={2.2} strokeLinejoin="round" opacity={0.92} />
          <path d={`M${-g + 9 * k} -3H${g - 9 * k}`} stroke={c.out} strokeWidth={2.4} />
        </>
      );
    }
    default:
      return null;
  }
}

function Neckwear({ shape, c }: { shape: string; c: C }) {
  const st = { stroke: c.out, strokeWidth: 2.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  switch (shape) {
    case 'scarf':
      return (
        <>
          <path d="M10 6L14 23L23 20.5L18 4Z" fill={c.dark} {...st} />
          <path d="M-25 -4C-12 4 12 4 25 -4L25 4.5C12 12.5 -12 12.5 -25 4.5Z" fill={c.main} {...st} />
          <path d="M-18 1.5H-12M-4 4H2M10 3H16" stroke={c.light} strokeWidth={2.6} strokeLinecap="round" />
        </>
      );
    case 'bowtie':
      return (
        <>
          <path d="M0 0L-14 -8.5V8.5Z" fill={c.main} {...st} />
          <path d="M0 0L14 -8.5V8.5Z" fill={c.main} {...st} />
          <rect x={-4} y={-4.5} width={8} height={9} rx={2.4} fill={c.dark} {...st} />
        </>
      );
    case 'medal':
      return (
        <>
          <path d="M-12 -6L-2 12M12 -6L2 12" stroke={c.out} strokeWidth={7.6} strokeLinecap="round" />
          <path d="M-12 -6L-2 12M12 -6L2 12" stroke={c.main} strokeWidth={4.6} strokeLinecap="round" />
          <circle cx={0} cy={15.5} r={7.5} fill={GOLD} {...st} />
          <path d="M0 11.2l1.4 2.8 3 .4-2.2 2.1.5 3L0 18.1l-2.7 1.4.5-3-2.2-2.1 3-.4z" fill={GOLD_LIGHT} />
        </>
      );
    case 'bandana':
      return (
        <>
          <path d="M-23 -4C-10 2 10 2 23 -4L0 19Z" fill={c.main} {...st} />
          <circle cx={-6} cy={4} r={1.6} fill={c.light} />
          <circle cx={5} cy={3.5} r={1.6} fill={c.light} />
          <circle cx={0} cy={10} r={1.6} fill={c.light} />
        </>
      );
    case 'pearls':
      return (
        <g fill="#fbf7ff" stroke={c.out} strokeWidth={1.4}>
          {[-18, -12, -6, 0, 6, 12, 18].map((x, i) => (
            <circle key={x} cx={x} cy={Math.abs(x) * -0.18 + 4 + (i % 2) * 0.5} r={3.2} />
          ))}
        </g>
      );
    case 'bell':
      return (
        <>
          <path d="M-21 -3C-8 4 8 4 21 -3" fill="none" stroke={c.out} strokeWidth={7.6} strokeLinecap="round" />
          <path d="M-21 -3C-8 4 8 4 21 -3" fill="none" stroke={c.main} strokeWidth={4.6} strokeLinecap="round" />
          <path d="M-5.5 4.5C-5.5 -1.5 5.5 -1.5 5.5 4.5L7.5 12H-7.5Z" fill={GOLD} {...st} />
          <circle cx={0} cy={13} r={2} fill={c.out} />
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
      const w = geo.sideW ?? Math.max(28, (geo.box[2] - geo.box[0]) / 2 - 1);
      const { x, y } = geo.face;
      return (
        <g>
          <path d={`M${x - w} ${y - 4}C${x - w} ${geo.top.y - 15} ${x + w} ${geo.top.y - 15} ${x + w} ${y - 4}`} fill="none" stroke={c.out} strokeWidth={8} strokeLinecap="round" />
          <path d={`M${x - w} ${y - 4}C${x - w} ${geo.top.y - 15} ${x + w} ${geo.top.y - 15} ${x + w} ${y - 4}`} fill="none" stroke={c.dark} strokeWidth={4.6} strokeLinecap="round" />
          <rect x={x - w - 7} y={y - 13} width={13} height={19} rx={5.5} fill={c.main} stroke={c.out} strokeWidth={2.8} />
          <rect x={x + w - 6} y={y - 13} width={13} height={19} rx={5.5} fill={c.main} stroke={c.out} strokeWidth={2.8} />
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
        <Eyewear shape={art.shape} c={c} g={geo.eyeGap} r={9.6 * geo.eyeScale} />
      </g>
    );
  }
  return (
    <g transform={`translate(${geo.face.x} ${geo.neck})`}>
      <Neckwear shape={art.shape} c={c} />
    </g>
  );
}

/** An accessory on its own (shop and locker previews), on a plain display head, like a mannequin. */
export function AccessoryPreview({ art, size = 72 }: { art: AccessoryArt; size?: number }) {
  const stand: BodyGeometry = { ...BODIES.blob, path: '', face: { x: 60, y: 62 }, top: { x: 60, y: 44 }, headW: 50, neck: 84, eyeGap: 13, eyeScale: 0.9, box: [30, 34, 90, 94] };
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden>
      <path d="M50 84H70L74 104H46Z" fill="var(--surface-3)" stroke="var(--line-strong)" strokeWidth="1.6" strokeLinejoin="round" />
      <ellipse cx="60" cy="63" rx="25" ry="24" fill="var(--surface-3)" stroke="var(--line-strong)" strokeWidth="1.6" />
      <Accessory art={art} geo={stand} />
    </svg>
  );
}
