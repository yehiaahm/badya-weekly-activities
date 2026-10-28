-- Reservation changes waiting to be pushed to the Google Sheet (Apps Script web app).
-- A row is written in the same transaction as the reservation change, so nothing is
-- lost if the sheet is unreachable; the row is deleted once the sheet accepted it.

CREATE TABLE sheet_outbox (
  id               INTEGER PRIMARY KEY,
  reservation_id   INTEGER NOT NULL,
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TEXT    NOT NULL,
  last_error       TEXT,
  created_at       TEXT    NOT NULL
);

CREATE INDEX ix_sheet_outbox_due ON sheet_outbox (next_attempt_at);
