<script lang="ts">
  import PieChart, { PIE_COLORS } from '$lib/components/ui/PieChart.svelte';
  export let labels: string[];
  export let data: number[];
</script>

<div class="relative mx-auto flex w-full max-w-[962px] flex-col items-stretch lg:flex-row lg:items-start">
  <div class="relative z-10 min-w-0 flex-1 rounded-[14px] border border-border-stat bg-surface p-5 shadow-[5px_5.5px_3.5px_rgba(0,0,0,0.25)] lg:min-h-[476px]">
    <h2 class="text-headline-lg text-ink mb-1">Komposisi Profit</h2>
    <p class="text-body-sm text-muted mb-3">Makin besar potongan = makin besar keuntungan produknya</p>
    <div class="mx-auto w-[320px]" style="filter: drop-shadow(0 4px 2px rgba(0, 0, 0, 0.25));">
      <PieChart {labels} {data} showLegend={false} cutout="59%" borderWidth={3} heightClass="h-80" />
    </div>
  </div>
  <aside class="relative z-0 w-full shrink-0 rounded-b-[8px] border border-border-stat bg-ink-navy p-5 pl-10 shadow-[5px_4px_2px_rgba(0,0,0,0.25)] lg:mt-[33px] lg:h-[416px] lg:w-[302px] lg:rounded-l-none lg:rounded-r-[8px] lg:rounded-bl-none">
    <h3 class="text-headline-sm text-white mb-4">Produk</h3>
    <ul class="space-y-3">
      {#each labels as name, i}
        <li class="flex items-center gap-2.5">
          <span class="h-4 w-4 shrink-0 rounded-full ring-1 ring-white/30" style="background-color: {PIE_COLORS[i % PIE_COLORS.length]};"></span>
          <span class="truncate text-body-sm text-white" title={name}>{name}</span>
        </li>
      {/each}
    </ul>
  </aside>
</div>
