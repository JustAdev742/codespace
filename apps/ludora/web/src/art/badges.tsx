import { memo, type ReactNode } from 'react';
import { Cel, INK, hsl, useUid } from './covers/kit.tsx';

/*
 * Achievement and quest badges (finish): one drawn set in the Glims' style, from the covers'
 * kit: a crisp dark contour, flat fills and hard cel shading. An achievement is a medal on a
 * ribbon in its tier's metal (bronze, silver, gold); a quest is a six-sided token in its kind's
 * colour (daily, weekly, an event). The emblem in the middle says what it counts, one per metric,
 * so "Win 10 games" carries a trophy and "Open 5 Lanterns" a lantern wherever it appears.
 * Not earned yet: the same badge in grey with a dashed rim, so the shape is still recognisable.
 * Decoration: the title beside it always says the same in words.
 */

export type Emblem = 'play' | 'modes' | 'flame' | 'team' | 'scroll' | 'trophy' | 'podium' | 'bolt' | 'watch' | 'tick' | 'glim' | 'lantern' | 'album' | 'host' | 'pencil' | 'star';

const BY_METRIC: Record<string, Emblem> = {
  games_played: 'play',
  distinct_modes: 'modes',
  daily_streak: 'flame',
  team_games: 'team',
  daily_quests: 'scroll',
  games_won: 'trophy',
  podiums: 'podium',
  best_streak: 'bolt',
  streak_in_game: 'bolt',
  quick_answers: 'watch',
  questions_correct: 'tick',
  correct_answers: 'tick',
  glims_owned: 'glim',
  packs_opened: 'lantern',
  lanterns_opened: 'lantern',
  collections_completed: 'album',
  games_hosted: 'host',
  sets_created: 'pencil',
  level: 'star',
};

/** The emblem for a metric; anything new gets the star. */
export function emblemFor(metric: string | undefined): Emblem {
  return (metric && BY_METRIC[metric]) || 'star';
}

/** Every emblem, for the unit test and the badge sheet. */
export const EMBLEMS = [...new Set(Object.values(BY_METRIC)), 'star'] as Emblem[];

const METAL = {
  1: { face: '#d0884f', rim: '#9c5a2a' },
  2: { face: '#c3c8de', rim: '#7f88a8' },
  3: { face: '#f5c451', rim: '#c48a16' },
} as const;

const KIND_HUE = { daily: 222, weekly: 268, event: 176 } as const;

const GREY = { face: '#8a93ad', rim: '#5d6680', emblem: '#c9cfdf' };

