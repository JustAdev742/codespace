import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dices, Expand, Flag, Gauge, Minus, Pause, Play, Plus, RotateCcw, Shrink, Shuffle, Timer, Trash2, Trophy, UsersRound, Watch } from 'lucide-react';
import type { AvatarLite } from '@ludora/shared';
import { useNow } from '../../../lib/useNow.ts';
import { ordinal, plural } from '../../../lib/format.ts';
import { Input, Select } from '../../../ui/primitives.tsx';
import { Button, IconButton } from '../../../ui/Button.tsx';
import { Stage } from '../../../ui/Stage.tsx';
import { PlayerAvatar } from '../../social/parts.tsx';
import { makeTeams, pickNext } from '../../classes/classLogic.ts';
import { addScore, bump, checkInSummary, LIGHT_LABEL, LIGHTS, lightShares, poolFrom, ranked, stopwatchText, type Light, type Score } from './logic.ts';

/*
 * Classroom tools for the big screen, used on a class's tools page and as a step in a lesson:
 * a fair random picker that remembers who has had a turn, groups (shuffled, or the class's own),
 * a countdown, a stopwatch, a traffic-light check-in, and a scoreboard for anything. Each has
 * a Full screen button for the board. Nothing here talks to students' devices.
 */

export interface Person {
  id: string;
  name: string;
  avatar: AvatarLite | null;
}

export type ToolId = 'picker' | 'groups' | 'timer' | 'stopwatch' | 'checkin' | 'scoreboard';

