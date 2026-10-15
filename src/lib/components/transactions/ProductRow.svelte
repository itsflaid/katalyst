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
  // Baris terpilih memakai aksen navy seperti mode kotak biar konsisten.
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
  class="relative flex w-full items-center gap-3 rounded-panel border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-navy focus-visible:ring-offset-1 {status ===
  'habis'
    ? 'cursor-not-allowed border-border-cool bg-status-neutral-bg opacity-60'
    : tapped
      ? 'border-ink-navy bg-ink-navy/5'
      : 'border-border-input bg-white hover:border-ink-navy'} {maxed && status !== 'habis' ? 'cursor-not-allowed' : ''}"
>
  {#if inCart > 0}
    <span
      class="absolute -left-1.5 top-1/2 grid h-5 min-w-5 -translate-y-1/2 place-items-center rounded bg-ink-navy px-1 text-label-sm tabular text-white"
      >{inCart}</span
    >
  {/if}
  <span class="grid h-9 w-9 shrink-0 place-items-center rounded {tapped ? 'bg-ink-navy text-white' : 'bg-status-neutral-bg text-ink-navy'}"
    ><Package size={18} aria-hidden="true" /></span
  >
  <span class="min-w-0 flex-1">
    <span class="block truncate text-body-md font-semibold text-ink">{name}</span>
    <span class="mt-0.5 flex flex-wrap items-center gap-1.5">
      {#if discountPercent !== null}
        <s class="text-body-sm tabular text-muted">{fmtRupiah(grossPrice)}</s>
        <span class="text-body-md font-bold tabular text-ink-navy">{fmtRupiah(netPrice)}</span>
        <Badge size="sm" tone={tapped ? 'navy' : 'positive'}>−{discountPercent}%</Badge>
      {:else}
        <span class="text-body-md font-bold tabular text-ink-navy">{fmtRupiah(netPrice)}</span>
      {/if}
    </span>
  </span>
  <span class="shrink-0">
    {#if status === 'habis'}
      <Badge size="sm" tone="negative">Habis</Badge>
    {:else if status === 'menipis'}
      <Badge size="sm" tone={tapped ? 'navy' : 'warning'}>Sisa {stock}</Badge>
    {:else}
      <Badge size="sm" tone={tapped ? 'navy' : 'positive'}>Sisa {stock}</Badge>
    {/if}
  </span>
</button>
