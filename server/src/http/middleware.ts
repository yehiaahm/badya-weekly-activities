import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import type { AppConfig } from '../config.ts';
import { AppError, badRequest, unauthorized } from '../lib/errors.ts';
import type { Logger } from '../lib/logger.ts';
import { SESSION_COOKIES, type AuthService, type IssuedSession, type SessionRole } from '../modules/auth/auth.service.ts';
import type { AuthSession } from '../modules/auth/auth.types.ts';

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name || name in cookies) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

/** Resolves the staff and student sessions (separate cookies, so both can coexist in one browser). */
export function sessionMiddleware(auth: AuthService): RequestHandler {
  return (req, _res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    const adminToken = cookies[SESSION_COOKIES.admin];
    const studentToken = cookies[SESSION_COOKIES.student];
    req.admin = adminToken ? auth.resolveSession(adminToken, 'admin') : null;
    req.student = studentToken ? auth.resolveSession(studentToken, 'student') : null;
    next();
  };
}

export function setSessionCookie(res: Response, config: AppConfig, role: SessionRole, session: IssuedSession): void {
  res.cookie(SESSION_COOKIES[role], session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    expires: session.expiresAt,
  });
}

export function clearSessionCookie(res: Response, config: AppConfig, role: SessionRole): void {
  res.clearCookie(SESSION_COOKIES[role], { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' });
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.admin) throw unauthorized('Please sign in with a staff account.');
  next();
};

export const requireStudent: RequestHandler = (req, _res, next) => {
  if (!req.student?.user.student) throw unauthorized('Verify your university email to see your reservations.');
  next();
};

export function adminSession(req: Request): AuthSession {
  if (!req.admin) throw unauthorized();
  return req.admin;
}

export function studentSession(req: Request): AuthSession & { user: { student: NonNullable<AuthSession['user']['student']> } } {
  const session = req.student;
  if (!session?.user.student) throw unauthorized('Verify your university email to see your reservations.');
  return session as AuthSession & { user: { student: NonNullable<AuthSession['user']['student']> } };
}

/**
 * CSRF defence: state-changing requests must be JSON. Browsers can't send a
 * cross-site JSON request with cookies without a CORS preflight, which this
 * API never approves. Session cookies are also SameSite=Lax.
 */
export const requireJsonForMutations: RequestHandler = (req, _res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const type = String(req.headers['content-type'] ?? '').toLowerCase();
    if (!type.startsWith('application/json')) throw badRequest('Requests must be sent as JSON.', undefined, 'UNSUPPORTED_MEDIA_TYPE');
  }
  next();
};

export function queryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim() || undefined;
  return undefined;
}

export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

export const apiNotFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } });
};

export function errorHandler(log: Logger): ErrorRequestHandler {
  return (error, req, res, _next) => {
    if (error instanceof AppError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message, fields: error.fields } });
      return;
    }
    const type = (error as { type?: string } | null)?.type;
    if (type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } });
      return;
    }
    if (type === 'entity.too.large') {
      res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' } });
      return;
    }
    log.error(`Unhandled error on ${req.method} ${req.originalUrl}`, {
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
  };
}
