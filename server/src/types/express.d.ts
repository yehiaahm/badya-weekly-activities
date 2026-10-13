import type { AuthSession } from '../modules/auth/auth.types.ts';

declare global {
  namespace Express {
    interface Request {
      /** Staff session (admin cookie), resolved by the session middleware. */
      admin?: AuthSession | null;
      /** Verified-student session (student cookie), resolved by the session middleware. */
      student?: AuthSession | null;
    }
  }
}
