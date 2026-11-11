import type { Membership, QuestionRow } from './logic.ts';

/* The shape of GET /api/games/:id/report (server/src/modules/analytics/routes.ts). */

export interface Standing {
  rank: number;
  playerKey: string;
  name: string;
  isGuest: boolean;
  isBot: boolean;
  membership: Membership;
  team: string | null;
  score: number;
  label: string;
  correct: number;
  answered: number;
  avgResponseMs: number;
  bestStreak: number;
  leftEarly: boolean;
}

export interface QuestionView {
  questions: QuestionRow[];
  misconceptions: string[];
  hardest: string[];
  easiest: string[];
  totals: { answered: number; right: number };
}

export interface GameReportData {
  game: {
    id: string;
    mode: string;
    modeId: string;
    variantId: string | null;
    setTitle: string;
    setId: string | null;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    /** People, not counting practice bots. */
    players: number;
    endedBy: string;
    solo: boolean;
    pacing: 'host' | 'self' | 'solo' | string;
    classId: string | null;
    className: string | null;
  };
  standings: Standing[];
  questions: QuestionRow[];
  view: QuestionView;
  /** The same without guests; null when there are no guests (or only guests). */
  viewAccounts: QuestionView | null;
  participation: { expected: number; rows: { playerKey: string; name: string; answered: number; leftEarly: boolean; fewAnswers: boolean }[] };
  guessing: { playerKey: string; name: string; fastWrong: number; answered: number }[];
  teams: { teamId: string; name: string; rank: number | null; score: number | null; label: string | null; members: number; answered: number; correct: number; rate: number | null }[];
  pace: { playerKey: string; name: string; answered: number; correct: number; perMinute: number }[] | null;
  note: { body: string; updatedAt: string } | null;
  can: { delete: boolean; reteach: boolean };
  /** For the host only: what "Host again" brings back. */
  setup?: { setId: string };
}

export interface PlayerAnswers {
  player: { name: string; membership: Membership; team: string | null; rank: number; score: number; leftEarly: boolean };
  answers: { questionId: string; prompt: string; type: string; given: string | null; correct: boolean; responseMs: number; tries: number }[];
}
