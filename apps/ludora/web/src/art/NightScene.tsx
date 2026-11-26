import { memo } from 'react';

/*
 * The night Ludora is set in, as a picture (ART_DIRECTION.md): hills falling away under a low moon,
 * mist between them, strings of lights across the sky and lanterns let go into it. It stands behind
 * the first things a person sees (the landing page, signing in, joining a game) and behind a game
 * on a phone. Drawn for Ludora, in the stage's own colours, so a school's copy has its own night.
 *
 * It is decoration: hidden from screen readers, never in the way of a tap. On a device that is not
 * asked for less motion the lanterns rise very slowly; `quiet` leaves the sky nearly empty, for
 * behind a question someone is reading.
 */

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** One paper lantern, about 30 by 40 units, hanging from its own middle top. */
export function LanternGlyph({ hue, glow = true }: { hue: number; glow?: boolean }) {
  const c = `hsl(${hue} 96% 62%)`;
  return (
    <>
      {glow ? <circle r="46" cy="16" fill={c} opacity="0.16" /> : null}
      {glow ? <circle r="26" cy="16" fill={c} opacity="0.22" /> : null}
      <rect x="-7" y="-2" width="14" height="5" rx="1.5" fill="#1a1433" />
      <path d="M-11 4 Q-15 16 -11 28 H11 Q15 16 11 4 Z" fill={c} />
      <path d="M-5 4 Q-7 16 -5 28" stroke="rgb(255 255 255 / 0.5)" strokeWidth="1.6" fill="none" />
      <path d="M11 4 Q15 16 11 28" stroke="rgb(0 0 0 / 0.2)" strokeWidth="3" fill="none" />
      <rect x="-6" y="28" width="12" height="4" rx="1.5" fill="#1a1433" />
      <line y1="32" y2="41" stroke={c} strokeWidth="1.4" />
    </>
  );
}

const W = 1600;
const H = 900;

/**
 * Everything in the picture, for a 1600 by 900 drawing: the board's default backdrop draws it inside
 * its own (features/room/game/Backdrop.tsx), without the moon: a board has words in every corner at
 * one time or another, and nothing that bright may sit behind them.
 */
