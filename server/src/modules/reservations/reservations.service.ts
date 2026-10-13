import { nowIn, toLocalDateTime } from '../../../../shared/dates.ts';
import { formatDeadline, formatFullDate, formatTimeRange } from '../../../../shared/format.ts';
import { RESERVATION_BLOCKERS } from '../../../../shared/status.ts';
import type {
  ActivityDTO,
  ActivityReservationsResponse,
  AdminReservationDTO,
  MyReservationDTO,
  ReservationConfirmationDTO,
} from '../../../../shared/types.ts';
import { studentDetailsSchema } from '../../../../shared/validation.ts';
import { localNow, timestamp, type AppContext } from '../../context.ts';
import { isUniqueViolation } from '../../db/database.ts';
import { conflict, notFound, parse } from '../../lib/errors.ts';
import { reservationCode } from '../../lib/security.ts';
import { csvFilename, textCell, toCsv } from '../../lib/csv.ts';
import { toActivityDTO, toAdminActivityDTO } from '../activities/activities.mapper.ts';
import { ActivityRepository } from '../activities/activities.repository.ts';
import type { StudentRow } from '../students/students.repository.ts';
import { StudentService } from '../students/students.service.ts';
import { ReservationRepository, type ReservationRow } from './reservations.repository.ts';

export type ReserveOptions =
  | { actor: 'student'; signedInStudentId: number | null }
  | { actor: 'admin'; adminUserId: number; overrideDeadline: boolean };

function summary(row: ReservationRow) {
  return {
    id: row.id,
    code: row.code,
    status: row.reservation_status,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
  };
}

