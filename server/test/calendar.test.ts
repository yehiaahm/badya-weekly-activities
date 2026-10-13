import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeRegistrationDeadline, isWorkingDay } from '../../shared/calendar.ts';
import { weekdayDatesInMonth, zonedToInstant } from '../../shared/dates.ts';
import { computeEffectiveStatus, type StatusInput } from '../../shared/status.ts';
import { scheduleIssues } from '../../shared/validation.ts';

describe('Badya working-day calendar', () => {
  it('treats Sunday–Thursday as working days and Friday/Saturday as non-working', () => {
    // 2026-09-27 is a Sunday.
    assert.deepEqual(
      ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'].map(isWorkingDay),
      [true, true, true, true, true, false, false],
    );
  });

  it('closes registration 24 hours before the start on a weekday-to-weekday basis', () => {
    assert.equal(computeRegistrationDeadline('2026-09-28', '10:00'), '2026-09-27T10:00'); // Mon → Sun
    assert.equal(computeRegistrationDeadline('2026-10-01', '13:00'), '2026-09-30T13:00'); // Thu → Wed
  });

  it('skips Friday and Saturday when counting back from a Sunday activity', () => {
    // Sunday 10:00 → Thursday 10:00, not Saturday 10:00.
    assert.equal(computeRegistrationDeadline('2026-10-04', '10:00'), '2026-10-01T10:00');
    assert.equal(computeRegistrationDeadline('2026-10-04', '09:00'), '2026-10-01T09:00');
  });

  it('supports other lead times and a holiday-aware predicate', () => {
    assert.equal(computeRegistrationDeadline('2026-10-04', '09:00', 48), '2026-09-30T09:00');
    assert.equal(computeRegistrationDeadline('2026-09-29', '11:30', 0), '2026-09-29T11:30');
    const holiday = (date: string) => isWorkingDay(date) && date !== '2026-10-01';
    assert.equal(computeRegistrationDeadline('2026-10-04', '10:00', 24, holiday), '2026-09-30T10:00');
  });

  it('lists weekday occurrences used when copying a month', () => {
    assert.deepEqual(weekdayDatesInMonth('2026-11', 0), ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
    assert.equal(weekdayDatesInMonth('2026-12', 0).length, 4);
  });

  it('converts Cairo wall-clock time to instants across daylight saving time', () => {
    assert.equal(zonedToInstant('2026-07-01T10:00', 'Africa/Cairo').toISOString(), '2026-07-01T07:00:00.000Z'); // UTC+3
    assert.equal(zonedToInstant('2026-12-01T10:00', 'Africa/Cairo').toISOString(), '2026-12-01T08:00:00.000Z'); // UTC+2
  });
});

describe('scheduling rules', () => {
  it('rejects non-working days and times outside 9:00 AM – 2:00 PM', () => {
    assert.deepEqual(scheduleIssues({ date: '2026-10-02', startTime: '10:00', endTime: '11:00' }).map((i) => i.path), ['date']);
    assert.deepEqual(scheduleIssues({ date: '2026-10-01', startTime: '08:30', endTime: '14:30' }).map((i) => i.path), [
      'startTime',
      'endTime',
    ]);
    assert.deepEqual(scheduleIssues({ date: '2026-10-01', startTime: '11:00', endTime: '11:00' }).map((i) => i.path), ['endTime']);
    assert.deepEqual(scheduleIssues({ date: '2026-10-01', startTime: '09:00', endTime: '14:00' }), []);
  });
});

describe('effective activity status', () => {
  const base: StatusInput = {
    status: 'published',
    date: '2026-10-04',
    endTime: '11:00',
    registrationDeadline: '2026-10-01T10:00',
    capacity: 10,
    registeredCount: 3,
  };

  it('is open while seats remain and the deadline has not passed', () => {
    assert.equal(computeEffectiveStatus(base, '2026-09-30T12:00'), 'published');
  });

  it('becomes Full when capacity is reached', () => {
    assert.equal(computeEffectiveStatus({ ...base, registeredCount: 10 }, '2026-09-30T12:00'), 'full');
  });

  it('becomes Registration Closed at the deadline, even when full', () => {
    assert.equal(computeEffectiveStatus(base, '2026-10-01T10:00'), 'registration_closed');
    assert.equal(computeEffectiveStatus({ ...base, registeredCount: 10 }, '2026-10-02T08:00'), 'registration_closed');
  });

  it('becomes Completed once the activity ends', () => {
    assert.equal(computeEffectiveStatus(base, '2026-10-04T11:00'), 'completed');
  });

  it('keeps Draft and Cancelled regardless of time', () => {
    assert.equal(computeEffectiveStatus({ ...base, status: 'draft' }, '2026-12-01T00:00'), 'draft');
    assert.equal(computeEffectiveStatus({ ...base, status: 'cancelled' }, '2026-12-01T00:00'), 'cancelled');
  });
});
