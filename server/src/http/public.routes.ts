import { Hono } from 'hono';
import { WORKDAY_END, WORKDAY_START, WORKING_DAYS } from '../../../shared/calendar.ts';
import { ACADEMIC_LEVELS, APP_NAME, MAJOR_SUGGESTIONS } from '../../../shared/constants.ts';
import type { PublicConfig } from '../../../shared/types.ts';
import { localNow, type AppContext } from '../context.ts';
import { badRequest, parseId } from '../lib/errors.ts';
import { enforceLimit, RateLimiter } from '../lib/rate-limit.ts';
import type { Services } from '../services.ts';
import { queryString, type AppEnv } from './middleware.ts';

export function publicRoutes(ctx: AppContext, services: Services): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  const reservationLimiter = new RateLimiter(20, 60_000);

  router.get('/config', (c) => {
    const now = localNow(ctx);
    const body: PublicConfig = {
      appName: APP_NAME,
      timeZone: ctx.config.timeZone,
      now,
      today: now.slice(0, 10),
      workingDays: WORKING_DAYS,
      workdayStart: WORKDAY_START,
      workdayEnd: WORKDAY_END,
      registrationLeadHours: ctx.config.registrationLeadHours,
      emailDomains: ctx.config.emailDomains,
      academicLevels: ACADEMIC_LEVELS,
      majorSuggestions: MAJOR_SUGGESTIONS,
    };
    return c.json(body);
  });

  router.get('/activities', (c) => {
    const month = queryString(c.req.query('month'));
    if (!month) throw badRequest('The month query parameter is required (YYYY-MM).');
    return c.json(services.activities.listPublic(month));
  });

  router.get('/activities/:id', (c) => c.json(services.activities.getPublic(parseId(c.req.param('id')))));

  router.post('/activities/:id/reservations', (c) => {
    enforceLimit(reservationLimiter, 'reserve', c.get('ip'));
    const confirmation = services.reservations.reserve(parseId(c.req.param('id')), c.get('body'), {
      actor: 'student',
      signedInStudentId: c.get('student')?.user.student?.id ?? null,
    });
    return c.json(confirmation, 201);
  });

  return router;
}
