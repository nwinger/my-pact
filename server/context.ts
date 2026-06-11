import type { Session, SessionUser } from './auth';

export type AppEnv = {
  Variables: {
    user: SessionUser | null;
    session: Session | null;
  };
};
