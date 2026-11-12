import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Box, Hammer, Users } from 'lucide-react';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Badge } from '../../ui/primitives.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import { hostLink, studioLink, VISIBILITY_WORDS, type MadeGameCardData } from './data.ts';

/*
 * A made game's card: its cover (the glyph and colour its maker chose), kind, 2D or 3D, the note
 * of anything that acts on other players, and who made it (display name only). Used in Mode
 * Studio, on the host page, and anywhere else made games are listed.
 */
export function MadeGameCard({ g, actions }: { g: MadeGameCardData; actions?: ReactNode }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-[var(--radius-l)] border border-line bg-raised">
      <div className="relative">
        <ModeArt thumb={{ glyph: g.glyph, hue: g.hue, accentHue: (g.hue + 40) % 360 }} mark={{ glyph: g.glyph, hue: g.hue }} className="block aspect-[16/9] w-full" label={g.name} />
        <div className="absolute top-2 left-2 flex gap-1.5">
          {g.dimension === '3d' ? (
            <Badge tone="violet">
              <Box className="size-3.5" aria-hidden /> 3D
            </Badge>
          ) : (
            <Badge>2D</Badge>
          )}
          {g.kindLabel ? <Badge>{g.kindLabel}</Badge> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl leading-tight font-bold break-words">{g.name}</h3>
          {g.tagline ? <p className="text-sm text-text-2">{g.tagline}</p> : null}
        </div>
        {g.actsOnOthers.length ? (
          <div className="rounded-[var(--radius-m)] border border-line bg-surface-2 px-2.5 py-2 text-sm">
            <p className="flex items-center gap-1.5 font-semibold">
              <Users className="size-4 shrink-0" aria-hidden /> Acts on other players
            </p>
            <ul className="mt-1 list-disc pl-5 text-text-2">
              {g.actsOnOthers.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="mt-auto text-xs text-text-3">
          {g.mine ? VISIBILITY_WORDS[g.visibility] : `Made by ${g.owner.name}`} · {g.plays === 1 ? '1 play' : `${g.plays} plays`}
          {g.hidden ? ' · hidden by a moderator' : ''}
        </p>
        <div className="flex flex-wrap gap-1.5">{actions}</div>
      </div>
    </li>
  );
}

/**
 * A small link into Game Maker, for other pages to place where they list things to make.
 * Self-contained: no data loading.
 */
export function ModeStudioLink({ className = '' }: { className?: string }) {
  return (
    <Link to="/game-maker" className={`flex items-start gap-3 rounded-[var(--radius-l)] border border-line bg-raised p-4 hover:bg-surface-2 ${className}`}>
      <Hammer className="mt-0.5 size-6 shrink-0 text-lantern-deep" aria-hidden />
      <span>
        <span className="block font-display text-xl font-bold">Game Maker</span>
        <span className="block text-sm text-text-2">Make a game of your own by writing simple code: what it is about, your own rules and numbers, how it looks in 2D or 3D. A test game follows every line.</span>
      </span>
    </Link>
  );
}

/** The usual actions for a made game's card. */
export function MadeGameActions({ g }: { g: MadeGameCardData }) {
  return (
    <>
      {g.playable ? (
        <ButtonLink to={hostLink(g.id)} size="sm" variant="primary">
          Host
        </ButtonLink>
      ) : null}
      <ButtonLink to={studioLink(g.id)} size="sm" variant="secondary">
        {g.mine ? 'Open in Game Maker' : 'See its code'}
      </ButtonLink>
    </>
  );
}
