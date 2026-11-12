import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Eraser, PaintBucket, Pencil, Stamp, Trash2 } from 'lucide-react';
import { PAINT_COLOURS, PAINT_SIZE, STAMPS, decodePaint, emptyPaint, encodePaint, floodFill, isBlankPaint, paintAt, stampAt, type PaintCell, type StampId, type Symmetry } from '@ludora/shared';
import { Button } from '../../ui/Button.tsx';

/*
 * The painter: a 12 by 12 grid filled with colours from the design's own palette, for markings on a
 * Glim and emblems on items. Pen, fill, eraser and stamps, with mirror symmetry. Stored as a short
 * string and drawn by Ludora. Works by pointer (drag to paint, on a phone too) and by keyboard
 * (arrow keys move, Space or Enter paints, 1 to 5 pick a colour, 0 the eraser).
 */

type Tool = 'pen' | 'fill' | 'erase' | 'stamp';

const TOOLS: { id: Tool; label: string; icon: typeof Pencil }[] = [
  { id: 'pen', label: 'Pen', icon: Pencil },
  { id: 'fill', label: 'Fill', icon: PaintBucket },
  { id: 'erase', label: 'Eraser', icon: Eraser },
  { id: 'stamp', label: 'Stamp', icon: Stamp },
];

const SYMMETRY: { id: Symmetry; label: string }[] = [
  { id: 'none', label: 'Off' },
  { id: 'mirror', label: 'Left and right' },
  { id: 'quad', label: 'Four ways' },
];

const STAMP_LABEL: Record<StampId, string> = { spot: 'Spot', heart: 'Heart', star: 'Star', stripe: 'Stripe', zigzag: 'Zigzag', diamond: 'Diamond' };

export interface PainterProps {
  value: string | undefined;
  /** A new grid; `group` merges one stroke into a single undo step. */
  onChange: (paint: string | undefined, group?: string) => void;
  /** CSS colours for cells 1 to 5, in the design's palette. */
  palette: readonly [string, string, string, string, string];
  /** Names for the colours, read out by screen readers. Defaults to the Glim palette's names. */
  colourNames?: readonly string[];
  label: string;
}

function Swatch({ colour, on }: { colour: string | null; on: boolean }) {
  return (
    <span
      className={`block size-7 rounded-full border-2 ${on ? 'border-text shadow-[0_0_0_2px_var(--surface)]' : 'border-line-strong'}`}
      style={colour ? { background: colour } : { background: 'repeating-conic-gradient(var(--surface-3) 0 25%, var(--surface) 0 50%) 50% / 10px 10px' }}
      aria-hidden
    />
  );
}

