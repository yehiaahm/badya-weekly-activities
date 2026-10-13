// Loads realistic demo data for the previous, current and next month.
//   npm run seed            (development only; wipes existing data first)
// NODE_ENV has to be set before config.ts is evaluated, hence the dynamic import.
process.env.NODE_ENV ??= 'development';
const { runSeed } = await import('./seed-demo.ts');
await runSeed(process.argv.slice(2));
