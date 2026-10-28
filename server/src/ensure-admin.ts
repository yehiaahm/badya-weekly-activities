import type { AppConfig } from './config-base.ts';
import { DEV_ADMIN } from './db/dev-defaults.ts';
import type { Logger } from './lib/logger.ts';
import type { AuthService } from './modules/auth/auth.service.ts';

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
