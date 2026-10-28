import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildConfig, type AppConfig } from './config-base.ts';

export type { AppConfig } from './config-base.ts';

export const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

const envFile = path.join(ROOT_DIR, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

/** Node-only configuration: the base settings plus file-system locations. */
export const config: AppConfig & { databasePath: string; clientDistDir: string } = {
  ...buildConfig(process.env),
  databasePath: path.resolve(ROOT_DIR, process.env.DATABASE_PATH?.trim() || 'data/badya.db'),
  clientDistDir: path.join(ROOT_DIR, 'dist', 'client'),
};