/* Emblem drawings, centred on (32, 36) in a 64 x 64 badge. Each is a list of cel-shaded shapes. */
function EmblemArt({ e, tone }: { e: Emblem; tone: string }) {
  const W = '#ffffff';
  const parts: ReactNode[] = [];
  const s = (d: string, fill = W, key = d) => parts.push(<Cel key={key} d={d} fill={fill} line={1.4} off={1.6} shade={0.22} light={0.25} />);
  switch (e) {
    case 'play': // a game pad
      s('M20 32Q20 28 24 28H40Q44 28 44 32L46 41Q46 45 42 44L38 41H26L22 44Q18 45 18 41Z');
      parts.push(<path key="dpad" d="M25 33h2v-2h2v2h2v2h-2v2h-2v-2h-2z" fill={INK} />, <circle key="b1" cx="38" cy="33" r="1.6" fill={tone} />, <circle key="b2" cx="41" cy="36" r="1.6" fill={tone} />);
      break;
    case 'modes': // a fan of three cards
      s('M18 30L28 26L32 44L22 47Z', hsl(200, 70, 62), 'c1');
      s('M27 24H37V44H27Z', hsl(40, 85, 62), 'c2');
      s('M36 26L46 30L42 47L32 44Z', W, 'c3');
      break;
    case 'flame':
      s('M32 22Q40 30 40 37Q40 46 32 46Q24 46 24 38Q24 33 28 30Q28 34 31 35Q30 28 32 22Z', '#ffb02e');
      s('M32 34Q36 38 36 41Q36 45 32 45Q28 45 28 41Q28 38 32 34Z', '#fff2b8', 'core');
      break;
    case 'team': // two shields
      s('M17 27H29V36Q29 43 23 46Q17 43 17 36Z', hsl(210, 75, 62), 's1');
      s('M35 27H47V36Q47 43 41 46Q35 43 35 36Z', hsl(352, 78, 64), 's2');
      break;
    case 'scroll': // a quest scroll
      s('M21 25H41Q44 25 44 28V44Q44 47 41 47H24Q21 47 21 44Z', '#fff4d6');
      parts.push(<path key="lines" d="M25 31h14M25 35h14M25 39h9" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />, <circle key="seal" cx="39" cy="42" r="2.6" fill={tone} stroke={INK} strokeWidth="1.2" />);
      break;
    case 'trophy':
      s('M23 24H41V30Q41 38 32 39Q23 38 23 30Z', '#ffd24a');
      s('M29 39H35V43H29Z', '#ffd24a', 'stem');
      s('M24 43H40V47H24Z', '#ffffff', 'base');
      parts.push(<path key="handles" d="M23 27h-3q0 6 4 6M41 27h3q0 6-4 6" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />);
      break;
    case 'podium':
      s('M27 30H37V47H27Z', '#ffd24a', 'p1');
      s('M17 36H27V47H17Z', '#e2e6f2', 'p2');
      s('M37 39H47V47H37Z', '#e3a06a', 'p3');
      break;
    case 'bolt':
      s('M35 22L23 37H31L28 48L41 32H33Z', '#ffe066');
      break;
    case 'watch':
      s('M32 27A10 10 0 1 1 31.99 27Z', W);
      s('M29 22H35V26H29Z', W, 'crown');
      parts.push(<path key="hands" d="M32 37v-6M32 37l4 2" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />);
      break;
    case 'tick':
      s('M20 37L27 31L31 35L40 25L46 31L31 46Z', hsl(150, 70, 52));
      break;
    case 'glim': // a little Glim face
      s('M32 24Q44 24 44 37Q44 47 32 47Q20 47 20 37Q20 24 32 24Z', hsl(196, 72, 62));
      parts.push(<circle key="e1" cx="27.5" cy="35" r="2.2" fill={INK} />, <circle key="e2" cx="36.5" cy="35" r="2.2" fill={INK} />, <path key="m" d="M29 41q3 2.5 6 0" stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" />);
      break;
    case 'lantern':
      s('M28 23H36V26H28Z', '#3b4166', 'cap');
      s('M24 27Q32 24 40 27Q43 36 40 44Q32 47 24 44Q21 36 24 27Z', '#ffb84a');
      parts.push(<path key="ribs" d="M32 26v20M27.5 27q-2 9 0 18M36.5 27q2 9 0 18" stroke={INK} strokeWidth="1.1" opacity="0.5" fill="none" />);
      break;
    case 'album': // a collection album with a card
      s('M19 26H43V47H19Z', hsl(280, 55, 60));
      s('M25 30H37V44H25Z', W, 'card');
      parts.push(<path key="star" d="M31 33l1.3 2.6 2.8.4-2 2 .5 2.8-2.6-1.4-2.6 1.4.5-2.8-2-2 2.8-.4z" fill="#ffc233" stroke={INK} strokeWidth="0.8" />);
      break;
    case 'host': // the big screen on its stand
      s('M18 25H46V41H18Z', hsl(222, 70, 60));
      s('M29 41H35V45H29Z', W, 'neck');
      s('M24 45H40V48H24Z', W, 'foot');
      parts.push(<path key="play" d="M29 29.5v7l6-3.5z" fill={W} stroke={INK} strokeWidth="1" strokeLinejoin="round" />);
      break;
    case 'pencil':
      s('M38 22L44 28L28 44L22 44L22 38Z', '#ffd24a');
      s('M22 38L28 44L22 44Z', '#f3d2a8', 'tip');
      parts.push(<path key="band" d="M34.5 25.5l6 6" stroke={INK} strokeWidth="1.6" />);
      break;
    case 'star':
      s('M32 22L35.5 31.5L45.5 32L37.6 38.2L40.4 48L32 42.4L23.6 48L26.4 38.2L18.5 32L28.5 31.5Z', '#ffe066');
      break;
  }
  return <>{parts}</>;
}

/** Not earned yet: the same drawing without its colour. */
function GreyFilter({ id }: { id: string }) {
  return (
    <filter id={id}>
      <feColorMatrix type="saturate" values="0" />
    </filter>
  );
}

/** An achievement's medal: ribbon, metal rim by tier, the colour of the achievement, and its emblem. */
export const AchievementBadge = memo(function AchievementBadge({ metric, tier, hue, earned, size = 64, className = '' }: { metric: string; tier: 1 | 2 | 3; hue: number; earned: boolean; size?: number; className?: string }) {
  const metal = earned ? METAL[tier] : GREY;
  const grey = `${useUid()}g`;
  const face = earned ? hsl(hue, 70, 50) : '#6b7390';
  const body = (
    <>
      <Cel d="M20 2H30L33 20H23Z" fill={earned ? hsl(hue, 70, 42) : '#596079'} line={1.4} off={1.4} shade={0.25} light={0.15} />
      <Cel d="M44 2H34L31 20H41Z" fill={earned ? hsl(hue + 30, 75, 56) : '#737b96'} line={1.4} off={1.4} shade={0.25} light={0.15} />
      <Cel d="M32 15A21 21 0 1 1 31.99 15Z" fill={metal.face} line={1.8} off={2.6} shade={0.3} light={0.35} />
      <Cel d="M32 21A15 15 0 1 1 31.99 21Z" fill={face} line={1.4} off={1.6} shade={0.22} light={0.2} />
      <g transform="translate(32 36) scale(0.62) translate(-32 -36)">
        <EmblemArt e={emblemFor(metric)} tone={metal.rim} />
      </g>
    </>
  );
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden focusable={false}>
      <defs>
        <GreyFilter id={grey} />
      </defs>
      {earned ? body : <g filter={`url(#${grey})`}>{body}</g>}
      {earned ? null : <circle cx="32" cy="36" r="21" fill="none" stroke="var(--text-3)" strokeWidth="1.6" strokeDasharray="4 3" />}
    </svg>
  );
});

/** A quest's token: six-sided, in the colour of its kind, with the emblem of what it counts. */
export const QuestBadge = memo(function QuestBadge({ metric, kind, done, size = 44, className = '' }: { metric: string | undefined; kind: 'daily' | 'weekly' | 'event'; done: boolean; size?: number; className?: string }) {
  const hue = KIND_HUE[kind];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden focusable={false}>
      <Cel d="M32 4L56 18V46L32 60L8 46V18Z" fill={hsl(hue, 70, done ? 52 : 44)} line={2} off={3} shade={0.3} light={0.3} />
      <g transform="translate(32 32) scale(0.92) translate(-32 -35)">
        <EmblemArt e={emblemFor(metric)} tone={hsl(hue, 70, 40)} />
      </g>
      {done ? (
        <g>
          <circle cx="49" cy="50" r="9" fill={hsl(150, 70, 48)} stroke={INK} strokeWidth="2" />
          <path d="M44.5 50l3 3 6-6" stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : null}
    </svg>
  );
});
