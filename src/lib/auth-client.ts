import { createAuthClient } from 'better-auth/svelte';
import { usernameClient } from 'better-auth/client/plugins';

// baseURL memakai origin runtime (bukan bake-time): signIn/signOut hanya dari browser,
// jadi window.location.origin tepat; SSR pakai default better-auth.
export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : undefined,
  // usernameClient: membuka signIn.username (login staff pakai username).
  plugins: [usernameClient()]
});

export const { signIn, signOut, signUp, useSession } = authClient;