/** A tool's panel, with a Full screen button that puts just this tool on the whole screen. */
export function ToolFrame({ id, title, icon, children }: { id: string; title: string; icon: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [full, setFull] = useState(false);
  const can = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void ref.current?.requestFullscreen().catch(() => {});
  };
  return (
    <section className={`panel flex flex-col gap-4 p-4 sm:p-5 ${full ? 'overflow-auto bg-bg p-[4vh]' : ''}`} aria-labelledby={id} ref={ref}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={id} className="flex items-center gap-2 font-display text-2xl font-bold text-text">
          <span className="grid size-9 place-items-center rounded-[var(--radius-m)] bg-surface-3 text-text-2" aria-hidden>
            {icon}
          </span>
          {title}
        </h2>
        {can ? (
          <IconButton label={full ? `Leave full screen: ${title}` : `Full screen: ${title}`} onClick={toggle}>
            {full ? <Shrink className="size-5" aria-hidden /> : <Expand className="size-5" aria-hidden />}
          </IconButton>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/* ----------------------------------- picker ----------------------------------- */

/**
 * Everyone is picked once before anyone twice. With `remembered`, who has had a turn this round
 * is kept (on the server, for a class), so "not again" holds from one lesson to the next.
 */
export function PickerTool({ people, remembered, onRemember }: { people: Person[]; remembered?: string[]; onRemember?: (picked: string[]) => void }) {
  const everyone = useMemo(() => people.map((m) => m.id), [people]);
  const [round, setRound] = useState<string[]>(() => (remembered ?? []).filter((id) => everyone.includes(id)));
  const [picked, setPicked] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const byId = new Map(people.map((m) => [m.id, m]));
  const chosen = picked ? byId.get(picked) : undefined;
  const pick = () => {
    const pool = poolFrom(everyone, round);
    const r = pickNext(pool, everyone, picked ?? round[round.length - 1] ?? null);
    if (!r.picked) return;
    // A new round started when the pool was empty: only this pick is remembered.
    const next = pool.length ? [...round, r.picked] : [r.picked];
    setPicked(r.picked);
    setRound(next);
    setHistory((h) => [r.picked!, ...h].slice(0, 6));
    onRemember?.(next);
  };
  const reset = () => {
    setRound([]);
    setPicked(null);
    setHistory([]);
    onRemember?.([]);
  };
  const left = everyone.length - round.length;
  return (
    <ToolFrame id="picker-title" title="Random picker" icon={<Dices className="size-5" />}>
      <Stage className="grid min-h-56 place-items-center rounded-[var(--radius-l)] p-6 text-center">
        <div className="flex flex-col items-center gap-3" aria-live="polite">
          {chosen ? (
            <>
              <PlayerAvatar avatar={chosen.avatar} size={112} />
              <p className="font-display text-[clamp(2.5rem,6vw,5rem)] leading-none font-extrabold break-words text-white">{chosen.name}</p>
            </>
          ) : (
            <p className="max-w-[28ch] text-lg text-white/85">Press Pick a student. Everyone is picked once before anyone is picked again.</p>
          )}
        </div>
      </Stage>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="lg" icon={<Dices className="size-5" aria-hidden />} onClick={pick} disabled={!everyone.length}>
          Pick a student
        </Button>
        <Button variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={reset} disabled={!round.length}>
          Start a new round
        </Button>
        <p className="text-sm text-text-2">{round.length ? `${plural(Math.max(0, left), 'student')} left this round.` : `${plural(everyone.length, 'student')} to pick from.`}</p>
      </div>
      {onRemember && round.length && !picked ? <p className="text-sm text-text-2">Carrying on from last time: {plural(round.length, 'student')} already picked this round.</p> : null}
      {history.length > 1 ? (
        <p className="text-sm text-text-2">
          Picked before:{' '}
          {history
            .slice(1)
            .map((id) => byId.get(id)?.name)
            .filter(Boolean)
            .join(', ')}
        </p>
      ) : null}
    </ToolFrame>
  );
}

/* ----------------------------------- groups ----------------------------------- */

export function GroupsTool({ people, classGroups = [] }: { people: Person[]; classGroups?: { id: string; name: string; memberIds: string[] }[] }) {
  const [n, setN] = useState(Math.min(4, Math.max(2, Math.floor(people.length / 4) || 2)));
  const [teams, setTeams] = useState<{ name: string; people: Person[] }[] | null>(null);
  const max = Math.max(2, Math.min(10, people.length));
  const byId = new Map(people.map((p) => [p.id, p]));
  const fromClass = () =>
    setTeams(
      classGroups
        .map((g) => ({ name: g.name, people: g.memberIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])) }))
        .filter((g) => g.people.length),
    );
  return (
    <ToolFrame id="teams-title" title="Team maker" icon={<UsersRound className="size-5" />}>
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
        <Button variant="primary" icon={<Shuffle className="size-4" aria-hidden />} onClick={() => setTeams(makeTeams(people, n).map((t, i) => ({ name: `Team ${i + 1}`, people: t })))} disabled={people.length < 2}>
          {teams ? 'Shuffle again' : 'Make teams'}
        </Button>
        {classGroups.some((g) => g.memberIds.length) ? (
          <Button icon={<UsersRound className="size-4" aria-hidden />} onClick={fromClass}>
            Use the class’s groups
          </Button>
        ) : null}
      </div>
      {teams ? (
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite" aria-label="Teams">
          {teams.map((t, i) => (
            <li key={i} className="rounded-[var(--radius-m)] border border-line bg-surface-2 p-3">
              <p className="mb-2 flex items-baseline justify-between gap-2 font-display text-xl font-bold break-words text-text">
                {t.name}
                <span className="shrink-0 text-sm font-normal text-text-2">{plural(t.people.length, 'player')}</span>
              </p>
              <ul className="flex flex-col gap-1.5">
                {t.people.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-text">
                    <PlayerAvatar avatar={m.avatar} size={28} />
                    <span className="min-w-0 break-words">{m.name}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-text-2">Splits the class into teams whose sizes differ by one at most{classGroups.length ? ', or uses the groups set up on the class page' : ''}.</p>
      )}
    </ToolFrame>
  );
}

/* --------------------------------- countdown --------------------------------- */

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function CountdownTool({ startMs = 3 * 60_000 }: { startMs?: number }) {
  const [total, setTotal] = useState(startMs);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [left, setLeft] = useState(startMs);
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
    <ToolFrame id="timer-title" title="Countdown" icon={<Timer className="size-5" />}>
      <Stage className="grid min-h-48 place-items-center rounded-[var(--radius-l)] p-6">
        <p className={`font-display text-[clamp(4rem,14vw,10rem)] leading-none font-extrabold tabular ${up ? 'text-lantern' : 'text-white'}`} aria-hidden>
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
    </ToolFrame>
  );
}

/* --------------------------------- stopwatch --------------------------------- */

export function StopwatchTool() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [base, setBase] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const now = useNow(100, startedAt !== null);
  const elapsed = base + (startedAt !== null ? Math.max(0, now - startedAt) : 0);
  return (
    <ToolFrame id="stopwatch-title" title="Stopwatch" icon={<Watch className="size-5" />}>
      <Stage className="grid min-h-48 place-items-center rounded-[var(--radius-l)] p-6">
        <p className="font-display text-[clamp(3.5rem,12vw,9rem)] leading-none font-extrabold text-white tabular" aria-hidden>
          {stopwatchText(elapsed)}
        </p>
        <span className="sr-only">{startedAt !== null ? 'Stopwatch running' : `Stopwatch at ${stopwatchText(elapsed)}`}</span>
      </Stage>
      <div className="flex flex-wrap items-center gap-2">
        {startedAt === null ? (
          <Button variant="primary" size="lg" icon={<Play className="size-5" aria-hidden />} onClick={() => setStartedAt(Date.now())}>
            {elapsed ? 'Carry on' : 'Start'}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            icon={<Pause className="size-5" aria-hidden />}
            onClick={() => {
              setBase(elapsed);
              setStartedAt(null);
            }}
          >
            Stop
          </Button>
        )}
        <Button icon={<Flag className="size-4" aria-hidden />} onClick={() => setLaps((l) => [elapsed, ...l].slice(0, 10))} disabled={!elapsed}>
          Lap
        </Button>
        <Button
          variant="ghost"
          icon={<RotateCcw className="size-4" aria-hidden />}
          onClick={() => {
            setStartedAt(null);
            setBase(0);
            setLaps([]);
          }}
          disabled={!elapsed}
        >
          Reset
        </Button>
      </div>
      {laps.length ? (
        <ol className="flex flex-wrap gap-2 text-sm" aria-label="Laps" aria-live="polite">
          {[...laps].reverse().map((l, i) => (
            <li key={i} className="rounded-full bg-surface-2 px-3 py-1 font-semibold tabular">
              Lap {i + 1}: {stopwatchText(l)}
            </li>
          ))}
        </ol>
      ) : null}
    </ToolFrame>
  );
}

/* --------------------------------- check-in --------------------------------- */

const LIGHT_STYLE: Record<Light, string> = { green: 'bg-glim text-on-accent', amber: 'bg-lantern text-on-accent', red: 'bg-ember text-on-accent' };

/**
 * A quiet "how are we doing": students hold up a colour (a card, or one, two or three fingers)
 * without a word, and the teacher counts each colour with one press. The board shows the split
 * and what it suggests.
 */
export function CheckInTool({ size }: { size?: number }) {
  const [counts, setCounts] = useState<Record<Light, number>>({ green: 0, amber: 0, red: 0 });
  const shares = lightShares(counts);
  const total = counts.green + counts.amber + counts.red;
  return (
    <ToolFrame id="checkin-title" title="Check-in" icon={<Gauge className="size-5" />}>
      <p className="text-sm text-text-2">Ask everyone to hold up a colour without a word: green, got it; amber, nearly; red, stuck. Press a colour once for each one you see.</p>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Count a colour">
        {LIGHTS.map((l) => (
          <button key={l} type="button" onClick={() => setCounts((c) => ({ ...c, [l]: c[l] + 1 }))} className={`press-soft flex min-h-24 flex-col items-center justify-center gap-1 rounded-[var(--radius-l)] p-2 font-display font-bold ${LIGHT_STYLE[l]}`}>
            <span className="text-[clamp(2rem,6vw,4rem)] leading-none tabular">{counts[l]}</span>{' '}
            <span className="text-lg">{LIGHT_LABEL[l]}</span>
            <span className="sr-only">add one</span>
          </button>
        ))}
      </div>
      <div className="flex h-6 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
        {LIGHTS.map((l) => (shares[l] ? <span key={l} className={LIGHT_STYLE[l]} style={{ width: `${shares[l]}%` }} /> : null))}
      </div>
      <p className="font-semibold" role="status">
        {checkInSummary(counts)}
        {size && total ? ` ${total} of ${size} counted.` : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        {LIGHTS.map((l) => (
          <Button key={l} size="sm" variant="ghost" icon={<Minus className="size-4" aria-hidden />} disabled={!counts[l]} onClick={() => setCounts((c) => ({ ...c, [l]: Math.max(0, c[l] - 1) }))} aria-label={`${LIGHT_LABEL[l]}: take one away`}>
            {LIGHT_LABEL[l]}
          </Button>
        ))}
        <Button size="sm" icon={<RotateCcw className="size-4" aria-hidden />} disabled={!total} onClick={() => setCounts({ green: 0, amber: 0, red: 0 })}>
          Start again
        </Button>
      </div>
    </ToolFrame>
  );
}

/* --------------------------------- scoreboard --------------------------------- */

let rowSeq = 0;

/** Points for anything: tables, houses, rows. Kept on the server for a class when `onScores` saves them. */
export function ScoreboardTool({ initial = [], onScores, suggestions = [] }: { initial?: Score[]; onScores?: (scores: Score[]) => void; suggestions?: string[] }) {
  const [scores, setScores] = useState<Score[]>(initial);
  const [name, setName] = useState('');
  const change = (next: Score[]) => {
    setScores(next);
    onScores?.(next);
  };
  const add = (label: string) => change(addScore(scores, label, `s${Date.now().toString(36)}${++rowSeq}`.slice(0, 24)));
  const rows = ranked(scores);
  return (
    <ToolFrame id="scoreboard-title" title="Scoreboard" icon={<Trophy className="size-5" />}>
      {rows.length ? (
        <ol className="flex flex-col gap-2" aria-label="Scores, highest first">
          {rows.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-m)] border border-line bg-surface-2 p-2.5">
              <span className="w-10 shrink-0 font-display text-lg font-bold text-text-2">{ordinal(s.place)}</span>
              <span className="min-w-0 flex-1 font-display text-xl font-bold break-words">{s.label}</span>
              <span className="w-16 text-right font-display text-3xl font-extrabold tabular" aria-live="polite">
                {s.points}
                <span className="sr-only"> points for {s.label}</span>
              </span>
              <span className="flex gap-1">
                <IconButton label={`Take a point from ${s.label}`} variant="secondary" onClick={() => change(bump(scores, s.id, -1))}>
                  <Minus className="size-5" aria-hidden />
                </IconButton>
                <IconButton label={`Give ${s.label} a point`} variant="secondary" onClick={() => change(bump(scores, s.id, 1))}>
                  <Plus className="size-5" aria-hidden />
                </IconButton>
                <Button size="sm" onClick={() => change(bump(scores, s.id, 5))} aria-label={`+5: give ${s.label} five points`}>
                  +5
                </Button>
                <IconButton label={`Remove ${s.label}`} onClick={() => change(scores.filter((x) => x.id !== s.id))}>
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-text-2">Add the teams, tables or houses you want to keep score for.</p>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(name);
          setName('');
        }}
      >
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm font-semibold text-text">
          Add a row
          <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Table one" />
        </label>
        <Button type="submit" icon={<Plus className="size-4" aria-hidden />} disabled={!name.trim() || scores.length >= 12}>
          Add
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {!scores.length && suggestions.length >= 2 ? (
          <Button size="sm" onClick={() => change(suggestions.slice(0, 12).reduce<Score[]>((acc, s, i) => addScore(acc, s, `g${i}${Date.now().toString(36)}`.slice(0, 24)), []))}>
            Use the class’s groups
          </Button>
        ) : null}
        {scores.length ? (
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => change(scores.map((s) => ({ ...s, points: 0 })))}>
            Scores back to zero
          </Button>
        ) : null}
      </div>
    </ToolFrame>
  );
}
