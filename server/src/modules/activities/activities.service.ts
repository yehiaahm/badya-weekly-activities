import { computeRegistrationDeadline, isWorkingDay, WORKING_DAYS } from '../../../../shared/calendar.ts';
import { CATEGORY_SUGGESTIONS, LOCATION_SUGGESTIONS } from '../../../../shared/constants.ts';
import { addMonths, firstDayOfMonth, isValidISODate, isValidMonthKey, weekdayDatesInMonth } from '../../../../shared/dates.ts';
import { ADMIN_STATUS_LABELS, type StoredStatus } from '../../../../shared/status.ts';
import type {
  ActivityDTO,
  ActivityListResponse,
  AdminActivityDTO,
  BulkResult,
  CopyMonthResult,
  LookupsDTO,
} from '../../../../shared/types.ts';
import {
  activityCreateSchema,
  activityUpdateSchema,
  bulkStatusSchema,
  duplicateSchema,
  scheduleIssues,
} from '../../../../shared/validation.ts';
import { localNow, localToday, timestamp, type AppContext } from '../../context.ts';
import { AppError, badRequest, conflict, notFound, parse } from '../../lib/errors.ts';
import { StudentRepository } from '../students/students.repository.ts';
import { toActivityDTO, toAdminActivityDTO } from './activities.mapper.ts';
import { ActivityRepository, type ActivityRow, type ActivityValues } from './activities.repository.ts';

export interface AdminListFilters {
  category?: string;
  name?: string;
  date?: string;
}

