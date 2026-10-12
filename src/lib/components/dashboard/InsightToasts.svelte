<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { Lightbulb, X } from 'lucide-svelte';
  import type { BusinessInsight, InsightType } from '$lib/analytics';
  import Badge from '$lib/components/ui/Badge.svelte';
  import { INSIGHT_TOAST_KEY, insightSignature } from '$lib/shared/insight-toast';

  export let insights: BusinessInsight[];

  const META: Record<InsightType, { title: string; tone: 'warning' | 'positive' }> = {
    high_revenue_low_profit: { title: 'Omzet besar, profit tipis', tone: 'warning' },
    popular_low_margin: { title: 'Laris tapi margin tipis', tone: 'warning' },
    high_margin_low_demand: { title: 'Margin tinggi, peminat sedikit', tone: 'positive' }
  };

  let visible: BusinessInsight[] = [];
  let reduceMotion = false;

  const keyOf = (i: BusinessInsight) => `${i.type}:${i.productId}`;
  const dismiss = (key: string) => (visible = visible.filter((i) => keyOf(i) !== key));
  const dismissAll = () => (visible = []);

  onMount(() => {
    if (insights.length === 0) return;
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const signature = insightSignature(insights);
    let seen = false;
    try {
      seen = sessionStorage.getItem(INSIGHT_TOAST_KEY) === signature;
      if (!seen) sessionStorage.setItem(INSIGHT_TOAST_KEY, signature);
    } catch {
      // Penyimpanan diblokir: toast tampil di tiap kunjungan dashboard.
    }
    if (!seen) visible = insights;
  });
</script>

{#if visible.length > 0}
  <div
    class="pointer-events-none fixed left-4 right-4 top-[4.5rem] z-40 flex flex-col items-end gap-2 sm:left-auto sm:w-96 lg:top-4"
    role="region"
    aria-label="Insight otomatis"
    aria-live="polite"
  >
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
            <Badge tone={META[ins.type].tone} size="sm">{META[ins.type].title}</Badge>
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
    {#if visible.length > 1}
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
