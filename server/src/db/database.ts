/** Positional values, or an object whose keys match `:name` placeholders (extra keys are ignored). */
export type SqlValue = string | number | bigint | null | Uint8Array;
export type SqlParams = SqlValue[] | object;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

/**
 * The synchronous SQLite surface the services rely on. Two drivers implement it:
 * `NodeDatabase` (node:sqlite — development, tests) and `DurableObjectDatabase`
 * (Cloudflare Durable Object SQLite storage — production).
 *
 * `transaction()` runs synchronous work atomically; nested calls compose.
 */
export interface Database {
  all<T>(sql: string, params?: SqlParams): T[];
  get<T>(sql: string, params?: SqlParams): T | undefined;
  run(sql: string, params?: SqlParams): RunResult;
  exec(sql: string): void;
  transaction<T>(work: () => T): T;
  close(): void;
}

/** True when an error is a SQLite UNIQUE constraint violation (any driver). */
export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if ((error as { errcode?: number }).errcode === 2067 /* SQLITE_CONSTRAINT_UNIQUE */) return true;
  return /UNIQUE constraint failed/i.test(error.message);
}
