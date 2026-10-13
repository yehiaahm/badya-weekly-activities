import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { startTestApp, studentDetails, type HttpClient, type TestApp } from './helpers.ts';

describe('activity management', () => {
  let t: TestApp;
  let admin: HttpClient;

  beforeEach(async () => {
    t = await startTestApp();
    admin = t.client();
    await admin.loginAdmin();
  });

  afterEach(async () => {
    await t.close();
  });

  const body = {
    name: 'Basketball',
    category: 'Basketball',
    description: 'Half-court games',
    date: '2026-10-05',
    startTime: '11:00',
    endTime: '12:30',
    location: 'Indoor Sports Hall',
    coach: 'Coach Omar',
    capacity: 16,
  };

  it('creates activities only on working days and within working hours', async () => {
    const friday = await admin.post('/admin/activities', { ...body, date: '2026-10-02' });
    assert.equal(friday.status, 400);
    assert.ok(friday.body.error.fields.date);

    const late = await admin.post('/admin/activities', { ...body, endTime: '14:30' });
    assert.equal(late.status, 400);
    assert.ok(late.body.error.fields.endTime);

    const created = await admin.post('/admin/activities', body);
    assert.equal(created.status, 201);
    assert.equal(created.body.status, 'draft');
    assert.equal(created.body.registrationDeadline, '2026-10-04T11:00'); // Monday → Sunday
  });

  it('recalculates the deadline when an activity is moved', async () => {
    const created = await admin.post('/admin/activities', body);
    const moved = await admin.patch(`/admin/activities/${created.body.id}`, { date: '2026-10-04', startTime: '09:30', endTime: '10:30' });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.registrationDeadline, '2026-10-01T09:30'); // Sunday → Thursday
  });

  it('protects activities that already have registered students', async () => {
    const activity = t.activity({ capacity: 5 });
    for (const n of [1, 2, 3]) await t.client().post(`/activities/${activity.id}/reservations`, studentDetails(n));

    const shrink = await admin.patch(`/admin/activities/${activity.id}`, { capacity: 2 });
    assert.equal(shrink.status, 400);
    assert.ok(shrink.body.error.fields.capacity);

    const unpublish = await admin.post('/admin/activities/status', { ids: [activity.id], status: 'draft' });
    assert.equal(unpublish.body.updated, 0);
    assert.equal(unpublish.body.failed.length, 1);

    const removed = await admin.delete(`/admin/activities/${activity.id}`);
    assert.equal(removed.status, 409);
    assert.equal(removed.body.error.code, 'ACTIVITY_HAS_RESERVATIONS');

    const cancelled = await admin.post('/admin/activities/status', { ids: [activity.id], status: 'cancelled' });
    assert.equal(cancelled.body.updated, 1);
  });

  it('duplicates an activity onto other dates as drafts', async () => {
    const activity = t.activity();
    const res = await admin.post(`/admin/activities/${activity.id}/duplicate`, { dates: ['2026-10-07', '2026-10-09', '2026-09-30'] });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.created.map((a: { date: string; status: string }) => [a.date, a.status]), [['2026-10-07', 'draft']]);
    assert.deepEqual(
      res.body.skipped.map((s: { date: string }) => s.date),
      ['2026-09-30', '2026-10-09'], // already scheduled, Friday
    );
  });

  it('copies the previous month by weekday occurrence without reservations', async () => {
    // November 2026 has five Sundays; December has four Sundays and five Tuesdays.
    const sunday1 = t.activity({ date: '2026-11-01' });
    t.activity({ date: '2026-11-29', name: 'Final' });
    t.activity({ date: '2026-11-24', name: 'Padel' }); // 4th (last) Tuesday
    const cancelled = t.activity({ date: '2026-11-02', name: 'Yoga' });
    t.services.activities.setStatus({ ids: [cancelled.id], status: 'cancelled' });
    await t.client().post(`/activities/${sunday1.id}/reservations`, studentDetails(1));

    const first = await admin.post('/admin/months/2026-12/copy-previous');
    assert.equal(first.status, 201);
    assert.deepEqual(
      { created: first.body.created, unmapped: first.body.unmapped, skippedExisting: first.body.skippedExisting },
      { created: 3, unmapped: 1, skippedExisting: 0 },
    );

    const december = await admin.get('/admin/activities?month=2026-12');
    const summary = december.body.activities.map((a: { name: string; date: string; status: string; registeredCount: number }) => [
      a.name,
      a.date,
      a.status,
      a.registeredCount,
    ]);
    assert.deepEqual(summary, [
      ['Padel', '2026-12-22', 'draft', 0], // 4th Tuesday → 4th Tuesday
      ['Padel', '2026-12-29', 'draft', 0], // extra 5th Tuesday repeats the last week
      ['Tennis', '2026-12-06', 'draft', 0], // 1st Sunday → 1st Sunday, reservations not copied
    ].sort((a, b) => String(a[1]).localeCompare(String(b[1]))));

    const second = await admin.post('/admin/months/2026-12/copy-previous');
    assert.equal(second.body.created, 0);
    assert.equal(second.body.skippedExisting, 3);
  });

  it('publishes every draft in a month at once', async () => {
    t.activity({ status: 'draft' });
    t.activity({ status: 'draft', date: '2026-09-29' });
    const res = await admin.post('/admin/months/2026-09/publish');
    assert.equal(res.body.updated, 2);
    assert.equal((await t.client().get('/activities?month=2026-09')).body.activities.length, 2);
  });
});

