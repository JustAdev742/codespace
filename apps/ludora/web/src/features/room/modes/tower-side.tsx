import { useId } from 'react';
import { spotOf, stackNames, towerBlocks, type Block } from './tower-layout.ts';
import type { TowerView, TowerTogetherView } from './tower-together.tsx';

/*
 * Tower Together without 3D: the same tower drawn flat on its hill, from the
 * same view the 3D scene reads (tower-layout.ts). Timber in warm planks, stone
 * in cool blocks, lantern braces as glowing gold bands; the tower leans with
 * the gauge (drawn still, so it suits reduced motion too), the target and
 * star lines cross it, the sky warms towards dawn, and wind streaks show a
 * gust coming. One SVG, no animation beyond what the view changes.
 */

const W = 40;
const H = 30;
const GROUND = 26.2;
const TALL = 23;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function hueOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 36) * 10;
}

const mix = (a: [number, number, number], b: [number, number, number], k: number) => `rgb(${a.map((x, i) => Math.round(x + (b[i]! - x) * k)).join(',')})`;

function TowerDrawing({ t, cx, scale, lean, id, host, builders }: { t: TowerView; cx: number; scale: number; lean: number; id: string; host: boolean; builders: TowerTogetherView['builders'] }) {
  const blocks: Block[] = towerBlocks(t, 0.45 / scale);
  const y = (floors: number) => GROUND - floors * scale;
  // The tower leans with the gauge: more the higher up.
  const dx = (floors: number) => lean * Math.pow((floors * scale) / TALL, 1.6);
  const top = t.height;
  const mine = builders.filter((b) => b.tower === t.id);
  // Builders who share a place round the scaffold share one stacked tag.
  const spots = new Map<number, typeof mine>();
  for (const b of mine) {
    const s = spotOf(b.playerId) % 4;
    spots.set(s, [...(spots.get(s) ?? []), b]);
  }
  const lines = [
    { floors: t.target, label: `Target ${t.target.toLocaleString('en-GB')}`, strong: true },
    { floors: t.steps[1] ?? 0, label: '2 stars', strong: false },
    { floors: t.steps[2] ?? 0, label: '3 stars', strong: false },
  ];
  return (
    <g>
      {/* The plinth. */}
      <path d={`M ${cx - 3.4} ${GROUND + 0.6} L ${cx - 2.8} ${GROUND - 0.3} L ${cx + 2.8} ${GROUND - 0.3} L ${cx + 3.4} ${GROUND + 0.6} Z`} fill="#4a5370" stroke="#0b1020" strokeWidth={0.08} />
      {blocks.map((b, i) => {
        if (b.kind === 'lantern') {
          const yy = y(b.from);
          return (
            <g key={i}>
              <ellipse cx={cx + dx(b.from)} cy={yy} rx={4.2} ry={1.4} fill={`url(#${id}glow)`} />
              <rect x={cx + dx(b.from) - 2.2} y={yy - 0.22} width={4.4} height={0.44} rx={0.12} fill="#ffc233" stroke="#0b1020" strokeWidth={0.07} />
            </g>
          );
        }
        const y0 = y(b.from);
        const y1 = y(b.to);
        const w = b.kind === 'timber' ? 3.4 : 3.8;
        const x0 = cx + dx(b.from);
        const x1 = cx + dx(b.to);
        return (
          <g key={i}>
            <path d={`M ${x0 - w / 2} ${y0} L ${x1 - w / 2} ${y1} L ${x1 + w / 2} ${y1} L ${x0 + w / 2} ${y0} Z`} fill={b.kind === 'timber' ? `url(#${id}timber)` : `url(#${id}stone)`} stroke="#0b1020" strokeWidth={0.07} />
            {b.kind === 'timber' && y0 - y1 > 0.5 ? <line x1={x0 - w / 2 + 0.2} y1={y0 - 0.1} x2={x1 + w / 2 - 0.2} y2={y1 + 0.1} stroke="#5b3418" strokeWidth={0.12} /> : null}
          </g>
        );
      })}
      {/* The scaffold at the top. */}
      <rect x={cx + dx(top) - 2.9} y={y(top) - 0.12} width={5.8} height={0.24} rx={0.08} fill="#8a6038" />
      {/* Target and star lines. */}
      {t.target * scale > TALL + 0.6 ? (
        <text x={cx} y={GROUND - TALL - 1.4} textAnchor="middle" fontSize={0.85} fontWeight={700} fill="#ffc233" stroke="#0b1020" strokeWidth={0.14} paintOrder="stroke">
          ↑ Target {t.target.toLocaleString('en-GB')}: {Math.max(0, t.target - t.height).toLocaleString('en-GB')} to go
        </text>
      ) : null}
      {lines.map((l) =>
        l.floors > 0 && l.floors * scale <= TALL + 0.6 ? (
          <g key={l.label}>
            <line x1={cx - 4.4} y1={y(l.floors)} x2={cx + 4.4} y2={y(l.floors)} stroke={l.strong ? '#ffc233' : '#ffe08a'} strokeWidth={l.strong ? 0.14 : 0.08} strokeDasharray={l.strong ? '0.6 0.3' : '0.3 0.3'} opacity={l.strong ? 1 : 0.7} />
            <text x={cx + 4.6} y={y(l.floors) + 0.3} fontSize={l.strong ? 0.85 : 0.7} fontWeight={700} fill={l.strong ? '#ffc233' : '#ffe08a'} stroke="#0b1020" strokeWidth={0.14} paintOrder="stroke">
              {l.label}
            </text>
          </g>
        ) : null,
      )}
      {/* Builders round the top. */}
      {[...spots.entries()].map(([s, list]) => {
        const side = s % 2 === 0 ? -1 : 1;
        const row = s < 2 ? 0 : 1;
        const bx = cx + dx(top) + side * (2.4 + row * 1.3);
        const by = y(top) - 0.75;
        const you = list.find((b) => b.isYou);
        const others = list.filter((b) => !b.isYou);
        const r = host ? 0.55 : 0.5;
        const names = others.length >= 2 ? stackNames(others.map((b) => b.name), 4) : others.map((b) => (b.name.length > 14 ? `${b.name.slice(0, 13)}…` : b.name));
        return (
          <g key={s}>
            {list.slice(0, 3).map((b, i) => (
              <g key={b.playerId}>
                <circle cx={bx + side * i * 0.7} cy={by} r={r} fill={b.isYou ? '#ffc233' : `hsl(${hueOf(b.playerId)} 70% 62%)`} stroke="#0b1020" strokeWidth={0.08} />
                <text x={bx + side * i * 0.7} y={by + r * 0.36} textAnchor="middle" fontSize={r * 0.95} fontWeight={800} fill="#0b1020">
                  {initials(b.name)}
                </text>
              </g>
            ))}
            {you ? (
              <text x={bx} y={by - r - 0.3} textAnchor="middle" fontSize={0.85} fontWeight={800} fill="#ffc233" stroke="#0b1020" strokeWidth={0.16} paintOrder="stroke">
                You
              </text>
            ) : null}
            {names.length ? (
              <text x={bx + side * 0.3} y={by - r - (you ? 1.2 : 0.3) - (names.length - 1) * 0.72} textAnchor="middle" fontSize={0.62} fontWeight={700} fill="#fff" stroke="#0b1020" strokeWidth={0.16} paintOrder="stroke">
                {names.map((n, i) => (
                  <tspan key={i} x={bx + side * 0.3} dy={i === 0 ? 0 : 0.72}>
                    {n.length > 16 ? `${n.slice(0, 15)}…` : n}
                  </tspan>
                ))}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

export function SideView({ view, label, dawn, host = false }: { view: TowerTogetherView; label: string; dawn: number; host?: boolean }) {
  const id = useId().replace(/:/g, '');
  const k = Math.pow(Math.max(0, Math.min(1, dawn)), 1.6);
  const n = view.towers.length;
  const wind = view.gust?.announced ? view.gust : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax meet" className="block h-full w-full rounded-[var(--radius-l)] bg-[#0b1233]" role="img" aria-label={label}>
      <defs>
        <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix([7, 11, 36], [31, 63, 122], k)} />
          {/* Through blue, never through purple: the horizon lightens first, then warms in the last stretch. */}
          <stop offset="1" stopColor={k < 0.55 ? mix([29, 42, 92], [63, 106, 168], k / 0.55) : mix([63, 106, 168], [244, 191, 92], (k - 0.55) / 0.45)} />
        </linearGradient>
        <pattern id={`${id}timber`} width="4" height="0.8" patternUnits="userSpaceOnUse">
          <rect width="4" height="0.8" fill="#b7743d" />
          <rect y="0.4" width="4" height="0.4" fill="#a5652f" />
          <line x1="0" y1="0.4" x2="4" y2="0.4" stroke="#5b3418" strokeWidth="0.05" />
        </pattern>
        <pattern id={`${id}stone`} width="2" height="1" patternUnits="userSpaceOnUse">
          <rect width="2" height="1" fill="#7f8aa6" />
          <path d="M0 0.5 H2 M1 0 V0.5 M0 0.5 V1 M2 0.5 V1" stroke="#3e4660" strokeWidth="0.07" />
        </pattern>
        <radialGradient id={`${id}glow`}>
          <stop offset="0" stopColor="#ffc27a" stopOpacity="0.7" />
          <stop offset="1" stopColor="#ffc27a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g aria-hidden>
        {/* Wider than the picture, so a stage of any shape is filled edge to edge. */}
        <rect x={-60} y={-20} width={160} height={H + 40} fill={`url(#${id}sky)`} />
        <circle cx={7} cy={4 + k * 9} r={1.4} fill="#f3efe0" opacity={1 - k * 0.5} />
        {Array.from({ length: 24 }, (_, i) => (
          <circle key={i} cx={(i * 13.7) % W} cy={(i * 7.3) % 14} r={0.08} fill="#dfe6ff" opacity={(1 - k) * 0.8} />
        ))}
        <path d={`M -60 ${GROUND - 1} Q 0 ${GROUND - 4} 20 ${GROUND - 2.4} Q 40 ${GROUND - 1} 100 ${GROUND - 2} L 100 ${H + 20} L -60 ${H + 20} Z`} fill="#16234a" />
        <path d={`M -60 ${GROUND + 1.6} Q 20 ${GROUND - 1.4} 100 ${GROUND + 1.6} L 100 ${H + 20} L -60 ${H + 20} Z`} fill="#1f4a40" />
        {view.towers.map((t, i) => {
          const cx = n === 1 ? W / 2 : W / 2 + (i - (n - 1) / 2) * 15;
          // Drawn to the tower, so it fills the picture from the start; a target above it is marked at the top edge.
          const scale = TALL / Math.max(t.height * 1.2, t.target * 0.15, 10);
          const lean = (t.sway / 100) * 2.2;
          return <TowerDrawing key={t.id} t={t} cx={cx} scale={scale} lean={lean} id={id} host={host} builders={view.builders} />;
        })}
        {/* Wind coming: streaks across the sky, more for a stronger gust. */}
        {wind
          ? Array.from({ length: wind.limit !== null && wind.limit <= 25 ? 14 : wind.limit !== null && wind.limit <= 45 ? 10 : 6 }, (_, i) => {
              const yy = 2 + ((i * 5.3) % 20);
              const xx = 1 + ((i * 11.7) % (W - 8));
              return <line key={`w${i}`} x1={xx} y1={yy} x2={xx + 3 + (i % 3)} y2={yy} stroke="#e6eeff" strokeWidth={0.12} strokeLinecap="round" opacity={0.6} />;
            })
          : null}
      </g>
    </svg>
  );
}
