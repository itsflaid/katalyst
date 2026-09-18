<script lang="ts">
  import Button from './ui/Button.svelte';
  import Input from './ui/Input.svelte';

  export let businessName: string;
  let name = businessName;
  let saving = false;
  let saved = false;
  let error = '';

  // Reset penanda tersimpan tiap user mengetik lagi biar tidak menipu.
  $: if (name !== businessName) saved = false;

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      error = 'Nama bisnis tidak boleh kosong.';
      return;
    }
    saving = true;
    saved = false;
    error = '';
    let res: Response;
    try {
      res = await fetch('/api/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      });
    } catch {
      saving = false;
      error = 'Jaringan bermasalah, coba lagi.';
      return;
    }
    saving = false;
    if (res.ok) {
      saved = true;
      businessName = trimmed;
      name = trimmed;
    } else {
      const body = await res.json().catch(() => ({}));
      error = body.message ?? 'Gagal menyimpan.';
    }
  }
</script>

<form on:submit|preventDefault={save} class="flex flex-col gap-3 max-w-sm">
  <label for="business-name" class="flex flex-col gap-1 text-sm">
    Nama Bisnis
    <Input id="business-name" bind:value={name} required />
  </label>
  {#if error}<p role="alert" class="text-sm text-status-negative">{error}</p>{/if}
  <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
  {#if saved}<p role="status" class="text-sm text-green-600">Tersimpan.</p>{/if}
</form>
