import { User } from 'lucide-react';
import type { AvatarLite } from '@ludora/shared';
import { Glim } from '../../art/glim/Glim.tsx';

/*
 * Small pieces shared by the friends, profile, stats and leaderboard pages.
 */

/** A player's buddy Glim in a circle, for friend lists and leaderboards. Decorative: the name beside it says who it is. */
export function PlayerAvatar({ avatar, size = 40 }: { avatar: AvatarLite | null; size?: number }) {
  return (
    <span aria-hidden className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-3" style={{ width: size, height: size }}>
      {avatar ? <Glim art={avatar.art} accessories={avatar.accessories} size={Math.round(size * 1.06)} /> : <User className="text-text-3" style={{ width: size / 2, height: size / 2 }} />}
    </span>
  );
}

/** A dot between two pieces of text. Screen readers hear a comma instead. */
export function Dot() {
  return (
    <>
      <span aria-hidden className="px-1.5">
        ·
      </span>
      <span className="sr-only">, </span>
    </>
  );
}
