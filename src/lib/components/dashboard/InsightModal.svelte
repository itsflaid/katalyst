<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { Lightbulb, Package, X } from 'lucide-svelte';
  import type { BusinessInsight } from '$lib/analytics';
  import Badge from '$lib/components/ui/Badge.svelte';
  import { INSIGHT_META, type BellRestock } from '$lib/components/dashboard/insight-meta';

  export let insights: BusinessInsight[];
  export let restock: BellRestock | undefined;
  export let onClose: () => void;

  $: showRestock = !!restock && restock.list.length > 0;
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && onClose()} />

<button
  type="button"
  class="fixed inset-0 z-50 cursor-default border-none bg-ink/40 p-0"
  transition:fade={{ duration: 150 }}
  aria-label="Tutup notifikasi"
  on:click={onClose}
></button>
<div class="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
  <div
    class="pointer-events-auto flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-panel border border-border-cool bg-surface shadow-level3"
    transition:scale={{ duration: 150, start: 0.96 }}
    role="dialog"
    aria-modal="true"
    aria-label="Notifikasi"
  >
    <div class="flex flex-shrink-0 items-start justify-between gap-3 border-b border-border-cool px-5 py-4">
      <div>
        <h2 class="text-headline-sm text-ink">Notifikasi</h2>
        <p class="text-body-sm text-muted">Hal yang perlu perhatian</p>
      </div>
      <button
        type="button"
        class="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded border-none bg-transparent text-muted hover:bg-table-header hover:text-ink"
        aria-label="Tutup"
        on:click={onClose}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-5">
      {#if insights.length === 0 && !showRestock}
        <p class="text-body-md text-muted">Belum ada notifikasi.</p>
      {:else}
        {#if insights.length > 0}
          <ul class="flex flex-col gap-3">
            {#each insights as ins (`${ins.type}:${ins.productId}`)}
              <li class="rounded-panel border border-border-warm bg-table-header p-3">
                <div class="flex items-start gap-2">
                  <Lightbulb size={16} class="mt-0.5 shrink-0 text-ink-navy" aria-hidden="true" />
                  <div class="min-w-0 flex-1">
                    <Badge tone={INSIGHT_META[ins.type].tone} size="sm">{INSIGHT_META[ins.type].title}</Badge>
                    <p class="mt-1.5 text-body-md text-ink">{ins.message}</p>
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
        {#if showRestock}
          <h3 class="mt-5 text-body-md font-semibold text-ink">Perlu restock</h3>
          <p class="text-body-sm text-muted">{restock?.habis} habis · {restock?.menipis} menipis</p>
          <ul class="mt-2 flex flex-col gap-2">
            {#each restock?.list ?? [] as p (p.id)}
              <li class="flex items-center gap-2 rounded-panel border border-border-warm bg-table-header px-3 py-2">
                <Package size={16} class="shrink-0 text-ink-navy" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate text-body-md text-ink">{p.name}</span>
                <span class="shrink-0 text-body-sm font-semibold text-status-negative">Sisa {p.stock}</span>
              </li>
            {/each}
          </ul>
          <a
            href="/products?stok=restock"
            class="mt-2 inline-block text-body-sm font-semibold text-ink-navy hover:underline no-underline"
            on:click={onClose}
          >
            Lihat semua yang perlu restock →
          </a>
        {/if}
      {/if}
    </div>
  </div>
</div>
