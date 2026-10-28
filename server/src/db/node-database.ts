import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import type { Database, RunResult, SqlParams } from './database.ts';

type NamedParams = Record<string, SQLInputValue>;

/**
 * Thin wrapper around the built-in SQLite driver (development, tests and self-hosting).
 *
 * - Prepared statements are cached per SQL string.
 * - `transaction()` uses BEGIN IMMEDIATE so the write lock is taken up front:
 *   capacity checks and inserts can never interleave with another writer.
 * - Nested calls become savepoints, so services can compose freely.
 */
export class NodeDatabase implements Database {
  private readonly connection: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();
  private depth = 0;

  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
    this.connection = new DatabaseSync(filename);
    this.connection.exec('PRAGMA foreign_keys = ON');
    this.connection.exec('PRAGMA busy_timeout = 5000');
    if (filename !== ':memory:') {
      this.connection.exec('PRAGMA journal_mode = WAL');
      this.connection.exec('PRAGMA synchronous = NORMAL');
    }
  }

  private statement(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.connection.prepare(sql);
      statement.setAllowUnknownNamedParameters(true);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  all<T>(sql: string, params: SqlParams = []): T[] {
    const statement = this.statement(sql);
    const rows = Array.isArray(params) ? statement.all(...(params as SQLInputValue[])) : statement.all(params as NamedParams);
    return rows as T[];
  }

  get<T>(sql: string, params: SqlParams = []): T | undefined {
    const statement = this.statement(sql);
    const row = Array.isArray(params) ? statement.get(...(params as SQLInputValue[])) : statement.get(params as NamedParams);
    return row as T | undefined;
  }

  run(sql: string, params: SqlParams = []): RunResult {
    const statement = this.statement(sql);
    const result = Array.isArray(params) ? statement.run(...(params as SQLInputValue[])) : statement.run(params as NamedParams);
    return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
  }

  exec(sql: string): void {
    this.connection.exec(sql);
  }

  /** Runs `work` atomically. `work` must be synchronous — the driver is synchronous too. */
  transaction<T>(work: () => T): T {
    const savepoint = `sp_${this.depth}`;
    this.connection.exec(this.depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
    this.depth++;
    try {
      const result = work();
      if (result instanceof Promise) throw new Error('Database.transaction() does not support async work');
      this.depth--;
      this.connection.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
      return result;
    } catch (error) {
      this.depth--;
      if (this.depth === 0) this.connection.exec('ROLLBACK');
      else this.connection.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
      throw error;
    }
  }

  close(): void {
    this.statements.clear();
    this.connection.close();
  }
}
