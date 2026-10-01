<script lang="ts">
  import Button from './ui/Button.svelte';
  import Input from './ui/Input.svelte';
  import ConfirmDialog from './ui/ConfirmDialog.svelte';
  import { invalidateAll } from '$app/navigation';
  import { TZ_INFO, type BizTz } from '$lib/shared/time';

  export let businessName: string;
  export let timezone: BizTz;
  let name = businessName;
  let tz: BizTz = timezone;
  let saving = false;
  let saved = false;
  let error = '';
  let showTzConfirm = false;

  // Reset penanda tersimpan tiap user mengetik lagi biar tidak menipu.
  $: if (name !== businessName) saved = false;
  $: if (tz !== timezone) saved = false;
  $: tzShort = TZ_INFO[tz]?.short ?? '';

  // Zona berubah perlu konfirmasi eksplisit karena laporan harian & jam
  // tersibuk dihitung ulang (struk & diskon terjadwal sendiri tidak berubah).
  function requestSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      error = 'Nama bisnis tidak boleh kosong.';
      return;
    }
    if (tz !== timezone) showTzConfirm = true;
    else void save(false);
  }

  async function save(withTz: boolean) {
    const trimmed = name.trim();
    if (!trimmed) {
      error = 'Nama bisnis tidak boleh kosong.';
      return;
    }
    saving = true;
    saved = false;
    error = '';
    showTzConfirm = false;
    const payload: Record<string, string> = {};
    if (trimmed !== businessName) payload.name = trimmed;
    // Kirim zona hanya bila berubah agar PATCH parsial tidak menyentuh yang lain.
    if (withTz && tz !== timezone) payload.timezone = tz;
    if (Object.keys(payload).length === 0) {
      saving = false;
      saved = true;
      return;
    }
    let res: Response;
    try {
      res = await fetch('/api/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch {
      saving = false;
      error = 'Jaringan bermasalah, coba lagi.';
      return;
    }
    saving = false;
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      saved = true;
      businessName = body.name ?? trimmed;
      name = businessName;
      if (body.timezone) {
        timezone = body.timezone;
        tz = body.timezone;
      }
      // Muat ulang semua data halaman agar jam & laporan ikut zona baru.
      await invalidateAll();
    } else {
      const body = await res.json().catch(() => ({}));
      error = body.message ?? 'Gagal menyimpan.';
    }
  }
</script>

<form on:submit|preventDefault={requestSave} class="flex flex-col gap-3 max-w-sm">
  <label for="business-name" class="flex flex-col gap-1 text-sm">
    Nama Bisnis
    <Input id="business-name" bind:value={name} required />
  </label>
  <label for="business-tz" class="flex flex-col gap-1 text-sm">
    Zona Waktu
    <select
      id="business-tz"
      bind:value={tz}
      class="h-9 rounded border border-border-input bg-white px-3 text-body-md text-ink"
    >
      {#each Object.entries(TZ_INFO) as [value, info]}
        <option {value}>{info.label}</option>
      {/each}
    </select>
  </label>
  {#if error}<p role="alert" class="text-sm text-status-negative">{error}</p>{/if}
  <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
  {#if saved}<p role="status" class="text-sm text-green-600">Tersimpan.</p>{/if}
</form>

{#if showTzConfirm}
  <ConfirmDialog title="Ganti zona waktu?" onClose={() => (showTzConfirm = false)}>
    Ganti ke {tzShort}? Laporan harian dan jam tersibuk dihitung ulang. Data struk dan diskon terjadwal tidak berubah.
    <div slot="actions" class="flex gap-2 w-full">
      <Button variant="secondary" class="flex-1" on:click={() => (showTzConfirm = false)}>Batal</Button>
      <Button class="flex-1" on:click={() => save(true)}>{saving ? 'Menyimpan...' : 'Ganti'}</Button>
    </div>
  </ConfirmDialog>
{/if}
