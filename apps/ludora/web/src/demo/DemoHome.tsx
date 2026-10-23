import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Shuffle } from 'lucide-react';
import { displayNameSchema, generateName } from '@ludora/shared';
import { Logo } from '../art/icons.tsx';
import { Stage } from '../ui/Stage.tsx';
import { Button } from '../ui/Button.tsx';
import { Badge, Field, Input, Panel, Select, Switch } from '../ui/primitives.tsx';
import { COMPACT_SCENE, GlimCrowd } from '../features/home/GlimCrowd.tsx';
import { ChosenSet, ModeGrid, SetButton, type SetLike } from '../features/host/pickers.tsx';
import { sound } from '../lib/sound/engine.ts';
import { DEMO_MODES, SETS, choiceToParams, readChoice, readName, readSound, resolveChoice, saveChoice, saveName, saveSound, type DemoChoice, type SoundPrefs } from './setup.ts';

/*
 * The demo's start page: who you are, what to play and with how many bots.
 * Everything starts on a sensible choice, so Start game works straight away.
 */

const asSetLike = (s: (typeof SETS)[number]): SetLike => ({ title: s.title, subject: s.subject, questionCount: s.questions.length, cover: s.cover });

const botsLabel = (n: number) => (n === 0 ? 'No bots, just you' : `${n} practice ${n === 1 ? 'bot' : 'bots'}`);

