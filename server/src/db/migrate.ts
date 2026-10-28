import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { applyMigrations } from './apply-migrations.ts';
import type { Database } from './database.ts';

const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations');

/** Node: applies pending `NNN_name.sql` migrations read from disk. Safe to run on every start. */
export function migrate(db: Database, log: (message: string) => void = () => {}): string[] {
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .map((file) => ({ version: file.replace(/\.sql$/, ''), sql: readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8') }));
  return applyMigrations(db, migrations, log);
}
