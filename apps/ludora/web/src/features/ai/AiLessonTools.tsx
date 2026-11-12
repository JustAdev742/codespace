import { useId, useState } from 'react';
import { AI_DRAFT_LEVEL_LABELS, AI_DRAFT_LEVELS, LESSON_LIMITS, type AiDraftLevel, type LessonStep } from '@ludora/shared';
import { useSets } from '../../lib/queries.ts';
import { plural } from '../../lib/format.ts';
import { Input, Select } from '../../ui/primitives.tsx';
import { AiHelper } from './AiHelper.tsx';

/*
 * AI helpers in the lesson editor: outline a lesson from a goal and the
 * teacher's own sets, write an info slide, and write discussion questions for
 * a set. Steps are added, and fields filled, only when the teacher accepts.
 */

export interface LessonOutline {
  title: string;
  goals: string[];
  steps: LessonStep[];
}

const KIND_WORD = {
  game: 'Game',
  slide: 'Info slide',
  discussion: 'Discussion',
} as const;
const MINUTES = [15, 30, 45, 60, 90];

function stepLine(s: LessonStep, setTitle: (id: string | null) => string): string {
  if (s.kind === 'game') return `${s.title || 'Game'}: ${setTitle(s.setId)} (${s.modeId})`;
  if (s.kind === 'slide') return `${s.title}${s.lines.length ? `: ${s.lines.join(' / ')}` : ''}`;
  return `${s.prompt} (${s.seconds < 60 ? `${s.seconds} seconds` : `${Math.round(s.seconds / 60)} min`})`;
}

