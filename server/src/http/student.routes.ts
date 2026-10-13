import { Router } from 'express';
import { parseId } from '../lib/errors.ts';
import type { Services } from '../services.ts';
import { requireStudent, studentSession } from './middleware.ts';

/** Business rule 8: a student only ever sees and manages their own reservations. */
export function studentRoutes(services: Services): Router {
  const router = Router();
  router.use(requireStudent);

  router.get('/reservations', (req, res) => {
    const { user } = studentSession(req);
    res.json({ student: user.student, reservations: services.reservations.listForStudent(user.student.id) });
  });

  router.post('/reservations/:id/cancel', (req, res) => {
    const { user } = studentSession(req);
    services.reservations.cancelByStudent(parseId(req.params.id), user.student.id);
    res.status(204).end();
  });

  return router;
}