export class ReservationService {
  private readonly ctx: AppContext;
  private readonly repo: ReservationRepository;
  private readonly activities: ActivityRepository;
  private readonly students: StudentService;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.repo = new ReservationRepository(ctx.db);
    this.activities = new ActivityRepository(ctx.db);
    this.students = new StudentService(ctx);
  }

  /**
   * Books a seat. Every business rule is enforced here, on the server, inside
   * one write transaction — the UI state and the URL are never trusted:
   *   • drafts are invisible to students; cancelled/completed activities refuse bookings
   *   • one active reservation per student per activity (also a unique index)
   *   • the working-day registration deadline (admins may override it explicitly)
   *   • capacity is never exceeded (not even by admins)
   */
  reserve(activityId: number, input: unknown, options: ReserveOptions): ReservationConfirmationDTO {
    const details = parse(studentDetailsSchema(this.ctx.config.emailDomains), input);
    const isAdmin = options.actor === 'admin';

    const { reservationId, student } = this.ctx.db.transaction(() => {
      const activity = this.activities.findById(activityId);
      if (!activity || (activity.status === 'draft' && !isAdmin)) {
        throw notFound('Activity not found.', 'ACTIVITY_NOT_FOUND');
      }
      const status = toActivityDTO(activity, localNow(this.ctx)).status;

      if (status === 'draft') throw conflict('ACTIVITY_NOT_PUBLISHED', 'Publish this activity before registering students.');
      if (status === 'cancelled') throw conflict(RESERVATION_BLOCKERS.cancelled.code, RESERVATION_BLOCKERS.cancelled.message);
      if (status === 'completed') throw conflict(RESERVATION_BLOCKERS.completed.code, RESERVATION_BLOCKERS.completed.message);

      const student = this.students.resolveForReservation(details, isAdmin ? null : options.signedInStudentId);

      if (this.repo.findActive(activityId, student.id)) {
        throw conflict(
          'ALREADY_REGISTERED',
          isAdmin ? 'This student is already registered for this activity.' : 'You are already registered for this activity.',
        );
      }
      if (status === 'registration_closed' && !(isAdmin && options.overrideDeadline)) {
        throw conflict(
          'REGISTRATION_CLOSED',
          activity.status === 'registration_closed'
            ? 'Registration Closed: registration for this activity has been closed.'
            : `Registration Closed: registration ended ${formatDeadline(activity.registration_deadline)}.`,
        );
      }
      if (this.repo.countConfirmed(activityId) >= activity.capacity) {
        throw conflict('FULLY_BOOKED', `Fully Booked: all ${activity.capacity} seats are taken.`);
      }

      try {
        const reservationId = this.repo.insert({
          code: this.uniqueCode(),
          activityId,
          studentId: student.id,
          source: options.actor,
          createdBy: isAdmin ? options.adminUserId : student.user_id,
          now: timestamp(this.ctx),
        });
        return { reservationId, student };
      } catch (error) {
        if (isUniqueViolation(error)) throw conflict('ALREADY_REGISTERED', 'You are already registered for this activity.');
        throw error;
      }
    });

    const reservation = this.repo.findById(reservationId)!;
    const activity = toActivityDTO(this.activities.findById(activityId)!, localNow(this.ctx));
    this.sendConfirmation(student, activity, reservation.code);

    return {
      reservation: summary(reservation),
      activity,
      student: { name: student.name, studentId: student.student_id, email: student.email },
    };
  }

  /** Students may cancel their own reservation until the activity starts. */
  cancelByStudent(reservationId: number, studentId: number): void {
    this.ctx.db.transaction(() => {
      const reservation = this.repo.findById(reservationId);
      // Someone else's reservation is reported as "not found" so IDs can't be probed.
      if (!reservation || reservation.student_id !== studentId) throw notFound('Reservation not found.');
      if (reservation.reservation_status === 'cancelled') throw conflict('ALREADY_CANCELLED', 'This reservation is already cancelled.');
      const activity = this.activities.findById(reservation.activity_id)!;
      if (localNow(this.ctx) >= toLocalDateTime(activity.date, activity.start_time)) {
        throw conflict('CANCELLATION_CLOSED', 'This activity has already started, so the reservation can no longer be cancelled.');
      }
      this.cancel(reservation, 'student');
    });
  }

  cancelByAdmin(reservationId: number): void {
    this.ctx.db.transaction(() => {
      const reservation = this.repo.findById(reservationId);
      if (!reservation) throw notFound('Reservation not found.');
      if (reservation.reservation_status === 'cancelled') throw conflict('ALREADY_CANCELLED', 'This reservation is already cancelled.');
      this.cancel(reservation, 'admin');
    });
  }

  listForActivity(activityId: number): ActivityReservationsResponse {
    const row = this.activities.findById(activityId);
    if (!row) throw notFound('Activity not found.', 'ACTIVITY_NOT_FOUND');
    const reservations: AdminReservationDTO[] = this.repo.listForActivity(activityId).map((r) => ({
      ...summary(r),
      source: r.source,
      attendance: r.reservation_status === 'confirmed' ? r.attendance_status : null,
      student: {
        id: r.student_id,
        name: r.student_name,
        studentId: r.university_id,
        major: r.major,
        academicLevel: r.academic_level,
        phone: r.phone,
        email: r.email,
      },
    }));
    return { activity: toAdminActivityDTO(row, localNow(this.ctx)), reservations };
  }

  listForStudent(studentId: number): MyReservationDTO[] {
    const now = localNow(this.ctx);
    return this.repo.listForStudent(studentId).map((r) => {
      const activity: ActivityDTO = toActivityDTO(this.activities.findById(r.activity_id)!, now);
      const upcoming = now < toLocalDateTime(activity.date, activity.startTime);
      return {
        ...summary(r),
        activity,
        attendance: r.attendance_status,
        canCancel: r.reservation_status === 'confirmed' && upcoming && activity.status !== 'cancelled',
      };
    });
  }

  exportCsv(activityId: number): { filename: string; csv: string } {
    const { activity, reservations } = this.listForActivity(activityId);
    const tz = this.ctx.config.timeZone;
    const csv = toCsv(
      ['Name', 'Student ID', 'Major', 'Level', 'Phone', 'Email', 'Status', 'Reservation ID', 'Registered At', 'Attendance'],
      reservations.map((r) => [
        r.student.name,
        textCell(r.student.studentId),
        r.student.major,
        r.student.academicLevel,
        textCell(r.student.phone),
        r.student.email,
        r.status === 'confirmed' ? 'Confirmed' : 'Cancelled',
        r.code,
        nowIn(tz, new Date(r.createdAt)).replace('T', ' '),
        r.attendance ? (r.attendance === 'present' ? 'Present' : 'Absent') : '',
      ]),
    );
    return { filename: csvFilename(activity.name, activity.date, 'registrations'), csv };
  }

  // ---------------------------------------------------------------- helpers

  private cancel(reservation: ReservationRow, by: 'student' | 'admin') {
    this.repo.cancel(reservation.id, by, timestamp(this.ctx));
    // Attendance only exists for confirmed reservations.
    this.ctx.db.run('DELETE FROM attendance WHERE activity_id = ? AND student_id = ?', [
      reservation.activity_id,
      reservation.student_id,
    ]);
  }

  private uniqueCode(): string {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = reservationCode();
      if (!this.repo.codeExists(code)) return code;
    }
    throw new Error('Could not generate a unique reservation code');
  }

  private sendConfirmation(student: StudentRow, activity: ActivityDTO, code: string) {
    const text = [
      `Hi ${student.name},`,
      '',
      'Your spot is reserved. See you there!',
      '',
      `Activity:        ${activity.name}`,
      `Date:            ${formatFullDate(activity.date)}`,
      `Time:            ${formatTimeRange(activity.startTime, activity.endTime)}`,
      `Location:        ${activity.location}`,
      `Reservation ID:  ${code}`,
      '',
      'Please arrive a few minutes early and have your Reservation ID ready.',
      `Can't make it? Cancel from "My Reservations" before the activity starts so another student can take your seat.`,
      '',
      'The Games for Badya – Sports Office',
    ].join('\n');
    this.ctx.mailer
      .send({ to: student.email, subject: `Reservation Confirmed – ${activity.name}, ${formatFullDate(activity.date)}`, text })
      .catch((error: unknown) => this.ctx.log.error('Failed to send reservation confirmation', { error: String(error) }));
  }
}
