<script context="module" lang="ts">
  export type StatusFilter = "all" | "active" | "inactive";
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
  {#if isOwner}
    <Button on:click={onAdd} class="flex-shrink-0 ml-auto">+ Tambah</Button>
  {/if}
</div>
