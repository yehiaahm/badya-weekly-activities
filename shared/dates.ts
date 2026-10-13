/**
 * Pure calendar helpers shared by the server and the client.
 *
 * All values are plain wall-clock strings in the university's time zone:
 *   ISODate        'YYYY-MM-DD'
 *   TimeOfDay      'HH:MM'  (24h)
 *   LocalDateTime  'YYYY-MM-DDTHH:MM'
 *   MonthKey       'YYYY-MM'
 *
 * Arithmetic is done on UTC-based Date objects so the host machine's own
 * time zone and DST rules can never shift a calendar date.
 */

export type ISODate = string;
export type TimeOfDay = string;
export type LocalDateTime = string;
export type MonthKey = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const MINUTES_PER_DAY = 24 * 60;

export function isValidISODate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isValidMonthKey(value: string): boolean {
  const match = MONTH_RE.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

function toUTC(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(date: Date): ISODate {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  const value = toUTC(date);
  value.setUTCDate(value.getUTCDate() + days);
  return fromUTC(value);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(date: ISODate): number {
  return toUTC(date).getUTCDay();
}

export function diffInDays(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86_400_000);
}

export function monthOf(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

export function firstDayOfMonth(month: MonthKey): ISODate {
  return `${month}-01`;
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function lastDayOfMonth(month: MonthKey): ISODate {
  return `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
}

export function addMonths(month: MonthKey, count: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const value = new Date(Date.UTC(y, m - 1 + count, 1));
  return fromUTC(value).slice(0, 7);
}

/** Every date of the month, in order. */
export function datesOfMonth(month: MonthKey): ISODate[] {
  const total = daysInMonth(month);
  return Array.from({ length: total }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

/**
 * Weeks (Sunday → Saturday) that overlap the month. Each week lists its seven
 * dates; dates outside the month are still included so grids stay aligned.
 */
export function weeksOfMonth(month: MonthKey): ISODate[][] {
  const first = firstDayOfMonth(month);
  const last = lastDayOfMonth(month);
  let cursor = addDays(first, -dayOfWeek(first));
  const weeks: ISODate[][] = [];
  while (cursor <= last) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

/** 1-based occurrence of the weekday within its month (e.g. 2 = second Tuesday). */
export function weekdayOccurrence(date: ISODate): number {
  return Math.floor((Number(date.slice(8, 10)) - 1) / 7) + 1;
}

/** Dates in the month that fall on the given weekday. */
export function weekdayDatesInMonth(month: MonthKey, weekday: number): ISODate[] {
  return datesOfMonth(month).filter((date) => dayOfWeek(date) === weekday);
}

export function timeToMinutes(time: TimeOfDay): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): TimeOfDay {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function toLocalDateTime(date: ISODate, time: TimeOfDay): LocalDateTime {
  return `${date}T${time}`;
}

export function splitLocalDateTime(value: LocalDateTime): { date: ISODate; time: TimeOfDay } {
  return { date: value.slice(0, 10), time: value.slice(11, 16) };
}

/** Local date-time strings compare correctly as plain strings. */
export function isBefore(a: LocalDateTime, b: LocalDateTime): boolean {
  return a < b;
}

/** Wall-clock arithmetic (ignores DST, which is fine for "within the next N hours" checks). */
export function addMinutesLocal(value: LocalDateTime, minutes: number): LocalDateTime {
  const { date, time } = splitLocalDateTime(value);
  const [y, m, d] = date.split('-').map(Number);
  const instant = new Date(Date.UTC(y, m - 1, d) + (timeToMinutes(time) + minutes) * 60_000);
  return instant.toISOString().slice(0, 16);
}

/**
 * Current wall-clock time in an IANA time zone, e.g. nowIn('Africa/Cairo').
 */
export function nowIn(timeZone: string, instant: Date = new Date()): LocalDateTime {
  const parts = zonedParts(timeZone, instant);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function zonedParts(timeZone: string, instant: Date) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  const lookup: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) lookup[part.type] = part.value;
  return {
    year: lookup.year,
    month: lookup.month,
    day: lookup.day,
    hour: lookup.hour === '24' ? '00' : lookup.hour,
    minute: lookup.minute,
    second: lookup.second,
  };
}

/**
 * Converts a wall-clock time in `timeZone` to an absolute instant.
 * Used for calendar exports (.ics) and for sending absolute timestamps to clients.
 */
export function zonedToInstant(value: LocalDateTime, timeZone: string): Date {
  const [date, time] = value.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes settle the offset even around DST transitions.
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(timeZone, new Date(guess));
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    guess += target - asUTC;
  }
  return new Date(guess);
}
