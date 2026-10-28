import type { Database, RunResult, SqlParams, SqlValue } from './database.ts';

/** The slice of the Durable Object storage API this driver needs (structural, so Node builds don't need workers-types). */
export interface DurableObjectStorageLike {
  sql: { exec(query: string, ...bindings: unknown[]): { toArray(): unknown[] } };
  transactionSync<T>(closure: () => T): T;
}

interface Compiled {
  sql: string;
  names: string[];
}

/** Rewrites `:name` placeholders to positional `?` (Durable Object SQL has no named parameters). */
function compile(sql: string): Compiled {
  const names: string[] = [];
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    if (quote) {
      out += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === ':' && /[A-Za-z_]/.test(sql[i + 1] ?? '') && sql[i - 1] !== ':') {
      let j = i + 1;
      while (j < sql.length && /\w/.test(sql[j]!)) j++;
      names.push(sql.slice(i + 1, j));
      out += '?';
      i = j - 1;
      continue;
    }
    out += ch;
  }
  return { sql: out, names };
}

/** Database driver for Cloudflare Durable Object SQLite storage. */
export class DurableObjectDatabase implements Database {
  private readonly storage: DurableObjectStorageLike;
  private readonly compiled = new Map<string, Compiled>();
  private depth = 0;

  constructor(storage: DurableObjectStorageLike) {
    this.storage = storage;
  }

  private rows(sql: string, params: SqlParams): unknown[] {
    let entry = this.compiled.get(sql);
    if (!entry) {
      entry = compile(sql);
      this.compiled.set(sql, entry);
    }
    const bindings: unknown[] = Array.isArray(params)
      ? params
      : entry.names.map((name) => (params as Record<string, SqlValue | undefined>)[name] ?? null);
    return this.storage.sql.exec(entry.sql, ...bindings).toArray();
  }

  all<T>(sql: string, params: SqlParams = []): T[] {
    return this.rows(sql, params) as T[];
  }

  get<T>(sql: string, params: SqlParams = []): T | undefined {
    return this.rows(sql, params)[0] as T | undefined;
  }

  run(sql: string, params: SqlParams = []): RunResult {
    this.rows(sql, params);
    const meta = this.storage.sql.exec('SELECT changes() AS changes, last_insert_rowid() AS id').toArray()[0] as {
      changes: number;
      id: number;
    };
    return { changes: Number(meta.changes), lastInsertRowid: Number(meta.id) };
  }

  exec(sql: string): void {
    this.storage.sql.exec(sql).toArray();
  }

  /** Only the outermost call opens a transaction; nested calls join it. */
  transaction<T>(work: () => T): T {
    if (this.depth > 0) return work();
    this.depth++;
    try {
      return this.storage.transactionSync(() => {
        const result = work();
        if (result instanceof Promise) throw new Error('Database.transaction() does not support async work');
        return result;
      });
    } finally {
      this.depth--;
    }
  }

  close(): void {}
}
