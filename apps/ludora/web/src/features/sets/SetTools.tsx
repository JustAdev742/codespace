import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Eye, Link2, RotateCcw, Trash2, UserPlus, X } from 'lucide-react';
import { QUESTION_TYPE_LABELS, type Question, type QuestionType } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { plural, timeAgo } from '../../lib/format.ts';
import { Button, IconButton } from '../../ui/Button.tsx';
import { Dialog, ErrorNotice, Input, Panel, Skeleton } from '../../ui/primitives.tsx';
import { answerText } from './answers.ts';
import { MathText } from './math/MathText.tsx';

/* The owner's and co-editors' tools on a set's page: sharing, statistics, versions and folders. */

const errText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/* --------------------------------- Sharing --------------------------------- */

interface Editor {
  userId: string;
  displayName: string;
  username: string | null;
}

export function ShareDialog({ setId, token, open, onOpenChange }: { setId: string; token: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const editors = useQuery({ queryKey: ['set-editors', setId], queryFn: () => api.get<{ editors: Editor[] }>(`/api/sets/${setId}/editors`), enabled: open });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['set', setId] });
  const link = useMutation({
    mutationFn: () => api.post<{ token: string }>(`/api/sets/${setId}/share-link`),
    onSuccess: () => {
      refresh();
      toast.success(token ? 'A new link was made. The old one no longer works.' : 'Share link made');
    },
    onError: (err) => toast.error(errText(err, 'The link could not be made. Try again.')),
  });
  const unlink = useMutation({
    mutationFn: () => api.delete(`/api/sets/${setId}/share-link`),
    onSuccess: () => {
      refresh();
      toast.success('The share link is off');
    },
    onError: (err) => toast.error(errText(err, 'The link could not be turned off. Try again.')),
  });
  const add = useMutation({
    mutationFn: (name: string) => api.post<{ editor: Editor }>(`/api/sets/${setId}/editors`, { username: name }),
    onSuccess: (r) => {
      setUsername('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['set-editors', setId] });
      toast.success(`${r.editor.displayName} can now edit this set`);
    },
    onError: (err) => setError(errText(err, 'They could not be added. Try again.')),
  });
  const remove = useMutation({
    mutationFn: (e: Editor) => api.delete(`/api/sets/${setId}/editors/${e.userId}`),
    onSuccess: (_r, e) => {
      void qc.invalidateQueries({ queryKey: ['set-editors', setId] });
      toast.success(`${e.displayName} can no longer edit this set`);
    },
    onError: (err) => toast.error(errText(err, 'They could not be removed. Try again.')),
  });
  const url = token ? `${window.location.origin}/sets/shared/${token}` : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return setError('Type their username.');
    add.mutate(username.trim());
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Share this set" description="Share a private link teachers can view and copy from, or choose co-editors who can change it with you.">
      <div className="flex flex-col gap-6">
        <section aria-labelledby="share-link-heading" className="flex flex-col gap-2">
          <h3 id="share-link-heading" className="font-display text-lg font-bold text-text">
            Private link
          </h3>
          <p className="text-sm text-text-2">Teachers with a Ludora account who open the link can see every question and answer, and copy the set. It does not let them change yours, and the set stays out of the library.</p>
          {url ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Input readOnly value={url} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 basis-60" />
                <Button
                  icon={<Copy className="size-4" />}
                  onClick={() =>
                    void navigator.clipboard?.writeText(url).then(
                      () => toast.success('Link copied'),
                      () => toast.message('Select the link and copy it.'),
                    )
                  }
                >
                  Copy link
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" loading={link.isPending} onClick={() => link.mutate()}>
                  Make a new link
                </Button>
                <Button size="sm" variant="ghost" loading={unlink.isPending} onClick={() => unlink.mutate()}>
                  Turn the link off
                </Button>
              </div>
            </>
          ) : (
            <div>
              <Button icon={<Link2 className="size-4" />} loading={link.isPending} onClick={() => link.mutate()}>
                Make a share link
              </Button>
            </div>
          )}
        </section>
        <section aria-labelledby="coeditors-heading" className="flex flex-col gap-2">
          <h3 id="coeditors-heading" className="font-display text-lg font-bold text-text">
            Co-editors
          </h3>
          <p className="text-sm text-text-2">Teachers you add by username can edit the questions and host the set. Only you can delete it, share it or decide who sees it.</p>
          <form onSubmit={submit} className="flex flex-wrap items-start gap-2" noValidate>
            <div className="flex min-w-0 flex-1 basis-52 flex-col gap-1">
              <label htmlFor="coeditor-username" className="text-sm font-semibold text-text">
                Teacher's username
              </label>
              <Input id="coeditor-username" value={username} autoComplete="off" maxLength={40} aria-invalid={Boolean(error)} aria-describedby={error ? 'coeditor-error' : undefined} onChange={(e) => setUsername(e.target.value)} />
              {error ? (
                <p id="coeditor-error" className="text-sm font-semibold text-[color-mix(in_oklab,var(--ember)_68%,var(--text))]">
                  {error}
                </p>
              ) : null}
            </div>
            <Button type="submit" icon={<UserPlus className="size-4" />} loading={add.isPending} className="sm:mt-6">
              Add
            </Button>
          </form>
          {editors.isLoading ? (
            <Skeleton className="h-10" />
          ) : editors.data?.editors.length ? (
            <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-m)] border border-line">
              {editors.data.editors.map((e) => (
                <li key={e.userId} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 break-words">
                    <span className="font-semibold text-text">{e.displayName}</span>
                    {e.username ? <span className="text-sm text-text-3"> @{e.username}</span> : null}
                  </span>
                  <IconButton size="sm" label={`Remove ${e.displayName}`} onClick={() => remove.mutate(e)}>
                    <X className="size-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-3">No co-editors yet.</p>
          )}
        </section>
      </div>
    </Dialog>
  );
}

