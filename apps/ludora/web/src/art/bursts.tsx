import { prefersReducedMotion } from '../lib/prefs.ts';

/*
 * Celebration effects: the burst on a correct answer and the victory effect
 * on the podium. Players who equip an answer or victory effect see its style
 * and hue; everyone else gets the festival mix of paper lanterns, stars and
 * ribbons. Pure CSS animation, decoration only, and nothing plays when the
 * player asks for less motion.
 */

const COUNT = 16;
const FESTIVAL = ['var(--lantern)', 'var(--glim)', 'var(--rose)', 'var(--sky)', '#ffffff'];

const STAR = 'M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5Z';

function shape(style: string, i: number, color: string) {
  switch (style) {
    case 'festival':
      if (i % 3 === 0) {
        return (
          <>
            <rect x="4.2" y="0.4" width="3.6" height="1.6" rx="0.6" fill="var(--ink)" />
            <ellipse cx="6" cy="6.4" rx="4.4" ry="4.6" fill={color} stroke="var(--ink)" strokeWidth="1.1" />
            <rect x="4.2" y="10.4" width="3.6" height="1.4" rx="0.6" fill="var(--ink)" />
          </>
        );
      }
      if (i % 3 === 1) return <path d={STAR} fill={color} />;
      return <rect x="4" y="0" width="4" height="12" rx="1.6" fill={color} transform={`rotate(${i * 47} 6 6)`} />;
    case 'stars':
    case 'sparkle':
    case 'fireworks':
    case 'comets':
      return <path d={STAR} fill={color} />;
    case 'bubbles':
      return <circle cx="6" cy="6" r="5" fill="none" stroke={color} strokeWidth="1.6" />;
    case 'leaves':
    case 'petals':
      return <ellipse cx="6" cy="6" rx="6" ry="3" fill={color} transform={`rotate(${i * 37} 6 6)`} />;
    case 'lanterns':
      return <ellipse cx="6" cy="6" rx="4" ry="5.5" fill={color} stroke="var(--ink)" strokeWidth="1" />;
    case 'embers':
      return <circle cx="6" cy="6" r={2 + (i % 3)} fill={color} />;
    case 'ripple':
      return <circle cx="6" cy="6" r="5.5" fill="none" stroke={color} strokeWidth="1.2" />;
    default:
      return <rect x="3" y="0" width="5" height="11" rx="1.5" fill={color} transform={`rotate(${i * 41} 6 6)`} />;
  }
}

/**
 * A ring of particles flying out from the middle of the nearest positioned
 * parent. `rise` sends them upwards (for the podium); `delay` holds the burst
 * back, in milliseconds, so it can land on a beat of a longer reveal.
 */
export function Burst({ style = 'festival', hue = 42, size = 220, rise = false, delay = 0, count = COUNT }: { style?: string; hue?: number; size?: number; rise?: boolean; delay?: number; count?: number }) {
  if (prefersReducedMotion()) return null;
  const colors = style === 'festival' ? FESTIVAL : [`hsl(${hue} 95% 66%)`, `hsl(${(hue + 40) % 360} 95% 70%)`, '#ffffff'];
  const piece = Math.round(Math.max(14, Math.min(26, size / 12)));
  return (
    <div className="pointer-events-none absolute top-1/2 left-1/2 z-10" style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }} aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 2) * 0.2;
        const dist = size * (0.34 + (i % 3) * 0.07);
        const dx = Math.cos(angle) * dist;
        const dy = rise ? -Math.abs(Math.sin(angle) * dist) - size * 0.15 : Math.sin(angle) * dist;
        return (
          <svg
            key={i}
            width={piece}
            height={piece}
            viewBox="0 0 12 12"
            className="absolute top-1/2 left-1/2"
            style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, animation: `burst-out ${900 + (i % 4) * 140}ms var(--ease-out) ${delay + (i % 5) * 40}ms both` }}
          >
            {shape(style, i, colors[i % colors.length]!)}
          </svg>
        );
      })}
    </div>
  );
}
