import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Plus, Swords, Trash2, Trophy, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../lib/api.ts';
import { Badge, Dialog, EmptyState, ErrorNotice, Field, Input, Panel, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { Segmented } from '../../ui/Segmented.tsx';
import { errorText, percent } from '../reports/reportUi.tsx';

/*
 * Tournaments (knockout or round robin among a teacher's classes or named teams) and class
 * challenges (two classes, the same set, a week to play it; the mean of each student's best
 * accuracy decides it). Students see the ones their classes are in.
 */

interface TournamentRow {
  id: string;
  name: string;
  format: 'knockout' | 'round_robin';
  entrants: number;
  winnerName: string | null;
  finished: boolean;
  owner: boolean;
}

interface Side {
  name: string;
  members: number;
  played: number;
  accuracy: number | null;
}

interface Challenge {
  id: string;
  setTitle: string;
  mode: string;
  startsAt: string;
  endsAt: string;
  accepted: boolean;
  canAccept: boolean;
  canCancel: boolean;
  mySide: 'a' | 'b';
  a: Side;
  b: Side;
  over: boolean;
  winner: 'a' | 'b' | 'draw' | null;
}

interface MyClass {
  id: string;
  name: string;
  members: number;
}

const fieldErrors = (e: unknown) => (e instanceof ApiError ? e.fields : {});

function NewTournament({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ['school', 'my-classes'], queryFn: () => api.get<{ classes: MyClass[] }>('/api/school/my-classes'), enabled: open });
  const [name, setName] = useState('');
  const [format, setFormat] = useState<'knockout' | 'round_robin'>('knockout');
  const [picked, setPicked] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [team, setTeam] = useState('');
  const save = useMutation({
    mutationFn: () =>
      api.post<{ tournament: { id: string } }>('/api/school/tournaments', {
        name,
        format,
        entrants: [...picked.map((id) => ({ name: classes.data!.classes.find((c) => c.id === id)!.name, classId: id })), ...teams.map((t) => ({ name: t, classId: null }))],
      }),
    onSuccess: () => {
      toast.success('Tournament set up');
      void qc.invalidateQueries({ queryKey: ['school', 'tournaments'] });
      onOpenChange(false);
      setName('');
      setPicked([]);
      setTeams([]);
    },
  });
  const errs = fieldErrors(save.error);
  const count = picked.length + teams.length;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New tournament"
      description="Each match is a game. Host it from the bracket and the result fills in when the game ends."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={count < 2 || name.trim().length < 3} loading={save.isPending} onClick={() => save.mutate()}>
            Set up with {count} entrant{count === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" error={errs.name}>
          {(p) => <Input {...p} value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="Times tables tournament" />}
        </Field>
        <Segmented label="Format" value={format} onChange={setFormat} options={[{ value: 'knockout', label: 'Knockout' }, { value: 'round_robin', label: 'Round robin' }]} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-text">Your classes</legend>
          {classes.isPending ? <Skeleton className="h-10" /> : null}
          {classes.data && !classes.data.classes.length ? <p className="text-sm text-text-3">You have no classes. Add named teams below instead.</p> : null}
          {classes.data?.classes.map((c) => (
            <label key={c.id} className="flex min-h-11 items-center gap-3 rounded-[var(--radius-m)] border border-line px-3">
              <input type="checkbox" className="size-5 accent-[var(--lantern)]" checked={picked.includes(c.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))} />
              <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-2">
          <Field label="Add a named team" hint="For teams inside a class, or houses." error={errs.entrants}>
            {(p) => (
              <div className="flex gap-2">
                <Input
                  {...p}
                  value={team}
                  maxLength={30}
                  onChange={(e) => setTeam(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && team.trim().length >= 2) {
                      e.preventDefault();
                      setTeams((t) => [...t, team.trim()]);
                      setTeam('');
                    }
                  }}
                />
                <Button icon={<Plus className="size-4" />} disabled={team.trim().length < 2 || count >= 16} onClick={() => (setTeams((t) => [...t, team.trim()]), setTeam(''))}>
                  Add
                </Button>
              </div>
            )}
          </Field>
          <ul className="flex flex-wrap gap-2" aria-label="Named teams">
            {teams.map((t, i) => (
              <li key={`${t}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-surface-3 py-1 pr-1 pl-3 text-sm font-semibold">
                {t}
                <button type="button" aria-label={`Remove ${t}`} className="grid size-8 place-items-center rounded-full hover:bg-surface-2" onClick={() => setTeams((all) => all.filter((_, j) => j !== i))}>
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
        {save.isError && !Object.keys(errs).length ? <ErrorNotice title="Not set up" message={errorText(save.error, 'The tournament could not be set up.')} /> : null}
      </div>
    </Dialog>
  );
}

function NewChallenge({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ['school', 'my-classes'], queryFn: () => api.get<{ classes: MyClass[] }>('/api/school/my-classes'), enabled: open });
  const sets = useQuery({
    queryKey: ['school', 'sets'],
    queryFn: async () => {
      type L = { sets: { id: string; title: string }[] };
      const [mine, official] = await Promise.all([api.get<L>('/api/sets?scope=mine&pageSize=48'), api.get<L>('/api/sets?scope=official&pageSize=48')]);
      return { sets: [...mine.sets, ...official.sets] };
    },
    enabled: open,
  });
  const today = new Date();
  const inAWeek = new Date(Date.now() + 7 * 86_400_000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const [classId, setClassId] = useState('');
  const [otherCode, setOtherCode] = useState('');
  const [setId, setSetId] = useState('');
  const [modeId, setModeId] = useState('time-attack');
  const [from, setFrom] = useState(ymd(today));
  const [to, setTo] = useState(ymd(inAWeek));
  const save = useMutation({
    mutationFn: () => api.post('/api/school/challenges', { classId: classId || classes.data?.classes[0]?.id, otherCode, setId: setId || sets.data?.sets[0]?.id, modeId, startsAt: new Date(`${from}T00:00:00`).toISOString(), endsAt: new Date(`${to}T23:59:00`).toISOString() }),
    onSuccess: () => {
      toast.success('Challenge sent. It starts when the other teacher accepts.');
      void qc.invalidateQueries({ queryKey: ['school', 'challenges'] });
      onOpenChange(false);
    },
  });
  const errs = fieldErrors(save.error);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Challenge another class"
      description="Both classes play the same set in their own time. The class whose students do best on average wins, so class size does not matter."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={otherCode.trim().length < 4} loading={save.isPending} onClick={() => save.mutate()}>
            Send challenge
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Your class" error={errs.classId}>
          {(p) => (
            <Select {...p} value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.data?.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="The other class’s join code" hint="Ask its teacher. They accept before anything starts." error={errs.otherCode}>
          {(p) => <Input {...p} value={otherCode} maxLength={12} autoCapitalize="characters" onChange={(e) => setOtherCode(e.target.value)} />}
        </Field>
        <Field label="Question set" error={errs.setId}>
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
        <Field label="Game" error={errs.modeId}>
          {(p) => (
            <Select {...p} value={modeId} onChange={(e) => setModeId(e.target.value)}>
              <option value="time-attack">Time Attack</option>
              <option value="classic">Classic</option>
              <option value="survival-run">Survival Run</option>
            </Select>
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts" error={errs.startsAt}>
            {(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}
          </Field>
          <Field label="Ends" error={errs.endsAt}>
            {(p) => <Input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}
          </Field>
        </div>
        {save.isError && !Object.keys(errs).length ? <ErrorNotice title="Not sent" message={errorText(save.error, 'The challenge could not be sent.')} /> : null}
      </div>
    </Dialog>
  );
}

function SideScore({ side, mine, won }: { side: Side; mine: boolean; won: boolean }) {
  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-1 rounded-[var(--radius-m)] p-3 ${won ? 'bg-glim text-on-accent' : 'bg-surface-2'}`}>
      <span className={`truncate font-semibold ${won ? '' : 'text-text'}`}>
        {side.name}
        {mine ? <span className={won ? '' : 'text-text-3'}> (yours)</span> : null}
      </span>
      <span className="font-display text-3xl font-extrabold tabular">{side.accuracy === null ? 'No plays' : percent(side.accuracy)}</span>
      <span className={`text-xs ${won ? '' : 'text-text-3'}`}>
        {side.played} of {side.members} played{won ? '. Winner' : ''}
      </span>
    </div>
  );
}

export function CompetePanel({ teacher }: { teacher: boolean }) {
  const qc = useQueryClient();
  const tournaments = useQuery({ queryKey: ['school', 'tournaments'], queryFn: () => api.get<{ tournaments: TournamentRow[] }>('/api/school/tournaments') });
  const challenges = useQuery({ queryKey: ['school', 'challenges'], queryFn: () => api.get<{ challenges: Challenge[] }>('/api/school/challenges') });
  const [newT, setNewT] = useState(false);
  const [newC, setNewC] = useState(false);
  const act = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: 'accept' | 'cancel' }) => (kind === 'accept' ? api.post(`/api/school/challenges/${id}/accept`) : api.delete(`/api/school/challenges/${id}`)),
    onSuccess: (_d, v) => {
      toast.success(v.kind === 'accept' ? 'Accepted. The assignment is in both classes.' : 'Challenge withdrawn');
      void qc.invalidateQueries({ queryKey: ['school', 'challenges'] });
    },
    onError: (e) => toast.error(errorText(e, 'That did not work.')),
  });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section aria-labelledby="tournaments-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="tournaments-title" className="font-display text-2xl font-bold text-text">
            Tournaments
          </h2>
          {teacher ? (
            <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={() => setNewT(true)}>
              New tournament
            </Button>
          ) : null}
        </div>
        {tournaments.isPending ? <Skeleton className="h-32" /> : null}
        {tournaments.isError ? <ErrorNotice message={errorText(tournaments.error, 'Tournaments did not load.')} /> : null}
        {tournaments.data && !tournaments.data.tournaments.length ? (
          <EmptyState icon={<Trophy />} title="No tournaments yet">
            {teacher ? 'Set up a knockout or a round robin among your classes or teams.' : 'When your class is in a tournament, its bracket shows here.'}
          </EmptyState>
        ) : null}
        <ul className="flex flex-col gap-2">
          {tournaments.data?.tournaments.map((t) => (
            <li key={t.id}>
              <Link to={`/school/tournaments/${t.id}`} className="press-soft flex min-h-14 items-center gap-3 rounded-[var(--radius-l)] border border-line bg-raised p-3 text-text">
                <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-m)] bg-surface-3 text-text-2" aria-hidden>
                  <Trophy className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{t.name}</span>
                  <span className="block text-sm text-text-3">
                    {t.format === 'knockout' ? 'Knockout' : 'Round robin'}, {t.entrants} entrants{t.winnerName ? `. Won by ${t.winnerName}` : ''}
                  </span>
                </span>
                {t.finished ? <Badge tone="mint">Finished</Badge> : <Badge>Running</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="challenges-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="challenges-title" className="font-display text-2xl font-bold text-text">
            Class challenges
          </h2>
          {teacher ? (
            <Button variant="primary" size="sm" icon={<Swords className="size-4" />} onClick={() => setNewC(true)}>
              Challenge a class
            </Button>
          ) : null}
        </div>
        {challenges.isPending ? <Skeleton className="h-32" /> : null}
        {challenges.isError ? <ErrorNotice message={errorText(challenges.error, 'Challenges did not load.')} /> : null}
        {challenges.data && !challenges.data.challenges.length ? (
          <EmptyState icon={<Swords />} title="No class challenges">
            {teacher ? 'Challenge another class to the same set over a week.' : 'When your class takes on another, the scores show here.'}
          </EmptyState>
        ) : null}
        <ul className="flex flex-col gap-3">
          {challenges.data?.challenges.map((c) => (
            <li key={c.id}>
              <Panel as="article" className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl font-bold text-text">
                      {c.a.name} v {c.b.name}
                    </h3>
                    <p className="text-sm text-text-2">
                      {c.setTitle}, {c.mode}. {new Date(c.startsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} to {new Date(c.endsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  {!c.accepted ? <Badge tone="amber">Waiting to be accepted</Badge> : c.over ? <Badge tone="mint">{c.winner === 'draw' ? 'A draw' : c.winner ? `${c[c.winner].name} won` : 'Nobody played'}</Badge> : <Badge tone="sky">On now</Badge>}
                </div>
                {c.accepted ? (
                  <div className="flex gap-2 max-[420px]:flex-col">
                    <SideScore side={c.a} mine={c.mySide === 'a'} won={c.winner === 'a'} />
                    <SideScore side={c.b} mine={c.mySide === 'b'} won={c.winner === 'b'} />
                  </div>
                ) : null}
                {c.canAccept || c.canCancel ? (
                  <div className="flex flex-wrap gap-2">
                    {c.canAccept ? (
                      <Button variant="primary" size="sm" loading={act.isPending} onClick={() => act.mutate({ id: c.id, kind: 'accept' })}>
                        Accept challenge
                      </Button>
                    ) : null}
                    {c.canCancel ? (
                      <Button size="sm" icon={<Trash2 className="size-4" />} onClick={() => act.mutate({ id: c.id, kind: 'cancel' })}>
                        {c.canAccept ? 'Decline' : 'Withdraw'}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </Panel>
            </li>
          ))}
        </ul>
      </section>
      {teacher ? <NewTournament open={newT} onOpenChange={setNewT} /> : null}
      {teacher ? <NewChallenge open={newC} onOpenChange={setNewC} /> : null}
    </div>
  );
}
