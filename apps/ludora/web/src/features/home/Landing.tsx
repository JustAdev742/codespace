import { Link } from 'react-router';
import { ArrowUp, Check, PencilLine, Presentation, ShieldCheck, Timer } from 'lucide-react';
import type { GlimArt, Rarity } from '@ludora/shared';
import { useModes } from '../../lib/queries.ts';
import { CodeEntry } from '../play/CodeEntry.tsx';
import { Glim } from '../../art/glim/Glim.tsx';
import { AnswerShape, ANSWER_LETTERS } from '../../art/icons.tsx';
import { Stage } from '../../ui/Stage.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import { Skeleton } from '../../ui/primitives.tsx';
import { ModeCard } from '../modes/ModeCard.tsx';
import { GLIMS } from './GlimCrowd.tsx';
import { BLEED_ROUNDING, Bleed, RarityTag } from './kit.tsx';

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
  { icon: Presentation, title: 'Run it from the front', text: 'Put the game on the projector, students join with a 6-digit code, and afterwards you see which questions tripped people up.' },
  { icon: ShieldCheck, title: 'Safe by design', text: 'Generated nicknames, no free-text chat, and privacy settings that start strict for younger players.' },
  { icon: PencilLine, title: 'Your questions', text: 'Write sets with 8 question types, import them from a spreadsheet, or start from the free library.' },
];

/* ------------------------------ the game preview ------------------------------ */

const TILES = ['var(--tile-a)', 'var(--tile-b)', 'var(--tile-c)', 'var(--tile-d)'];
const ANSWERS = ['Sydney', 'Canberra', 'Melbourne', 'Perth'];
const RIGHT = 1;
/** Generated nicknames, as players get in class. */
const BOARD: { name: string; points: string; art: GlimArt; rarity: Rarity; you?: boolean }[] = [
  { name: 'Swift Otter', points: '4,250', art: GLIMS.hearthkeeper, rarity: 'legendary' },
  { name: 'You', points: '3,980', art: GLIMS.sprig, rarity: 'common', you: true },
  { name: 'Brave Comet', points: '3,720', art: GLIMS.dewdrop, rarity: 'common' },
  { name: 'Lucky Fox', points: '3,105', art: GLIMS.briarcat, rarity: 'rare' },
];

/**
 * What a game looks like, built from the game's own pieces: the question plate,
 * lettered answer tiles with their shapes, the reveal and the leaderboard. The
 * screen's one moment: the score lands and you climb a place. It is a picture
 * of a game, so it is hidden from screen readers; the text beside it says it.
 */
