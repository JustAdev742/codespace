import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Search, Swords } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { useSets, type SetSummary } from '../../lib/queries.ts';
import { Dialog, EmptyState, ErrorNotice, Field, Input, Select, Skeleton } from '../../ui/primitives.tsx';
import { ToggleChips } from '../../ui/game.tsx';
import { Button } from '../../ui/Button.tsx';
import { ChosenSet, SetButton } from '../host/pickers.tsx';
import type { Friend } from './data.ts';

/*
 * Challenge a friend (finish): pick a question set and a game mode, and the server opens a room
 * just for the two of you, which starts by itself once both are in. The friend gets a notification
 * with a Join button. No message is sent: only who, which game and which set.
 */

interface ChallengeMode {
  id: string;
  title: string;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function ChallengeForm({ friend, onDone }: { friend: Friend; onDone: () => void }) {
  const navigate = useNavigate();
  const [scope, setScope] = useState<'public' | 'mine'>('public');
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 250);
  const sets = useSets({ scope, ...(q ? { q } : {}), page: 1 });
  const modes = useQuery({ queryKey: ['challenges', 'modes'], queryFn: () => api.get<{ modes: ChallengeMode[] }>('/api/challenges/modes'), staleTime: 300_000 });
  const [set, setSet] = useState<SetSummary | null>(null);
  const [modeId, setModeId] = useState('classic');
  const [error, setError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => api.post<{ code: string; mode: string }>('/api/challenges', { friendId: friend.id, setId: set!.id, modeId }),
    onSuccess: (res) => {
      onDone();
      // Both of you play: you join your own room as a player, not as its host screen.
      navigate(`/room/${res.code}?as=player`);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'The challenge did not send. Check your connection and try again.'),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!set) return setError('Pick a question set first.');
    setError(null);
    send.mutate();
  };
  const list = (sets.data?.sets ?? []).filter((s) => !s.hidden);
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <section aria-labelledby="challenge-set" className="flex flex-col gap-2">
        <h3 id="challenge-set" className="text-sm font-semibold text-text">
          Question set
        </h3>
        {set ? (
          <ChosenSet set={set} onChange={() => setSet(null)} focusOnMount={false} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ToggleChips<'public' | 'mine'>
                value={scope}
                onChange={setScope}
                label="Where to look"
                options={[
                  { value: 'public', label: 'Library' },
                  { value: 'mine', label: 'My sets' },
                ]}
              />
              <label className="relative min-w-[10rem] flex-1">
                <span className="sr-only">Search sets</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
                <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search sets" className="pl-9" />
              </label>
            </div>
            {sets.isError && !sets.data ? (
              <ErrorNotice message="Question sets could not be loaded." onRetry={() => void sets.refetch()} />
            ) : sets.isPending ? (
              <Skeleton className="h-36" />
            ) : list.length === 0 ? (
              <EmptyState title={q ? 'No sets match' : scope === 'mine' ? 'You have no sets yet' : 'The library is empty'}>{q ? 'Try another word.' : 'Look in the other list.'}</EmptyState>
            ) : (
              <ul className="grid max-h-[16rem] grid-cols-1 gap-2 overflow-y-auto p-1 sm:grid-cols-2" aria-label="Question sets">
                {list.slice(0, 20).map((s) => (
                  <li key={s.id}>
                    <SetButton set={s} onPick={() => setSet(s)} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
      <Field label="Game" hint="Games that play themselves, so you both play: nobody needs to host.">
        {(p) => (
          <Select {...p} value={modeId} onChange={(e) => setModeId(e.target.value)} disabled={!modes.data}>
            {(modes.data?.modes ?? [{ id: 'classic', title: 'Classic' }]).map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {error ? <ErrorNotice title="Not sent" message={error} /> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onDone} disabled={send.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" icon={<Swords className="size-4" aria-hidden />} loading={send.isPending}>
          Send challenge
        </Button>
      </div>
    </form>
  );
}

/** "Challenge" on a friend's row. */
export function ChallengeButton({ friend }: { friend: Friend }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" icon={<Swords className="size-4" aria-hidden />} onClick={() => setOpen(true)} aria-label={`Challenge ${friend.displayName}`}>
        Challenge
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={`Challenge ${friend.displayName}`} description="One against one on a set you pick. They get a notification with a Join button, and the game starts when you are both in.">
        {open ? <ChallengeForm friend={friend} onDone={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  );
}
