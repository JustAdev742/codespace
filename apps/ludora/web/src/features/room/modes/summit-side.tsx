import { useId } from 'react';
import { CLIMB_H, ledgePoint, radiusAt } from './summit-layout.ts';
import type { SummitView } from './summit-scramble.tsx';

/*
 * Summit Scramble without 3D: the same mountain drawn flat, as seen from in
 * front, with the same switchback path, camps, ropes and climbers as the 3D
 * scene (both read summit-layout.ts). One SVG, no animation beyond what the
 * view changes, so it suits 3D off, old devices and reduced motion alike.
 */

const TOP = CLIMB_H + 4.2;
const HALF = 20;

/** World metres to picture units: x as is, y flipped so up is up. */
const sx = (x: number) => x;
const sy = (y: number) => TOP - y;

function hueOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 36) * 10;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function silhouette(): string {
  const left: string[] = [];
  const right: string[] = [];
  const top = CLIMB_H + 0.4;
  for (let i = 0; i <= 12; i++) {
    const y = -1.5 + (i / 12) * (top + 1.5);
    const r = radiusAt(Math.max(0, y)) * 0.98 + (i % 2 ? 0.25 : -0.15);
    left.push(`${sx(-r).toFixed(2)},${sy(y).toFixed(2)}`);
    right.unshift(`${sx(r).toFixed(2)},${sy(y).toFixed(2)}`);
  }
  const rTop = radiusAt(top);
  const cap = `Q ${sx(-rTop * 0.6).toFixed(2)},${sy(top + 2.2).toFixed(2)} ${sx(0)},${sy(top + 2.3).toFixed(2)} Q ${sx(rTop * 0.6).toFixed(2)},${sy(top + 2.2).toFixed(2)} ${right[0]}`;
  return `M ${left.join(' L ')} ${cap} L ${right.slice(1).join(' L ')} Z`;
}

function snowCap(): string {
  const y0 = 13.6;
  const top = CLIMB_H + 0.4;
  const r0 = radiusAt(y0);
  const rTop = radiusAt(top);
  // A jagged snow line across the face.
  const teeth: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const x = -r0 + (i / 10) * 2 * r0;
    const y = y0 + (i % 2 ? -0.9 : 0.4) + Math.sin(i * 1.7) * 0.4;
    teeth.push(`${sx(x).toFixed(2)},${sy(y).toFixed(2)}`);
  }
  return `M ${teeth.join(' L ')} L ${sx(rTop).toFixed(2)},${sy(top).toFixed(2)} Q ${sx(rTop * 0.6).toFixed(2)},${sy(top + 2.2).toFixed(2)} ${sx(0)},${sy(top + 2.3).toFixed(2)} Q ${sx(-rTop * 0.6).toFixed(2)},${sy(top + 2.2).toFixed(2)} ${sx(-rTop).toFixed(2)},${sy(top).toFixed(2)} Z`;
}

const MOUNTAIN = silhouette();
const SNOW = snowCap();

