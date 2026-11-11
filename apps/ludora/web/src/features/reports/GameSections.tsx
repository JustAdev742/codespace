import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Frown, Gauge, HandHelping, Lightbulb, ListChecks, LogOut, Meh, MessageCircleHeart, Smile, TrendingDown, TrendingUp, Users, Vote, X } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { formatNumber, ordinal, plural } from '../../lib/format.ts';
import { Badge, Dialog, EmptyState, ErrorNotice, Skeleton } from '../../ui/primitives.tsx';
import { errorText, NoValue, percent, questionTypeLabel, RateBar, seconds, TableBox, Th } from './reportUi.tsx';
import { MEMBERSHIP_LABEL, type Membership, type QuestionRow } from './logic.ts';
import type { GameReportData, GameVoice, PlayerAnswers, QuestionView, Standing } from './gameTypes.ts';

/*
 * The sections of a game report that say what to do next: misconceptions, the hardest and
 * easiest questions, who to check in with, each team, how far each player got in a self-paced
 * game, the standings with each player's own answers, and every question. Tables become
 * cards on phones, so nothing scrolls sideways.
 */

const MEMBERSHIP_TONE: Record<Membership, 'mint' | 'neutral' | 'sky'> = { class: 'mint', account: 'neutral', guest: 'sky', bot: 'neutral' };

export function MembershipBadge({ m }: { m: Membership }) {
  return <Badge tone={MEMBERSHIP_TONE[m]}>{MEMBERSHIP_LABEL[m]}</Badge>;
}

function Card({ children }: { children: ReactNode }) {
  return <li className="rounded-[var(--radius-l)] border border-line bg-raised p-4">{children}</li>;
}

