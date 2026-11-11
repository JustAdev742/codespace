import { useId, type ReactNode } from 'react';
import { PLANTS, PLOT_GAP, cellOf, columnsFor, rowsFor, type PlotView } from '@ludora/engine/glim-garden';
import { stageOf } from './glim-garden-words.ts';

/*
 * Glim Garden without 3D: the same garden drawn flat, seen from above and a
 * little in front, plot for plot in the same grid as the 3D scene (both read
 * the mode's layout). Each bed shows its plant at its stage, drooping or in
 * lantern light, the ring of earlier blooms round its edge, and its
 * fireflies; a glowing plot shines gold. On a phone it is centred on your own
 * plot and its neighbours; on the big screen it shows every garden whole.
 * Also the picture on the results screen.
 */

export interface MapGarden {
  teamId: string | null;
  name?: string | null;
  plots: PlotView[];
}

const CELL = PLOT_GAP * 10;
const BED_W = 25;
const BED_H = 17;
/** Space between team gardens, in cells. */
const GARDEN_GAP = 1.4;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A flower's colour, from its owner: warm pinks, corals, violets and golds that read on the dark. */
export function petalHue(id: string): number {
  const hues = [330, 350, 10, 280, 300, 45, 200, 260];
  return hues[hash(id) % hues.length]!;
}

/** Where each garden starts, in cells, laid side by side. */
function gardenOffsets(gardens: MapGarden[]): number[] {
  const out: number[] = [];
  let x = 0;
  for (const g of gardens) {
    out.push(x);
    x += columnsFor(g.plots.length) + GARDEN_GAP;
  }
  return out;
}

/** The centre of a plot's bed in picture units. */
function bedCentre(i: number, n: number, offset: number): { x: number; y: number } {
  const { col, row } = cellOf(i, n);
  const rows = rowsFor(n);
  // Row 0 is the front: drawn at the bottom.
  return { x: (offset + col + 0.5) * CELL, y: (rows - 1 - row + 0.5) * CELL };
}

function Plant({ p, asleep }: { p: PlotView; asleep: boolean }) {
  const stage = stageOf(p);
  if (stage === 'bare') return null;
  const droop = p.d ? 'rotate(24)' : '';
  const leaf = p.d ? '#6f7d48' : '#3fae5c';
  const leafDark = p.d ? '#56613a' : '#2a8546';
  const need = PLANTS[p.k!].need;
  const k = p.b ? 1 : Math.min(1, (p.g + 1) / need);
  if (stage === 'seed') {
    return (
      <g>
        <ellipse cx="0" cy="0" rx="4" ry="1.8" fill="#4a2f1f" />
        <path d="M0 -0.5 q -0.5 -2.6 1.6 -3.2" stroke={leaf} strokeWidth="1" fill="none" strokeLinecap="round" />
      </g>
    );
  }
  if (p.k === 'flower') {
    const h = 5 + k * 6;
    const hue = petalHue(p.id);
    const open = p.b && !asleep;
    return (
      <g transform={droop}>
        <path d={`M0 0 L0 ${-h}`} stroke={leafDark} strokeWidth="1.1" strokeLinecap="round" />
        <ellipse cx="-2" cy={-h * 0.45} rx="2.2" ry="1" fill={leaf} transform={`rotate(-30 -2 ${-h * 0.45})`} />
        <ellipse cx="2" cy={-h * 0.3} rx="2.2" ry="1" fill={leaf} transform={`rotate(30 2 ${-h * 0.3})`} />
        {open ? (
          <g transform={`translate(0 ${-h})`}>
            {[0, 72, 144, 216, 288].map((a) => (
              <ellipse key={a} cx="0" cy="-2.4" rx="1.8" ry="2.6" fill={`hsl(${hue} 85% 66%)`} transform={`rotate(${a})`} />
            ))}
            <circle r="1.5" fill="#ffd24a" />
          </g>
        ) : stage === 'bud' || stage === 'bloom' ? (
          <ellipse cx="0" cy={-h - 1} rx="1.4" ry="2.2" fill={`hsl(${hue} 70% ${asleep ? 40 : 55}%)`} />
        ) : null}
      </g>
    );
  }
  if (p.k === 'bush') {
    const r = 3 + k * 4.2;
    return (
      <g transform={droop}>
        <ellipse cx="0" cy={-r * 0.8} rx={r * 1.15} ry={r * 0.85} fill={leafDark} />
        <circle cx={-r * 0.45} cy={-r * 0.95} r={r * 0.6} fill={leaf} />
        <circle cx={r * 0.4} cy={-r * 1.05} r={r * 0.55} fill={leaf} />
        {p.b
          ? [-0.6, -0.1, 0.45, 0.15, -0.35].map((dx, i) => <circle key={i} cx={dx * r} cy={-r * (0.7 + (i % 3) * 0.3)} r="1.1" fill={i % 2 ? '#fff4f8' : '#ff8fb8'} />)
          : stage === 'bud'
            ? [-0.4, 0.3].map((dx, i) => <circle key={i} cx={dx * r} cy={-r * 1.1} r="0.8" fill="#e98bb0" />)
            : null}
      </g>
    );
  }
  // Lantern tree.
  const h = 6 + k * 9;
  const r = 2.5 + k * 4;
  const lit = p.b && !asleep;
  return (
    <g transform={droop}>
      <rect x="-0.9" y={-h} width="1.8" height={h} rx="0.6" fill="#6b4a2f" />
      <circle cx="0" cy={-h} r={r} fill={leafDark} />
      <circle cx={-r * 0.35} cy={-h - r * 0.25} r={r * 0.65} fill={leaf} />
      {stage === 'bud' || p.b
        ? [-0.6, 0.55, 0, -0.2].map((dx, i) => (
            <g key={i}>
              {lit ? <circle cx={dx * r} cy={-h + r * (0.3 + (i % 2) * 0.3)} r="2.6" fill="#ffd36b" opacity="0.35" /> : null}
              <circle cx={dx * r} cy={-h + r * (0.3 + (i % 2) * 0.3)} r="1.1" fill={lit ? '#ffd36b' : '#8a7a52'} />
            </g>
          ))
        : null}
    </g>
  );
}

