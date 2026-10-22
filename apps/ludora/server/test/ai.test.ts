import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { eq, sql } from 'drizzle-orm';
import { questionSchema, type AiDraftRequest } from '@ludora/shared';
import { Client, createTestApp, registered, type TestContext } from './helpers.ts';
import { aiDraftRequests, featureFlags } from '../src/db/schema.ts';
import { cliChangeRole } from '../src/cli/admin.ts';
import { clearFlagCache } from '../src/modules/flags/service.ts';
import { DraftError, anthropicDrafter, toDraftError, toQuestions, userMessage, type MessagesClient, type QuestionDrafter } from '../src/modules/ai/drafter.ts';
import { AI_DRAFTS_PER_ACCOUNT_DAILY } from '../src/modules/ai/routes.ts';

/*
 * AI question drafts. The model is never called here: the drafter runs against
 * a stand-in for the SDK client, and the routes against a stand-in drafter.
 */

const REQUEST: AiDraftRequest = { topic: 'The water cycle', level: '9-11', count: 5, types: ['mcq', 'truefalse', 'short', 'numeric'], language: 'en' };

const GOOD = [
  { type: 'mcq', prompt: 'What is it called when water vapour turns into liquid?', choices: [{ text: 'Evaporation', correct: false }, { text: 'Condensation', correct: true }, { text: 'Melting', correct: false }], explanation: 'Cooling vapour condenses into droplets.' },
  { type: 'truefalse', prompt: 'Clouds are made of tiny water droplets.', answer: true, explanation: '' },
  { type: 'short', prompt: 'What falls from clouds as rain, snow or hail?', accepted: ['Precipitation', 'precipitation ', 'PRECIPITATION', 'rainfall'], explanation: 'All of them are precipitation.' },
  { type: 'numeric', prompt: 'At what temperature in °C does water boil at sea level?', answer: 100, tolerance: 0, unit: '°C', explanation: 'Water boils at 100 °C at sea level.' },
];

describe('turning drafts into questions', () => {
  it('maps each kind of draft to a valid question', () => {
    const { questions, dropped } = toQuestions({ questions: GOOD }, REQUEST);
    expect(dropped).toBe(0);
    expect(questions).toHaveLength(4);
    for (const q of questions) expect(questionSchema.safeParse(q).success).toBe(true);
    expect(new Set(questions.map((q) => q.id)).size).toBe(4);
    const [mcq, tf, short, num] = questions;
    expect(mcq).toMatchObject({ type: 'mcq', choices: [{ id: 'a', text: 'Evaporation' }, { id: 'b', text: 'Condensation' }, { id: 'c', text: 'Melting' }], correct: 'b', explanation: 'Cooling vapour condenses into droplets.' });
    expect(tf).toEqual({ id: tf!.id, type: 'truefalse', prompt: 'Clouds are made of tiny water droplets.', correct: true });
    expect(short).toMatchObject({ type: 'short', accepted: ['Precipitation', 'rainfall'] });
    expect(num).toMatchObject({ type: 'numeric', answer: 100, unit: '°C' });
    expect(num).not.toHaveProperty('tolerance');
  });

  it('drops drafts that break a rule, and stops at the number asked for', () => {
    const bad = [
      { ...GOOD[0], choices: [{ text: 'A', correct: true }, { text: 'B', correct: true }] },
      { ...GOOD[0], choices: [{ text: 'Rain', correct: true }, { text: 'rain', correct: false }] },
      { ...GOOD[1], prompt: 'x'.repeat(501) },
      { ...GOOD[1], prompt: '   ' },
      { type: 'order', prompt: 'Put these in order', items: ['a', 'b'] },
      'not a question',
    ];
    expect(toQuestions({ questions: bad }, REQUEST)).toEqual({ questions: [], dropped: 6 });
    // Kinds the teacher did not ask for are dropped too.
    expect(toQuestions({ questions: GOOD }, { count: 5, types: ['truefalse'] }).questions.map((q) => q.type)).toEqual(['truefalse']);
    const many = toQuestions({ questions: [...GOOD, ...GOOD] }, { count: 5, types: REQUEST.types });
    expect(many).toMatchObject({ dropped: 0 });
    expect(many.questions).toHaveLength(5);
    expect(toQuestions({ nope: true }, REQUEST)).toEqual({ questions: [], dropped: 0 });
  });

  it('describes the request to the model in plain words', () => {
    const text = userMessage({ ...REQUEST, language: 'fr', notes: 'Year 5, after our river topic' });
    expect(text).toContain('Topic: The water cycle');
    expect(text).toContain('Players: Ages 9 to 11');
    expect(text).toContain('Number of questions: 5');
    expect(text).toContain('Write in: French');
    expect(text).toContain("Teacher's notes: Year 5, after our river topic");
  });
});

