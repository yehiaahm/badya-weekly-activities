import { Router } from 'express';
import { WORKDAY_END, WORKDAY_START, WORKING_DAYS } from '../../../shared/calendar.ts';
import { ACADEMIC_LEVELS, APP_NAME, MAJOR_SUGGESTIONS } from '../../../shared/constants.ts';
import type { PublicConfig } from '../../../shared/types.ts';
import { localNow, type AppContext } from '../context.ts';
import { badRequest, parseId } from '../lib/errors.ts';
import { limitByIp, RateLimiter } from '../lib/rate-limit.ts';
import type { Services } from '../services.ts';
import { queryString } from './middleware.ts';

export function publicRoutes(ctx: AppContext, services: Services): Router {
  const router = Router();
  const reservationLimiter = new RateLimiter(20, 60_000);

  router.get('/config', (_req, res) => {
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
    res.json(body);
  });

  router.get('/activities', (req, res) => {
    const month = queryString(req.query.month);
    if (!month) throw badRequest('The month query parameter is required (YYYY-MM).');
    res.json(services.activities.listPublic(month));
  });

  router.get('/activities/:id', (req, res) => {
    res.json(services.activities.getPublic(parseId(req.params.id)));
  });

  router.post('/activities/:id/reservations', limitByIp(reservationLimiter, 'reserve'), (req, res) => {
    const confirmation = services.reservations.reserve(parseId(req.params.id), req.body, {
      actor: 'student',
      signedInStudentId: req.student?.user.student?.id ?? null,
    });
    res.status(201).json(confirmation);
  });

  return router;
}
