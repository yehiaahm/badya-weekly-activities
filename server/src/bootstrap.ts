import { config } from './config.ts';
import { systemClock, type AppContext } from './context.ts';
import { NodeDatabase } from './db/node-database.ts';
import { migrate } from './db/migrate.ts';
import { consoleLogger } from './lib/logger.ts';
import { createMailer } from './lib/mailer.ts';

export { ensureAdmin } from './ensure-admin.ts';

/** Node: opens the database file, applies migrations and builds the application context. */
export function createContext(overrides: Partial<AppContext> = {}): AppContext {
  const log = overrides.log ?? consoleLogger;
  const appConfig = overrides.config ?? config;
  const db = overrides.db ?? new NodeDatabase(config.databasePath);
  migrate(db, (message) => log.info(message));
  return {
    db,
    config: appConfig,
    clock: overrides.clock ?? systemClock,
    mailer: overrides.mailer ?? createMailer(appConfig, log),
    log,
    background:
      overrides.background ?? ((task) => void task.catch((error: unknown) => log.error('Background task failed', { error: String(error) }))),
    scheduleRetry: overrides.scheduleRetry,
  };
}
