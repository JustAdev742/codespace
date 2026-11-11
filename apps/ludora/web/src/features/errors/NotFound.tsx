import type { GlimArt } from '@ludora/shared';
import { ButtonLink } from '../../ui/Button.tsx';
import { Glim } from '../../art/glim/Glim.tsx';

/* A Glim with its lantern up, looking for the page too. */
const SEARCHER: GlimArt = { kind: 'glim', body: 'lantern', hue: 32, accentHue: 270, saturation: 84, eyes: 'curious', mouth: 'o', pattern: 'belly', topper: 'flame', cheeks: true, brows: 'surprised', tail: 'tassel' };

/** A page that does not exist. The number is the hero, like a scoreboard, with a Glim out looking for the page. */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-10 text-center sm:py-16">
      {/* The heading says it in words; the number is for the eye. */}
      <div className="flex items-end" aria-hidden>
        <p className="font-display text-[7.5rem] leading-[0.85] font-extrabold text-text-3 italic tabular sm:text-[10rem]">404</p>
        <Glim art={SEARCHER} size={110} pose="wave" uniform={false} className="-ml-4 shrink-0 sm:size-[140px]" />
      </div>
      <h1 className="font-display text-[2.6rem] leading-none font-bold sm:text-5xl">Page not found</h1>
      <p className="max-w-[44ch] text-lg text-text-2">The link may be old, or the page may have moved. Everything else is where you left it.</p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <ButtonLink to="/" variant="primary" size="lg">
          Go home
        </ButtonLink>
        <ButtonLink to="/play" size="lg">
          Join a game
        </ButtonLink>
      </div>
    </div>
  );
}
