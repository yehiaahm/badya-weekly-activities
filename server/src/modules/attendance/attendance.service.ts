import { formatFullDate } from '../../../../shared/format.ts';
import type { AttendanceStatus, ReservationStatus } from '../../../../shared/status.ts';
import type { AttendanceResponse, AttendanceRowDTO } from '../../../../shared/types.ts';
import { attendanceUpdateSchema } from '../../../../shared/validation.ts';
import { localNow, localToday, timestamp, type AppContext } from '../../context.ts';
import { badRequest, conflict, notFound, parse } from '../../lib/errors.ts';
import { toAdminActivityDTO } from '../activities/activities.mapper.ts';
import { ActivityRepository, type ActivityRow } from '../activities/activities.repository.ts';

interface AttendanceQueryRow {
  student_id: number;
  name: string;
  university_id: string;
  major: string;
  code: string;
  reservation_status: ReservationStatus;
  attendance_status: AttendanceStatus | null;
  marked_at: string | null;
}

export class AttendanceService {
  private readonly ctx: AppContext;
  private readonly activities: ActivityRepository;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.activities = new ActivityRepository(ctx.db);
  }

  get(activityId: number): AttendanceResponse {
    const row = this.requireActivity(activityId);
    const activity = toAdminActivityDTO(row, localNow(this.ctx));
    const { canRecord, reason } = this.recordability(row, activity.status);
    const rows = this.ctx.db
      .all<AttendanceQueryRow>(
        `SELECT s.id AS student_id, u.name, s.student_id AS university_id, s.major, r.code, r.reservation_status,
                t.attendance_status, t.marked_at
         FROM reservations r
         JOIN students s ON s.id = r.student_id
         JOIN users u ON u.id = s.user_id
         LEFT JOIN attendance t ON t.activity_id = r.activity_id AND t.student_id = r.student_id
         WHERE r.activity_id = ? AND r.reservation_status = 'confirmed'
         ORDER BY u.name COLLATE NOCASE`,
        [activityId],
      )
      .map(
        (r): AttendanceRowDTO => ({
          studentId: r.student_id,
          name: r.name,
          universityId: r.university_id,
          major: r.major,
          reservationCode: r.code,
          reservationStatus: r.reservation_status,
          attendance: r.attendance_status,
          markedAt: r.marked_at,
        }),
      );
    return { activity, canRecord, reason, rows };
  }

  /** Marks registered students present/absent (`null` clears a mark). */
  record(activityId: number, input: unknown, userId: number): AttendanceResponse {
    const { entries } = parse(attendanceUpdateSchema, input);
    this.ctx.db.transaction(() => {
      const row = this.requireActivity(activityId);
      const { canRecord, reason } = this.recordability(row, toAdminActivityDTO(row, localNow(this.ctx)).status);
      if (!canRecord) throw conflict('ATTENDANCE_NOT_OPEN', reason ?? 'Attendance cannot be recorded for this activity.');

      const registered = new Set(
        this.ctx.db
          .all<{ student_id: number }>(
            `SELECT student_id FROM reservations WHERE activity_id = ? AND reservation_status = 'confirmed'`,
            [activityId],
          )
          .map((r) => r.student_id),
      );
      const now = timestamp(this.ctx);
      for (const entry of entries) {
        if (!registered.has(entry.studentId)) {
          throw badRequest('Attendance can only be recorded for students with a confirmed reservation.');
        }
        if (entry.status === null) {
          this.ctx.db.run('DELETE FROM attendance WHERE activity_id = ? AND student_id = ?', [activityId, entry.studentId]);
        } else {
          this.ctx.db.run(
            `INSERT INTO attendance (activity_id, student_id, attendance_status, marked_at, marked_by)
             VALUES (:activityId, :studentId, :status, :now, :userId)
             ON CONFLICT (activity_id, student_id) DO UPDATE SET
               attendance_status = excluded.attendance_status,
               marked_at = excluded.marked_at,
               marked_by = excluded.marked_by`,
            { activityId, studentId: entry.studentId, status: entry.status, now, userId },
          );
        }
      }
    });
    return this.get(activityId);
  }

  private requireActivity(id: number): ActivityRow {
    const row = this.activities.findById(id);
    if (!row) throw notFound('Activity not found.', 'ACTIVITY_NOT_FOUND');
    return row;
  }

  private recordability(row: ActivityRow, status: string): { canRecord: boolean; reason: string | null } {
    if (status === 'draft') return { canRecord: false, reason: 'This activity is still a draft.' };
    if (status === 'cancelled') return { canRecord: false, reason: 'This activity was cancelled.' };
    if (localToday(this.ctx) < row.date) {
      return { canRecord: false, reason: `Attendance opens on the day of the activity (${formatFullDate(row.date)}).` };
    }
    return { canRecord: true, reason: null };
  }
}
