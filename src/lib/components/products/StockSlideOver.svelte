<script lang="ts">
  import type { SubmitFunction } from "@sveltejs/kit";
  import { enhance } from "$app/forms";
  import Input from "$lib/components/ui/Input.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import SlideOver from "$lib/components/ui/SlideOver.svelte";

  export let modal: { mode: 'restock' | 'adjust'; id: string; name: string; stock: number };
  export let form: { for?: string; message?: string } | null = null;
  export let onSubmit: SubmitFunction;
  export let onClose: () => void;
  export let onSwitchMode: (mode: 'restock' | 'adjust') => void;

  let sQty = '';
  let sStock = String(modal.stock);
  let sNote = '';

  // Reset field tiap ganti produk/mode.
  $: if (modal) {
    sQty = '';
    sStock = String(modal.stock);
    sNote = '';
  }
</script>

<SlideOver title={modal.mode === 'restock' ? `Restock — ${modal.name}` : `Koreksi Stok — ${modal.name}`} onClose={onClose}>
  {#if modal.mode === 'restock'}
    <form method="POST" action="?/restock" use:enhance={onSubmit} class="flex flex-col gap-3">
      <input type="hidden" name="id" value={modal.id} />
      <p class="text-body-sm text-muted">Stok sekarang: <strong class="text-ink tabular">{modal.stock}</strong></p>
      <label for="s-qty" class="flex flex-col gap-1 text-body-md text-ink">
        Jumlah tambah
        <Input id="s-qty" name="qty" type="number" min="1" step="1" bind:value={sQty} placeholder="10" required />
      </label>
      <label for="s-note" class="flex flex-col gap-1 text-body-md text-ink">
        Catatan (opsional)
        <Input id="s-note" name="note" bind:value={sNote} placeholder="Barang dari supplier" />
      </label>
      {#if form?.for === "restock"}<p class="text-body-sm text-status-negative">{form.message}</p>{/if}
      <div class="flex justify-end gap-2 mt-1">
        <Button variant="secondary" type="button" on:click={onClose}>Batal</Button>
        <Button type="submit">Tambah Stok</Button>
      </div>
    </form>
  {:else}
    <form method="POST" action="?/adjust" use:enhance={onSubmit} class="flex flex-col gap-3">
      <input type="hidden" name="id" value={modal.id} />
      <label for="s-stock" class="flex flex-col gap-1 text-body-md text-ink">
        Stok hasil opname
        <Input id="s-stock" name="stock" type="number" min="0" step="1" bind:value={sStock} required />
      </label>
      <label for="s-note2" class="flex flex-col gap-1 text-body-md text-ink">
        Alasan (wajib)
        <Input id="s-note2" name="note" bind:value={sNote} placeholder="Selisih hitung fisik" required />
      </label>
      {#if form?.for === "adjust"}<p class="text-body-sm text-status-negative">{form.message}</p>{/if}
      <div class="flex justify-end gap-2 mt-1">
        <Button variant="secondary" type="button" on:click={() => onSwitchMode('restock')}>Ke Restock</Button>
        <Button type="submit">Simpan Koreksi</Button>
      </div>
    </form>
  {/if}
  {#if modal.mode === 'restock'}
    <button type="button" on:click={() => onSwitchMode('adjust')} class="text-body-sm text-muted hover:text-ink mt-3 bg-transparent border-none cursor-pointer p-0">
      Malah mau koreksi hasil opname?
    </button>
  {/if}
</SlideOver>
