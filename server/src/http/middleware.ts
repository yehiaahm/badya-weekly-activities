import type { Context, ErrorHandler, MiddlewareHandler, NotFoundHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppConfig } from '../config-base.ts';
import { AppError, badRequest, unauthorized } from '../lib/errors.ts';
import type { Logger } from '../lib/logger.ts';
import { SESSION_COOKIES, type AuthService, type IssuedSession, type SessionRole } from '../modules/auth/auth.service.ts';
import type { AuthSession } from '../modules/auth/auth.types.ts';

/** Per-request values set by the middleware below. */
export interface AppVariables {
  /** Staff session (admin cookie). */
  admin: AuthSession | null;
  /** Verified-student session (student cookie). */
  student: AuthSession | null;
  /** Parsed JSON body (POST/PUT/PATCH), undefined when empty. */
  body: any;
  /** Best-known client address, used for rate limiting. */
  ip: string;
}

export type AppEnv = { Variables: AppVariables };
export type AppContextHono = Context<AppEnv>;

const MAX_BODY_BYTES = 100 * 1024;

/** Resolves the staff and student sessions (separate cookies, so both can coexist in one browser). */
export function sessionMiddleware(auth: AuthService): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const adminToken = getCookie(c, SESSION_COOKIES.admin);
    const studentToken = getCookie(c, SESSION_COOKIES.student);
    c.set('admin', adminToken ? auth.resolveSession(adminToken, 'admin') : null);
    c.set('student', studentToken ? auth.resolveSession(studentToken, 'student') : null);
    await next();
  };
}

/**
 * Client address for rate limiting: Cloudflare's header, or the first X-Forwarded-For hop
 * when behind a trusted proxy, otherwise the socket address (Node).
 */
export function clientIpMiddleware(config: AppConfig): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const cloudflare = c.req.header('cf-connecting-ip');
    const forwarded = config.trustProxy ? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() : undefined;
    const socket = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress;
    c.set('ip', cloudflare ?? forwarded ?? socket ?? 'unknown');
    await next();
  };
}

/**
 * CSRF defence: state-changing requests must be JSON. Browsers can't send a
 * cross-site JSON request with cookies without a CORS preflight, which this
 * API never approves. Session cookies are also SameSite=Lax.
 * Also parses the (size-limited) JSON body once for all handlers.
 */
export const jsonBody: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
    const type = (c.req.header('content-type') ?? '').toLowerCase();
    if (!type.startsWith('application/json')) throw badRequest('Requests must be sent as JSON.', undefined, 'UNSUPPORTED_MEDIA_TYPE');
    const text = await c.req.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
    try {
      c.set('body', text ? JSON.parse(text) : undefined);
    } catch {
      throw badRequest('The request body is not valid JSON.', undefined, 'INVALID_JSON');
    }
  }
  await next();
};

export const noStore: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.res.headers.set('Cache-Control', 'no-store');
};

export function setSessionCookie(c: AppContextHono, config: AppConfig, role: SessionRole, session: IssuedSession): void {
  setCookie(c, SESSION_COOKIES[role], session.token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.cookieSecure,
    path: '/',
    expires: session.expiresAt,
  });
}

export function clearSessionCookie(c: AppContextHono, config: AppConfig, role: SessionRole): void {
  deleteCookie(c, SESSION_COOKIES[role], { httpOnly: true, sameSite: 'Lax', secure: config.cookieSecure, path: '/' });
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('admin')) throw unauthorized('Please sign in with a staff account.');
  await next();
};

export const requireStudent: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('student')?.user.student) throw unauthorized('Verify your university email to see your reservations.');
  await next();
};

export function adminSession(c: AppContextHono): AuthSession {
  const session = c.get('admin');
  if (!session) throw unauthorized();
  return session;
}

export function studentSession(c: AppContextHono): AuthSession & { user: { student: NonNullable<AuthSession['user']['student']> } } {
  const session = c.get('student');
  if (!session?.user.student) throw unauthorized('Verify your university email to see your reservations.');
  return session as AuthSession & { user: { student: NonNullable<AuthSession['user']['student']> } };
}

export function queryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  return undefined;
}

export const apiNotFound: NotFoundHandler = (c) => c.json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } }, 404);

export function errorHandler(log: Logger): ErrorHandler {
  return (error, c) => {
    if (error instanceof AppError) {
      return c.json({ error: { code: error.code, message: error.message, fields: error.fields } }, error.status as 400);
    }
    log.error(`Unhandled error on ${c.req.method} ${c.req.path}`, {
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } }, 500);
  };
}
