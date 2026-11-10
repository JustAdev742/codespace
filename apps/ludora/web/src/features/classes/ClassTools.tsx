import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Dices, Pause, Play, RotateCcw, Shuffle, Timer, Users, UsersRound } from 'lucide-react';
import { useNow } from '../../lib/useNow.ts';
import { plural } from '../../lib/format.ts';
import { EmptyState, ErrorNotice, Input, PageHeader, Panel, Select } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { Stage } from '../../ui/Stage.tsx';
import { PlayerAvatar } from '../social/parts.tsx';
import { BackLink, errorText, hasStatus, usePageTitle } from '../reports/reportUi.tsx';
import { useAccountState, useClassDetail, type ClassMember } from './classData.ts';
import { makeTeams, pickNext } from './classLogic.ts';
import { ClassAccountGate, ClassPageSkeleton } from './classUi.tsx';

/*
 * /classes/:id/tools, for the teacher at the board: a fair random picker (everyone
 * is picked once before anyone twice), a team maker that splits the class into even
 * teams, and a countdown timer. All in the browser; nothing is stored.
 */

function Section({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Panel className="flex flex-col gap-4 p-4 sm:p-5" aria-labelledby={id}>
      <h2 id={id} className="flex items-center gap-2 font-display text-2xl font-bold text-text">
        <span className="grid size-9 place-items-center rounded-[var(--radius-m)] bg-surface-3 text-text-2" aria-hidden>
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </Panel>
  );
}

function Picker({ members }: { members: ClassMember[] }) {
  const everyone = useMemo(() => members.map((m) => m.id), [members]);
  const [pool, setPool] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const byId = new Map(members.map((m) => [m.id, m]));
  const chosen = picked ? byId.get(picked) : undefined;
  const pick = () => {
    const r = pickNext(pool, everyone, picked);
    setPicked(r.picked);
    setPool(r.pool);
    if (r.picked) setHistory((h) => [r.picked!, ...h].slice(0, 6));
  };
  const reset = () => {
    setPool([]);
    setPicked(null);
    setHistory([]);
  };
  const left = picked ? pool.length : everyone.length;
  return (
    <Section id="picker-title" title="Random picker" icon={<Dices className="size-5" />}>
      <Stage className="grid min-h-56 place-items-center rounded-[var(--radius-l)] p-6 text-center">
        <div className="flex flex-col items-center gap-3" aria-live="polite">
          {chosen ? (
            <>
              <PlayerAvatar avatar={chosen.avatar} size={112} />
              <p className="font-display text-5xl leading-none font-extrabold break-words text-white">{chosen.displayName}</p>
            </>
          ) : (
            <p className="max-w-[28ch] text-lg text-white/85">Press Pick a student. Everyone is picked once before anyone is picked again.</p>
          )}
        </div>
      </Stage>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="lg" icon={<Dices className="size-5" aria-hidden />} onClick={pick}>
          Pick a student
        </Button>
        <Button variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={reset} disabled={!history.length}>
          Start a new round
        </Button>
        <p className="text-sm text-text-2">{picked ? `${plural(left, 'student')} left this round.` : `${plural(everyone.length, 'student')} in the class.`}</p>
      </div>
      {history.length > 1 ? (
        <p className="text-sm text-text-2">
          Picked before:{' '}
          {history
            .slice(1)
            .map((id) => byId.get(id)?.displayName)
            .filter(Boolean)
            .join(', ')}
        </p>
      ) : null}
    </Section>
  );
}