function mergeSuggestions(defaults: readonly string[], existing: string[]): string[] {
  const seen = new Map<string, string>();
  for (const value of [...existing, ...defaults]) {
    const key = value.toLowerCase();
    if (!seen.has(key)) seen.set(key, value);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export class ActivityService {
  private readonly ctx: AppContext;
  readonly repo: ActivityRepository;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.repo = new ActivityRepository(ctx.db);
  }

  deadlineFor(date: string, startTime: string): string {
    return computeRegistrationDeadline(date, startTime, this.ctx.config.registrationLeadHours);
  }

  monthRange(month: string) {
    if (!isValidMonthKey(month)) throw badRequest('Invalid month. Use the YYYY-MM format.');
    return { start: firstDayOfMonth(month), endExclusive: firstDayOfMonth(addMonths(month, 1)) };
  }

  // ---------------------------------------------------------------- reads

  /** What students see: every activity except drafts. */
  listPublic(month: string): ActivityListResponse {
    const now = localNow(this.ctx);
    const rows = this.repo.list({ ...this.monthRange(month), includeDrafts: false });
    return { month, now, activities: rows.map((row) => toActivityDTO(row, now)) };
  }

  getPublic(id: number): ActivityDTO {
    const row = this.repo.findById(id);
    if (!row || row.status === 'draft') throw notFound('Activity not found.', 'ACTIVITY_NOT_FOUND');
    return toActivityDTO(row, localNow(this.ctx));
  }

  listAdmin(month: string, filters: AdminListFilters = {}): ActivityListResponse<AdminActivityDTO> {
    const now = localNow(this.ctx);
    if (filters.date && !isValidISODate(filters.date)) throw badRequest('Invalid date.');
    const rows = this.repo.list({ ...this.monthRange(month), includeDrafts: true, ...filters });
    return { month, now, activities: rows.map((row) => toAdminActivityDTO(row, now)) };
  }

  requireRow(id: number): ActivityRow {
    const row = this.repo.findById(id);
    if (!row) throw notFound('Activity not found.', 'ACTIVITY_NOT_FOUND');
    return row;
  }

  getAdmin(id: number): AdminActivityDTO {
    return toAdminActivityDTO(this.requireRow(id), localNow(this.ctx));
  }

  lookups(): LookupsDTO {
    return {
      categories: mergeSuggestions(CATEGORY_SUGGESTIONS, this.repo.distinct('category')),
      locations: mergeSuggestions(LOCATION_SUGGESTIONS, this.repo.distinct('location')),
      coaches: this.repo.distinct('coach'),
      activityNames: mergeSuggestions([], this.repo.distinct('name')),
      majors: new StudentRepository(this.ctx.db).distinctMajors(),
    };
  }

  // ---------------------------------------------------------------- writes

  create(input: unknown, userId: number | null): AdminActivityDTO {
    const values = parse(activityCreateSchema, input);
    const id = this.repo.insert({
      ...values,
      registrationDeadline: this.deadlineFor(values.date, values.startTime),
      createdBy: userId,
      now: timestamp(this.ctx),
    });
    return this.getAdmin(id);
  }

  /** Edits any field, including moving the activity to another date/time. */
  update(id: number, input: unknown): AdminActivityDTO {
    const changes = parse(activityUpdateSchema, input);
    return this.ctx.db.transaction(() => {
      const row = this.requireRow(id);
      const merged: ActivityValues = {
        name: changes.name ?? row.name,
        category: changes.category ?? row.category,
        description: changes.description ?? row.description,
        date: changes.date ?? row.date,
        startTime: changes.startTime ?? row.start_time,
        endTime: changes.endTime ?? row.end_time,
        location: changes.location ?? row.location,
        coach: changes.coach ?? row.coach,
        capacity: changes.capacity ?? row.capacity,
        status: changes.status ?? row.status,
        registrationDeadline: row.registration_deadline,
      };

      const issues = scheduleIssues(merged);
      if (issues.length) {
        throw badRequest(issues[0].message, Object.fromEntries(issues.map((issue) => [issue.path, issue.message])));
      }
      if (merged.capacity < row.registered_count) {
        const message = `Capacity can't be lower than the ${row.registered_count} students already registered.`;
        throw badRequest(message, { capacity: message });
      }
      if (merged.status !== row.status) this.assertStatusChange(row, merged.status);

      merged.registrationDeadline = this.deadlineFor(merged.date, merged.startTime);
      this.repo.update(id, { ...merged, now: timestamp(this.ctx) });
      return this.getAdmin(id);
    });
  }

  remove(id: number): void {
    this.ctx.db.transaction(() => {
      const row = this.requireRow(id);
      if (row.registered_count > 0) {
        throw conflict(
          'ACTIVITY_HAS_RESERVATIONS',
          `${row.name} has ${row.registered_count} registered student(s). Cancel the activity instead so the history is kept.`,
        );
      }
      this.repo.delete(id);
    });
  }

  /** Copies an activity onto other dates as drafts (reservations are never copied). */
  duplicate(id: number, input: unknown, userId: number | null) {
    const { dates } = parse(duplicateSchema, input);
    return this.ctx.db.transaction(() => {
      const row = this.requireRow(id);
      const created: AdminActivityDTO[] = [];
      const skipped: { date: string; reason: string }[] = [];
      for (const date of [...new Set(dates)].sort()) {
        if (!isWorkingDay(date)) {
          skipped.push({ date, reason: 'Not a working day' });
          continue;
        }
        if (this.repo.existsIdentical({ name: row.name, date, startTime: row.start_time, location: row.location })) {
          skipped.push({ date, reason: 'Already scheduled' });
          continue;
        }
        const newId = this.insertCopy(row, date, userId);
        created.push(this.getAdmin(newId));
      }
      return { created, skipped };
    });
  }

  setStatus(input: unknown): BulkResult {
    const { ids, status } = parse(bulkStatusSchema, input);
    return this.applyStatus(ids, status);
  }

  /** Publishes every draft in the month. */
  publishMonth(month: string): BulkResult {
    const drafts = this.repo
      .list({ ...this.monthRange(month), includeDrafts: true })
      .filter((row) => row.status === 'draft')
      .map((row) => row.id);
    return this.applyStatus(drafts, 'published');
  }

  /**
   * Copies the previous month's schedule into `month` as drafts.
   *
   * Activities are matched by weekday occurrence (2nd Tuesday → 2nd Tuesday).
   * When the new month has an extra week, it repeats the last week of the
   * source month. Cancelled activities, past dates and sessions that already
   * exist are skipped, so running it twice never creates duplicates.
   * Reservations are never copied.
   */
  copyPreviousMonth(month: string, userId: number | null): CopyMonthResult {
    this.monthRange(month);
    const sourceMonth = addMonths(month, -1);
    const today = localToday(this.ctx);

    return this.ctx.db.transaction(() => {
      const byDate = new Map<string, ActivityRow[]>();
      for (const row of this.repo.list({ ...this.monthRange(sourceMonth), includeDrafts: true })) {
        if (row.status === 'cancelled') continue;
        byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);
      }

      const result: CopyMonthResult = { sourceMonth, targetMonth: month, created: 0, skippedExisting: 0, skippedPast: 0, unmapped: 0 };
      for (const weekday of WORKING_DAYS) {
        const sourceDates = weekdayDatesInMonth(sourceMonth, weekday);
        const targetDates = weekdayDatesInMonth(month, weekday);
        for (const unmappedDate of sourceDates.slice(targetDates.length)) {
          result.unmapped += byDate.get(unmappedDate)?.length ?? 0;
        }
        targetDates.forEach((targetDate, index) => {
          const sourceDate = sourceDates[Math.min(index, sourceDates.length - 1)];
          for (const row of byDate.get(sourceDate) ?? []) {
            if (targetDate < today) {
              result.skippedPast++;
            } else if (
              this.repo.existsIdentical({ name: row.name, date: targetDate, startTime: row.start_time, location: row.location })
            ) {
              result.skippedExisting++;
            } else {
              this.insertCopy(row, targetDate, userId);
              result.created++;
            }
          }
        });
      }
      return result;
    });
  }

  // ---------------------------------------------------------------- helpers

  private insertCopy(row: ActivityRow, date: string, userId: number | null): number {
    return this.repo.insert({
      name: row.name,
      category: row.category,
      description: row.description,
      date,
      startTime: row.start_time,
      endTime: row.end_time,
      location: row.location,
      coach: row.coach,
      capacity: row.capacity,
      status: 'draft',
      registrationDeadline: this.deadlineFor(date, row.start_time),
      createdBy: userId,
      now: timestamp(this.ctx),
    });
  }

  private applyStatus(ids: number[], status: StoredStatus): BulkResult {
    return this.ctx.db.transaction(() => {
      const result: BulkResult = { updated: 0, failed: [] };
      const now = timestamp(this.ctx);
      for (const id of ids) {
        const row = this.repo.findById(id);
        if (!row) {
          result.failed.push({ id, message: 'Activity not found.' });
          continue;
        }
        if (row.status === status) continue;
        try {
          this.assertStatusChange(row, status);
          this.repo.setStatus(id, status, now);
          result.updated++;
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          result.failed.push({ id, message: error.message });
        }
      }
      return result;
    });
  }

  private assertStatusChange(row: ActivityRow, next: StoredStatus): void {
    if (next === 'draft' && row.registered_count > 0) {
      throw conflict(
        'ACTIVITY_HAS_RESERVATIONS',
        `${row.name} (${row.date}) has ${row.registered_count} registered student(s) and can't go back to ${ADMIN_STATUS_LABELS.draft}. Cancel it instead.`,
      );
    }
  }
}