export const NightParts = memo(function NightParts({ quiet = false, moon = true }: { quiet?: boolean; moon?: boolean }) {
  const r = seeded(quiet ? 11 : 5);
  const stars = Array.from({ length: quiet ? 46 : 90 }, () => ({ x: r() * W, y: r() * H * 0.62, s: 0.6 + r() * 1.5, o: 0.25 + r() * 0.65 }));
  const hues = [42, 38, 350, 28, 160, 265, 44];
  const lanterns = Array.from({ length: quiet ? 6 : 22 }, (_, i) => {
    let far = r();
    const x = 60 + r() * (W - 120);
    const y = 70 + r() * (quiet ? 300 : 470);
    // The middle of the picture is where a page's words are: lanterns there are the far, small, faint ones.
    if (x > W * 0.14 && x < W * 0.7 && y > 110 && y < 520) far = 0.82 + far * 0.18;
    return { x, y, s: 0.34 + (1 - far) * (quiet ? 0.55 : 1.05), hue: hues[i % hues.length]!, far, d: 26 + r() * 30, delay: -r() * 40 };
  }).sort((a, b) => a.s - b.s);
  const bulbs = (x0: number, y0: number, x1: number, y1: number, sag: number, n: number) =>
    Array.from({ length: n }, (_, i) => {
      const t = (i + 0.5) / n;
      return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag, hue: hues[(i * 3) % hues.length]! };
    });
  const strings = quiet ? [] : [bulbs(-20, 60, 760, 30, 120, 13), bulbs(760, 30, 1620, 80, 130, 14)];
  return (
    <>
      <defs>
        <radialGradient id="ns-moon" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6dc" stopOpacity="0.5" />
          <stop offset="0.4" stopColor="#bfb4ff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#bfb4ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ns-horizon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff9d6b" stopOpacity="0" />
          <stop offset="1" stopColor="#ff9d6b" stopOpacity="0.26" />
        </linearGradient>
        <linearGradient id="ns-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.09" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#ffffff" opacity={s.o} />
      ))}
      {quiet || !moon ? null : (
        <>
          <circle cx="1230" cy="210" r="290" fill="url(#ns-moon)" />
          <circle cx="1230" cy="210" r="74" fill="#fff6dc" />
          <circle cx="1206" cy="190" r="13" fill="#efe2bf" opacity="0.7" />
          <circle cx="1252" cy="236" r="19" fill="#efe2bf" opacity="0.55" />
        </>
      )}
      {/* The last of the day along the horizon, then three rows of hills with mist lying between them. */}
      <rect x="0" y="470" width={W} height="230" fill="url(#ns-horizon)" />
      <path d="M0 640 C 180 560 330 600 520 630 S 900 520 1120 590 S 1440 640 1600 580 V 900 H 0 Z" style={{ fill: 'color-mix(in oklab, var(--stage-1) 62%, #8f7dff)' }} opacity="0.75" />
      <rect x="0" y="600" width={W} height="110" fill="url(#ns-mist)" />
      <path d="M0 720 C 240 640 420 700 640 712 S 1040 630 1290 690 S 1520 730 1600 700 V 900 H 0 Z" style={{ fill: 'color-mix(in oklab, var(--stage-2) 82%, #6a5cff)' }} />
      {/* Lights of a village on the middle hills. */}
      {quiet
        ? null
        : [
            [210, 706], [236, 700], [262, 708], [900, 668], [928, 662], [1310, 696], [1340, 702], [1370, 694],
          ].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="9" fill="#ffc233" opacity="0.2" />
              <circle cx={x} cy={y} r="2.6" fill="#ffe08a" />
            </g>
          ))}
      <rect x="0" y="690" width={W} height="100" fill="url(#ns-mist)" />
      <path d="M0 800 C 300 750 520 792 800 802 S 1260 752 1600 792 V 900 H 0 Z" style={{ fill: 'var(--stage-4)' }} />
      {/* Pines on the near ridge, either side. */}
      <g style={{ fill: 'var(--stage-4)' }}>
        {[40, 96, 150, 222, 1380, 1440, 1502, 1556].map((x, i) => {
          const h = 70 + ((i * 37) % 60);
          const base = x < 800 ? 792 - (x / 800) * 8 : 770 + ((x - 800) / 800) * 22;
          return <polygon key={x} points={`${x - h * 0.26},${base} ${x},${base - h} ${x + h * 0.26},${base}`} />;
        })}
      </g>
      {strings.map((line, k) => (
        <g key={k}>
          <polyline points={line.map((b) => `${b.x},${b.y}`).join(' ')} fill="none" stroke="rgb(255 255 255 / 0.22)" strokeWidth="1.5" />
          {line.map((b, i) => (
            <g key={i}>
              <circle cx={b.x} cy={b.y + 7} r="13" fill={`hsl(${b.hue} 100% 62%)`} opacity="0.22" />
              <circle cx={b.x} cy={b.y + 7} r="5" fill={`hsl(${b.hue} 100% 70%)`} />
            </g>
          ))}
        </g>
      ))}
      {lanterns.map((l, i) => (
        <g key={i} className="night-rise" style={{ animationDuration: `${l.d}s`, animationDelay: `${l.delay}s` }}>
          <g transform={`translate(${l.x} ${l.y}) scale(${l.s})`} opacity={0.38 + (1 - l.far) * 0.62}>
            <LanternGlyph hue={l.hue} />
          </g>
        </g>
      ))}
    </>
  );
});

export const NightScene = memo(function NightScene({ quiet = false, className = '' }: { quiet?: boolean; className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className={`night-scene pointer-events-none absolute inset-0 -z-10 size-full ${className}`} aria-hidden focusable="false">
      <NightParts quiet={quiet} />
    </svg>
  );
});
