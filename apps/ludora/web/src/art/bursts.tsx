import { prefersReducedMotion } from '../lib/prefs.ts';

/*
 * Celebration effects: the victory effect on the podium and the answer
 * effect on your own correct answers. Pure CSS animation; nothing plays
 * when the player asks for less motion.
 */

const COUNT = 14;

function shape(style: string, i: number, color: string) {
  switch (style) {
    case 'stars':
    case 'sparkle':
    case 'fireworks':
    case 'comets':
      return <path d="M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5Z" fill={color} />;
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

export function Burst({ style, hue, size = 220, rise = false }: { style: string; hue: number; size?: number; rise?: boolean }) {
  if (prefersReducedMotion()) return null;
  const colors = [`hsl(${hue} 95% 66%)`, `hsl(${(hue + 40) % 360} 95% 70%)`, '#fff'];
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-10" style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }} aria-hidden>
      {Array.from({ length: COUNT }, (_, i) => {
        const angle = (i / COUNT) * Math.PI * 2;
        const dist = size * (0.32 + (i % 3) * 0.06);
        const dx = Math.cos(angle) * dist;
        const dy = rise ? -Math.abs(Math.sin(angle) * dist) - size * 0.15 : Math.sin(angle) * dist;
        return (
          <svg
            key={i}
            width="14"
            height="14"
            viewBox="0 0 12 12"
            className="absolute left-1/2 top-1/2"
            style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, animation: `burst-out ${900 + (i % 4) * 140}ms var(--ease-out) ${(i % 5) * 40}ms both` }}
          >
            {shape(style, i, colors[i % colors.length]!)}
          </svg>
        );
      })}
    </div>
  );
}
