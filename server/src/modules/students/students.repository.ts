import type { StudentProfileDTO } from '../../../../shared/types.ts';
import type { Database } from '../../db/database.ts';

export interface UserRow {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'student';
  password_hash: string | null;
}

export interface StudentRow {
  id: number;
  user_id: number;
  name: string;
  student_id: string;
  major: string;
  academic_level: string;
  phone: string;
  email: string;
}

const STUDENT_SELECT = `
  SELECT s.id, s.user_id, u.name, s.student_id, s.major, s.academic_level, s.phone, s.email
  FROM students s
  JOIN users u ON u.id = s.user_id`;

export function toStudentProfile(row: StudentRow): StudentProfileDTO {
  return {
    id: row.id,
    name: row.name,
    studentId: row.student_id,
    major: row.major,
    academicLevel: row.academic_level,
    phone: row.phone,
    email: row.email,
  };
}

export class StudentRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  findUserByEmail(email: string): UserRow | undefined {
    return this.db.get<UserRow>('SELECT id, name, email, role, password_hash FROM users WHERE email = ?', [email]);
  }

  findById(id: number): StudentRow | undefined {
    return this.db.get<StudentRow>(`${STUDENT_SELECT} WHERE s.id = ?`, [id]);
  }

  findByUserId(userId: number): StudentRow | undefined {
    return this.db.get<StudentRow>(`${STUDENT_SELECT} WHERE s.user_id = ?`, [userId]);
  }

  findByStudentId(studentId: string): StudentRow | undefined {
    return this.db.get<StudentRow>(`${STUDENT_SELECT} WHERE s.student_id = ?`, [studentId]);
  }

  findByEmail(email: string): StudentRow | undefined {
    return this.db.get<StudentRow>(`${STUDENT_SELECT} WHERE s.email = ?`, [email]);
  }

  search(query: string, limit = 10): StudentRow[] {
    const like = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    return this.db.all<StudentRow>(
      `${STUDENT_SELECT}
       WHERE u.name LIKE :like ESCAPE '\\' OR s.student_id LIKE :like ESCAPE '\\' OR s.email LIKE :like ESCAPE '\\'
       ORDER BY u.name
       LIMIT :limit`,
      { like, limit },
    );
  }

  distinctMajors(): string[] {
    return this.db
      .all<{ major: string }>('SELECT DISTINCT major FROM students ORDER BY major COLLATE NOCASE')
      .map((row) => row.major);
  }

  createUser(values: { name: string; email: string; role: 'admin' | 'student'; passwordHash?: string | null; now: string }): number {
    return this.db.run(
      `INSERT INTO users (name, email, role, password_hash, created_at, updated_at)
       VALUES (:name, :email, :role, :passwordHash, :now, :now)`,
      { ...values, passwordHash: values.passwordHash ?? null },
    ).lastInsertRowid;
  }

  createStudent(values: {
    userId: number;
    studentId: string;
    major: string;
    academicLevel: string;
    phone: string;
    email: string;
    now: string;
  }): number {
    return this.db.run(
      `INSERT INTO students (user_id, student_id, major, academic_level, phone, email, created_at, updated_at)
       VALUES (:userId, :studentId, :major, :academicLevel, :phone, :email, :now, :now)`,
      values,
    ).lastInsertRowid;
  }

  /** Keeps the profile current with the details the student most recently entered. */
  updateProfile(student: StudentRow, values: { name: string; major: string; academicLevel: string; phone: string; now: string }): void {
    this.db.run('UPDATE users SET name = :name, updated_at = :now WHERE id = :id', {
      id: student.user_id,
      name: values.name,
      now: values.now,
    });
    this.db.run(
      `UPDATE students SET major = :major, academic_level = :academicLevel, phone = :phone, updated_at = :now
       WHERE id = :id`,
      { id: student.id, major: values.major, academicLevel: values.academicLevel, phone: values.phone, now: values.now },
    );
  }
}
