import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Decor, SeasonTheme } from '@ludora/content/seasons';
import './season.css';

/*
 * The season's decorations, strung across the top of a stage: fairy lights at
 * Christmas, lanterns at Lunar New Year, bunting on Australia Day. Drawn in
 * SVG at the width it is given (one unit is one pixel), so a phone gets fewer
 * pieces rather than smaller ones. Decoration only: hidden from screen
 * readers, and still when the player has asked for less motion.
 */

const H = 84;
const GARLAND: Decor[] = ['bunting', 'lights', 'lanterns', 'books', 'eggs', 'bats', 'blossoms', 'stars', 'leaves', 'rain', 'snow'];
const isGarland = (d: Decor) => GARLAND.includes(d);

const col = (h: number, s = 88, l = 64) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;

/** A repeatable scatter: the same picture every time, no Math.random. */
function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

interface Point {
  x: number;
  y: number;
}

/** Points along a wire that hangs in swags between pins at the top edge. */
function wire(width: number, spacing: number): { d: string; points: Point[] } {
  const swags = Math.max(1, Math.round(width / 420));
  const span = width / swags;
  const top = 4;
  const sag = 34;
  let d = `M 0 ${top}`;
  const points: Point[] = [];
  for (let i = 0; i < swags; i++) {
    const x0 = i * span;
    const x1 = x0 + span;
    d += ` Q ${x0 + span / 2} ${top + sag * 2} ${x1} ${top}`;
    const n = Math.max(2, Math.round(span / spacing));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      // A quadratic Bezier from (x0, top) through control (mid, top + 2 sag) to (x1, top).
      points.push({ x: x0 + span * t, y: top + 2 * (1 - t) * t * sag * 2 });
    }
  }
  return { d, points };
}

