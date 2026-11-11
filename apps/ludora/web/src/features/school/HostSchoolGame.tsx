import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { CATALOG } from '@ludora/engine/catalog';
import type { SchoolTeams } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { Dialog, ErrorNotice, Field, Select } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { errorText } from '../reports/reportUi.tsx';

/*
 * Host a live game with school teams: a house match (the teams are the houses), class against
 * class (two of your classes), a tournament match (its two entrants), or an assembly (a house
 * match for a hall: the most players the server allows, and a hall screen with very large type).
 * The server builds the teams from the database; this dialog only says which kind.
 */

export type SchoolGameKind = { kind: 'houses' } | { kind: 'assembly' } | { kind: 'classes' } | { kind: 'match'; matchId: string; title: string };

const TEAM_MODES = CATALOG.filter((m) => m.meta.status === 'playable' && m.meta.teams !== 'none' && m.meta.players.max > 1).map((m) => ({ id: m.meta.id, title: m.meta.title }));

/** The address of the hall screen for a room. */
export const hallScreenUrl = (code: string, assembly: boolean) => `/school/watch/${code}${assembly ? '?hall=1' : ''}`;

export function HostSchoolGame({ open, onOpenChange, game }: { open: boolean; onOpenChange: (v: boolean) => void; game: SchoolGameKind }) {
  const navigate = useNavigate();
  const sets = useQuery({
    queryKey: ['school', 'sets'],
    queryFn: async () => {
      type L = { sets: { id: string; title: string }[] };
      const [mine, official] = await Promise.all([api.get<L>('/api/sets?scope=mine&pageSize=48'), api.get<L>('/api/sets?scope=official&pageSize=48')]);
      return { sets: [...mine.sets, ...official.sets] };
    },
    enabled: open,
  });
  const classes = useQuery({ queryKey: ['school', 'my-classes'], queryFn: () => api.get<{ classes: { id: string; name: string }[] }>('/api/school/my-classes'), enabled: open && game.kind === 'classes' });
  const [setId, setSetId] = useState('');
  const [modeId, setModeId] = useState('classic');
  const [classA, setClassA] = useState('');
  const [classB, setClassB] = useState('');
  const assembly = game.kind === 'assembly';
  const start = useMutation({
    mutationFn: () => {
      const school: SchoolTeams =
        game.kind === 'match' ? { by: 'match', matchId: game.matchId } : game.kind === 'classes' ? { by: 'classes', classIds: [classA || classes.data!.classes[0]!.id, classB || classes.data!.classes[1]!.id] } : { by: 'houses' };
      return api.post<{ code: string }>('/api/rooms', {
        setId: setId || sets.data!.sets[0]!.id,
        modeId,
        school,
        ...(assembly ? { options: { maxPlayers: 200, lateJoin: true }, common: { questionTimeSec: 30 } } : {}),
      });
    },
    onSuccess: ({ code }) => {
      if (assembly) window.open(hallScreenUrl(code, true), '_blank', 'noopener');
      navigate(`/room/${code}`);
    },
  });
  const title = game.kind === 'houses' ? 'Host a house match' : game.kind === 'assembly' ? 'Run an assembly' : game.kind === 'classes' ? 'Class against class' : `Host ${game.title}`;
  const description =
    game.kind === 'houses'
      ? 'The teams are the houses. Students without a house join the smallest team.'
      : assembly
        ? 'A house match for the hall: up to 200 players, longer to answer, and a hall screen with very large type opens in a new tab for the projector.'
        : game.kind === 'classes'
          ? 'Two of your classes in one room, each class a team.'
          : 'The teams are this match’s two entrants. The bracket fills in when the game ends.';
  const twoClasses = (classes.data?.classes.length ?? 0) >= 2;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={start.isPending} disabled={!sets.data?.sets.length || (game.kind === 'classes' && !twoClasses)} onClick={() => start.mutate()}>
            Open the room
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Question set">
          {(p) => (
            <Select {...p} value={setId} onChange={(e) => setSetId(e.target.value)}>
              {sets.data?.sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Game" hint="Team games only.">
          {(p) => (
            <Select {...p} value={modeId} onChange={(e) => setModeId(e.target.value)}>
              {TEAM_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {game.kind === 'classes' ? (
          twoClasses ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First class">
                {(p) => (
                  <Select {...p} value={classA || classes.data!.classes[0]!.id} onChange={(e) => setClassA(e.target.value)}>
                    {classes.data!.classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Second class">
                {(p) => (
                  <Select {...p} value={classB || classes.data!.classes[1]!.id} onChange={(e) => setClassB(e.target.value)}>
                    {classes.data!.classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          ) : (
            <p className="text-sm text-text-2">You need two classes for this. Make another under Classes.</p>
          )
        ) : null}
        {start.isError ? <ErrorNotice title="The room did not open" message={errorText(start.error, 'Try again in a moment.')} /> : null}
      </div>
    </Dialog>
  );
}
