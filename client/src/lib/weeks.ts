import { isWorkingDay } from '@shared/calendar.ts';
import { addDays, dayOfWeek, isValidMonthKey, monthOf, weeksOfMonth, type ISODate, type MonthKey } from '@shared/dates.ts';
import { formatMonthDay } from '@shared/format.ts';

export interface WorkingWeek {
  /** Sunday that starts the week — used as the week's id in URLs. */
  start: ISODate;
  /** Sunday → Thursday. Days may belong to the neighbouring month. */
  days: ISODate[];
  label: string;
}

/** Weeks that contain at least one working day of `month`. */
export function workingWeeksOf(month: MonthKey): WorkingWeek[] {
  return weeksOfMonth(month)
    .filter((week) => week.some((date) => monthOf(date) === month && isWorkingDay(date)))
    .map((week) => {
      const days = week.filter(isWorkingDay);
      return { start: week[0], days, label: `${formatMonthDay(days[0])} – ${formatMonthDay(days[days.length - 1])}` };
    });
}

/** Sunday of the week students care about today: on Friday/Saturday that is next week. */
export function currentWeekStart(today: ISODate): ISODate {
  const weekday = dayOfWeek(today);
  const sunday = addDays(today, -weekday);
  return weekday >= 5 ? addDays(sunday, 7) : sunday;
}

/** Month to open when none is chosen — follows the current week across month boundaries. */
export function defaultMonth(today: ISODate): MonthKey {
  const start = currentWeekStart(today);
  const days = [0, 1, 2, 3, 4].map((offset) => addDays(start, offset));
  return days.some((day) => monthOf(day) === monthOf(today)) ? monthOf(today) : monthOf(days[0]);
}

export function defaultWeek(weeks: WorkingWeek[], today: ISODate): WorkingWeek {
  return weeks.find((week) => week.start === currentWeekStart(today)) ?? weeks[0];
}

export function monthsOfWeek(week: WorkingWeek): MonthKey[] {
  return [...new Set(week.days.map(monthOf))];
}

export function validMonth(value: string | null, fallback: MonthKey): MonthKey {
  return value && isValidMonthKey(value) ? value : fallback;
}
