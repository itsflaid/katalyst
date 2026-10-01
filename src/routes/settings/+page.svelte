<script lang="ts">
  import { onMount } from 'svelte';
  import BusinessProfileForm from '$lib/components/BusinessProfileForm.svelte';
  import StaffManager from '$lib/components/StaffManager.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import { invalidateAll } from '$app/navigation';
  import { TZ_INFO, DEFAULT_TZ, deviceTzToBizTz, type BizTz } from '$lib/shared/time';
  export let data;

  // Saran zona dari perangkat (non-blocking, tidak mengubah apa pun otomatis).
  // Pemetaan IANA → zona bisnis; dismiss tersimpan di localStorage.
  const DISMISS_KEY = 'katalyst-tz-banner-dismissed';
  let suggested: BizTz | null = null;
  let dismissed = false;
  let changing = false;
  function mapDeviceTz(tz: string): BizTz | null {
    // Delegasi ke helper agar literal IANA tetap di time.ts (gerbang grep).
    return deviceTzToBizTz(tz);
  }
  onMount(() => {
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      dismissed = false;
    }
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const mapped = mapDeviceTz(device);
    if (mapped && mapped !== data.timezone) suggested = mapped;
  });
  function dismiss() {
    dismissed = true;
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Abaikan bila storage tidak tersedia.
    }
  }
  async function applySuggested() {
    if (!suggested) return;
    changing = true;
    try {
      const res = await fetch('/api/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: suggested })
      });
      if (res.ok) await invalidateAll();
    } finally {
      changing = false;
    }
  }
  $: showBanner = suggested && !dismissed && suggested !== data.timezone;
</script>

<PageHeader title="Pengaturan" />

{#if showBanner}
  <div class="rounded-panel border border-border-cool bg-table-header px-4 py-3 mb-6 flex flex-wrap items-center gap-3">
    <p class="text-body-md text-ink flex-1 min-w-52">
      Perangkat ini terdeteksi {TZ_INFO[suggested ?? DEFAULT_TZ].short}, bisnis diatur {TZ_INFO[data.timezone].short}. Ubah?
    </p>
    <div class="flex gap-2">
      <Button variant="secondary" on:click={dismiss}>Abaikan</Button>
      <Button on:click={applySuggested} disabled={changing}>{changing ? 'Mengubah...' : `Ubah ke ${TZ_INFO[suggested ?? DEFAULT_TZ].short}`}</Button>
    </div>
  </div>
{/if}

<nav class="flex gap-2 overflow-x-auto mb-8 -mx-1 px-1">
  <a href="#profil" class="flex-shrink-0 text-label-md rounded px-3 py-2 bg-ink-navy text-white no-underline">Identitas Bisnis</a>
  <a href="#staff" class="flex-shrink-0 text-label-md rounded px-3 py-2 border border-border-input text-muted no-underline hover:bg-table-header">Akses & Staff</a>
  <a href="#danger" class="flex-shrink-0 text-label-md rounded px-3 py-2 border border-status-negative-border text-status-negative no-underline hover:bg-status-negative-bg">Zona Berbahaya</a>
</nav>

<section id="profil" class="mb-10 scroll-mt-4">
  <h2 class="text-label-sm uppercase text-muted mb-3">Identitas Bisnis</h2>
  <Card class="max-w-sm">
    <BusinessProfileForm businessName={data.businessName} timezone={data.timezone} />
  </Card>
</section>

<section id="staff" class="mb-10 scroll-mt-4">
  <h2 class="text-label-sm uppercase text-muted mb-3">Akses & Staff</h2>
  <StaffManager staffList={data.staffList} currentUserId={data.currentUserId} />
</section>

<section id="danger" class="scroll-mt-4">
  <h2 class="text-label-sm uppercase text-status-negative mb-3">Zona Berbahaya</h2>
  <div class="rounded-panel border border-status-negative-border bg-status-negative-bg p-4">
    <p class="text-body-sm text-status-negative mb-3">
      Menghapus bisnis akan menghilangkan seluruh data produk & transaksi secara permanen. Fitur ini belum tersedia.
    </p>
    <Button variant="destructive" disabled>Hapus Bisnis</Button>
  </div>
</section>
