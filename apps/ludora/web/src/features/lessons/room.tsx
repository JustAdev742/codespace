import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { CheckCircle2, ClipboardList, Flag, ListOrdered, MessagesSquare, StepForward } from 'lucide-react';
import type { LessonRoomView, RoomView } from '@ludora/shared';
import type { RoomHandle } from '../../lib/useRoom.ts';
import { useNow } from '../../lib/useNow.ts';
import { ordinal } from '../../lib/format.ts';
import { api, ApiError } from '../../lib/api.ts';
import { Button, buttonClass } from '../../ui/Button.tsx';
import { serverClock } from '../room/host/tools.ts';
import { useAnnounce } from '../room/game/announce.tsx';
import { HomeworkDialog } from './Homework.tsx';

/*
 * A lesson in the room: where the class is (a line in the lobby), the lesson standings and the host's
 * "Next: <step>" on the results, and the screens for a step that is not a game (an info slide, a
 * discussion, the end of the lesson). Nothing on a player's device calls the server: a device that
 * joined with only a name has no session. Plan notes are never in the room, so never here.
 */

function nextLabel(lesson: LessonRoomView): string {
  const next = lesson.steps[lesson.index + 1];
  return next ? `Next: ${next.title}` : 'Finish the lesson';
}

/** The host moves the lesson on: the same players stay in the room. */
export function NextStepButton({ room, size = 'lg', className = '' }: { room: RoomView; size?: 'md' | 'lg'; className?: string }) {
  const [busy, setBusy] = useState(false);
  const lesson = room.lesson;
  if (!lesson || lesson.screen?.kind === 'end') return null;
  const go = async () => {
    setBusy(true);
    try {
      await api.post(`/api/lessons/rooms/${room.room.code}/next`, {});
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not move on. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="primary" size={size} className={className} icon={lesson.steps[lesson.index + 1] ? <StepForward className="size-5" aria-hidden /> : <Flag className="size-5" aria-hidden />} loading={busy} onClick={() => void go()}>
      {nextLabel(lesson)}
    </Button>
  );
}

/** "Step 2 of 5" and the step's name. */
function Progress({ lesson, big }: { lesson: LessonRoomView; big: boolean }) {
  // At the end of the lesson every step is done.
  const at = lesson.screen?.kind === 'end' ? lesson.steps.length : lesson.index;
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label={at >= lesson.steps.length ? "Every step done" : `Step ${lesson.index + 1} of ${lesson.steps.length}`}>
      {lesson.steps.map((s, i) => (
        <li key={i} aria-current={i === lesson.index ? 'step' : undefined} className={`h-2 rounded-full ${big ? 'w-[clamp(1.5rem,3vw,3rem)]' : 'w-6'} ${i < at ? 'bg-glim' : i === at ? 'bg-lantern' : 'bg-white/20'}`}>
          <span className="sr-only">
            {s.title}
            {i < at ? ', done' : i === at ? ', now' : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** In the lobby: the lesson, where the class is in it, and today's goals. */
export function LessonLobbyLine({ room, big }: { room: RoomView; big: boolean }) {
  const lesson = room.lesson;
  if (!lesson) return null;
  const step = lesson.steps[lesson.index];
  return (
    <section aria-label="Lesson" className={`stage-card flex w-full flex-col gap-2 bg-white/[0.06] text-left ${big ? 'px-4 py-3' : 'px-3.5 py-3'}`}>
      <p className={`flex items-center gap-2 font-semibold text-text-2 ${big ? 'text-[clamp(1rem,1.3vw,1.5rem)]' : 'text-sm'}`}>
        <ListOrdered className="size-[1.1em] shrink-0" aria-hidden />
        <span className="min-w-0 break-words">{lesson.title}</span>
      </p>
      <p className={`font-display font-bold break-words ${big ? 'text-[clamp(1.4rem,2vw,2.4rem)] leading-tight' : 'text-xl leading-tight'}`}>
        Step {lesson.index + 1} of {lesson.steps.length}: {step?.title ?? ''}
      </p>
      <Progress lesson={lesson} big={big} />
      {lesson.goals.length ? (
        <div className={big ? 'text-[clamp(1rem,1.3vw,1.5rem)]' : 'text-sm'}>
          <p className="font-semibold">Today we will</p>
          <ul className="list-disc pl-5">
            {lesson.goals.map((g, i) => (
              <li key={i} className="break-words">
                {g}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** Lesson standings: points across the lesson so far, best first. */
export function LessonStandings({ lesson, big, limit = 10 }: { lesson: LessonRoomView; big: boolean; limit?: number }) {
  if (!lesson.standings) return null;
  const mine = lesson.standings.find((s) => s.mine);
  const shown = lesson.standings.slice(0, limit);
  return (
    <section aria-labelledby="lesson-standings" className="stage-card bg-white/[0.06] p-4">
      <h2 id="lesson-standings" className={`mb-3 font-display font-bold ${big ? 'text-[clamp(1.5rem,2vw,2.4rem)]' : 'text-2xl'}`}>
        Lesson standings
      </h2>
      {shown.length === 0 ? (
        <p className="text-text-2">Points appear here after the first game.</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {shown.map((s, i) => (
            <li key={`${s.name}-${i}`} className={`flex items-center gap-3 rounded-[var(--radius-m)] px-3 py-1.5 ${s.mine ? 'bg-lantern text-on-accent' : 'bg-white/[0.06]'} ${big ? 'text-[clamp(1.05rem,1.4vw,1.6rem)]' : ''}`}>
              <span className="w-8 shrink-0 font-display text-[1.3em] font-extrabold tabular">{s.rank}</span>
              <span className="min-w-0 flex-1 font-semibold break-words">
                {s.name}
                {s.mine ? <span className="sr-only"> (you)</span> : null}
              </span>
              <span className="shrink-0 font-display text-[1.3em] font-extrabold tabular">{s.points}</span>
              <span className="sr-only">points</span>
            </li>
          ))}
        </ol>
      )}
      {mine && !shown.includes(mine) ? (
        <p className="mt-2 font-semibold">
          You are {ordinal(mine.rank)} with {mine.points} points.
        </p>
      ) : null}
    </section>
  );
}

/** On the results of a game in a lesson: the lesson standings, and for the host the way on. */
export function LessonResults({ room, isHost }: { room: RoomView; isHost: boolean }) {
  const lesson = room.lesson;
  if (!lesson) return null;
  return (
    <>
      {lesson.standings ? <LessonStandings lesson={lesson} big={isHost} /> : null}
      {!isHost ? <p className="text-center text-sm font-semibold text-text-2">Stay on this page: the next step of the lesson opens here.</p> : null}
    </>
  );
}

function DiscussionTimer({ endsAt, seconds, room, receivedAt, big }: { endsAt: number; seconds: number; room: RoomView; receivedAt: number; big: boolean }) {
  useNow(250, true);
  const left = Math.max(0, Math.ceil((endsAt - serverClock(room, receivedAt)()) / 1000));
  useAnnounce(left === 0 ? 'Time is up.' : null, left === 0 ? 'up' : 'running');
  const share = seconds ? left / seconds : 0;
  const text = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <div className={`relative ${big ? 'size-[clamp(9rem,24vh,14rem)]' : 'size-36'}`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="44" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="8" />
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--glim)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${276.5 * share} 276.5`} />
      </svg>
      <span className={`absolute inset-0 grid place-items-center font-display font-extrabold tabular ${big ? 'text-[clamp(2.5rem,7vh,4.5rem)]' : 'text-4xl'}`} role="timer" aria-label={left ? `${left} seconds left` : 'Time is up'}>
        {left ? text : 'Time'}
      </span>
    </div>
  );
}

/** Everything a step that is not a game shows, on the big screen and every device. */
export function LessonScreen({ room, handle, isHost }: { room: RoomView; handle: RoomHandle; isHost: boolean }) {
  const lesson = room.lesson!;
  const screen = lesson.screen!;
  const big = isHost;
  const [homework, setHomework] = useState(false);
  const heading = screen.kind === 'slide' ? screen.title : screen.kind === 'discussion' ? 'Discussion' : 'Lesson complete';
  useAnnounce(heading, `${lesson.index}-${screen.kind}`);
  return (
    <div className={`mx-auto flex w-full flex-1 flex-col gap-[clamp(1rem,3vh,2rem)] ${big ? 'max-w-[96rem]' : 'max-w-2xl'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className={`font-semibold text-text-2 ${big ? 'text-[clamp(1rem,1.3vw,1.5rem)]' : 'text-sm'}`}>
            {lesson.title}
            {screen.kind !== 'end' ? ` · Step ${lesson.index + 1} of ${lesson.steps.length}` : ''}
          </p>
          <Progress lesson={lesson} big={big} />
        </div>
        {isHost && screen.kind !== 'end' ? <NextStepButton room={room} /> : null}
      </div>

      {screen.kind === 'slide' ? (
        <article className={`stage-card flex flex-col gap-[clamp(1rem,2.5vh,2rem)] bg-white/[0.06] ${big ? 'p-[clamp(1.5rem,3vw,3.5rem)]' : 'p-5'} ${screen.image ? 'lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center' : ''}`}>
          <div className="flex min-w-0 flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
            <h1 className={`font-display leading-[0.98] font-extrabold break-words ${big ? 'text-[clamp(2.75rem,5.2vw,6rem)]' : 'text-[2.4rem]'}`}>{screen.title}</h1>
            {screen.lines.length ? (
              <ul className={`flex flex-col gap-[0.6em] font-semibold ${big ? 'text-[clamp(1.3rem,2.2vw,2.6rem)]' : 'text-lg'}`}>
                {screen.lines.map((l, i) => (
                  <li key={i} className="flex gap-3 break-words">
                    <span className="mt-[0.45em] size-[0.45em] shrink-0 rounded-full bg-lantern" aria-hidden />
                    <span className="min-w-0">{l}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {screen.image ? (
            <figure className="min-w-0">
              <img src={screen.image.url} alt={screen.image.alt} className={`mx-auto w-auto max-w-full rounded-[var(--radius-m)] bg-white object-contain ${big ? 'max-h-[52vh]' : 'max-h-64'}`} />
            </figure>
          ) : null}
        </article>
      ) : screen.kind === 'discussion' ? (
        <section aria-labelledby="discussion-title" className={`stage-card flex flex-col items-center gap-[clamp(1rem,3vh,2rem)] bg-white/[0.06] text-center ${big ? 'p-[clamp(1.5rem,3vw,3.5rem)]' : 'p-5'}`}>
          <h1 id="discussion-title" className="sr-only">
            Discussion
          </h1>
          <p className={`plate plate-gold ${big ? 'text-[clamp(1.4rem,2.2vw,2.4rem)]' : 'text-xl'}`}>
            <span className="inline-flex items-center gap-2">
              <MessagesSquare className="size-[1em]" aria-hidden /> Talk to the person next to you
            </span>
          </p>
          <p className={`max-w-[40ch] font-display leading-tight font-bold break-words ${big ? 'text-[clamp(2rem,4vw,4.5rem)]' : 'text-[1.9rem]'}`}>{screen.prompt}</p>
          <DiscussionTimer endsAt={screen.endsAt} seconds={screen.seconds} room={room} receivedAt={handle.receivedAt} big={big} />
          {!isHost ? <p className="text-text-2">No answering on your device for this one: just talk.</p> : null}
        </section>
      ) : (
        <section aria-labelledby="end-title" className="flex flex-col gap-[clamp(1rem,3vh,2rem)]">
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className={`text-glim ${big ? 'size-[clamp(3rem,7vh,5rem)]' : 'size-12'}`} aria-hidden />
            <h1 id="end-title" className={`font-display leading-none font-extrabold ${big ? 'text-[clamp(3rem,6vw,6.5rem)]' : 'text-[3rem]'}`}>
              Lesson complete
            </h1>
          </div>
          <div className={`grid grid-cols-1 gap-[clamp(1rem,2.5vw,2.5rem)] ${lesson.standings ? 'lg:grid-cols-2' : 'mx-auto w-full max-w-3xl'}`}>
            {lesson.goals.length ? (
              <section aria-labelledby="today-we" className="stage-card bg-white/[0.06] p-5">
                <h2 id="today-we" className={`mb-3 font-display font-bold ${big ? 'text-[clamp(1.5rem,2vw,2.4rem)]' : 'text-2xl'}`}>
                  Today we
                </h2>
                <ul className={`flex flex-col gap-2 font-semibold ${big ? 'text-[clamp(1.15rem,1.7vw,2rem)]' : 'text-lg'}`}>
                  {lesson.goals.map((g, i) => (
                    <li key={i} className="flex gap-3 break-words">
                      <CheckCircle2 className="mt-[0.2em] size-[1em] shrink-0 text-glim" aria-hidden />
                      <span className="min-w-0">{g}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {lesson.standings ? <LessonStandings lesson={lesson} big={big} /> : null}
          </div>
          {isHost ? (
            <div className="paper stage-card flex flex-wrap items-center gap-2 p-3" role="group" aria-label="After the lesson">
              <Button size="lg" className="grow" icon={<ClipboardList className="size-5" aria-hidden />} onClick={() => setHomework(true)}>
                Set homework
              </Button>
              {lesson.runId ? (
                <Link to={`/lessons/runs/${lesson.runId}`} className={buttonClass('secondary', 'lg', 'grow')}>
                  Lesson report
                </Link>
              ) : null}
              <Link to="/lessons" className={buttonClass('ghost', 'lg', 'grow')}>
                Back to lessons
              </Link>
              {lesson.runId ? <HomeworkDialog runId={lesson.runId} classId={lesson.classId ?? null} open={homework} onOpenChange={setHomework} /> : null}
            </div>
          ) : (
            <p className="text-center font-semibold text-text-2">Thanks for taking part. You can close this page.</p>
          )}
        </section>
      )}
    </div>
  );
}
