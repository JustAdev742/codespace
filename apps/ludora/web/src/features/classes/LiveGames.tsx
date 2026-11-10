import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Presentation, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { ButtonLink } from '../../ui/Button.tsx';
import { EmptyState, ErrorNotice, Panel, Skeleton, Switch } from '../../ui/primitives.tsx';
import { dateTimeText, errorText } from '../reports/reportUi.tsx';
import { classKeys } from './classData.ts';

/*
 * Live games for a class: host one where only this class's members can join, the class's hosting
 * defaults, and attendance for each live game played (who took part, from what the server saved).
 */

interface LiveGame {
  id: string;
  mode: string;
  setTitle: string;
  endedAt: string;
  present: { id: string; displayName: string; correct: number; answered: number }[];
  absent: { id: string; displayName: string }[];
}

export function LiveGames({ classId, archived, defaults }: { classId: string; archived: boolean; defaults: { generatedNames: boolean; quiet: boolean } }) {
  const qc = useQueryClient();
  const games = useQuery({ queryKey: ['class-live', classId], queryFn: () => api.get<{ games: LiveGame[] }>(`/api/classes/${classId}/live-games`) });
  const [saving, setSaving] = useState(false);
  const save = async (patch: Partial<typeof defaults>) => {
    setSaving(true);
    try {
      await api.patch(`/api/classes/${classId}`, { hostDefaults: patch });
      await qc.invalidateQueries({ queryKey: classKeys.all });
    } catch (err) {
      toast.error(errorText(err, 'Could not save the hosting defaults. Try again.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <Panel className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold text-text">Host for this class</h2>
          {archived ? null : (
            <ButtonLink to={`/host?class=${classId}`} variant="primary" icon={<Presentation className="size-4" aria-hidden />}>
              Host a live game
            </ButtonLink>
          )}
        </div>
        <p className="text-sm text-text-2">Only this class's members can join (checked by the server), who took part is listed below, and right answers count toward the class goal.</p>
        <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
          <Switch checked={defaults.generatedNames} disabled={saving} onCheckedChange={(v) => void save({ generatedNames: v })} label="Generated names only" description="Class games start with everyone on a random friendly name." />
          <Switch checked={defaults.quiet} disabled={saving} onCheckedChange={(v) => void save({ quiet: v })} label="Quiet room" description="Class games start with every device silent." />
        </div>
      </Panel>

      <section aria-labelledby="live-attendance">
        <h2 id="live-attendance" className="mb-3 font-display text-2xl font-bold">
          Attendance
        </h2>
        {games.isError ? (
          <ErrorNotice message="Attendance could not be loaded." onRetry={() => void games.refetch()} />
        ) : games.isPending ? (
          <Skeleton className="h-28" />
        ) : !games.data.games.length ? (
          <EmptyState title="No live class games yet">Host one from here: everyone who takes part is listed, game by game.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {games.data.games.map((g) => (
              <li key={g.id} className="rounded-[var(--radius-l)] border border-line bg-raised p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="font-display text-xl font-bold break-words">
                    {g.mode}: {g.setTitle}
                  </h3>
                  <time dateTime={g.endedAt} className="text-sm text-text-3">
                    {dateTimeText(g.endedAt)}
                  </time>
                </div>
                <p className="mt-1 text-sm text-text-2">
                  {plural(g.present.length, 'student')} took part, {g.absent.length} did not.
                </p>
                <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                      <UserCheck className="size-4 text-glim" aria-hidden /> Took part
                    </p>
                    {g.present.length ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {g.present.map((p) => (
                          <li key={p.id} className="rounded-[var(--radius-s)] bg-surface-2 px-2 py-0.5 text-sm">
                            {p.displayName} <span className="text-text-3 tabular">{`${p.correct}/${p.answered}`}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-text-3">Nobody</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                      <UserX className="size-4 text-ember" aria-hidden /> Did not take part
                    </p>
                    {g.absent.length ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {g.absent.map((p) => (
                          <li key={p.id} className="rounded-[var(--radius-s)] bg-surface-2 px-2 py-0.5 text-sm">
                            {p.displayName}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-text-3">Everyone took part</p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
