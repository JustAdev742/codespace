import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Check } from 'lucide-react';
import { MODE_CATEGORIES, MODE_CATEGORY_INFO, SUBJECT_LABELS, type ModeCategory } from '@ludora/shared';
import { thumbFor, type CatalogEntry, type CatalogVariant, type SetSummary } from '../../lib/queries.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Badge } from '../../ui/primitives.tsx';
import { ToggleChips } from '../../ui/game.tsx';
import { Button } from '../../ui/Button.tsx';
import { SetCover } from '../sets/SetCover.tsx';
import { plural } from '../../lib/format.ts';

/*
 * The pickers for setting up a game: question sets and game modes with their
 * variants. The host page uses them with sets and modes from the server, and
 * the playable demo with the built-in sets and the catalogue.
 */

export const subjectLabel = (s: string) => SUBJECT_LABELS[s as keyof typeof SUBJECT_LABELS] ?? s;

/* --------------------------------- question set --------------------------------- */

/** What a set picker shows of a set. */
export type SetLike = Pick<SetSummary, 'title' | 'subject' | 'questionCount' | 'cover'>;

/** A set in a picker list: its cover, title, size and subject. `detail` adds to the small print. */
export function SetButton({ set, detail = '', onPick }: { set: SetLike; detail?: string; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className="flex h-full min-h-16 w-full items-center gap-3 rounded-[var(--radius-m)] border border-line bg-raised p-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-2">
      <SetCover cover={set.cover} subject={set.subject} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold break-words">{set.title}</span>
        <span className="block text-xs text-text-3">
          {plural(set.questionCount, 'question')}, {subjectLabel(set.subject)}
          {detail}
        </span>
      </span>
    </button>
  );
}

/** The chosen set, folded into one line with a way to change it. */
export function ChosenSet({ set, onChange, focusOnMount }: { set: SetLike; onChange: () => void; focusOnMount: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // The set button that had focus has gone; keep keyboard users in the same place.
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);
  return (
    // Chosen: the gold edge and tint every chosen card in these pickers has.
    <div className="flex items-center gap-3 rounded-[var(--radius-m)] border border-lantern bg-lantern/[0.08] p-3 ring-1 ring-lantern">
      <SetCover cover={set.cover} subject={set.subject} size={48} />
      <span className="min-w-0 flex-1">
        <span className="block font-display text-xl leading-tight font-bold break-words">{set.title}</span>
        <span className="block text-sm text-text-2">
          {plural(set.questionCount, 'question')}, {subjectLabel(set.subject)}
        </span>
      </span>
      <Button ref={ref} size="sm" onClick={onChange} aria-label={`Change the question set, ${set.title}`}>
        Change
      </Button>
    </div>
  );
}

/* ----------------------------------- game mode ----------------------------------- */

export type Choice = { mode: CatalogEntry; variant: CatalogVariant | null };

/**
 * A card holding a radio button. The radio covers the card, so focus scrolling and clicks take the whole card.
 * Chosen: a gold edge (border and ring, so nothing shifts), a gold tint and a tick, so it is never told by colour alone.
 */
export function RadioCard({ name, checked, onSelect, children, className = '' }: { name: string; checked: boolean; onSelect: () => void; children: ReactNode; className?: string }) {
  return (
    <label
      className={`relative flex cursor-pointer overflow-hidden rounded-[var(--radius-m)] border transition-[border-color,background-color,box-shadow] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] ${checked ? 'border-lantern bg-lantern/[0.08] ring-1 ring-lantern' : 'border-line bg-raised hover:border-line-strong hover:bg-surface-2'} ${className}`}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0" />
      {children}
      {checked ? (
        <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-lantern text-on-accent" aria-hidden>
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : null}
    </label>
  );
}

/** Variants shown before Show all: the standard rules and the first few twists. Shorter lists show in full. */
const FIRST_VARIANTS = 5;
const FOLD_FROM = 10;

function VariantPicker({ choice, onChange }: { choice: Choice; onChange: (c: Choice) => void }) {
  const { mode } = choice;
  const [all, setAll] = useState(false);
  const [focusFrom, setFocusFrom] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // After Show all, carry on from the first variant it revealed.
    if (focusFrom === null) return;
    list.current?.querySelectorAll<HTMLElement>('input')[focusFrom]?.focus();
    setFocusFrom(null);
  }, [focusFrom]);
  const options: (CatalogVariant | null)[] = [null, ...mode.variants];
  // A variant chosen from the full list stays in view if the list folds again.
  const chosenAt = options.findIndex((v) => (v?.meta.id ?? null) === (choice.variant?.meta.id ?? null));
  const shown = all || options.length < FOLD_FROM ? options : options.slice(0, Math.max(FIRST_VARIANTS + 1, chosenAt + 1));
  return (
    <div className="rounded-[var(--radius-l)] border border-line bg-surface-2 p-3 sm:p-4">
      <fieldset className="min-w-0">
        <legend className="mb-2.5 font-display text-xl leading-tight font-bold">Variants of {mode.meta.title}</legend>
        <div ref={list} className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((v) => {
            const meta = v?.meta;
            return (
              <RadioCard key={meta?.id ?? 'standard'} name="host-variant" checked={(choice.variant?.meta.id ?? null) === (meta?.id ?? null)} onSelect={() => onChange({ mode, variant: v })}>
                <span className="min-w-0 flex-1 py-2 pr-9 pl-3">
                  <span className="flex flex-wrap items-center gap-x-2 font-bold">
                    {meta?.title ?? 'Standard rules'}
                    {meta?.status === 'beta' ? <Badge tone="amber">Beta</Badge> : null}
                  </span>
                  <span className="line-clamp-2 block text-sm text-text-2">{meta?.tagline ?? mode.meta.tagline}</span>
                </span>
              </RadioCard>
            );
          })}
        </div>
      </fieldset>
      {shown.length < options.length ? (
        <Button
          size="sm"
          className="mt-3"
          onClick={() => {
            setFocusFrom(shown.length);
            setAll(true);
          }}
        >
          Show all {mode.variants.length} variants
        </Button>
      ) : null}
    </div>
  );
}

