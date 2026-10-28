/**
 * SAC Sports Hub – Google Sheet + email webhook (Google Apps Script).
 *
 * The Cloudflare app POSTs here every time a reservation is created or cancelled:
 *   { secret, action: 'upsert', headers: [...], row: [...] }  -> adds / updates one row (key = Reservation ID, column A)
 *   { secret, action: 'mail', to, subject, text, from }       -> sends an email from this Google account (optional)
 *
 * Setup: see "Google Sheet + Excel" in README.md.
 *   1. Set SECRET below to a long random string (the same value goes into the SHEET_WEBHOOK_SECRET secret).
 *   2. Deploy > New deployment > Web app: Execute as "Me", Who has access "Anyone".
 *   3. Put the Web app URL into the SHEET_WEBHOOK_URL secret.
 */
var SECRET = 'CHANGE-ME-to-a-long-random-string';
var SHEET_NAME = 'Reservations';
// Leave empty when the script is opened from the Sheet (Extensions > Apps Script).
// For a standalone script (script.new), put the Sheet's ID here (the long part of its URL after /d/).
var SPREADSHEET_ID = '';

function spreadsheet_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!SECRET || body.secret !== SECRET) return json_({ ok: false, error: 'forbidden' });
    if (body.action === 'upsert') return json_(upsert_(body.headers, body.row));
    if (body.action === 'mail') return json_(mail_(body));
    if (body.action === 'ping') return json_(ping_());
    return json_({ ok: false, error: 'unknown action' });
  } catch (error) {
    return json_({ ok: false, error: String(error) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'sac-sports-hub-sheet' });
}

function upsert_(headers, row) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var book = spreadsheet_();
    var sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
    // Phone numbers and student IDs must stay text (leading zeros); also stops values being read as formulas.
    var key = String(row[0]);
    var last = sheet.getLastRow();
    var found = 0;
    if (last > 1) {
      var keys = sheet.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < keys.length; i++) {
        if (String(keys[i][0]) === key) { found = i + 2; break; }
      }
    }
    var target = found || last + 1;
    var range = sheet.getRange(target, 1, 1, row.length);
    range.setNumberFormat('@'); // plain text
    range.setValues([row]);
    return { ok: true, row: target, updated: found > 0 };
  } finally {
    lock.releaseLock();
  }
}

/** Setup check: the secret matched and the spreadsheet is reachable. Changes nothing. */
function ping_() {
  return { ok: true, spreadsheet: spreadsheet_().getName(), emailQuotaLeft: MailApp.getRemainingDailyQuota() };
}

function mail_(body) {
  if (!body.to || !body.subject) return { ok: false, error: 'missing to/subject' };
  var options = { name: 'SAC Sports Hub' };
  MailApp.sendEmail(body.to, body.subject, body.text || '', options);
  return { ok: true };
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
