import type { SessionUser } from '../../../../shared/types.ts';
import { timestamp, type AppContext } from '../../context.ts';
import { AppError, badRequest } from '../../lib/errors.ts';
import {
  dummyPasswordCheck,
  hashPassword,
  randomToken,
  safeEqual,
  sha256,
  sixDigitCode,
  verifyPassword,
} from '../../lib/security.ts';
import { StudentRepository, toStudentProfile } from '../students/students.repository.ts';
import type { AuthSession } from './auth.types.ts';

export type SessionRole = 'admin' | 'student';

export const SESSION_COOKIES: Record<SessionRole, string> = {
  admin: 'badya_admin_session',
  student: 'badya_student_session',
};

const CODE_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const TOUCH_INTERVAL_MS = 5 * 60_000;

interface SessionJoinRow {
  session_id: string;
  last_seen_at: string;
  user_id: number;
  name: string;
  email: string;
  role: SessionRole;
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
  user: SessionUser;
}

export class AuthService {
  private readonly ctx: AppContext;
  private readonly students: StudentRepository;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.students = new StudentRepository(ctx.db);
  }

  // ------------------------------------------------------------- sessions

  resolveSession(token: string, role: SessionRole): AuthSession | null {
    const now = this.ctx.clock.now();
    const row = this.ctx.db.get<SessionJoinRow>(
      `SELECT s.id AS session_id, s.last_seen_at, u.id AS user_id, u.name, u.email, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ? AND u.role = ?`,
      [sha256(token), now.toISOString(), role],
    );
    if (!row) return null;
    if (now.getTime() - Date.parse(row.last_seen_at) > TOUCH_INTERVAL_MS) {
      this.ctx.db.run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [now.toISOString(), row.session_id]);
    }
    return { sessionId: row.session_id, user: this.sessionUser(row.user_id, row.name, row.email, row.role) };
  }

  destroySession(sessionId: string): void {
    this.ctx.db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
  }

  purgeExpired(): void {
    const now = timestamp(this.ctx);
    this.ctx.db.run('DELETE FROM sessions WHERE expires_at <= ?', [now]);
    this.ctx.db.run('DELETE FROM login_codes WHERE expires_at <= ?', [now]);
  }

  private issueSession(userId: number, name: string, email: string, role: SessionRole): IssuedSession {
    const token = randomToken();
    const now = this.ctx.clock.now();
    const days = role === 'admin' ? this.ctx.config.adminSessionDays : this.ctx.config.studentSessionDays;
    const expiresAt = new Date(now.getTime() + days * 86_400_000);
    this.ctx.db.run(
      'INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
      [sha256(token), userId, now.toISOString(), expiresAt.toISOString(), now.toISOString()],
    );
    return { token, expiresAt, user: this.sessionUser(userId, name, email, role) };
  }

  private sessionUser(id: number, name: string, email: string, role: SessionRole): SessionUser {
    const student = role === 'student' ? this.students.findByUserId(id) : undefined;
    return { id, name, email, role, student: student ? toStudentProfile(student) : null };
  }

  // ---------------------------------------------------------------- admin

  async loginAdmin(email: string, password: string): Promise<IssuedSession> {
    const user = this.ctx.db.get<{ id: number; name: string; email: string; password_hash: string | null }>(
      `SELECT id, name, email, password_hash FROM users WHERE email = ? AND role = 'admin'`,
      [email],
    );
    if (!user) await dummyPasswordCheck(password);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
    }
    this.ctx.db.run('UPDATE users SET last_login_at = ? WHERE id = ?', [timestamp(this.ctx), user.id]);
    return this.issueSession(user.id, user.name, user.email, 'admin');
  }

  /** Creates the admin account, or resets its password if the email already exists. */
  async upsertAdmin(values: { name: string; email: string; password: string }): Promise<'created' | 'updated'> {
    if (values.password.length < 10) throw new Error('Admin passwords must be at least 10 characters long.');
    const passwordHash = await hashPassword(values.password);
    const now = timestamp(this.ctx);
    const existing = this.ctx.db.get<{ id: number; role: string }>('SELECT id, role FROM users WHERE email = ?', [values.email]);
    if (existing) {
      if (existing.role !== 'admin') throw new Error(`${values.email} belongs to a student account.`);
      this.ctx.db.run('UPDATE users SET name = ?, password_hash = ?, updated_at = ? WHERE id = ?', [
        values.name,
        passwordHash,
        now,
        existing.id,
      ]);
      this.ctx.db.run('DELETE FROM sessions WHERE user_id = ?', [existing.id]);
      return 'updated';
    }
    this.ctx.db.run(
      `INSERT INTO users (name, email, role, password_hash, created_at, updated_at) VALUES (?, ?, 'admin', ?, ?, ?)`,
      [values.name, values.email, passwordHash, now, now],
    );
    return 'created';
  }

  adminCount(): number {
    return this.ctx.db.get<{ total: number }>(`SELECT COUNT(*) AS total FROM users WHERE role = 'admin'`)!.total;
  }

  // -------------------------------------------------------------- student

  /**
   * Emails a one-time code that unlocks "My Reservations". The response is
   * the same whether or not the email is known, so it can't be used to
   * discover who has reservations.
   */
  async requestStudentCode(email: string): Promise<{ devCode?: string }> {
    const student = this.students.findByEmail(email);
    if (!student) return {};

    const code = sixDigitCode();
    const now = this.ctx.clock.now();
    this.ctx.db.transaction(() => {
      this.ctx.db.run('UPDATE login_codes SET consumed_at = ? WHERE email = ? AND consumed_at IS NULL', [now.toISOString(), email]);
      this.ctx.db.run(
        'INSERT INTO login_codes (email, code_hash, attempts, expires_at, created_at) VALUES (?, ?, 0, ?, ?)',
        [email, sha256(`${email}:${code}`), new Date(now.getTime() + CODE_TTL_MINUTES * 60_000).toISOString(), now.toISOString()],
      );
    });

    await this.ctx.mailer
      .send({
        to: email,
        subject: `Your sign-in code: ${code}`,
        text: [
          `Hi ${student.name},`,
          '',
          `Your code for "My Reservations" is: ${code}`,
          '',
          `It expires in ${CODE_TTL_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`,
          '',
          'SAC Sports Hub – Sports Office',
        ].join('\n'),
      })
      .catch((error: unknown) => this.ctx.log.error('Failed to send sign-in code', { error: String(error) }));

    return this.ctx.config.exposeDevCodes ? { devCode: code } : {};
  }

  verifyStudentCode(email: string, code: string): IssuedSession {
    const now = timestamp(this.ctx);
    const row = this.ctx.db.get<{ id: number; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM login_codes
       WHERE email = ? AND consumed_at IS NULL AND expires_at > ?
       ORDER BY id DESC LIMIT 1`,
      [email, now],
    );
    if (!row) throw badRequest('This code has expired. Request a new one.', { code: 'Code expired' }, 'CODE_EXPIRED');
    if (row.attempts >= MAX_CODE_ATTEMPTS) {
      throw badRequest('Too many incorrect attempts. Request a new code.', { code: 'Too many attempts' }, 'CODE_LOCKED');
    }
    if (!safeEqual(row.code_hash, sha256(`${email}:${code}`))) {
      this.ctx.db.run('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      throw badRequest('That code is not correct.', { code: 'Incorrect code' }, 'CODE_INVALID');
    }
    this.ctx.db.run('UPDATE login_codes SET consumed_at = ? WHERE id = ?', [now, row.id]);

    const student = this.students.findByEmail(email);
    if (!student) throw badRequest('No reservations were found for this email.', undefined, 'CODE_INVALID');
    return this.issueSession(student.user_id, student.name, student.email, 'student');
  }
}
