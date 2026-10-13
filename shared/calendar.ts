import {
  addDays,
  dayOfWeek,
  MINUTES_PER_DAY,
  minutesToTime,
  timeToMinutes,
  toLocalDateTime,
  type ISODate,
  type LocalDateTime,
  type TimeOfDay,
} from './dates.ts';

/**
 * Badya's working calendar: Sunday–Thursday, 9:00 AM – 2:00 PM.
 * Friday and Saturday are non-working days.
 */
export const WORKING_DAYS: readonly number[] = [0, 1, 2, 3, 4];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const WORKDAY_START: TimeOfDay = '09:00';
export const WORKDAY_END: TimeOfDay = '14:00';

/** Students must register at least this many working-calendar hours before an activity starts. */
export const DEFAULT_REGISTRATION_LEAD_HOURS = 24;

export type WorkingDayPredicate = (date: ISODate) => boolean;

export function isWorkingDay(date: ISODate): boolean {
  return WORKING_DAYS.includes(dayOfWeek(date));
}

export function isWithinWorkingHours(startTime: TimeOfDay, endTime: TimeOfDay): boolean {
  return (
    timeToMinutes(startTime) >= timeToMinutes(WORKDAY_START) &&
    timeToMinutes(endTime) <= timeToMinutes(WORKDAY_END) &&
    timeToMinutes(endTime) > timeToMinutes(startTime)
  );
}

/**
 * Registration deadline for an activity.
 *
 * Counts `leadHours` backwards from the activity start, where only time on
 * working days elapses — Fridays and Saturdays are skipped entirely. With the
 * default 24 hours this means "same time on the previous working day":
 *
 *   Monday 10:00  → Sunday 10:00
 *   Sunday 10:00  → Thursday 10:00 (Friday & Saturday don't count)
 *
 * `isWorking` can be swapped for a predicate that also knows about holidays.
 */
export function computeRegistrationDeadline(
  date: ISODate,
  startTime: TimeOfDay,
  leadHours: number = DEFAULT_REGISTRATION_LEAD_HOURS,
  isWorking: WorkingDayPredicate = isWorkingDay,
): LocalDateTime {
  let remaining = Math.round(leadHours * 60);
  let cursorDate = date;
  // Minutes of the cursor day that lie before the cursor position.
  let cursorMinutes = isWorking(date) ? timeToMinutes(startTime) : 0;

  // A year of non-working days would mean a broken predicate; fail loudly instead of looping forever.
  for (let guard = 0; guard < 366; guard++) {
    if (isWorking(cursorDate)) {
      if (cursorMinutes >= remaining) {
        return toLocalDateTime(cursorDate, minutesToTime(cursorMinutes - remaining));
      }
      remaining -= cursorMinutes;
    }
    cursorDate = addDays(cursorDate, -1);
    cursorMinutes = MINUTES_PER_DAY;
  }
  throw new Error('Unable to compute registration deadline: no working days found.');
}
