import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import type { AppContext } from './context.ts';
import { adminRoutes } from './http/admin.routes.ts';
import { authRoutes } from './http/auth.routes.ts';
import { apiNotFound, errorHandler, noStore, requireJsonForMutations, sessionMiddleware } from './http/middleware.ts';
import { publicRoutes } from './http/public.routes.ts';
import { studentRoutes } from './http/student.routes.ts';
import { createServices } from './services.ts';

export function createApp(ctx: AppContext) {
  const services = createServices(ctx);
  const app = express();

  app.disable('x-powered-by');
  if (ctx.config.trustProxy) app.set('trust proxy', 1);
  app.use(
    helmet({
      // Keep https upgrades off for plain-HTTP intranet deployments; set COOKIE_SECURE and serve over HTTPS in production.
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
      hsts: ctx.config.cookieSecure,
    }),
  );

  const api = express.Router();
  api.use(noStore);
  api.use(express.json({ limit: '100kb' }));
  api.use(requireJsonForMutations);
  api.use(sessionMiddleware(services.auth));
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use('/auth', authRoutes(ctx, services));
  api.use('/me', studentRoutes(services));
  api.use('/admin', adminRoutes(ctx, services));
  api.use(publicRoutes(ctx, services));
  api.use(apiNotFound);
  app.use('/api', api);

  // Serve the built single-page app (npm run build) from the same origin.
  const indexHtml = path.join(ctx.config.clientDistDir, 'index.html');
  if (existsSync(indexHtml)) {
    app.use(
      '/assets',
      express.static(path.join(ctx.config.clientDistDir, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }),
    );
    app.use(express.static(ctx.config.clientDistDir, { index: false }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  app.use(errorHandler(ctx.log));
  return { app, services };
}
