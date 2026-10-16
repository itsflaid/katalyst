<script lang="ts">
  import Badge from '$lib/components/ui/Badge.svelte';
  import { Package } from 'lucide-svelte';
  import { fmtRupiah } from '$lib/shared/format';
  export let name: string;
  export let stock: number;
  export let netPrice: number;
  export let grossPrice: number;
  export let discountPercent: number | null = null;
  export let status: 'normal' | 'menipis' | 'habis' = 'normal';
  export let inCart = 0;
  export let maxed = false;
  // Produk di keranjang memakai ikon dan badge navy biar status terpilih kebaca.
  $: tapped = inCart > 0 && status !== 'habis';
  $: disabled = status === 'habis' || maxed;
  $: label = `${name}, ${fmtRupiah(netPrice)}, ${status === 'habis' ? 'habis' : `sisa ${stock}`}${inCart > 0 ? `, di keranjang ${inCart}` : ''}`;
</script>

<button
  type="button"
  {disabled}
  aria-label={label}
  title={maxed ? 'Stok sudah mentok di keranjang' : undefined}
  on:click
  class="relative flex h-28 flex-col justify-between rounded-panel border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-navy focus-visible:ring-offset-1 {status ===
  'habis'
    ? 'cursor-not-allowed border-border-cool bg-status-neutral-bg opacity-60'
    : inCart > 0
      ? 'border-ink-navy bg-ink-navy/5'
      : 'border-border-input bg-white hover:border-ink-navy'} {maxed && status !== 'habis' ? 'cursor-not-allowed' : ''}"
>
  {#if inCart > 0}
    <span class="absolute -left-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded bg-ink-navy px-1 text-label-sm tabular text-white"
      >{inCart}</span
    >
  {/if}
  <span class="flex items-start justify-between gap-2">
    <span
      class="grid h-7 w-7 shrink-0 place-items-center rounded text-label-md {tapped
        ? 'bg-ink-navy text-white'
        : 'bg-status-neutral-bg text-ink-navy'}"><Package size={16} aria-hidden="true" /></span
    >
    {#if status === 'habis'}
      <Badge size="sm" tone="negative">Habis</Badge>
    {:else if status === 'menipis'}
      <Badge size="sm" tone={tapped ? 'navy' : 'warning'}>Sisa {stock}</Badge>
    {:else}
      <Badge size="sm" tone={tapped ? 'navy' : 'positive'}>Sisa {stock}</Badge>
    {/if}
  </span>
  <span class="flex min-h-0 flex-col gap-0.5">
    <span class="line-clamp-2 text-body-md font-semibold text-ink">{name}</span>
    <span class="flex flex-wrap items-center gap-1.5">
      {#if discountPercent !== null}
        <s class="text-body-sm tabular text-muted">{fmtRupiah(grossPrice)}</s>
        <span class="text-body-md font-bold tabular text-ink-navy">{fmtRupiah(netPrice)}</span>
        <Badge size="sm" tone={tapped ? 'navy' : 'positive'}>−{discountPercent}%</Badge>
      {:else}
        <span class="text-body-md font-bold tabular text-ink-navy">{fmtRupiah(netPrice)}</span>
      {/if}
    </span>
  </span>
</button>
