import { Hono } from 'hono';
import { localToday, type AppContext } from '../context.ts';
import { badRequest, parseId } from '../lib/errors.ts';
import { toStudentProfile } from '../modules/students/students.repository.ts';
import type { Services } from '../services.ts';
import { adminSession, queryString, requireAdmin, type AppContextHono, type AppEnv } from './middleware.ts';

function sendCsv(c: AppContextHono, file: { filename: string; csv: string }) {
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${file.filename}"`);
  return c.body(file.csv);
}

/** Business rule 7: only staff accounts reach anything below. */
export function adminRoutes(ctx: AppContext, services: Services): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  router.use('*', requireAdmin);

  const month = (value: unknown) => queryString(value) ?? localToday(ctx).slice(0, 7);

  // ------------------------------------------------------------ overview
  router.get('/dashboard', (c) => c.json(services.dashboard.build(month(c.req.query('month')))));

  router.get('/lookups', (c) => c.json(services.activities.lookups()));

  // ---------------------------------------------------------- activities
  router.get('/activities', (c) =>
    c.json(
      services.activities.listAdmin(month(c.req.query('month')), {
        category: queryString(c.req.query('category')),
        name: queryString(c.req.query('name')),
        date: queryString(c.req.query('date')),
      }),
    ),
  );

  router.post('/activities', (c) => c.json(services.activities.create(c.get('body'), adminSession(c).user.id), 201));

  router.post('/activities/status', (c) => c.json(services.activities.setStatus(c.get('body'))));

  router.get('/activities/:id', (c) => c.json(services.activities.getAdmin(parseId(c.req.param('id')))));

  router.patch('/activities/:id', (c) => c.json(services.activities.update(parseId(c.req.param('id')), c.get('body'))));

  router.delete('/activities/:id', (c) => {
    services.activities.remove(parseId(c.req.param('id')));
    return c.body(null, 204);
  });

  router.post('/activities/:id/duplicate', (c) =>
    c.json(services.activities.duplicate(parseId(c.req.param('id')), c.get('body'), adminSession(c).user.id), 201),
  );

  // -------------------------------------------------------------- months
  router.post('/months/:month/copy-previous', (c) =>
    c.json(services.activities.copyPreviousMonth(c.req.param('month'), adminSession(c).user.id), 201),
  );

  router.post('/months/:month/publish', (c) => c.json(services.activities.publishMonth(c.req.param('month'))));

  // -------------------------------------------------------- reservations
  router.get('/activities/:id/reservations', (c) => c.json(services.reservations.listForActivity(parseId(c.req.param('id')))));

  router.get('/activities/:id/reservations/export', (c) =>
    sendCsv(c, services.reservations.exportCsv(parseId(c.req.param('id')))),
  );

  // Every reservation of every activity, as an Excel workbook.
  router.get('/reservations/export.xlsx', (c) => {
    const file = services.reservations.exportAllXlsx();
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', `attachment; filename="${file.filename}"`);
    return c.body(file.data as Uint8Array<ArrayBuffer>);
  });

  router.post('/activities/:id/reservations', (c) => {
    const body = c.get('body');
    const confirmation = services.reservations.reserve(parseId(c.req.param('id')), body, {
      actor: 'admin',
      adminUserId: adminSession(c).user.id,
      overrideDeadline: body?.overrideDeadline === true,
    });
    return c.json(confirmation, 201);
  });

  router.post('/reservations/:id/cancel', (c) => {
    services.reservations.cancelByAdmin(parseId(c.req.param('id')));
    return c.body(null, 204);
  });

  router.get('/students', (c) => {
    const q = queryString(c.req.query('q'));
    if (!q || q.length < 2) throw badRequest('Type at least 2 characters to search.');
    return c.json({ students: services.students.search(q).map(toStudentProfile) });
  });

  // ---------------------------------------------------------- attendance
  router.get('/activities/:id/attendance', (c) => c.json(services.attendance.get(parseId(c.req.param('id')))));

  router.put('/activities/:id/attendance', (c) =>
    c.json(services.attendance.record(parseId(c.req.param('id')), c.get('body'), adminSession(c).user.id)),
  );

  // ------------------------------------------------------------- reports
  const reportQuery = (c: AppContextHono) => ({
    month: month(c.req.query('month')),
    activity: queryString(c.req.query('activity')),
    category: queryString(c.req.query('category')),
    date: queryString(c.req.query('date')),
  });

  router.get('/reports', (c) => c.json(services.reports.build(reportQuery(c))));

  router.get('/reports/export', (c) => sendCsv(c, services.reports.exportCsv(reportQuery(c))));

  return router;
}
