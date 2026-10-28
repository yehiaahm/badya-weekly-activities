import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { startTestApp, studentDetails, type TestApp } from './helpers.ts';

describe('Excel export and Google Sheet sync', () => {
  let app: TestApp;
  const posted: any[] = [];
  const realFetch = globalThis.fetch;

  before(async () => {
    app = await startTestApp();
    app.ctx.config.sheet = { webhookUrl: 'https://script.google.test/exec', secret: 'shh' };
    // Only the sheet webhook is faked; the test HTTP client keeps using the real fetch.
    globalThis.fetch = (async (input: any, init?: any) => {
      if (String(input).startsWith('https://script.google.test')) {
        posted.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return realFetch(input, init);
    }) as typeof fetch;
  });

  after(async () => {
    globalThis.fetch = realFetch;
    await app.close();
  });

  it('pushes a new reservation, then its cancellation, to the sheet', async () => {
    const activity = app.activity();
    const client = app.client();
    const created = await client.post(`/activities/${activity.id}/reservations`, studentDetails(1));
    assert.equal(created.status, 201);
    await app.settle();

    assert.equal(posted.length, 1);
    assert.equal(posted[0].secret, 'shh');
    assert.equal(posted[0].row[0], created.body.reservation.code);
    assert.equal(posted[0].row[1], 'Confirmed');
    assert.equal(posted[0].row[13], 'Student Number 1');
    assert.equal(posted[0].row[17], '0100000' + '0001'); // phone keeps its leading zero

    await client.loginAdmin();
    assert.equal((await client.post(`/admin/reservations/${created.body.reservation.id}/cancel`)).status, 204);
    await app.settle();
    assert.equal(posted.length, 2);
    assert.equal(posted[1].row[0], created.body.reservation.code);
    assert.equal(posted[1].row[1], 'Cancelled');
  });

  it('keeps the update queued when the sheet is down, then delivers it', async () => {
    const activity = app.activity({ name: 'Padel', category: 'Padel', startTime: '12:00', endTime: '13:00' });
    const before = posted.length;
    const failing = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) =>
      String(input).startsWith('https://script.google.test') ? new Response('nope', { status: 500 }) : realFetch(input, init)) as typeof fetch;

    const created = await app.client().post(`/activities/${activity.id}/reservations`, studentDetails(2));
    assert.equal(created.status, 201); // the booking itself never depends on the sheet
    await app.settle();
    assert.equal(posted.length, before);
    assert.equal(app.services.reservations.sheet.hasPending(), true);

    globalThis.fetch = failing;
    app.clock.set('2026-09-28T09:30'); // past the retry delay
    await app.services.reservations.sheet.flush();
    assert.equal(posted.length, before + 1);
    assert.equal(app.services.reservations.sheet.hasPending(), false);
  });

  it('downloads every booking as a valid .xlsx workbook', async () => {
    const file = app.services.reservations.exportAllXlsx();
    assert.match(file.filename, /^reservations-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const parts = unzipSync(file.data);
    assert.ok(parts['xl/worksheets/sheet1.xml'] && parts['[Content_Types].xml']);
    const sheet = strFromU8(parts['xl/worksheets/sheet1.xml']!);
    assert.match(sheet, /Reservation ID/);
    assert.match(sheet, /Student Number 1/);
    assert.match(sheet, /01000000001/); // phone stored as text
  });

  it('only lets staff download the workbook', async () => {
    const response = await app.client().get('/admin/reservations/export.xlsx');
    assert.equal(response.status, 401);
  });
});
