export { AppDO } from './app-do.ts';

interface Env {
  APP: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    // Everything under /api runs in the single application Durable Object; the rest is the static SPA.
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return env.APP.get(env.APP.idFromName('main')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies { fetch(request: Request, env: Env): Promise<Response> };