function Piece({ kind, at, i, theme }: { kind: Decor; at: Point; i: number; theme: SeasonTheme }): ReactNode {
  const { x, y } = at;
  const colours = [col(theme.hue), col(theme.accentHue), '#ffffff', col(theme.hue + 40, 80, 70)];
  const c = colours[i % colours.length]!;
  const delay = { animationDelay: `${(i * 0.37) % 2.4}s` };
  switch (kind) {
    case 'bunting':
      return <path d={`M ${x - 14} ${y - 1} L ${x + 14} ${y - 1} L ${x} ${y + 24} Z`} fill={c} opacity={0.95} />;
    case 'lights': {
      const bulb = [col(theme.hue, 95, 66), col(theme.accentHue, 95, 62), col(50, 100, 66), col(200, 95, 70)][i % 4]!;
      return (
        <g className="sg-twinkle" style={{ ...delay, color: bulb }}>
          <circle cx={x} cy={y + 13} r={13} fill="currentColor" opacity={0.22} />
          <rect x={x - 3} y={y - 1} width={6} height={5} rx={1} fill="#3b4470" />
          <ellipse cx={x} cy={y + 12} rx={5.5} ry={8} fill="currentColor" />
        </g>
      );
    }
    case 'lanterns': {
      if (i % 2) return null;
      const fill = i % 4 ? col(theme.accentHue, 90, 58) : col(theme.hue, 82, 56);
      return (
        <g className="sg-sway" style={{ ...delay, transformOrigin: `${x}px ${y}px` }}>
          <line x1={x} y1={y} x2={x} y2={y + 10} stroke="#f4e3b5" strokeWidth={1.5} />
          <circle cx={x} cy={y + 26} r={20} fill={fill} opacity={0.25} />
          <rect x={x - 7} y={y + 9} width={14} height={4} rx={1.5} fill="#f2c14e" />
          <ellipse cx={x} cy={y + 25} rx={13} ry={12} fill={fill} />
          <path d={`M ${x - 5} ${y + 14} Q ${x - 9} ${y + 25} ${x - 5} ${y + 36} M ${x + 5} ${y + 14} Q ${x + 9} ${y + 25} ${x + 5} ${y + 36}`} stroke="rgb(0 0 0 / 0.18)" strokeWidth={1.5} fill="none" />
          <rect x={x - 7} y={y + 36} width={14} height={4} rx={1.5} fill="#f2c14e" />
          <line x1={x} y1={y + 40} x2={x} y2={y + 50} stroke="#f2c14e" strokeWidth={2} />
        </g>
      );
    }
    case 'books':
      return (
        <g>
          <line x1={x} y1={y} x2={x} y2={y + 6} stroke="#d5dcfa" strokeWidth={1} />
          <path d={`M ${x} ${y + 9} Q ${x - 8} ${y + 5} ${x - 15} ${y + 8} L ${x - 15} ${y + 25} Q ${x - 8} ${y + 22} ${x} ${y + 26} Z`} fill={c} />
          <path d={`M ${x} ${y + 9} Q ${x + 8} ${y + 5} ${x + 15} ${y + 8} L ${x + 15} ${y + 25} Q ${x + 8} ${y + 22} ${x} ${y + 26} Z`} fill={colours[(i + 1) % colours.length]} />
          <line x1={x} y1={y + 9} x2={x} y2={y + 26} stroke="rgb(0 0 0 / 0.25)" strokeWidth={1.2} />
        </g>
      );
    case 'eggs':
      return (
        <g className="sg-sway" style={{ ...delay, transformOrigin: `${x}px ${y}px` }}>
          <line x1={x} y1={y} x2={x} y2={y + 7} stroke="#d5dcfa" strokeWidth={1} />
          <ellipse cx={x} cy={y + 20} rx={9} ry={12} fill={c} />
          <path d={`M ${x - 9} ${y + 19} l 3 -3 l 3 3 l 3 -3 l 3 3 l 3 -3 l 3 3`} stroke={colours[(i + 2) % colours.length]} strokeWidth={2} fill="none" />
        </g>
      );
    case 'bats':
      return (
        <g className="sg-sway" style={{ ...delay, transformOrigin: `${x}px ${y}px` }}>
          <line x1={x} y1={y} x2={x} y2={y + 5} stroke="#d5dcfa" strokeWidth={1} />
          {/* A friendly bat hanging upside down: wings folded, two round eyes. */}
          <path d={`M ${x} ${y + 5} C ${x - 12} ${y + 8} ${x - 13} ${y + 22} ${x - 8} ${y + 27} L ${x - 4} ${y + 24} L ${x} ${y + 29} L ${x + 4} ${y + 24} L ${x + 8} ${y + 27} C ${x + 13} ${y + 22} ${x + 12} ${y + 8} ${x} ${y + 5} Z`} fill="#2a2350" stroke={col(theme.accentHue, 70, 70)} strokeWidth={1.2} />
          <circle cx={x - 3} cy={y + 17} r={1.6} fill="#ffe27a" />
          <circle cx={x + 3} cy={y + 17} r={1.6} fill="#ffe27a" />
        </g>
      );
    case 'blossoms': {
      const r = 6.5;
      const petals = [0, 72, 144, 216, 288].map((a) => {
        const rad = ((a - 90) * Math.PI) / 180;
        return <circle key={a} cx={x + Math.cos(rad) * r} cy={y + 6 + Math.sin(rad) * r} r={4.6} fill={i % 3 ? col(theme.hue, 70, 80) : '#ffffff'} />;
      });
      return (
        <g>
          {petals}
          <circle cx={x} cy={y + 6} r={2.6} fill={col(50, 95, 62)} />
        </g>
      );
    }
    case 'stars': {
      const len = 8 + ((i * 7) % 3) * 9;
      const r = 8;
      const pts = Array.from({ length: 10 }, (_, k) => {
        const a = (Math.PI / 5) * k - Math.PI / 2;
        const rr = k % 2 ? r * 0.45 : r;
        return `${x + Math.cos(a) * rr},${y + len + r + Math.sin(a) * rr}`;
      }).join(' ');
      return (
        <g className="sg-twinkle" style={delay}>
          <line x1={x} y1={y} x2={x} y2={y + len} stroke="#d5dcfa" strokeWidth={1} opacity={0.7} />
          <polygon points={pts} fill={i % 2 ? col(48, 100, 66) : '#ffffff'} />
        </g>
      );
    }
    case 'leaves': {
      const fill = [col(24, 85, 55), col(40, 90, 58), col(8, 75, 52)][i % 3]!;
      return <path d={`M ${x} ${y} C ${x + 11} ${y + 6} ${x + 9} ${y + 20} ${x} ${y + 24} C ${x - 9} ${y + 20} ${x - 11} ${y + 6} ${x} ${y} Z`} fill={fill} transform={`rotate(${(i % 2 ? 1 : -1) * (20 + (i % 3) * 12)} ${x} ${y})`} />;
    }
    case 'rain':
      return (
        <g>
          <line x1={x} y1={y} x2={x} y2={y + 6} stroke="#d5dcfa" strokeWidth={1} opacity={0.6} />
          <path d={`M ${x} ${y + 7} C ${x + 7} ${y + 16} ${x + 7} ${y + 23} ${x} ${y + 23} C ${x - 7} ${y + 23} ${x - 7} ${y + 16} ${x} ${y + 7} Z`} fill={i % 2 ? col(theme.hue, 80, 70) : col(theme.accentHue, 70, 76)} />
        </g>
      );
    case 'snow':
      return (
        <g stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round">
          <line x1={x} y1={y} x2={x} y2={y + 6} strokeWidth={1} opacity={0.6} />
          {[0, 60, 120].map((a) => {
            const rad = (a * Math.PI) / 180;
            return <line key={a} x1={x - Math.cos(rad) * 7} y1={y + 14 - Math.sin(rad) * 7} x2={x + Math.cos(rad) * 7} y2={y + 14 + Math.sin(rad) * 7} />;
          })}
        </g>
      );
    default:
      return null;
  }
}

