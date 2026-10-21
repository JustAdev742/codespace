import { z } from 'zod';

/**
 * Vocabulary for staff tools and player reports. The server enforces every
 * rule here; the web app uses the same lists to build its forms.
 */

export const MODERATION_ACTIONS = ['warn', 'mute', 'unmute', 'suspend', 'unsuspend', 'ban', 'unban', 'reset_name'] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export const MODERATION_ACTION_INFO: Record<ModerationAction, { label: string; past: string; needsDuration: boolean; description: string }> = {
  warn: { label: 'Warn', past: 'Warned', needsDuration: false, description: 'The player sees the reason the next time they open Ludora.' },
  mute: { label: 'Mute', past: 'Muted', needsDuration: true, description: 'No reactions in games and no name changes until it ends.' },
  unmute: { label: 'Unmute', past: 'Unmuted', needsDuration: false, description: 'Lift a mute early.' },
  suspend: { label: 'Suspend', past: 'Suspended', needsDuration: false, description: 'Signs the player out everywhere and blocks sign-in until it ends. Leave the length empty for no end date.' },
  unsuspend: { label: 'Lift suspension', past: 'Suspension lifted', needsDuration: false, description: 'Let the player sign in again.' },
  ban: { label: 'Ban', past: 'Banned', needsDuration: false, description: 'Permanent. Signs the player out and removes them from live games.' },
  unban: { label: 'Unban', past: 'Unbanned', needsDuration: false, description: 'Restore a banned account.' },
  reset_name: { label: 'Reset display name', past: 'Name reset', needsDuration: false, description: 'Replace an inappropriate display name with a neutral one.' },
};

export const REPORT_TARGETS = ['user', 'set', 'room'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = ['inappropriate_name', 'harassment', 'inappropriate_content', 'cheating', 'spam', 'wrong_answers', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_INFO: Record<ReportReason, { label: string; targets: readonly ReportTarget[] }> = {
  inappropriate_name: { label: 'Inappropriate name', targets: ['user', 'room'] },
  harassment: { label: 'Bullying or harassment', targets: ['user', 'room'] },
  inappropriate_content: { label: 'Inappropriate content', targets: ['user', 'set', 'room'] },
  cheating: { label: 'Cheating', targets: ['user', 'room'] },
  spam: { label: 'Spam', targets: ['user', 'set'] },
  wrong_answers: { label: 'Wrong or misleading answers', targets: ['set'] },
  other: { label: 'Something else', targets: ['user', 'set', 'room'] },
};

export const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.string().trim().min(1).max(64),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).default(''),
});
export type ReportInput = z.infer<typeof reportSchema>;

/** A reason is required for every staff action and is stored in the audit log. */
export const staffReasonSchema = z.string().trim().min(3, 'Give a reason (at least 3 characters).').max(500);

export const RESET_SCOPES = ['economy', 'inventory', 'progression'] as const;
export type ResetScope = (typeof RESET_SCOPES)[number];

export const RESET_SCOPE_INFO: Record<ResetScope, { label: string; description: string }> = {
  economy: { label: 'Wallet', description: 'Every balance back to zero, written to the ledger as a test reset.' },
  inventory: { label: 'Collection and purchases', description: 'Removes every item, equipped slot, Lantern pity counter and purchase limit.' },
  progression: { label: 'Progress', description: 'XP, level, stats, daily streak, quests and achievements.' },
};

/**
 * Preset states for testing a flow without playing up to it. They only run
 * on test accounts, and never in production.
 */
export const QA_SCENARIOS = ['fresh', 'wealthy', 'almost_complete', 'every_cosmetic', 'level_up_ready', 'streak_six', 'pity_ready'] as const;
export type QaScenario = (typeof QA_SCENARIOS)[number];

export const QA_SCENARIO_INFO: Record<QaScenario, { label: string; description: string }> = {
  fresh: { label: 'Brand-new player', description: 'Resets everything, then gives the welcome Sparks and starter Glims again.' },
  wealthy: { label: 'Plenty to spend', description: 'Adds 50,000 Sparks, 2,000 Moonstones and 5,000 Dust.' },
  almost_complete: { label: 'One Glim from a collection', description: 'Owns every Meadow Glim except one, so the next one completes the collection.' },
  every_cosmetic: { label: 'Every cosmetic', description: 'Owns one of every live accessory, frame, banner, title, emote and effect.' },
  level_up_ready: { label: 'About to level up', description: 'XP set just below the next level.' },
  streak_six: { label: 'Six-day streak', description: 'Played on each of the last six days, so the next game pays the weekly bonus.' },
  pity_ready: { label: 'Lantern guarantee due', description: 'The next Lantern of every kind is guaranteed epic or better.' },
};

export const ENTITLEMENT_KINDS = ['unlimited_currency'] as const;
export type EntitlementKind = (typeof ENTITLEMENT_KINDS)[number];

/**
 * Largest single grant to a real (non-test) account, per currency. Bigger
 * corrections are split into several audited grants. Test accounts may
 * receive up to TEST_GRANT_MAX in one go.
 */
export const REAL_GRANT_MAX: Record<string, number> = { sparks: 10_000, moonstones: 500, dust: 5_000 };
export const REAL_GRANT_MAX_OTHER = 1_000;
export const TEST_GRANT_MAX = 1_000_000;
export const ITEM_GRANT_MAX = 100;

export function realGrantCap(currency: string): number {
  return REAL_GRANT_MAX[currency] ?? REAL_GRANT_MAX_OTHER;
}

export const MODE_VISIBILITIES = ['published', 'featured', 'hidden'] as const;
export type ModeVisibilityValue = (typeof MODE_VISIBILITIES)[number];
