import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/*
 * Database schema. Rules that protect money-like data (balances, item
 * counts) are enforced here with CHECK constraints as well as in code, so a
 * bug in a service cannot write an impossible value.
 */

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const now = (name: string) => ts(name).notNull().defaultNow();
const big = (name: string) => bigint(name, { mode: 'number' });

/* --------------------------------- accounts -------------------------------- */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Lowercase login name. Null for guests until they claim the account. */
    username: text('username'),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash'),
    isGuest: boolean('is_guest').notNull().default(false),
    accountType: text('account_type').notNull().default('player'),
    ageBand: text('age_band'),
    email: text('email'),
    emailVerifiedAt: ts('email_verified_at'),
    friendCode: text('friend_code').notNull(),
    isTestAccount: boolean('is_test_account').notNull().default(false),
    status: text('status').notNull().default('active'),
    suspendedUntil: ts('suspended_until'),
    mutedUntil: ts('muted_until'),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: ts('locked_until'),
    recoveryCodeHash: text('recovery_code_hash'),
    xp: big('xp').notNull().default(0),
    level: integer('level').notNull().default(1),
    preferences: jsonb('preferences').notNull().default({}),
    nameChangedAt: ts('name_changed_at'),
    /** When this account found the secret chaos lantern. Null means locked. Set only by the server-verified sequence. */
    chaosUnlockedAt: ts('chaos_unlocked_at'),
    createdAt: now('created_at'),
    updatedAt: now('updated_at'),
    lastSeenAt: ts('last_seen_at'),
  },
  (t) => [
    uniqueIndex('users_username_uq').on(t.username),
    uniqueIndex('users_email_uq').on(t.email),
    uniqueIndex('users_friend_code_uq').on(t.friendCode),
    index('users_created_idx').on(t.createdAt),
    index('users_guest_seen_idx').on(t.isGuest, t.lastSeenAt),
    check('users_xp_nonneg', sql`${t.xp} >= 0`),
    check('users_status_valid', sql`${t.status} in ('active','suspended','banned')`),
    check('users_account_type_valid', sql`${t.accountType} in ('player','student','teacher')`),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason'),
    grantedAt: now('granted_at'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] }), index('user_roles_role_idx').on(t.role)],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the cookie token. The token itself is never stored. */
    id: text('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: now('created_at'),
    expiresAt: ts('expires_at').notNull(),
    lastSeenAt: now('last_seen_at'),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    revokedAt: ts('revoked_at'),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

export const entitlements = pgTable(
  'entitlements',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    createdAt: now('created_at'),
    expiresAt: ts('expires_at'),
    revokedAt: ts('revoked_at'),
  },
  (t) => [index('entitlements_user_idx').on(t.userId, t.kind)],
);

/* --------------------------------- content --------------------------------- */