/** A stand-in for the SDK client that records the request and answers as told. */
function fakeClient(answer: () => Promise<unknown>) {
  const calls: Record<string, unknown>[] = [];
  const client = { beta: { messages: { create: async (params: Record<string, unknown>) => (calls.push(params), answer()) } } } as unknown as MessagesClient;
  return { client, calls };
}

const message = (text: string, stop_reason = 'end_turn') => ({ content: [{ type: 'text', text }], stop_reason, usage: { input_tokens: 812, output_tokens: 1240 } });
const failure = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

describe('the model call', () => {
  it('asks for JSON in the drafts shape, with refusal fallback on current models', async () => {
    const { client, calls } = fakeClient(async () => message(JSON.stringify({ questions: GOOD })));
    const drafter = anthropicDrafter({ apiKey: 'test', model: 'claude-opus-5-5' }, client);
    const result = await drafter.draft(REQUEST);
    expect(result).toMatchObject({ dropped: 0, usage: { inputTokens: 812, outputTokens: 1240 } });
    expect(result.questions).toHaveLength(4);
    const params = calls[0]!;
    expect(params).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 16_000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'medium', format: { type: 'json_schema' } } });
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('thinking');
    expect(JSON.stringify(params.messages)).toContain('The water cycle');
    // Models without the default fallback get a plain request.
    const plain = fakeClient(async () => message(JSON.stringify({ questions: GOOD })));
    await anthropicDrafter({ apiKey: 'test', model: 'claude-haiku-5-5' }, plain.client).draft(REQUEST);
    expect(plain.calls[0]).not.toHaveProperty('fallbacks');
    expect(plain.calls[0]).not.toHaveProperty('betas');
  });

  it('turns refusals, cut-off answers and unreadable answers into plain failures', async () => {
    const cases: [ReturnType<typeof message>, string][] = [
      [message('', 'refusal'), 'refused'],
      [message('{"questions": [{"type": "mcq", "pro', 'max_tokens'), 'incomplete'],
      [message('Here are your questions!'), 'invalid'],
      [message(JSON.stringify({ questions: [{ type: 'truefalse', prompt: '', answer: true, explanation: '' }] })), 'invalid'],
    ];
    for (const [answer, kind] of cases) {
      const { client } = fakeClient(async () => answer);
      const err = await failure(anthropicDrafter({ apiKey: 'test', model: 'claude-opus-5-5' }, client).draft(REQUEST));
      expect(err, kind).toBeInstanceOf(DraftError);
      expect(err).toMatchObject({ kind, usage: { inputTokens: 812, outputTokens: 1240 } });
    }
  });

  it('maps API errors to what the teacher can do about them', async () => {
    const headers = new Headers();
    const body = { type: 'error', error: { type: 'x', message: 'x' } };
    const kinds = [
      [new Anthropic.RateLimitError(429, body, 'slow down', headers), 'busy'],
      [new Anthropic.InternalServerError(529, body, 'overloaded', headers), 'busy'],
      [new Anthropic.AuthenticationError(401, body, 'invalid x-api-key', headers), 'unavailable'],
      [new Anthropic.NotFoundError(404, body, 'model not found', headers), 'unavailable'],
      [new Anthropic.APIConnectionTimeoutError(), 'timeout'],
      [new Anthropic.APIConnectionError({ message: 'socket hang up' }), 'unavailable'],
    ] as const;
    for (const [err, kind] of kinds) expect(toDraftError(err), kind).toMatchObject({ kind });
    const bug = new TypeError('a bug');
    expect(toDraftError(bug)).toBe(bug);
    const { client } = fakeClient(async () => Promise.reject(new Anthropic.RateLimitError(429, body, 'slow down', headers)));
    expect(await failure(anthropicDrafter({ apiKey: 'test', model: 'claude-opus-5-5' }, client).draft(REQUEST))).toMatchObject({ kind: 'busy' });
  });
});

