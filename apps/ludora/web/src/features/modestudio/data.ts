import type { Blueprint, BlueprintKind, GameVisibility } from '@ludora/shared';

/** A made game as the server lists it: a card, with no account id. */
export interface MadeGameCardData {
  id: string;
  name: string;
  tagline: string;
  kind: BlueprintKind | null;
  kindLabel: string | null;
  dimension: '2d' | '3d';
  pacing: 'rounds' | 'own-pace' | null;
  glyph: string;
  hue: number;
  actsOnOthers: string[];
  visibility: GameVisibility;
  hidden: boolean;
  plays: number;
  owner: { name: string };
  mine: boolean;
  copied: boolean;
  updatedAt: string;
  playable: boolean;
}

export interface MadeGameFull extends MadeGameCardData {
  blueprint: Blueprint;
}

export const VISIBILITY_WORDS: Record<GameVisibility, string> = { private: 'Only you', unlisted: 'Anyone with the link', public: 'Everyone (listed)' };

/** Where a made game is hosted or played from: the host page, with its question set still to choose. */
export const hostLink = (id: string, solo = false) => `/host?${solo ? 'solo=1&' : ''}blueprint=${id}`;
export const studioLink = (id: string) => `/mode-studio/${id}`;
