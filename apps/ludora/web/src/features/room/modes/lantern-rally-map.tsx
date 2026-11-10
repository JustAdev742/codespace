import { useEffect, useId, useMemo, useState } from 'react';
import { LANE_WIDTH, laneOffset, lapPos, pointAt, trackBounds, trackPath, type CircuitId } from '@ludora/engine/lantern-rally';
import type { FieldKart, RallyField } from './lantern-rally-field.ts';
import { FLAG } from './lantern-rally-field.ts';
import { ordinal } from './lantern-rally-words.ts';

/*
 * Lantern Rally without 3D: the circuit drawn from above, with the same lanes,
 * puddles, cones, lanterns and karts as the 3D scene (both read the circuit
 * from track.ts and the karts from one RallyField). It is also the big
 * screen's small map. Redrawn a dozen times a second from the field; with
 * reduced motion it still moves (the karts are the game), but nothing
 * decorative does.
 */

const HALF = LANE_WIDTH * 1.5 + 0.7;

interface Palette {
  ground: string;
  road: string;
  edge: string;
  lantern: string;
}

const PALETTE: Record<CircuitId, Palette> = {
  harbour: { ground: '#323b55', road: '#262b3d', edge: '#e8435a', lantern: '#ffc864' },
  forest: { ground: '#1d3527', road: '#2e2c35', edge: '#e8435a', lantern: '#ffd76a' },
  rooftops: { ground: '#34314a', road: '#25253a', edge: '#e8435a', lantern: '#ff9fd0' },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points along the track at an offset from the centre line, as an SVG polyline. */
function line(circuit: CircuitId, offset: number, every = 3): string {
  const path = trackPath(circuit);
  const out: string[] = [];
  for (let d = 0; d <= path.length + 0.01; d += every) {
    const p = pointAt(path, d, offset);
    out.push(`${p.x.toFixed(1)},${p.z.toFixed(1)}`);
  }
  return out.join(' ');
}

/** The scenery under the track, drawn once per circuit. */
function Scenery({ circuit, box }: { circuit: CircuitId; box: { x: number; y: number; w: number; h: number } }) {
  const path = trackPath(circuit);
  const b = trackBounds(path);
  const rnd = seeded(circuit.length * 97);
  const far = (x: number, z: number, min: number) => {
    for (let i = 0; i < path.xs.length; i += 6) if (Math.hypot(path.xs[i]! - x, path.zs[i]! - z) < min) return false;
    return true;
  };
  if (circuit === 'harbour') {
    const boats = Array.from({ length: 7 }, (_, i) => ({ x: b.minX + 12 + i * ((b.maxX - b.minX) / 7), z: b.maxZ + 20 + rnd() * 10 }));
    return (
      <g>
        <rect x={box.x} y={b.maxZ + 10} width={box.w} height={box.y + box.h - b.maxZ} fill="#1d4f86" />
        <rect x={box.x} y={b.maxZ + 9} width={box.w} height={1.6} fill="#6a7090" />
        {boats.map((p, i) => (
          <g key={i}>
            <rect x={p.x - 3} y={p.z - 1.1} width={6} height={2.2} rx={1} fill="#c84a4a" />
            <rect x={p.x - 1.6} y={p.z - 0.8} width={2} height={1.6} fill="#efe6d6" />
          </g>
        ))}
        <circle cx={b.maxX + 16} cy={(b.minZ + b.maxZ) / 2 - 4} r={2.4} fill="#f2ecf7" stroke="#d63a52" strokeWidth={0.8} />
        <circle cx={b.maxX + 16} cy={(b.minZ + b.maxZ) / 2 - 4} r={7} fill="#fff2b0" opacity={0.15} />
      </g>
    );
  }
  if (circuit === 'forest') {
    const trees: { x: number; z: number; r: number }[] = [];
    for (let i = 0; i < 900 && trees.length < 150; i++) {
      const x = box.x + rnd() * box.w;
      const z = box.y + rnd() * box.h;
      if (far(x, z, HALF + 4)) trees.push({ x, z, r: 1.6 + rnd() * 1.6 });
    }
    return (
      <g>
        {trees.map((t, i) => (
          <circle key={i} cx={t.x} cy={t.z} r={t.r} fill={i % 2 ? '#2c6e52' : '#1f5a45'} />
        ))}
      </g>
    );
  }
  const towers: { x: number; z: number; w: number; d: number }[] = [];
  for (let i = 0; i < 900 && towers.length < 40; i++) {
    const x = box.x + rnd() * box.w;
    const z = box.y + rnd() * box.h;
    if (far(x, z, 22)) towers.push({ x, z, w: 8 + rnd() * 10, d: 6 + rnd() * 10 });
  }
  return (
    <g>
      <rect x={b.minX - 17} y={b.minZ - 17} width={b.maxX - b.minX + 34} height={b.maxZ - b.minZ + 34} fill="#3b3850" stroke="#4c4862" strokeWidth={1.2} />
      {towers.map((t, i) => (
        <rect key={i} x={t.x - t.w / 2} y={t.z - t.d / 2} width={t.w} height={t.d} fill="#2a2440" stroke="#ffd98a" strokeOpacity={0.35} strokeWidth={0.5} strokeDasharray="1 2" />
      ))}
    </g>
  );
}

export interface MapProps {
  field: RallyField;
  circuit: CircuitId;
  items: [number, number, number][];
  got?: number[];
  label: string;
  /** The big screen: everyone named (a bunch shares one stacked list). */
  host?: boolean;
  /** A small map in a corner: no names, no scenery. */
  mini?: boolean;
  /** Time trial: only your own kart, and your ghost. */
  trial?: { ghost: number[] | null; lapStart: number } | null;
  /** Each kart's colour, the same as in 3D. */
  hueOf: (id: string) => number;
  gameNow: () => number;
  className?: string;
}

/** Re-render about a dozen times a second while mounted. */
function useFrames(ms: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last >= ms) {
        last = t;
        setN((n) => (n + 1) % 1_000_000);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ms]);
}

