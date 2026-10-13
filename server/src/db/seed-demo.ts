import { computeRegistrationDeadline, isWorkingDay } from '../../../shared/calendar.ts';
import { MAJOR_SUGGESTIONS } from '../../../shared/constants.ts';
import {
  addDays,
  addMinutesLocal,
  addMonths,
  dayOfWeek,
  datesOfMonth,
  minutesToTime,
  nowIn,
  toLocalDateTime,
  zonedToInstant,
  type LocalDateTime,
} from '../../../shared/dates.ts';
import { createContext, ensureAdmin } from '../bootstrap.ts';
import type { AppContext } from '../context.ts';
import { reservationCode } from '../lib/security.ts';
import { AuthService } from '../modules/auth/auth.service.ts';

interface Template {
  name: string;
  category: string;
  description: string;
  startTime: string;
  endTime: string;
  location: string;
  coach: string;
  capacity: number;
}

/** The weekly schedule the demo months are built from (0 = Sunday … 4 = Thursday). */
const WEEKLY: Record<number, Template[]> = {
  0: [
    {
      name: 'Tennis',
      category: 'Tennis',
      description: 'Beginner-friendly tennis session covering forehand, backhand and serve technique. Rackets and balls are provided.',
      startTime: '10:00',
      endTime: '11:00',
      location: 'Sports Court',
      coach: 'Coach Karim Adel',
      capacity: 12,
    },
    {
      name: 'Football Training',
      category: 'Football',
      description: 'Five-a-side drills followed by a friendly match. Wear sports shoes and bring water.',
      startTime: '12:00',
      endTime: '13:30',
      location: 'Main Football Field',
      coach: 'Coach Mahmoud Samir',
      capacity: 22,
    },
  ],
  1: [
    {
      name: 'Morning Yoga',
      category: 'Yoga',
      description: 'A calm flow to improve flexibility and focus before lectures. Mats are available at the hall.',
      startTime: '09:30',
      endTime: '10:30',
      location: 'Indoor Sports Hall',
      coach: 'Coach Nada Fawzy',
      capacity: 20,
    },
    {
      name: 'Basketball',
      category: 'Basketball',
      description: 'Shooting, passing and half-court games for all levels.',
      startTime: '11:00',
      endTime: '12:30',
      location: 'Indoor Sports Hall',
      coach: 'Coach Omar Tarek',
      capacity: 16,
    },
  ],
  2: [
    {
      name: 'Padel',
      category: 'Padel',
      description: 'Doubles padel with rotating partners. Rackets are provided; please bring indoor shoes.',
      startTime: '10:00',
      endTime: '11:30',
      location: 'Padel Court',
      coach: 'Coach Hany Mostafa',
      capacity: 8,
    },
    {
      name: 'Table Tennis',
      category: 'Table Tennis',
      description: 'Open table tennis ladder — play as many games as you like.',
      startTime: '12:00',
      endTime: '13:00',
      location: 'Student Lounge',
      coach: 'Coach Reem Ashraf',
      capacity: 10,
    },
  ],
  3: [
    {
      name: 'Swimming',
      category: 'Swimming',
      description: 'Lane swimming with technique tips. Swim cap required.',
      startTime: '09:00',
      endTime: '10:00',
      location: 'Swimming Pool',
      coach: 'Coach Mona Ibrahim',
      capacity: 15,
    },
    {
      name: 'Volleyball',
      category: 'Volleyball',
      description: 'Mixed volleyball games — no experience needed.',
      startTime: '11:00',
      endTime: '12:30',
      location: 'Sports Court',
      coach: 'Coach Tamer Nabil',
      capacity: 14,
    },
    {
      name: 'Chess Club',
      category: 'Chess',
      description: 'Casual games plus a short puzzle challenge. Boards and clocks provided.',
      startTime: '13:00',
      endTime: '14:00',
      location: 'Student Lounge',
      coach: 'Mr. Ahmed Lotfy',
      capacity: 16,
    },
  ],
  4: [
    {
      name: 'Fitness Bootcamp',
      category: 'Fitness',
      description: 'High-energy circuit training. Suitable for all fitness levels.',
      startTime: '09:30',
      endTime: '10:30',
      location: 'Fitness Center',
      coach: 'Coach Yasmin Hassan',
      capacity: 18,
    },
    {
      name: 'Running Club',
      category: 'Running',
      description: 'Group run around campus at a comfortable pace, followed by stretching.',
      startTime: '12:00',
      endTime: '13:00',
      location: 'Main Football Field',
      coach: 'Coach Sherif Gamal',
      capacity: 25,
    },
    {
      name: 'FIFA Tournament',
      category: 'E-Sports',
      description: 'Knock-out FIFA tournament on the big screen. Controllers provided.',
      startTime: '13:00',
      endTime: '14:00',
      location: 'Student Lounge',
      coach: 'Student Activities Team',
      capacity: 12,
    },
  ],
};

