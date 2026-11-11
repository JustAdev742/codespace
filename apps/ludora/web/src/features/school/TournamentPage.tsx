import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { Crown, Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api.ts';
import { Badge, Dialog, ErrorNotice, Input, PageHeader, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { BackLink, errorText, hasStatus, usePageTitle } from '../reports/reportUi.tsx';
import { HostSchoolGame } from './HostSchoolGame.tsx';

/*
 * /school/tournaments/:id: the bracket (knockout, round by round) or the table (round robin), and
 * every match. The teacher who set it up hosts a match as a live game, or records a result played
 * another way; students in the classes see it fill in.
 */

interface Match {
  id: string;
  round: number;
  slot: number;
  a: number | null;
  b: number | null;
  winner: number | null;
  aScore: number | null;
  bScore: number | null;
  played: boolean;
  fromGame: boolean;
}

interface Tournament {
  id: string;
  name: string;
  format: 'knockout' | 'round_robin';
  entrants: { name: string; isClass: boolean }[];
  matches: Match[];
  table: { entrant: number; played: number; won: number; drawn: number; lost: number; points: number }[] | null;
  winnerName: string | null;
  finished: boolean;
  owner: boolean;
}

function roundName(round: number, rounds: number, format: Tournament['format']): string {
  if (format === 'round_robin') return `Round ${round}`;
  if (round === rounds) return 'Final';
  if (round === rounds - 1) return 'Semi-finals';
  if (round === rounds - 2) return 'Quarter-finals';
  return `Round ${round}`;
}

function RecordDialog({ t, m, onClose }: { t: Tournament; m: Match; onClose: () => void }) {
  const qc = useQueryClient();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const save = useMutation({
    mutationFn: (winner: 'a' | 'b' | 'draw') => api.post(`/api/school/tournaments/${t.id}/matches/${m.id}`, { winner, aScore: a === '' ? null : Number(a), bScore: b === '' ? null : Number(b) }),
    onSuccess: () => {
      toast.success('Result saved');
      void qc.invalidateQueries({ queryKey: ['school', 'tournament', t.id] });
      onClose();
    },
  });
  const nameA = t.entrants[m.a!]!.name;
  const nameB = t.entrants[m.b!]!.name;
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="Record a result"
      description="For a match played another way. Scores are optional."
      footer={
        <>
          {t.format === 'round_robin' ? (
            <Button loading={save.isPending} onClick={() => save.mutate('draw')}>
              A draw
            </Button>
          ) : null}
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate('a')}>
            {nameA} won
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate('b')}>
            {nameB} won
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {nameA} score
          <Input type="number" min={0} inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {nameB} score
          <Input type="number" min={0} inputMode="numeric" value={b} onChange={(e) => setB(e.target.value)} />
        </label>
      </div>
      {save.isError ? (
        <div className="mt-3">
          <ErrorNotice title="Not saved" message={errorText(save.error, 'The result could not be saved.')} />
        </div>
      ) : null}
    </Dialog>
  );
}

