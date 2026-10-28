import { Hono } from 'hono';
import { adminLoginSchema, requestCodeSchema, verifyCodeSchema } from '../../../shared/validation.ts';
import type { AppContext } from '../context.ts';
import { parse, tooManyRequests } from '../lib/errors.ts';
import { enforceLimit, RateLimiter } from '../lib/rate-limit.ts';
import type { Services } from '../services.ts';
import { clearSessionCookie, setSessionCookie, type AppEnv } from './middleware.ts';

export function authRoutes(ctx: AppContext, services: Services): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  const FIFTEEN_MINUTES = 15 * 60_000;
  const loginLimiter = new RateLimiter(10, FIFTEEN_MINUTES);
  const codeIpLimiter = new RateLimiter(10, FIFTEEN_MINUTES);
  const codeEmailLimiter = new RateLimiter(5, FIFTEEN_MINUTES);
  const verifyLimiter = new RateLimiter(20, FIFTEEN_MINUTES);

  router.get('/session', (c) => c.json({ admin: c.get('admin')?.user ?? null, student: c.get('student')?.user ?? null }));

  router.post('/admin/login', async (c) => {
    enforceLimit(loginLimiter, 'admin-login', c.get('ip'));
    const { email, password } = parse(adminLoginSchema, c.get('body'));
    const session = await services.auth.loginAdmin(email, password);
    loginLimiter.reset(`admin-login:${c.get('ip')}`);
    setSessionCookie(c, ctx.config, 'admin', session);
    return c.json({ user: session.user });
  });

  router.post('/admin/logout', (c) => {
    const admin = c.get('admin');
    if (admin) services.auth.destroySession(admin.sessionId);
    clearSessionCookie(c, ctx.config, 'admin');
    return c.body(null, 204);
  });

  router.post('/student/request-code', async (c) => {
    enforceLimit(codeIpLimiter, 'code', c.get('ip'));
    const { email } = parse(requestCodeSchema, c.get('body'));
    if (!codeEmailLimiter.hit(email)) throw tooManyRequests('Too many codes requested for this email. Try again in 15 minutes.');
    const result = await services.auth.requestStudentCode(email);
    return c.json({
      message: 'If this email has reservations, a 6-digit code is on its way.',
      ...(result.devCode ? { devCode: result.devCode } : {}),
    });
  });

  router.post('/student/verify', (c) => {
    enforceLimit(verifyLimiter, 'verify', c.get('ip'));
    const { email, code } = parse(verifyCodeSchema, c.get('body'));
    const session = services.auth.verifyStudentCode(email, code);
    setSessionCookie(c, ctx.config, 'student', session);
    return c.json({ user: session.user });
  });

  router.post('/student/logout', (c) => {
    const student = c.get('student');
    if (student) services.auth.destroySession(student.sessionId);
    clearSessionCookie(c, ctx.config, 'student');
    return c.body(null, 204);
  });

  return router;
}
