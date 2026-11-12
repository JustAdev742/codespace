/**
 * Practice bots: the levels a player can pick and the personalities bots play with.
 * Words only. What each level and personality means in play is decided on the
 * server (packages/engine/src/bots), never by the client, which only names a level.
 */

export const PRACTICE_LEVEL_IDS = ['easy', 'medium', 'hard', 'mixed', 'mine'] as const;
export type PracticeLevel = (typeof PRACTICE_LEVEL_IDS)[number];

export const PRACTICE_LEVEL_INFO: Record<PracticeLevel, { label: string; blurb: string }> = {
  easy: { label: 'Easy', blurb: 'Slow, and often wrong.' },
  medium: { label: 'Medium', blurb: 'About as good as most of a class.' },
  hard: { label: 'Hard', blurb: 'Quick, and nearly always right.' },
  mixed: { label: 'Mixed class', blurb: 'A spread, like a real class: some careful, some quick, some still learning.' },
  mine: { label: 'My level', blurb: 'They watch how you are doing in this game and stay close to you.' },
};

export const PERSONA_IDS = ['careful', 'quick', 'steady', 'finisher', 'nervous', 'guesser', 'dreamer'] as const;
export type PersonaId = (typeof PERSONA_IDS)[number];

/** How a personality is shown: one word on a seat, a line on the setup page. */
export const PERSONA_INFO: Record<PersonaId, { label: string; blurb: string }> = {
  careful: { label: 'Careful', blurb: 'Reads every word and takes its time.' },
  quick: { label: 'Quick', blurb: 'Fast, and sometimes careless.' },
  steady: { label: 'Steady', blurb: 'Even all game, and hard to rattle.' },
  finisher: { label: 'Strong finisher', blurb: 'Slow to get going, best near the end.' },
  nervous: { label: 'Nervous starter', blurb: 'Shaky at first, and a mistake can knock it.' },
  guesser: { label: 'Guesser', blurb: 'Would rather guess than run out of time.' },
  dreamer: { label: 'Daydreamer', blurb: 'Knows a lot, but drifts off now and then.' },
};

/** The personalities a level brings, for the setup page to list before the game is made. */
export const PRACTICE_LEVEL_PERSONAS: Record<PracticeLevel, readonly PersonaId[]> = {
  easy: ['nervous', 'guesser', 'dreamer', 'quick'],
  medium: ['steady', 'careful', 'quick', 'guesser'],
  hard: ['careful', 'steady', 'finisher', 'quick'],
  mixed: ['careful', 'quick', 'steady', 'finisher', 'nervous', 'guesser', 'dreamer'],
  mine: ['steady', 'careful', 'quick', 'finisher'],
};