function Bed({ p, at, need, you, near, name, showName, asleep, glowId, lightId, big }: { p: PlotView; at: { x: number; y: number }; need: number; you: boolean; near: boolean; name: string; showName: boolean; asleep: boolean; glowId: string; lightId: string; big: boolean }) {
  const glowing = p.j >= need;
  const flies = Math.min(10, p.j);
  const h = hash(p.id);
  const ring: string[] = [];
  const [f, b, t] = p.r;
  for (let i = 0; i < f; i++) ring.push('flower');
  for (let i = 0; i < b; i++) ring.push('bush');
  for (let i = 0; i < t; i++) ring.push('tree');
  const shown = ring.slice(0, 14);
  return (
    <g transform={`translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`}>
      {glowing ? <ellipse cx="0" cy="1" rx={BED_W * 0.85} ry={BED_H * 0.95} fill={`url(#${glowId})`} /> : null}
      {p.l ? <ellipse cx="0" cy="0" rx={BED_W * 0.7} ry={BED_H * 0.7} fill={`url(#${lightId})`} /> : null}
      {/* The bed: a raised box of earth with a lit rim. */}
      <rect x={-BED_W / 2} y={-BED_H / 2 + 1.5} width={BED_W} height={BED_H} rx="3" fill="#2a1a12" />
      <rect x={-BED_W / 2} y={-BED_H / 2} width={BED_W} height={BED_H} rx="3" fill={you ? '#6e4a2c' : '#5a3c26'} stroke={you ? 'var(--lantern)' : near ? 'rgb(255 255 255 / 0.55)' : 'rgb(0 0 0 / 0.25)'} strokeWidth={you ? 1.4 : near ? 0.8 : 0.5} strokeDasharray={near && !you ? '2 1.6' : undefined} />
      <rect x={-BED_W / 2 + 2} y={-BED_H / 2 + 2} width={BED_W - 4} height={BED_H - 4} rx="2" fill="#4a3020" />
      {/* Earlier blooms, round the edge. */}
      {shown.map((kind, i) => {
        const side = i % 2 ? 1 : -1;
        const along = Math.floor(i / 2);
        const x = side * (BED_W / 2 - 1.4);
        const y = -BED_H / 2 + 2.2 + along * 2.1;
        return <circle key={i} cx={x} cy={Math.min(BED_H / 2 - 1.5, y)} r={kind === 'tree' ? 1.2 : 0.95} fill={kind === 'flower' ? `hsl(${petalHue(p.id)} 85% 68%)` : kind === 'bush' ? '#ff9cc2' : '#ffd36b'} />;
      })}
      <g transform={`translate(0 ${BED_H * 0.22})`}>
        <Plant p={p} asleep={asleep} />
      </g>
      {/* Fireflies at this plot. */}
      {Array.from({ length: flies }, (_, i) => {
        const a = ((h >>> (i % 16)) % 360) * (Math.PI / 180) + i * 2.1;
        const rr = 6 + ((h >>> (i + 3)) % 7);
        const x = Math.cos(a) * rr * 1.25;
        const y = -6 + Math.sin(a) * rr * 0.6 - (i % 3) * 2;
        return (
          <g key={i} className="garden-fly" style={{ animationDelay: `${(i * 0.37) % 2.4}s` }}>
            <circle cx={x} cy={y} r="1.9" fill="#ffe27a" opacity="0.28" />
            <circle cx={x} cy={y} r="0.7" fill="#fff6c4" />
          </g>
        );
      })}
      {p.d ? <text x={BED_W / 2 - 2} y={-BED_H / 2 + 4} fontSize="4.5" textAnchor="end" fill="#ffb4a8" fontWeight="700" aria-hidden>!</text> : null}
      {showName ? (
        <g transform={`translate(0 ${BED_H / 2 + (big ? 5.2 : 4.6)})`}>
          <rect x={-BED_W / 2 - 2} y={big ? -3.6 : -3.3} width={BED_W + 4} height={big ? 5.6 : 5} rx="2.4" fill={you ? 'var(--lantern)' : 'rgb(8 12 32 / 0.78)'} />
          <text x="0" y={big ? 0.9 : 0.8} fontSize={big ? 3.9 : 3.5} textAnchor="middle" fill={you ? 'var(--on-accent)' : '#fff'} fontWeight="700">
            {you ? 'You' : name.length > 13 ? `${name.slice(0, 12)}…` : name}
          </text>
        </g>
      ) : null}
    </g>
  );
}

