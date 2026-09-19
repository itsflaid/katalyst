<script lang="ts">
  import type { SubmitFunction } from "@sveltejs/kit";
  import { enhance } from "$app/forms";
  import Input from "$lib/components/ui/Input.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import SlideOver from "$lib/components/ui/SlideOver.svelte";

  export let mode: 'create' | 'edit';
  export let product: { id: string; name: string; costPrice: string; sellingPrice: string; isActive: boolean } | null = null;
  export let form: { for?: string; message?: string } | null = null;
  export let onSubmit: SubmitFunction;
  export let onClose: () => void;

  // State form create. Untuk edit, bind langsung ke objek product.
  // (State create ikut hancur saat SlideOver ditutup, jadi tidak perlu reset manual.)
  let cName = "";
  let cCost = "";
  let cSell = "";
  let cStock = "";
  let cActive = true;
</script>

{#if mode === 'create'}
  <SlideOver title="Tambah Produk" onClose={onClose}>
    <form
      method="POST"
      action="?/create"
      use:enhance={onSubmit}
      class="flex flex-col gap-3"
    >
      <label for="c-name" class="flex flex-col gap-1 text-body-md text-ink">
        Nama produk
        <Input
          id="c-name"
          name="name"
          bind:value={cName}
          placeholder="Contoh: Kopi Susu"
          required
        />
      </label>
      <label for="c-cost" class="flex flex-col gap-1 text-body-md text-ink">
        Harga modal
        <Input
          id="c-cost"
          name="costPrice"
          type="number"
          min="0"
          bind:value={cCost}
          placeholder="15000"
          required
        />
      </label>
      <label for="c-sell" class="flex flex-col gap-1 text-body-md text-ink">
        Harga jual
        <Input
          id="c-sell"
          name="sellingPrice"
          type="number"
          min="1"
          bind:value={cSell}
          placeholder="25000"
          required
        />
      </label>
      <label for="c-stock" class="flex flex-col gap-1 text-body-md text-ink">
        Stok awal
        <Input
          id="c-stock"
          name="stock"
          type="number"
          min="0"
          step="1"
          bind:value={cStock}
          placeholder="0"
        />
      </label>
      <label class="flex items-center gap-2 text-body-md text-ink">
        <input
          type="checkbox"
          name="isActive"
          bind:checked={cActive}
          class="h-4 w-4 accent-ink-navy"
        />
        Aktif dijual
      </label>
      {#if form?.for === "create"}<p class="text-body-sm text-status-negative">
          {form.message}
        </p>{/if}
      <div class="flex justify-end gap-2 mt-1">
        <Button variant="secondary" type="button" on:click={onClose}
          >Batal</Button
        >
        <Button type="submit">Simpan</Button>
      </div>
    </form>
  </SlideOver>
{:else if product}
  <SlideOver title="Edit Produk" onClose={onClose}>
    <form
      method="POST"
      action="?/update"
      use:enhance={onSubmit}
      class="flex flex-col gap-3"
    >
      <input type="hidden" name="id" value={product.id} />
      <label for="e-name" class="flex flex-col gap-1 text-body-md text-ink">
        Nama produk
        <Input id="e-name" name="name" bind:value={product.name} required />
      </label>
      <label for="e-cost" class="flex flex-col gap-1 text-body-md text-ink">
        Harga modal
        <Input
          id="e-cost"
          name="costPrice"
          type="number"
          min="0"
          bind:value={product.costPrice}
          required
        />
      </label>
      <label for="e-sell" class="flex flex-col gap-1 text-body-md text-ink">
        Harga jual
        <Input
          id="e-sell"
          name="sellingPrice"
          type="number"
          min="1"
          bind:value={product.sellingPrice}
          required
        />
      </label>
      <label class="flex items-center gap-2 text-body-md text-ink">
        <input
          type="checkbox"
          name="isActive"
          bind:checked={product.isActive}
          class="h-4 w-4 accent-ink-navy"
        />
        Aktif dijual
      </label>
      <p class="text-body-sm text-muted">
        Stok tidak diubah dari sini — pakai tombol <strong>Stok</strong> di daftar (restock / koreksi) biar tercatat di riwayat.
      </p>
      {#if form?.for === "update"}<p class="text-body-sm text-status-negative">
          {form.message}
        </p>{/if}
      <div class="flex items-center justify-between gap-2 mt-1">
        <a
          href={`/simulator?productId=${product.id}`}
          class="text-body-sm text-ink-navy underline">Simulasikan</a
        >
        <div class="flex gap-2">
          <Button variant="secondary" type="button" on:click={onClose}
            >Batal</Button
          >
          <Button type="submit">Simpan</Button>
        </div>
      </div>
    </form>
  </SlideOver>
{/if}
