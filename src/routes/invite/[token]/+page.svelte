<script lang="ts">
  import { enhance } from '$app/forms';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';

  export let data;
  export let form;

  let submitting = false;
</script>

<!-- Mirror dari /login: hero navy di KIRI, form di KANAN (pindah halaman
     biasa, tanpa animasi geser — sesuai keputusan). Token visual sama:
     canvas krem + dots + Card putih, hero navy + copilot-sheen. -->
<div class="flex min-h-screen bg-canvas">
  <!-- KIRI: hero branding (di /login ini di kanan) -->
  <aside
    class="relative hidden items-center justify-center overflow-hidden bg-ink-navy px-8 md:flex md:w-1/2"
    aria-hidden="true"
  >
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

  <!-- KANAN: konten undangan -->
  <section class="relative flex w-full items-center justify-center overflow-hidden px-6 py-12 md:w-1/2">
    <div class="login-dots absolute inset-0" aria-hidden="true"></div>

    <div class="relative z-10 mx-auto flex w-full max-w-[400px] flex-col gap-6">
      <div class="flex items-center gap-3">
        <img src="/logo/logo-login.png" alt="Logo Katalyst" class="h-9 w-9 rounded object-cover" />
        <div class="flex flex-col">
          <span class="text-headline-sm text-ink">Katalyst</span>
          <span class="text-body-sm text-muted">Catalyze Better Decisions</span>
        </div>
      </div>

      {#if data.status === 'invalid'}
        <Card class="p-6 shadow-level2">
          <h1 class="text-headline-md text-ink">Undangan tidak berlaku</h1>
          <p class="mt-1 text-body-md text-muted">
            Link ini sudah dipakai, dicabut, atau tidak dikenal. Minta link baru ke owner bisnis kamu.
          </p>
          <a href="/login" class="mt-5 inline-flex h-9 items-center justify-center rounded bg-ink-navy px-4 text-label-lg text-white no-underline hover:bg-ink">
            Ke halaman masuk
          </a>
        </Card>
      {:else if data.status === 'expired'}
        <Card class="p-6 shadow-level2">
          <h1 class="text-headline-md text-ink">Undangan kedaluwarsa</h1>
          <p class="mt-1 text-body-md text-muted">
            Undangan untuk <strong class="text-ink">{data.username}</strong> ke
            <strong class="text-ink">{data.businessName}</strong> sudah lewat 48 jam. Minta link baru ke owner.
          </p>
          <a href="/login" class="mt-5 inline-flex h-9 items-center justify-center rounded bg-ink-navy px-4 text-label-lg text-white no-underline hover:bg-ink">
            Ke halaman masuk
          </a>
        </Card>
      {:else}
        <Card class="p-6 shadow-level2">
          <h1 class="text-headline-md text-ink">Gabung ke {data.businessName}</h1>
          <p class="mt-1 text-body-md text-muted">Buat password kamu sendiri untuk mulai mencatat transaksi.</p>

          <div class="mt-4 rounded border border-border-cool bg-table-header px-3 py-2">
            <p class="text-label-sm uppercase text-muted">Username kamu</p>
            <p class="text-body-md text-ink tabular">{data.username}</p>
            <p class="text-body-sm text-muted mt-1">Pakai username ini untuk masuk nanti.</p>
          </div>

          <form
            method="POST"
            action="?/accept"
            use:enhance={() => {
              submitting = true;
              return async ({ update }) => {
                await update();
                submitting = false;
              };
            }}
            class="mt-5 flex flex-col gap-4"
          >
            <label for="invite-name" class="flex flex-col gap-1.5">
              <span class="text-label-md text-ink">Nama</span>
              <Input id="invite-name" name="name" type="text" value={data.name ?? ''} placeholder="Nama kamu" autocomplete="name" />
            </label>

            <label for="invite-password" class="flex flex-col gap-1.5">
              <span class="text-label-md text-ink">Password</span>
              <Input
                id="invite-password"
                name="password"
                type="password"
                placeholder="Min. 6 karakter"
                autocomplete="new-password"
                minlength={6}
                required
              />
            </label>

            <label for="invite-confirm" class="flex flex-col gap-1.5">
              <span class="text-label-md text-ink">Konfirmasi password</span>
              <Input
                id="invite-confirm"
                name="confirmPassword"
                type="password"
                placeholder="Ulangi password"
                autocomplete="new-password"
                minlength={6}
                required
              />
            </label>

            {#if form?.message}
              <p role="alert" aria-live="polite" class="rounded border border-status-negative-border bg-status-negative-bg px-3 py-2 text-body-md text-status-negative">
                {form.message}
              </p>
            {/if}

            <Button type="submit" disabled={submitting} class="w-full">
              {submitting ? 'Membuat akun...' : 'Buat akun & gabung'}
            </Button>
          </form>
        </Card>

        <p class="text-center text-body-sm text-muted">Link berlaku 48 jam dan sekali pakai. Sudah punya akun? <a href="/login" class="text-ink-navy font-semibold">Masuk</a></p>
      {/if}
    </div>
  </section>
</div>

<style>
  .login-dots {
    background-image: radial-gradient(circle, rgba(23, 37, 84, 0.14) 1px, transparent 1.4px);
    background-size: 22px 22px;
    background-position: center;
    pointer-events: none;
  }
</style>
