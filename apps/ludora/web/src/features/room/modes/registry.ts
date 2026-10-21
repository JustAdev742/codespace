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
  'quick-draw': {
    Player: lazy(() => import('./quick-draw.tsx').then((m) => ({ default: m.QuickDrawPlayer }))),
    Host: lazy(() => import('./quick-draw.tsx').then((m) => ({ default: m.QuickDrawHost }))),
  },
  'lantern-out': {
    Player: lazy(() => import('./lantern-out.tsx').then((m) => ({ default: m.LanternOutPlayer }))),
    Host: lazy(() => import('./lantern-out.tsx').then((m) => ({ default: m.LanternOutHost }))),
  },
  confidence: {
    Player: lazy(() => import('./confidence.tsx').then((m) => ({ default: m.ConfidencePlayer }))),
    Host: lazy(() => import('./confidence.tsx').then((m) => ({ default: m.ConfidenceHost }))),
  },
  glimgo: {
    Player: lazy(() => import('./glimgo.tsx').then((m) => ({ default: m.GlimgoPlayer }))),
    Host: lazy(() => import('./glimgo.tsx').then((m) => ({ default: m.GlimgoHost }))),
  },
  'lantern-match': {
    Player: lazy(() => import('./lantern-match.tsx').then((m) => ({ default: m.LanternMatchPlayer }))),
    Host: lazy(() => import('./lantern-match.tsx').then((m) => ({ default: m.LanternMatchHost }))),
  },
  'word-scramble': {
    Player: lazy(() => import('./word-scramble.tsx').then((m) => ({ default: m.WordScramblePlayer }))),
    Host: lazy(() => import('./word-scramble.tsx').then((m) => ({ default: m.WordScrambleHost }))),
  },
  'time-attack': {
    Player: lazy(() => import('./time-attack.tsx').then((m) => ({ default: m.TimeAttackPlayer }))),
    Host: lazy(() => import('./time-attack.tsx').then((m) => ({ default: m.TimeAttackHost }))),
  },
  'survival-run': {
    Player: lazy(() => import('./survival-run.tsx').then((m) => ({ default: m.SurvivalRunPlayer }))),
    Host: lazy(() => import('./survival-run.tsx').then((m) => ({ default: m.SurvivalRunHost }))),
  },
  'flashcard-study': {
    Player: lazy(() => import('./flashcard-study.tsx').then((m) => ({ default: m.FlashcardStudyPlayer }))),
    Host: lazy(() => import('./flashcard-study.tsx').then((m) => ({ default: m.FlashcardStudyHost }))),
  },
  'sky-lanterns': {
    Player: lazy(() => import('./sky-lanterns.tsx').then((m) => ({ default: m.SkyLanternsPlayer }))),
    Host: lazy(() => import('./sky-lanterns.tsx').then((m) => ({ default: m.SkyLanternsHost }))),
  },
  'gloom-giant': {
    Player: lazy(() => import('./gloom-giant.tsx').then((m) => ({ default: m.GloomGiantPlayer }))),
    Host: lazy(() => import('./gloom-giant.tsx').then((m) => ({ default: m.GloomGiantHost }))),
  },
  'tug-of-war': {
    Player: lazy(() => import('./tug-of-war.tsx').then((m) => ({ default: m.TugOfWarPlayer }))),
    Host: lazy(() => import('./tug-of-war.tsx').then((m) => ({ default: m.TugOfWarHost }))),
  },
};
