import type { z } from 'zod';
import { fieldErrors } from '../../../shared/validation.ts';

/** An error that is safe to show to the caller, with a stable machine-readable code. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message: string, fields?: Record<string, string>, code = 'VALIDATION_ERROR') =>
  new AppError(400, code, message, fields);
export const unauthorized = (message = 'Please sign in to continue.') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to do that.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.', code = 'NOT_FOUND') => new AppError(404, code, message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const tooManyRequests = (message = 'Too many attempts. Please wait a moment and try again.') =>
  new AppError(429, 'RATE_LIMITED', message);

/** Parses input with a zod schema, throwing a 400 with per-field messages on failure. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const fields = fieldErrors(result.error.issues);
    const first = Object.values(fields)[0];
    throw badRequest(first ?? 'Some fields are invalid.', fields);
  }
  return result.data;
}

export function parseId(value: unknown, label = 'id'): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest(`Invalid ${label}.`);
  return id;
}
