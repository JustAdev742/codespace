import { Link } from 'react-router';
import { PencilLine, Presentation, ShieldCheck } from 'lucide-react';
import type { GlimArt, Rarity } from '@ludora/shared';
import { RARITY_INFO } from '@ludora/shared';
import { useModes } from '../../lib/queries.ts';
import { CodeEntry } from '../play/CodeEntry.tsx';
import { Glim } from '../../art/glim/Glim.tsx';
import { Stage } from '../../ui/Stage.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import { Skeleton } from '../../ui/primitives.tsx';
import { ModeCard } from '../modes/ModeCard.tsx';
import { COMPACT_SCENE, GLIMS, GlimCrowd, HERO_SCENE } from './GlimCrowd.tsx';
import { BLEED_ROUNDING, Bleed } from './kit.tsx';

/** One Glim of every rarity, from common to mythic. */
const LADDER: { rarity: Rarity; name: string; art: GlimArt }[] = [
  { rarity: 'common', name: 'Pebblet', art: GLIMS.pebblet },
  { rarity: 'uncommon', name: 'Buzzbean', art: GLIMS.buzzbean },
  { rarity: 'rare', name: 'Briarcat', art: GLIMS.briarcat },
  { rarity: 'epic', name: 'Anglet', art: GLIMS.anglet },
  { rarity: 'legendary', name: 'Hearthkeeper', art: GLIMS.hearthkeeper },
  { rarity: 'mythic', name: 'Novabelle', art: GLIMS.novabelle },
];

const TEACHERS = [
  { icon: Presentation, title: 'Run it from the front', text: 'Put the game on the projector, students join with a six-digit code, and afterwards you see which questions tripped people up.' },
  { icon: ShieldCheck, title: 'Safe by design', text: 'Generated nicknames, no free-text chat, and privacy settings that start strict for younger players.' },
  { icon: PencilLine, title: 'Your questions', text: 'Write sets with eight question types, import them from a spreadsheet, or start from the free library.' },
];

