import { Router } from 'express';
import { adminLoginSchema, requestCodeSchema, verifyCodeSchema } from '../../../shared/validation.ts';
import type { AppContext } from '../context.ts';
import { parse, tooManyRequests } from '../lib/errors.ts';
import { limitByIp, RateLimiter } from '../lib/rate-limit.ts';
import type { Services } from '../services.ts';
import { clearSessionCookie, setSessionCookie } from './middleware.ts';

export function authRoutes(ctx: AppContext, services: Services): Router {
  const router = Router();
  const FIFTEEN_MINUTES = 15 * 60_000;
  const loginLimiter = new RateLimiter(10, FIFTEEN_MINUTES);
  const codeIpLimiter = new RateLimiter(10, FIFTEEN_MINUTES);
  const codeEmailLimiter = new RateLimiter(5, FIFTEEN_MINUTES);
  const verifyLimiter = new RateLimiter(20, FIFTEEN_MINUTES);

  router.get('/session', (req, res) => {
    res.json({ admin: req.admin?.user ?? null, student: req.student?.user ?? null });
  });

  router.post('/admin/login', limitByIp(loginLimiter, 'admin-login'), async (req, res) => {
    const { email, password } = parse(adminLoginSchema, req.body);
    const session = await services.auth.loginAdmin(email, password);
    loginLimiter.reset(`admin-login:${req.ip}`);
    setSessionCookie(res, ctx.config, 'admin', session);
    res.json({ user: session.user });
  });

  router.post('/admin/logout', (req, res) => {
    if (req.admin) services.auth.destroySession(req.admin.sessionId);
    clearSessionCookie(res, ctx.config, 'admin');
    res.status(204).end();
  });

  router.post('/student/request-code', limitByIp(codeIpLimiter, 'code'), async (req, res) => {
    const { email } = parse(requestCodeSchema, req.body);
    if (!codeEmailLimiter.hit(email)) throw tooManyRequests('Too many codes requested for this email. Try again in 15 minutes.');
    const result = await services.auth.requestStudentCode(email);
    res.json({
      message: 'If this email has reservations, a 6-digit code is on its way.',
      ...(result.devCode ? { devCode: result.devCode } : {}),
    });
  });

  router.post('/student/verify', limitByIp(verifyLimiter, 'verify'), (req, res) => {
    const { email, code } = parse(verifyCodeSchema, req.body);
    const session = services.auth.verifyStudentCode(email, code);
    setSessionCookie(res, ctx.config, 'student', session);
    res.json({ user: session.user });
  });

  router.post('/student/logout', (req, res) => {
    if (req.student) services.auth.destroySession(req.student.sessionId);
    clearSessionCookie(res, ctx.config, 'student');
    res.status(204).end();
  });

  return router;
}
