import type { GlimArt } from '@ludora/shared';
import { Glim } from '../../art/glim/Glim.tsx';
import { Lantern } from '../../art/Lantern.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import '../home/festival.css';

/** Capling, looking up at a Lantern and wondering where the page went. */
const LOST: GlimArt = { kind: 'glim', body: 'mushroom', hue: 38, accentHue: 6, saturation: 34, eyes: 'half', mouth: 'o', pattern: 'none', topper: 'none', cheeks: true, brows: 'soft' };

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-5 py-8 text-center sm:py-14">
      <div className="relative h-[230px] w-[260px]" aria-hidden>
        <div className="absolute top-0 left-[18px] origin-top fx-sway">
          <div className="mx-auto h-8 w-[3px] bg-ink" />
          <Lantern art={{ hue: 265, accentHue: 45, pattern: 'moons' }} size={96} lit />
        </div>
        <Glim art={LOST} size={170} rarity="common" className="absolute right-0 bottom-0" />
      </div>
      <h1 className="font-display text-4xl leading-tight font-extrabold sm:text-5xl">We can't find that page</h1>
      <p className="max-w-[44ch] text-lg text-text-2">The link may be old, or the page may have moved. Everything else is right where you left it.</p>
      <div className="flex flex-wrap justify-center gap-3">
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
