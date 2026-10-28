import type { Database } from './database.ts';

export interface Migration {
  /** File name without extension, e.g. '001_initial_schema'. Applied in lexical order. */
  version: string;
  sql: string;
}

/** Applies pending migrations in order. Runtime-neutral: the caller supplies the SQL. Safe to run on every start. */
export function applyMigrations(db: Database, migrations: Migration[], log: (message: string) => void = () => {}): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(db.all<{ version: string }>('SELECT version FROM schema_migrations').map((row) => row.version));
  const newlyApplied: string[] = [];
  for (const { version, sql } of [...migrations].sort((a, b) => a.version.localeCompare(b.version))) {
    if (applied.has(version)) continue;
    db.transaction(() => {
      db.exec(sql);
      db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [version, new Date().toISOString()]);
    });
    log(`Applied migration ${version}`);
    newlyApplied.push(version);
  }
  return newlyApplied;
}
