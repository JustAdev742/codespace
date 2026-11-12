import { useId, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { AI_DRAFT_TYPES, questionSchema, type Question } from '@ludora/shared';
import { answerSummary, fromQuestion, newId, toCandidate, type DraftQuestion } from '../sets/editor/model.ts';
import { AiHelper } from './AiHelper.tsx';
import { useAiStatus } from './aiData.ts';

/*
 * AI helpers for one question in the set editor: improve the wording, write
 * wrong answers, write the explanation, make it easier or harder. Each shows
 * its suggestion beside the question as it is; nothing changes until the
 * author accepts it, and accepting is one step Undo can take back.
 */

const TASKS = ['question.improve', 'question.wrong_answers', 'question.explain', 'question.difficulty'];
const MAX_CHOICES = 6;

/** The question as the server's rules see it, or null while it is unfinished. */
function asQuestion(q: DraftQuestion): Question | null {
  const parsed = questionSchema.safeParse(toCandidate(q).question);
  return parsed.success ? parsed.data : null;
}

function QuestionPreview({ q }: { q: Question }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-semibold">{q.prompt}</p>
      {q.type === 'mcq' ? (
        <ul className="flex flex-col gap-0.5" aria-label="Choices">
          {q.choices.map((c) => (
            <li key={c.id} className={c.id === q.correct ? 'font-semibold' : 'text-text-2'}>
              {c.text}
              {c.id === q.correct ? ' (right answer)' : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {q.explanation ? <p className="text-text-2">{q.explanation}</p> : null}
    </div>
  );
}

export function AiQuestionTools({ q, n, edit }: { q: DraftQuestion; n: number; edit: (change: (d: DraftQuestion) => DraftQuestion) => void }) {
  const status = useAiStatus().data;
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (!status?.available || !TASKS.some((t) => status.tasks.includes(t))) return null;

  const prompt = q.prompt.trim();
  const answer = answerSummary(q);
  const needPrompt = prompt ? true : 'Write the question first.';
  const correct = q.type === 'mcq' ? q.choices.find((c) => q.correct.includes(c.id) && c.text.trim()) : undefined;
  const wrongNow = q.choices.filter((c) => !q.correct.includes(c.id) && c.text.trim()).map((c) => c.text.trim());
  const empty = q.choices.filter((c) => !q.correct.includes(c.id) && !c.text.trim() && !c.media).length;
  const room = MAX_CHOICES - q.choices.length + empty;
  const wanted = Math.max(1, Math.min(room, Math.max(empty, 3 - wrongNow.length)));
  const whole = (AI_DRAFT_TYPES as readonly string[]).includes(q.type) ? asQuestion(q) : null;

  return (
    <div className="min-w-0 rounded-[var(--radius-m)] border border-line">
      <button type="button" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setOpen(!open)} className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-[var(--radius-m)] px-3 py-2.5 text-left hover:bg-surface-2">
        <Sparkles className="size-4 shrink-0 text-lantern" aria-hidden />
        <span className="font-semibold text-text">Help from AI</span>
        <span className="sr-only">for question {n}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-text-3">Wording, wrong answers, explanation, easier or harder</span>
        <ChevronDown className={`size-4 shrink-0 text-text-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open ? (
        <div id={listId} className="flex min-w-0 flex-col gap-2 border-t border-line p-3">
          <AiHelper<{ prompt: string }>
            task="question.improve"
            label="Improve the wording"
            ready={needPrompt}
            input={() => ({ type: q.type, prompt, answer })}
            current={prompt}
            renderSuggestion={(o) => o.prompt}
            onAccept={(o) => edit((d) => ({ ...d, prompt: o.prompt }))}
          />
          {q.type === 'mcq' ? (
            <AiHelper<{ wrong: string[] }>
              task="question.wrong_answers"
              label="Write wrong answers"
              ready={!prompt ? 'Write the question first.' : !correct ? 'Write the right answer and mark it first.' : room <= 0 ? `The question has ${MAX_CHOICES} choices, the most it can have.` : true}
              input={() => ({
                prompt,
                correct: correct?.text.trim() ?? '',
                wrong: wrongNow,
                count: wanted,
              })}
              current={wrongNow.length ? wrongNow.join(', ') : 'No wrong answers yet'}
              renderSuggestion={(o) => (
                <ul className="list-disc pl-5">
                  {o.wrong.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              acceptLabel="Add them"
              onAccept={(o) =>
                edit((d) => {
                  const queue = [...o.wrong];
                  // Empty wrong choices are filled first, then new ones added while there is room.
                  const choices = d.choices.map((c) => (!d.correct.includes(c.id) && !c.text.trim() && !c.media && queue.length ? { ...c, text: queue.shift()! } : c));
                  const taken = new Set(choices.map((c) => c.id));
                  while (queue.length && choices.length < MAX_CHOICES) {
                    const id = newId('c', taken);
                    taken.add(id);
                    choices.push({ id, text: queue.shift()! });
                  }
                  return { ...d, choices };
                })
              }
            />
          ) : null}
          <AiHelper<{ explanation: string }>
            task="question.explain"
            label="Write the explanation"
            ready={!prompt ? 'Write the question first.' : !answer ? 'Give the question its answer first.' : true}
            input={() => ({ prompt, answer })}
            current={q.explanation.trim() || 'No explanation yet'}
            renderSuggestion={(o) => o.explanation}
            onAccept={(o) => edit((d) => ({ ...d, explanation: o.explanation }))}
          />
          {(['easier', 'harder'] as const).map((direction) => (
            <AiHelper<{ question: Question }>
              key={direction}
              task="question.difficulty"
              label={direction === 'easier' ? 'Make it easier' : 'Make it harder'}
              ready={
                whole
                  ? true
                  : (AI_DRAFT_TYPES as readonly string[]).includes(q.type)
                    ? 'Finish the question first: it needs its answer and every part filled in.'
                    : 'This helper rewrites multiple choice, true or false, short answer, number, fill-in-the-blanks and sorting questions.'
              }
              input={() => ({ question: whole, direction })}
              current={whole ? <QuestionPreview q={whole} /> : null}
              renderSuggestion={(o) => <QuestionPreview q={o.question} />}
              acceptLabel="Use this version"
              onAccept={(o) => edit((d) => ({ ...fromQuestion(o.question), id: d.id }))}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
