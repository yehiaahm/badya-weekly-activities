// SQL migrations bundled into the worker (wrangler "Text" rule for *.sql).
// Add every new file from server/src/db/migrations here — server/test/worker-migrations.test.ts fails if one is missing.
import type { Migration } from '../server/src/db/apply-migrations.ts';
import initialSchema from '../server/src/db/migrations/001_initial_schema.sql';
import sheetOutbox from '../server/src/db/migrations/002_sheet_outbox.sql';

export const MIGRATIONS: Migration[] = [
  { version: '001_initial_schema', sql: initialSchema },
  { version: '002_sheet_outbox', sql: sheetOutbox },
];
