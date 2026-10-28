# SAC Sports Hub – Weekly Activities

A web platform for Badya's sports and recreational activities. The Sports Office plans each month, and students browse the weekly schedule and reserve a spot from their phones.

```
Admin creates the monthly calendar → publishes activities → students browse and reserve
→ server checks capacity and the 24-hour working-day deadline → reservation confirmed
→ admin manages reservations → admin records attendance → reports update automatically
```

## Features

**Students** (`/`, mobile-first, no account needed to reserve)
- **Weekly Activities**: pick a month, step through the weeks, filter by sport or "Open only". Each card shows the activity, date, time, location, available seats and registration status. The page refreshes itself every 30 seconds, so a card switches to **Fully Booked** or **Registration Closed** without a reload.
- **Activity details**, then **Reserve Your Spot**: the form has the activity details already filled in (name, date, time, location) and asks for Full Name, Student ID, Major, Academic Level, Phone Number and University Email.
- **Reservation Confirmed ✓**: shows the student, activity, date, time, location and a Reservation ID (e.g. `BDY-7K3M9Q`). The student can add it to their calendar (.ics), and a confirmation email is sent.
- **My Reservations**: protected by a one-time code sent to the student's university email. Students see their upcoming and past reservations and their attendance, and can cancel until the activity starts.

**Sports Office admin** (`/admin`)
- **Dashboard**: the month's numbers, a monthly-workflow tracker, today's and the next 7 days' activities, and a "Needs attention" list (unpublished drafts, attendance not yet recorded, activities with low sign-ups that close soon).
- **Monthly Calendar**: a Sunday–Thursday grid where Friday and Saturday are greyed out. Click a day to create an activity, drag an activity to move it, or click one to edit, duplicate, publish/unpublish, close registration, cancel or delete it. Also has **Copy previous month** and **Publish drafts**.
- **Activities**: a filterable table of the month with bulk publish, unpublish, close and cancel.
- **Reservations**: for each activity, the capacity, registered and available seats, the deadline and the status. The student table can be searched and filtered, and from it staff can cancel a reservation, add a student manually (with an optional deadline override) or export to CSV.
- **Attendance**: mark each registered student Present or Absent, or use "Mark all present" or "Mark remaining absent".
- **Reports**: total activities, reservations, available seats, attendance and absences; most-reserved activities; reservations by sport; low registration (under 30%); activities that filled up. Filter by month, activity, sport or date, and export to CSV.

## Business rules: all enforced on the server

| Rule | Where |
|---|---|
| One active reservation per student per activity | `ReservationService.reserve` + partial unique index `ux_reservations_active` |
| Never exceed capacity (applies to staff too) | `ReservationService.reserve`, inside a `BEGIN IMMEDIATE` transaction |
| No reservations after the registration deadline (staff may override explicitly) | `ReservationService.reserve` |
| Deadline = 24 working hours before the start; Friday and Saturday don't count | `shared/calendar.ts → computeRegistrationDeadline` |
| Cancelled and completed activities refuse reservations; drafts are invisible to students | `ReservationService.reserve`, `ActivityService.getPublic` |
| Only staff can manage activities and reservations | `requireAdmin` on `/api/admin/*` |
| Students only see and manage their own reservations | `requireStudent` on `/api/me/*`; ownership check on cancel |
| Activities only Sunday–Thursday, 9:00 AM – 2:00 PM | `shared/validation.ts → scheduleIssues` (server and client) |
| Months stay saved and editable; history is kept | Activities with reservations can't be deleted or unpublished, only cancelled |

**How the deadline is calculated.** The 24 hours are counted backwards from the start time, and time on Fridays and Saturdays doesn't count. In practice the deadline is the same time on the previous working day:

| Activity | Registration closes |
|---|---|
| Monday 10:00 AM | Sunday 10:00 AM |
| Thursday 1:00 PM | Wednesday 1:00 PM |
| **Sunday 10:00 AM** | **Thursday 10:00 AM** (Friday and Saturday skipped) |

The deadline is saved on each activity and recalculated whenever the activity is moved. All times are Badya's wall-clock time (`Africa/Cairo`), whatever time zone the server runs in.

## Getting started

Requirements: **Node.js 22.22 or newer** (developed on Node 25). There's no native build step and no separate database server. The app uses Node's built-in SQLite and runs TypeScript directly.

```bash
npm install
npm run seed      # demo data for last, this and next month (development only; wipes the database)
npm run dev       # API on :4000 + web app on http://localhost:5173
```

