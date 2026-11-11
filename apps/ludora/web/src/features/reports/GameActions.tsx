import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardList, Download, FileText, GitCompareArrows, Library, Lock, NotebookPen, Printer, Repeat2, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { Dialog, ErrorNotice, Field, Input, Panel, Select, Skeleton, Textarea } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { useClassList } from '../classes/classData.ts';
import { dateTimeText, errorText, questionTypeLabel } from './reportUi.tsx';
import { downloadCsv, fileDate, slug } from './csv.ts';
import { answersCsv, questionsCsv, type AnswerLine } from './logic.ts';
import type { GameReportData, QuestionView } from './gameTypes.ts';

/*
 * What a teacher can do from a game report: make a reteach set, set the missed questions as a
 * class assignment, compare with another game of the same set, open the set across all their
 * games, print, download, keep a private note, and delete the report. The server checks every
 * one of these; buttons are only hidden where the server would refuse anyway.
 */

const typeLabel = (t: string) => questionTypeLabel(t);

export function loadAnswers(gameId: string) {
  return api.get<{ answers: AnswerLine[] }>(`/api/games/${encodeURIComponent(gameId)}/answers`);
}

/** Modes an assignment can use with a short set: played alone, with how many questions each needs. */
const FOLLOW_UP_MODES = [
  { id: 'flashcard-study', title: 'Flashcard Study', min: 1 },
  { id: 'time-attack', title: 'Time Attack', min: 5 },
  { id: 'survival-run', title: 'Survival Run', min: 5 },
];

async function makeReteach(gameId: string, count: number) {
  return api.post<{ set: { id: string; title: string; questionCount: number } }>(`/api/games/${encodeURIComponent(gameId)}/reteach`, { count });
}

