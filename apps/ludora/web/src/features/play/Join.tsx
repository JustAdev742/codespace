import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { displayNameSchema, generateName } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { Logo } from '../../art/icons.tsx';
import { Button, buttonClass } from '../../ui/Button.tsx';
import { Field, Input, Spinner } from '../../ui/primitives.tsx';
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-6">
      <div className="flex items-center justify-between">
        <Link to="/" aria-label="Ludora home">
          <Logo size={24} />
        </Link>
        {code ? (
          <Link to="/play" className="flex items-center gap-1 text-sm font-semibold">
            <ArrowLeft className="size-4" /> Different code
          </Link>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col justify-center gap-6 py-10">
        {!code ? (
          <>
            <h1 className="font-display text-4xl font-extrabold">Join a game</h1>
            <p className="-mt-3 text-text-2">Type the 6-digit code on the host&apos;s screen.</p>
            <CodeEntry size="xl" autoFocus />
          </>
        ) : info.isLoading ? (
          <Spinner label="Finding the game" />
        ) : info.isError ? (
          <div className="flex flex-col gap-4 text-center">
            <h1 className="font-display text-3xl font-extrabold">No game with that code</h1>
            <p className="text-text-2">{info.error instanceof ApiError ? info.error.message : 'Check the code and try again.'}</p>
            <CodeEntry size="xl" />
          </div>
        ) : info.data ? (
          <form onSubmit={submit} className="flex flex-col gap-5">
            <div>
              <p className="text-sm font-semibold text-text-3">Joining {info.data.hostName}&apos;s game</p>
              <h1 className="font-display text-4xl font-extrabold">{info.data.title}</h1>
              <p className="text-text-2">{info.data.setTitle}</p>
            </div>
            {!info.data.joinable ? (
              <p className="rounded-[14px] border border-ember/40 bg-ember/10 px-4 py-3 text-sm font-semibold">
                {info.data.status === 'ended' ? 'This game has finished. Ask the host to start another.' : 'The host has locked this room, or the game has already started.'}
              </p>
            ) : info.data.requireAccount && (!me.data?.user || me.data.user.isGuest) ? (
              <div className="flex flex-col gap-3">
                <p className="text-text-2">The host only lets players with an account join this game.</p>
                <Link to={`/signin?next=/join/${info.data.code}`} className={buttonClass('primary', 'lg')}>
                  Sign in to join
                </Link>
              </div>
            ) : info.data.generatedNames ? (
              <>
                <p className="text-text-2">The host gives everyone a random name in this game.</p>
                <Button type="submit" variant="primary" size="xl">
                  Join game
                </Button>
              </>
            ) : (
              <>
                <Field label="Your name" error={error ?? undefined} hint="Use your first name or a nickname. Other players will see it.">
                  {(p) => (
                    <div className="flex gap-2">
                      <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoFocus autoComplete="nickname" className="h-14 text-lg" />
                      <Button type="button" size="lg" className="h-14" onClick={() => setName(generateName())}>
                        Random
                      </Button>
                    </div>
                  )}
                </Field>
                <Button type="submit" variant="primary" size="xl" disabled={!name.trim()}>
                  Join game
                </Button>
                {!me.data?.user ? (
                  <p className="text-center text-sm text-text-3">
                    <Link to={`/signin?next=/join/${info.data.code}`}>Sign in</Link> first to earn Sparks and XP from this game.
                  </p>
                ) : null}
              </>
            )}
          </form>
        ) : null}
      </div>
    </main>
  );
}
