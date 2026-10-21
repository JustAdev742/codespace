import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { displayNameSchema, generateName } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { Logo } from '../../art/icons.tsx';
import { Glim } from '../../art/glim/Glim.tsx';
import { Button, buttonClass } from '../../ui/Button.tsx';
import { Field, Input, Spinner } from '../../ui/primitives.tsx';
import { Stage } from '../../ui/Stage.tsx';
import { GREETERS, SIGN } from '../room/game/stage.tsx';
import { CodeEntry } from './CodeEntry.tsx';

interface RoomInfo {
  code: string;
  title: string;
  setTitle: string;
  hostName: string;
  status: string;
  requireAccount: boolean;
  generatedNames: boolean;
  joinable: boolean;
  isHost: boolean;
}

/** Three Glims peeking over the top of the card. Decoration only. */
function Greeters() {
  return (
    <div className="pointer-events-none relative z-0 -mb-6 flex items-end justify-center" aria-hidden>
      <Glim art={GREETERS[0]!} size={76} className="translate-x-2 -rotate-6" />
      <Glim art={GREETERS[1]!} size={96} pose="wave" />
      <Glim art={GREETERS[2]!} size={76} className="-translate-x-2 rotate-6" />
    </div>
  );
}

/** A white paper card on the stage, with Glims peeking over it. */
function Card({ children, as: As = 'div', onSubmit }: { children: ReactNode; as?: 'div' | 'form'; onSubmit?: (e: FormEvent) => void }) {
  return (
    <div>
      <Greeters />
      <As onSubmit={onSubmit} className="paper stage-card relative z-10 flex flex-col gap-5 px-5 py-6 sm:px-7">
        {children}
      </As>
    </div>
  );
}

export default function Join() {
  const { code } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useMe();
  const info = useQuery({ queryKey: ['room-info', code], queryFn: () => api.get<RoomInfo>(`/api/rooms/${code}`), enabled: Boolean(code), retry: false });
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>((location.state as { error?: string } | null)?.error ?? null);

  useEffect(() => {
    if (me.data?.user && !name) setName(me.data.user.displayName);
  }, [me.data, name]);
  useEffect(() => {
    if (info.data?.isHost) navigate(`/room/${info.data.code}`, { replace: true });
  }, [info.data, navigate]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!info.data) return;
    if (!info.data.generatedNames) {
      const parsed = displayNameSchema.safeParse(name);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Pick a different name.');
        return;
      }
    }
    navigate(`/room/${info.data.code}`, { state: { name: name.trim() } });
  };

  return (
    <Stage as="main" className="flex min-h-dvh flex-col overflow-x-clip! overflow-y-visible!">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-4 pb-8 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" aria-label="Ludora home" className="rounded-[10px]">
            <Logo size={24} />
          </Link>
          {code ? (
            <Link to="/play" className="flex items-center gap-1.5 rounded-[10px] px-2 py-1 text-sm font-bold">
              <ArrowLeft className="size-4" aria-hidden /> Different code
            </Link>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col justify-center gap-6 py-8">
          {!code ? (
            <>
              <div className="text-center">
                <h1 className={`font-display text-5xl leading-none font-extrabold ${SIGN}`}>Join a game</h1>
                <p className="mt-3 text-lg font-semibold text-text-2">Type the 6-digit code on the host&apos;s screen.</p>
              </div>
              <Card>
                <CodeEntry size="xl" autoFocus layout="stacked" />
              </Card>
              <p className="text-center font-semibold text-text-2">No account needed to play.</p>
            </>
          ) : info.isLoading ? (
            <div className="flex flex-col items-center text-center">
              <Spinner label="Finding the game" />
              <h1 className="font-display text-3xl font-extrabold">Finding the game</h1>
            </div>
          ) : info.isError ? (
            <Card>
              <div className="text-center">
                <h1 className="font-display text-3xl font-extrabold">No game with that code</h1>
                <p className="mt-2 text-text-2">{info.error instanceof ApiError ? info.error.message : 'Check the code and try again.'}</p>
              </div>
              <CodeEntry size="xl" layout="stacked" />
            </Card>
          ) : info.data ? (
            <Card as="form" onSubmit={submit}>
              <div>
                <p className="font-semibold text-text-2">Joining {info.data.hostName}&apos;s game</p>
                <h1 className="font-display text-[2.6rem] leading-[1.05] font-extrabold">{info.data.title}</h1>
                <p className="text-lg text-text-2">{info.data.setTitle}</p>
              </div>
              {!info.data.joinable ? (
                <p className="rounded-[14px] border-2 border-ember bg-ember/10 px-4 py-3 font-semibold">
                  {info.data.status === 'ended' ? 'This game has finished. Ask the host to start another.' : 'The host has locked this room, or the game has already started.'}
                </p>
              ) : info.data.requireAccount && (!me.data?.user || me.data.user.isGuest) ? (
                <div className="flex flex-col gap-3">
                  <p className="text-text-2">The host only lets players with an account join this game.</p>
                  <Link to={`/signin?next=/join/${info.data.code}`} className={buttonClass('primary', '2xl', 'w-full')}>
                    Sign in to join
                  </Link>
                </div>
              ) : info.data.generatedNames ? (
                <>
                  <p className="text-text-2">The host gives everyone a random name in this game.</p>
                  <Button type="submit" variant="primary" size="2xl" className="w-full">
                    Join game
                  </Button>
                </>
              ) : (
                <>
                  <Field label="Your name" error={error ?? undefined} hint="Use your first name or a nickname. Other players will see it.">
                    {(p) => (
                      <div className="flex gap-2">
                        <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoFocus autoComplete="nickname" className="h-14 border-2 text-xl font-semibold" />
                        <Button type="button" size="lg" className="h-14" onClick={() => setName(generateName())}>
                          Random
                        </Button>
                      </div>
                    )}
                  </Field>
                  <Button type="submit" variant="primary" size="2xl" className="w-full" disabled={!name.trim()}>
                    Join game
                  </Button>
                  {!me.data?.user ? (
                    <p className="text-center text-sm text-text-2">
                      <Link to={`/signin?next=/join/${info.data.code}`} className="font-semibold">
                        Sign in
                      </Link>{' '}
                      first to earn Sparks and XP from this game.
                    </p>
                  ) : null}
                </>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </Stage>
  );
}
