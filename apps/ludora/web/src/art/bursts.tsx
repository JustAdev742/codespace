import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/prefs.ts';
import { fxBurst, fxColors, fxLevel, fxReady, fxWarm, fxWhenReady } from '../fx/index.ts';

/*
 * Celebration effects: the burst on a correct answer, the victory effect on
 * the podium and the reveal of a rare Glim. Players who equip an answer or
 * victory effect see its style and hue; everyone else gets crisp shards and
 * streaks in the game's colours. Decoration only, and nothing plays when the
 * player asks for less motion.
 *
 * It is drawn one of two ways (D62). The plain burst is one quick, outward hit
 * (about 700 ms) in pure CSS: what every device gets until the stage's effects
 * have loaded, and what an older or slower device always gets. Where the
 * effects are up (fx/), the same burst in the same style and colours is thrown
 * on a canvas instead: more pieces, which tumble, fall and settle.
 */

const COUNT = 16;
const FESTIVAL = ['var(--lantern)', 'var(--glim)', 'var(--sky)', 'var(--ember)', '#ffffff'];

const STAR = 'M6 0L7.3 4.7L12 6L7.3 7.3L6 12L4.7 7.3L0 6L4.7 4.7Z';
/** A long, thin diamond pointing up: a streak once it is turned to face the way it flies. */
const STREAK = 'M6 0L7.4 6L6 12L4.6 6Z';
const SHARD = 'M6 0.5L10.5 10.5L2.5 8Z';

function shape(style: string, i: number, color: string, heading: number) {
  // Shapes that point turn to face the way they fly (heading in degrees, 0 = up).
  const turn = `rotate(${heading.toFixed(0)} 6 6)`;
  switch (style) {
    case 'festival':
      if (i % 3 === 0) return <path d={STREAK} fill={color} transform={turn} />;
      if (i % 3 === 1) return <path d={SHARD} fill={color} transform={`rotate(${(heading + i * 37) % 360} 6 6)`} />;
      return <rect x="4.6" y="1.5" width="2.8" height="9" rx="1" fill={color} transform={turn} />;
    case 'stars':
    case 'sparkle':
      return <path d={STAR} fill={color} />;
    case 'fireworks':
    case 'comets':
      return <path d={STREAK} fill={color} transform={turn} />;
    case 'bubbles':
      return <circle cx="6" cy="6" r="4.8" fill="none" stroke={color} strokeWidth="1.6" />;
    case 'leaves':
    case 'petals':
      return <path d="M6 0.8C9.6 3.4 9.6 8.6 6 11.2C2.4 8.6 2.4 3.4 6 0.8Z" fill={color} transform={`rotate(${(i * 37) % 360} 6 6)`} />;
    case 'lanterns':
      // A tiny Lantern: cap, glowing body, base.
      return (
        <>
          <rect x="3.6" y="0.8" width="4.8" height="1.8" rx="0.5" fill="#1a1d33" />
          <rect x="3" y="2.4" width="6" height="7" rx="1" fill={color} stroke="#1a1d33" strokeWidth="0.9" />
          <rect x="3.6" y="9.4" width="4.8" height="1.8" rx="0.5" fill="#1a1d33" />
        </>
      );
    case 'embers':
      return <circle cx="6" cy="6" r={2 + (i % 3)} fill={color} />;
    case 'ripple':
      return <circle cx="6" cy="6" r="5.4" fill="none" stroke={color} strokeWidth="1.2" />;
    default:
      return <rect x="3.5" y="0.5" width="5" height="11" rx="1.2" fill={color} transform={`rotate(${(i * 41) % 360} 6 6)`} />;
  }
}

interface BurstProps {
  style?: string;
  hue?: number;
  size?: number;
  rise?: boolean;
  delay?: number;
  count?: number;
  /** Always the plain burst, whatever the device: for a moment that must not be made bigger (opening a Lantern). */
  plain?: boolean;
  /** Only where the stage's effects are up; nothing at all on the plain game. For touches the plain game never had. */
  extra?: boolean;
  /** With `extra`, for the first moment on a page: waits a little for the effects to arrive rather than be skipped. */
  patient?: boolean;
}

/**
 * A ring of particles flying out from the middle of the nearest positioned
 * parent. `rise` sends them upwards (for the podium); `delay` holds the burst
 * back, in milliseconds, so it can land on a beat of a longer reveal.
 */
export function Burst(props: BurstProps) {
  // Nothing for less motion, nor in calm mode (Settings), which leaves celebrations out.
  if (prefersReducedMotion() || document.documentElement.dataset.calm === 'on') return null;
  if (!props.plain && (fxReady() || (props.extra && props.patient && fxLevel() !== 'plain'))) return <CanvasBurst {...props} />;
  // Not up yet (or never will be here): ask for it, for next time, and draw the plain burst now.
  if (!props.plain) fxWarm();
  return props.extra ? null : <PlainBurst {...props} />;
}

/** The burst's place on the page: the canvas throws the pieces from wherever this point is when its moment comes. */
function CanvasBurst({ style = 'festival', hue = 42, size = 220, rise = false, delay = 0, count = COUNT }: BurstProps) {
  const at = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => {
      // Thrown now; or, for a burst that came before the effects had been fetched, as they arrive.
      off = fxWhenReady(() => {
        const el = at.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        fxBurst({ x: r.left, y: r.top, size, count, rise, style, colors: fxColors(el, style, hue) });
      });
    }, Math.max(0, delay));
    return () => {
      clearTimeout(t);
      off();
    };
    // Thrown once, as it appears: a burst is a moment, not a state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <span ref={at} className="pointer-events-none absolute top-1/2 left-1/2 size-0" aria-hidden data-burst="canvas" />;
}

function PlainBurst({ style = 'festival', hue = 42, size = 220, rise = false, delay = 0, count = COUNT }: BurstProps) {
  const colors = style === 'festival' ? FESTIVAL : [`hsl(${hue} 95% 64%)`, `hsl(${(hue + 40) % 360} 95% 68%)`, '#ffffff'];
  const piece = Math.round(Math.max(14, Math.min(26, size / 12)));
  return (
    // A point, not a box: the pieces fly out from it, and a box of the burst's size would make a page taller than its screen.
    <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 size-0" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 2) * 0.2;
        const dist = size * (0.34 + (i % 3) * 0.07);
        const dx = Math.cos(angle) * dist;
        const dy = rise ? -Math.abs(Math.sin(angle) * dist) - size * 0.15 : Math.sin(angle) * dist;
        const heading = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        return (
          <svg
            key={i}
            width={piece}
            height={piece}
            viewBox="0 0 12 12"
            className="absolute top-1/2 left-1/2"
            style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, animation: `burst-out ${620 + (i % 4) * 90}ms var(--ease-out) ${delay + (i % 5) * 25}ms both` }}
          >
            {shape(style, i, colors[i % colors.length]!, heading)}
          </svg>
        );
      })}
    </div>
  );
}
