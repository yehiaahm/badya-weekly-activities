import { createApp } from './app.ts';
import { createContext, ensureAdmin } from './bootstrap.ts';
import { loadDemoData } from './db/seed-demo.ts';

const ctx = createContext();
const { app, services } = createApp(ctx);

// Hosts without a persistent disk (see render.yaml) start empty after every restart.
if (ctx.config.demoData && !ctx.db.get(`SELECT 1 FROM activities LIMIT 1`)) await loadDemoData(ctx);
await ensureAdmin(services.auth, ctx.config, ctx.log);
services.auth.purgeExpired();
setInterval(() => services.auth.purgeExpired(), 60 * 60_000).unref();

const server = app.listen(ctx.config.port, ctx.config.host, () => {
  ctx.log.info(
    `The Games for Badya API listening on http://${ctx.config.host}:${ctx.config.port} ` +
      `(${ctx.config.nodeEnv}, time zone ${ctx.config.timeZone})`,
  );
});

function shutdown(signal: string) {
  ctx.log.info(`${signal} received, shutting down`);
  server.close(() => {
    ctx.db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
