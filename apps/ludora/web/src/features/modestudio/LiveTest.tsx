import { Suspense, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { MADE_GAME_MODE_ID, type Blueprint, type Question } from '@ludora/shared';
import type { MadeView } from '@ludora/engine';
import { useLocalRoom, type DemoSetup } from '../../demo/localRoom.ts';
import { Stage } from '../../ui/Stage.tsx';
import { Spinner } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { Segmented } from '../../ui/Segmented.tsx';
import { Announcer } from '../room/game/announce.tsx';
import { AnswerMemory } from '../room/game/answerMemory.tsx';
import { MadeGameHost, MadeGamePlayer } from '../room/modes/made-game.tsx';
import '../room/stage.css';

/*
 * The studio's live test: the real interpreter running the blueprint in a room inside the page
 * (the server's own Room, as the playable demo uses), with practice bots and you as a player.
 * It restarts whenever the game changes. Nothing is saved and nothing pays out.
 */

/** Questions for test games: a mix of types, so every part of the screen shows. */
export const SAMPLE_QUESTIONS: Question[] = [
  { id: 's1', type: 'mcq', prompt: 'Which planet is closest to the Sun?', choices: [{ id: 'a', text: 'Mercury' }, { id: 'b', text: 'Venus' }, { id: 'c', text: 'Mars' }, { id: 'd', text: 'Earth' }], correct: 'a' },
  { id: 's2', type: 'truefalse', prompt: 'Water boils at 100 °C at sea level.', correct: true },
  { id: 's3', type: 'mcq', prompt: 'How many sides does a hexagon have?', choices: [{ id: 'a', text: '5' }, { id: 'b', text: '6' }, { id: 'c', text: '7' }, { id: 'd', text: '8' }], correct: 'b' },
  { id: 's4', type: 'numeric', prompt: 'What is 7 × 8?', answer: 56 },
  { id: 's5', type: 'truefalse', prompt: 'A triangle has four sides.', correct: false },
  { id: 's6', type: 'mcq', prompt: 'Which gas do plants take in from the air?', choices: [{ id: 'a', text: 'Oxygen' }, { id: 'b', text: 'Carbon dioxide' }, { id: 'c', text: 'Helium' }], correct: 'b' },
  { id: 's7', type: 'short', prompt: 'What is the capital of France?', accepted: ['Paris'] },
  { id: 's8', type: 'mcq', prompt: 'Which continent is Egypt in?', choices: [{ id: 'a', text: 'Asia' }, { id: 'b', text: 'Africa' }, { id: 'c', text: 'Europe' }], correct: 'b' },
  { id: 's9', type: 'truefalse', prompt: 'Bats are mammals.', correct: true },
  { id: 's10', type: 'mcq', prompt: 'What is 3/4 as a percentage?', choices: [{ id: 'a', text: '34%' }, { id: 'b', text: '43%' }, { id: 'c', text: '75%' }], correct: 'c' },
];

export function LiveTest({ blueprint, bots }: { blueprint: Blueprint; bots: number }) {
  const [round, setRound] = useState(0);
  const key = JSON.stringify(blueprint);
  const setup = useMemo<DemoSetup>(
    () => ({ set: { title: 'Sample questions', questions: SAMPLE_QUESTIONS }, modeId: MADE_GAME_MODE_ID, variantId: null, bots, name: 'You', madeGame: { id: null, name: blueprint.name, blueprint } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is the blueprint; a new round restarts it.
    [key, bots, round],
  );
  return <TestRoom key={`${key}|${bots}|${round}`} setup={setup} onRestart={() => setRound((r) => r + 1)} />;
}

function TestRoom({ setup, onRestart }: { setup: DemoSetup; onRestart: () => void }) {
  const local = useLocalRoom(setup);
  const [big, setBig] = useState<'player' | 'big'>('player');
  const handle = big === 'big' ? local.host : local.player;
  const room = handle?.view ?? null;
  const status = room?.room.status;
  return (
    <Stage className="flex min-h-[28rem] flex-col gap-3 rounded-[var(--radius-l)] p-3 text-text sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Test screen"
          value={big}
          onChange={setBig}
          options={[
            { value: 'player', label: 'Your phone' },
            { value: 'big', label: 'Big screen' },
          ]}
        />
        <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={onRestart}>
          Restart test
        </Button>
      </div>
      {local.error ? (
        <p role="alert" className="font-semibold">
          The test game could not start: {local.error}
        </p>
      ) : !room || !handle ? (
        <Spinner label="Starting the test game" />
      ) : status === 'ended' && room.results ? (
        <div className="flex flex-col gap-2" role="status">
          <p className="plate plate-gold self-start text-2xl">
            <span>Game over</span>
          </p>
          <p className="font-semibold">{room.results.summary}</p>
          <ol className="flex flex-col gap-1">
            {room.results.standings.slice(0, 8).map((s) => (
              <li key={s.playerId} className="flex justify-between gap-2 rounded-[var(--radius-m)] bg-white/[0.06] px-3 py-1.5">
                <span className="truncate font-bold">
                  {s.rank}. {s.name}
                </span>
                <span className="shrink-0 text-text-2">{s.label}</span>
              </li>
            ))}
          </ol>
          <Button className="self-start" variant="primary" onClick={onRestart}>
            Play the test again
          </Button>
        </div>
      ) : room.game ? (
        <Announcer>
          <AnswerMemory>
            <Suspense fallback={<Spinner />}>
              {big === 'big' ? (
                <MadeGameHost view={room.game as MadeView} room={room} act={handle.act} fire={handle.fire} pulse={handle.pulse} gameNow={handle.gameNow} paused={status === 'paused'} />
              ) : (
                <MadeGamePlayer view={room.game as MadeView} room={room} act={handle.act} fire={handle.fire} pulse={handle.pulse} gameNow={handle.gameNow} paused={status === 'paused'} />
              )}
            </Suspense>
          </AnswerMemory>
        </Announcer>
      ) : (
        <Spinner label="Starting the test game" />
      )}
    </Stage>
  );
}