export default function DemoHome() {
  const navigate = useNavigate();
  const [name, setName] = useState(readName);
  const [picked, setPicked] = useState<DemoChoice>(readChoice);
  const [pickingSet, setPickingSet] = useState(false);
  // Whether the set was just picked or the picker just opened, so focus follows the picker folding and unfolding.
  const [setFocus, setSetFocus] = useState<'chosen' | 'picker' | null>(null);
  const [prefs, setPrefs] = useState<SoundPrefs>(readSound);
  const nameError = useMemo(() => {
    const parsed = displayNameSchema.safeParse(name);
    return parsed.success ? undefined : (parsed.error.issues[0]?.message ?? 'Pick a different name.');
  }, [name]);
  const { set, mode, variant, bots, range, choice } = resolveChoice(picked);
  const firstSet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Play the demo | Ludora';
  }, []);
  useEffect(() => sound.setPrefs(prefs), [prefs]);
  useEffect(() => {
    if (pickingSet && setFocus === 'picker') firstSet.current?.querySelector<HTMLElement>('button')?.focus();
  }, [pickingSet, setFocus]);

  const changePrefs = (next: Partial<SoundPrefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    saveSound(merged);
  };

  const start = () => {
    if (nameError) {
      document.getElementById('demo-name')?.focus();
      return;
    }
    saveName(name.trim());
    saveChoice(choice);
    navigate(`/play?${choiceToParams(choice)}`);
  };

  const title = variant?.meta.title ?? mode.meta.title;
  return (
    <div className="flex min-h-dvh flex-col">
      <Stage lanterns={false} className="px-4 pt-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1120px] items-center gap-3">
          <Logo size={26} />
          <Badge tone="amber">Demo</Badge>
        </div>
        <div className="mx-auto grid w-full max-w-[1120px] grid-cols-1 items-end gap-x-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
          <div className="flex flex-col gap-4 pt-8 pb-10 lg:pt-12 lg:pb-14">
            <h1 className="font-display text-[2.6rem] leading-[1.02] font-extrabold sm:text-6xl">Play Ludora in your browser</h1>
            <p className="max-w-[46ch] text-lg text-text-2 sm:text-xl">A full game runs on this page, against practice bots. There is no account to make, and nothing you do here is saved.</p>
          </div>
          <GlimCrowd scene={COMPACT_SCENE} entrance ground="none" aspect="10 / 6.4" className="hidden max-w-[400px] self-end justify-self-end lg:block" />
        </div>
      </Stage>

      <main id="main" className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-6 px-4 pt-6 pb-10 sm:px-6">
        <Panel className="p-5" aria-labelledby="demo-step-name">
          <h2 id="demo-step-name" className="mb-3 font-display text-xl font-bold">
            Your name
          </h2>
          <div className="max-w-xl">
            <Field id="demo-name" label="Name on the leaderboard" error={nameError}>
              {(p) => (
                <div className="flex gap-2">
                  <Input {...p} value={name} maxLength={24} autoComplete="off" onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1" />
                  <Button className="h-11" icon={<Shuffle className="size-4" aria-hidden />} onClick={() => setName(generateName())}>
                    Random
                  </Button>
                </div>
              )}
            </Field>
          </div>
        </Panel>

        <Panel className="p-5" aria-labelledby="demo-step-set">
          <h2 id="demo-step-set" className="mb-3 font-display text-xl font-bold">
            Questions
          </h2>
          {pickingSet ? (
            <div ref={firstSet}>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {SETS.map((s) => (
                  <li key={s.seedKey}>
                    <SetButton
                      set={asSetLike(s)}
                      onPick={() => {
                        setPicked({ ...choice, setKey: s.seedKey });
                        setPickingSet(false);
                        setSetFocus('chosen');
                      }}
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-text-3">{SETS.length} sets, all written for Ludora. With an account you can write your own.</p>
            </div>
          ) : (
            <ChosenSet
              set={asSetLike(set)}
              focusOnMount={setFocus === 'chosen'}
              onChange={() => {
                setPickingSet(true);
                setSetFocus('picker');
              }}
            />
          )}
        </Panel>

        <Panel className="p-5" aria-labelledby="demo-step-mode">
          <h2 id="demo-step-mode" className="mb-1 font-display text-xl font-bold">
            Game mode
          </h2>
          <p className="mb-4 text-sm text-text-2">Games that wait for a teacher to move them on run by themselves here.</p>
          <ModeGrid modes={DEMO_MODES} value={{ mode, variant }} onChange={(c) => setPicked({ ...choice, modeId: c.mode.meta.id, variantId: c.variant?.meta.id ?? null })} labelledBy="demo-step-mode" />
        </Panel>

        <Panel className="p-5" aria-labelledby="demo-step-players">
          <h2 id="demo-step-players" className="mb-3 font-display text-xl font-bold">
            Players and sound
          </h2>
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
            {range.max > 0 ? (
              <Field label="Practice bots" hint={range.min > 0 ? `${mode.meta.title} needs other players, so there is at least one bot.` : 'Bots answer at their own pace and get some wrong.'}>
                {(p) => (
                  <Select {...p} value={String(bots)} onChange={(e) => setPicked({ ...choice, bots: Number(e.target.value) })}>
                    {Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i).map((n) => (
                      <option key={n} value={n}>
                        {botsLabel(n)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : (
              <p className="self-center text-text-2">{mode.meta.title} is played on your own, so there are no bots.</p>
            )}
            <div className="flex flex-col">
              <Switch checked={prefs.effects} onCheckedChange={(v) => changePrefs({ effects: v })} label="Sound effects" description="Chimes for answers, and the clock in the last seconds." />
              <Switch checked={prefs.music} onCheckedChange={(v) => changePrefs({ music: v })} label="Music" description="A light tune under the game." />
            </div>
          </div>
        </Panel>

        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-raised/95 p-4 backdrop-blur">
          <p className="min-w-0 text-sm text-text-2">
            {title} with “{set.title}”, {range.max === 0 ? 'on your own' : bots === 0 ? 'just you' : `you and ${bots} practice ${bots === 1 ? 'bot' : 'bots'}`}.
          </p>
          <Button variant="primary" size="lg" onClick={start}>
            Start game
          </Button>
        </div>

        <section aria-labelledby="demo-about" className="rounded-[18px] border border-dashed border-line-strong p-5">
          <h2 id="demo-about" className="mb-2 font-display text-xl font-bold">
            About this demo
          </h2>
          <div className="flex max-w-[68ch] flex-col gap-2 text-text-2">
            <p>The games, the question types, the bots, the big screen and the sounds are the real thing: this page runs the same game room as the Ludora server, inside your browser.</p>
            <p>Some things need the server, so they are not here: accounts, hosting a class with a join code, Sparks and XP, Lanterns, the shop and Glim collections, classes, and the teacher and staff tools. To try those, run Ludora in a Codespace. Its README says how.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
