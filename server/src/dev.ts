// Development entry point: `npm run dev` / `npm run dev:server`.
// NODE_ENV must be set before config.ts is evaluated, hence the dynamic import.
process.env.NODE_ENV ??= 'development';
// The Vite dev server proxies /api to this port. A PORT inherited from the shell
// (often meant for the web server) must not move the API, so dev uses API_PORT.
process.env.PORT = process.env.API_PORT ?? '4000';
await import('./index.ts');
