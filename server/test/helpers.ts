import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { zonedToInstant } from '../../shared/dates.ts';
import type { StudentDetailsInput } from '../../shared/validation.ts';
import { createApp } from '../src/app.ts';
import { config } from '../src/config.ts';
import type { AppContext, Clock } from '../src/context.ts';
import { Database } from '../src/db/database.ts';
import { migrate } from '../src/db/migrate.ts';
import { silentLogger } from '../src/lib/logger.ts';
import { MemoryMailer } from '../src/lib/mailer.ts';

export const TIME_ZONE = 'Africa/Cairo';
export const ADMIN = { name: 'Test Admin', email: 'admin@badyauni.edu.eg', password: 'correct-horse-battery' };

/** A clock frozen at a university wall-clock time, movable by the test. */
export class TestClock implements Clock {
  private current = new Date();

  constructor(local: string) {
    this.set(local);
  }

  set(local: string): void {
    this.current = zonedToInstant(local, TIME_ZONE);
  }

  now(): Date {
    return this.current;
  }
}

export function studentDetails(n: number, overrides: Partial<StudentDetailsInput> = {}): StudentDetailsInput {
  const id = String(n).padStart(4, '0');
  return {
    fullName: `Student Number ${n}`,
    studentId: `2025${id}`,
    major: 'Computer Science',
    academicLevel: 'Level 1',
    phone: `0100000${id}`,
    email: `student${n}@badyauni.edu.eg`,
    ...overrides,
  };
}

interface Response<T> {
  status: number;
  body: T;
  headers: Headers;
}

/** Minimal HTTP client that keeps cookies, like a browser tab. */
export class HttpClient {
  private readonly base: string;
  private readonly cookies = new Map<string, string>();

  constructor(base: string) {
    this.base = base;
  }

  async request<T = any>(method: string, path: string, body?: unknown, contentType = 'application/json'): Promise<Response<T>> {
    const headers: Record<string, string> = {};
    if (method !== 'GET') headers['Content-Type'] = contentType;
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const response = await fetch(`${this.base}/api${path}`, {
      method,
      headers,
      body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body ?? {}),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const [name, ...rest] = pair.split('=');
      const value = rest.join('=');
      if (!value || /expires=Thu, 01 Jan 1970/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      // CSV and other non-JSON bodies stay as text.
    }
    return { status: response.status, body: parsed as T, headers: response.headers };
  }

  get<T = any>(path: string) {
    return this.request<T>('GET', path);
  }

  post<T = any>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }

  patch<T = any>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body);
  }

  put<T = any>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, body);
  }

  delete<T = any>(path: string) {
    return this.request<T>('DELETE', path);
  }

  async loginAdmin(): Promise<void> {
    const response = await this.post('/auth/admin/login', { email: ADMIN.email, password: ADMIN.password });
    if (response.status !== 200) throw new Error(`Admin login failed: ${response.status}`);
  }
}

/** Boots the real Express app on a random port with an in-memory database. */
export async function startTestApp(localNow = '2026-09-28T09:00') {
  const db = new Database(':memory:');
  migrate(db);
  const clock = new TestClock(localNow);
  const mailer = new MemoryMailer();
  const ctx: AppContext = {
    db,
    clock,
    mailer,
    log: silentLogger,
    config: {
      ...config,
      nodeEnv: 'test',
      isProduction: false,
      isTest: true,
      timeZone: TIME_ZONE,
      registrationLeadHours: 24,
      emailDomains: ['badyauni.edu.eg'],
      exposeDevCodes: true,
      cookieSecure: false,
      trustProxy: false,
    },
  };
  const { app, services } = createApp(ctx);
  await services.auth.upsertAdmin(ADMIN);

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  /** Creates a published activity through the service layer. */
  const activity = (values: Partial<Record<string, unknown>> = {}) =>
    services.activities.create(
      {
        name: 'Tennis',
        category: 'Tennis',
        description: '',
        date: '2026-09-30',
        startTime: '10:00',
        endTime: '11:00',
        location: 'Sports Court',
        coach: 'Coach Karim',
        capacity: 10,
        status: 'published',
        ...values,
      },
      null,
    );

  return {
    ctx,
    db,
    clock,
    mailer,
    services,
    activity,
    client: () => new HttpClient(base),
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof startTestApp>>;
