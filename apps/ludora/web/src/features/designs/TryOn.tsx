import type { CSSProperties } from 'react';
import { GLIMS } from '@ludora/content';
import type { AccessoryArt, AvatarLite, GlimArt } from '@ludora/shared';
import { NameTag, Pill, PlayerGlim, StagePanel } from '../room/game/stage.tsx';

/*
 * Try it on before saving: the design drawn by the same components the room uses, at the sizes the
 * room uses. A full lobby (sixty players, the smallest seat), a small lobby, and a player's own game
 * screen with their Glim beside the answer tiles. Nothing here is saved or sent.
 */

const NEIGHBOURS = GLIMS.slice(0, 9).map((g) => ({ art: g.art as GlimArt }));
const NAMES = ['Ava', 'Kai', 'Noor', 'Theo', 'Mia', 'Leo', 'Isla', 'Sam', 'Zara'];

function Seat({ avatar, name, seed, size }: { avatar: AvatarLite | null; name: string; seed: string; size: string }) {
  return (
    <li className="flex flex-col items-center gap-1" style={{ '--seat': size } as CSSProperties}>
      <PlayerGlim avatar={avatar} seed={seed} size={128} className="size-[var(--seat)]" />
      <span className="max-w-[6rem] truncate rounded-[var(--radius-s)] bg-[color-mix(in_srgb,var(--stage-4)_82%,transparent)] px-2 py-0.5 text-sm leading-tight font-bold">{name}</span>
    </li>
  );
}

export function TryOn({ art, accessories, name }: { art: GlimArt; accessories?: AccessoryArt[] | undefined; name: string }) {
  const me: AvatarLite = { art, ...(accessories?.length ? { accessories } : {}) };
  const you = name || 'You';
  return (
    <section aria-label="Try it on" className="stage flex flex-col gap-4 rounded-[var(--radius-l)] p-3 text-text">
      <div>
        <h3 className="mb-2 text-sm font-bold">In a full lobby (sixty players)</h3>
        <ul className="flex flex-wrap items-end gap-2">
          {NEIGHBOURS.slice(0, 4).map((n, i) => (
            <Seat key={i} avatar={n} name={NAMES[i]!} seed={`n${i}`} size="2.875rem" />
          ))}
          <Seat avatar={me} name={you} seed="me" size="2.875rem" />
          {NEIGHBOURS.slice(4, 8).map((n, i) => (
            <Seat key={i} avatar={n} name={NAMES[i + 4]!} seed={`m${i}`} size="2.875rem" />
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-bold">In a small lobby</h3>
        <ul className="flex flex-wrap items-end gap-3">
          <Seat avatar={NEIGHBOURS[8]!} name={NAMES[8]!} seed="s1" size="5.5rem" />
          <Seat avatar={me} name={you} seed="me" size="5.5rem" />
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-bold">On your game screen</h3>
        <StagePanel className="flex flex-col gap-3 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <PlayerGlim avatar={me} seed="me" size={56} />
              <NameTag>{you}</NameTag>
            </span>
            <Pill tone="lantern">1,250</Pill>
          </div>
          <div className="grid grid-cols-2 gap-2" aria-hidden>
            {['var(--tile-a)', 'var(--tile-b)', 'var(--tile-c)', 'var(--tile-d)'].map((bg, i) => (
              <span key={i} className="h-10 rounded-[var(--radius-m)]" style={{ background: bg }} />
            ))}
          </div>
        </StagePanel>
      </div>
    </section>
  );
}