export const questionSets = pgTable(
  'question_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    subject: text('subject').notNull(),
    gradeBand: text('grade_band'),
    language: text('language').notNull().default('en'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    visibility: text('visibility').notNull().default('private'),
    cover: jsonb('cover'),
    questions: jsonb('questions').notNull(),
    questionCount: integer('question_count').notNull(),
    isOfficial: boolean('is_official').notNull().default(false),
    isFeatured: boolean('is_featured').notNull().default(false),
    hiddenAt: ts('hidden_at'),
    hiddenReason: text('hidden_reason'),
    plays: integer('plays').notNull().default(0),
    /** Stable key for built-in sets so seeding can update them in place. */
    seedKey: text('seed_key'),
    search: tsvector('search').generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(subject,''))`,
    ),
    createdAt: now('created_at'),
    updatedAt: now('updated_at'),
  },
  (t) => [
    index('sets_owner_idx').on(t.ownerId),
    index('sets_public_idx').on(t.visibility, t.subject),
    index('sets_search_idx').using('gin', t.search),
    uniqueIndex('sets_seed_key_uq').on(t.seedKey),
    check('sets_visibility_valid', sql`${t.visibility} in ('private','unlisted','public')`),
  ],
);

/* ---------------------------------- games ---------------------------------- */

export const gameSessions = pgTable(
  'game_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomCode: text('room_code').notNull(),
    modeId: text('mode_id').notNull(),
    variantId: text('variant_id'),
    hostUserId: uuid('host_user_id').references(() => users.id, { onDelete: 'set null' }),
    setId: uuid('set_id').references(() => questionSets.id, { onDelete: 'set null' }),
    setTitle: text('set_title').notNull(),
    settings: jsonb('settings').notNull(),
    common: jsonb('common').notNull(),
    status: text('status').notNull(),
    endedBy: text('ended_by').notNull(),
    playerCount: integer('player_count').notNull(),
    summary: text('summary').notNull().default(''),
    classId: uuid('class_id'),
    assignmentId: uuid('assignment_id'),
    isSolo: boolean('is_solo').notNull().default(false),
    /** Set when chaos cheats were cast in this game: how many, and by which player slots. */
    chaos: jsonb('chaos'),
    startedAt: ts('started_at').notNull(),
    endedAt: ts('ended_at').notNull(),
    durationMs: integer('duration_ms').notNull(),
  },
  (t) => [index('games_host_idx').on(t.hostUserId, t.endedAt), index('games_ended_idx').on(t.endedAt), index('games_class_idx').on(t.classId)],
);

export const gameParticipants = pgTable(
  'game_participants',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    gameId: uuid('game_id').notNull().references(() => gameSessions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    playerKey: text('player_key').notNull(),
    displayName: text('display_name').notNull(),
    isGuest: boolean('is_guest').notNull(),
    isBot: boolean('is_bot').notNull(),
    teamId: text('team_id'),
    rank: integer('rank').notNull(),
    score: big('score').notNull(),
    label: text('label').notNull(),
    answered: integer('answered').notNull(),
    correct: integer('correct').notNull(),
    avgResponseMs: integer('avg_response_ms').notNull(),
    bestStreak: integer('best_streak').notNull(),
    leftEarly: boolean('left_early').notNull().default(false),
    rewards: jsonb('rewards'),
  },
  (t) => [index('participants_game_idx').on(t.gameId), index('participants_user_idx').on(t.userId, t.gameId)],
);

export const answerEvents = pgTable(
  'answer_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    gameId: uuid('game_id').notNull().references(() => gameSessions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    playerKey: text('player_key').notNull(),
    setId: uuid('set_id'),
    questionId: text('question_id').notNull(),
    correct: boolean('correct').notNull(),
    partial: real('partial').notNull(),
    responseMs: integer('response_ms').notNull(),
    /** 'answer', 'attempt' (one of several tries in a puzzle) or 'self' (self-graded). Reports weigh them differently. */
    kind: text('kind').notNull().default('answer'),
    createdAt: now('created_at'),
  },
  (t) => [
    index('answers_game_idx').on(t.gameId),
    index('answers_user_idx').on(t.userId, t.createdAt),
    index('answers_set_question_idx').on(t.setId, t.questionId),
  ],
);

/* --------------------------------- economy --------------------------------- */

export const currencies = pgTable('currencies', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  kind: text('kind').notNull(),
  hue: integer('hue').notNull(),
  howToEarn: text('how_to_earn').notNull(),
  howToSpend: text('how_to_spend').notNull(),
  expiresAt: ts('expires_at'),
  active: boolean('active').notNull().default(true),
  sort: integer('sort').notNull().default(0),
});

export const wallets = pgTable(
  'wallets',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    currency: text('currency').notNull().references(() => currencies.code),
    balance: big('balance').notNull().default(0),
    updatedAt: now('updated_at'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.currency] }), check('wallets_balance_nonneg', sql`${t.balance} >= 0`)],
);

/** One row per economy operation, keyed by the client's idempotency key. A replay finds the row and returns its result. */
export const economyOps = pgTable(
  'economy_ops',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    idemKey: text('idem_key').notNull(),
    kind: text('kind').notNull(),
    result: jsonb('result'),
    createdAt: now('created_at'),
  },
  (t) => [uniqueIndex('economy_ops_user_key_uq').on(t.userId, t.idemKey)],
);

export const ledger = pgTable(
  'ledger_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    currency: text('currency').notNull(),
    delta: big('delta').notNull(),
    balanceAfter: big('balance_after').notNull(),
    reason: text('reason').notNull(),
    refType: text('ref_type'),
    refId: text('ref_id'),
    opId: big('op_id'),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    /** True when an unlimited-currency test entitlement covered the cost. */
    unlimited: boolean('unlimited').notNull().default(false),
    metadata: jsonb('metadata'),
    createdAt: now('created_at'),
  },
  (t) => [
    index('ledger_user_idx').on(t.userId, t.createdAt),
    index('ledger_reason_idx').on(t.reason, t.createdAt),
    check('ledger_balance_after_nonneg', sql`${t.balanceAfter} >= 0`),
  ],
);

export const economyConfig = pgTable('economy_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: now('updated_at'),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
});

/* --------------------------- collectibles and shop -------------------------- */

export const collections = pgTable('collections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  hue: integer('hue').notNull(),
  /** { currency, amount, itemId? } granted once when every item in the collection is owned. */
  reward: jsonb('reward'),
  releaseState: text('release_state').notNull().default('live'),
  sort: integer('sort').notNull().default(0),
});

export const items = pgTable(
  'items',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    rarity: text('rarity').notNull(),
    collectionId: text('collection_id').references(() => collections.id, { onDelete: 'set null' }),
    art: jsonb('art').notNull(),
    releaseState: text('release_state').notNull().default('live'),
    isTestOnly: boolean('is_test_only').notNull().default(false),
    sort: integer('sort').notNull().default(0),
    createdAt: now('created_at'),
    updatedAt: now('updated_at'),
    /** Set when staff edit the item. Until then, the shipped content keeps its art, name and description up to date. */
    customizedAt: ts('customized_at'),
  },
  (t) => [index('items_type_idx').on(t.type, t.rarity), index('items_collection_idx').on(t.collectionId)],
);

export const inventory = pgTable(
  'inventory',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(1),
    firstAcquiredAt: now('first_acquired_at'),
    lastAcquiredAt: now('last_acquired_at'),
    source: text('source').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] }), check('inventory_quantity_nonneg', sql`${t.quantity} >= 0`)],
);

export const equipped = pgTable(
  'equipped',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    slot: text('slot').notNull(),
    itemId: text('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.slot] })],
);

export const packs = pgTable('packs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  art: jsonb('art').notNull(),
  priceCurrency: text('price_currency').notNull().references(() => currencies.code),
  priceAmount: integer('price_amount').notNull(),
  dropTable: jsonb('drop_table').notNull(),
  releaseState: text('release_state').notNull().default('live'),
  availableFrom: ts('available_from'),
  availableUntil: ts('available_until'),
  sort: integer('sort').notNull().default(0),
});

export const packOpenings = pgTable(
  'pack_openings',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    packId: text('pack_id').notNull().references(() => packs.id),
    opId: big('op_id').notNull(),
    itemId: text('item_id').notNull(),
    rarity: text('rarity').notNull(),
    duplicate: boolean('duplicate').notNull(),
    pity: boolean('pity').notNull().default(false),
    unlimited: boolean('unlimited').notNull().default(false),
    createdAt: now('created_at'),
  },
  (t) => [index('pack_openings_user_idx').on(t.userId, t.createdAt)],
);

export const pityCounters = pgTable(
  'pity_counters',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    packId: text('pack_id').notNull().references(() => packs.id, { onDelete: 'cascade' }),
    sinceEpic: integer('since_epic').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.packId] })],
);

export const shopListings = pgTable(
  'shop_listings',
  {
    id: text('id').primaryKey(),
    section: text('section').notNull(),
    itemId: text('item_id').references(() => items.id, { onDelete: 'cascade' }),
    packId: text('pack_id').references(() => packs.id, { onDelete: 'cascade' }),
    /** Item ids for a bundle listing. */
    bundle: jsonb('bundle'),
    title: text('title'),
    description: text('description'),
    priceCurrency: text('price_currency').notNull().references(() => currencies.code),
    priceAmount: integer('price_amount').notNull(),
    /** What the bundle would cost bought separately, shown as the saving. */
    worth: integer('worth'),
    perUserLimit: integer('per_user_limit'),
    /** 'daily' or 'weekly': the listing appears only when today's rotation picks it. */
    rotation: text('rotation'),
    startsAt: ts('starts_at'),
    endsAt: ts('ends_at'),
    active: boolean('active').notNull().default(true),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    index('listings_section_idx').on(t.section, t.active),
    check('listings_price_nonneg', sql`${t.priceAmount} >= 0`),
    check('listings_target', sql`num_nonnulls(${t.itemId}, ${t.packId}, ${t.bundle}) = 1`),
  ],
);

export const purchases = pgTable(
  'purchases',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    listingId: text('listing_id').notNull(),
    opId: big('op_id').notNull(),
    priceCurrency: text('price_currency').notNull(),
    priceAmount: integer('price_amount').notNull(),
    unlimited: boolean('unlimited').notNull().default(false),
    createdAt: now('created_at'),
  },
  (t) => [index('purchases_user_listing_idx').on(t.userId, t.listingId)],
);

/* -------------------------------- progression ------------------------------- */

export const userStats = pgTable('user_stats', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  gamesPlayed: integer('games_played').notNull().default(0),
  gamesWon: integer('games_won').notNull().default(0),
  podiums: integer('podiums').notNull().default(0),
  gamesHosted: integer('games_hosted').notNull().default(0),
  questionsAnswered: integer('questions_answered').notNull().default(0),
  questionsCorrect: integer('questions_correct').notNull().default(0),
  bestStreak: integer('best_streak').notNull().default(0),
  totalResponseMs: big('total_response_ms').notNull().default(0),
  modesPlayed: jsonb('modes_played').notNull().default({}),
  packsOpened: integer('packs_opened').notNull().default(0),
  dailyStreak: integer('daily_streak').notNull().default(0),
  longestDailyStreak: integer('longest_daily_streak').notNull().default(0),
  lastPlayDay: date('last_play_day', { mode: 'string' }),
  sparksToday: integer('sparks_today').notNull().default(0),
  sparksDay: date('sparks_day', { mode: 'string' }),
  updatedAt: now('updated_at'),
});

export const quests = pgTable('quests', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  metric: text('metric').notNull(),
  target: integer('target').notNull(),
  reward: jsonb('reward').notNull(),
  weight: integer('weight').notNull().default(1),
  active: boolean('active').notNull().default(true),
});

export const userQuests = pgTable(
  'user_quests',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    questId: text('quest_id').notNull().references(() => quests.id, { onDelete: 'cascade' }),
    period: text('period').notNull(),
    progress: integer('progress').notNull().default(0),
    target: integer('target').notNull(),
    completedAt: ts('completed_at'),
    claimedAt: ts('claimed_at'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.questId, t.period] })],
);

export const achievements = pgTable('achievements', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  metric: text('metric').notNull(),
  target: integer('target').notNull(),
  reward: jsonb('reward').notNull(),
  tier: integer('tier').notNull().default(1),
  hue: integer('hue').notNull().default(42),
  secret: boolean('secret').notNull().default(false),
  sort: integer('sort').notNull().default(0),
});

export const userAchievements = pgTable(
  'user_achievements',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    achievementId: text('achievement_id').notNull().references(() => achievements.id, { onDelete: 'cascade' }),
    unlockedAt: now('unlocked_at'),
    claimedAt: ts('claimed_at'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.achievementId] })],
);

/* ---------------------------------- social --------------------------------- */

export const friendships = pgTable(
  'friendships',
  {
    /** The smaller of the two user ids, so each pair has exactly one row. */
    userA: uuid('user_a').notNull().references(() => users.id, { onDelete: 'cascade' }),
    userB: uuid('user_b').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    requestedBy: uuid('requested_by').notNull(),
    createdAt: now('created_at'),
    acceptedAt: ts('accepted_at'),
  },
  (t) => [primaryKey({ columns: [t.userA, t.userB] }), index('friendships_b_idx').on(t.userB), check('friendships_ordered', sql`${t.userA} < ${t.userB}`)],
);

export const blocks = pgTable(
  'blocks',
  {
    blockerId: uuid('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: now('created_at'),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

export const classes = pgTable(
  'classes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    joinCode: text('join_code').notNull(),
    createdAt: now('created_at'),
    archivedAt: ts('archived_at'),
  },
  (t) => [uniqueIndex('classes_join_code_uq').on(t.joinCode), index('classes_owner_idx').on(t.ownerId)],
);

export const classMembers = pgTable(
  'class_members',
  {
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('student'),
    joinedAt: now('joined_at'),
  },
  (t) => [primaryKey({ columns: [t.classId, t.userId] }), index('class_members_user_idx').on(t.userId)],
);

export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    setId: uuid('set_id').notNull().references(() => questionSets.id, { onDelete: 'cascade' }),
    modeId: text('mode_id').notNull(),
    variantId: text('variant_id'),
    title: text('title').notNull(),
    instructions: text('instructions').notNull().default(''),
    dueAt: ts('due_at'),
    createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: now('created_at'),
  },
  (t) => [index('assignments_class_idx').on(t.classId)],
);

/* ------------------------- moderation, audit, system ------------------------ */

export const reports = pgTable(
  'reports',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason').notNull(),
    details: text('details').notNull().default(''),
    status: text('status').notNull().default('open'),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolution: text('resolution'),
    createdAt: now('created_at'),
    resolvedAt: ts('resolved_at'),
  },
  (t) => [index('reports_status_idx').on(t.status, t.createdAt), index('reports_target_idx').on(t.targetType, t.targetId)],
);

export const moderationActions = pgTable(
  'moderation_actions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    targetUserId: uuid('target_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    reason: text('reason').notNull(),
    until: ts('until'),
    reportId: big('report_id'),
    createdAt: now('created_at'),
    /** When the player dismissed the notice for a warning or mute. */
    acknowledgedAt: ts('acknowledged_at'),
  },
  (t) => [index('moderation_target_idx').on(t.targetUserId, t.createdAt)],
);

/**
 * Images people upload for their questions. Files live in UPLOAD_DIR under a
 * random name; this table says who uploaded them and whether staff hid them.
 */
/** One AI draft request: who asked, how it went and what it used. The topic is not kept. */
export const aiDraftRequests = pgTable(
  'ai_draft_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: now('created_at'),
    model: text('model').notNull(),
    requested: integer('requested').notNull(),
    returned: integer('returned').notNull().default(0),
    outcome: text('outcome').notNull().default('pending'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
  },
  (t) => [
    index('ai_draft_requests_user_idx').on(t.userId, t.createdAt),
    index('ai_draft_requests_created_idx').on(t.createdAt),
    check('ai_draft_requests_outcome_valid', sql`${t.outcome} in ('pending','ok','refused','failed')`),
  ],
);

export const uploads = pgTable(
  'uploads',
  {
    id: text('id').primaryKey(),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sha256: text('sha256').notNull(),
    createdAt: now('created_at'),
    hiddenAt: ts('hidden_at'),
    hiddenBy: uuid('hidden_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [index('uploads_owner_idx').on(t.ownerId, t.createdAt), check('uploads_mime_valid', sql`${t.mime} in ('image/png','image/jpeg','image/gif','image/webp')`)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull(),
    actorRoles: text('actor_roles').array().notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    targetName: text('target_name'),
    reason: text('reason'),
    before: jsonb('before'),
    after: jsonb('after'),
    ipHash: text('ip_hash'),
    environment: text('environment').notNull(),
    createdAt: now('created_at'),
  },
  (t) => [
    index('audit_created_idx').on(t.createdAt),
    index('audit_actor_idx').on(t.actorId, t.createdAt),
    index('audit_target_idx').on(t.targetType, t.targetId),
    index('audit_action_idx').on(t.action, t.createdAt),
  ],
);

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  description: text('description').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  rolloutPercent: integer('rollout_percent').notNull().default(0),
  roles: text('roles').array().notNull().default(sql`'{}'::text[]`),
  userIds: uuid('user_ids').array().notNull().default(sql`'{}'::uuid[]`),
  updatedAt: now('updated_at'),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
});

export const modeOverrides = pgTable('mode_overrides', {
  /** A mode or variant id. */
  id: text('id').primaryKey(),
  /** 'published' (default), 'hidden' or 'featured'. */
  visibility: text('visibility').notNull(),
  note: text('note'),
  updatedAt: now('updated_at'),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
});

export const errorReports = pgTable(
  'error_reports',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    source: text('source').notNull(),
    message: text('message').notNull(),
    stack: text('stack'),
    context: jsonb('context'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: now('created_at'),
  },
  (t) => [index('errors_created_idx').on(t.createdAt)],
);

export const outboxEmails = pgTable('outbox_emails', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  toAddress: text('to_address').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  provider: text('provider').notNull(),
  sentAt: ts('sent_at'),
  createdAt: now('created_at'),
});

/* ------------------------------ creator studio ------------------------------ */

/**
 * Things designers are making in the Creator Studio. A draft is private to
 * the studio until published, when it becomes an ordinary item (and maybe a
 * shop listing) and `itemId` points at it.
 */
export const studioDrafts = pgTable(
  'studio_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    rarity: text('rarity').notNull(),
    art: jsonb('art').notNull(),
    status: text('status').notNull().default('draft'),
    itemId: text('item_id').references(() => items.id, { onDelete: 'set null' }),
    createdAt: now('created_at'),
    updatedAt: now('updated_at'),
  },
  (t) => [index('studio_drafts_status_idx').on(t.status, t.updatedAt), check('studio_drafts_status_valid', sql`${t.status} in ('draft','published')`)],
);
