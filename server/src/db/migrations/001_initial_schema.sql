-- The Games for Badya – initial schema.
--
-- Conventions
--   * Activity dates/times are wall-clock values in the university time zone
--     (APP_TIMEZONE): date 'YYYY-MM-DD', times 'HH:MM', deadline 'YYYY-MM-DDTHH:MM'.
--   * Audit timestamps (*_at) are UTC ISO-8601 instants.
--   * "Full" is never stored; it is derived from confirmed reservations.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL COLLATE NOCASE UNIQUE,
  role          TEXT    NOT NULL CHECK (role IN ('admin', 'student')),
  password_hash TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  last_login_at TEXT
);

CREATE TABLE students (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  student_id     TEXT    NOT NULL UNIQUE,              -- university-issued ID
  major          TEXT    NOT NULL,
  academic_level TEXT    NOT NULL,
  phone          TEXT    NOT NULL,
  email          TEXT    NOT NULL COLLATE NOCASE UNIQUE, -- university email
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);

CREATE TABLE activities (
  id                    INTEGER PRIMARY KEY,
  name                  TEXT    NOT NULL,
  category              TEXT    NOT NULL,
  description           TEXT    NOT NULL DEFAULT '',
  date                  TEXT    NOT NULL,
  start_time            TEXT    NOT NULL,
  end_time              TEXT    NOT NULL,
  location              TEXT    NOT NULL,
  coach                 TEXT    NOT NULL,
  capacity              INTEGER NOT NULL CHECK (capacity > 0),
  status                TEXT    NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'published', 'registration_closed', 'completed', 'cancelled')),
  registration_deadline TEXT    NOT NULL,
  created_by            INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at            TEXT    NOT NULL,
  updated_at            TEXT    NOT NULL,
  CHECK (end_time > start_time)
);

CREATE INDEX ix_activities_date ON activities (date, start_time);
CREATE INDEX ix_activities_status_date ON activities (status, date);
CREATE INDEX ix_activities_category ON activities (category);

CREATE TABLE reservations (
  id                 INTEGER PRIMARY KEY,
  code               TEXT    NOT NULL UNIQUE,          -- public reservation ID, e.g. BDY-7K3M9Q
  activity_id        INTEGER NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  student_id         INTEGER NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  reservation_status TEXT    NOT NULL DEFAULT 'confirmed'
                     CHECK (reservation_status IN ('confirmed', 'cancelled')),
  source             TEXT    NOT NULL DEFAULT 'student' CHECK (source IN ('student', 'admin')),
  created_by         INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at         TEXT    NOT NULL,
  cancelled_at       TEXT,
  cancelled_by       TEXT    CHECK (cancelled_by IN ('student', 'admin'))
);

-- Business rule: a student holds at most one active reservation per activity.
-- Cancelled rows are kept for history and do not block re-registration.
CREATE UNIQUE INDEX ux_reservations_active
  ON reservations (activity_id, student_id)
  WHERE reservation_status = 'confirmed';

CREATE INDEX ix_reservations_activity ON reservations (activity_id, reservation_status);
CREATE INDEX ix_reservations_student ON reservations (student_id, reservation_status);

CREATE TABLE attendance (
  id                INTEGER PRIMARY KEY,
  activity_id       INTEGER NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  student_id        INTEGER NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  attendance_status TEXT    NOT NULL CHECK (attendance_status IN ('present', 'absent')),
  marked_at         TEXT    NOT NULL,
  marked_by         INTEGER REFERENCES users (id) ON DELETE SET NULL,
  UNIQUE (activity_id, student_id)
);

CREATE INDEX ix_attendance_student ON attendance (student_id);

CREATE TABLE sessions (
  id           TEXT    PRIMARY KEY,                    -- SHA-256 of the cookie token; the raw token is never stored
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   TEXT    NOT NULL,
  expires_at   TEXT    NOT NULL,
  last_seen_at TEXT    NOT NULL
);

CREATE INDEX ix_sessions_user ON sessions (user_id);
CREATE INDEX ix_sessions_expires ON sessions (expires_at);

-- One-time codes that let a student open "My Reservations" on any device.
CREATE TABLE login_codes (
  id          INTEGER PRIMARY KEY,
  email       TEXT    NOT NULL COLLATE NOCASE,
  code_hash   TEXT    NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT    NOT NULL,
  consumed_at TEXT,
  created_at  TEXT    NOT NULL
);

CREATE INDEX ix_login_codes_email ON login_codes (email, created_at);