const FIRST_NAMES = [
  'Ahmed', 'Mohamed', 'Omar', 'Youssef', 'Karim', 'Mostafa', 'Ali', 'Hassan', 'Mahmoud', 'Khaled', 'Tarek', 'Amr',
  'Ziad', 'Hamza', 'Adham', 'Seif', 'Marwan', 'Nour', 'Sara', 'Mariam', 'Salma', 'Farida', 'Hana', 'Laila', 'Malak',
  'Jana', 'Rana', 'Nada', 'Yasmin', 'Habiba', 'Aya', 'Menna', 'Dina', 'Reem', 'Lina', 'Rawan',
];
const LAST_NAMES = [
  'Hassan', 'Mahmoud', 'Ibrahim', 'Adel', 'Samir', 'Fawzy', 'Tarek', 'Mostafa', 'Nabil', 'Gamal', 'Ashraf', 'Lotfy',
  'Saeed', 'Fathy', 'Kamal', 'Hamdy', 'Ragab', 'Zaki', 'Farouk', 'Helmy', 'Mansour', 'Salem', 'Osman', 'Youssef',
];
const LEVEL_BY_YEAR: Record<number, string> = { 2025: 'Level 1', 2024: 'Level 2', 2023: 'Level 3', 2022: 'Level 4' };

/** Small deterministic PRNG so every run produces the same demo data. */
function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function runSeed(args: string[]): Promise<void> {
  const ctx = createContext();
  if (ctx.config.isProduction && !args.includes('--force')) {
    console.error('Refusing to load demo data in production (it deletes existing data). Pass --force if you really mean it.');
    process.exit(1);
  }
  await loadDemoData(ctx);
  ctx.db.close();
}