describe('attendance and reports', () => {
  let t: TestApp;
  let admin: HttpClient;

  beforeEach(async () => {
    t = await startTestApp();
    admin = t.client();
    await admin.loginAdmin();
  });

  afterEach(async () => {
    await t.close();
  });

  it('records attendance from the activity day and feeds the reports', async () => {
    const activity = t.activity({ capacity: 4 });
    const ids: number[] = [];
    for (const n of [1, 2, 3, 4]) {
      await t.client().post(`/activities/${activity.id}/reservations`, studentDetails(n));
    }
    const sheet = await admin.get(`/admin/activities/${activity.id}/attendance`);
    assert.equal(sheet.body.canRecord, false); // still two days away
    for (const row of sheet.body.rows) ids.push(row.studentId);

    const early = await admin.put(`/admin/activities/${activity.id}/attendance`, { entries: [{ studentId: ids[0], status: 'present' }] });
    assert.equal(early.status, 409);

    t.clock.set('2026-09-30T11:30');
    const marked = await admin.put(`/admin/activities/${activity.id}/attendance`, {
      entries: [
        { studentId: ids[0], status: 'present' },
        { studentId: ids[1], status: 'present' },
        { studentId: ids[2], status: 'absent' },
      ],
    });
    assert.equal(marked.status, 200);
    assert.deepEqual(
      marked.body.rows.map((r: { attendance: string | null }) => r.attendance).sort(),
      ['absent', 'present', 'present', null].sort(),
    );

    const report = await admin.get('/admin/reports?month=2026-09');
    assert.equal(report.status, 200);
    assert.deepEqual(
      {
        activities: report.body.totals.activities,
        reservations: report.body.totals.reservations,
        availableSeats: report.body.totals.availableSeats,
        present: report.body.totals.present,
        absent: report.body.totals.absent,
        pending: report.body.totals.attendancePending,
      },
      { activities: 1, reservations: 4, availableSeats: 0, present: 2, absent: 1, pending: 1 },
    );
    assert.equal(report.body.fullCapacity.length, 1);
    assert.equal(report.body.mostReserved[0].id, activity.id);

    const csv = await admin.get(`/admin/activities/${activity.id}/reservations/export`);
    assert.equal(csv.status, 200);
    assert.match(String(csv.headers.get('content-type')), /text\/csv/);
    assert.match(csv.body, /Name,Student ID,Major,Level,Phone,Email,Status/);
  });

  it('only records attendance for students with a confirmed reservation', async () => {
    const activity = t.activity();
    const other = t.activity({ name: 'Padel', startTime: '12:00', endTime: '13:00' });
    const res = await t.client().post(`/activities/${other.id}/reservations`, studentDetails(9));
    const outsider = t.db.get<{ student_id: number }>('SELECT student_id FROM reservations WHERE id = ?', [res.body.reservation.id])!;

    t.clock.set('2026-09-30T12:00');
    const attempt = await admin.put(`/admin/activities/${activity.id}/attendance`, {
      entries: [{ studentId: outsider.student_id, status: 'present' }],
    });
    assert.equal(attempt.status, 400);
  });
});
