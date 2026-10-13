import type { ISODate, LocalDateTime, MonthKey, TimeOfDay } from './dates.ts';

/**
 * Display formatting for wall-clock values. Dates are formatted in UTC on
 * purpose: the strings are already local to the university, so no further
 * time-zone conversion may happen.
 */

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let value = cache.get(key);
  if (!value) {
    value = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });
    cache.set(key, value);
  }
  return value;
}

function asUTC(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "Sunday, September 6" */
export function formatDayDate(date: ISODate): string {
  return formatter({ weekday: 'long', month: 'long', day: 'numeric' }).format(asUTC(date));
}

/** "Sunday, September 6, 2026" */
export function formatFullDate(date: ISODate): string {
  return formatter({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(asUTC(date));
}

/** "Sun, Sep 6" */
export function formatShortDate(date: ISODate): string {
  return formatter({ weekday: 'short', month: 'short', day: 'numeric' }).format(asUTC(date));
}

/** "Sep 6" */
export function formatMonthDay(date: ISODate): string {
  return formatter({ month: 'short', day: 'numeric' }).format(asUTC(date));
}

/** "September 2026" */
export function formatMonth(month: MonthKey): string {
  return formatter({ month: 'long', year: 'numeric' }).format(asUTC(`${month}-01`));
}

/** "10:00 AM" */
export function formatTime(time: TimeOfDay): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "10:00 AM – 11:00 AM" */
export function formatTimeRange(start: TimeOfDay, end: TimeOfDay): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/** "Thursday, October 1 at 10:00 AM" */
export function formatDeadline(value: LocalDateTime): string {
  return `${formatDayDate(value.slice(0, 10))} at ${formatTime(value.slice(11, 16))}`;
}
