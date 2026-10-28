import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registered, type TestContext } from './helpers.ts';

/*
 * School events: a teacher names their school and sets events for their
 * class; students in the class see the ones that are on, nobody else does.
 */

let t: TestContext;
type Account = Awaited<ReturnType<typeof registered>>;
let teacher: Account;
let student: Account;
let outsider: Account;
let classId: string;

const hour = 3_600_000;
const event = (over: Record<string, unknown> = {}) => ({
  title: 'Athletics Carnival',
  message: 'Wear your house colours!',
  decor: 'bunting',
  hue: 140,
  startsAt: new Date(Date.now() - hour).toISOString(),
  endsAt: new Date(Date.now() + 24 * hour).toISOString(),
  ...over,
});

beforeAll(async () => {
  t = await createTestApp();
  teacher = await registered(t.app, { accountType: 'teacher' });
  student = await registered(t.app);
  outsider = await registered(t.app);
  const made = await teacher.client.post('/api/classes', { name: 'Year 6 Blue' });
  classId = made.body.class.id;
  expect((await student.client.post('/api/classes/join', { code: made.body.class.joinCode })).status).toBe(200);
});
afterAll(async () => {
  await t?.close();
});

describe('school events', () => {
  it('lets the teacher name the school, as plain text', async () => {
    expect((await student.client.patch(`/api/classes/${classId}`, { schoolName: 'Not mine' })).status).toBe(403);
    expect((await teacher.client.patch(`/api/classes/${classId}`, { schoolName: 'The Hills Grammar School' })).status).toBe(200);
    expect((await teacher.client.patch(`/api/classes/${classId}`, { schoolName: 'x'.repeat(61) })).status).toBe(400);
    const detail = await student.client.get(`/api/classes/${classId}`);
    expect(detail.body.class.schoolName).toBe('The Hills Grammar School');
  });

  it('shows an event that is on to the class, and to nobody else', async () => {
    expect((await student.client.post(`/api/classes/${classId}/events`, event())).status).toBe(403);
    const made = await teacher.client.post(`/api/classes/${classId}/events`, event());
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const later = await teacher.client.post(`/api/classes/${classId}/events`, event({ title: 'Book Week Parade', decor: 'books', startsAt: new Date(Date.now() + 48 * hour).toISOString(), endsAt: new Date(Date.now() + 72 * hour).toISOString() }));
    expect(later.status).toBe(200);

    const mine = (await student.client.get('/api/me/events')).body.events as { title: string; schoolName: string; className: string; decor: string }[];
    expect(mine).toEqual([expect.objectContaining({ title: 'Athletics Carnival', schoolName: 'The Hills Grammar School', className: 'Year 6 Blue', decor: 'bunting' })]);
    expect((await teacher.client.get('/api/me/events')).body.events).toHaveLength(1);
    expect((await outsider.client.get('/api/me/events')).body.events).toEqual([]);

    const detail = await student.client.get(`/api/classes/${classId}`);
    expect(detail.body.events.map((e: { title: string }) => e.title)).toEqual(['Athletics Carnival', 'Book Week Parade']);
  });

  it('refuses events that end before they start, run over a month, have ended, or use an unknown decoration', async () => {
    const now = Date.now();
    for (const bad of [
      event({ endsAt: new Date(now - 2 * hour).toISOString() }),
      event({ endsAt: new Date(now + 40 * 24 * hour).toISOString() }),
      event({ startsAt: new Date(now - 3 * hour).toISOString(), endsAt: new Date(now - 2 * hour).toISOString() }),
      event({ decor: 'crest' }),
      event({ title: 'ab' }),
    ]) {
      expect((await teacher.client.post(`/api/classes/${classId}/events`, bad)).status).toBe(400);
    }
  });

  it('lets only the teacher remove an event', async () => {
    const made = (await teacher.client.post(`/api/classes/${classId}/events`, event({ title: 'House Day' }))).body.event;
    expect((await student.client.delete(`/api/classes/${classId}/events/${made.id}`)).status).toBe(403);
    expect((await teacher.client.delete(`/api/classes/${classId}/events/${made.id}`)).status).toBe(200);
    expect((await teacher.client.delete(`/api/classes/${classId}/events/${made.id}`)).status).toBe(404);
  });
});
