import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { LESSON_LIMITS, type LessonStep } from '@ludora/shared';
import { useModes, useSets, type CatalogEntry } from '../../lib/queries.ts';
import { Dialog, Field, Input, Select, Textarea } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { ToggleChips } from '../../ui/game.tsx';
import { QuestionImage } from '../sets/editor/QuestionImage.tsx';
import { ERROR_TEXT } from '../sets/editor/parts.tsx';
import { DiscussionHelper, SlideHelper } from '../ai/AiLessonTools.tsx';

/*
 * Editing one step of a lesson: a game (a set, a mode and the two settings teachers change most),
 * an info slide (a title, a few lines, an optional picture with its description) or a discussion
 * (a question and a timer). Every step can carry a private plan note.
 */

type GameStep = Extract<LessonStep, { kind: 'game' }>;

/** Modes a class plays together, with their variants: what a lesson's game step can be. */
export function lessonModes(modes: CatalogEntry[]): CatalogEntry[] {
  return modes.filter((m) => m.meta.status !== 'planned' && m.meta.pacing !== 'solo').map((m) => ({ ...m, variants: m.variants.filter((v) => v.meta.status !== 'planned') }));
}

function SetChooser({ value, title, onPick }: { value: string | null; title: string | null; onPick: (id: string, title: string) => void }) {
  const [scope, setScope] = useState<'mine' | 'featured'>('mine');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const sets = useSets({ scope, q: query, pageSize: 12 });
  const list = sets.data?.sets ?? [];
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold text-text">Question set</legend>
      <p className="text-sm text-text-2">{value ? <>Chosen: <strong className="break-words text-text">{title ?? 'a set'}</strong></> : 'No set chosen yet.'}</p>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleChips value={scope} onChange={setScope} label="Which sets to show" options={[{ value: 'mine', label: 'My sets' }, { value: 'featured', label: 'Recommended' }]} />
        <label className="relative min-w-[10rem] flex-1">
          <span className="sr-only">Search sets</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sets" className="h-10 pl-9" />
        </label>
      </div>
      {sets.isError ? <p className="text-sm text-text-2">Sets could not be loaded. Close this and try again.</p> : null}
      {sets.isSuccess && list.length === 0 ? <p className="text-sm text-text-2">{query ? 'No sets match.' : scope === 'mine' ? 'You have no sets yet. Try Recommended.' : 'No sets here.'}</p> : null}
      <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto" aria-label="Sets">
        {list.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              aria-pressed={value === s.id}
              onClick={() => onPick(s.id, s.title)}
              className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-[var(--radius-m)] border px-3 py-2 text-left ${value === s.id ? 'border-lantern bg-lantern/10' : 'border-line bg-surface-2 hover:border-line-strong'}`}
            >
              <span className="min-w-0 font-semibold break-words">{s.title}</span>
              <span className="shrink-0 text-sm text-text-2">{s.questionCount} q</span>
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function GameFields({ step, setTitle, onChange }: { step: GameStep; setTitle: string | null; onChange: (s: GameStep, setTitle?: string) => void }) {
  const modes = useModes();
  const list = useMemo(() => lessonModes(modes.data?.modes ?? []), [modes.data]);
  const value = `${step.modeId}|${step.variantId ?? ''}`;
  return (
    <div className="flex flex-col gap-4">
      <SetChooser value={step.setId} title={setTitle} onPick={(id, title) => onChange({ ...step, setId: id }, title)} />
      <Field label="Game mode">
        {(p) => (
          <Select
            {...p}
            value={value}
            onChange={(e) => {
              const [modeId, variantId] = e.target.value.split('|');
              onChange({ ...step, modeId: modeId!, variantId: variantId || null, settings: {} });
            }}
          >
            {list.length === 0 ? <option value={value}>Loading modes…</option> : null}
            {list.map((m) => (
              <optgroup key={m.meta.id} label={m.meta.title}>
                <option value={`${m.meta.id}|`}>{m.meta.title}</option>
                {m.variants.map((v) => (
                  <option key={v.meta.id} value={`${m.meta.id}|${v.meta.id}`}>
                    {m.meta.title}: {v.meta.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="How many questions" hint="Empty or 0 uses the mode's own number.">
          {(p) => <Input {...p} type="number" min={0} max={250} value={step.common.questionLimit ?? ''} onChange={(e) => onChange({ ...step, common: { ...step.common, questionLimit: e.target.value === '' ? undefined : Math.max(0, Math.min(250, Number(e.target.value))) } })} className="w-28" />}
        </Field>
        <Field label="Seconds per question" hint="Empty uses the mode's own time.">
          {(p) => <Input {...p} type="number" min={5} max={120} value={step.common.questionTimeSec ?? ''} onChange={(e) => onChange({ ...step, common: { ...step.common, questionTimeSec: e.target.value === '' ? undefined : Math.max(5, Math.min(120, Number(e.target.value))) } })} className="w-28" />}
        </Field>
      </div>
      <Field label="Title in the room" hint="Optional, such as Starter or Exit ticket. Empty shows the mode and the set.">
        {(p) => <Input {...p} value={step.title} maxLength={LESSON_LIMITS.title} onChange={(e) => onChange({ ...step, title: e.target.value })} />}
      </Field>
    </div>
  );
}

const SECONDS = [30, 60, 90, 120, 180, 300, 600];

export function StepDialog({ open, step, setTitle, onOpenChange, onSave }: { open: boolean; step: LessonStep | null; setTitle: string | null; onOpenChange: (v: boolean) => void; onSave: (s: LessonStep, setTitle?: string) => void }) {
  const [draft, setDraft] = useState<LessonStep | null>(step);
  const [chosenTitle, setChosenTitle] = useState<string | null>(setTitle);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setDraft(step);
      setChosenTitle(setTitle);
      setError(null);
    }
  }, [open, step, setTitle]);
  if (!draft) return null;
  const save = () => {
    if (draft.kind === 'slide' && !draft.title.trim()) return setError('Give the slide a title.');
    if (draft.kind === 'slide' && draft.image && !draft.image.alt.trim()) return setError('Describe the picture for players who cannot see it.');
    if (draft.kind === 'discussion' && !draft.prompt.trim()) return setError('Write the question to talk about.');
    onSave(draft.kind === 'slide' ? { ...draft, lines: draft.lines.map((l) => l.trim()).filter(Boolean) } : draft, chosenTitle ?? undefined);
    onOpenChange(false);
  };
  const title = draft.kind === 'game' ? 'Game step' : draft.kind === 'slide' ? 'Info slide' : 'Discussion';
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={title}
      description={draft.kind === 'slide' ? 'Shown on the big screen and on every device, for teaching between games.' : draft.kind === 'discussion' ? 'A question on the big screen with a timer. Devices show "Talk to the person next to you".' : 'A game the class plays in the lesson room.'}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save step
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {draft.kind === 'game' ? (
          <GameFields
            step={draft}
            setTitle={chosenTitle}
            onChange={(s, t) => {
              setDraft(s);
              if (t) setChosenTitle(t);
            }}
          />
        ) : draft.kind === 'slide' ? (
          <>
            <Field label="Slide title">{(p) => <Input {...p} value={draft.title} maxLength={LESSON_LIMITS.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />}</Field>
            <Field label="Lines" hint={`One point per line, up to ${LESSON_LIMITS.lines}.`}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={5}
                  value={draft.lines.join('\n')}
                  onChange={(e) => setDraft({ ...draft, lines: e.target.value.split('\n').slice(0, LESSON_LIMITS.lines).map((l) => l.slice(0, LESSON_LIMITS.line)) })}
                />
              )}
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-semibold">Picture (optional)</p>
              <QuestionImage media={draft.image ?? undefined} altId="slide-image-alt" onChange={(m) => setDraft({ ...draft, image: m ?? null })} />
            </div>
            <SlideHelper title={draft.title} lines={draft.lines} onAccept={(o) => setDraft({ ...draft, title: o.title, lines: o.lines })} />
          </>
        ) : (
          <>
            <Field label="Question to talk about">{(p) => <Textarea {...p} rows={3} value={draft.prompt} maxLength={LESSON_LIMITS.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} />}</Field>
            <DiscussionHelper prompt={draft.prompt} onAccept={(prompt) => setDraft({ ...draft, prompt })} />
            <Field label="Timer">
              {(p) => (
                <Select {...p} value={String(draft.seconds)} onChange={(e) => setDraft({ ...draft, seconds: Number(e.target.value) })}>
                  {SECONDS.map((s) => (
                    <option key={s} value={s}>
                      {s < 60 ? `${s} seconds` : s % 60 ? `${s / 60} minutes` : s === 60 ? '1 minute' : `${s / 60} minutes`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </>
        )}
        <Field label="Your plan note" hint="Private: only you see it, here and on the printed plan. It is never sent to players' devices or the big screen.">
          {(p) => <Textarea {...p} rows={3} value={draft.note} maxLength={LESSON_LIMITS.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />}
        </Field>
        {error ? (
          <p role="alert" className={`text-sm font-semibold ${ERROR_TEXT}`}>
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
