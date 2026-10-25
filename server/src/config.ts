import { existsSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_REGISTRATION_LEAD_HOURS } from '../../shared/calendar.ts';

export const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

const envFile = path.join(ROOT_DIR, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function str(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Environment variable ${name} must be a number`);
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function list(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

// Safe by default: without NODE_ENV the server behaves as production.
// `npm run dev` and `npm run seed` opt into development explicitly.
const nodeEnv = str('NODE_ENV', 'production');
const isProduction = nodeEnv === 'production';

export const config = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',
  port: int('PORT', 4000),
  host: str('HOST', isProduction ? '0.0.0.0' : '127.0.0.1'),
  databasePath: path.resolve(ROOT_DIR, str('DATABASE_PATH', 'data/badya.db')),
  timeZone: str('APP_TIMEZONE', 'Africa/Cairo'),
  registrationLeadHours: int('REGISTRATION_LEAD_HOURS', DEFAULT_REGISTRATION_LEAD_HOURS),
  emailDomains: list('UNIVERSITY_EMAIL_DOMAINS', ['badyauni.edu.eg']),
  cookieSecure: bool('COOKIE_SECURE', isProduction),
  trustProxy: bool('TRUST_PROXY', false),
  /** Hosted demos: load demo data on start-up whenever the database has no activities. */
  demoData: bool('DEMO_DATA', false),
  /** Add the SAC kick-off activity on start-up when it is missing (for hosts that lose their database on restart). */
  featuredEvent: bool('FEATURED_EVENT', false),
  /** Development convenience: return one-time sign-in codes in the API response. Never on in production. */
  exposeDevCodes: !isProduction && bool('EXPOSE_DEV_CODES', true),
  adminSessionDays: int('ADMIN_SESSION_DAYS', 7),
  studentSessionDays: int('STUDENT_SESSION_DAYS', 30),
  bootstrapAdmin: {
    name: str('ADMIN_NAME', 'Sports Office Admin'),
    email: process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? '',
    password: process.env.ADMIN_PASSWORD ?? '',
  },
  mail: {
    from: str('MAIL_FROM', 'SAC Sports Hub <no-reply@badyauni.edu.eg>'),
    smtpHost: process.env.SMTP_HOST?.trim() ?? '',
    smtpPort: int('SMTP_PORT', 587),
    smtpSecure: bool('SMTP_SECURE', false),
    smtpUser: process.env.SMTP_USER ?? '',
    smtpPass: process.env.SMTP_PASS ?? '',
  },
  clientDistDir: path.join(ROOT_DIR, 'dist', 'client'),
};

export type AppConfig = typeof config;