/* --------------------------------- The routes -------------------------------- */

let t: TestContext;
type Account = Awaited<ReturnType<typeof registered>>;

/** A stand-in drafter: answers with the good drafts, or fails as told. */
function standIn(behave: (r: AiDraftRequest) => Promise<void> = async () => {}): QuestionDrafter & { requests: AiDraftRequest[] } {
  const requests: AiDraftRequest[] = [];
  return {
    model: 'stand-in',
    requests,
    async draft(r) {
      requests.push(r);
      await behave(r);
      return { questions: toQuestions({ questions: GOOD }, r).questions, dropped: 1, usage: { inputTokens: 10, outputTokens: 20 } };
    },
  };
}

const setFlag = async (enabled: boolean) => {
  await t.db.update(featureFlags).set({ enabled }).where(eq(featureFlags.key, 'ai.question_drafts'));
  clearFlagCache();
};
const teacher = () => registered(t.app, { accountType: 'teacher' });
const post = (a: Account, body: unknown = REQUEST) => a.client.post('/api/ai/drafts', body);
const rows = (userId: string) => t.db.select().from(aiDraftRequests).where(eq(aiDraftRequests.userId, userId));

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t?.close();
});

describe('drafting routes', () => {
  it('is off until the flag is on and a key is set, and only for teachers, creators and staff', async () => {
    await setFlag(false);
    t.deps.drafter = undefined;
    const guest = new Client(t.app);
    await guest.post('/api/auth/guest', {});
    expect((await guest.get('/api/ai/drafts/status')).status).toBe(403);
    expect((await guest.post('/api/ai/drafts', REQUEST)).status).toBe(403);

    const player = await registered(t.app);
    const sara = await teacher();
    expect((await player.client.get('/api/ai/drafts/status')).body).toMatchObject({ available: false, reason: 'not_allowed' });
    expect((await sara.client.get('/api/ai/drafts/status')).body).toMatchObject({ available: false, reason: 'not_enabled', limitToday: AI_DRAFTS_PER_ACCOUNT_DAILY });
    expect((await post(sara)).body.error.code).toBe('not_available');

    await setFlag(true);
    expect((await sara.client.get('/api/ai/drafts/status')).body).toMatchObject({ available: false, reason: 'not_configured' });
    expect((await post(sara)).status).toBe(503);

    t.deps.drafter = standIn();
    expect((await sara.client.get('/api/ai/drafts/status')).body).toEqual({ available: true, remainingToday: AI_DRAFTS_PER_ACCOUNT_DAILY, limitToday: AI_DRAFTS_PER_ACCOUNT_DAILY });
    // A player stays out even with everything on; a creator and a moderator are in.
    expect((await post(player)).status).toBe(403);
    const creator = await registered(t.app);
    const mod = await registered(t.app);
    expect((await cliChangeRole(t.db, 'test', 'grant', creator.username, 'creator', 'test setup')).ok).toBe(true);
    expect((await cliChangeRole(t.db, 'test', 'grant', mod.username, 'moderator', 'test setup')).ok).toBe(true);
    expect((await creator.client.get('/api/ai/drafts/status')).body.available).toBe(true);
    expect((await mod.client.get('/api/ai/drafts/status')).body.available).toBe(true);
  });

  it('returns checked drafts and records the request without the topic', async () => {
    await setFlag(true);
    const drafter = standIn();
    t.deps.drafter = drafter;
    const sara = await teacher();
    const r = await post(sara, { ...REQUEST, topic: '  Rivers and seas  ', types: ['mcq', 'mcq', 'truefalse'] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ dropped: 1, remainingToday: AI_DRAFTS_PER_ACCOUNT_DAILY - 1 });
    expect(r.body.questions.map((q: { type: string }) => q.type)).toEqual(['mcq', 'truefalse']);
    for (const q of r.body.questions) expect(questionSchema.safeParse(q).success).toBe(true);
    expect(drafter.requests[0]).toMatchObject({ topic: 'Rivers and seas', types: ['mcq', 'truefalse'] });
    const [row] = await rows(sara.userId);
    expect(row).toMatchObject({ model: 'stand-in', requested: 5, returned: 2, outcome: 'ok', inputTokens: 10, outputTokens: 20 });
    expect(JSON.stringify(row)).not.toContain('Rivers');
    expect((await sara.client.get('/api/ai/drafts/status')).body.remainingToday).toBe(AI_DRAFTS_PER_ACCOUNT_DAILY - 1);
  });

  it('checks the request', async () => {
    await setFlag(true);
    t.deps.drafter = standIn();
    const sara = await teacher();
    for (const body of [{ ...REQUEST, topic: 'ab' }, { ...REQUEST, count: 0 }, { ...REQUEST, count: 16 }, { ...REQUEST, types: [] }, { ...REQUEST, types: ['order'] }, { ...REQUEST, level: '3-5' }, { ...REQUEST, notes: 'x'.repeat(501) }]) {
      const r = await post(sara, body);
      expect(r.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(r.body.error.code).toBe('validation_failed');
    }
    expect(await rows(sara.userId)).toHaveLength(0);
  });

  it('explains failures in plain words and records them', async () => {
    await setFlag(true);
    const sara = await teacher();
    const fail = (kind: 'refused' | 'busy' | 'timeout' | 'unavailable') =>
      standIn(async () => {
        throw new DraftError(kind, 'detail for the log', { inputTokens: 5, outputTokens: 0 });
      });
    t.deps.drafter = fail('refused');
    const refused = await post(sara);
    expect(refused.status).toBe(422);
    expect(refused.body.error.message).toMatch(/would not draft/);
    t.deps.drafter = fail('busy');
    expect((await post(sara)).status).toBe(503);
    t.deps.drafter = fail('timeout');
    expect((await post(sara)).status).toBe(504);
    t.deps.drafter = fail('unavailable');
    const down = await post(sara);
    expect(down.status).toBe(503);
    expect(down.body.error.message).not.toContain('detail');
    const outcomes = (await rows(sara.userId)).map((r) => r.outcome).sort();
    expect(outcomes).toEqual(['failed', 'failed', 'failed', 'refused']);
  });

  it('keeps to the daily allowance, the site cap and one request at a time', async () => {
    await setFlag(true);
    t.deps.drafter = standIn();
    const sara = await teacher();
    // Yesterday's requests do not count; today's do.
    const old = sql`now() - interval '25 hours'`;
    await t.db.insert(aiDraftRequests).values(Array.from({ length: 5 }, () => ({ userId: sara.userId, model: 'm', requested: 5, outcome: 'ok', createdAt: old })));
    await t.db.insert(aiDraftRequests).values(Array.from({ length: AI_DRAFTS_PER_ACCOUNT_DAILY - 1 }, () => ({ userId: sara.userId, model: 'm', requested: 5, outcome: 'ok' })));
    expect((await post(sara)).status).toBe(200);
    const over = await post(sara);
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('rate_limited');
    expect((await sara.client.get('/api/ai/drafts/status')).body.remainingToday).toBe(0);

    const ben = await teacher();
    const counted = await t.db.execute(sql`select count(*)::int as "all" from ai_draft_requests where created_at > now() - interval '24 hours'`);
    const all = (counted.rows[0] as { all: number }).all;
    const cap = t.deps.config.AI_DRAFTS_DAILY_LIMIT;
    t.deps.config.AI_DRAFTS_DAILY_LIMIT = all;
    try {
      const capped = await post(ben);
      expect(capped.status).toBe(503);
      expect(capped.body.error.message).toMatch(/daily limit on this site/);
    } finally {
      t.deps.config.AI_DRAFTS_DAILY_LIMIT = cap;
    }

    // Two requests at once: the second is told to wait for the first.
    let release!: () => void;
    t.deps.drafter = standIn(() => new Promise<void>((r) => (release = r)));
    const first = post(ben);
    await expect.poll(async () => (await rows(ben.userId)).some((r) => r.outcome === 'pending')).toBe(true);
    const second = await post(ben);
    expect(second.status).toBe(409);
    release();
    expect((await first).status).toBe(200);
    // Once it has finished, the next request goes through.
    t.deps.drafter = standIn();
    expect((await post(ben)).status).toBe(200);
  });
});
