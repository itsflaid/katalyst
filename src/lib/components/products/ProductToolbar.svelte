<script context="module" lang="ts">
  export type StatusFilter = "all" | "active" | "inactive";
  export type StockFilter = "all" | "restock" | "habis";
</script>

<script lang="ts">
  import Input from "$lib/components/ui/Input.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import { Search } from "lucide-svelte";

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "Semua" },
    { value: "active", label: "Aktif" },
    { value: "inactive", label: "Nonaktif" },
  ];

  export let query: string;
  export let statusFilter: StatusFilter;
  // Filter stok: "restock" = stock <= minStock (termasuk habis).
  export let stockFilter: StockFilter = "all";
  export let restockCount = 0;
  export let outCount = 0;

  const stockOptions: { value: StockFilter; label: string }[] = [
    { value: "all", label: "Semua" },
    { value: "restock", label: `Perlu restock (${restockCount})` },
    { value: "habis", label: `Habis (${outCount})` },
  ];
</script>

<!-- CTA "Tambah" sengaja tidak di sini: dia naik ke baris tab (slot aksi
     ProductTabs), jadi kartu ini murni filter. -->
<Card class="mb-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="relative w-full sm:w-60">
      <Input
        bind:value={query}
        placeholder="Cari nama produk…"
        class="pr-9 border-ink-navy"
        aria-label="Cari nama produk"
      />
      <Search
        size={18}
        class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-navy"
      />
    </div>
    <div
      class="flex divide-x divide-border-input rounded border border-border-input overflow-hidden"
      role="group"
      aria-label="Filter status"
    >
      {#each statusOptions as o}
        <button
          type="button"
          on:click={() => (statusFilter = o.value)}
          aria-pressed={statusFilter === o.value}
          class="px-4 h-9 text-body-md border-none cursor-pointer {statusFilter === o.value
            ? 'bg-ink-navy text-white font-semibold'
            : 'bg-white text-muted hover:bg-table-header'}"
        >
          {o.label}
        </button>
      {/each}
    </div>
    <slot name="stock" />
    <div
      class="flex divide-x divide-border-input rounded border border-border-input overflow-hidden"
      role="group"
      aria-label="Filter stok"
    >
      {#each stockOptions as o}
        {@const label = o.value === "restock" ? `Perlu restock (${restockCount})` : o.value === "habis" ? `Habis (${outCount})` : o.label}
        <button
          type="button"
          on:click={() => (stockFilter = o.value)}
          aria-pressed={stockFilter === o.value}
          class="px-4 h-9 text-body-md border-none cursor-pointer {stockFilter === o.value
            ? 'bg-ink-navy text-white font-semibold'
            : 'bg-white text-muted hover:bg-table-header'}"
        >
          {label}
        </button>
      {/each}
    </div>
  </div>
</Card>
