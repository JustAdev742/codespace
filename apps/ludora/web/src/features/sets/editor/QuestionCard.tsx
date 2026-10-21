import { memo, useCallback, useState, type Dispatch } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Copy, SlidersHorizontal, Trash2 } from 'lucide-react';
import { DIFFICULTIES, QUESTION_TYPE_LABELS, QUESTION_TYPES, type QuestionType } from '@ludora/shared';
import { IconButton } from '../../../ui/Button.tsx';
import { Input, Select, Textarea } from '../../../ui/primitives.tsx';
import { answerSummary, LIMITS, splitTags, type DraftQuestion } from './model.ts';
import { domIds, EditorField, ERROR_BORDER, ERROR_TEXT, MediaNote, promptLabel, TYPE_ICONS, type TypeEditorProps } from './parts.tsx';
import type { EditorAction } from './state.ts';
import type { FieldErrors } from './validation.ts';
import { ChoicesEditor } from './types/ChoicesEditor.tsx';
import { FlashcardEditor } from './types/FlashcardEditor.tsx';
import { MatchEditor } from './types/MatchEditor.tsx';
import { NumericEditor } from './types/NumericEditor.tsx';
import { OrderEditor } from './types/OrderEditor.tsx';
import { ShortEditor } from './types/ShortEditor.tsx';
import { TrueFalseEditor } from './types/TrueFalseEditor.tsx';

const NO_ERRORS: FieldErrors = {};
const OPTION_KEYS = ['explanation', 'timeLimit', 'points', 'difficulty', 'tags'] as const;
const DIFFICULTY_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

function TypeEditor(props: TypeEditorProps) {
  switch (props.q.type) {
    case 'mcq':
    case 'multi':
      return <ChoicesEditor {...props} />;
    case 'truefalse':
      return <TrueFalseEditor {...props} />;
    case 'short':
      return <ShortEditor {...props} />;
    case 'numeric':
      return <NumericEditor {...props} />;
    case 'order':
      return <OrderEditor {...props} />;
    case 'match':
      return <MatchEditor {...props} />;
    case 'flashcard':
      return <FlashcardEditor {...props} />;
  }
}

function optionSummary(q: DraftQuestion): string {
  const parts: string[] = [];
  if (q.explanation.trim()) parts.push('Explanation');
  if (q.timeLimit.trim()) parts.push(`${q.timeLimit.trim()} seconds`);
  if (q.points.trim()) parts.push(`${q.points.trim()} points`);
  if (q.difficulty) parts.push(DIFFICULTY_LABELS[q.difficulty]);
  const tags = splitTags(q.tags).length;
  if (tags) parts.push(tags === 1 ? '1 tag' : `${tags} tags`);
  return parts.join(', ');
}

/** Explanation, time limit, points, difficulty and tags: tucked away until wanted, open while one has a problem. */
function MoreOptions({ q, errors, edit }: TypeEditorProps) {
  const hasError = OPTION_KEYS.some((k) => errors[k]);
  const [wanted, setWanted] = useState(false);
  const open = wanted || hasError;
  const panelId = domIds.field(q.id, 'options');
  const summary = optionSummary(q);
  const set = (patch: Partial<DraftQuestion>) => edit((d) => ({ ...d, ...patch }));
  return (
    <div className="min-w-0 rounded-[12px] border border-line">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setWanted(!open)}
        className="flex w-full min-w-0 items-center gap-2 rounded-[12px] px-3 py-2.5 text-left hover:bg-surface-2"
      >
        <SlidersHorizontal className="size-4 shrink-0 text-text-3" aria-hidden />
        <span className="shrink-0 font-semibold text-text">More options</span>
        <span className="min-w-0 flex-1 truncate text-sm text-text-3">{summary || 'Explanation, time limit, points, difficulty, tags'}</span>
        <ChevronDown className={`size-4 shrink-0 text-text-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open ? (
        <div id={panelId} className="grid min-w-0 gap-4 border-t border-line p-3 sm:grid-cols-3">
          <EditorField id={domIds.field(q.id, 'explanation')} label="Explanation" optional hint="Shown after the answer is revealed." error={errors.explanation} className="sm:col-span-3">
            {(p) => <Textarea {...p} rows={2} maxLength={LIMITS.explanation} value={q.explanation} onChange={(e) => set({ explanation: e.target.value })} className="h-auto min-h-[64px]" />}
          </EditorField>
          <EditorField id={domIds.field(q.id, 'timeLimit')} label="Time limit in seconds" optional hint={`${LIMITS.timeMin} to ${LIMITS.timeMax}. Empty uses the game's setting.`} error={errors.timeLimit}>
            {(p) => <Input {...p} inputMode="numeric" autoComplete="off" value={q.timeLimit} onChange={(e) => set({ timeLimit: e.target.value })} />}
          </EditorField>
          <EditorField id={domIds.field(q.id, 'points')} label="Points" optional hint="Empty uses the game mode's scoring." error={errors.points}>
            {(p) => <Input {...p} inputMode="numeric" autoComplete="off" value={q.points} onChange={(e) => set({ points: e.target.value })} />}
          </EditorField>
          <EditorField id={domIds.field(q.id, 'difficulty')} label="Difficulty" optional error={errors.difficulty}>
            {(p) => (
              <Select {...p} value={q.difficulty} onChange={(e) => set({ difficulty: e.target.value as DraftQuestion['difficulty'] })}>
                <option value="">Not set</option>
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY_LABELS[d]}
                  </option>
                ))}
              </Select>
            )}
          </EditorField>
          <EditorField id={domIds.field(q.id, 'tags')} label="Tags" optional hint={`Separate tags with commas. Up to ${LIMITS.tags}.`} error={errors.tags} className="sm:col-span-3">
            {(p) => <Input {...p} autoComplete="off" value={q.tags} onChange={(e) => set({ tags: e.target.value })} />}
          </EditorField>
        </div>
      ) : null}
    </div>
  );
}