export function SideView({ view, label, host = false }: { view: SummitView; label: string; host?: boolean }) {
  const id = useId().replace(/:/g, '');
  const summit = view.summit;
  const path: string[] = [];
  for (let l = 0; l <= summit; l += 0.25) {
    const p = ledgePoint(l, summit);
    path.push(`${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`);
  }
  // Climbers who share a ledge stand side by side.
  const groups = new Map<number, SummitView['climbers']>();
  for (const c of view.climbers) {
    const list = groups.get(c.ledge) ?? [];
    list.push(c);
    groups.set(c.ledge, list);
  }
  const placed = [...groups.entries()].flatMap(([ledge, list]) => {
    const p = ledgePoint(ledge, summit);
    const sorted = [...list].sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.name.localeCompare(b.name));
    const wide = ledge === 0 ? 6 : 3;
    return sorted.map((c, i) => ({ c, below: i % 2 === 1, x: p.x + ((i % wide) - (Math.min(wide, sorted.length) - 1) / 2) * 0.95 + (ledge === 0 ? 2 : 0), y: p.y + 0.55 + Math.floor(i / wide) * 1.0 }));
  });
  // Draw yourself last, on top of everyone.
  placed.sort((a, b) => Number(a.c.isYou) - Number(b.c.isYou));
  // On the big screen a crowd on one ledge gets one stacked list of names instead of tags that cover each other.
  const clusters: { ledges: number[]; list: SummitView['climbers'] }[] = [];
  for (const ledge of [...groups.keys()].sort((a, b) => a - b)) {
    const last = clusters[clusters.length - 1];
    // Climbers within two ledges of each other share one list: their names would touch.
    if (last && ledge - last.ledges[last.ledges.length - 1]! <= 2) {
      last.ledges.push(ledge);
      last.list.push(...groups.get(ledge)!);
    } else clusters.push({ ledges: [ledge], list: [...groups.get(ledge)!] });
  }
  const crowds = host
    ? clusters
        .filter((g) => g.list.length >= 2)
        .map((g) => {
          const top = g.ledges[g.ledges.length - 1]!;
          const p = ledgePoint((g.ledges[0]! + top) / 2, summit);
          const names = g.list.map((c) => c.name).sort((a, b) => a.localeCompare(b));
          const lines = names.length > 6 ? [...names.slice(0, 5), `and ${names.length - 5} more`] : names;
          const rows = Math.max(...g.ledges.map((l) => Math.ceil(groups.get(l)!.length / (l === 0 ? 6 : 3))));
          return { key: g.ledges[0]!, ids: g.list.map((c) => c.playerId), x: p.x + (g.ledges[0] === 0 ? 2 : 0), top: Math.max(p.y, ledgePoint(top, summit).y) + 0.55 + rows * 1.0 + 0.2, lines };
        })
    : [];
  const crowded = new Set(crowds.flatMap((g) => g.ids));
  const named = new Set((host ? view.climbers : view.climbers.filter((c) => c.isYou)).map((c) => c.playerId).filter((id) => !crowded.has(id)));
  const camps = [0, ...view.camps.map((c) => c.ledge), summit];
  const wind = view.wind;

  return (
    <svg viewBox={`${-HALF} 0 ${HALF * 2} ${TOP + 1.6}`} preserveAspectRatio="xMidYMax meet" className="block h-full w-full rounded-[var(--radius-l)] bg-[#0b1233]" role="img" aria-label={label}>
      <defs>
        <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#070b24" />
          <stop offset="1" stopColor="#24346e" />
        </linearGradient>
        <linearGradient id={`${id}rock`} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor="#8a93b8" />
          <stop offset="0.45" stopColor="#5f6a93" />
          <stop offset="1" stopColor="#3b4470" />
        </linearGradient>
        <radialGradient id={`${id}glow`}>
          <stop offset="0" stopColor="#ffc27a" stopOpacity="0.75" />
          <stop offset="1" stopColor="#ffc27a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g aria-hidden>
        {/* Wider than the picture, so a stage of any shape is filled edge to edge. */}
        <rect x={-80} y={-20} width={160} height={TOP + 21.6} fill={`url(#${id}sky)`} />
        <circle cx={-14} cy={4} r={1.8} fill="#f3efe0" />
        <circle cx={-14} cy={4} r={4.5} fill="#bfcaff" opacity={0.12} />
        {/* Distant ranges. */}
        <path d={`M -80 ${sy(3)} L -40 ${sy(9)} L -28 ${sy(4)} L ${-HALF} ${sy(2)} L -15 ${sy(10)} L -10 ${sy(4)} L -4 ${sy(9)} L 3 ${sy(3)} L 10 ${sy(11)} L 15 ${sy(5)} L ${HALF} ${sy(9)} L 32 ${sy(5)} L 46 ${sy(10)} L 80 ${sy(4)} L 80 ${TOP + 20} L -80 ${TOP + 20} Z`} fill="#1c2650" />
        <path d={MOUNTAIN} fill={`url(#${id}rock)`} stroke="#0b1020" strokeWidth={0.12} strokeLinejoin="round" />
        {/* The shaded right flank. */}
        <path d={`M 0 ${sy(CLIMB_H + 2.3)} L ${radiusAt(-1.5)} ${sy(-1.5)} L 6 ${sy(-1.5)} Z`} fill="#0b1020" opacity={0.18} />
        <path d={SNOW} fill="#e8eefc" />
        {/* The forest round the foot. */}
        <rect x={-80} y={sy(-0.4)} width={160} height={20} fill="#1e3440" />
        {Array.from({ length: 32 }, (_, i) => {
          const x = -40 + i * 2.55 + (i % 3) * 0.4;
          const h = 1.6 + (i % 4) * 0.35;
          return <path key={i} d={`M ${x - 0.8} ${sy(-0.8)} L ${x} ${sy(-0.8 + h)} L ${x + 0.8} ${sy(-0.8)} Z`} fill={i % 2 ? '#1f4a48' : '#2a5e58'} />;
        })}
        {/* Bands of cloud at the sides. */}
        {[7.5, 13.8].map((y) =>
          [-1, 1].map((side) => <ellipse key={`${y}${side}`} cx={side * (radiusAt(y) + 1.5)} cy={sy(y)} rx={4.5} ry={0.9} fill="#dfe6fa" opacity={0.28} />),
        )}
        {/* The path and its ledges. */}
        <polyline points={path.join(' ')} fill="none" stroke="#e9d6a8" strokeWidth={0.2} strokeLinecap="round" strokeLinejoin="round" />
        {Array.from({ length: summit - 1 }, (_, i) => i + 1)
          .filter((l) => l % 10 !== 0)
          .map((l) => {
            const p = ledgePoint(l, summit);
            return <rect key={l} x={sx(p.x) - 0.45} y={sy(p.y) - 0.05} width={0.9} height={0.24} rx={0.08} fill="#e2c690" stroke="#0b1020" strokeWidth={0.05} />;
          })}
        {/* Ropes hanging from their ledges. */}
        {view.ropes.map((l) => {
          const p = ledgePoint(l, summit);
          return (
            <g key={`rope${l}`}>
              <path d={`M ${sx(p.x)} ${sy(p.y)} q 0.3 0.8 0 1.6`} fill="none" stroke="#d9b77a" strokeWidth={0.12} />
              <circle cx={sx(p.x)} cy={sy(p.y) + 1.65} r={0.18} fill="#ffe1a0" />
            </g>
          );
        })}
        {/* Camps: a lantern's glow, a tent and a flag; the summit's flag is gold. */}
        {camps.map((l) => {
          const p = ledgePoint(l, summit);
          const top = l === summit;
          const reached = top ? view.finished.length > 0 : l === 0 || view.camps.find((c) => c.ledge === l)?.first.length;
          return (
            <g key={`camp${l}`}>
              <circle cx={sx(p.x)} cy={sy(p.y + 0.8)} r={top ? 2.6 : 1.8} fill={`url(#${id}glow)`} />
              <rect x={sx(p.x) - (l === 0 ? 2.6 : 1.2)} y={sy(p.y) - 0.1} width={l === 0 ? 5.2 : 2.4} height={0.36} rx={0.15} fill={top ? '#e9eefb' : '#bba27a'} stroke="#0b1020" strokeWidth={0.06} />
              {!top ? <path d={`M ${sx(p.x) - 1.1} ${sy(p.y)} l 0.6 -0.9 l 0.6 0.9 Z`} fill={l === 0 ? '#e7d6b0' : '#ffc45a'} stroke="#0b1020" strokeWidth={0.05} /> : null}
              <line x1={sx(p.x) + 0.6} y1={sy(p.y)} x2={sx(p.x) + 0.6} y2={sy(p.y + (top ? 2.6 : 1.8))} stroke="#3a3550" strokeWidth={0.1} />
              <path d={`M ${sx(p.x) + 0.6} ${sy(p.y + (top ? 2.6 : 1.8))} l ${top ? 1.3 : 0.9} 0.3 l ${top ? -1.3 : -0.9} 0.3 Z`} fill={top ? '#ffc233' : reached ? '#ff4d6a' : '#8c93b0'} />
              {l > 0 ? (
                <text x={sx(p.x)} y={sy(p.y) + 1.05} textAnchor="middle" fontSize={0.62} fontWeight={700} fill="#fff" stroke="#0b1020" strokeWidth={0.14} paintOrder="stroke">
                  {top ? 'Summit' : `Camp ${l / 10}`}
                </text>
              ) : null}
            </g>
          );
        })}
        {/* Climbers. */}
        {placed.map(({ c, x, y, below }) => {
          const r = c.isYou ? 0.62 : host ? 0.5 : 0.42;
          return (
            <g key={c.playerId}>
              <circle cx={sx(x)} cy={sy(y)} r={r + 0.5} fill={`url(#${id}glow)`} />
              <circle cx={sx(x)} cy={sy(y)} r={r} fill={c.isYou ? '#ffc233' : `hsl(${hueOf(c.playerId)} 70% 62%)`} stroke="#0b1020" strokeWidth={0.1} />
              <text x={sx(x)} y={sy(y) + r * 0.36} textAnchor="middle" fontSize={r * 0.95} fontWeight={800} fill="#0b1020">
                {initials(c.name)}
              </text>
              {named.has(c.playerId) ? (
                <text x={sx(x)} y={below && !c.isYou ? sy(y) + r + 0.75 : sy(y) - r - 0.25} textAnchor="middle" fontSize={c.isYou ? 0.8 : 0.62} fontWeight={700} fill={c.isYou ? '#ffc233' : '#fff'} stroke="#0b1020" strokeWidth={0.16} paintOrder="stroke">
                  {c.isYou ? 'You' : c.name.length > 14 ? `${c.name.slice(0, 13)}…` : c.name}
                </text>
              ) : null}
            </g>
          );
        })}
        {crowds.map((g) => (
          <text key={`crowd${g.key}`} x={sx(g.x)} y={sy(g.top) - (g.lines.length - 1) * 0.72} textAnchor="middle" fontSize={0.62} fontWeight={700} fill="#fff" stroke="#0b1020" strokeWidth={0.16} paintOrder="stroke">
            {g.lines.map((line, i) => (
              <tspan key={i} x={sx(g.x)} dy={i === 0 ? 0 : 0.72}>
                {line.length > 16 ? `${line.slice(0, 15)}…` : line}
              </tspan>
            ))}
          </text>
        ))}
        {/* The wind: streaks across the face, more of them while it blows. */}
        {wind
          ? Array.from({ length: wind.blowing ? 12 : 5 }, (_, i) => {
              const y = 2 + ((i * 7.3) % (CLIMB_H + 1));
              const x = -HALF + 2 + ((i * 11.7) % (HALF * 2 - 8));
              return <line key={`w${i}`} x1={x} y1={sy(y)} x2={x + 4 + (i % 3)} y2={sy(y)} stroke="#dfe8ff" strokeWidth={0.12} strokeLinecap="round" opacity={wind.blowing ? 0.7 : 0.4} />;
            })
          : null}
      </g>
    </svg>
  );
}
