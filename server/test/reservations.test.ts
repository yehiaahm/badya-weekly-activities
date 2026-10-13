import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { startTestApp, studentDetails, type TestApp } from './helpers.ts';

// The test clock starts on Monday 2026-09-28 at 09:00 (Cairo).
describe('student reservations (server-side rules)', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await startTestApp();
  });

  afterEach(async () => {
    await t.close();
  });

  it('reserves a spot and returns the confirmation details', async () => {
    const activity = t.activity();
    const res = await t.client().post(`/activities/${activity.id}/reservations`, studentDetails(1));

    assert.equal(res.status, 201);
    assert.match(res.body.reservation.code, /^BDY-[2-9A-Z]{6}$/);
    assert.equal(res.body.reservation.status, 'confirmed');
    assert.equal(res.body.student.name, 'Student Number 1');
    assert.equal(res.body.activity.registeredCount, 1);
    assert.equal(res.body.activity.availableSeats, 9);
    assert.equal(t.mailer.sent.at(-1)?.to, 'student1@badyauni.edu.eg');
  });

  it('does not allow the same student to reserve the same activity twice', async () => {
    const activity = t.activity();
    const client = t.client();
    assert.equal((await client.post(`/activities/${activity.id}/reservations`, studentDetails(1))).status, 201);

    const again = await client.post(`/activities/${activity.id}/reservations`, studentDetails(1, { fullName: 'Another Name Typed' }));
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'ALREADY_REGISTERED');
    assert.equal(again.body.error.message, 'You are already registered for this activity.');
  });

  it('never exceeds capacity and reports the activity as Fully Booked', async () => {
    const activity = t.activity({ capacity: 2 });
    const client = t.client();
    for (const n of [1, 2]) assert.equal((await client.post(`/activities/${activity.id}/reservations`, studentDetails(n))).status, 201);

    const third = await client.post(`/activities/${activity.id}/reservations`, studentDetails(3));
    assert.equal(third.status, 409);
    assert.equal(third.body.error.code, 'FULLY_BOOKED');

    const listed = await client.get('/activities?month=2026-09');
    const card = listed.body.activities.find((a: { id: number }) => a.id === activity.id);
    assert.equal(card.status, 'full');
    assert.equal(card.canReserve, false);
    assert.equal(card.availableSeats, 0);
  });

  it('closes registration 24 working hours before the start, skipping Friday and Saturday', async () => {
    // Sunday 2026-10-04 10:00 → deadline Thursday 2026-10-01 10:00.
    const activity = t.activity({ date: '2026-10-04' });
    assert.equal(activity.registrationDeadline, '2026-10-01T10:00');
    const client = t.client();

    t.clock.set('2026-10-01T09:59');
    assert.equal((await client.post(`/activities/${activity.id}/reservations`, studentDetails(1))).status, 201);

    t.clock.set('2026-10-01T10:00');
    const late = await client.post(`/activities/${activity.id}/reservations`, studentDetails(2));
    assert.equal(late.status, 409);
    assert.equal(late.body.error.code, 'REGISTRATION_CLOSED');

    // Friday is still more than 24 calendar hours before Sunday, but the working-day rule keeps it closed.
    t.clock.set('2026-10-02T09:00');
    assert.equal((await client.post(`/activities/${activity.id}/reservations`, studentDetails(3))).body.error.code, 'REGISTRATION_CLOSED');
    assert.equal((await client.get(`/activities/${activity.id}`)).body.status, 'registration_closed');
  });

  it('refuses cancelled and completed activities, and hides drafts', async () => {
    const client = t.client();
    const cancelled = t.activity();
    t.services.activities.setStatus({ ids: [cancelled.id], status: 'cancelled' });
    assert.equal((await client.post(`/activities/${cancelled.id}/reservations`, studentDetails(1))).body.error.code, 'ACTIVITY_CANCELLED');

    const completed = t.activity({ date: '2026-10-01' });
    t.services.activities.setStatus({ ids: [completed.id], status: 'completed' });
    assert.equal((await client.post(`/activities/${completed.id}/reservations`, studentDetails(1))).body.error.code, 'ACTIVITY_COMPLETED');

    const draft = t.activity({ status: 'draft' });
    assert.equal((await client.post(`/activities/${draft.id}/reservations`, studentDetails(1))).status, 404);
    assert.equal((await client.get(`/activities/${draft.id}`)).status, 404);
    const listed = await client.get('/activities?month=2026-09');
    assert.ok(!listed.body.activities.some((a: { id: number }) => a.id === draft.id));
  });

  it('keeps Student ID and university email paired', async () => {
    const first = t.activity();
    const second = t.activity({ name: 'Padel', startTime: '12:00', endTime: '13:00' });
    const client = t.client();
    assert.equal((await client.post(`/activities/${first.id}/reservations`, studentDetails(1))).status, 201);

    const wrongEmail = await client.post(`/activities/${second.id}/reservations`, studentDetails(1, { email: 'someone.else@badyauni.edu.eg' }));
    assert.equal(wrongEmail.status, 409);
    assert.equal(wrongEmail.body.error.code, 'IDENTITY_MISMATCH');

    const wrongId = await client.post(`/activities/${second.id}/reservations`, studentDetails(2, { email: 'student1@badyauni.edu.eg' }));
    assert.equal(wrongId.body.error.code, 'IDENTITY_MISMATCH');
  });

  it('validates every field, including the university email domain', async () => {
    const activity = t.activity();
    const res = await t.client().post(`/activities/${activity.id}/reservations`, {
      fullName: 'A',
      studentId: '!!',
      major: '',
      academicLevel: 'Level 9',
      phone: '123',
      email: 'someone@gmail.com',
    });
    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.body.error.fields).sort(), ['academicLevel', 'email', 'fullName', 'major', 'phone', 'studentId']);
    assert.match(res.body.error.fields.email, /badyauni\.edu\.eg/);
  });

  it('lets a student reserve again after cancelling', async () => {
    const activity = t.activity();
    const created = await t.client().post(`/activities/${activity.id}/reservations`, studentDetails(1));
    t.services.reservations.cancelByAdmin(created.body.reservation.id);

    const again = await t.client().post(`/activities/${activity.id}/reservations`, studentDetails(1));
    assert.equal(again.status, 201);
    assert.notEqual(again.body.reservation.code, created.body.reservation.code);
  });
});

describe('staff manual registration', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await startTestApp();
  });

  afterEach(async () => {
    await t.close();
  });

  it('may override the deadline explicitly, but never the capacity', async () => {
    const admin = t.client();
    await admin.loginAdmin();
    const activity = t.activity({ date: '2026-09-29', capacity: 1 }); // deadline Mon 2026-09-28 10:00
    t.clock.set('2026-09-28T12:00');

    const blocked = await admin.post(`/admin/activities/${activity.id}/reservations`, studentDetails(1));
    assert.equal(blocked.body.error.code, 'REGISTRATION_CLOSED');

    const allowed = await admin.post(`/admin/activities/${activity.id}/reservations`, { ...studentDetails(1), overrideDeadline: true });
    assert.equal(allowed.status, 201);

    const overCapacity = await admin.post(`/admin/activities/${activity.id}/reservations`, { ...studentDetails(2), overrideDeadline: true });
    assert.equal(overCapacity.body.error.code, 'FULLY_BOOKED');
  });
});
