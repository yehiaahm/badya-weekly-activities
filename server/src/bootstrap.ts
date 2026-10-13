import { config, type AppConfig } from './config.ts';
import { systemClock, type AppContext } from './context.ts';
import { Database } from './db/database.ts';
import { DEV_ADMIN } from './db/dev-defaults.ts';
import { migrate } from './db/migrate.ts';
import { consoleLogger, type Logger } from './lib/logger.ts';
import { createMailer } from './lib/mailer.ts';
import type { AuthService } from './modules/auth/auth.service.ts';

/** Opens the database, applies migrations and builds the application context. */
export function createContext(overrides: Partial<AppContext> = {}): AppContext {
  const log = overrides.log ?? consoleLogger;
  const appConfig = overrides.config ?? config;
  const db = overrides.db ?? new Database(appConfig.databasePath);
  migrate(db, (message) => log.info(message));
  return {
    db,
    config: appConfig,
    clock: overrides.clock ?? systemClock,
    mailer: overrides.mailer ?? createMailer(appConfig, log),
    log,
  };
}

/** Makes sure at least one staff account exists. */
export async function ensureAdmin(auth: AuthService, appConfig: AppConfig, log: Logger): Promise<void> {
  const { name, email, password } = appConfig.bootstrapAdmin;
  if (auth.adminCount() > 0) return;
  if (email && password) {
    await auth.upsertAdmin({ name, email, password });
    log.info(`Created admin account ${email}`);
    return;
  }
  if (!appConfig.isProduction) {
    await auth.upsertAdmin(DEV_ADMIN);
    log.warn(`Created development admin account ${DEV_ADMIN.email} (credentials in .env.example).`);
    return;
  }
  log.error(
    'No admin account exists yet. Set ADMIN_EMAIL and ADMIN_PASSWORD (10+ characters) and restart, ' +
      'or run: npm run admin -- --email you@badyauni.edu.eg --password "..."',
  );
}