function TeamMaker({ members }: { members: ClassMember[] }) {
  const [n, setN] = useState(Math.min(4, Math.max(2, Math.floor(members.length / 4) || 2)));
  const [teams, setTeams] = useState<ClassMember[][] | null>(null);
  const max = Math.max(2, Math.min(10, members.length));
  return (
    <Section id="teams-title" title="Team maker" icon={<UsersRound className="size-5" />}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-semibold text-text">
          Teams
          <Select value={n} onChange={(e) => setN(Number(e.target.value))} className="w-24">
            {Array.from({ length: max - 1 }, (_, i) => i + 2).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </label>
        <Button variant="primary" icon={<Shuffle className="size-4" aria-hidden />} onClick={() => setTeams(makeTeams(members, n))} disabled={members.length < 2}>
          {teams ? 'Shuffle again' : 'Make teams'}
        </Button>
      </div>
      {teams ? (
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite" aria-label="Teams">
          {teams.map((t, i) => (
            <li key={i} className="rounded-[var(--radius-m)] border border-line bg-surface-2 p-3">
              <p className="mb-2 flex items-baseline justify-between font-display text-xl font-bold text-text">
                Team {i + 1}
                <span className="text-sm font-normal text-text-2">{plural(t.length, 'player')}</span>
              </p>
              <ul className="flex flex-col gap-1.5">
                {t.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-text">
                    <PlayerAvatar avatar={m.avatar} size={28} />
                    <span className="min-w-0 break-words">{m.displayName}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-text-2">Splits the class into teams whose sizes differ by one at most.</p>
      )}
    </Section>
  );
}

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Countdown() {
  const [total, setTotal] = useState(3 * 60_000);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [left, setLeft] = useState(total);
  const [custom, setCustom] = useState('');
  const now = useNow(200, endsAt !== null);
  const remaining = endsAt !== null ? Math.max(0, endsAt - now) : left;
  const done = useRef(false);
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    if (endsAt !== null && remaining === 0 && !done.current) {
      done.current = true;
      setEndsAt(null);
      setLeft(0);
      setAnnounce('Time is up.');
    }
  }, [endsAt, remaining]);
  const choose = (ms: number) => {
    setEndsAt(null);
    setTotal(ms);
    setLeft(ms);
    setAnnounce('');
    done.current = false;
  };
  const start = () => {
    if (remaining <= 0) return;
    done.current = false;
    setAnnounce('');
    setEndsAt(Date.now() + remaining);
  };
  const pause = () => {
    setLeft(remaining);
    setEndsAt(null);
  };
  const up = remaining === 0 && total > 0;
  return (
    <Section id="timer-title" title="Countdown" icon={<Timer className="size-5" />}>
      <Stage className="grid min-h-48 place-items-center rounded-[var(--radius-l)] p-6">
        <p className={`font-display text-[clamp(4rem,14vw,8rem)] leading-none font-extrabold tabular ${up ? 'text-lantern' : 'text-white'}`} aria-hidden>
          {up ? 'Time' : clock(remaining)}
        </p>
        <span className="sr-only">{up ? 'Time is up' : `${clock(remaining)} left`}</span>
      </Stage>
      <p className="sr-only" role="status">
        {announce}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {endsAt === null ? (
          <Button variant="primary" size="lg" icon={<Play className="size-5" aria-hidden />} onClick={start} disabled={remaining <= 0}>
            {remaining < total && remaining > 0 ? 'Carry on' : 'Start'}
          </Button>
        ) : (
          <Button variant="primary" size="lg" icon={<Pause className="size-5" aria-hidden />} onClick={pause}>
            Pause
          </Button>
        )}
        <Button variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => choose(total)}>
          Reset
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Length">
        {[1, 2, 3, 5, 10].map((m) => (
          <Button key={m} size="sm" variant={total === m * 60_000 ? 'primary' : 'secondary'} aria-pressed={total === m * 60_000} onClick={() => choose(m * 60_000)}>
            {m} min
          </Button>
        ))}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const m = Number(custom);
            if (m > 0 && m <= 120) choose(Math.round(m * 60_000));
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-semibold text-text">
            Minutes
            <Input type="number" inputMode="decimal" min={0.5} max={120} step={0.5} value={custom} onChange={(e) => setCustom(e.target.value)} className="h-10 w-24" />
          </label>
          <Button size="sm" type="submit">
            Set
          </Button>
        </form>
      </div>
    </Section>
  );
}

export default function ClassTools() {
  const { id = '' } = useParams();
  const account = useAccountState();
  const detail = useClassDetail(id, account === 'account');
  usePageTitle(detail.data ? `${detail.data.class.name}: class tools` : 'Class tools');
  if (account === 'loading' || (account === 'account' && detail.isPending)) return <ClassPageSkeleton />;
  if (account === 'signedOut' || hasStatus(detail.error, 401)) return <ClassAccountGate state="signedOut" next={`/classes/${id}/tools`} />;
  if (account === 'guest') return <ClassAccountGate state="guest" next={`/classes/${id}/tools`} />;
  if (!detail.data) {
    return hasStatus(detail.error, 400, 404) ? (
      <EmptyState icon={<Users className="size-8" />} title="Class not found" action={<ButtonLink to="/classes">All classes</ButtonLink>}>
        {errorText(detail.error, 'That class does not exist.')}
      </EmptyState>
    ) : (
      <ErrorNotice message={errorText(detail.error, 'The class could not be loaded.')} onRetry={() => void detail.refetch()} />
    );
  }
  const data = detail.data;
  if (data.role !== 'teacher') {
    return (
      <EmptyState icon={<Users className="size-8" />} title="Class tools are for the teacher" action={<ButtonLink to={`/classes/${id}`}>Back to the class</ButtonLink>}>
        Your teacher uses these at the board.
      </EmptyState>
    );
  }
  return (
    <>
      <BackLink to={`/classes/${id}`}>{data.class.name}</BackLink>
      <PageHeader title="Class tools" description={`For the board: pick a student, make teams or run a timer. ${plural(data.members.length, 'student')} in ${data.class.name}.`} />
      {data.members.length === 0 ? (
        <div className="mb-4">
          <EmptyState icon={<Users className="size-8" />} title="No students yet">
            The picker and team maker use the class list. The timer works now.
          </EmptyState>
        </div>
      ) : null}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {data.members.length ? <Picker members={data.members} /> : null}
        <Countdown />
        {data.members.length > 1 ? <TeamMaker members={data.members} /> : null}
      </div>
    </>
  );
}