/**
 * The drawn garden. `me` centres a phone's view on that player's plot; with
 * no `me` every garden is shown whole. `label` is what a screen reader hears.
 */
export function GardenMap({ gardens, need, me = null, names, dark = true, nightBloom = false, label, big = false, className = '', children }: { gardens: MapGarden[]; need: number; me?: string | null; names: (id: string) => string; dark?: boolean; nightBloom?: boolean; label: string; big?: boolean; className?: string; children?: ReactNode }) {
  const id = useId().replace(/:/g, '');
  const offsets = gardenOffsets(gardens);
  const totalCols = offsets.length ? offsets[offsets.length - 1]! + columnsFor(gardens[gardens.length - 1]!.plots.length) : 1;
  const maxRows = Math.max(1, ...gardens.map((g) => rowsFor(g.plots.length)));
  let mineAt: { x: number; y: number } | null = null;
  let near: string[] = [];
  gardens.forEach((g, gi) => {
    const i = g.plots.findIndex((p) => p.id === me);
    if (i < 0) return;
    mineAt = bedCentre(i, g.plots.length, offsets[gi]!);
    const mineRow = cellOf(i, g.plots.length);
    near = g.plots.filter((_, j) => j !== i && Math.abs(cellOf(j, g.plots.length).col - mineRow.col) <= 1.01 && Math.abs(cellOf(j, g.plots.length).row - mineRow.row) <= 1).map((p) => p.id);
  });
  const W = totalCols * CELL;
  const H = maxRows * CELL;
  // A phone looks at its own plot and the plots round it; the big screen sees everything, with a pond beside.
  const at = mineAt as { x: number; y: number } | null;
  const view = at ? { x: at.x - CELL * 1.75, y: at.y - CELL * 1.25, w: CELL * 3.5, h: CELL * 2.5 } : { x: -CELL * 0.4, y: -CELL * 0.55, w: W + CELL * 0.8 + CELL * 1.2, h: H + CELL * 0.9 };
  const day = nightBloom && !dark;
  const wideNames = !at && gardens.reduce((n, g) => n + g.plots.length, 0) <= 40;
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <svg viewBox={`${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`} className="block h-full w-full" role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* Fireflies twinkle, unless the device asked for less motion. */}
          <style>{'@media (prefers-reduced-motion: no-preference) { .garden-fly { animation: garden-fly 2.4s ease-in-out infinite alternate; } } @keyframes garden-fly { from { opacity: 1; } to { opacity: 0.35; } }'}</style>
          <radialGradient id={`${id}g`}>
            <stop offset="0" stopColor="#ffd25a" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffd25a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}l`}>
            <stop offset="0" stopColor="#ffb85a" stopOpacity="0.4" />
            <stop offset="1" stopColor="#ffb85a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={day ? '#3f6fb8' : '#0c1636'} />
            <stop offset="1" stopColor={day ? '#5e8f4a' : '#13301f'} />
          </linearGradient>
          <radialGradient id={`${id}p`}>
            <stop offset="0" stopColor={day ? '#5fa8d8' : '#1d3f78'} />
            <stop offset="1" stopColor={day ? '#3e7fb0' : '#10264f'} />
          </radialGradient>
        </defs>
        {/* Grass, with paths between the beds. */}
        <rect x={view.x - CELL} y={view.y - CELL} width={view.w + CELL * 2} height={view.h + CELL * 2} fill={`url(#${id}s)`} />
        {/* Trees and hedges behind the garden, a gravel path round it, then the lawn with tufts of grass. */}
        {Array.from({ length: Math.max(3, Math.round(totalCols * 1.4)) }, (_, i) => {
          const x = -CELL * 0.3 + (i / Math.max(1, Math.round(totalCols * 1.4) - 1)) * (W + CELL * 0.6);
          const r = 9 + ((i * 37) % 7);
          return (
            <g key={`t${i}`}>
              <rect x={x - 1.2} y={-CELL * 0.45} width="2.4" height={r * 0.9} fill={day ? '#6b4a2f' : '#3a2a1e'} />
              <circle cx={x} cy={-CELL * 0.45} r={r} fill={day ? (i % 2 ? '#3f8a45' : '#357a3c') : i % 2 ? '#1f4a2c' : '#1a3f26'} />
            </g>
          );
        })}
        <rect x={-CELL * 0.32} y={-CELL * 0.32} width={W + CELL * 0.64} height={H + CELL * 0.64} rx="9" fill={day ? '#b5a789' : '#4c4638'} />
        <rect x={-CELL * 0.2} y={-CELL * 0.2} width={W + CELL * 0.4} height={H + CELL * 0.4} rx="6" fill={day ? '#4f7f3c' : '#1d4228'} />
        {Array.from({ length: Math.max(24, Math.round(totalCols * maxRows * 6)) }, (_, i) => {
          const x = ((i * 53) % 97) / 97;
          const y = ((i * 31) % 89) / 89;
          const tx = -CELL * 0.15 + x * (W + CELL * 0.3);
          const ty = -CELL * 0.15 + y * (H + CELL * 0.3);
          return <path key={`g${i}`} d={`M${tx.toFixed(1)} ${ty.toFixed(1)} l-0.6 -1.5 M${tx.toFixed(1)} ${ty.toFixed(1)} l0.1 -1.9 M${tx.toFixed(1)} ${ty.toFixed(1)} l0.7 -1.4`} stroke={day ? '#6aa252' : '#2f6a3c'} strokeWidth="0.6" strokeLinecap="round" />;
        })}
        {gardens.map((g, gi) =>
          g.name ? (
            <text key={`n${gi}`} x={(offsets[gi]! + columnsFor(g.plots.length) / 2) * CELL} y={-CELL * 0.27} textAnchor="middle" fontSize="5.5" fontWeight="800" fill="#fff">
              {g.name}
            </text>
          ) : null,
        )}
        {/* The pond, beside the garden on the big screen. */}
        {!at ? (
          <g>
            <ellipse cx={W + CELL * 0.75} cy={H / 2} rx={CELL * 0.55} ry={Math.min(H / 2.2, CELL * 1.1)} fill={`url(#${id}p)`} />
            <ellipse cx={W + CELL * 0.62} cy={H / 2 - 4} rx="3" ry="1.2" fill="#3fae5c" />
            <circle cx={W + CELL * 0.85} cy={H / 2 + 6} r="1.4" fill="#ff9cc2" />
          </g>
        ) : null}
        {gardens.map((g, gi) =>
          g.plots.map((p, i) => {
            const pos = bedCentre(i, g.plots.length, offsets[gi]!);
            const you = p.id === me;
            const isNear = near.includes(p.id);
            return <Bed key={p.id} p={p} at={pos} need={need} you={you} near={isNear} name={names(p.id)} showName={you || isNear || wideNames} asleep={day && p.k === 'flower'} glowId={`${id}g`} lightId={`${id}l`} big={big} />;
          }),
        )}
        {!day ? <circle cx={view.x + view.w - 9} cy={view.y + 8} r="4" fill="#f4f1d8" opacity="0.9" /> : <circle cx={view.x + view.w - 9} cy={view.y + 8} r="5" fill="#ffd25a" />}
      </svg>
      {children}
    </div>
  );
}
