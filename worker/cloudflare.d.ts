// Minimal ambient types for the Cloudflare runtime APIs the worker uses
// (kept local so the Node toolchain needs no extra type packages).

declare module 'cloudflare:workers' {
  interface DurableObjectStorage {
    sql: { exec(query: string, ...bindings: unknown[]): { toArray(): unknown[] } };
    transactionSync<T>(closure: () => T): T;
    setAlarm(scheduledTime: number | Date): Promise<void>;
    getAlarm(): Promise<number | null>;
  }
  interface DurableObjectState {
    storage: DurableObjectStorage;
    blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
  }
  export class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState;
    protected env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}

declare module '*.sql' {
  const sql: string;
  export default sql;
}
