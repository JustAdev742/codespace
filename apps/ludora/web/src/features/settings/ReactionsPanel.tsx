import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EMOTE_GLYPHS, FREE_REACTIONS } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { ErrorNotice, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { ReactionPicker } from '../room/game/Reactions.tsx';

/*
 * Settings: which reactions are on your bar in games (finish). Everyone has the free eight; reactions
 * from the shop or Lanterns can be added once owned. The room checks ownership again on the server,
 * so a reaction you do not own is never sent, whatever is saved here.
 */

export function ReactionsPanel({ value, onSave }: { value: readonly string[]; onSave: (bar: string[]) => void }) {
  const locker = useQuery({ queryKey: ['locker'], queryFn: () => api.get<{ items: { type: string; art: { glyph?: string } }[] }>('/api/locker') });
  const owned = new Set((locker.data?.items ?? []).filter((i) => i.type === 'emote' && i.art.glyph).map((i) => i.art.glyph!));
  const canReact = [...new Set<string>([...FREE_REACTIONS, ...[...owned].filter((g) => (EMOTE_GLYPHS as readonly string[]).includes(g))])];
  const current = value.filter((e) => canReact.includes(e));
  const [draft, setDraft] = useState<string[]>(current.length ? current : [...FREE_REACTIONS]);
  const key = `${value.join(',')}|${canReact.join(',')}`;
  useEffect(() => {
    setDraft(current.length ? current : [...FREE_REACTIONS]);
    // Reset when what is saved, or what is owned, changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const changed = draft.join(',') !== (current.length ? current : [...FREE_REACTIONS]).join(',');
  return (
    <Panel id="reactions" className="flex scroll-mt-20 flex-col gap-3 p-5">
      <div>
        <h2 className="font-display text-2xl leading-tight font-bold">Reactions</h2>
        <p className="text-sm text-text-2">The reactions on your bar in games, up to eight. You can also change them during a game.</p>
      </div>
      {locker.isError ? (
        <ErrorNotice message="Your reactions did not load." onRetry={() => void locker.refetch()} />
      ) : !locker.data ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          <ReactionPicker value={draft} onChange={setDraft} canReact={canReact} all={EMOTE_GLYPHS} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!changed || !draft.length} onClick={() => onSave(draft)}>
              Save reactions
            </Button>
            <Button variant="ghost" disabled={draft.join(',') === FREE_REACTIONS.join(',')} onClick={() => setDraft([...FREE_REACTIONS])}>
              Back to the usual eight
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}