export function RallyMap({ field, circuit, items, got = [], label, host = false, mini = false, trial = null, hueOf, className = '' }: MapProps) {
  useFrames(mini ? 120 : 70);
  const now = field.update();
  const id = useId().replace(/[^\w-]/g, '');
  const path = trackPath(circuit);
  const pal = PALETTE[circuit];
  const b = trackBounds(path);
  const pad = mini ? 10 : 24;
  const box = { x: b.minX - pad, y: b.minZ - pad, w: b.maxX - b.minX + pad * 2, h: b.maxZ - b.minZ + pad * 2 };
  // A player's own map follows their kart, close enough to see the lanes and what lies ahead.
  const meNow = !host && !mini ? field.me() : null;
  let view = box;
  if (meNow) {
    const p = pointAt(path, meNow.d + 18, 0);
    view = { x: p.x - 55, y: p.z - 45, w: 110, h: 90 };
  }
  const lines = useMemo(
    () => ({ centre: line(circuit, 0), left: line(circuit, -LANE_WIDTH / 2), right: line(circuit, LANE_WIDTH / 2), lamps: [-1, 1].flatMap((side) => Array.from({ length: Math.floor(path.length / 9) }, (_, i) => pointAt(path, i * 9 + (side > 0 ? 4.5 : 0), side * (HALF + 2.2)))) }),
    [circuit, path],
  );
  const all = field.list();
  const me = all.find((k) => k.me) ?? null;
  const karts = (trial ? all.filter((k) => k.me) : all).sort((a, b) => Number(a.me) - Number(b.me) || (b.place || 0) - (a.place || 0));
  const r = mini ? 5 : host ? 3.4 : 2.2;
  // Names: yours always; on the big screen everyone's, with karts close together sharing one stacked list.
  const named = new Set<string>();
  const crowds: { x: number; y: number; lines: string[]; key: string }[] = [];
  if (!mini) {
    const others = karts.filter((k) => !k.me && host).map((k) => ({ k, p: lapPos(k.d, path.length) }));
    others.sort((a, b) => a.p - b.p);
    const clusters: { k: FieldKart; p: number }[][] = [];
    for (const o of others) {
      const last = clusters[clusters.length - 1];
      if (last && o.p - last[last.length - 1]!.p <= 14) last.push(o);
      else clusters.push([o]);
    }
    for (const c of clusters) {
      if (c.length === 1) named.add(c[0]!.k.id);
      else {
        const mid = pointAt(path, (c[0]!.p + c[c.length - 1]!.p) / 2, 0);
        const names = c.map(({ k }) => k.name).sort((a, b) => a.localeCompare(b));
        crowds.push({ key: c[0]!.k.id, x: mid.x, y: mid.z, lines: names.length > 5 ? [...names.slice(0, 4), `and ${names.length - 4} more`] : names });
      }
    }
  }
  let ghostAt: { x: number; z: number } | null = null;
  if (trial?.ghost && trial.ghost.length > 2 && me && me.d >= 0) {
    const f = (now - trial.lapStart) / 500;
    const i = Math.floor(f);
    if (i >= 0 && i + 1 < trial.ghost.length) {
      const a = trial.ghost[i]! / 10;
      let c = trial.ghost[i + 1]! / 10;
      if (c < a) c += path.length;
      const p = pointAt(path, a + (c - a) * (f - i), laneOffset(1));
      ghostAt = { x: p.x, z: p.z };
    }
  }

  return (
    <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio={meNow ? 'xMidYMid slice' : 'xMidYMid meet'} className={`block h-full w-full ${mini ? '' : 'rounded-[var(--radius-l)]'} ${className}`} style={{ background: pal.ground }} role="img" aria-label={label}>
      <defs>
        <radialGradient id={`${id}glow`}>
          <stop offset="0" stopColor={pal.lantern} stopOpacity="0.85" />
          <stop offset="1" stopColor={pal.lantern} stopOpacity="0" />
        </radialGradient>
      </defs>
      <g aria-hidden>
        <rect x={box.x - 200} y={box.y - 200} width={box.w + 400} height={box.h + 400} fill={pal.ground} />
        {!mini ? <Scenery circuit={circuit} box={box} /> : null}
        {/* Kerbs, road and lane lines. */}
        <polyline points={lines.centre} fill="none" stroke="#efeaff" strokeWidth={HALF * 2 + 1.8} strokeLinejoin="round" />
        <polyline points={lines.centre} fill="none" stroke={pal.edge} strokeWidth={HALF * 2 + 1.8} strokeDasharray="3 3" strokeLinejoin="round" />
        <polyline points={lines.centre} fill="none" stroke={pal.road} strokeWidth={HALF * 2} strokeLinejoin="round" />
        {!mini ? (
          <>
            <polyline points={lines.left} fill="none" stroke="#d9d4f0" strokeOpacity={0.6} strokeWidth={0.25} strokeDasharray="3 3" />
            <polyline points={lines.right} fill="none" stroke="#d9d4f0" strokeOpacity={0.6} strokeWidth={0.25} strokeDasharray="3 3" />
            {lines.lamps.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.z} r={1.6} fill={`url(#${id}glow)`} />
            ))}
          </>
        ) : null}
        {/* The start line. */}
        <line
          x1={pointAt(path, 0, -HALF).x}
          y1={pointAt(path, 0, -HALF).z}
          x2={pointAt(path, 0, HALF).x}
          y2={pointAt(path, 0, HALF).z}
          stroke="#f4f1ff"
          strokeWidth={1.6}
          strokeDasharray="0.8 0.8"
        />
        {/* Puddles, cones and lanterns. */}
        {!mini
          ? items.map(([at, lane, kind], i) => {
              const p = pointAt(path, at, laneOffset(lane));
              if (kind === 0) return <ellipse key={i} cx={p.x} cy={p.z} rx={1.3} ry={1.3} fill="#4fa8ff" opacity={0.85} />;
              if (kind === 1) return <path key={i} d={`M ${p.x} ${p.z - 1.2} L ${p.x + 1.1} ${p.z + 0.9} L ${p.x - 1.1} ${p.z + 0.9} Z`} fill="#ff7a2e" stroke="#f4f1ff" strokeWidth={0.3} />;
              const dim = got.includes(i);
              return (
                <g key={i} opacity={dim ? 0.3 : 1}>
                  <circle cx={p.x} cy={p.z} r={2.4} fill={`url(#${id}glow)`} />
                  <circle cx={p.x} cy={p.z} r={0.8} fill={pal.lantern} />
                </g>
              );
            })
          : null}
        {ghostAt ? <circle cx={ghostAt.x} cy={ghostAt.z} r={r} fill="#bfe8ff" opacity={0.45} stroke="#ffffff" strokeWidth={0.3} strokeDasharray="0.6 0.6" /> : null}
        {/* Karts: yours in gold, last so it sits on top. */}
        {karts.map((k) => {
          const p = pointAt(path, k.d, laneOffset(k.lane));
          const rr = k.me ? r * 1.35 : r;
          const nose = { x: p.x + Math.sin(p.heading) * rr * 1.3, y: p.z + Math.cos(p.heading) * rr * 1.3 };
          const boost = (k.flags & FLAG.boost) !== 0;
          const fill = k.me ? '#ffc233' : `hsl(${hueOf(k.teamId ?? k.id)} 72% 60%)`;
          return (
            <g key={k.id}>
              {boost ? <line x1={p.x} y1={p.z} x2={p.x - Math.sin(p.heading) * rr * 3.4} y2={p.z - Math.cos(p.heading) * rr * 3.4} stroke="#7fd8ff" strokeWidth={rr * 0.9} strokeLinecap="round" opacity={0.7} /> : null}
              {(k.flags & FLAG.shield) !== 0 ? <circle cx={p.x} cy={p.z} r={rr * 1.6} fill="none" stroke="#8fd3ff" strokeWidth={0.4} /> : null}
              <path d={`M ${nose.x} ${nose.y} L ${p.x + Math.cos(p.heading) * rr} ${p.z - Math.sin(p.heading) * rr} L ${p.x - Math.cos(p.heading) * rr} ${p.z + Math.sin(p.heading) * rr} Z`} fill={fill} stroke="#0b1020" strokeWidth={0.3} />
              <circle cx={p.x} cy={p.z} r={rr} fill={fill} stroke="#0b1020" strokeWidth={0.35} />
              {!mini ? (
                <text x={p.x} y={p.z + rr * 0.36} textAnchor="middle" fontSize={rr * 0.95} fontWeight={800} fill="#0b1020">
                  {initials(k.me ? 'You' : k.name)}
                </text>
              ) : null}
              {!mini && (k.me || named.has(k.id)) ? (
                <text x={p.x} y={p.z - rr - 1} textAnchor="middle" fontSize={k.me ? 3 : 2.4} fontWeight={700} fill={k.me ? '#ffc233' : '#fff'} stroke="#0b1020" strokeWidth={0.6} paintOrder="stroke">
                  {k.me ? 'You' : k.finished ? `${k.name.length > 12 ? `${k.name.slice(0, 11)}…` : k.name} (${ordinal(k.finished)})` : k.name.length > 14 ? `${k.name.slice(0, 13)}…` : k.name}
                </text>
              ) : null}
            </g>
          );
        })}
        {crowds.map((c) => (
          <text key={`crowd${c.key}`} x={c.x} y={c.y - 4 - (c.lines.length - 1) * 2.6} textAnchor="middle" fontSize={2.3} fontWeight={700} fill="#fff" stroke="#0b1020" strokeWidth={0.6} paintOrder="stroke">
            {c.lines.map((l, i) => (
              <tspan key={i} x={c.x} dy={i === 0 ? 0 : 2.6}>
                {l.length > 16 ? `${l.slice(0, 15)}…` : l}
              </tspan>
            ))}
          </text>
        ))}
      </g>
    </svg>
  );
}
