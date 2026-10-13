import type { LocalDateTime } from '../../../../shared/dates.ts';
import { computeEffectiveStatus } from '../../../../shared/status.ts';
import type { ActivityDTO, AdminActivityDTO } from '../../../../shared/types.ts';
import type { ActivityRow } from './activities.repository.ts';

export function toActivityDTO(row: ActivityRow, now: LocalDateTime): ActivityDTO {
  const status = computeEffectiveStatus(
    {
      status: row.status,
      date: row.date,
      endTime: row.end_time,
      registrationDeadline: row.registration_deadline,
      capacity: row.capacity,
      registeredCount: row.registered_count,
    },
    now,
  );
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    coach: row.coach,
    capacity: row.capacity,
    registeredCount: row.registered_count,
    availableSeats: Math.max(row.capacity - row.registered_count, 0),
    status,
    storedStatus: row.status,
    registrationDeadline: row.registration_deadline,
    canReserve: status === 'published',
  };
}

export function toAdminActivityDTO(row: ActivityRow, now: LocalDateTime): AdminActivityDTO {
  return {
    ...toActivityDTO(row, now),
    presentCount: row.present_count,
    absentCount: row.absent_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
