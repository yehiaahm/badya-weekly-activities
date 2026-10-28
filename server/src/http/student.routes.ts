import { Hono } from 'hono';
import { parseId } from '../lib/errors.ts';
import type { Services } from '../services.ts';
import { requireStudent, studentSession, type AppEnv } from './middleware.ts';

/** Business rule 8: a student only ever sees and manages their own reservations. */
export function studentRoutes(services: Services): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  router.use('*', requireStudent);

  router.get('/reservations', (c) => {
    const { user } = studentSession(c);
    return c.json({ student: user.student, reservations: services.reservations.listForStudent(user.student.id) });
  });

  router.post('/reservations/:id/cancel', (c) => {
    const { user } = studentSession(c);
    services.reservations.cancelByStudent(parseId(c.req.param('id')), user.student.id);
    return c.body(null, 204);
  });

  return router;
}
