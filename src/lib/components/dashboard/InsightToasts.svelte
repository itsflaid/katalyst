<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { Lightbulb, Package, X } from 'lucide-svelte';
  import type { BusinessInsight } from '$lib/analytics';
  import Badge from '$lib/components/ui/Badge.svelte';
  import { INSIGHT_META, type BellRestock } from '$lib/components/dashboard/insight-meta';
  import { INSIGHT_TOAST_KEY, insightSignature } from '$lib/shared/insight-toast';

  export let insights: BusinessInsight[];
  export let restock: BellRestock | undefined = undefined;

  type Toast = { kind: 'stock'; key: string } | { kind: 'insight'; key: string; insight: BusinessInsight };

  const ENTER_DELAY_MS = 500;
  const ENTER_STEP_MS = 450;
  const EXIT_MS = 280;

  let toasts: Toast[] = [];
  let reduceMotion = false;

  const keyOf = (i: BusinessInsight) => `${i.type}:${i.productId}`;
  const dismiss = (key: string) => (toasts = toasts.filter((t) => t.key !== key));
  const dismissAll = () => (toasts = []);

  // Stok ikut tanda tangan: habis/menipis berubah berarti toast tampil lagi.
  const stockSignature = (r: BellRestock | undefined) =>
    (r?.list ?? [])
      .map((p) => `${p.id}:${p.stock}`)
      .sort()
      .join(',');
  $: stockList = restock?.list ?? [];
  $: stockNames = stockList.slice(0, 3).map((p) => p.name);
  $: stockMore = stockList.length > 3 ? stockList.length - 3 : 0;

  function pendingToasts(): Toast[] {
    if (insights.length === 0 && stockList.length === 0) return [];
    const signature = `${insightSignature(insights)}#${stockSignature(restock)}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(INSIGHT_TOAST_KEY) === signature;
      if (!seen) sessionStorage.setItem(INSIGHT_TOAST_KEY, signature);
    } catch {
      // Penyimpanan diblokir: toast tampil di tiap kunjungan dashboard.
    }
    if (seen) return [];
    const list: Toast[] = [];
    if (stockList.length > 0) list.push({ kind: 'stock', key: 'stock' });
    for (const insight of insights) list.push({ kind: 'insight', key: keyOf(insight), insight });
    return list;
  }

  onMount(() => {
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers = pendingToasts().map((toast, i) =>
      setTimeout(() => (toasts = [...toasts, toast]), reduceMotion ? 0 : ENTER_DELAY_MS + i * ENTER_STEP_MS)
    );
    return () => timers.forEach(clearTimeout);
  });

  // Tinggi dan margin runtuh bersamaan dengan geser ke kanan, jadi kartu di bawahnya naik tanpa loncat.
  function exit(node: Element) {
    const duration = reduceMotion ? 0 : EXIT_MS;
    const x = window.innerWidth - node.getBoundingClientRect().left;
    const collapse = slide(node, { duration });
    const away = fly(node, { x, duration });
    return {
      duration,
      easing: cubicOut,
      css: (t: number, u: number) => `${collapse.css?.(t, u) ?? ''};${away.css?.(t, u) ?? ''}`
    };
  }
</script>

<div
  class="pointer-events-none fixed left-4 right-4 top-[4.5rem] z-40 flex flex-col items-end sm:left-auto sm:w-96 lg:right-6 lg:top-[4.5rem]"
  role="region"
  aria-label="Notifikasi otomatis"
  aria-live="polite"
>
  {#each toasts as toast (toast.key)}
    <div
      class="pointer-events-auto mb-2 w-full rounded-panel border border-border-warm bg-surface p-3 shadow-level3"
      in:fly={{ x: 80, duration: reduceMotion ? 0 : 280, easing: cubicOut }}
      out:exit
    >
      {#if toast.kind === 'stock'}
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
            on:click={() => dismiss(toast.key)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      {:else}
        <div class="flex items-start gap-2">
          <Lightbulb size={16} class="mt-0.5 shrink-0 text-ink-navy" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <Badge tone={INSIGHT_META[toast.insight.type].tone} size="sm">{INSIGHT_META[toast.insight.type].title}</Badge>
            <p class="mt-1.5 text-body-md text-ink">{toast.insight.message}</p>
          </div>
          <button
            type="button"
            class="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded border-none bg-transparent text-muted hover:bg-table-header hover:text-ink"
            aria-label="Tutup insight"
            on:click={() => dismiss(toast.key)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      {/if}
    </div>
  {/each}
  {#if toasts.length > 1}
    <button
      type="button"
      class="pointer-events-auto cursor-pointer rounded border border-ink-navy bg-ink-navy px-2.5 py-1 text-label-md text-white hover:bg-ink"
      transition:fade={{ duration: reduceMotion ? 0 : 150 }}
      on:click={dismissAll}
    >
      Tutup semua
    </button>
  {/if}
</div>
