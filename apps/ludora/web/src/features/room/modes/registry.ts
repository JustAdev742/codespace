import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { RoomView } from '@ludora/shared';
import type { AckResult } from '../../../lib/useRoom.ts';

export interface ModeScreenProps<V = any> {
  view: V;
  room: RoomView<V>;
  act: (action: unknown) => Promise<AckResult>;
  gameNow: () => number;
  paused: boolean;
}

type Screen = LazyExoticComponent<ComponentType<ModeScreenProps>>;

/** Each mode's player and host screens, loaded only when that mode is played. */
export const MODE_SCREENS: Record<string, { Player: Screen; Host: Screen }> = {
  classic: {
    Player: lazy(() => import('./classic.tsx').then((m) => ({ default: m.ClassicPlayer }))),
    Host: lazy(() => import('./classic.tsx').then((m) => ({ default: m.ClassicHost }))),
  },
  'comet-dash': {
    Player: lazy(() => import('./comet-dash.tsx').then((m) => ({ default: m.CometDashPlayer }))),
    Host: lazy(() => import('./comet-dash.tsx').then((m) => ({ default: m.CometDashHost }))),
  },
};
