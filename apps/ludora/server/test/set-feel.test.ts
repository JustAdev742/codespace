import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { atLeast } from '../src/modules/rooms/routes.ts';

/*
 * The set's feel and play choices travel with it: saved with the set, sent to every screen in a
 * game played from it, and "only the hard ones" leaves out the rest. Strangers cannot host a
 * private set with any of these.
 */

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t?.close();
});

const QUESTIONS = [
  { id: 'q1', type: 'truefalse', prompt: 'Easy one', correct: true, difficulty: 'easy' },
  { id: 'q2', type: 'truefalse', prompt: 'Hard one', correct: true, difficulty: 'hard', hint: 'Think about it', sound: { kind: 'speech', text: 'bonjour', lang: 'fr-FR', caption: 'A French word is said' } },
  { id: 'q3', type: 'truefalse', prompt: 'Medium one', correct: false, difficulty: 'medium' },
  { id: 'q4', type: 'truefalse', prompt: 'Not marked', correct: false },
];
const DEFAULTS = { readingTime: 'auto', modes: ['classic'], shuffleAnswers: true, feel: { right: 'note-c5', wrong: 'tone-low', win: 'fx-fanfare', backdrop: 'aurora', accent: 200 } };

describe('the set’s feel in games', () => {
  it('saves the feel and play choices, and sends the feel to the room', async () => {
    const author = await registered(t.app);
    const made = await author.client.post('/api/sets', { title: 'Feel', description: '', subject: 'languages', visibility: 'private', defaults: DEFAULTS, questions: QUESTIONS });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const id = made.body.set.id as string;
    expect((await author.client.get(`/api/sets/${id}`)).body.set.defaults).toEqual(DEFAULTS);
    const room = await author.client.post('/api/rooms', { setId: id, modeId: 'classic' });
    expect(room.status, JSON.stringify(room.body)).toBe(200);
    const live = t.deps.rooms.get(room.body.code)!;
    expect(live.view(null).room.setFeel).toEqual(DEFAULTS.feel);
    // Another account cannot host the private set, feel or not.
    const stranger = await registered(t.app);
    expect((await stranger.client.post('/api/rooms', { setId: id, modeId: 'classic' })).status).toBe(403);
  });

  it('refuses a feel with an unknown sound or backdrop', async () => {
    const author = await registered(t.app);
    const bad = await author.client.post('/api/sets', { title: 'Bad', description: '', subject: 'general', visibility: 'private', defaults: { feel: { right: 'a-sample.mp3' } }, questions: QUESTIONS });
    expect(bad.status).toBe(400);
  });

  it('plays only the hard ones when the host asks, and says so when there are none', async () => {
    expect(atLeast(QUESTIONS as never, 'medium').map((q) => q.id)).toEqual(['q2', 'q3']);
    const author = await registered(t.app);
    const more = [2, 3].map((n) => ({ id: `h${n}`, type: 'truefalse', prompt: `Hard one ${n}`, correct: true, difficulty: 'hard' }));
    const made = await author.client.post('/api/sets', { title: 'Mixed', description: '', subject: 'general', visibility: 'private', questions: [...QUESTIONS, ...more] });
    const id = made.body.set.id as string;
    const room = await author.client.post('/api/rooms', { setId: id, modeId: 'classic', difficulty: 'hard' });
    expect(room.status, JSON.stringify(room.body)).toBe(200);
    const live = t.deps.rooms.get(room.body.code)!;
    expect(live.set.questions.map((q) => q.id)).toEqual(['q2', 'h2', 'h3']);
    // The room view has no feel for a set without one.
    expect(live.view(null).room.setFeel).toBeNull();
    const easyOnly = await author.client.post('/api/sets', { title: 'Easy', description: '', subject: 'general', visibility: 'private', questions: [QUESTIONS[0]] });
    const none = await author.client.post('/api/rooms', { setId: easyOnly.body.set.id, modeId: 'classic', difficulty: 'hard' });
    expect(none.status).toBe(409);
    expect(none.body.error.message).toMatch(/marked hard/);
  });

  it('tells any viewer how each mode fits the set, with counts and no answers', async () => {
    const author = await registered(t.app);
    const made = await author.client.post('/api/sets', { title: 'Fit', description: '', subject: 'general', visibility: 'unlisted', defaults: { modes: ['classic'] }, questions: QUESTIONS });
    const viewer = await registered(t.app);
    const res = await viewer.client.get(`/api/sets/${made.body.set.id}`);
    expect(res.status).toBe(200);
    expect(res.body.questions).toBeNull();
    expect(res.body.profile).toMatchObject({ count: 4, listening: 1, hints: 1, types: { truefalse: 4 }, play: { modes: ['classic'] } });
    const classic = res.body.fit.find((f: { id: string }) => f.id === 'classic');
    expect(classic).toMatchObject({ shown: 4, skipped: 0, playable: true });
    expect(res.body.fit.length).toBeGreaterThan(20);
    // Nothing in the fit or profile says which answer is right.
    expect(JSON.stringify({ p: res.body.profile, f: res.body.fit })).not.toMatch(/"correct"/);
  });
});