- Student site: http://localhost:5173
- Admin: http://localhost:5173/admin. The development staff account is listed in `.env.example`.
- In development, the "My Reservations" sign-in code appears on screen and in the server log, so no email setup is needed.

> **On the campus network**, `registry.npmjs.org` was blocked. If `npm install` hangs, use the official Yarn mirror:
> `npm install --registry=https://registry.yarnpkg.com/`

To test on a phone on the same network, run `npm run dev:client -- --host` and open the address Vite prints.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (auto-restarts on changes) and Vite dev server |
| `npm run seed` | Load demo data. Refuses to run in production |
| `npm test` | 35 automated tests: calendar rules and the HTTP API |
| `npm run typecheck` | TypeScript checks for the server and the client |
| `npm run build` | Type-check, then build the client into `dist/client` |
| `npm start` | Production server: serves the API and the built client on one port |
| `npm run admin -- --email x --password y` | Create a staff account, or reset its password |
| `npm run demo:public` | Share a temporary public HTTPS link with demo data (see below) |

## Temporary public demo link

`npm run demo:public` runs the app from this computer in production mode and opens a public HTTPS link through a [Cloudflare quick tunnel](https://try.cloudflare.com) (`*.trycloudflare.com`, no account needed). It prints the link, the admin email and where to find the admin password.

- It uses its own database (`data/public-demo.db`) and settings (`.env.public-demo`, created on first run with a random admin password). Your development data is not touched.
- It needs `cloudflared`. On Windows it is downloaded into `data/public-demo/` on the first run; elsewhere, [install it](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) first.
- The link works only while this computer is on and awake. Running the command again stops the old link and prints a new one.
- On Windows you can double-click `Start public demo.cmd` instead. Start it from Windows like this, not from a tool session (for example Claude Code) that ends its child processes when it closes.
- `npm run demo:public -- --reset` reloads fresh demo data; `npm run demo:public -- --stop` stops the server and the link.
- No emails are sent (no mail webhook), so students can reserve but cannot sign in to "My Reservations".

This is for showing the project to someone, not for real use. For a permanent link, deploy it to a server (see Production).

## Free hosted demo (Render)

[render.yaml](render.yaml) deploys a permanent demo link on Render's free plan, which works even when your computer is off. In Render: **New → Blueprint**, then pick this repository.

- The admin email is `sports.admin@badyauni.edu.eg`. Render generates the password; find it under the service's **Environment** tab (`ADMIN_PASSWORD`).
- The free plan sleeps after 15 minutes without visitors. The next visit takes about a minute to wake it.
- It starts with only the SAC "Aerobics & Fitness" kick-off (Wednesday 28 October, 11:30 AM): `DEMO_DATA` is `false`, so no sample activities are loaded, and `FEATURED_EVENT=true` puts that one activity back after every restart (`server/src/db/featured-event.ts`; capacity 100 and the 12:30 PM end time are planning values you can change in `/admin`). It also has no persistent disk, so anything added in `/admin` or reserved by visitors disappears when it sleeps or restarts. That's not enough for real students; use a server with a persistent disk (see Production).

## Deploy on Cloudflare (free) with a Google Sheet of all bookings

The app runs entirely on Cloudflare's free plan: the built site is served by Workers Assets, and the API plus the database live in one SQLite-backed Durable Object ([worker/](worker/), [wrangler.jsonc](wrangler.jsonc)). Every booking and cancellation is also written to a Google Sheet (open it in Excel any time), and the admin panel can download all bookings as `.xlsx`.

### 1. Google Sheet (bookings file + email)
1. Create a Google Sheet (any name). Open **Extensions → Apps Script** and paste [integrations/google-sheet/Code.gs](integrations/google-sheet/Code.gs).
2. Replace `SECRET` with a long random string.
3. **Deploy → New deployment → Web app**: *Execute as* **Me**, *Who has access* **Anyone**. Authorize it, then copy the **Web app URL**.
4. Rows appear on a tab named `Reservations`, one per booking (key = Reservation ID). Cancelling updates the same row. **File → Download → Microsoft Excel (.xlsx)** gives the Excel file.

The same script emails the students (sign-in codes and booking confirmations) from your Google account. Free Google accounts allow about 100 recipients per day.

### 2. Cloudflare
```bash
npm install
npx wrangler login                              # one-time, opens the browser
npx wrangler secret put ADMIN_EMAIL             # e.g. sports.admin@badyauni.edu.eg
npx wrangler secret put ADMIN_PASSWORD          # 10+ characters
npx wrangler secret put SHEET_WEBHOOK_URL       # the Web app URL from step 1
npx wrangler secret put SHEET_WEBHOOK_SECRET    # the SECRET you chose in Code.gs
npm run deploy                                  # builds and publishes; prints the https://...workers.dev link
```
Admin panel: `<link>/admin`. Try it locally first with `npm run cf:dev`.

- **Where bookings live:** the Durable Object database is the source of truth. If the Google Sheet is unreachable the booking still succeeds, the update stays queued, and it is retried automatically. **Admin → Reservations → Download Excel** always exports the complete list from the database.
- **Free-plan limits:** 100,000 API requests/day, 100,000 database row writes/day, 5 GB storage. Static files are not counted.
- Change `UNIVERSITY_EMAIL_DOMAINS` and `APP_TIMEZONE` under `vars` in `wrangler.jsonc`.

## Production (own server)

```bash
npm ci
npm run build
# set ADMIN_EMAIL, ADMIN_PASSWORD (10+ characters), SHEET_WEBHOOK_* and other values in .env or the environment
npm start         # http://<host>:4000
```

- Run behind HTTPS. Session cookies are `Secure` in production. If you terminate TLS at a proxy, set `TRUST_PROXY=true`.
- Configure `SHEET_WEBHOOK_URL`/`SHEET_WEBHOOK_SECRET` (see above) so emails are sent. Without them, sign-in codes and confirmations only reach the server log.
- Back up the SQLite file (`DATABASE_PATH`, by default `data/badya.db`, in WAL mode).
- Check `UNIVERSITY_EMAIL_DOMAINS`. It defaults to `badyauni.edu.eg`.

## Architecture

```
shared/           Code used by both sides: calendar and deadline rules, status rules, validation (zod), API types
server/src/
  app.ts          Hono app: security headers and the JSON API under /api (static files: Workers Assets, or index.ts on Node)
  config.ts       Environment configuration (.env supported)
  db/             Database interface + drivers (node:sqlite, Durable Object SQLite), SQL migrations, demo seed
worker/           Cloudflare entry: Worker router + the AppDO Durable Object (wrangler.jsonc)
integrations/     Google Apps Script that fills the bookings Google Sheet
  http/           Routes (public, auth, student, admin) and middleware (sessions, CSRF, errors)
  modules/        Repositories and services: activities, reservations, students, attendance, reports, auth
server/test/      node:test suites (in-memory database, controllable clock)
client/src/
  student/        Weekly Activities, details, reservation form, confirmation, My Reservations
  admin/          Dashboard, calendar, activities, reservations, attendance, reports (loaded separately)
  components/     Dialogs, toasts, form fields, badges, month switcher, brand lockup
  assets/         Student Athlete Committee logo and shield, Badya campus photo (hero and staff sign-in)
  lib/            API client, TanStack Query hooks, calendar helpers, .ics export
```

**Stack:** Hono (Node.js or Cloudflare Workers), SQLite (`node:sqlite` locally, Durable Object storage on Cloudflare), zod, React 19, React Router 8, TanStack Query, Vite, plain CSS design tokens and lucide icons.

**Look:** the colours come from the Student Athlete Committee shield: navy `#0a3466`, green `#026e5f` and sand `#e5bb85` (`client/src/styles/tokens.css`). Page titles use Oswald, which matches the logo's condensed wordmark, and body text uses Plus Jakarta Sans.

**Security:** scrypt password hashing. Sessions use random tokens that are stored only as SHA-256 hashes, with separate HttpOnly SameSite cookies for staff and students. Login and code requests are rate-limited. State-changing requests must be JSON, which blocks CSRF. Helmet sets security headers. Exported CSV cells are protected against formula injection.

### Database

| Table | Purpose |
|---|---|
| `users` | id, name, email, role (`admin` / `student`), password hash (staff only) |
| `students` | user_id, student_id (university ID), major, academic_level, phone, email |
| `activities` | name, category, description, date, start_time, end_time, location, coach, capacity, status, registration_deadline, created_at, updated_at |
| `reservations` | activity_id, student_id, code (public Reservation ID), reservation_status, source (student/admin), created_at, cancelled_at |
| `attendance` | activity_id, student_id, attendance_status (`present` / `absent`), marked_at, marked_by |
| `sessions`, `login_codes` | Staff and student sign-in |

Statuses: an admin sets **Draft, Published, Registration Closed, Completed or Cancelled**. **Full**, **Registration Closed** (deadline passed) and **Completed** (end time passed) are worked out live from reservations and the clock, so they never go stale.

**Scaling further:** the data layer is plain SQL behind repositories, so moving to PostgreSQL only touches `server/src/db` and the repositories. The in-memory rate limiter would also need to move to Redis before running more than one server instance.