export interface QuestionCardProps {
  question: DraftQuestion;
  index: number;
  total: number;
  open: boolean;
  errors: FieldErrors | undefined;
  canDuplicate: boolean;
  dispatch: Dispatch<EditorAction>;
  onMove: (id: string, by: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

/** One question: a header that collapses it, move, duplicate and delete buttons, and its editor. */
export const QuestionCard = memo(function QuestionCard({ question: q, index, total, open, errors = NO_ERRORS, canDuplicate, dispatch, onMove, onDuplicate, onRemove }: QuestionCardProps) {
  const edit = useCallback((change: (d: DraftQuestion) => DraftQuestion) => dispatch({ type: 'edit', id: q.id, change }), [dispatch, q.id]);
  const problems = Object.keys(errors).length;
  const Icon = TYPE_ICONS[q.type];
  const n = index + 1;
  const prompt = q.prompt.trim();
  const summary = open ? '' : answerSummary(q);

  return (
    <li id={domIds.card(q.id)} className={`min-w-0 scroll-mt-24 rounded-[var(--radius-m)] border bg-raised ${problems ? ERROR_BORDER : 'border-line'}`}>
      <div className="flex flex-wrap items-start gap-x-1 gap-y-0 p-2 sm:gap-x-2 sm:p-3">
        <button
          type="button"
          id={domIds.header(q.id)}
          aria-expanded={open}
          aria-controls={open ? domIds.panel(q.id) : undefined}
          onClick={() => dispatch({ type: 'toggle', id: q.id })}
          className="flex min-w-0 grow basis-[12rem] items-start gap-3 rounded-[10px] p-1.5 text-left hover:bg-surface-2"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 font-display text-sm font-bold text-text tabular">{n}</span>
          <span className="min-w-0 flex-1 pt-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-text-2">
              <span className="inline-flex items-start gap-1.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-text-3" aria-hidden />
                {QUESTION_TYPE_LABELS[q.type]}
              </span>
              {problems ? (
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${ERROR_TEXT} ${ERROR_BORDER}`}>{problems === 1 ? '1 thing to fix' : `${problems} things to fix`}</span>
              ) : null}
            </span>
            {!open ? (
              <>
                <span className={`mt-1 block font-semibold [overflow-wrap:anywhere] ${prompt ? 'text-text' : 'text-text-3'}`}>{prompt || `No ${promptLabel(q.type).toLowerCase()} yet`}</span>
                {summary ? <span className="mt-0.5 block truncate text-sm text-text-2">Answer: {summary}</span> : null}
              </>
            ) : null}
          </span>
          <ChevronDown className={`mt-1.5 size-5 shrink-0 text-text-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        <div className="ml-auto flex shrink-0 items-center pt-1">
          <IconButton id={domIds.field(q.id, 'up')} size="sm" label={`Move question ${n} up`} disabled={index === 0} onClick={() => onMove(q.id, -1)}>
            <ArrowUp className="size-4" />
          </IconButton>
          <IconButton id={domIds.field(q.id, 'down')} size="sm" label={`Move question ${n} down`} disabled={index === total - 1} onClick={() => onMove(q.id, 1)}>
            <ArrowDown className="size-4" />
          </IconButton>
          <IconButton size="sm" label={`Duplicate question ${n}`} disabled={!canDuplicate} onClick={() => onDuplicate(q.id)}>
            <Copy className="size-4" />
          </IconButton>
          <IconButton size="sm" label={`Delete question ${n}`} onClick={() => onRemove(q.id)}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>
      {open ? (
        <div id={domIds.panel(q.id)} className="flex min-w-0 flex-col gap-4 border-t border-line p-3 sm:p-4">
          <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
            <EditorField id={domIds.field(q.id, 'prompt')} label={promptLabel(q.type)} error={errors.prompt}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  maxLength={LIMITS.prompt}
                  value={q.prompt}
                  onChange={(e) => {
                    const prompt = e.target.value;
                    edit((d) => ({ ...d, prompt }));
                  }}
                  className="h-auto min-h-[72px]"
                />
              )}
            </EditorField>
            <EditorField id={domIds.field(q.id, 'type')} label="Question type">
              {(p) => (
                <Select {...p} value={q.type} onChange={(e) => dispatch({ type: 'retype', id: q.id, to: e.target.value as QuestionType })}>
                  {QUESTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {QUESTION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              )}
            </EditorField>
          </div>
          {q.media ? <MediaNote media={q.media} id={domIds.field(q.id, 'media-alt')} label="Image description" error={errors.media} onAltChange={(alt) => edit((d) => (d.media ? { ...d, media: { ...d.media, alt } } : d))} /> : null}
          <TypeEditor q={q} errors={errors} edit={edit} />
          <MoreOptions q={q} errors={errors} edit={edit} />
        </div>
      ) : null}
    </li>
  );
});