function MatchCard({ t, m, onHost, onRecord }: { t: Tournament; m: Match; onHost: () => void; onRecord: () => void }) {
  const side = (i: number | null, score: number | null) => {
    const name = i === null ? (m.round === 1 && t.format === 'knockout' ? 'Bye' : 'To be decided') : t.entrants[i]!.name;
    const won = m.winner !== null && m.winner === i;
    return (
      <div className={`flex items-center justify-between gap-2 rounded-[var(--radius-s)] px-2.5 py-1.5 ${won ? 'bg-glim font-bold text-on-accent' : i === null ? 'text-text-3' : 'text-text'}`}>
        <span className="min-w-0 truncate">
          {won ? <Crown className="mr-1 inline size-4 align-[-2px]" aria-label="Winner" /> : null}
          {name}
        </span>
        {score !== null ? <span className="font-display font-extrabold tabular">{score}</span> : null}
      </div>
    );
  };
  const ready = m.a !== null && m.b !== null && !m.played;
  const label = `${m.a !== null ? t.entrants[m.a]!.name : 'To be decided'} against ${m.b !== null ? t.entrants[m.b]!.name : 'to be decided'}`;
  return (
    <li className="flex flex-col gap-1 rounded-[var(--radius-m)] border border-line bg-raised p-2" aria-label={label}>
      {side(m.a, m.aScore)}
      {side(m.b, m.bScore)}
      {m.winner === -1 ? <p className="px-2.5 text-xs font-semibold text-text-2">A draw</p> : null}
      {t.owner && ready ? (
        <div className="flex flex-wrap gap-1.5 px-1 pt-1">
          <Button size="sm" variant="primary" icon={<Play className="size-4" />} onClick={onHost}>
            Host it
          </Button>
          <Button size="sm" onClick={onRecord}>
            Record result
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export default function TournamentPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['school', 'tournament', id], queryFn: () => api.get<{ tournament: Tournament }>(`/api/school/tournaments/${id}`) });
  usePageTitle(q.data?.tournament.name ?? 'Tournament');
  const [hosting, setHosting] = useState<Match | null>(null);
  const [recording, setRecording] = useState<Match | null>(null);
  const del = useMutation({
    mutationFn: () => api.delete(`/api/school/tournaments/${id}`),
    onSuccess: () => {
      toast.success('Tournament deleted');
      void qc.invalidateQueries({ queryKey: ['school', 'tournaments'] });
      navigate('/school?tab=compete');
    },
  });
  if (q.isPending) return <Skeleton className="h-96" />;
  if (q.isError) return <ErrorNotice title={hasStatus(q.error, 404) ? 'Tournament not found' : 'That did not load'} message={errorText(q.error, 'Try again in a moment.')} onRetry={() => void q.refetch()} />;
  const t = q.data.tournament;
  const rounds = Math.max(...t.matches.map((m) => m.round));
  const byRound = Array.from({ length: rounds }, (_, i) => t.matches.filter((m) => m.round === i + 1));
  return (
    <>
      <BackLink to="/school?tab=compete">School</BackLink>
      <PageHeader
        title={t.name}
        description={`${t.format === 'knockout' ? 'Knockout' : 'Round robin'} among ${t.entrants.length} entrants.`}
        actions={
          <>
            {t.finished ? <Badge tone="mint">Won by {t.winnerName}</Badge> : <Badge>Running</Badge>}
            {t.owner ? (
              <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} loading={del.isPending} onClick={() => del.mutate()}>
                Delete
              </Button>
            ) : null}
          </>
        }
      />
      {t.finished && t.winnerName ? (
        <Panel className="mb-5 flex items-center gap-4 p-4">
          <span className="grid size-14 place-items-center rounded-[var(--radius-m)] bg-lantern text-on-accent" aria-hidden>
            <Crown className="size-7" />
          </span>
          <div>
            <p className="text-sm font-semibold text-text-3">Champion</p>
            <p className="font-display text-3xl font-bold text-text">{t.winnerName}</p>
          </div>
        </Panel>
      ) : null}
      {t.table ? (
        <Panel className="mb-5 overflow-x-auto p-4">
          <table className="w-full min-w-[420px] text-left text-sm">
            <caption className="mb-2 text-left font-display text-xl font-bold text-text">Table</caption>
            <thead className="text-text-3">
              <tr>
                <th scope="col" className="py-1.5">Entrant</th>
                <th scope="col" className="py-1.5 text-right">Played</th>
                <th scope="col" className="py-1.5 text-right">Won</th>
                <th scope="col" className="py-1.5 text-right">Drawn</th>
                <th scope="col" className="py-1.5 text-right">Lost</th>
                <th scope="col" className="py-1.5 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {t.table.map((r) => (
                <tr key={r.entrant} className="border-t border-line">
                  <th scope="row" className="py-2 font-semibold text-text">{t.entrants[r.entrant]!.name}</th>
                  <td className="py-2 text-right tabular">{r.played}</td>
                  <td className="py-2 text-right tabular">{r.won}</td>
                  <td className="py-2 text-right tabular">{r.drawn}</td>
                  <td className="py-2 text-right tabular">{r.lost}</td>
                  <td className="py-2 text-right font-display text-lg font-extrabold tabular">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : null}
      <div className="grid gap-4 md:auto-cols-[minmax(220px,1fr)] md:grid-flow-col">
        {byRound.map((ms, i) => (
          <section key={i} aria-labelledby={`round-${i + 1}`} className="flex flex-col gap-2">
            <h2 id={`round-${i + 1}`} className="font-display text-xl font-bold text-text">
              {roundName(i + 1, rounds, t.format)}
            </h2>
            <ul className="flex flex-col justify-around gap-3 md:h-full">
              {ms.map((m) => (
                <MatchCard key={m.id} t={t} m={m} onHost={() => setHosting(m)} onRecord={() => setRecording(m)} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      {hosting ? <HostSchoolGame open onOpenChange={(v) => !v && setHosting(null)} game={{ kind: 'match', matchId: hosting.id, title: `${t.entrants[hosting.a!]!.name} v ${t.entrants[hosting.b!]!.name}` }} /> : null}
      {recording ? <RecordDialog t={t} m={recording} onClose={() => setRecording(null)} /> : null}
    </>
  );
}
