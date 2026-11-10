/*
 * Achievement kinds and the "nearly there" pick, from each achievement's own metric, so a new
 * achievement on a known metric lands in the right place with no extra work.
 */

export const ACHIEVEMENT_CATEGORIES = [
  { value: 'playing', label: 'Playing', metrics: ['games_played', 'distinct_modes', 'daily_streak', 'team_games', 'daily_quests'] },
  { value: 'winning', label: 'Winning', metrics: ['games_won', 'podiums', 'best_streak', 'streak_in_game', 'quick_answers'] },
  { value: 'learning', label: 'Learning', metrics: ['questions_correct', 'correct_answers'] },
  { value: 'collecting', label: 'Collecting', metrics: ['glims_owned', 'packs_opened', 'lanterns_opened', 'collections_completed'] },
  { value: 'making', label: 'Hosting and making', metrics: ['games_hosted', 'sets_created'] },
  { value: 'levels', label: 'Levels', metrics: ['level'] },
] as const;

export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number]['value'];

/** The kind an achievement belongs to; anything on a metric not listed counts as playing. */
export function achievementCategory(metric: string): AchievementCategory {
  return ACHIEVEMENT_CATEGORIES.find((c) => (c.metrics as readonly string[]).includes(metric))?.value ?? 'playing';
}

/** Up to three achievements not yet earned and at least half done, closest first. */
export function nearlyThere<T extends { unlockedAt: string | null; progress: number; target: number }>(list: readonly T[], count = 3): T[] {
  return list
    .filter((a) => !a.unlockedAt && a.target > 0 && a.progress / a.target >= 0.5 && a.progress < a.target)
    .sort((a, b) => b.progress / b.target - a.progress / a.target || a.target - a.progress - (b.target - b.progress))
    .slice(0, count);
}
