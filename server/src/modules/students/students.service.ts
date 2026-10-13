import type { StudentDetails } from '../../../../shared/validation.ts';
import { timestamp, type AppContext } from '../../context.ts';
import { conflict } from '../../lib/errors.ts';
import { StudentRepository, type StudentRow } from './students.repository.ts';

export class StudentService {
  private readonly ctx: AppContext;
  readonly repo: StudentRepository;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.repo = new StudentRepository(ctx.db);
  }

  /**
   * Finds or creates the student behind a reservation form.
   *
   * The university Student ID and university email must always belong
   * together, so a form can't attach reservations to someone else's record.
   * A signed-in student can only reserve for themselves.
   * Must be called inside a transaction.
   */
  resolveForReservation(details: StudentDetails, signedInStudentId: number | null): StudentRow {
    const now = timestamp(this.ctx);
    const profile = {
      name: details.fullName,
      major: details.major,
      academicLevel: details.academicLevel,
      phone: details.phone,
      now,
    };

    if (signedInStudentId !== null) {
      const self = this.repo.findById(signedInStudentId);
      if (self && (self.student_id !== details.studentId || self.email !== details.email)) {
        throw conflict(
          'IDENTITY_MISMATCH',
          `You are signed in as ${self.name} (${self.student_id}). Sign out of "My Reservations" to reserve for another student.`,
        );
      }
    }

    const byStudentId = this.repo.findByStudentId(details.studentId);
    if (byStudentId) {
      if (byStudentId.email !== details.email) {
        throw conflict(
          'IDENTITY_MISMATCH',
          'This Student ID is already linked to a different university email. Use the email you registered with, or contact the Sports Office.',
        );
      }
      this.repo.updateProfile(byStudentId, profile);
      return this.repo.findById(byStudentId.id)!;
    }

    if (this.repo.findByEmail(details.email)) {
      throw conflict(
        'IDENTITY_MISMATCH',
        'This university email is already linked to a different Student ID. Check your Student ID, or contact the Sports Office.',
      );
    }

    const existingUser = this.repo.findUserByEmail(details.email);
    if (existingUser && existingUser.role !== 'student') {
      throw conflict('IDENTITY_MISMATCH', 'This email belongs to a staff account and cannot be used for student reservations.');
    }
    const userId =
      existingUser?.id ?? this.repo.createUser({ name: details.fullName, email: details.email, role: 'student', now });
    if (existingUser) this.ctx.db.run('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [details.fullName, now, userId]);

    const id = this.repo.createStudent({
      userId,
      studentId: details.studentId,
      major: details.major,
      academicLevel: details.academicLevel,
      phone: details.phone,
      email: details.email,
      now,
    });
    return this.repo.findById(id)!;
  }
}
