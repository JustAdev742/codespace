import { ButtonLink } from '../../ui/Button.tsx';

/** A page that does not exist. The number is the hero, like a scoreboard: no illustration. */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-10 text-center sm:py-16">
      {/* The heading says it in words; the number is for the eye. */}
      <p className="font-display text-[7.5rem] leading-[0.85] font-extrabold text-text-3 italic tabular sm:text-[10rem]" aria-hidden>
        404
      </p>
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
