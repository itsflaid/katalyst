import { createAuthClient } from 'better-auth/svelte';
import { usernameClient } from 'better-auth/client/plugins';

// baseURL mengikuti origin yang menyajikan app saat runtime — bukan URL
// bake-time (VITE_*). Jadi login jalan di domain produksi, preview deploy,
// maupun localhost tanpa config tambahan. signIn/signOut hanya dipanggil
// dari browser, jadi window.location.origin selalu tepat; saat SSR pakai
// default better-auth.
export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : undefined,
  // usernameClient: membuka signIn.username (login staff pakai username).
  plugins: [usernameClient()]
});

export const { signIn, signOut, signUp, useSession } = authClient;
