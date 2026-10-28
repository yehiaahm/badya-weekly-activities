import { DurableObject } from 'cloudflare:workers';
import { createApp } from '../server/src/app.ts';
import { buildConfig, type Env as ConfigEnv } from '../server/src/config-base.ts';
import { systemClock, type AppContext } from '../server/src/context.ts';
import { applyMigrations } from '../server/src/db/apply-migrations.ts';
import { DurableObjectDatabase } from '../server/src/db/do-database.ts';
import { ensureFeaturedEvent } from '../server/src/db/featured-event.ts';
import { ensureAdmin } from '../server/src/ensure-admin.ts';
import { consoleLogger } from '../server/src/lib/logger.ts';
import { createMailer } from '../server/src/lib/mailer.ts';
import { MIGRATIONS } from './migrations.ts';

type App = ReturnType<typeof createApp>;

const RETRY_SAFETY_NET_MS = 30_000;

/**
 * The whole application runs inside this one Durable Object: its SQLite storage is the database,
 * and a single instance serializes every request, so capacity checks can never race.
 * (The Worker in index.ts only forwards /api/* here; static files come from Workers Assets.)
 */
export class AppDO extends DurableObject<ConfigEnv> {
  private app!: App;

  constructor(state: ConstructorParameters<typeof DurableObject>[0], env: ConfigEnv) {
    super(state, env);
    void state.blockConcurrencyWhile(async () => {
      const config = buildConfig(env);
      const log = consoleLogger;
      const db = new DurableObjectDatabase(state.storage);
      applyMigrations(db, MIGRATIONS, (message) => log.info(message));

      const ctx: AppContext = {
        db,
        config,
        clock: systemClock,
        mailer: createMailer(config, log),
        log,
        background: (task) => void task.catch((error: unknown) => log.error('Background task failed', { error: String(error) })),
        scheduleRetry: (at) => void state.storage.setAlarm(Math.max(at.getTime(), Date.now() + 1000)),
      };
      this.app = createApp(ctx);

      const { services } = this.app;
      ensureFeaturedEvent(ctx, services.activities);
      await ensureAdmin(services.auth, config, log);
      services.auth.purgeExpired();
    });
  }

  async fetch(request: Request): Promise<Response> {
    const response = await this.app.app.fetch(request);
    // Safety net: if a Google Sheet update is still queued after the request, make sure an alarm will retry it.
    if (this.app.services.reservations.sheet.hasPending()) {
      const existing = await this.ctx.storage.getAlarm();
      if (existing === null) await this.ctx.storage.setAlarm(Date.now() + RETRY_SAFETY_NET_MS);
    }
    return response;
  }

  /** Retries queued Google Sheet updates. */
  async alarm(): Promise<void> {
    await this.app.services.reservations.sheet.flush();
  }
}
