import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Database } from './database.ts';

const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations');

/** Applies pending `NNN_name.sql` migrations in order. Safe to run on every start. */
export function migrate(db: Database, log: (message: string) => void = () => {}): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(db.all<{ version: string }>('SELECT version FROM schema_migrations').map((row) => row.version));
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  const newlyApplied: string[] = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [version, new Date().toISOString()]);
    });
    log(`Applied migration ${version}`);
    newlyApplied.push(version);
  }
  return newlyApplied;
}
