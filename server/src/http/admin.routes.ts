import { Router, type Response } from 'express';
import { localToday, type AppContext } from '../context.ts';
import { badRequest, parseId } from '../lib/errors.ts';
import { toStudentProfile } from '../modules/students/students.repository.ts';
import type { Services } from '../services.ts';
import { adminSession, queryString, requireAdmin } from './middleware.ts';

function sendCsv(res: Response, file: { filename: string; csv: string }) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.csv);
}

/** Business rule 7: only staff accounts reach anything below. */
export function adminRoutes(ctx: AppContext, services: Services): Router {
  const router = Router();
  router.use(requireAdmin);

  const month = (value: unknown) => queryString(value) ?? localToday(ctx).slice(0, 7);

  // ------------------------------------------------------------ overview
  router.get('/dashboard', (req, res) => {
    res.json(services.dashboard.build(month(req.query.month)));
  });

  router.get('/lookups', (_req, res) => {
    res.json(services.activities.lookups());
  });

  // ---------------------------------------------------------- activities
  router.get('/activities', (req, res) => {
    res.json(
      services.activities.listAdmin(month(req.query.month), {
        category: queryString(req.query.category),
        name: queryString(req.query.name),
        date: queryString(req.query.date),
      }),
    );
  });

  router.post('/activities', (req, res) => {
    res.status(201).json(services.activities.create(req.body, adminSession(req).user.id));
  });

  router.post('/activities/status', (req, res) => {
    res.json(services.activities.setStatus(req.body));
  });

  router.get('/activities/:id', (req, res) => {
    res.json(services.activities.getAdmin(parseId(req.params.id)));
  });

  router.patch('/activities/:id', (req, res) => {
    res.json(services.activities.update(parseId(req.params.id), req.body));
  });

  router.delete('/activities/:id', (req, res) => {
    services.activities.remove(parseId(req.params.id));
    res.status(204).end();
  });

  router.post('/activities/:id/duplicate', (req, res) => {
    res.status(201).json(services.activities.duplicate(parseId(req.params.id), req.body, adminSession(req).user.id));
  });

  // -------------------------------------------------------------- months
  router.post('/months/:month/copy-previous', (req, res) => {
    res.status(201).json(services.activities.copyPreviousMonth(req.params.month, adminSession(req).user.id));
  });

  router.post('/months/:month/publish', (req, res) => {
    res.json(services.activities.publishMonth(req.params.month));
  });

  // -------------------------------------------------------- reservations
  router.get('/activities/:id/reservations', (req, res) => {
    res.json(services.reservations.listForActivity(parseId(req.params.id)));
  });

  router.get('/activities/:id/reservations/export', (req, res) => {
    sendCsv(res, services.reservations.exportCsv(parseId(req.params.id)));
  });

  router.post('/activities/:id/reservations', (req, res) => {
    const confirmation = services.reservations.reserve(parseId(req.params.id), req.body, {
      actor: 'admin',
      adminUserId: adminSession(req).user.id,
      overrideDeadline: req.body?.overrideDeadline === true,
    });
    res.status(201).json(confirmation);
  });

  router.post('/reservations/:id/cancel', (req, res) => {
    services.reservations.cancelByAdmin(parseId(req.params.id));
    res.status(204).end();
  });

  router.get('/students', (req, res) => {
    const q = queryString(req.query.q);
    if (!q || q.length < 2) throw badRequest('Type at least 2 characters to search.');
    res.json({ students: services.students.search(q).map(toStudentProfile) });
  });

  // ---------------------------------------------------------- attendance
  router.get('/activities/:id/attendance', (req, res) => {
    res.json(services.attendance.get(parseId(req.params.id)));
  });

  router.put('/activities/:id/attendance', (req, res) => {
    res.json(services.attendance.record(parseId(req.params.id), req.body, adminSession(req).user.id));
  });

  // ------------------------------------------------------------- reports
  const reportQuery = (query: Record<string, unknown>) => ({
    month: month(query.month),
    activity: queryString(query.activity),
    category: queryString(query.category),
    date: queryString(query.date),
  });

  router.get('/reports', (req, res) => {
    res.json(services.reports.build(reportQuery(req.query)));
  });

  router.get('/reports/export', (req, res) => {
    sendCsv(res, services.reports.exportCsv(reportQuery(req.query)));
  });

  return router;
}
