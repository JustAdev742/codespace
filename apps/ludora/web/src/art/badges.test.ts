import { describe, expect, it } from 'vitest';
import { EMBLEMS, emblemFor } from './badges.tsx';

describe('achievement and quest badges', () => {
  it('give every metric in the game its own drawn emblem, and new ones the star', () => {
    const metrics = ['games_played', 'distinct_modes', 'daily_streak', 'team_games', 'daily_quests', 'games_won', 'podiums', 'best_streak', 'streak_in_game', 'quick_answers', 'questions_correct', 'correct_answers', 'glims_owned', 'packs_opened', 'lanterns_opened', 'collections_completed', 'games_hosted', 'sets_created', 'level'];
    for (const m of metrics) expect(EMBLEMS).toContain(emblemFor(m));
    expect(emblemFor('games_won')).toBe('trophy');
    expect(emblemFor('lanterns_opened')).toBe('lantern');
    expect(emblemFor('something_new')).toBe('star');
    expect(emblemFor(undefined)).toBe('star');
    expect(new Set(metrics.map(emblemFor)).size).toBeGreaterThanOrEqual(15);
  });
});
