import { toLocalDateTime, type ISODate, type LocalDateTime, type TimeOfDay } from './dates.ts';

/**
 * Lifecycle status an admin sets and the database stores.
 * "Full" is never stored: it is derived from live reservation counts.
 */
export const STORED_STATUSES = ['draft', 'published', 'registration_closed', 'completed', 'cancelled'] as const;
export type StoredStatus = (typeof STORED_STATUSES)[number];

/** Status shown to users, computed from the stored status, the clock and the seat count. */
export const ACTIVITY_STATUSES = ['draft', 'published', 'full', 'registration_closed', 'completed', 'cancelled'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const ADMIN_STATUS_LABELS: Record<ActivityStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  full: 'Full',
  registration_closed: 'Registration Closed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const STUDENT_STATUS_LABELS: Record<ActivityStatus, string> = {
  draft: 'Not available',
  published: 'Open',
  full: 'Fully Booked',
  registration_closed: 'Registration Closed',
  completed: 'Event Ended',
  cancelled: 'Cancelled',
};

export interface StatusInput {
  status: StoredStatus;
  date: ISODate;
  endTime: TimeOfDay;
  registrationDeadline: LocalDateTime;
  capacity: number;
  registeredCount: number;
}

/**
 * Order matters: a cancelled activity stays cancelled even after its date,
 * and once the deadline passes "Registration Closed" wins over "Full"
 * because a freed seat can no longer be taken.
 */
export function computeEffectiveStatus(activity: StatusInput, now: LocalDateTime): ActivityStatus {
  if (activity.status === 'draft') return 'draft';
  if (activity.status === 'cancelled') return 'cancelled';
  if (activity.status === 'completed' || now >= toLocalDateTime(activity.date, activity.endTime)) return 'completed';
  if (activity.status === 'registration_closed' || now >= activity.registrationDeadline) return 'registration_closed';
  if (activity.registeredCount >= activity.capacity) return 'full';
  return 'published';
}

/** Why a reservation is refused — shared so the UI can show the same wording the API uses. */
export const RESERVATION_BLOCKERS = {
  full: { code: 'FULLY_BOOKED', message: 'Fully Booked' },
  registration_closed: { code: 'REGISTRATION_CLOSED', message: 'Registration Closed' },
  completed: { code: 'ACTIVITY_COMPLETED', message: 'This event has ended. Registration is closed.' },
  cancelled: { code: 'ACTIVITY_CANCELLED', message: 'This activity has been cancelled.' },
  draft: { code: 'ACTIVITY_NOT_FOUND', message: 'Activity not found.' },
} as const satisfies Partial<Record<ActivityStatus, { code: string; message: string }>>;

export type ReservationBlocker = (typeof RESERVATION_BLOCKERS)[keyof typeof RESERVATION_BLOCKERS];

export function reservationBlocker(status: ActivityStatus): ReservationBlocker | null {
  return status === 'published' ? null : RESERVATION_BLOCKERS[status];
}

export const RESERVATION_STATUSES = ['confirmed', 'cancelled'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const ATTENDANCE_STATUSES = ['present', 'absent'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
