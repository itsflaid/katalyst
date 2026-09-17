<script lang="ts">
  import { signIn } from '$lib/auth-client';
  import { goto } from '$app/navigation';

  let email = '';
  let password = '';
  let error = '';
  let loading = false;

  async function handleSubmit() {
    loading = true;
    error = '';
    const { error: signInError } = await signIn.email({ email, password });
    loading = false;
    if (signInError) {
      error = signInError.message ?? 'Login gagal, cek email/password.';
      return;
    }
    // invalidateAll: paksa load function layout (+layout.server.ts) jalan
    // ulang — tanpa ini data.user tetap null (hasil load waktu masih
    // logged-out) dan Sidebar gak muncul sampai user refresh manual.
    goto('/transactions', { invalidateAll: true });
  }
</script>

<div class="login-wrap">
  <h1>Masuk ke Katalyst</h1>
  <form on:submit|preventDefault={handleSubmit}>
    <label>
      Email
      <input type="email" bind:value={email} required />
    </label>
    <label>
      Password
      <input type="password" bind:value={password} required />
    </label>
    {#if error}<p class="error">{error}</p>{/if}
    <button type="submit" disabled={loading}>{loading ? 'Memproses...' : 'Masuk'}</button>
  </form>
</div>

<style>
  .login-wrap { max-width: 360px; margin: 4rem auto; display: flex; flex-direction: column; gap: 1rem; }
  form { display: flex; flex-direction: column; gap: 0.75rem; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; }
  input { padding: 0.5rem; border: 1px solid #d4d4d4; border-radius: 6px; }
  .error { color: #dc2626; font-size: 0.875rem; }
  button { padding: 0.6rem; border-radius: 6px; background: #111827; color: white; border: none; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
