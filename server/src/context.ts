import { nowIn, type ISODate, type LocalDateTime } from '../../shared/dates.ts';
import type { AppConfig } from './config.ts';
import type { Database } from './db/database.ts';
import type { Logger } from './lib/logger.ts';
import type { Mailer } from './lib/mailer.ts';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Everything a service needs, passed explicitly so tests can swap any piece. */
export interface AppContext {
  db: Database;
  config: AppConfig;
  clock: Clock;
  mailer: Mailer;
  log: Logger;
  /** Runs a promise detached from the request (errors are logged, never thrown). Tests can await it instead. */
  background: (task: Promise<unknown>) => void;
  /** Asks the host to call `reservations.sheet.flush()` again at `at` (Durable Object alarm, or a timer on Node). */
  scheduleRetry?: (at: Date) => void;
}

/** Current wall-clock time at the university, e.g. '2026-09-28T13:05'. */
export function localNow(ctx: AppContext): LocalDateTime {
  return nowIn(ctx.config.timeZone, ctx.clock.now());
}

export function localToday(ctx: AppContext): ISODate {
  return localNow(ctx).slice(0, 10);
}

/** UTC instant for audit columns. */
export function timestamp(ctx: AppContext): string {
  return ctx.clock.now().toISOString();
}
