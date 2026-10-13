import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ADMIN, startTestApp, studentDetails, type HttpClient, type TestApp } from './helpers.ts';

describe('access control', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await startTestApp();
  });

  afterEach(async () => {
    await t.close();
  });

  it('keeps the admin API behind a staff sign-in', async () => {
    const client = t.client();
    assert.equal((await client.get('/admin/activities?month=2026-09')).status, 401);

    const wrong = await client.post('/auth/admin/login', { email: ADMIN.email, password: 'not-the-password' });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error.code, 'INVALID_CREDENTIALS');

    await client.loginAdmin();
    assert.equal((await client.get('/admin/activities?month=2026-09')).status, 200);

    await client.post('/auth/admin/logout');
    assert.equal((await client.get('/admin/activities?month=2026-09')).status, 401);
  });

  it('rejects state-changing requests that are not JSON (CSRF protection)', async () => {
    const activity = t.activity();
    const res = await t.client().request('POST', `/activities/${activity.id}/reservations`, 'fullName=x', 'application/x-www-form-urlencoded');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
  });

  async function verifiedStudent(n: number): Promise<HttpClient> {
    const client = t.client();
    const requested = await client.post('/auth/student/request-code', { email: `student${n}@badyauni.edu.eg` });
    assert.equal(requested.status, 200);
    assert.match(requested.body.devCode, /^\d{6}$/);
    const verified = await client.post('/auth/student/verify', { email: `student${n}@badyauni.edu.eg`, code: requested.body.devCode });
    assert.equal(verified.status, 200);
    return client;
  }

  it('signs students in with a one-time email code', async () => {
    const activity = t.activity();
    await t.client().post(`/activities/${activity.id}/reservations`, studentDetails(1));
    const client = t.client();

    assert.equal((await client.get('/me/reservations')).status, 401);
    const requested = await client.post('/auth/student/request-code', { email: 'student1@badyauni.edu.eg' });
    assert.equal(t.mailer.sent.at(-1)?.subject, `Your sign-in code: ${requested.body.devCode}`);

    const wrongCode = requested.body.devCode === '000000' ? '111111' : '000000';
    assert.equal((await client.post('/auth/student/verify', { email: 'student1@badyauni.edu.eg', code: wrongCode })).body.error.code, 'CODE_INVALID');
    assert.equal((await client.post('/auth/student/verify', { email: 'student1@badyauni.edu.eg', code: requested.body.devCode })).status, 200);

    const mine = await client.get('/me/reservations');
    assert.equal(mine.status, 200);
    assert.equal(mine.body.student.studentId, '20250001');
    assert.equal(mine.body.reservations.length, 1);
  });

  it('does not reveal whether an email has reservations', async () => {
    const res = await t.client().post('/auth/student/request-code', { email: 'nobody@badyauni.edu.eg' });
    assert.equal(res.status, 200);
    assert.equal(res.body.devCode, undefined);
    assert.equal(t.mailer.sent.length, 0);
  });

  it('lets students see and cancel only their own reservations', async () => {
    const activity = t.activity();
    const reservations = [];
    for (const n of [1, 2]) reservations.push((await t.client().post(`/activities/${activity.id}/reservations`, studentDetails(n))).body);

    const studentOne = await verifiedStudent(1);
    const mine = await studentOne.get('/me/reservations');
    assert.deepEqual(
      mine.body.reservations.map((r: { code: string }) => r.code),
      [reservations[0].reservation.code],
    );

    // Someone else's reservation looks like it doesn't exist.
    const foreign = await studentOne.post(`/me/reservations/${reservations[1].reservation.id}/cancel`);
    assert.equal(foreign.status, 404);

    assert.equal((await studentOne.post(`/me/reservations/${reservations[0].reservation.id}/cancel`)).status, 204);
    assert.equal((await t.client().get(`/activities/${activity.id}`)).body.registeredCount, 1);

    // A student session never unlocks the admin API.
    assert.equal((await studentOne.get('/admin/activities?month=2026-09')).status, 401);
  });

  it('stops students from cancelling once the activity has started', async () => {
    const activity = t.activity();
    const created = await t.client().post(`/activities/${activity.id}/reservations`, studentDetails(1));
    const student = await verifiedStudent(1);

    t.clock.set('2026-09-30T10:05');
    const res = await student.post(`/me/reservations/${created.body.reservation.id}/cancel`);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CANCELLATION_CLOSED');
  });
});
