import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

describe('worker bundle', () => {
  it('lists every SQL migration so the Cloudflare database matches the Node one', () => {
    // worker/migrations.ts imports .sql files (bundled by wrangler), which Node cannot load — so check its source text.
    const source = readFileSync(path.join(import.meta.dirname, '../../worker/migrations.ts'), 'utf8');
    const onDisk = readdirSync(path.join(import.meta.dirname, '../src/db/migrations')).filter((file) => /^\d+_.+\.sql$/.test(file));
    assert.ok(onDisk.length > 0);
    for (const file of onDisk) {
      assert.ok(source.includes(`migrations/${file}'`), `worker/migrations.ts is missing ${file}`);
      assert.ok(source.includes(`version: '${file.replace(/\.sql$/, '')}'`), `worker/migrations.ts has no version entry for ${file}`);
    }
  });
});