function GamePreview({ className = '' }: { className?: string }) {
  return (
    <div className={`hud stage-card w-full max-w-[520px] p-4 sm:p-5 ${className}`} aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="plate plate-gold text-xl">
            <span>Question 4</span>
          </span>
          <span className="text-sm font-semibold text-text-2">of 10</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-s)] bg-white/[0.08] px-2.5 py-1 font-display text-xl leading-none font-bold tabular">
          <Timer className="size-4 text-lantern" />
          12
        </span>
      </div>
      <p className="mt-4 font-display text-[1.7rem] leading-tight font-bold">What is the capital of Australia?</p>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {ANSWERS.map((a, i) => {
          const right = i === RIGHT;
          return (
            <div
              key={a}
              className={`relative flex min-h-14 items-center gap-2.5 rounded-[var(--radius-m)] px-2.5 py-2 font-semibold ${right ? 'text-on-accent shadow-[inset_0_-4px_0_rgb(0_0_0/0.24),0_0_0_3px_#ffffff]' : 'bg-white/[0.07] text-text'}`}
              style={right ? { background: TILES[i] } : undefined}
            >
              {/* Unlit answers keep their badge's colour and shape, as at a real reveal. */}
              <span className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-s)] px-1.5 py-1 font-display text-base leading-none font-extrabold text-on-accent" style={{ background: right ? 'rgb(0 0 0 / 0.14)' : TILES[i] }}>
                <AnswerShape index={i} size={14} />
                {ANSWER_LETTERS[i]}
              </span>
              <span className="min-w-0 truncate">{a}</span>
              {right ? <Check className="ml-auto size-5 shrink-0" strokeWidth={3} /> : null}
              {right ? (
                // The wrapper pops in; the plate inside keeps its slant (an animated transform would replace it).
                <span className="absolute -top-3.5 -right-2 motion-safe:animate-[pop-in_200ms_var(--ease-out)_350ms_both]">
                  <span className="plate bg-glim text-lg text-on-accent">
                    <span>+850</span>
                  </span>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <ol className="mt-5 flex flex-col gap-1">
        {BOARD.map((p, i) => (
          <li key={p.name} className={`relative flex items-center gap-3 rounded-[var(--radius-s)] px-2.5 py-1.5 ${p.you ? 'bg-white/[0.1] motion-safe:animate-[rise-fade_200ms_var(--ease-out)_350ms_both]' : ''}`}>
            {p.you ? <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-[3px] bg-lantern" /> : null}
            <span className="w-4 font-display text-xl leading-none font-extrabold tabular">{i + 1}</span>
            <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-white/[0.08]">
              <Glim art={p.art} rarity={p.rarity} size={34} />
            </span>
            <span className={`min-w-0 flex-1 truncate ${p.you ? 'font-bold' : 'font-semibold text-text-2'}`}>{p.name}</span>
            {p.you ? (
              <span className="inline-flex items-center gap-0.5 rounded-[var(--radius-s)] bg-glim px-1.5 font-display text-sm leading-5 font-bold text-on-accent">
                <ArrowUp className="size-3.5" strokeWidth={3} />1
              </span>
            ) : null}
            <span className="font-display text-xl leading-none font-bold tabular">{p.points}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------------------------------- the page ---------------------------------- */

export default function Landing() {
  const modes = useModes();
  const featured = (modes.data?.modes ?? []).filter((m) => m.meta.status === 'playable').slice(0, 4);
  return (
    <div className="flex flex-col gap-16 pb-12 sm:gap-20">
      <Bleed>
        <section aria-labelledby="hero-title">
          <Stage className={`px-4 pt-8 pb-10 sm:px-6 lg:pt-14 lg:pb-16 ${BLEED_ROUNDING}`}>
            <div className="mx-auto grid max-w-[1120px] grid-cols-1 items-center gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-5">
                <h1 id="hero-title" className="font-display text-[2.75rem] leading-[0.95] font-extrabold min-[400px]:text-[3.25rem] sm:text-[4.25rem] xl:text-[4.75rem]">
                  <span className="block">Answer fast.</span>
                  <span className="block">Climb the board.</span>
                </h1>
                {/* The way in comes first: most people arrive with a code from their teacher. */}
                <div className="hud stage-card max-w-[480px] p-4 sm:p-5">
                  <h2 className="mb-3 font-display text-2xl leading-none font-bold">Join a game</h2>
                  <CodeEntry size="xl" />
                  <p className="mt-2.5 text-sm text-text-2">Got a code from your teacher? Type it in. You do not need an account.</p>
                </div>
                <p className="max-w-[46ch] text-lg text-text-2">Quizzes, races and team battles your whole class plays live, on any device. Every right answer earns Sparks, and Sparks open Lanterns with Glims inside.</p>
                <div className="flex flex-wrap items-center gap-3">
                  <ButtonLink to="/host" variant="secondary" size="lg">
                    Host a game
                  </ButtonLink>
                  <ButtonLink to="/signup" variant="secondary" size="lg">
                    Create account
                  </ButtonLink>
                </div>
              </div>
              <GamePreview className="hidden justify-self-center md:block lg:justify-self-end" />
            </div>
          </Stage>
        </section>
      </Bleed>

      <section aria-labelledby="modes-title">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="modes-title" className="font-display text-[2.1rem] leading-none font-bold sm:text-[2.6rem]">
              One question set, many games
            </h2>
            <p className="mt-3 max-w-[60ch] text-lg text-text-2">Write your questions once, then play them as a classic quiz, a comet race, a co-op fight against a giant and more. Every mode works on phones, tablets and old school laptops.</p>
          </div>
          <ButtonLink to="/modes" variant="secondary">
            See every game mode
          </ButtonLink>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {modes.isLoading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72 rounded-[var(--radius-l)]" />) : featured.map((m) => <ModeCard key={m.meta.id} mode={m} />)}
        </div>
      </section>

      {/* Collectibles with status: the six rarities as trading cards, on the stage so the rare ones glow. */}
      <section aria-labelledby="collect-title">
        <Stage className="rounded-[var(--radius-l)] px-5 py-8 sm:px-10 sm:py-10">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <h2 id="collect-title" className="font-display text-[2.1rem] leading-none font-bold sm:text-[2.6rem]">
                Collect Glims. Chase the rare ones.
              </h2>
              <p className="mt-4 max-w-[52ch] text-lg text-text-2">Every game earns Sparks. Spend them on a Lantern and find out which Glim is inside, from common to mythic. Each collection has its own Lantern, and a full collection earns a reward.</p>
              <p className="mt-3 max-w-[52ch] font-semibold">Every Lantern shows its odds before you open it, and nothing in Ludora is ever sold for real money.</p>
              <ButtonLink to="/signup" variant="primary" size="lg" className="mt-6">
                Start collecting
              </ButtonLink>
            </div>
            <ul className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 sm:gap-4" aria-label="The 6 rarities, from common to mythic">
              {LADDER.map((g) => (
                <li
                  key={g.rarity}
                  className={`flex flex-col items-center gap-1.5 rounded-[var(--radius-m)] border-2 bg-[var(--stage-1)] px-2 pt-2 pb-3 text-center ${g.rarity === 'mythic' ? 'fx-mythic-frame' : ''}`}
                  style={{ borderColor: `var(--r-${g.rarity})`, ['--card-bg' as string]: 'var(--stage-1)' }}
                >
                  <Glim art={g.art} size={120} rarity={g.rarity} aura={g.rarity === 'common' ? null : g.rarity} className="h-auto w-full max-w-[120px]" />
                  <span className="font-display text-lg leading-tight font-bold">{g.name}</span>
                  {/* The same rarity tag as the shop and collection cards, mythic included. */}
                  <RarityTag rarity={g.rarity} />
                </li>
              ))}
            </ul>
          </div>
        </Stage>
      </section>

      <section aria-labelledby="teachers-title" className="panel p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="teachers-title" className="font-display text-[2.1rem] leading-none font-bold">
              Made for classrooms
            </h2>
            <p className="mt-3 max-w-[56ch] text-text-2">Free for teachers and students. Host a game in a minute, or set one as homework for your class.</p>
          </div>
          <ButtonLink to="/host" variant="primary" size="lg">
            Host a game
          </ButtonLink>
        </div>
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {TEACHERS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex flex-col gap-2">
              <span className={`grid size-11 place-items-center rounded-[var(--radius-m)] text-on-accent ${['bg-sky', 'bg-glim', 'bg-rose'][i]}`}>
                <Icon className="size-6" aria-hidden />
              </span>
              <h3 className="font-display text-2xl leading-tight font-bold">{title}</h3>
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
