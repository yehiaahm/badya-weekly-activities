import { DEFAULT_REGISTRATION_LEAD_HOURS } from '../../shared/calendar.ts';

export type Env = Record<string, string | undefined>;

/**
 * Runtime-neutral configuration: reads only from the `env` it is given, so it works
 * on Node (process.env) and on Cloudflare Workers (the `env` bindings) alike.
 */
export function buildConfig(env: Env) {
  const str = (name: string, fallback: string): string => {
    const value = env[name]?.trim();
    return value ? value : fallback;
  };
  const int = (name: string, fallback: number): number => {
    const raw = env[name];
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`Environment variable ${name} must be a number`);
    return value;
  };
  const bool = (name: string, fallback: boolean): boolean => {
    const raw = env[name]?.trim().toLowerCase();
    if (!raw) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(raw);
  };
  const list = (name: string, fallback: string[]): string[] => {
    const raw = env[name];
    if (raw === undefined) return fallback;
    return raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  };

  // Safe by default: without NODE_ENV the server behaves as production.
  // `npm run dev` and `npm run seed` opt into development explicitly.
  const nodeEnv = str('NODE_ENV', 'production');
  const isProduction = nodeEnv === 'production';

  return {
    nodeEnv,
    isProduction,
    isTest: nodeEnv === 'test',
    port: int('PORT', 4000),
    host: str('HOST', isProduction ? '0.0.0.0' : '127.0.0.1'),
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
      email: env.ADMIN_EMAIL?.trim().toLowerCase() ?? '',
      password: env.ADMIN_PASSWORD ?? '',
    },
    mail: {
      from: str('MAIL_FROM', 'SAC Sports Hub <no-reply@badyauni.edu.eg>'),
    },
    /** Google Apps Script web app that appends reservations to a Google Sheet and (optionally) sends email. */
    sheet: {
      webhookUrl: env.SHEET_WEBHOOK_URL?.trim() ?? '',
      secret: env.SHEET_WEBHOOK_SECRET ?? '',
    },
  };
}

export type AppConfig = ReturnType<typeof buildConfig>;