function LevelSelect({ value, onChange, label = 'Pupils' }: { value: AiDraftLevel | ''; onChange: (v: AiDraftLevel | '') => void; label?: string }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
      </label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value as AiDraftLevel | '')} className="w-full sm:w-52">
        <option value="">Not set</option>
        {AI_DRAFT_LEVELS.map((l) => (
          <option key={l} value={l}>
            {AI_DRAFT_LEVEL_LABELS[l]}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** "Outline with AI" above a lesson's steps. */
export function LessonOutlineHelper({ stepCount, onAccept }: { stepCount: number; onAccept: (o: LessonOutline) => void }) {
  const [goal, setGoal] = useState('');
  const [level, setLevel] = useState<AiDraftLevel | ''>('');
  const [minutes, setMinutes] = useState(45);
  const [picked, setPicked] = useState<string[]>([]);
  const mine = useSets({ scope: 'mine', sort: 'title', pageSize: 24 });
  const goalId = useId();
  const minutesId = useId();
  const sets = mine.data?.sets ?? [];
  const titleOf = (id: string | null) => sets.find((s) => s.id === id)?.title ?? 'a set';
  const room = LESSON_LIMITS.steps - stepCount;
  return (
    <AiHelper<LessonOutline>
      task="lesson.outline"
      label="Outline with AI"
      title="Outline a lesson with AI"
      size="md"
      ready={room <= 0 ? `This lesson has ${LESSON_LIMITS.steps} steps, the most a lesson can have.` : goal.trim().length < 3 ? 'Say what the lesson is for.' : true}
      fields={
        <>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={goalId} className="text-sm font-semibold text-text">
              What is the lesson for?
            </label>
            <Input id={goalId} value={goal} maxLength={200} placeholder="For example: comparing fractions with different denominators" onChange={(e) => setGoal(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-4">
            <LevelSelect value={level} onChange={setLevel} />
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={minutesId} className="text-sm font-semibold text-text">
                Length
              </label>
              <Select id={minutesId} value={String(minutes)} onChange={(e) => setMinutes(Number(e.target.value))} className="w-full sm:w-40">
                {MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <fieldset className="flex min-w-0 flex-col gap-1">
            <legend className="mb-1 text-sm font-semibold text-text">Your sets to play (optional)</legend>
            {mine.isSuccess && !sets.length ? <p className="text-sm text-text-2">You have no sets yet: the outline uses slides and discussions.</p> : null}
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto" aria-label="Your sets">
              {sets.map((s) => (
                <li key={s.id}>
                  <label className="flex min-h-11 items-center gap-2.5 text-sm text-text">
                    <input
                      type="checkbox"
                      checked={picked.includes(s.id)}
                      disabled={!picked.includes(s.id) && picked.length >= 12}
                      onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                      className="size-5 shrink-0 accent-[var(--lantern)]"
                    />
                    <span className="min-w-0 break-words">{s.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        </>
      }
      input={() => ({
        goal: goal.trim(),
        minutes,
        setIds: picked,
        ...(level ? { level } : {}),
      })}
      renderSuggestion={(o) => (
        <>
          <p className="font-semibold">{o.title}</p>
          {o.goals.length ? <p className="text-text-2">Today we {o.goals.join('; ')}</p> : null}
          <ol className="mt-1 list-decimal pl-5">
            {o.steps.map((s) => (
              <li key={s.id}>
                <span className="font-semibold">{KIND_WORD[s.kind]}:</span> {stepLine(s, titleOf)}
              </li>
            ))}
          </ol>
          {o.steps.length > room ? <p className="mt-1 text-text-2">Only the first {plural(room, 'step')} fit in this lesson.</p> : null}
        </>
      )}
      acceptLabel="Add these steps"
      onAccept={onAccept}
    />
  );
}

/** "Write this slide with AI" in the slide step dialog. */
export function SlideHelper({ title, lines, onAccept }: { title: string; lines: string[]; onAccept: (o: { title: string; lines: string[] }) => void }) {
  const [topic, setTopic] = useState(title);
  const [level, setLevel] = useState<AiDraftLevel | ''>('');
  const id = useId();
  return (
    <AiHelper<{ title: string; lines: string[] }>
      task="lesson.slide"
      label="Write this slide with AI"
      ready={topic.trim().length >= 3 ? true : 'Say what the slide is about.'}
      fields={
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
            <label htmlFor={id} className="text-sm font-semibold text-text">
              The slide is about
            </label>
            <Input id={id} value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <LevelSelect value={level} onChange={setLevel} />
        </div>
      }
      input={() => ({ topic: topic.trim(), ...(level ? { level } : {}) })}
      current={
        title || lines.length ? (
          <>
            <p className="font-semibold">{title || 'No title yet'}</p>
            {lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </>
        ) : undefined
      }
      renderSuggestion={(o) => (
        <>
          <p className="font-semibold">{o.title}</p>
          <ul className="list-disc pl-5">
            {o.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </>
      )}
      acceptLabel="Use this slide"
      onAccept={onAccept}
    />
  );
}

/** "Suggest questions to talk about" in the discussion step dialog: from one of the teacher's sets. */
export function DiscussionHelper({ prompt, onAccept }: { prompt: string; onAccept: (prompt: string) => void }) {
  const mine = useSets({ scope: 'mine', sort: 'title', pageSize: 48 });
  const [setId, setSetId] = useState('');
  const [picked, setPicked] = useState(0);
  const id = useId();
  const groupName = useId();
  const sets = mine.data?.sets ?? [];
  return (
    <AiHelper<{ prompts: string[] }>
      task="lesson.discussion"
      label="Suggest questions to talk about"
      ready={setId ? true : sets.length || !mine.isSuccess ? 'Choose the set the class plays.' : 'Make a question set first: the questions to talk about come from it.'}
      fields={
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={id} className="text-sm font-semibold text-text">
            From your set
          </label>
          <Select
            id={id}
            value={setId}
            onChange={(e) => {
              setSetId(e.target.value);
              setPicked(0);
            }}
            className="w-full max-w-[22rem]"
          >
            <option value="">Choose a set</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        </div>
      }
      input={() => ({ setId })}
      current={prompt || undefined}
      renderSuggestion={(o) => (
        <fieldset>
          <legend className="mb-1">Choose one:</legend>
          {o.prompts.map((p, i) => (
            <label key={p} className="flex min-h-11 items-start gap-2 py-1">
              <input type="radio" name={groupName} checked={picked === i} onChange={() => setPicked(i)} className="mt-0.5 size-5 shrink-0 accent-[var(--lantern)]" />
              <span>{p}</span>
            </label>
          ))}
        </fieldset>
      )}
      acceptLabel="Use this question"
      onAccept={(o) => onAccept(o.prompts[Math.min(picked, o.prompts.length - 1)]!)}
    />
  );
}
