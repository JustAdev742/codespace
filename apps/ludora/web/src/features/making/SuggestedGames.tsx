import { lazy, Suspense, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, ListPlus, Pencil, Play, Presentation } from 'lucide-react';
import type { SetProfile } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { useModes } from '../../lib/queries.ts';
import { useMe } from '../../lib/session.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { thumbFor } from '../../lib/queries.ts';
import { ErrorNotice, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { rankModes, suggestedSettings, type ModeFit } from '../host/fit.ts';
import { errorText } from '../reports/reportUi.tsx';

const AddToLessonDialog = lazy(() => import('../lessons/AddToLesson.tsx'));

/*
 * The games that suit a set, best first, each one press from playing: the hosting page's own
 * ranking (host/fit.ts) from the server's counts. Below them, the other things to do next with
 * the set: edit it, set it as homework, put it in a lesson.
 */

export function SuggestedGames({ setId, title }: { setId: string; title: string }) {
  const me = useMe();
  const teacher = me.data?.user?.accountType === 'teacher';
  const modes = useModes();
  const fit = useQuery({ queryKey: ['set-fit', setId], queryFn: ({ signal }) => api.get<{ profile: SetProfile; fit: ModeFit[] }>(`/api/sets/${setId}`, signal), staleTime: 60_000 });
  const [lessoning, setLessoning] = useState<string | null>(null);
  const ranked = useMemo(() => {
    if (!fit.data || !modes.data) return [];
    const catalogue = new Map(modes.data.modes.filter((m) => m.meta.status === 'playable' && !m.hidden).map((m) => [m.meta.id, m]));
    const selfPaced = new Set([...catalogue.values()].filter((m) => m.meta.pacing !== 'host').map((m) => m.meta.id));
    return rankModes(fit.data.profile, fit.data.fit.filter((f) => catalogue.has(f.id)), selfPaced)
      .filter((r) => r.playable)
      .slice(0, 3)
      .map((r) => ({ ...r, entry: catalogue.get(r.id)! }));
  }, [fit.data, modes.data]);
  const settings = fit.data ? suggestedSettings(fit.data.profile) : null;

  if (fit.isError) return <ErrorNotice message={errorText(fit.error, 'The games for this set could not be worked out.')} onRetry={() => void fit.refetch()} />;
  if (fit.isPending || modes.isPending) return <Skeleton className="h-48" />;
  return (
    <div className="flex flex-col gap-5">
      {ranked.length === 0 ? (
        <p className="rounded-[var(--radius-m)] bg-surface-2 p-3 text-sm">No game mode can play this set yet. Add a few more questions in the editor.</p>
      ) : (
        <ol className="grid grid-cols-1 gap-3 lg:grid-cols-3" aria-label="Suggested games, best first">
          {ranked.map((r, i) => (
            <li key={r.id} className={`flex flex-col gap-2 rounded-[var(--radius-l)] border bg-raised p-3 ${i === 0 ? 'border-lantern ring-1 ring-lantern' : 'border-line'}`}>
              <ModeArt thumb={thumbFor(r.entry.meta)} mode={r.entry.meta} className="aspect-[16/9] w-full rounded-[var(--radius-m)]" />
              <h3 className="font-display text-xl leading-tight font-bold">
                {i === 0 ? <span className="sr-only">Best fit: </span> : null}
                {r.entry.meta.title}
              </h3>
              <ul className="text-sm text-text-2">
                {r.reasons.slice(0, 2).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <ButtonLink to={`/host?set=${setId}&mode=${encodeURIComponent(r.id)}`} variant={i === 0 ? 'primary' : 'secondary'} size="sm" icon={<Presentation className="size-4" aria-hidden />} aria-label={`Host ${r.entry.meta.title} with ${title}`}>
                  Host
                </ButtonLink>
                <ButtonLink to={`/host?solo=1&set=${setId}&mode=${encodeURIComponent(r.id)}`} size="sm" icon={<Play className="size-4" aria-hidden />} aria-label={`Solo: play ${r.entry.meta.title} on your own`}>
                  Solo
                </ButtonLink>
                {teacher ? (
                  <Button size="sm" variant="ghost" icon={<ListPlus className="size-4" aria-hidden />} onClick={() => setLessoning(r.id)} aria-label={`Add ${r.entry.meta.title} to a lesson`}>
                    Lesson
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
      {settings ? <p className="text-sm text-text-2">Suggested: {settings.questionTimeSec} seconds a question, {settings.why}. You can change it on the hosting page.</p> : null}
      <div className="flex flex-wrap gap-2" role="group" aria-label="More to do with this set">
        <ButtonLink to={`/sets/${setId}/edit`} icon={<Pencil className="size-4" aria-hidden />}>
          Edit the set
        </ButtonLink>
        {teacher ? (
          <ButtonLink to={`/make/organise?tab=homework&set=${setId}`} icon={<ClipboardList className="size-4" aria-hidden />}>
            Set as homework
          </ButtonLink>
        ) : null}
      </div>
      {lessoning ? (
        <Suspense fallback={null}>
          <AddToLessonDialog open onOpenChange={(o) => (!o ? setLessoning(null) : undefined)} game={{ setId, modeId: lessoning, variantId: null }} what={`“${title}”`} />
        </Suspense>
      ) : null}
    </div>
  );
}