export default function Landing() {
  const modes = useModes();
  const featured = (modes.data?.modes ?? []).filter((m) => m.meta.status === 'playable').slice(0, 4);
  return (
    <div className="flex flex-col gap-16 pb-12 sm:gap-20">
      <Bleed>
        <section aria-labelledby="hero-title">
          <Stage lanterns={false} className={`px-4 pt-8 sm:px-6 lg:pt-12 ${BLEED_ROUNDING}`}>
            <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
              <div className="relative z-10 flex flex-col gap-5 pb-10 lg:self-center lg:pb-28">
                <h1 id="hero-title" className="order-1 font-display text-[2.75rem] leading-[1.02] font-extrabold sm:text-6xl xl:text-[4.2rem]">
                  Every lesson can be a game.
                </h1>
                <p className="order-4 max-w-[44ch] text-lg text-text-2 sm:text-xl lg:order-2">Quizzes, races and team battles your whole class plays together, on any device. Every right answer earns Sparks, and Sparks open Lanterns with Glims inside.</p>
                {/* On phones the crowd gathers behind the ticket and peeks over it */}
                <GlimCrowd scene={COMPACT_SCENE} entrance ground="none" aspect="10 / 6.4" className="order-2 -mb-[12%] max-w-[480px] lg:hidden" />
                <div className="paper stage-card relative z-10 order-3 max-w-[480px] p-4 sm:p-5">
                  <p className="mb-3 font-display text-xl font-bold">Got a code from your teacher?</p>
                  <CodeEntry size="xl" />
                  <p className="mt-2.5 text-sm text-text-2">Type it in to join. You do not need an account.</p>
                </div>
                <div className="order-5 flex flex-wrap items-center gap-3">
                  <ButtonLink to="/signup" variant="success" size="lg">
                    Create a free account
                  </ButtonLink>
                  <ButtonLink to="/host" variant="ghost" size="lg" className="text-white hover:bg-white/12 hover:text-white">
                    Host a game
                  </ButtonLink>
                </div>
              </div>
              <GlimCrowd scene={HERO_SCENE} entrance ground="wide" aspect="10 / 9.6" className="hidden max-w-[660px] self-end justify-self-end lg:block" />
            </div>
          </Stage>
        </section>
      </Bleed>

      <section aria-labelledby="modes-title">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="modes-title" className="font-display text-3xl font-extrabold sm:text-4xl">
              One question set, many games
            </h2>
            <p className="mt-2 max-w-[60ch] text-lg text-text-2">Write your questions once, then play them as a classic quiz, a comet race, a co-op fight against a giant and more. Every mode works on phones, tablets and old school laptops.</p>
          </div>
          <ButtonLink to="/modes" variant="secondary">
            See every game mode
          </ButtonLink>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {modes.isLoading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72 rounded-[22px]" />) : featured.map((m) => <ModeCard key={m.meta.id} mode={m} />)}
        </div>
      </section>

      <section aria-labelledby="collect-title" className="overflow-hidden rounded-[28px] border-[2.5px] border-ink bg-lantern text-on-accent shadow-[0_6px_0_var(--ink)]">
        <div className="grid grid-cols-1 items-center gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <h2 id="collect-title" className="font-display text-3xl font-extrabold sm:text-4xl">
              Collect Glims as you learn
            </h2>
            <p className="mt-3 max-w-[52ch] text-lg">
              Glims are little light spirits that live in paper Lanterns. Play a game to earn Sparks, spend them on a Lantern, and find out who is inside. Each collection has its own Lantern, and a full collection earns a reward.
            </p>
            <p className="mt-3 max-w-[52ch] font-semibold">Every Lantern shows its odds before you open it, and nothing in Ludora is ever sold for real money.</p>
            <ButtonLink to="/signup" variant="secondary" size="lg" className="mt-6 border-ink shadow-[0_3px_0_var(--ink)]">
              Start collecting
            </ButtonLink>
          </div>
          <ul className="grid grid-cols-3 gap-3 sm:gap-4" aria-label="The six rarities, from common to mythic">
            {LADDER.map((g, i) => (
              <li
                key={g.rarity}
                className={`flex flex-col items-center rounded-[18px] border-[3px] bg-white p-2 pb-2.5 text-center shadow-[0_4px_0_var(--ink)] ${g.rarity === 'mythic' ? 'fx-mythic-frame' : ''}`}
                style={{ borderColor: `var(--r-${g.rarity})`, ['--card-bg' as string]: '#fff', transform: `rotate(${[-2, 1.5, -1, 2, -1.5, 1][i]}deg)` }}
              >
                <Glim art={g.art} size={120} rarity={g.rarity} aura={g.rarity === 'common' ? null : g.rarity} className="h-auto w-full max-w-[120px]" />
                <span className="font-display text-[15px] leading-tight font-bold text-[#1d1846]">{g.name}</span>
                <span className="mt-1 rounded-full px-2 text-xs font-bold text-[#1d1846]" style={g.rarity === 'mythic' ? undefined : { background: `color-mix(in oklab, var(--r-${g.rarity}) 35%, white)` }}>
                  {RARITY_INFO[g.rarity].label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="teachers-title" className="panel p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="teachers-title" className="font-display text-3xl font-extrabold">
              Made for classrooms
            </h2>
            <p className="mt-2 max-w-[56ch] text-text-2">Free for teachers and students. Host a game in a minute, or set one as homework for your class.</p>
          </div>
          <ButtonLink to="/host" variant="primary" size="lg">
            Host a game
          </ButtonLink>
        </div>
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {TEACHERS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex flex-col gap-2">
              <span className={`grid size-12 place-items-center rounded-[14px] border-2 border-ink text-on-accent ${['bg-sky', 'bg-glim', 'bg-rose'][i]}`}>
                <Icon className="size-6" aria-hidden />
              </span>
              <h3 className="font-display text-xl font-bold">{title}</h3>
              <p className="text-text-2">{text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 border-t border-line pt-4 text-sm text-text-2">
          Looking for questions? <Link to="/library" className="font-semibold">Browse the question library</Link>.
        </p>
      </section>
    </div>
  );
}
