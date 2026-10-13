import type { SessionUser } from '../../../../shared/types.ts';

export interface AuthSession {
  user: SessionUser;
  sessionId: string;
}
