import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppContext } from './context.ts';
import { adminRoutes } from './http/admin.routes.ts';
import { authRoutes } from './http/auth.routes.ts';
import {
  apiNotFound,
  clientIpMiddleware,
  errorHandler,
  jsonBody,
  noStore,
  sessionMiddleware,
  type AppEnv,
} from './http/middleware.ts';
import { publicRoutes } from './http/public.routes.ts';
import { studentRoutes } from './http/student.routes.ts';
import { createServices } from './services.ts';

/** The JSON API (mounted at /api). Static files are served by the host: Workers Assets, or the Node entry point. */
export function createApp(ctx: AppContext) {
  const services = createServices(ctx);
  const app = new Hono<AppEnv>();

  app.use(
    '*',
    secureHeaders({
      // Keep https upgrades off for plain-HTTP intranet deployments; set COOKIE_SECURE and serve over HTTPS in production.
      strictTransportSecurity: ctx.config.cookieSecure ? 'max-age=15552000; includeSubDomains' : false,
    }),
  );

  const api = new Hono<AppEnv>();
  api.use('*', noStore);
  api.use('*', clientIpMiddleware(ctx.config));
  api.use('*', jsonBody);
  api.use('*', sessionMiddleware(services.auth));
  api.get('/health', (c) => c.json({ status: 'ok' }));
  api.route('/auth', authRoutes(ctx, services));
  api.route('/me', studentRoutes(services));
  api.route('/admin', adminRoutes(ctx, services));
  api.route('/', publicRoutes(ctx, services));
  api.notFound(apiNotFound);

  app.route('/api', api);
  app.notFound(apiNotFound);
  app.onError(errorHandler(ctx.log));
  return { app, services };
}
