import type { AttendanceStatus, ReservationStatus } from '../../../../shared/status.ts';
import type { Database } from '../../db/database.ts';

export interface ReservationRow {
  id: number;
  code: string;
  activity_id: number;
  student_id: number;
  reservation_status: ReservationStatus;
  source: 'student' | 'admin';
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: 'student' | 'admin' | null;
}

export interface ReservationWithStudentRow extends ReservationRow {
  student_name: string;
  university_id: string;
  major: string;
  academic_level: string;
  phone: string;
  email: string;
  attendance_status: AttendanceStatus | null;
}

export class ReservationRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  findById(id: number): ReservationRow | undefined {
    return this.db.get<ReservationRow>('SELECT * FROM reservations WHERE id = ?', [id]);
  }

  findActive(activityId: number, studentId: number): ReservationRow | undefined {
    return this.db.get<ReservationRow>(
      `SELECT * FROM reservations WHERE activity_id = ? AND student_id = ? AND reservation_status = 'confirmed'`,
      [activityId, studentId],
    );
  }

  countConfirmed(activityId: number): number {
    return this.db.get<{ total: number }>(
      `SELECT COUNT(*) AS total FROM reservations WHERE activity_id = ? AND reservation_status = 'confirmed'`,
      [activityId],
    )!.total;
  }

  codeExists(code: string): boolean {
    return this.db.get('SELECT 1 FROM reservations WHERE code = ?', [code]) !== undefined;
  }

  insert(values: { code: string; activityId: number; studentId: number; source: 'student' | 'admin'; createdBy: number | null; now: string }): number {
    return this.db.run(
      `INSERT INTO reservations (code, activity_id, student_id, reservation_status, source, created_by, created_at)
       VALUES (:code, :activityId, :studentId, 'confirmed', :source, :createdBy, :now)`,
      values,
    ).lastInsertRowid;
  }

  cancel(id: number, by: 'student' | 'admin', now: string): void {
    this.db.run(
      `UPDATE reservations SET reservation_status = 'cancelled', cancelled_at = ?, cancelled_by = ? WHERE id = ?`,
      [now, by, id],
    );
  }

  listForActivity(activityId: number): ReservationWithStudentRow[] {
    return this.db.all<ReservationWithStudentRow>(
      `SELECT r.*, u.name AS student_name, s.student_id AS university_id, s.major, s.academic_level, s.phone, s.email,
              t.attendance_status
       FROM reservations r
       JOIN students s ON s.id = r.student_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN attendance t ON t.activity_id = r.activity_id AND t.student_id = r.student_id
       WHERE r.activity_id = ?
       ORDER BY r.reservation_status = 'cancelled', u.name COLLATE NOCASE`,
      [activityId],
    );
  }

  listForStudent(studentId: number): (ReservationRow & { attendance_status: AttendanceStatus | null })[] {
    return this.db.all(
      `SELECT r.*, t.attendance_status
       FROM reservations r
       JOIN activities a ON a.id = r.activity_id
       LEFT JOIN attendance t ON t.activity_id = r.activity_id AND t.student_id = r.student_id
       WHERE r.student_id = ?
       ORDER BY a.date DESC, a.start_time DESC`,
      [studentId],
    );
  }
}