export function NextSteps({ data, view, onPrintClass, onPrintSlips, printingSlips }: { data: GameReportData; view: QuestionView; onPrintClass: () => void; onPrintSlips: () => void; printingSlips: boolean }) {
  const { game } = data;
  const missed = view.questions.filter((q) => q.wrong > 0).length;
  const [reteach, setReteach] = useState<{ id: string; title: string; questionCount: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState(false);
  const [compare, setCompare] = useState(false);
  const [del, setDel] = useState(false);

  const doReteach = async () => {
    setBusy('reteach');
    try {
      const r = await makeReteach(game.id, 10);
      setReteach(r.set);
      toast.success(`Made “${r.set.title}” with ${plural(r.set.questionCount, 'question')}`);
    } catch (err) {
      toast.error(errorText(err, 'The reteach set was not made. Check your connection and try again.'));
    } finally {
      setBusy(null);
    }
  };

  const doDownload = async (which: 'answers' | 'questions') => {
    const base = `ludora-${slug(game.mode, 30)}-${slug(game.setTitle, 30)}-${fileDate(new Date(game.startedAt))}`;
    if (which === 'questions') {
      downloadCsv(`${base}-questions.csv`, questionsCsv(view.questions, typeLabel));
      return;
    }
    setBusy('answers');
    try {
      const r = await loadAnswers(game.id);
      downloadCsv(`${base}-answers.csv`, answersCsv(r.answers, typeLabel));
    } catch (err) {
      toast.error(errorText(err, 'The answers did not download. Check your connection and try again.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="next-steps" className="mb-10">
      <h2 id="next-steps" className="mb-1 font-display text-2xl font-bold text-text">
        Next steps
      </h2>
      <p className="mb-3 max-w-[70ch] text-sm text-text-2">{missed ? `${plural(missed, 'question')} had at least one wrong first try.` : 'Every question was answered right first time.'}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.can.reteach ? (
          <Panel className="flex flex-col gap-2 p-4" aria-labelledby="step-reteach">
            <h3 id="step-reteach" className="flex items-center gap-2 font-bold text-text">
              <Repeat2 className="size-4 text-text-3" aria-hidden /> Reteach
            </h3>
            <p className="text-sm text-text-2">A new private set in your library with up to 10 of the most-missed questions, hardest first.</p>
            {reteach ? (
              <p className="text-sm" role="status">
                Made <Link to={`/sets/${reteach.id}`} className="underline underline-offset-2">{reteach.title}</Link> ({plural(reteach.questionCount, 'question')}).
              </p>
            ) : null}
            <div className="mt-auto flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={doReteach} loading={busy === 'reteach'} disabled={!missed}>
                Make a reteach set
              </Button>
              <Button size="sm" icon={<ClipboardList className="size-4" aria-hidden />} onClick={() => setFollowUp(true)} disabled={!missed}>
                Assign to a class
              </Button>
            </div>
          </Panel>
        ) : null}
        <Panel className="flex flex-col gap-2 p-4" aria-labelledby="step-compare">
          <h3 id="step-compare" className="flex items-center gap-2 font-bold text-text">
            <GitCompareArrows className="size-4 text-text-3" aria-hidden /> Before and after
          </h3>
          <p className="text-sm text-text-2">Compare this game with another of the same set, or see how each question has done over every game.</p>
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => setCompare(true)} disabled={!game.setId}>
              Compare with another game
            </Button>
            {game.setId ? (
              <Link to={`/reports/sets/${game.setId}`} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold">
                <Library className="size-4" aria-hidden /> This set across your games
              </Link>
            ) : null}
          </div>
        </Panel>
        <Panel className="flex flex-col gap-2 p-4" aria-labelledby="step-paper">
          <h3 id="step-paper" className="flex items-center gap-2 font-bold text-text">
            <FileText className="size-4 text-text-3" aria-hidden /> Print and download
          </h3>
          <p className="text-sm text-text-2">A one-page class report, a slip for each student to take home, or the data as spreadsheets.</p>
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <Button size="sm" icon={<Printer className="size-4" aria-hidden />} onClick={onPrintClass}>
              Class report
            </Button>
            <Button size="sm" icon={<Printer className="size-4" aria-hidden />} onClick={onPrintSlips} loading={printingSlips}>
              Student slips
            </Button>
            <Button size="sm" icon={<Download className="size-4" aria-hidden />} onClick={() => void doDownload('answers')} loading={busy === 'answers'}>
              Every answer (CSV)
            </Button>
            <Button size="sm" icon={<Download className="size-4" aria-hidden />} onClick={() => void doDownload('questions')}>
              Question analysis (CSV)
            </Button>
          </div>
        </Panel>
      </div>
      {data.can.delete ? (
        <p className="mt-3">
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setDel(true)}>
            Delete this report
          </Button>
        </p>
      ) : null}
      {followUp ? <FollowUpDialog gameId={game.id} setTitle={game.setTitle} missed={missed} existing={reteach} onMade={setReteach} onClose={() => setFollowUp(false)} /> : null}
      {compare && game.setId ? <ComparePicker gameId={game.id} setId={game.setId} onClose={() => setCompare(false)} /> : null}
      <DeleteDialog open={del} gameId={game.id} title={`${game.mode}, ${dateTimeText(game.startedAt)}`} onClose={() => setDel(false)} />
    </section>
  );
}

/* --------------------------------------- follow up --------------------------------------- */

function FollowUpDialog({ gameId, setTitle, missed, existing, onMade, onClose }: { gameId: string; setTitle: string; missed: number; existing: { id: string; questionCount: number } | null; onMade: (s: { id: string; title: string; questionCount: number }) => void; onClose: () => void }) {
  const classes = useClassList(true);
  const teaching = (classes.data?.teaching ?? []).filter((c) => !c.archived);
  const [classId, setClassId] = useState('');
  const [title, setName] = useState(`Follow-up: ${setTitle}`.slice(0, 80));
  const available = Math.min(missed, 10);
  const [modeId, setModeId] = useState(FOLLOW_UP_MODES.find((m) => m.min <= available)?.id ?? 'flashcard-study');
  const [due, setDue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ classId: string; name: string } | null>(null);
  const chosen = classId || teaching[0]?.id || '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFields({});
    if (!chosen) return setFields({ classId: 'Choose a class.' });
    if (title.trim().length < 2) return setFields({ title: 'Give it a title of at least 2 characters.' });
    setBusy(true);
    try {
      const set = existing ?? (await makeReteach(gameId, 10)).set;
      if (!existing) onMade(set as { id: string; title: string; questionCount: number });
      // The class's own assignment route: the server checks you teach the class.
      await api.post(`/api/classes/${encodeURIComponent(chosen)}/assignments`, { setId: set.id, modeId, variantId: null, title: title.trim(), instructions: 'The questions we found hardest last time. Have another go.', dueAt: due ? new Date(due).toISOString() : null });
      setDone({ classId: chosen, name: teaching.find((c) => c.id === chosen)?.name ?? 'the class' });
      toast.success('Assignment set');
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setFields(err.fields);
      setError(errorText(err, 'The assignment was not set. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => (!v ? onClose() : undefined)}
      title="Assign the missed questions"
      description="Makes a private reteach set from this game's most-missed questions (or uses the one you just made) and sets it as an assignment, played alone."
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" form="follow-up-form" loading={busy} disabled={!teaching.length}>
              Set assignment
            </Button>
          </>
        )
      }
    >
      {classes.isPending ? (
        <Skeleton className="h-40" />
      ) : classes.isError ? (
        <ErrorNotice message="Your classes did not load." onRetry={() => void classes.refetch()} />
      ) : done ? (
        <p role="status" className="text-text">
          Set for <Link to={`/classes/${done.classId}`} className="underline underline-offset-2">{done.name}</Link>. Students see it on their class page and home page.
        </p>
      ) : !teaching.length ? (
        <p className="text-text-2">
          You do not teach a class yet. <Link to="/classes?new=1" className="underline underline-offset-2">Make a class</Link> first, then come back to this report.
        </p>
      ) : (
        <form id="follow-up-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error ? <ErrorNotice title="Not set" message={error} /> : null}
          <Field label="Class" error={fields.classId}>
            {(p) => (
              <Select {...p} value={chosen} onChange={(e) => setClassId(e.target.value)}>
                {teaching.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Title" error={fields.title}>
            {(p) => <Input {...p} value={title} maxLength={80} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Game mode" hint={`The set will have up to ${plural(available, 'question')}.`} error={fields.modeId}>
            {(p) => (
              <Select {...p} value={modeId} onChange={(e) => setModeId(e.target.value)}>
                {FOLLOW_UP_MODES.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.min > available}>
                    {m.title}
                    {m.min > available ? ` (needs ${m.min} questions)` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Due (optional)" error={fields.dueAt}>
            {(p) => <Input {...p} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />}
          </Field>
        </form>
      )}
    </Dialog>
  );
}

/* ----------------------------------------- compare ----------------------------------------- */

interface ListedGame {
  id: string;
  mode: string;
  players: number;
  accuracy: number | null;
  endedAt: string;
}

function ComparePicker({ gameId, setId, onClose }: { gameId: string; setId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const list = useQuery({
    queryKey: ['reports', 'games', 'set', setId],
    queryFn: () => api.get<{ games: ListedGame[] }>(`/api/reports/games?setId=${encodeURIComponent(setId)}&sort=newest`),
  });
  const others = (list.data?.games ?? []).filter((g) => g.id !== gameId);
  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)} title="Compare with another game" description="Games you hosted with the same set. The older game is shown as before.">
      {list.isPending ? (
        <Skeleton className="h-32" />
      ) : list.isError ? (
        <ErrorNotice message={errorText(list.error, 'Your games did not load.')} onRetry={() => void list.refetch()} />
      ) : !others.length ? (
        <p className="text-text-2">This is the only game you have hosted with this set. Play it again after teaching, then compare the two here.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {others.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => navigate(`/reports/compare?a=${gameId}&b=${g.id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-m)] border border-line bg-surface-2 px-3 py-2.5 text-left hover:border-line-strong"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-text">{g.mode}</span>
                  <span className="block text-sm text-text-2">
                    <time dateTime={g.endedAt}>{dateTimeText(g.endedAt)}</time>, {plural(g.players, 'player')}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-link">Compare</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/* ----------------------------------------- delete ----------------------------------------- */

function DeleteDialog({ open, gameId, title, onClose }: { open: boolean; gameId: string; title: string; onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/api/games/${encodeURIComponent(gameId)}/report`);
      navigate('/reports');
      toast.success('Report deleted');
      // Everything but the deleted game's own report (fetching that again would only say "not found").
      void qc.invalidateQueries({ queryKey: ['reports'], predicate: (q) => q.queryKey[1] !== 'game' && q.queryKey[1] !== 'compare' });
    } catch (err) {
      setError(errorText(err, 'The report was not deleted. Check your connection and try again.'));
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (!v ? onClose() : undefined)}
      title="Delete this report?"
      description={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Keep it</Button>
          <Button variant="danger" onClick={() => void go()} loading={busy}>
            Delete report
          </Button>
        </>
      }
    >
      {error ? <ErrorNotice title="Not deleted" message={error} /> : null}
      <p className="text-sm text-text-2">This removes the game from Ludora for good: every player's result and every answer, your note on it, and the game from players' own history and from class attendance. Rewards players already earned are kept. It cannot be undone.</p>
    </Dialog>
  );
}

/* ------------------------------------------ note ------------------------------------------ */

export function NoteEditor({ gameId, note }: { gameId: string; note: GameReportData['note'] }) {
  const qc = useQueryClient();
  const [text, setText] = useState(note?.body ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put(`/api/games/${encodeURIComponent(gameId)}/note`, { body: text });
      toast.success(text.trim() ? 'Note saved' : 'Note deleted');
      await qc.invalidateQueries({ queryKey: ['reports', 'game', gameId] });
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.body ?? err.message) : 'The note was not saved. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="report-note-title">
      <h2 id="report-note-title" className="flex items-center gap-2 font-display text-2xl font-bold text-text">
        <Lock className="size-5 text-text-3" aria-hidden />
        Your private note
      </h2>
      <form onSubmit={save} noValidate className="flex flex-col gap-2">
        <Field label="Note" hint={`Only you see this. It is in your report download and is deleted with the report. ${text.length} of 2,000 characters.${note ? ` Saved ${dateTimeText(note.updatedAt)}.` : ''}`} error={error ?? undefined}>
          {(p) => <Textarea {...p} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={3} placeholder="For example: retaught fractions on Tuesday; play again next week." />}
        </Field>
        <div>
          <Button type="submit" size="sm" variant="primary" icon={<NotebookPen className="size-4" aria-hidden />} loading={busy}>
            Save note
          </Button>
        </div>
      </form>
    </Panel>
  );
}
