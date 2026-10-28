import { nowIn } from '../../../../shared/dates.ts';
import type { ReservationDetailRow } from './reservations.repository.ts';

/** Column order shared by the Excel export and the Google Sheet. The first column is the row key. */
export const RECORD_HEADERS = [
  'Reservation ID',
  'Status',
  'Registered At',
  'Cancelled At',
  'Cancelled By',
  'Booked By',
  'Activity',
  'Category',
  'Date',
  'Start',
  'End',
  'Location',
  'Coach',
  'Student Name',
  'Student ID',
  'Major',
  'Level',
  'Phone',
  'Email',
  'Attendance',
] as const;

const local = (timeZone: string, iso: string | null) => (iso ? nowIn(timeZone, new Date(iso)).replace('T', ' ') : '');

/** One reservation as a flat row of text, in `RECORD_HEADERS` order (university local time). */
export function toRecord(row: ReservationDetailRow, timeZone: string): string[] {
  return [
    row.code,
    row.reservation_status === 'confirmed' ? 'Confirmed' : 'Cancelled',
    local(timeZone, row.created_at),
    local(timeZone, row.cancelled_at),
    row.cancelled_by ? (row.cancelled_by === 'admin' ? 'Admin' : 'Student') : '',
    row.source === 'admin' ? 'Admin' : 'Student',
    row.activity_name,
    row.category,
    row.date,
    row.start_time,
    row.end_time,
    row.location,
    row.coach,
    row.student_name,
    row.university_id,
    row.major,
    row.academic_level,
    row.phone,
    row.email,
    row.reservation_status === 'confirmed' && row.attendance_status ? (row.attendance_status === 'present' ? 'Present' : 'Absent') : '',
  ];
}
