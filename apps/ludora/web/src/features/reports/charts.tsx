import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** The width of a box in CSS pixels, kept up to date, so a chart is drawn at its real size (text never stretches). */
function useWidth(fallback: number) {
  const ref = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.round(el.clientWidth)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/*
 * Charts for reports, drawn in SVG with the theme's tokens so they follow the day and night
 * themes and a school's own look. Each chart is a picture for sighted readers only
 * (aria-hidden); the same numbers are always in a table or list next to it, which is what
 * screen readers read and what is printed.
 */

export interface Bar {
  key: string;
  /** Short label under the bar ("9 Nov"). */
  label: string;
  value: number;
  /** A second value drawn as a dot on a 0-1 scale (accuracy), or null for none. */
  rate?: number | null;
}

/**
 * Bars (a count, such as games a week) with an optional line of dots on a 0-100% scale
 * (accuracy). Scales to its box; labels thin out when there are many bars.
 */
export function BarLineChart({ bars, barName, rateName, height = 180 }: { bars: Bar[]; barName: string; rateName?: string; height?: number }) {
  const { ref, width: w } = useWidth(640);
  const top = 24;
  const bottom = 26;
  const plot = height - top - bottom;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const step = w / Math.max(1, bars.length);
  // Room for a label every 56 pixels or so.
  const every = Math.max(1, Math.ceil((bars.length * 56) / w));
  const pts = bars.map((b, i) => (b.rate === null || b.rate === undefined ? null : ([i * step + step / 2, top + plot * (1 - b.rate)] as const)));
  const path = pts
    .map((p, i) => (p ? `${i === 0 || !pts[i - 1] ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}` : ''))
    .filter(Boolean)
    .join(' ');
  return (
    <figure className="m-0" aria-hidden ref={ref as React.RefObject<HTMLElement>}>
      <svg viewBox={`0 0 ${w} ${height}`} width={w} height={height} className="block max-w-full" role="presentation">
        {[0, 0.5, 1].map((g) => (
          <line key={g} x1={0} x2={w} y1={top + plot * (1 - g)} y2={top + plot * (1 - g)} stroke="var(--line)" strokeWidth={1} strokeDasharray={g === 0 ? undefined : '3 4'} />
        ))}
        {bars.map((b, i) => {
          const h = (b.value / max) * plot;
          const bw = Math.min(step * 0.6, 48);
          const x = i * step + (step - bw) / 2;
          return (
            <g key={b.key}>
              <rect x={x} y={top + plot - h} width={bw} height={Math.max(0, h)} rx={3} fill="var(--floodlight)" />
              {b.value ? (
                <text x={x + bw / 2} y={top + plot - h - 5} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text)">
                  {b.value}
                </text>
              ) : null}
              {i % every === 0 ? (
                <text x={i * step + step / 2} y={height - 8} textAnchor="middle" fontSize={10.5} fill="var(--text-3)">
                  {b.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {path ? <path d={path} fill="none" stroke="var(--lantern)" strokeWidth={2.5} strokeLinejoin="round" /> : null}
        {pts.map((p, i) => (p ? <circle key={bars[i]!.key} cx={p[0]} cy={p[1]} r={4} fill="var(--lantern)" stroke="var(--bg-raised)" strokeWidth={1.5} /> : null))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-[var(--floodlight)]" /> {barName}
        </span>
        {rateName ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full bg-lantern" /> {rateName} (top line 100%, dashed line 50%)
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

/** A small run of right-first-time rates, oldest first, as a sparkline of dots. */
export function Sparkline({ rates, label }: { rates: number[]; label: string }) {
  if (rates.length < 2) return null;
  const w = 88;
  const h = 26;
  const step = w / (rates.length - 1);
  const pts = rates.map((r, i) => [i * step, 3 + (h - 6) * (1 - r)] as const);
  return (
    <svg viewBox={`-4 0 ${w + 8} ${h}`} width={w + 8} height={h} aria-hidden data-label={label} className="shrink-0">
      <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="var(--line)" strokeDasharray="2 3" />
      <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} fill="none" stroke="var(--floodlight)" strokeWidth={2} />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill="var(--floodlight)" />
      ))}
    </svg>
  );
}

/** Two rates side by side (before and after), as paired bars with their numbers. */
export function PairBars({ before, after }: { before: number; after: number }) {
  const bar = (r: number, tone: string) => (
    <span className="h-2.5 w-24 overflow-hidden rounded-[var(--radius-s)] bg-sunken shadow-[inset_0_0_0_1px_var(--line)]" aria-hidden>
      <span className={`block h-full rounded-[var(--radius-s)] ${tone}`} style={{ width: `${Math.round(r * 100)}%` }} />
    </span>
  );
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2 text-xs text-text-2">
        {bar(before, 'bg-[var(--text-3)]')}
        <span className="tabular">Before {Math.round(before * 100)}%</span>
      </span>
      <span className="flex items-center gap-2 text-xs font-semibold text-text">
        {bar(after, 'bg-[var(--floodlight)]')}
        <span className="tabular">After {Math.round(after * 100)}%</span>
      </span>
    </span>
  );
}

/** A labelled card used for lists on phones in place of a table row. */
export function CardList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {children}
    </ul>
  );
}
