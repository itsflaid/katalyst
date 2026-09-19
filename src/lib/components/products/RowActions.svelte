<script lang="ts">
  // Aksi per baris. ≥sm: link inline seperti sebelumnya. <sm: satu tombol
  // "⋯" membuka menu kecil (tutup saat klik di luar / Escape).
  export let product: { id: string; name: string; stock: number };
  export let isOwner: boolean;
  export let onStock: (p: { id: string; name: string; stock: number }, mode: 'restock' | 'adjust') => void;
  export let onEdit: (p: { id: string; name: string; costPrice: number; sellingPrice: number; isActive: boolean; minStock?: number | null }) => void;
  export let onDelete: (p: { id: string; name: string }) => void;
  export let row: { id: string; name: string; costPrice: number; sellingPrice: number; isActive: boolean; stock: number; minStock?: number | null };

  let open = false;
  let menuEl: HTMLDivElement | null = null;

  function close() {
    open = false;
  }
  function onWindowClick(e: MouseEvent) {
    if (open && menuEl && !menuEl.contains(e.target as Node)) close();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
</script>

<svelte:window on:click={onWindowClick} on:keydown={onKey} />

<!-- Desktop: inline seperti sebelumnya -->
<div class="hidden sm:flex items-center gap-3">
  <a href={`/products/${product.id}`} class="text-body-sm font-semibold text-ink-navy hover:underline">
    Detail
  </a>
  {#if isOwner}
    <button
      type="button"
      on:click={() => onStock(product, 'restock')}
      class="text-body-sm font-semibold text-status-positive hover:underline bg-transparent border-none cursor-pointer p-0"
    >
      Stok
    </button>
    <button
      type="button"
      on:click={() => onEdit(row)}
      class="text-body-sm font-semibold text-ink-navy hover:underline bg-transparent border-none cursor-pointer p-0"
    >
      Edit
    </button>
    <a href={`/simulator?productId=${product.id}`} class="text-body-sm text-muted hover:underline">
      Simulasikan
    </a>
    <button
      type="button"
      on:click={() => onDelete(product)}
      class="text-body-sm font-semibold text-status-negative hover:underline bg-transparent border-none cursor-pointer p-0"
    >
      Hapus
    </button>
  {/if}
</div>

<!-- Mobile: satu tombol ⋯ -->
<div class="sm:hidden relative" bind:this={menuEl}>
  <button
    type="button"
    on:click={() => (open = !open)}
    aria-expanded={open}
    aria-label={`Aksi untuk ${product.name}`}
    class="h-8 w-8 rounded border border-border-input bg-white text-ink font-bold cursor-pointer"
  >⋯</button>
  {#if open}
    <div class="absolute right-0 z-20 w-40 rounded border border-border-cool bg-surface shadow-level2 py-1 flex flex-col">
      <a
        href={`/products/${product.id}`}
        class="px-3 py-2 text-body-sm font-semibold text-ink-navy hover:bg-table-header no-underline text-left"
      >Detail</a>
      {#if isOwner}
        <button
          type="button"
          on:click={() => { close(); onStock(product, 'restock'); }}
          class="px-3 py-2 text-body-sm font-semibold text-status-positive hover:bg-table-header bg-transparent border-none cursor-pointer text-left"
        >Stok</button>
        <button
          type="button"
          on:click={() => { close(); onEdit(row); }}
          class="px-3 py-2 text-body-sm font-semibold text-ink-navy hover:bg-table-header bg-transparent border-none cursor-pointer text-left"
        >Edit</button>
        <a
          href={`/simulator?productId=${product.id}`}
          class="px-3 py-2 text-body-sm text-muted hover:bg-table-header no-underline text-left"
        >Simulasikan</a>
        <button
          type="button"
          on:click={() => { close(); onDelete(product); }}
          class="px-3 py-2 text-body-sm font-semibold text-status-negative hover:bg-table-header bg-transparent border-none cursor-pointer text-left"
        >Hapus</button>
      {/if}
    </div>
  {/if}
</div>