/* -------------------------------- Statistics ------------------------------- */

interface StatRow {
  questionId: string;
  number: number;
  prompt: string;
  type: QuestionType;
  answers: number;
  accuracy: number;
}
interface Stats {
  plays: number;
  games: number;
  lastPlayed: string | null;
  answers: number;
  accuracy: number | null;
  hardest: StatRow[];
  questions: StatRow[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Times played, average accuracy and the hardest questions, from games actually played with this set. */
export function StatsPanel({ setId }: { setId: string }) {
  const stats = useQuery({ queryKey: ['set-stats', setId], queryFn: () => api.get<Stats>(`/api/sets/${setId}/stats`) });
  return (
    <Panel className="p-5" aria-labelledby="set-stats-heading">
      <h2 id="set-stats-heading" className="mb-3 font-display text-2xl font-bold text-text">
        How it has gone
      </h2>
      {stats.isError ? (
        <ErrorNotice message="The statistics could not be loaded." onRetry={() => stats.refetch()} />
      ) : stats.isLoading ? (
        <Skeleton className="h-24" />
      ) : !stats.data?.answers ? (
        <p className="text-text-2">No answers yet. Statistics appear here once the set has been played.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Times played', String(stats.data.plays || stats.data.games)],
              ['Games recorded', String(stats.data.games)],
              ['Answers', String(stats.data.answers)],
              ['Average accuracy', stats.data.accuracy === null ? 'None yet' : pct(stats.data.accuracy)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[var(--radius-m)] bg-surface-2 p-3">
                <dt className="text-xs font-semibold text-text-2">{label}</dt>
                <dd className="font-display text-2xl font-bold text-text tabular">{value}</dd>
              </div>
            ))}
          </dl>
          {stats.data.lastPlayed ? <p className="text-sm text-text-3">Last played {timeAgo(stats.data.lastPlayed)}.</p> : null}
          <div>
            <h3 className="mb-2 font-display text-lg font-bold text-text">Hardest questions</h3>
            {stats.data.hardest.length ? (
              <ol className="flex flex-col gap-2">
                {stats.data.hardest.map((h) => (
                  <li key={h.questionId} className="flex flex-col gap-1">
                    <span className="flex items-start justify-between gap-3 text-sm">
                      <span className="min-w-0 font-semibold break-words text-text">
                        {h.number}. <MathText text={h.prompt} />
                      </span>
                      <span className="shrink-0 font-semibold text-text-2 tabular">
                        {pct(h.accuracy)} right, {plural(h.answers, 'answer')}
                      </span>
                    </span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <span className="block h-full rounded-full bg-glim" style={{ width: pct(h.accuracy) }} />
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-text-2">Questions show here once each has been answered at least three times.</p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

/* --------------------------------- Versions -------------------------------- */

interface VersionRow {
  id: number;
  title: string;
  questionCount: number;
  createdAt: string;
  savedBy: string | null;
}

/** Earlier saves of the set: look at one, and restore it (the set as it is now is kept as a version too). */
export function VersionsDialog({ setId, open, onOpenChange, onRestored }: { setId: string; open: boolean; onOpenChange: (o: boolean) => void; onRestored?: () => void }) {
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<number | null>(null);
  const list = useQuery({ queryKey: ['set-versions', setId], queryFn: () => api.get<{ versions: VersionRow[] }>(`/api/sets/${setId}/versions`), enabled: open });
  const one = useQuery({ queryKey: ['set-version', setId, viewing], queryFn: () => api.get<{ version: { id: number; title: string; questions: Question[] } }>(`/api/sets/${setId}/versions/${viewing}`), enabled: open && viewing !== null });
  const restore = useMutation({
    mutationFn: (vid: number) => api.post(`/api/sets/${setId}/versions/${vid}/restore`),
    onSuccess: () => {
      toast.success('That version is back. The set as it was is saved as a version too.');
      void qc.invalidateQueries({ queryKey: ['set', setId] });
      void qc.invalidateQueries({ queryKey: ['set-versions', setId] });
      setViewing(null);
      onOpenChange(false);
      onRestored?.();
    },
    onError: (err) => toast.error(errText(err, 'That version could not be restored. Try again.')),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setViewing(null);
        onOpenChange(o);
      }}
      title={viewing === null ? 'Version history' : 'An earlier version'}
      description={viewing === null ? 'Each save keeps the set as it was before, the last 20 of them.' : 'Restore it to make it the set again.'}
      footer={
        viewing !== null ? (
          <>
            <Button onClick={() => setViewing(null)}>Back to the list</Button>
            <Button variant="primary" icon={<RotateCcw className="size-4" />} loading={restore.isPending} onClick={() => restore.mutate(viewing)}>
              Restore this version
            </Button>
          </>
        ) : undefined
      }
    >
      {viewing === null ? (
        list.isLoading ? (
          <Skeleton className="h-32" />
        ) : list.isError ? (
          <ErrorNotice message="The versions could not be loaded." onRetry={() => list.refetch()} />
        ) : !list.data?.versions.length ? (
          <p className="text-text-2">No earlier versions yet. One is kept each time the set is saved.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-m)] border border-line">
            {list.data.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block font-semibold break-words text-text">{v.title}</span>
                  <span className="block text-sm text-text-2">
                    {plural(v.questionCount, 'question')}, saved {timeAgo(v.createdAt)}
                    {v.savedBy ? ` by ${v.savedBy}` : ''}
                  </span>
                </span>
                <Button size="sm" icon={<Eye className="size-4" />} onClick={() => setViewing(v.id)}>
                  Look<span className="sr-only"> at the version saved {timeAgo(v.createdAt)}</span>
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : one.isLoading ? (
        <Skeleton className="h-40" />
      ) : one.data ? (
        <div className="flex flex-col gap-2">
          <p className="font-display text-lg font-bold text-text">{one.data.version.title}</p>
          <ol className="flex flex-col divide-y divide-line">
            {one.data.version.questions.map((q, i) => (
              <li key={q.id} className="py-2">
                <p className="text-xs font-semibold text-text-3">
                  {i + 1}. {QUESTION_TYPE_LABELS[q.type]}
                </p>
                <p className="font-semibold break-words text-text">
                  <MathText text={q.prompt} />
                </p>
                <p className="text-sm break-words text-text-2">
                  Answer: <MathText text={answerText(q)} />
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <ErrorNotice message="That version could not be loaded." onRetry={() => one.refetch()} />
      )}
    </Dialog>
  );
}

/* --------------------------------- Folders --------------------------------- */

/** The owner files a set in one of their folders (or a new one). */
export function FolderDialog({ setId, folder, open, onOpenChange }: { setId: string; folder: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(folder ?? '');
  const folders = useQuery({ queryKey: ['sets-organise'], queryFn: () => api.get<{ folders: { name: string; count: number }[] }>('/api/sets/organise'), enabled: open });
  const save = useMutation({
    mutationFn: (value: string | null) => api.patch(`/api/sets/${setId}/organise`, { folder: value }),
    onSuccess: (_r, value) => {
      void qc.invalidateQueries({ queryKey: ['set', setId] });
      void qc.invalidateQueries({ queryKey: ['sets'] });
      void qc.invalidateQueries({ queryKey: ['sets-organise'] });
      toast.success(value ? `Filed in ${value}` : 'Taken out of its folder');
      onOpenChange(false);
    },
    onError: (err) => toast.error(errText(err, 'The folder could not be changed. Try again.')),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Folder"
      description="Folders keep your own sets tidy. Only you see them."
      footer={
        <>
          {folder ? (
            <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => save.mutate(null)}>
              Take out of folder
            </Button>
          ) : null}
          <Button variant="primary" loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate(name.trim())}>
            Save
          </Button>
        </>
      }
    >
      <label htmlFor="set-folder" className="text-sm font-semibold text-text">
        Folder name
      </label>
      <Input id="set-folder" list="set-folder-names" value={name} maxLength={40} autoComplete="off" onChange={(e) => setName(e.target.value)} className="mt-1" />
      <datalist id="set-folder-names">
        {(folders.data?.folders ?? []).map((f) => (
          <option key={f.name} value={f.name} />
        ))}
      </datalist>
      <p className="mt-1 text-xs text-text-3">Pick one of your folders or type a new name.</p>
    </Dialog>
  );
}
