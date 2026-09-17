<script lang="ts">
  import Button from './ui/Button.svelte';
  import Input from './ui/Input.svelte';

  export let businessName: string;
  let name = businessName;
  let saving = false;
  let saved = false;

  async function save() {
    saving = true;
    saved = false;
    const res = await fetch('/api/business', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    saving = false;
    if (res.ok) saved = true;
  }
</script>

<form on:submit|preventDefault={save} class="flex flex-col gap-3 max-w-sm">
  <label for="business-name" class="flex flex-col gap-1 text-sm">
    Nama Bisnis
    <Input id="business-name" bind:value={name} required />
  </label>
  <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
  {#if saved}<p class="text-sm text-green-600">Tersimpan.</p>{/if}
</form>
