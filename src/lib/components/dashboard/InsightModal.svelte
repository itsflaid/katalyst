<script lang="ts">
  import { fade, fly, scale } from 'svelte/transition';
  import { BellOff, Lightbulb, Package, X } from 'lucide-svelte';
  import type { BusinessInsight } from '$lib/analytics';
  import Badge from '$lib/components/ui/Badge.svelte';
  import { INSIGHT_META, type BellRestock } from '$lib/components/dashboard/insight-meta';

  export let insights: BusinessInsight[];
  export let restock: BellRestock | undefined;
  export let onClose: () => void;

  $: showRestock = !!restock && restock.list.length > 0;
  $: hasInsights = insights.length > 0;
  // Tab hanya berarti bila keduanya ada isi.
  $: showTabs = hasInsights && showRestock;
  // Modal dipasang ulang tiap lonceng diklik, jadi tab awal cukup dihitung sekali.
  let tab: 'insight' | 'stock' = insights.length > 0 ? 'insight' : 'stock';
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
    <div class="flex flex-shrink-0 items-start justify-between gap-3 px-5 pt-5">
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

    {#if showTabs}
      <div class="flex-shrink-0 px-5 pt-4">
        <div role="tablist" aria-label="Kategori notifikasi" class="relative grid grid-cols-2 rounded-full bg-ink-navy p-1">
          <span
            aria-hidden="true"
            class="absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-full bg-white transition-transform duration-200 motion-reduce:transition-none"
            style:transform={tab === 'stock' ? 'translateX(100%)' : 'translateX(0)'}
          ></span>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'insight'}
            on:click={() => (tab = 'insight')}
            class="relative z-10 h-9 cursor-pointer rounded-full border-none text-body-md transition-colors {tab === 'insight'
              ? 'bg-transparent font-semibold text-ink'
              : 'bg-transparent font-medium text-white/80 hover:text-white'}"
          >
            Insight
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'stock'}
            on:click={() => (tab = 'stock')}
            class="relative z-10 h-9 cursor-pointer rounded-full border-none text-body-md transition-colors {tab === 'stock'
              ? 'bg-transparent font-semibold text-ink'
              : 'bg-transparent font-medium text-white/80 hover:text-white'}"
          >
            Stok
          </button>
        </div>
      </div>
    {/if}

    <div class="flex-1 overflow-y-auto p-5">
      {#if !hasInsights && !showRestock}
        <div class="flex flex-col items-center gap-2 py-10 text-center">
          <span class="grid h-16 w-16 place-items-center rounded-full bg-table-header text-muted">
            <BellOff size={30} aria-hidden="true" />
          </span>
          <p class="text-body-md font-semibold text-ink">Belum ada notifikasi</p>
          <p class="text-body-sm text-muted">Semua aman, tidak ada yang perlu perhatian.</p>
        </div>
      {:else}
        {#key tab}
          <div in:fly={{ x: tab === 'stock' ? 16 : -16, duration: 150 }}>
            {#if tab === 'insight'}
              {#if hasInsights}
                <ul class="flex flex-col">
                  {#each insights as ins (`${ins.type}:${ins.productId}`)}
                    <li class="flex gap-3 border-b border-table-divider py-3 first:pt-0 last:border-b-0 last:pb-0">
                      <span
                        class="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-border-cool bg-white text-ink-navy shadow-level1"
                      >
                        <Lightbulb size={22} aria-hidden="true" />
                      </span>
                      <div class="min-w-0 flex-1">
                        <p class="flex items-center gap-2 text-body-md font-bold text-ink">
                          <span class="h-2 w-2 shrink-0 rounded-full bg-status-positive-border" aria-hidden="true"></span>{INSIGHT_META[ins.type]
                            .title}
                        </p>
                        <p class="mt-1 text-body-sm text-muted">{ins.message}</p>
                      </div>
                    </li>
                  {/each}
                </ul>
              {:else}
                <div class="flex flex-col items-center gap-2 py-10 text-center">
                  <span class="grid h-16 w-16 place-items-center rounded-full bg-table-header text-muted">
                    <Lightbulb size={30} aria-hidden="true" />
                  </span>
                  <p class="text-body-md font-semibold text-ink">Belum ada insight</p>
                  <p class="text-body-sm text-muted">Belum ada temuan dari penjualan periode ini.</p>
                </div>
              {/if}
            {:else if showRestock}
              <p class="text-body-sm text-muted">{restock?.habis} habis · {restock?.menipis} menipis</p>
              <ul class="mt-1 flex flex-col">
                {#each restock?.list ?? [] as p (p.id)}
                  <li class="flex items-center gap-3 border-b border-table-divider py-3 last:border-b-0">
                    <span
                      class="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-border-cool bg-white text-ink-navy shadow-level1"
                    >
                      <Package size={22} aria-hidden="true" />
                    </span>
                    <span class="min-w-0 flex-1 truncate text-body-md font-medium text-ink">{p.name}</span>
                    <Badge size="sm" tone={p.stock <= 0 ? 'negative' : 'warning'}>Stok {p.stock}</Badge>
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
            {:else}
              <div class="flex flex-col items-center gap-2 py-10 text-center">
                <span class="grid h-16 w-16 place-items-center rounded-full bg-table-header text-muted">
                  <Package size={30} aria-hidden="true" />
                </span>
                <p class="text-body-md font-semibold text-ink">Semua stok aman</p>
                <p class="text-body-sm text-muted">Tidak ada produk habis atau menipis.</p>
              </div>
            {/if}
          </div>
        {/key}
      {/if}
    </div>
  </div>
</div>
