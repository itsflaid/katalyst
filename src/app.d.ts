import type { Session } from '$lib/server/domains/auth';
import type { BizTz } from '$lib/shared/time';

declare global {
  namespace App {
    interface Locals {
      user: Session['user'] | null;
      session: Session['session'] | null;
      // Bisnis aktif user (diisi di hooks agar cukup satu query per request).
      business: { id: string; name: string; timezone: BizTz } | null;
    }
  }
}

export {};
