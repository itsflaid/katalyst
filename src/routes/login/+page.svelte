<script lang="ts">
  import { signIn, authClient } from '$lib/auth-client';
  import { goto } from '$app/navigation';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';

  let identity = '';
  let password = '';
  let error = '';
  let loading = false;

  async function handleSubmit() {
    loading = true;
    error = '';
    // Ada '@' → email (owner), selain itu username (staff).
    const id = identity.trim();
    const { error: signInError } = id.includes('@')
      ? await signIn.email({ email: id, password })
      : await signIn.username({ username: id, password });
    loading = false;
    if (signInError) {
      error = signInError.message ?? 'Login gagal, cek username/email + password.';
      return;
    }
    // invalidateAll: paksa load function layout (+layout.server.ts) jalan
    // ulang — tanpa ini data.user tetap null (hasil load waktu masih
    // logged-out) dan Sidebar gak muncul sampai user refresh manual.
    // Tujuan role-aware (sama kayak `/` + load login): OWNER -> /dashboard
    // (OWNER-only), STAFF -> /transactions. Kalau sesi belum kebaca
    // (race), fallback ke `/` biar server yang mutusin via redirect.
    // await: pastikan navigasi ke halaman awal selesai sebelum handler
    // kelar, biar gak ada navigasi lain yang menimpa tujuan ini.
    const { data } = await authClient.getSession();
    const role = (data?.user as { role?: string } | undefined)?.role;
    if (!role) {
      await goto('/', { invalidateAll: true });
      return;
    }
    await goto(role === 'OWNER' ? '/dashboard' : '/transactions', { invalidateAll: true });
  }
</script>

<div class="flex min-h-screen bg-canvas">
  <!-- KIRI: form di atas canvas krem + dot pattern -->
  <section class="relative flex w-full items-center justify-center overflow-hidden px-6 py-12 md:w-1/2">
    <!-- Dot pattern halus: radial-gradient 1px, spacing 22px.
         pointer-events-none + aria-hidden biar murni dekorasi. -->
    <div class="login-dots absolute inset-0" aria-hidden="true"></div>

    <div class="relative z-10 mx-auto flex w-full max-w-[400px] flex-col gap-6">
      <!-- Brand -->
      <div class="flex items-center gap-3">
        <img
          src="/logo/logo-login.png"
          alt="Logo Katalyst"
          class="h-9 w-9 rounded object-cover"
        />
        <div class="flex flex-col">
          <span class="text-headline-sm text-ink">Katalyst</span>
          <span class="text-body-sm text-muted">Catalyze Better Decisions</span>
        </div>
      </div>

      <!-- Card form -->
      <Card class="p-6 shadow-level2">
        <h1 class="text-headline-md text-ink">Masuk ke Katalyst</h1>
        <p class="mt-1 text-body-md text-muted">Masuk untuk mengelola produk, transaksi, dan simulasi.</p>

        <form on:submit|preventDefault={handleSubmit} class="mt-5 flex flex-col gap-4">
          <label for="login-identity" class="flex flex-col gap-1.5">
            <span class="text-label-md text-ink">Username atau email</span>
            <Input
              id="login-identity"
              type="text"
              bind:value={identity}
              placeholder="username / nama@bisnis.com"
              autocomplete="username"
              required
            />
          </label>

          <label for="login-password" class="flex flex-col gap-1.5">
            <span class="text-label-md text-ink">Password</span>
            <Input
              id="login-password"
              type="password"
              bind:value={password}
              placeholder="••••••••"
              autocomplete="current-password"
              required
            />
          </label>

          {#if error}
            <p
              role="alert"
              aria-live="polite"
              class="rounded border border-status-negative-border bg-status-negative-bg px-3 py-2 text-body-md text-status-negative"
            >
              {error}
            </p>
          {/if}

          <Button type="submit" disabled={loading} class="w-full">
            {loading ? 'Memproses...' : 'Masuk'}
          </Button>
        </form>
      </Card>

      <p class="text-center text-body-sm text-muted">
        Lupa password? Hubungi admin bisnis kamu.
      </p>
    </div>
  </section>

  <!-- KANAN: hero branding centered di atas navy.
       Duplikat brand kiri, jadi aria-hidden (dekoratif). -->
  <aside
    class="relative hidden items-center justify-center overflow-hidden bg-ink-navy px-8 md:flex md:w-1/2"
    aria-hidden="true"
  >
    <!-- Kilau diagonal menyapu, reuse keyframes copilot-sheen di app.css -->
    <span aria-hidden="true" class="pointer-events-none absolute inset-0">
      <span
        class="copilot-sheen absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent"
      ></span>
    </span>

    <div class="relative z-10 flex flex-col items-center gap-4 text-center">
      <img
        src="/logo/logo-copilot.png"
        alt=""
        class="h-28 w-28 rounded-panel object-cover shadow-level2"
      />
      <p class="text-headline-xl text-white">Katalyst</p>
      <p class="max-w-[280px] text-body-lg text-white/80">Catalyze Better Decisions</p>
      <p class="text-body-sm tracking-wide text-white/50">see, decide, grow.</p>
    </div>
  </aside>
</div>

<style>
  .login-dots {
    background-image: radial-gradient(circle, rgba(23, 37, 84, 0.14) 1px, transparent 1.4px);
    background-size: 22px 22px;
    background-position: center;
    pointer-events: none;
  }
</style>
