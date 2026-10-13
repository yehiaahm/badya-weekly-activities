import { LOW_REGISTRATION_THRESHOLD } from '../../../../shared/constants.ts';
import { isValidISODate } from '../../../../shared/dates.ts';
import { ADMIN_STATUS_LABELS } from '../../../../shared/status.ts';
import type { AdminActivityDTO, CategoryBreakdown, ReportActivityRow, ReportResponse } from '../../../../shared/types.ts';
import { localToday, type AppContext } from '../../context.ts';
import { csvFilename, toCsv } from '../../lib/csv.ts';
import { badRequest } from '../../lib/errors.ts';
import { ActivityService } from '../activities/activities.service.ts';

export interface ReportQuery {
  month?: string;
  activity?: string;
  category?: string;
  date?: string;
}

function toReportRow(activity: AdminActivityDTO): ReportActivityRow {
  return {
    id: activity.id,
    name: activity.name,
    category: activity.category,
    date: activity.date,
    startTime: activity.startTime,
    endTime: activity.endTime,
    location: activity.location,
    status: activity.status,
    capacity: activity.capacity,
    registeredCount: activity.registeredCount,
    availableSeats: activity.availableSeats,
    fillRate: activity.capacity ? activity.registeredCount / activity.capacity : 0,
    presentCount: activity.presentCount,
    absentCount: activity.absentCount,
  };
}

const sum = (rows: ReportActivityRow[], pick: (row: ReportActivityRow) => number) =>
  rows.reduce((total, row) => total + pick(row), 0);

export class ReportService {
  private readonly ctx: AppContext;
  private readonly activities: ActivityService;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.activities = new ActivityService(ctx);
  }

  /** Aggregates always come straight from reservations/attendance, so reports are never stale. */
  build(query: ReportQuery): ReportResponse {
    const month = query.month || localToday(this.ctx).slice(0, 7);
    if (query.date && !isValidISODate(query.date)) throw badRequest('Invalid date.');

    // Drafts were never offered to students, so they are left out of reporting.
    const all = this.activities
      .listAdmin(month, { name: query.activity || undefined, category: query.category || undefined, date: query.date || undefined })
      .activities.filter((activity) => activity.status !== 'draft')
      .map(toReportRow);
    const active = all.filter((row) => row.status !== 'cancelled');

    const reservations = sum(active, (row) => row.registeredCount);
    const capacity = sum(active, (row) => row.capacity);
    const present = sum(active, (row) => row.presentCount);
    const absent = sum(active, (row) => row.absentCount);
    const attendancePending = sum(
      active.filter((row) => row.status === 'completed'),
      (row) => Math.max(row.registeredCount - row.presentCount - row.absentCount, 0),
    );

    const categories = new Map<string, CategoryBreakdown>();
    for (const row of active) {
      const entry = categories.get(row.category) ?? {
        category: row.category,
        activities: 0,
        reservations: 0,
        capacity: 0,
        present: 0,
        absent: 0,
      };
      entry.activities++;
      entry.reservations += row.registeredCount;
      entry.capacity += row.capacity;
      entry.present += row.presentCount;
      entry.absent += row.absentCount;
      categories.set(row.category, entry);
    }

    return {
      filters: { month, activity: query.activity || null, category: query.category || null, date: query.date || null },
      totals: {
        activities: active.length,
        cancelledActivities: all.length - active.length,
        reservations,
        capacity,
        availableSeats: sum(active, (row) => row.availableSeats),
        present,
        absent,
        attendancePending,
        fillRate: capacity ? reservations / capacity : 0,
        attendanceRate: present + absent ? present / (present + absent) : null,
      },
      mostReserved: active
        .filter((row) => row.registeredCount > 0)
        .sort((a, b) => b.registeredCount - a.registeredCount || b.fillRate - a.fillRate)
        .slice(0, 5),
      lowRegistration: active
        .filter((row) => row.fillRate < LOW_REGISTRATION_THRESHOLD)
        .sort((a, b) => a.fillRate - b.fillRate || a.date.localeCompare(b.date)),
      fullCapacity: active.filter((row) => row.registeredCount >= row.capacity),
      byCategory: [...categories.values()].sort((a, b) => b.reservations - a.reservations),
      activities: all,
      lowRegistrationThreshold: LOW_REGISTRATION_THRESHOLD,
    };
  }

  exportCsv(query: ReportQuery): { filename: string; csv: string } {
    const report = this.build(query);
    const csv = toCsv(
      ['Activity', 'Category', 'Date', 'Start', 'End', 'Location', 'Status', 'Capacity', 'Registered', 'Available', 'Fill %', 'Present', 'Absent'],
      report.activities.map((row) => [
        row.name,
        row.category,
        row.date,
        row.startTime,
        row.endTime,
        row.location,
        ADMIN_STATUS_LABELS[row.status],
        row.capacity,
        row.registeredCount,
        row.availableSeats,
        Math.round(row.fillRate * 100),
        row.presentCount,
        row.absentCount,
      ]),
    );
    return { filename: csvFilename('activities-report', report.filters.month), csv };
  }
}
