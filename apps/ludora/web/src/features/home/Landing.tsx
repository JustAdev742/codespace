import { Link } from 'react-router';
import type { GlimArt, LanternArt } from '@ludora/shared';
import { useModes, thumbFor } from '../../lib/queries.ts';
import { CodeEntry } from '../play/CodeEntry.tsx';
import { Glim } from '../../art/glim/Glim.tsx';
import { Lantern } from '../../art/Lantern.tsx';
import { ModeArt } from '../../art/ModeArt.tsx';
import { ButtonLink } from '../../ui/Button.tsx';

const HERO_GLIMS: { art: GlimArt; size: number; x: string; y: string; delay: string }[] = [
  { art: { kind: 'glim', body: 'cat', hue: 28, accentHue: 50, saturation: 90, eyes: 'happy', mouth: 'cat', pattern: 'stripes', topper: 'none', cheeks: true }, size: 120, x: '4%', y: '18%', delay: '0s' },
  { art: { kind: 'glim', body: 'jelly', hue: 190, accentHue: 300, saturation: 75, eyes: 'big', mouth: 'smile', pattern: 'spots', topper: 'antenna', cheeks: true }, size: 104, x: '62%', y: '4%', delay: '.6s' },
  { art: { kind: 'glim', body: 'owl', hue: 35, accentHue: 18, saturation: 45, eyes: 'curious', mouth: 'smile', pattern: 'belly', topper: 'none', cheeks: true }, size: 148, x: '30%', y: '40%', delay: '1.1s' },
  { art: { kind: 'glim', body: 'crystal', hue: 205, accentHue: 190, saturation: 30, eyes: 'sparkle', mouth: 'o', pattern: 'none', topper: 'halo', cheeks: false }, size: 96, x: '70%', y: '52%', delay: '.3s' },
];

const LANTERN: LanternArt = { hue: 265, accentHue: 45, pattern: 'stars' };

export default function Landing() {
  const modes = useModes();
  return (
    <div className="-mt-6 flex flex-col gap-20 pb-10">
      <section className="grid grid-cols-1 items-center gap-10 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div className="flex flex-col gap-6">
          <h1 className="font-display text-5xl leading-[1.02] font-extrabold sm:text-6xl">Every lesson can be a game.</h1>
          <p className="max-w-[46ch] text-lg text-text-2">Quizzes, races and team battles your class plays together, from any device. Answer well, earn Sparks, and fill your collection with Glims.</p>
          <div className="flex flex-col gap-2">
            <CodeEntry size="xl" />
            <p className="text-sm text-text-3">Got a code from your teacher? Type it in. No account needed.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/signup" variant="secondary" size="lg">
              Create a free account
            </ButtonLink>
            <ButtonLink to="/host" variant="ghost" size="lg">
              I want to host a game
            </ButtonLink>
          </div>
        </div>
        <div className="relative mx-auto aspect-square w-full max-w-[460px]" aria-hidden>
          <div className="absolute inset-[8%] rounded-full bg-surface-2" />
          {HERO_GLIMS.map((g, i) => (
            <div key={i} className="absolute" style={{ left: g.x, top: g.y, animation: `rise-fade .6s ${g.delay} both var(--ease-out)` }}>
              <Glim art={g.art} size={g.size} bob />
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="modes-h">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="modes-h" className="font-display text-3xl font-extrabold">
              One question set, many games
            </h2>
            <p className="mt-1 max-w-[56ch] text-text-2">Write your questions once and play them as a classic quiz, a comet race, a co-op boss fight and more. Every mode works on phones, tablets and old school laptops.</p>
          </div>
          <Link to="/modes" className="font-semibold">
            See every mode
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(modes.data?.modes ?? []).slice(0, 4).map((m) => (
            <Link key={m.meta.id} to={`/modes/${m.meta.id}`} className="text-text no-underline group overflow-hidden rounded-[var(--radius-m)] border border-line bg-raised transition-colors hover:border-line-strong">
              <ModeArt thumb={thumbFor(m.meta)} className="aspect-[16/10] w-full" />
              <div className="p-4">
                <h3 className="font-display text-lg font-bold">{m.meta.title}</h3>
                <p className="mt-1 text-sm text-text-2">{m.meta.tagline}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 items-center gap-8 rounded-[var(--radius-l)] border border-line bg-raised p-6 sm:p-10 lg:grid-cols-[auto_1fr]">
        <div className="flex items-end justify-center gap-4">
          <Lantern art={LANTERN} size={120} lit />
          <Glim art={{ kind: 'glim', body: 'moth', hue: 275, accentHue: 45, saturation: 70, eyes: 'sparkle', mouth: 'cat', pattern: 'stars', topper: 'none', cheeks: true }} size={140} aura="legendary" bob />
        </div>
        <div>
          <h2 className="font-display text-3xl font-extrabold">Collect Glims as you learn</h2>
          <p className="mt-2 max-w-[60ch] text-text-2">
            Playing earns Sparks. Spend them on Lanterns, each holding a Glim from one of eight collections, or pick favourites from the daily shop. Odds are shown on every Lantern, and nothing is ever sold for real money.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {[
          ['For teachers', 'Host from a projector, let students join with a code, and see who struggled with which question afterwards.'],
          ['Safe by design', 'Generated nicknames, no free-text chat, privacy settings that start strict for younger players.'],
          ['Your content', 'Write sets with eight question types, import from a spreadsheet, or start from our free library.'],
        ].map(([t, d]) => (
          <div key={t}>
            <h3 className="font-display text-xl font-bold">{t}</h3>
            <p className="mt-1.5 text-text-2">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