export function Painter({ value, onChange, palette, colourNames, label }: PainterProps) {
  const cells = useMemo(() => (value ? decodePaint(value) : null) ?? emptyPaint(), [value]);
  const [tool, setTool] = useState<Tool>('pen');
  const [colour, setColour] = useState<PaintCell>(2);
  const [sym, setSym] = useState<Symmetry>('mirror');
  const [stamp, setStamp] = useState<StampId>('spot');
  const [cursor, setCursor] = useState(PAINT_SIZE * 5 + 5);
  const stroke = useRef<{ id: string; last: number; cells: PaintCell[] } | null>(null);
  const strokeN = useRef(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const names = colourNames ?? PAINT_COLOURS.map((c) => c.label);
  const cellName = (v: PaintCell) => (v ? names[v - 1]! : 'empty');

  const emit = useCallback((next: PaintCell[], group?: string) => onChange(next.every((c) => c === 0) ? undefined : encodePaint(next), group), [onChange]);

  /** Apply the current tool at a cell, on top of `base`. */
  const apply = (base: PaintCell[], i: number): PaintCell[] => {
    const x = i % PAINT_SIZE;
    const y = Math.floor(i / PAINT_SIZE);
    if (tool === 'fill') return floodFill(base, x, y, colour, sym);
    if (tool === 'stamp') return stampAt(base, x, y, stamp, colour, sym);
    return paintAt(base, x, y, tool === 'erase' ? 0 : colour, sym);
  };

  const cellAt = (e: PointerEvent): number | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const i = el instanceof HTMLElement ? el.dataset.cell : undefined;
    return i === undefined ? null : Number(i);
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const i = cellAt(e);
    if (i === null) return;
    e.preventDefault();
    gridRef.current?.setPointerCapture(e.pointerId);
    const id = `paint-${++strokeN.current}`;
    const next = apply(cells, i);
    stroke.current = { id, last: i, cells: next };
    setCursor(i);
    emit(next, id);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = stroke.current;
    if (!s || tool === 'fill' || tool === 'stamp') return;
    const i = cellAt(e);
    if (i === null || i === s.last) return;
    s.last = i;
    s.cells = apply(s.cells, i);
    emit(s.cells, s.id);
  };
  const onUp = () => {
    stroke.current = null;
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const x = cursor % PAINT_SIZE;
    const y = Math.floor(cursor / PAINT_SIZE);
    const move = (nx: number, ny: number) => {
      const i = Math.max(0, Math.min(PAINT_SIZE - 1, ny)) * PAINT_SIZE + Math.max(0, Math.min(PAINT_SIZE - 1, nx));
      setCursor(i);
      (gridRef.current?.querySelector(`[data-cell="${i}"]`) as HTMLElement | null)?.focus();
    };
    if (e.key === 'ArrowRight') move(x + 1, y);
    else if (e.key === 'ArrowLeft') move(x - 1, y);
    else if (e.key === 'ArrowDown') move(x, y + 1);
    else if (e.key === 'ArrowUp') move(x, y - 1);
    else if (e.key === 'Home') move(0, y);
    else if (e.key === 'End') move(PAINT_SIZE - 1, y);
    else if (e.key === ' ' || e.key === 'Enter') emit(apply(cells, cursor), `paint-${++strokeN.current}`);
    else if (/^[0-5]$/.test(e.key)) {
      const v = Number(e.key) as PaintCell;
      if (v === 0) setTool('erase');
      else {
        setColour(v);
        if (tool === 'erase') setTool('pen');
      }
    } else return;
    e.preventDefault();
  };

  const toolName = tool === 'stamp' ? `${STAMP_LABEL[stamp]} stamp` : tool === 'erase' ? 'Eraser' : tool === 'fill' ? 'Fill' : 'Pen';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Tool</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tool">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={tool === t.id}
                onClick={() => setTool(t.id)}
                className={`flex min-h-11 items-center gap-1.5 rounded-[var(--radius-m)] border px-3 text-sm font-semibold ${tool === t.id ? 'border-lantern bg-lantern/15 text-text' : 'border-line bg-raised text-text-2'}`}
              >
                <t.icon className="size-4" aria-hidden />
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Colour</legend>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Colour">
            {palette.map((c, i) => {
              const v = (i + 1) as PaintCell;
              const on = colour === v && tool !== 'erase';
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${names[i]} (key ${v})`}
                  title={names[i]}
                  onClick={() => {
                    setColour(v);
                    if (tool === 'erase') setTool('pen');
                  }}
                  className="grid size-11 place-items-center rounded-full"
                >
                  <Swatch colour={c} on={on} />
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Mirror</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Mirror">
            {SYMMETRY.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={sym === s.id} onClick={() => setSym(s.id)} className={`min-h-11 rounded-[var(--radius-m)] border px-3 text-sm font-semibold ${sym === s.id ? 'border-lantern bg-lantern/15 text-text' : 'border-line bg-raised text-text-2'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </fieldset>
        {tool === 'stamp' ? (
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">Stamp</legend>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Stamp">
              {(Object.keys(STAMPS) as StampId[]).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={stamp === s} onClick={() => setStamp(s)} className={`flex min-h-11 items-center gap-1.5 rounded-[var(--radius-m)] border px-2.5 text-sm font-semibold ${stamp === s ? 'border-lantern bg-lantern/15 text-text' : 'border-line bg-raised text-text-2'}`}>
                  <StampIcon id={s} />
                  {STAMP_LABEL[s]}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>
      <div
        ref={gridRef}
        role="grid"
        aria-label={`${label}. ${toolName}, ${tool === 'erase' ? 'erasing' : cellName(colour)}. Arrow keys move, Space paints, 1 to 5 pick a colour, 0 the eraser.`}
        className="grid w-full max-w-[22rem] touch-none select-none grid-cols-12 overflow-hidden rounded-[var(--radius-m)] border-2 border-line-strong bg-surface"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      >
        {Array.from({ length: PAINT_SIZE }, (_, r) => (
          <div role="row" key={r} className="contents">
            {Array.from({ length: PAINT_SIZE }, (_, c) => {
              const i = r * PAINT_SIZE + c;
              const v = cells[i]!;
              return (
                <div
                  key={c}
                  role="gridcell"
                  data-cell={i}
                  tabIndex={i === cursor ? 0 : -1}
                  aria-label={`Row ${r + 1}, column ${c + 1}: ${cellName(v)}`}
                  onFocus={() => setCursor(i)}
                  className={`aspect-square border-[0.5px] border-line/60 outline-none focus-visible:z-10 focus-visible:shadow-[inset_0_0_0_3px_var(--text)] ${c === PAINT_SIZE / 2 && sym !== 'none' ? 'border-l-line-strong' : ''} ${r === PAINT_SIZE / 2 && sym === 'quad' ? 'border-t-line-strong' : ''}`}
                  style={v ? { background: palette[v - 1] } : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" disabled={isBlankPaint(value)} onClick={() => onChange(undefined)} icon={<Trash2 className="size-4" aria-hidden />}>
          Clear the grid
        </Button>
      </div>
    </div>
  );
}

function StampIcon({ id }: { id: StampId }) {
  const rows = STAMPS[id];
  return (
    <svg viewBox="0 0 5 5" className="size-4" aria-hidden>
      {rows.flatMap((row, r) => [...row].map((ch, c) => (ch === '1' ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="currentColor" /> : null)))}
    </svg>
  );
}
