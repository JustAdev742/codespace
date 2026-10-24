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
export const MODE_SCREENS: Record<string, { Player: Screen; Host: Screen; /** The host screen lists the room's news itself, so the big screen shows no news toasts over it. */ hostFeed?: boolean }> = {
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
  'night-market': {
    Player: lazy(() => import('./night-market.tsx').then((m) => ({ default: m.NightMarketPlayer }))),
    Host: lazy(() => import('./night-market.tsx').then((m) => ({ default: m.NightMarketHost }))),
    hostFeed: true,
  },
  'lantern-guard': {
    Player: lazy(() => import('./lantern-guard.tsx').then((m) => ({ default: m.LanternGuardPlayer }))),
    Host: lazy(() => import('./lantern-guard.tsx').then((m) => ({ default: m.LanternGuardHost }))),
    hostFeed: true,
  },
  'glim-duels': {
    Player: lazy(() => import('./glim-duels.tsx').then((m) => ({ default: m.GlimDuelsPlayer }))),
    Host: lazy(() => import('./glim-duels.tsx').then((m) => ({ default: m.GlimDuelsHost }))),
  },
  'lantern-trail': {
    Player: lazy(() => import('./lantern-trail.tsx').then((m) => ({ default: m.LanternTrailPlayer }))),
    Host: lazy(() => import('./lantern-trail.tsx').then((m) => ({ default: m.LanternTrailHost }))),
    hostFeed: true,
  },
  'lantern-lands': {
    Player: lazy(() => import('./lantern-lands.tsx').then((m) => ({ default: m.LanternLandsPlayer }))),
    Host: lazy(() => import('./lantern-lands.tsx').then((m) => ({ default: m.LanternLandsHost }))),
    hostFeed: true,
  },
  'festival-workshop': {
    Player: lazy(() => import('./festival-workshop.tsx').then((m) => ({ default: m.FestivalWorkshopPlayer }))),
    Host: lazy(() => import('./festival-workshop.tsx').then((m) => ({ default: m.FestivalWorkshopHost }))),
    hostFeed: true,
  },
};
