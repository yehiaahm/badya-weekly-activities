import { addDays, addMinutesLocal } from '../../../../shared/dates.ts';
import { ACTIVITY_STATUSES, type ActivityStatus } from '../../../../shared/status.ts';
import type { AdminActivityDTO, DashboardResponse } from '../../../../shared/types.ts';
import { localNow, type AppContext } from '../../context.ts';
import { toAdminActivityDTO } from '../activities/activities.mapper.ts';
import { ActivityService } from '../activities/activities.service.ts';

const needsAttendance = (a: AdminActivityDTO) =>
  a.status === 'completed' && a.registeredCount > 0 && a.presentCount + a.absentCount < a.registeredCount;

export class DashboardService {
  private readonly ctx: AppContext;
  private readonly activities: ActivityService;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.activities = new ActivityService(ctx);
  }

  build(month: string): DashboardResponse {
    const now = localNow(this.ctx);
    const today = now.slice(0, 10);
    const { activities } = this.activities.listAdmin(month);

    const counts = Object.fromEntries(ACTIVITY_STATUSES.map((status) => [status, 0])) as Record<ActivityStatus, number>;
    for (const activity of activities) counts[activity.status]++;

    const offered = activities.filter((a) => a.status !== 'draft' && a.status !== 'cancelled');
    const nextWeek = this.activities.repo
      .list({ start: today, endExclusive: addDays(today, 8), includeDrafts: false })
      .map((row) => toAdminActivityDTO(row, now));
    const closingSoonCutoff = addMinutesLocal(now, 48 * 60);

    return {
      month,
      now,
      today,
      counts: { ...counts, total: activities.length },
      reservations: offered.reduce((total, a) => total + a.registeredCount, 0),
      capacity: offered.reduce((total, a) => total + a.capacity, 0),
      upcoming: nextWeek.filter((a) => a.date > today && a.status !== 'cancelled').slice(0, 8),
      todayActivities: nextWeek.filter((a) => a.date === today),
      attention: {
        drafts: counts.draft,
        attendancePending: activities.filter(needsAttendance),
        closingSoonLowFill: activities.filter(
          (a) =>
            a.status === 'published' &&
            a.registrationDeadline <= closingSoonCutoff &&
            a.registeredCount / a.capacity < 0.5,
        ),
      },
      workflow: {
        created: activities.length,
        published: activities.length - counts.draft,
        reservations: offered.reduce((total, a) => total + a.registeredCount, 0),
        pastActivities: activities.filter((a) => a.status === 'completed' && a.registeredCount > 0).length,
        attendanceRecorded: activities.filter(
          (a) => a.status === 'completed' && a.registeredCount > 0 && !needsAttendance(a),
        ).length,
      },
    };
  }
}
