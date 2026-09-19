<script context="module" lang="ts">
  export type StatusFilter = "all" | "active" | "inactive";
  export type StockFilter = "all" | "restock" | "habis";
</script>

<script lang="ts">
  import Input from "$lib/components/ui/Input.svelte";
  import Button from "$lib/components/ui/Button.svelte";

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "Semua" },
    { value: "active", label: "Aktif" },
    { value: "inactive", label: "Nonaktif" },
  ];

  export let query: string;
  export let statusFilter: StatusFilter;
  export let isOwner: boolean;
  export let onAdd: () => void;
  // Filter stok (Fase 4): "restock" = stock <= minStock (termasuk habis).
  export let stockFilter: StockFilter = "all";
  export let restockCount = 0;
  export let outCount = 0;

  const stockOptions: { value: StockFilter; label: string }[] = [
    { value: "all", label: "Semua" },
    { value: "restock", label: `Perlu restock (${restockCount})` },
    { value: "habis", label: `Habis (${outCount})` },
  ];
</script>

<div class="flex flex-wrap items-center gap-3 my-4">
  <Input
    bind:value={query}
    placeholder="Cari nama produk…"
    class="max-w-sm flex-1 min-w-[200px]"
    aria-label="Cari nama produk"
  />
  <div
    class="flex rounded border border-border-input overflow-hidden"
    role="group"
    aria-label="Filter status"
  >
    {#each statusOptions as o}
      <button
        type="button"
        on:click={() => (statusFilter = o.value)}
        aria-pressed={statusFilter === o.value}
        class="px-3 h-9 text-body-md border-none cursor-pointer {statusFilter === o.value
          ? 'bg-ink-navy text-white font-semibold'
          : 'bg-white text-muted hover:bg-table-header'}"
      >
        {o.label}
      </button>
    {/each}
  </div>
  <slot name="stock" />
  <div
    class="flex rounded border border-border-input overflow-hidden"
    role="group"
    aria-label="Filter stok"
  >
    {#each stockOptions as o}
      {@const label = o.value === "restock" ? `Perlu restock (${restockCount})` : o.value === "habis" ? `Habis (${outCount})` : o.label}
      <button
        type="button"
        on:click={() => (stockFilter = o.value)}
        aria-pressed={stockFilter === o.value}
        class="px-3 h-9 text-body-md border-none cursor-pointer {stockFilter === o.value
          ? 'bg-ink-navy text-white font-semibold'
          : 'bg-white text-muted hover:bg-table-header'}"
      >
        {label}
      </button>
    {/each}
  </div>
  {#if isOwner}
    <Button on:click={onAdd} class="flex-shrink-0 ml-auto">+ Tambah</Button>
  {/if}
</div>
