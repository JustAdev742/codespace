import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AI_DRAFT_LEVEL_LABELS, AI_DRAFT_LEVELS, AI_DRAFT_TYPES, type AiDraftLevel, type Question } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import type { SetSummary } from '../../lib/queries.ts';
import { plural } from '../../lib/format.ts';
import { Panel, Select } from '../../ui/primitives.tsx';
import { AiHelper } from './AiHelper.tsx';
import { useAiStatus } from './aiData.ts';

/*
 * AI helpers on a set's own page, for the people who may edit it: suggest a
 * title, description and tags (saved to the set only when accepted), and make
 * a version for another age group (saved as a new private set when accepted;
 * this set is not touched).
 */

type Described = { title: string; description: string; tags: string[] };
type Version = { title: string; questions: Question[] };

/** The set as the save route takes it: every detail it has, with nothing left empty that must not be. */
function setBody(set: SetSummary, questions: Question[]) {
  return {
    title: set.title,
    description: set.description,
    subject: set.subject,
    ...(set.gradeBand ? { gradeBand: set.gradeBand } : {}),
    ...(set.topic ? { topic: set.topic } : {}),
    language: set.language ?? 'en',
    tags: set.tags,
    visibility: set.visibility,
    ...(set.cover ? { cover: set.cover } : {}),
    ...(set.defaults ? { defaults: set.defaults } : {}),
    questions,
  };
}

export function AiSetTools({ set, questions }: { set: SetSummary; questions: Question[] }) {
  const status = useAiStatus().data;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [level, setLevel] = useState<AiDraftLevel>('7-9');
  const levelId = useId();
  if (!status?.available || !['set.describe', 'set.age_version'].some((t) => status.tasks.includes(t))) return null;
  const rewritable = questions.filter((q) => (AI_DRAFT_TYPES as readonly string[]).includes(q.type)).slice(0, 30);

  const saveDetails = async (o: Described) => {
    try {
      await api.put(`/api/sets/${set.id}`, {
        ...setBody(set, questions),
        title: o.title,
        description: o.description,
        tags: o.tags,
      });
      await qc.invalidateQueries({ queryKey: ['set', set.id] });
      void qc.invalidateQueries({ queryKey: ['sets'] });
      toast.success('Title, description and tags saved.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The set was not saved. Try again.');
    }
  };

  const saveVersion = async (o: Version) => {
    try {
      const res = await api.post<{ set: { id: string } }>('/api/sets', {
        ...setBody(set, o.questions),
        title: o.title,
        visibility: 'private',
      });
      void qc.invalidateQueries({ queryKey: ['sets'] });
      toast.success(`${o.title} is saved as a new private set.`);
      navigate(`/sets/${res.set.id}/edit`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The new set was not saved. Try again.');
    }
  };

  return (
    <Panel className="flex flex-col gap-3 p-5" aria-labelledby="set-ai-tools">
      <h2 id="set-ai-tools" className="font-display text-2xl font-bold">
        Help from AI
      </h2>
      <p className="text-sm text-text-2">Suggestions only: nothing changes until you accept one. The questions you ask about are sent to the AI provider named with each suggestion.</p>
      <AiHelper<Described>
        task="set.describe"
        label="Suggest a title, description and tags"
        size="md"
        input={() => ({
          title: set.title,
          description: set.description,
          subject: set.subject,
          prompts: questions.slice(0, 40).map((q) => q.prompt),
        })}
        current={
          <>
            <p className="font-semibold">{set.title}</p>
            <p>{set.description || 'No description'}</p>
            <p>{set.tags.length ? `Tags: ${set.tags.join(', ')}` : 'No tags'}</p>
          </>
        }
        renderSuggestion={(o) => (
          <>
            <p className="font-semibold">{o.title}</p>
            <p>{o.description || 'No description'}</p>
            <p>{o.tags.length ? `Tags: ${o.tags.join(', ')}` : 'No tags'}</p>
          </>
        )}
        acceptLabel="Save these"
        onAccept={(o) => void saveDetails(o)}
      />
      <AiHelper<Version>
        task="set.age_version"
        label="Make a version for another age group"
        size="md"
        ready={rewritable.length ? true : 'This set has no questions of a kind the helper can rewrite.'}
        fields={
          <div className="flex flex-col gap-1">
            <label htmlFor={levelId} className="text-sm font-semibold text-text">
              Rewrite for
            </label>
            <Select id={levelId} value={level} onChange={(e) => setLevel(e.target.value as AiDraftLevel)} className="w-full max-w-[16rem]">
              {AI_DRAFT_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {AI_DRAFT_LEVEL_LABELS[l]}
                </option>
              ))}
            </Select>
            <p className="text-xs text-text-3">
              {rewritable.length < questions.length ? `${plural(rewritable.length, 'question')} of ${questions.length} can be rewritten (up to 30 at a time).` : `All ${plural(questions.length, 'question')} are rewritten.`} This set stays as it is.
            </p>
          </div>
        }
        input={() => ({
          title: set.title,
          language: set.language ?? 'en',
          level,
          questions: rewritable,
        })}
        renderSuggestion={(o) => (
          <>
            <p className="font-semibold">{o.title}</p>
            <ol className="mt-1 list-decimal pl-5">
              {o.questions.map((q) => (
                <li key={q.id}>{q.prompt}</li>
              ))}
            </ol>
          </>
        )}
        acceptLabel="Save as a new set"
        onAccept={(o) => void saveVersion(o)}
      />
    </Panel>
  );
}