/** How many columns a CSS grid has right now. */
function useColumns(ref: RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setColumns(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return columns;
}

type Kind = ModeCategory | 'all';

/**
 * Modes by kind, as on the game modes page: one grid, in the same order, with the
 * same filter. The chosen mode's variants open in a row of their own straight
 * under the row of the chosen mode.
 */
export function ModeGrid({ modes, value, onChange, labelledBy }: { modes: CatalogEntry[]; value: Choice | null; onChange: (c: Choice) => void; /** The id of the heading that names the mode list. */ labelledBy: string }) {
  const [kind, setKind] = useState<Kind>('all');
  const grid = useRef<HTMLDivElement>(null);
  const columns = useColumns(grid);
  const ordered = MODE_CATEGORIES.flatMap((c) => modes.filter((m) => m.meta.category === c));
  const shown = ordered.filter((m) => kind === 'all' || m.meta.category === kind);
  const count = (c: ModeCategory) => modes.filter((m) => m.meta.category === c).length;
  const at = shown.findIndex((m) => m.meta.id === value?.mode.meta.id);
  const rowEnd = at < 0 || !value?.mode.variants.length ? -1 : Math.min(shown.length, (Math.floor(at / columns) + 1) * columns) - 1;
  return (
    <>
      <ToggleChips<Kind>
        className="mb-4"
        value={kind}
        onChange={setKind}
        label="Show modes by kind"
        options={[
          { value: 'all', label: 'All' },
          ...MODE_CATEGORIES.filter((c) => count(c) > 0).map((c) => ({
            value: c,
            // A real space, not a margin, so the chip's name reads "Party 4" rather than "Party4".
            label: (
              <>
                {MODE_CATEGORY_INFO[c].label} <span className="opacity-70 tabular">{count(c)}</span>
              </>
            ),
          })),
        ]}
      />
      <fieldset aria-labelledby={labelledBy} className="min-w-0">
        <div ref={grid} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((m, i) => {
            const variants = m.variants.length;
            return [
              <RadioCard key={m.meta.id} name="host-mode" checked={value?.mode.meta.id === m.meta.id} onSelect={() => onChange({ mode: m, variant: null })}>
                <ModeArt thumb={thumbFor(m.meta)} className="w-20 shrink-0 self-stretch sm:w-24" />
                <span className="min-w-0 flex-1 py-2.5 pr-9 pl-3">
                  <span className="flex flex-wrap items-center gap-x-2 font-display text-xl leading-tight font-bold">
                    {m.meta.title}
                    {m.meta.status === 'beta' ? <Badge tone="amber">Beta</Badge> : null}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-text-2">{m.meta.tagline}</span>
                  <span className="mt-1 block text-xs font-semibold text-text-2">
                    {MODE_CATEGORY_INFO[m.meta.category].label}
                    {variants ? `, ${variants} ${variants === 1 ? 'variant' : 'variants'}` : ''}
                  </span>
                </span>
              </RadioCard>,
              i === rowEnd && value ? (
                <div key={`${m.meta.id}-variants`} className="col-span-full">
                  <VariantPicker key={value.mode.meta.id} choice={value} onChange={onChange} />
                </div>
              ) : null,
            ];
          })}
        </div>
      </fieldset>
      {at < 0 && value ? (
        <p className="mt-3 text-sm text-text-2">
          You chose {value.variant?.meta.title ?? value.mode.meta.title}, from {MODE_CATEGORY_INFO[value.mode.meta.category].label}.{' '}
          <button type="button" onClick={() => setKind(value.mode.meta.category)} className="font-semibold text-link underline underline-offset-2">
            Show {MODE_CATEGORY_INFO[value.mode.meta.category].label}
          </button>
        </p>
      ) : null}
    </>
  );
}
