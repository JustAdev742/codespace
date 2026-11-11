import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Plus } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { Dialog, Field, Input, Spinner } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { errorText } from '../reports/reportUi.tsx';
import { lessonKeys, newStepId, useLessons } from './data.ts';

/*
 * "Add to a lesson" from a set's page or the Host page: the game as it is set up, as a step on the
 * end of one of your lessons, or as the first step of a new one.
 */

export interface GameSetup {
  setId: string;
  modeId: string;
  variantId: string | null;
  settings?: Record<string, unknown>;
  common?: Record<string, unknown>;
}

const COMMON_KEYS = ['questionTimeSec', 'timeLimitSec', 'questionLimit', 'teamCount', 'shuffleQuestions', 'shuffleChoices', 'doubleFinal'];

function stepFrom(game: GameSetup) {
  const common = Object.fromEntries(Object.entries(game.common ?? {}).filter(([k, v]) => COMMON_KEYS.includes(k) && (typeof v === 'number' || typeof v === 'boolean')));
  const settings = Object.fromEntries(Object.entries(game.settings ?? {}).filter(([, v]) => ['number', 'string', 'boolean'].includes(typeof v)));
  return { id: newStepId(), kind: 'game' as const, title: '', setId: game.setId, modeId: game.modeId, variantId: game.variantId, settings, common, note: '' };
}

export default function AddToLessonDialog({ open, onOpenChange, game, what }: { open: boolean; onOpenChange: (v: boolean) => void; game: GameSetup; what: string }) {
  const qc = useQueryClient();
  const lessons = useLessons(open);
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [added, setAdded] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setAdded(null);
      setError(null);
      setTitle('');
    }
  }, [open]);
  const add = async (lesson: { id: string; title: string } | null) => {
    setBusy(lesson?.id ?? 'new');
    setError(null);
    try {
      if (lesson) {
        await api.post(`/api/lessons/${lesson.id}/steps`, stepFrom(game));
        setAdded(lesson);
      } else {
        const name = title.trim() || 'New lesson';
        const res = await api.post<{ id: string }>('/api/lessons', { title: name, step: stepFrom(game) });
        setAdded({ id: res.id, title: name });
      }
      void qc.invalidateQueries({ queryKey: lessonKeys.list, exact: true });
    } catch (err) {
      setError(errorText(err, 'It could not be added. Try again.'));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add to a lesson" description={`${what}, as the next step of a lesson. You can change it on the lesson's page.`}>
      {added ? (
        <div className="flex flex-col items-start gap-3" role="status">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-5 text-glim" aria-hidden /> Added to “{added.title}”.
          </p>
          <Link to={`/lessons/${added.id}`} className="font-semibold">
            Open the lesson
          </Link>
        </div>
      ) : lessons.isPending ? (
        <Spinner label="Loading your lessons" />
      ) : lessons.isError ? (
        <p>{errorText(lessons.error, 'Your lessons could not be loaded.')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {lessons.data.lessons.length ? (
            <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto" aria-label="Your lessons">
              {lessons.data.lessons.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-[var(--radius-m)] border border-line bg-surface-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-semibold break-words">{l.title}</span>
                    <span className="text-sm text-text-2">{plural(l.steps, 'step')}</span>
                  </span>
                  <Button size="sm" loading={busy === l.id} disabled={l.steps >= 20} onClick={() => void add(l)} aria-label={`Add to ${l.title}`}>
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <form
            className="flex flex-col gap-2 border-t border-line pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void add(null);
            }}
          >
            <Field label="Or start a new lesson with it">{(p) => <Input {...p} value={title} maxLength={80} placeholder="New lesson" onChange={(e) => setTitle(e.target.value)} />}</Field>
            <div>
              <Button type="submit" variant="primary" icon={<Plus className="size-4" aria-hidden />} loading={busy === 'new'}>
                New lesson with it
              </Button>
            </div>
          </form>
          {error ? (
            <p role="alert" className="font-semibold">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
