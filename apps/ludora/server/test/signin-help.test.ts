import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { Client, createTestApp, registered, type TestContext } from './helpers.ts';
import { auditLog, classes, users } from '../src/db/schema.ts';
import { cliChangeRole } from '../src/cli/admin.ts';

/*
 * Sign-in help (D38): the teacher of a class makes a new recovery code for a
 * student who cannot sign in. The student uses it like their own code; the
 * old code stops working; the student is told; staff can see it in the audit log.
 */

let t: TestContext;
type Account = Awaited<ReturnType<typeof registered>>;
let teacher: Account;
let classId: string;
let joinCode: string;

const join = async (a: Account) => expect((await a.client.post('/api/classes/join', { code: joinCode })).status).toBe(200);
const help = (a: Account, userId: string, cls = classId) => a.client.post(`/api/classes/${cls}/members/${userId}/recovery-code`);

beforeAll(async () => {
  t = await createTestApp();
  teacher = await registered(t.app, { accountType: 'teacher' });
  const created = await teacher.client.post('/api/classes', { name: 'Year 5 Science' });
  expect(created.status).toBe(200);
  classId = created.body.class.id;
  joinCode = created.body.class.joinCode;
});
afterAll(async () => {
  await t?.close();
});

describe('sign-in help from a teacher', () => {
  it('gives the student a new recovery code that replaces the old one', async () => {
    const student = await registered(t.app, { accountType: 'student' });
    await join(student);
    // Locked out after too many wrong passwords.
    await t.db.update(users).set({ failedLogins: 9, lockedUntil: new Date(Date.now() + 3_600_000) }).where(eq(users.id, student.userId));

    const r = await help(teacher, student.userId);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ username: student.username });
    expect(r.body.recoveryCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(r.res.headers['cache-control']).toBe('no-store');
    const [row] = await t.db.select({ failedLogins: users.failedLogins, lockedUntil: users.lockedUntil }).from(users).where(eq(users.id, student.userId));
    expect(row).toEqual({ failedLogins: 0, lockedUntil: null });

    // The old code no longer works; the new one does, once.
    const browser = new Client(t.app);
    expect((await browser.post('/api/auth/recover', { username: student.username, recoveryCode: student.recoveryCode, newPassword: 'a brand new passphrase' })).status).toBe(401);
    const recovered = await browser.post('/api/auth/recover', { username: student.username, recoveryCode: r.body.recoveryCode, newPassword: 'a brand new passphrase' });
    expect(recovered.status).toBe(200);
    expect(recovered.body.recoveryCode).not.toBe(r.body.recoveryCode);
    expect((await new Client(t.app).post('/api/auth/recover', { username: student.username, recoveryCode: r.body.recoveryCode, newPassword: 'another passphrase here' })).status).toBe(401);
    expect((await new Client(t.app).post('/api/auth/login', { username: student.username, password: 'a brand new passphrase' })).status).toBe(200);

    // The student is told who made the code, and can dismiss the notice.
    const notices = (await browser.get('/api/me/notices')).body.notices;
    expect(notices).toEqual([expect.objectContaining({ action: 'teacher_recovery_code', reason: expect.stringContaining('Year 5 Science') })]);
    expect((await browser.post(`/api/me/notices/${notices[0].id}/ack`)).status).toBe(200);
    expect((await browser.get('/api/me/notices')).body.notices).toEqual([]);

    // Staff can see it in the audit log, without the code.
    const [entry] = await t.db.select().from(auditLog).where(and(eq(auditLog.action, 'class.recovery_code'), eq(auditLog.targetId, student.userId)));
    expect(entry).toMatchObject({ actorId: teacher.userId, targetType: 'user', targetName: student.username });
    expect(JSON.stringify(entry)).not.toContain(r.body.recoveryCode);
  });

  it('is only for the teacher of the class, and only for students in it', async () => {
    const student = await registered(t.app, { accountType: 'student' });
    const classmate = await registered(t.app, { accountType: 'student' });
    const outsider = await registered(t.app, { accountType: 'student' });
    const otherTeacher = await registered(t.app, { accountType: 'teacher' });
    await join(student);
    await join(classmate);
    expect((await help(classmate, student.userId)).status).toBe(403);
    // Someone outside the class is not even told it exists.
    expect((await help(otherTeacher, student.userId)).status).toBe(404);
    expect((await help(teacher, outsider.userId)).status).toBe(404);
    const anonymous = new Client(t.app);
    expect((await help({ ...student, client: anonymous }, student.userId)).status).toBe(401);
    // Nothing changed for the student.
    expect((await new Client(t.app).post('/api/auth/recover', { username: student.username, recoveryCode: student.recoveryCode, newPassword: 'still my own code' })).status).toBe(200);
  });

  it('leaves teacher and staff accounts to Ludora support, and archived classes alone', async () => {
    const colleague = await registered(t.app, { accountType: 'teacher' });
    const moderator = await registered(t.app, { accountType: 'student' });
    await join(colleague);
    await join(moderator);
    expect((await cliChangeRole(t.db, 'test', 'grant', moderator.username, 'moderator', 'test setup')).ok).toBe(true);
    for (const a of [colleague, moderator]) {
      const r = await help(teacher, a.userId);
      expect(r.status).toBe(403);
      expect(r.body.error.message).toMatch(/Ludora support/);
    }
    const student = await registered(t.app, { accountType: 'student' });
    await join(student);
    await t.db.update(classes).set({ archivedAt: new Date() }).where(eq(classes.id, classId));
    try {
      expect((await help(teacher, student.userId)).status).toBe(409);
    } finally {
      await t.db.update(classes).set({ archivedAt: null }).where(eq(classes.id, classId));
    }
  });
});