function Overlay({ kind, width, theme }: { kind: Decor; width: number; theme: SeasonTheme }): ReactNode {
  const r = rand(kind.length * 977 + Math.round(width));
  switch (kind) {
    case 'confetti': {
      const n = Math.round(width / 26);
      return (
        <g>
          {Array.from({ length: n }, (_, i) => {
            const x = r() * width;
            const y = 6 + r() * (H - 18);
            const fill = [col(theme.hue), col(theme.accentHue), '#ffffff', col(theme.hue + 120, 85, 66)][i % 4];
            return i % 3 ? <rect key={i} x={x} y={y} width={7} height={3.5} rx={1} fill={fill} transform={`rotate(${r() * 180} ${x} ${y})`} opacity={0.85} /> : <circle key={i} cx={x} cy={y} r={2.4} fill={fill} opacity={0.85} />;
          })}
        </g>
      );
    }
    case 'fireworks': {
      const spots = width < 600 ? [0.18, 0.82] : [0.1, 0.36, 0.64, 0.9];
      return (
        <g>
          {spots.map((f, i) => {
            const cx = f * width;
            const cy = 26 + (i % 2) * 14;
            const c = i % 2 ? col(theme.accentHue, 100, 66) : col(theme.hue, 95, 72);
            return (
              <g key={f} className="sg-burst" style={{ animationDelay: `${i * 0.6}s`, transformOrigin: `${cx}px ${cy}px`, color: c }}>
                {Array.from({ length: 12 }, (_, k) => {
                  const a = (Math.PI * 2 * k) / 12;
                  return <line key={k} x1={cx + Math.cos(a) * 7} y1={cy + Math.sin(a) * 7} x2={cx + Math.cos(a) * 20} y2={cy + Math.sin(a) * 20} stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />;
                })}
                <circle cx={cx} cy={cy} r={2.5} fill="#ffffff" />
              </g>
            );
          })}
        </g>
      );
    }
    case 'sun': {
      const cx = width - 46;
      const cy = 26;
      return (
        <g className="sg-spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <circle cx={cx} cy={cy} r={34} fill={col(46, 100, 60)} opacity={0.18} />
          {Array.from({ length: 12 }, (_, k) => {
            const a = (Math.PI * 2 * k) / 12;
            return <line key={k} x1={cx + Math.cos(a) * 24} y1={cy + Math.sin(a) * 24} x2={cx + Math.cos(a) * 32} y2={cy + Math.sin(a) * 32} stroke={col(44, 100, 62)} strokeWidth={3} strokeLinecap="round" />;
          })}
          <circle cx={cx} cy={cy} r={18} fill={col(46, 100, 62)} />
        </g>
      );
    }
    default:
      return null;
  }
}

export function SeasonGarland({ theme, className = '' }: { theme: SeasonTheme; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(1200);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const strung = theme.decor.filter(isGarland).slice(0, 2);
  const over = theme.decor.filter((d) => !isGarland(d));
  const spacing = strung.includes('lanterns') ? 34 : strung.includes('lights') ? 38 : 44;
  // The sun sits in the top right corner; the garland stops short of it.
  const w = strung.length ? wire(width - (over.includes('sun') ? 96 : 0), spacing) : null;
  const branch = strung[0] === 'blossoms' || strung[0] === 'leaves';

  return (
    <svg ref={ref} className={`pointer-events-none absolute inset-x-0 top-0 z-0 h-[84px] w-full ${className}`} viewBox={`0 0 ${width} ${H}`} preserveAspectRatio="xMidYMin meet" aria-hidden focusable="false">
      {over.map((d) => (
        <Overlay key={d} kind={d} width={width} theme={theme} />
      ))}
      {w ? (
        <>
          <path d={w.d} fill="none" stroke={branch ? '#7a5a44' : 'rgb(213 220 250 / 0.55)'} strokeWidth={branch ? 3 : 1.4} />
          {w.points.map((p, i) => (
            <Piece key={i} kind={strung[i % strung.length]!} at={p} i={i} theme={theme} />
          ))}
        </>
      ) : null}
    </svg>
  );
}
