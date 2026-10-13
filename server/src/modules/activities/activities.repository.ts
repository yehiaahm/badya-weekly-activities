import type { StoredStatus } from '../../../../shared/status.ts';
import type { Database } from '../../db/database.ts';

export interface ActivityRow {
  id: number;
  name: string;
  category: string;
  description: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  coach: string;
  capacity: number;
  status: StoredStatus;
  registration_deadline: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  registered_count: number;
  present_count: number;
  absent_count: number;
}

export interface ActivityValues {
  name: string;
  category: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  coach: string;
  capacity: number;
  status: StoredStatus;
  registrationDeadline: string;
}

export interface ActivityFilters {
  start: string;
  endExclusive: string;
  includeDrafts: boolean;
  category?: string;
  name?: string;
  date?: string;
}

const ACTIVITY_SELECT = `
  SELECT a.*,
    (SELECT COUNT(*) FROM reservations r
      WHERE r.activity_id = a.id AND r.reservation_status = 'confirmed') AS registered_count,
    (SELECT COUNT(*) FROM attendance t
      WHERE t.activity_id = a.id AND t.attendance_status = 'present') AS present_count,
    (SELECT COUNT(*) FROM attendance t
      WHERE t.activity_id = a.id AND t.attendance_status = 'absent') AS absent_count
  FROM activities a`;

export class ActivityRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  findById(id: number): ActivityRow | undefined {
    return this.db.get<ActivityRow>(`${ACTIVITY_SELECT} WHERE a.id = ?`, [id]);
  }

  list(filters: ActivityFilters): ActivityRow[] {
    const where = ['a.date >= :start', 'a.date < :endExclusive'];
    if (!filters.includeDrafts) where.push(`a.status <> 'draft'`);
    if (filters.category) where.push('a.category = :category COLLATE NOCASE');
    if (filters.name) where.push('a.name = :name COLLATE NOCASE');
    if (filters.date) where.push('a.date = :date');
    return this.db.all<ActivityRow>(
      `${ACTIVITY_SELECT} WHERE ${where.join(' AND ')} ORDER BY a.date, a.start_time, a.name COLLATE NOCASE`,
      {
        start: filters.start,
        endExclusive: filters.endExclusive,
        category: filters.category ?? null,
        name: filters.name ?? null,
        date: filters.date ?? null,
      },
    );
  }

  insert(values: ActivityValues & { createdBy: number | null; now: string }): number {
    return this.db.run(
      `INSERT INTO activities
         (name, category, description, date, start_time, end_time, location, coach, capacity, status,
          registration_deadline, created_by, created_at, updated_at)
       VALUES
         (:name, :category, :description, :date, :startTime, :endTime, :location, :coach, :capacity, :status,
          :registrationDeadline, :createdBy, :now, :now)`,
      values,
    ).lastInsertRowid;
  }

  update(id: number, values: ActivityValues & { now: string }): void {
    this.db.run(
      `UPDATE activities SET
         name = :name, category = :category, description = :description, date = :date,
         start_time = :startTime, end_time = :endTime, location = :location, coach = :coach,
         capacity = :capacity, status = :status, registration_deadline = :registrationDeadline,
         updated_at = :now
       WHERE id = :id`,
      { ...values, id },
    );
  }

  setStatus(id: number, status: StoredStatus, now: string): void {
    this.db.run('UPDATE activities SET status = ?, updated_at = ? WHERE id = ?', [status, now, id]);
  }

  delete(id: number): void {
    this.db.run('DELETE FROM activities WHERE id = ?', [id]);
  }

  /** Same name, date, start time and location — treated as the same session. */
  existsIdentical(values: { name: string; date: string; startTime: string; location: string }): boolean {
    return (
      this.db.get(
        `SELECT 1 FROM activities
         WHERE name = :name COLLATE NOCASE AND date = :date AND start_time = :startTime AND location = :location COLLATE NOCASE
           AND status <> 'cancelled'
         LIMIT 1`,
        values,
      ) !== undefined
    );
  }

  distinct(column: 'category' | 'location' | 'coach' | 'name'): string[] {
    return this.db
      .all<{ value: string }>(`SELECT DISTINCT ${column} AS value FROM activities ORDER BY ${column} COLLATE NOCASE`)
      .map((row) => row.value);
  }
}