/** Replaces all data with demo data for the previous, current and next month. */
export async function loadDemoData(ctx: AppContext): Promise<void> {
  const { db, config } = ctx;
  const random = mulberry32(20260906);
  const randInt = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  const shuffle = <T>(items: T[]) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const tz = config.timeZone;
  const now = nowIn(tz);
  const today = now.slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const toInstant = (value: LocalDateTime) => zonedToInstant(value, tz).toISOString();
  const nowIso = new Date().toISOString();
  const domain = config.emailDomains[0] ?? 'badyauni.edu.eg';

  db.exec(`
    DELETE FROM attendance; DELETE FROM reservations; DELETE FROM activities;
    DELETE FROM login_codes; DELETE FROM sessions; DELETE FROM students; DELETE FROM users;
  `);
  const auth = new AuthService(ctx);
  await ensureAdmin(auth, config, ctx.log);
  const adminId = db.get<{ id: number }>(`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`)!.id;

  const summary = db.transaction(() => {
    // ------------------------------------------------------------ students
    const studentIds: number[] = [];
    const usedEmails = new Set<string>();
    for (let i = 0; i < 64; i++) {
      const first = FIRST_NAMES[i % FIRST_NAMES.length];
      const last = pick(LAST_NAMES);
      let email = `${first}.${last}@${domain}`.toLowerCase();
      for (let n = 2; usedEmails.has(email); n++) email = `${first}.${last}${n}@${domain}`.toLowerCase();
      usedEmails.add(email);
      const year = pick([2022, 2023, 2024, 2025]);
      const universityId = `${year}${String(1000 + i * 37 + randInt(0, 30)).padStart(4, '0')}`;
      const phone = `${pick(['010', '011', '012', '015'])}${String(randInt(0, 99_999_999)).padStart(8, '0')}`;
      const userId = db.run(
        `INSERT INTO users (name, email, role, created_at, updated_at) VALUES (?, ?, 'student', ?, ?)`,
        [`${first} ${last}`, email, nowIso, nowIso],
      ).lastInsertRowid;
      studentIds.push(
        db.run(
          `INSERT INTO students (user_id, student_id, major, academic_level, phone, email, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [userId, universityId, pick(MAJOR_SUGGESTIONS), LEVEL_BY_YEAR[year], phone, email, nowIso, nowIso],
        ).lastInsertRowid,
      );
    }

    // ---------------------------------------------------------- activities
    interface Seeded {
      id: number;
      date: string;
      template: Template;
      status: string;
      deadline: string;
    }
    const seeded: Seeded[] = [];
    const publishUntil = addDays(today, 15);
    for (const offset of [-1, 0, 1]) {
      const month = addMonths(currentMonth, offset);
      for (const date of datesOfMonth(month)) {
        if (!isWorkingDay(date)) continue;
        for (const template of WEEKLY[dayOfWeek(date)]) {
          const status = offset < 1 || date < publishUntil ? 'published' : 'draft';
          const deadline = computeRegistrationDeadline(date, template.startTime, config.registrationLeadHours);
          const id = db.run(
            `INSERT INTO activities (name, category, description, date, start_time, end_time, location, coach, capacity,
                                     status, registration_deadline, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              template.name, template.category, template.description, date, template.startTime, template.endTime,
              template.location, template.coach, template.capacity, status, deadline, adminId, nowIso, nowIso,
            ],
          ).lastInsertRowid;
          seeded.push({ id, date, template, status, deadline });
        }
      }
    }

    // A few cancellations so the history looks real.
    const cancel = (predicate: (a: Seeded) => boolean) => {
      const target = seeded.find(predicate);
      if (!target) return;
      target.status = 'cancelled';
      db.run(`UPDATE activities SET status = 'cancelled' WHERE id = ?`, [target.id]);
    };
    cancel((a) => a.date < today && a.template.name === 'Running Club' && a.date.slice(0, 7) !== currentMonth);
    cancel((a) => a.date > addDays(today, 7) && a.status === 'published' && a.template.name === 'Chess Club');

    // -------------------------------------------------------- reservations
    const firstUpcoming = (name: string) =>
      seeded.find((a) => a.template.name === name && a.status === 'published' && a.deadline > now);
    const showcase = new Map<number, number>();
    const full = firstUpcoming('Padel');
    if (full) showcase.set(full.id, full.template.capacity); // Fully Booked
    const tennis = firstUpcoming('Tennis');
    if (tennis) showcase.set(tennis.id, 4); // "8 seats available"
    const swimming = firstUpcoming('Swimming');
    if (swimming) showcase.set(swimming.id, 2); // low registration

    // The latest day with finished activities keeps its attendance open for the demo.
    const finished = seeded.filter((a) => toLocalDateTime(a.date, a.template.endTime) <= now && a.status !== 'cancelled');
    const pendingAttendanceDate = finished.length ? finished[finished.length - 1].date : null;

    const usedCodes = new Set<string>();
    const uniqueCode = () => {
      let code = reservationCode();
      while (usedCodes.has(code)) code = reservationCode();
      usedCodes.add(code);
      return code;
    };

    let reservations = 0;
    let attendance = 0;
    for (const activity of seeded) {
      if (activity.status !== 'published') continue;
      const isPast = toLocalDateTime(activity.date, activity.template.endTime) <= now;
      const daysAway = Math.round((Date.parse(activity.date) - Date.parse(today)) / 86_400_000);
      const capacity = activity.template.capacity;
      let count = showcase.get(activity.id);
      if (count === undefined) {
        const share = isPast ? 0.55 + random() * 0.45 : daysAway <= 14 ? 0.15 + random() * 0.6 : random() * 0.25;
        count = Math.min(capacity, Math.round(capacity * share));
      }

      const participants = shuffle(studentIds).slice(0, count + 2);
      participants.forEach((studentId, index) => {
        const isCancelled = index >= count; // the extra two cancelled their spot
        if (isCancelled && random() < 0.6) return;
        let createdLocal = `${addDays(activity.date, -randInt(2, 9))}T${minutesToTime(randInt(8 * 60, 22 * 60))}`;
        if (createdLocal >= activity.deadline) createdLocal = addMinutesLocal(activity.deadline, -randInt(30, 900));
        if (createdLocal >= now) createdLocal = addMinutesLocal(now, -randInt(20, 2000));
        const byAdmin = !isCancelled && random() < 0.04;
        let cancelledLocal = addMinutesLocal(createdLocal, randInt(60, 1440));
        if (cancelledLocal > now) cancelledLocal = now;
        db.run(
          `INSERT INTO reservations (code, activity_id, student_id, reservation_status, source, created_by, created_at,
                                     cancelled_at, cancelled_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uniqueCode(),
            activity.id,
            studentId,
            isCancelled ? 'cancelled' : 'confirmed',
            byAdmin ? 'admin' : 'student',
            byAdmin ? adminId : null,
            toInstant(createdLocal),
            isCancelled ? toInstant(cancelledLocal) : null,
            isCancelled ? 'student' : null,
          ],
        );
        if (isCancelled) return;
        reservations++;
        if (isPast && activity.date !== pendingAttendanceDate) {
          db.run(
            `INSERT INTO attendance (activity_id, student_id, attendance_status, marked_at, marked_by) VALUES (?, ?, ?, ?, ?)`,
            [
              activity.id,
              studentId,
              random() < 0.82 ? 'present' : 'absent',
              toInstant(toLocalDateTime(activity.date, activity.template.endTime)),
              adminId,
            ],
          );
          attendance++;
        }
      });
    }
    return { students: studentIds.length, activities: seeded.length, reservations, attendance };
  });

  ctx.log.info(
    `Demo data loaded for ${addMonths(currentMonth, -1)} → ${addMonths(currentMonth, 1)}: ` +
      `${summary.activities} activities, ${summary.students} students, ` +
      `${summary.reservations} reservations, ${summary.attendance} attendance records.`,
  );
}
