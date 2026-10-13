import { toLocalDateTime, zonedToInstant } from '@shared/dates.ts';
import type { ActivityDTO } from '@shared/types.ts';

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Downloads an .ics file so the student can add the activity to their phone's calendar. */
export function downloadCalendarEvent(activity: ActivityDTO, reservationCode: string, timeZone: string): void {
  const start = zonedToInstant(toLocalDateTime(activity.date, activity.startTime), timeZone);
  const end = zonedToInstant(toLocalDateTime(activity.date, activity.endTime), timeZone);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Games for Badya//Weekly Activities//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${reservationCode}@games.badya`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(`${activity.name} – The Games for Badya`)}`,
    `LOCATION:${escapeText(activity.location)}`,
    `DESCRIPTION:${escapeText(`Reservation ID: ${reservationCode}\nCoach: ${activity.coach}`)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(activity.name)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${activity.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${activity.date}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