function Section({ id, title, icon, intro, children }: { id: string; title: string; icon: ReactNode; intro?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-10">
      <h2 id={id} className="mb-1 flex items-center gap-2 font-display text-2xl font-bold text-text">
        <span className="text-lantern [&_svg]:size-5" aria-hidden>
          {icon}
        </span>
        {title}
      </h2>
      {intro ? <p className="mb-3 max-w-[70ch] text-sm text-text-2">{intro}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

/** Question types whose wrong answer is named by its first mistake ("Mars put 2nd, not 4th") rather than quoted whole. */
const MISTAKE_TYPES = new Set(['order', 'match', 'sort', 'blanks']);

const byId = (view: QuestionView) => new Map(view.questions.map((q) => [q.questionId, q]));

/* --------------------------------- what to teach next --------------------------------- */

function QuestionLine({ q, children }: { q: QuestionRow; children?: ReactNode }) {
  const type = questionTypeLabel(q.type);
  return (
    <>
      <p className="font-semibold text-text [overflow-wrap:anywhere]">{q.prompt}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-2">
        <span>
          <span className="font-bold text-text tabular">{percent(q.firstTryRate)}</span> right first time ({q.right} of {q.players})
        </span>
        {q.avgResponseMs > 0 ? <span>Average time {seconds(q.avgResponseMs)}</span> : null}
        {type ? <span className="text-text-3">{type}</span> : null}
      </p>
      {children}
    </>
  );
}

export function TeachNext({ view, pacing }: { view: QuestionView; pacing: string }) {
  const qs = byId(view);
  const mis = view.misconceptions.map((id) => qs.get(id)!).filter(Boolean);
  const hardest = view.hardest.map((id) => qs.get(id)!).filter(Boolean);
  const easiest = view.easiest.map((id) => qs.get(id)!).filter(Boolean);
  if (!view.questions.length) return null;
  return (
    <Section
      id="teach-next"
      title="What to teach next"
      icon={<Lightbulb />}
      intro={
        pacing === 'host'
          ? 'The wrong answers many players shared, then the hardest and easiest questions. Each player counts once per question, on their first try.'
          : 'Players went at their own pace, so each question was answered by however many reached it. Each player counts once per question, on their first try.'
      }
    >
      <h3 className="mb-2 text-sm font-semibold text-text-2">Shared wrong answers</h3>
      {mis.length ? (
        <ul className="mb-6 flex flex-col gap-2" aria-label="Shared wrong answers">
          {mis.map((q) => (
            <Card key={q.questionId}>
              <QuestionLine q={q}>
                <p className="mt-2 rounded-[var(--radius-m)] bg-surface-2 px-3 py-2 text-sm text-text">
                  <span className="font-bold">{plural(q.commonWrong!.count, 'player')}</span> {MISTAKE_TYPES.has(q.type ?? '') ? 'made the same mistake:' : 'answered'} <q className="font-bold [overflow-wrap:anywhere]">{q.commonWrong!.text}</q>
                  {q.wrong > q.commonWrong!.count ? `, out of ${plural(q.wrong, 'wrong answer')}.` : q.commonWrong!.count === 1 ? '.' : ': every wrong answer was this one.'}
                </p>
              </QuestionLine>
            </Card>
          ))}
        </ul>
      ) : (
        <p className="mb-6 text-sm text-text-3">No wrong answer was shared by more than one player (or a quarter of them). Question types without short answers in words, such as ordering, are not counted here.</p>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text-2">
            <TrendingDown className="size-4" aria-hidden /> Hardest
          </h3>
          {hardest.length ? (
            <ol className="flex flex-col gap-2" aria-label="Hardest questions">
              {hardest.map((q) => (
                <Card key={q.questionId}>
                  <QuestionLine q={q} />
                </Card>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-text-3">Needs at least two questions answered.</p>
          )}
        </div>
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text-2">
            <TrendingUp className="size-4" aria-hidden /> Easiest
          </h3>
          {easiest.length ? (
            <ol className="flex flex-col gap-2" aria-label="Easiest questions">
              {easiest.map((q) => (
                <Card key={q.questionId}>
                  <QuestionLine q={q} />
                </Card>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-text-3">Needs at least two questions answered.</p>
          )}
        </div>
      </div>
    </Section>
  );
}

/* --------------------------------- who to check in with --------------------------------- */

export function CheckIn({ data, onOpen }: { data: GameReportData; onOpen: (key: string) => void }) {
  const { participation, guessing } = data;
  const people = data.standings.filter((s) => !s.isBot).length;
  if (!people) return null;
  return (
    <Section id="check-in" title="Who to check in with" icon={<HandHelping />} intro="Prompts to have a quiet word, not verdicts: a player may have joined late, shared a device or had a slow connection.">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-text-2">Answered few questions or left early</h3>
          {participation.rows.length ? (
            <ul className="flex flex-col gap-2" aria-label="Answered few questions or left early">
              {participation.rows.map((r) => (
                <Card key={r.playerKey}>
                  <PlayerButton name={r.name} onClick={() => onOpen(r.playerKey)} />
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-2">
                    {r.fewAnswers ? (
                      <span>
                        Answered {r.answered} of the {participation.expected} most players answered.
                      </span>
                    ) : (
                      <span>Answered {r.answered}.</span>
                    )}
                    {r.leftEarly ? (
                      <Badge tone="coral">
                        <LogOut className="size-3" aria-hidden /> Left early
                      </Badge>
                    ) : null}
                  </p>
                </Card>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-3">Everyone answered at least half as many questions as most players did, and nobody left early.</p>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-text-2">Possibly guessing</h3>
          {guessing.length ? (
            <ul className="flex flex-col gap-2" aria-label="Possibly guessing">
              {guessing.map((r) => (
                <Card key={r.playerKey}>
                  <PlayerButton name={r.name} onClick={() => onOpen(r.playerKey)} />
                  <p className="mt-1 text-sm text-text-2">
                    {r.fastWrong} of {plural(r.answered, 'answer')} were wrong and much quicker than the class took on the same question. Worth asking how they found it.
                  </p>
                </Card>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-3">Nobody gave several very quick wrong answers.</p>
          )}
        </div>
      </div>
    </Section>
  );
}

function PlayerButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="relative text-left font-semibold break-words text-link underline-offset-2 after:absolute after:-inset-y-2.5 after:inset-x-0 hover:underline">
      {name}
    </button>
  );
}

/* ----------------------------------------- teams ----------------------------------------- */

export function Teams({ teams }: { teams: GameReportData['teams'] }) {
  if (!teams.length) return null;
  return (
    <Section id="teams" title="By team" icon={<Users />} intro="Each team's result, with how its players did on their first tries.">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Teams">
        {teams.map((t) => (
          <Card key={t.teamId}>
            <p className="flex items-baseline justify-between gap-3">
              <span className="font-display text-xl font-bold break-words text-text">{t.name}</span>
              {t.rank ? <span className="shrink-0 font-display text-lg font-bold text-text-2 tabular">{ordinal(t.rank)}</span> : null}
            </p>
            {t.label ? <p className="text-sm text-text-2">{t.label}</p> : null}
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-text-3">Players</dt>
                <dd className="font-bold text-text tabular">{formatNumber(t.members)}</dd>
              </div>
              <div>
                <dt className="text-text-3">Right first time</dt>
                <dd className="font-bold text-text tabular">{t.rate === null ? <NoValue label="No answers" /> : `${percent(t.rate)} (${t.correct} of ${t.answered})`}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </ul>
    </Section>
  );
}

/* ------------------------------- exit ticket and polls ------------------------------- */

const FEELINGS = [
  { id: 'great', label: 'Great', Icon: Smile },
  { id: 'okay', label: 'Okay', Icon: Meh },
  { id: 'tough', label: 'Tough', Icon: Frown },
] as const;

/** A count with a bar, the share written out as well as drawn. */
function ShareRow({ label, icon, n, total }: { label: ReactNode; icon?: ReactNode; n: number; total: number }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <span className="flex min-w-0 items-center gap-2 font-semibold text-text [overflow-wrap:anywhere]">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-3">
        <span className="text-sm text-text-2 tabular">{plural(n, 'vote')}</span>
        <RateBar rate={total ? n / total : 0} />
      </span>
    </li>
  );
}

/** How the class said it felt at the end (the exit ticket), and how it voted in each poll. Counts only, never who said what. */
export function ClassVoice({ voice }: { voice: GameVoice | null | undefined }) {
  if (!voice) return null;
  const felt = voice.feelings;
  const feltTotal = felt ? felt.great + felt.okay + felt.tough : 0;
  return (
    <>
      {felt ? (
        <Section id="exit-ticket" title="How it felt" icon={<MessageCircleHeart />} intro={feltTotal ? `The exit ticket at the end: ${plural(feltTotal, 'player')} said how the game felt. Nobody's own answer is kept.` : 'The exit ticket was on, but nobody answered it.'}>
          {feltTotal ? (
            <ul className="flex max-w-xl flex-col gap-2 rounded-[var(--radius-l)] border border-line bg-raised p-4" aria-label="How it felt">
              {FEELINGS.map(({ id, label, Icon }) => (
                <ShareRow key={id} label={label} icon={<Icon className="size-5 text-text-2" aria-hidden />} n={felt[id]} total={feltTotal} />
              ))}
            </ul>
          ) : null}
        </Section>
      ) : null}
      {voice.polls.length ? (
        <Section id="polls" title={voice.polls.length === 1 ? 'Poll' : 'Polls'} icon={<Vote />} intro="How the room voted. A poll has no right answer, so it is not in the scores or the accuracy above.">
          <ul className="flex flex-col gap-3" aria-label="Polls">
            {voice.polls.map((p) => {
              const total = p.choices.reduce((n, c) => n + c.votes, 0);
              return (
                <Card key={p.questionId}>
                  <p className="font-semibold text-text [overflow-wrap:anywhere]">{p.prompt}</p>
                  <p className="mt-0.5 mb-3 text-sm text-text-2">{total ? plural(total, 'vote') : 'Nobody voted.'}</p>
                  <ul className="flex flex-col gap-2" aria-label={`Votes: ${p.prompt}`}>
                    {p.choices.map((c) => (
                      <ShareRow key={c.id} label={c.text} n={c.votes} total={total} />
                    ))}
                  </ul>
                </Card>
              );
            })}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

/* --------------------------------------- self-paced --------------------------------------- */

export function Pace({ pace, onOpen }: { pace: NonNullable<GameReportData['pace']>; onOpen: (key: string) => void }) {
  if (!pace.length) return null;
  return (
    <Section id="pace" title="How far each player got" icon={<Gauge />} intro="In this mode everyone answers at their own pace, so questions answered and pace matter more than places.">
      <div className="hidden sm:block">
        <TableBox caption="How far each player got" minWidth={560}>
          <thead className="bg-surface-2">
            <tr>
              <Th>Player</Th>
              <Th align="right">Questions answered</Th>
              <Th>Right first time</Th>
              <Th align="right">Per minute</Th>
            </tr>
          </thead>
          <tbody>
            {pace.map((p) => (
              <tr key={p.playerKey} className="border-t border-line">
                <td className="px-3 py-2.5">
                  <PlayerButton name={p.name} onClick={() => onOpen(p.playerKey)} />
                </td>
                <td className="px-3 py-2.5 text-right text-text tabular">{formatNumber(p.answered)}</td>
                <td className="px-3 py-2.5">{p.answered ? <RateBar rate={p.correct / p.answered} /> : <NoValue />}</td>
                <td className="px-3 py-2.5 text-right text-text tabular">{p.perMinute.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      </div>
      <ul className="flex flex-col gap-2 sm:hidden" aria-label="How far each player got">
        {pace.map((p) => (
          <Card key={p.playerKey}>
            <PlayerButton name={p.name} onClick={() => onOpen(p.playerKey)} />
            <p className="mt-1 text-sm text-text-2">
              {plural(p.answered, 'question')} answered, {p.answered ? `${percent(p.correct / p.answered)} right first time` : 'none right'}, {p.perMinute.toFixed(1)} a minute.
            </p>
          </Card>
        ))}
      </ul>
    </Section>
  );
}

/* --------------------------------------- standings --------------------------------------- */

export function Standings({ standings, onOpen, showTeam }: { standings: Standing[]; onOpen: (key: string) => void; showTeam: boolean }) {
  if (!standings.length) return <EmptyState title="Nobody played">There are no players in the results for this game.</EmptyState>;
  const name = (s: Standing) =>
    s.isBot ? (
      <span className="font-semibold break-words text-text">{s.name}</span>
    ) : (
      <PlayerButton name={s.name} onClick={() => onOpen(s.playerKey)} />
    );
  return (
    <>
      <div className="hidden md:block">
        <TableBox caption="Standings" minWidth={showTeam ? 920 : 820}>
          <thead className="bg-surface-2">
            <tr>
              <Th>Rank</Th>
              <Th>Player</Th>
              {showTeam ? <Th>Team</Th> : null}
              <Th align="right">Score</Th>
              <Th align="right">Correct</Th>
              <Th align="right">Average time</Th>
              <Th align="right">Best streak</Th>
              <Th>Left early</Th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={`${s.playerKey}-${i}`} className="border-t border-line">
                <td className="px-3 py-2.5 font-display text-lg leading-none font-bold whitespace-nowrap text-text tabular">{ordinal(s.rank)}</td>
                <td className="px-3 py-2.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {name(s)}
                    <MembershipBadge m={s.membership} />
                  </span>
                </td>
                {showTeam ? <td className="px-3 py-2.5 break-words text-text-2">{s.team ?? <NoValue />}</td> : null}
                <td className="px-3 py-2.5 text-right text-text tabular">{formatNumber(s.score)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap text-text tabular">
                  {s.correct} of {s.answered}
                  {s.answered ? <span className="text-text-3"> ({percent(s.correct / s.answered)})</span> : null}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap text-text tabular">{s.answered && s.avgResponseMs > 0 ? seconds(s.avgResponseMs) : <NoValue />}</td>
                <td className="px-3 py-2.5 text-right text-text tabular">{formatNumber(s.bestStreak)}</td>
                <td className="px-3 py-2.5">{s.leftEarly ? <Badge tone="coral">Yes</Badge> : <span className="text-text-3">No</span>}</td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      </div>
      <ol className="flex flex-col gap-2 md:hidden" aria-label="Standings">
        {standings.map((s, i) => (
          <Card key={`${s.playerKey}-${i}`}>
            <div className="flex items-start gap-3">
              <span className="w-10 shrink-0 font-display text-xl leading-none font-bold text-text tabular">{ordinal(s.rank)}</span>
              <div className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {name(s)}
                  <MembershipBadge m={s.membership} />
                  {s.leftEarly ? <Badge tone="coral">Left early</Badge> : null}
                </span>
                <p className="mt-1 text-sm text-text-2">
                  {formatNumber(s.score)} points, {s.correct} of {s.answered} right{s.answered ? ` (${percent(s.correct / s.answered)})` : ''}
                  {showTeam && s.team ? `, ${s.team}` : ''}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </ol>
    </>
  );
}

/* --------------------------------------- every question --------------------------------------- */

export function QuestionAnalysis({ questions }: { questions: QuestionRow[] }) {
  if (!questions.length) {
    return (
      <EmptyState icon={<ListChecks className="size-8" />} title="No answers to show">
        Nobody answered a graded question in this game. Flashcards that players mark themselves are not right or wrong, and polls never count.
      </EmptyState>
    );
  }
  return (
    <>
      <div className="hidden md:block">
        <TableBox caption="Every question, hardest first" minWidth={820}>
          <thead className="bg-surface-2">
            <tr>
              <Th>Question</Th>
              <Th>Right first time</Th>
              <Th>Most common wrong answer</Th>
              <Th align="right">Players</Th>
              <Th align="right">Attempts</Th>
              <Th align="right">Average time</Th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => {
              const type = questionTypeLabel(q.type);
              return (
                <tr key={q.questionId} className="border-t border-line align-top">
                  <td className="min-w-[14rem] px-3 py-3">
                    <p className="font-semibold text-text [overflow-wrap:anywhere]">{q.prompt}</p>
                    {type ? <p className="text-xs text-text-3">{type}</p> : null}
                  </td>
                  <td className="px-3 py-3">
                    <RateBar rate={q.firstTryRate} />
                  </td>
                  <td className="max-w-[16rem] px-3 py-3 text-text-2">
                    {q.commonWrong ? (
                      <>
                        <span className="font-semibold text-text [overflow-wrap:anywhere]">{q.commonWrong.text}</span> ({q.commonWrong.count})
                      </>
                    ) : (
                      <NoValue />
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-text tabular">{formatNumber(q.players)}</td>
                  <td className="px-3 py-3 text-right text-text tabular">{formatNumber(q.attempts)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap text-text tabular">{q.avgResponseMs > 0 ? seconds(q.avgResponseMs) : <NoValue />}</td>
                </tr>
              );
            })}
          </tbody>
        </TableBox>
      </div>
      <ul className="flex flex-col gap-2 md:hidden" aria-label="Every question, hardest first">
        {questions.map((q) => (
          <Card key={q.questionId}>
            <QuestionLine q={q}>
              {q.commonWrong ? (
                <p className="mt-1 text-sm text-text-2">
                  Most common wrong answer: <span className="font-semibold text-text [overflow-wrap:anywhere]">{q.commonWrong.text}</span> ({q.commonWrong.count})
                </p>
              ) : null}
            </QuestionLine>
          </Card>
        ))}
      </ul>
    </>
  );
}

/* ------------------------------------ one player's answers ------------------------------------ */

export function PlayerDialog({ gameId, playerKey, onClose }: { gameId: string; playerKey: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['reports', 'game', gameId, 'player', playerKey],
    queryFn: () => api.get<PlayerAnswers>(`/api/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(playerKey ?? '')}`),
    enabled: Boolean(playerKey),
  });
  const p = q.data?.player;
  const right = q.data?.answers.filter((a) => a.correct).length ?? 0;
  return (
    <Dialog
      open={Boolean(playerKey)}
      onOpenChange={(v) => (!v ? onClose() : undefined)}
      title={p ? p.name : 'Player'}
      description={p ? `${MEMBERSHIP_LABEL[p.membership]}${p.team ? `, ${p.team}` : ''}. ${ordinal(p.rank)} place, ${right} of ${plural(q.data!.answers.length, 'question')} right first time.` : 'Loading their answers.'}
      size="lg"
    >
      {q.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : q.isError ? (
        <ErrorNotice message={errorText(q.error, 'Their answers could not be loaded. Try again.')} onRetry={() => void q.refetch()} />
      ) : !q.data!.answers.length ? (
        <p className="text-sm text-text-2">{p!.name} did not answer a graded question.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line" aria-label={`${p!.name}'s answers`}>
          {q.data!.answers.map((a) => (
            <li key={a.questionId} className="flex items-start gap-3 py-2.5">
              <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${a.correct ? 'bg-glim text-on-accent' : 'bg-ember text-on-accent'}`} aria-hidden>
                {a.correct ? <Check className="size-4" /> : <X className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-text [overflow-wrap:anywhere]">{a.prompt}</span>
                <span className="block text-sm text-text-2">
                  <span className="sr-only">{a.correct ? 'Right. ' : 'Wrong. '}</span>
                  {a.given ? (
                    <>
                      Answered <q className="[overflow-wrap:anywhere]">{a.given}</q>.{' '}
                    </>
                  ) : null}
                  {a.responseMs > 0 ? `${seconds(a.responseMs)}.` : ''}
                  {a.tries > 1 ? ` ${a.tries} tries.` : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

export function usePlayerDialog() {
  const [open, setOpen] = useState<string | null>(null);
  return { open, show: setOpen, close: () => setOpen(null) };
}
