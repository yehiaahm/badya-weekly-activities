// Creates a staff account or resets its password:
//   npm run admin -- --email coach@badyauni.edu.eg --password "a-long-password" --name "Coach Name"
import { parseArgs } from 'node:util';
import { createContext } from '../bootstrap.ts';
import { AuthService } from '../modules/auth/auth.service.ts';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    name: { type: 'string', default: 'Sports Office Admin' },
  },
});

if (!values.email || !values.password) {
  console.error('Usage: npm run admin -- --email <email> --password <password> [--name <name>]');
  process.exit(1);
}

const ctx = createContext();
try {
  const result = await new AuthService(ctx).upsertAdmin({
    name: values.name ?? 'Sports Office Admin',
    email: values.email.trim().toLowerCase(),
    password: values.password,
  });
  console.log(result === 'created' ? `Created admin ${values.email}` : `Updated password for ${values.email}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  ctx.db.close();
}
