import type { Session } from '$lib/server/auth';

declare global {
  namespace App {
    interface Locals {
      user: Session['user'] | null;
      session: Session['session'] | null;
    }
  }
}

export {};
