<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { Lightbulb, Package, X } from 'lucide-svelte';
  import type { BusinessInsight } from '$lib/analytics';
  import Badge from '$lib/components/ui/Badge.svelte';
  import { INSIGHT_META, type BellRestock } from '$lib/components/dashboard/insight-meta';
  import { INSIGHT_TOAST_KEY, insightSignature } from '$lib/shared/insight-toast';

  export let insights: BusinessInsight[];
  export let restock: BellRestock | undefined = undefined;

  let visible: BusinessInsight[] = [];
  let showStock = false;
  let reduceMotion = false;

  const keyOf = (i: BusinessInsight) => `${i.type}:${i.productId}`;
  const dismiss = (key: string) => (visible = visible.filter((i) => keyOf(i) !== key));
  const dismissAll = () => {
    visible = [];
    showStock = false;
  };

  // Stok ikut tanda tangan: habis/menipis berubah berarti toast tampil lagi.
  const stockSignature = (r: BellRestock | undefined) =>
    (r?.list ?? [])
      .map((p) => `${p.id}:${p.stock}`)
      .sort()
      .join(',');
  $: stockList = restock?.list ?? [];
  $: stockNames = stockList.slice(0, 3).map((p) => p.name);
  $: stockMore = stockList.length > 3 ? stockList.length - 3 : 0;

  onMount(() => {
    if (insights.length === 0 && stockList.length === 0) return;
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const signature = `${insightSignature(insights)}#${stockSignature(restock)}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(INSIGHT_TOAST_KEY) === signature;
      if (!seen) sessionStorage.setItem(INSIGHT_TOAST_KEY, signature);
    } catch {
      // Penyimpanan diblokir: toast tampil di tiap kunjungan dashboard.
    }
    if (!seen) {
      visible = insights;
      showStock = stockList.length > 0;
    }
  });
</script>

{#if visible.length > 0 || showStock}
  <div
    class="pointer-events-none fixed left-4 right-4 top-[4.5rem] z-40 flex flex-col items-end gap-2 sm:left-auto sm:w-96 lg:right-6 lg:top-[4.5rem]"
    role="region"
    aria-label="Notifikasi otomatis"
    aria-live="polite"
  >
    {#if showStock}
      <div
        class="pointer-events-auto w-full rounded-panel border border-border-warm bg-surface p-3 shadow-level3"
        in:fly={{ x: 40, duration: reduceMotion ? 0 : 220 }}
        out:fade={{ duration: reduceMotion ? 0 : 150 }}
      >
        <div class="flex items-start gap-2">
          <Package size={16} class="mt-0.5 shrink-0 text-status-warning" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <Badge tone="warning" size="sm">Perlu restock</Badge>
            <p class="mt-1.5 text-body-md text-ink">
              {restock?.habis} habis · {restock?.menipis} menipis: {stockNames.join(', ')}{#if stockMore > 0}
                +{stockMore} lainnya{/if}
            </p>
            <a href="/products?stok=restock" class="mt-1 inline-block text-body-sm font-semibold text-ink-navy hover:underline no-underline">
              Lihat yang perlu restock →
            </a>
          </div>
          <button
            type="button"
            class="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded border-none bg-transparent text-muted hover:bg-table-header hover:text-ink"
            aria-label="Tutup peringatan stok"
            on:click={() => (showStock = false)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    {/if}
    {#each visible as ins, i (keyOf(ins))}
      <div
        class="pointer-events-auto w-full rounded-panel border border-border-warm bg-surface p-3 shadow-level3"
        in:fly={{ x: 40, duration: reduceMotion ? 0 : 220, delay: reduceMotion ? 0 : i * 150 }}
        out:fade={{ duration: reduceMotion ? 0 : 150 }}
        animate:flip={{ duration: reduceMotion ? 0 : 200 }}
      >
        <div class="flex items-start gap-2">
          <Lightbulb size={16} class="mt-0.5 shrink-0 text-ink-navy" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <Badge tone={INSIGHT_META[ins.type].tone} size="sm">{INSIGHT_META[ins.type].title}</Badge>
            <p class="mt-1.5 text-body-md text-ink">{ins.message}</p>
          </div>
          <button
            type="button"
            class="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded border-none bg-transparent text-muted hover:bg-table-header hover:text-ink"
            aria-label="Tutup insight"
            on:click={() => dismiss(keyOf(ins))}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    {/each}
    {#if visible.length + (showStock ? 1 : 0) > 1}
      <button
        type="button"
        class="pointer-events-auto cursor-pointer rounded border border-ink-navy bg-ink-navy px-2.5 py-1 text-label-md text-white hover:bg-ink"
        on:click={dismissAll}
      >
        Tutup semua
      </button>
    {/if}
  </div>
{/if}
