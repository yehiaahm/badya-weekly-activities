import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { createContext, ensureAdmin } from './bootstrap.ts';
import { ensureFeaturedEvent } from './db/featured-event.ts';
import { loadDemoData } from './db/seed-demo.ts';

// Self-hosted / local entry point. On Cloudflare the app runs from worker/index.ts instead.
let retryTimer: ReturnType<typeof setTimeout> | undefined;
const ctx = createContext({
  scheduleRetry: (at) => {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => ctx.background(services.reservations.sheet.flush()), Math.max(at.getTime() - Date.now(), 1000));
    retryTimer.unref();
  },
});
const { app, services } = createApp(ctx);

// Hosts without a persistent disk (see render.yaml) start empty after every restart.
if (ctx.config.demoData && !ctx.db.get(`SELECT 1 FROM activities LIMIT 1`)) await loadDemoData(ctx);
ensureFeaturedEvent(ctx, services.activities);
await ensureAdmin(services.auth, ctx.config, ctx.log);
services.auth.purgeExpired();
setInterval(() => services.auth.purgeExpired(), 60 * 60_000).unref();
ctx.background(services.reservations.sheet.flush());

// Serve the built single-page app (npm run build) from the same origin.
const clientDir = config.clientDistDir;
const indexHtml = path.join(clientDir, 'index.html');
if (existsSync(indexHtml)) {
  const relativeRoot = path.relative(process.cwd(), clientDir) || '.';
  const html = readFileSync(indexHtml);
  app.use('/assets/*', async (c, next) => {
    await next();
    if (c.res.ok) c.res.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('*', serveStatic({ root: relativeRoot }));
  app.get('*', (c) => {
    if (c.req.path.startsWith('/api/')) return c.notFound();
    c.header('Cache-Control', 'no-cache');
    return c.html(html.toString('utf8'));
  });
}

const server = serve({ fetch: app.fetch, port: ctx.config.port, hostname: ctx.config.host }, () => {
  ctx.log.info(
    `SAC Sports Hub API listening on http://${ctx.config.host}:${ctx.config.port} ` +
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
