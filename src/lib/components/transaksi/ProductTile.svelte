<script lang="ts">
  import Badge from '$lib/components/ui/Badge.svelte';
  export let name: string;
  export let stock: number;
  export let netPrice: number;
  export let grossPrice: number;
  export let discountPercent: number | null = null;
  export let status: 'normal' | 'menipis' | 'habis' = 'normal';
  export let inCart = 0;
  export let maxed = false;
  const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
  // Inisial dua huruf cukup sebagai pengenal visual tanpa foto produk.
  $: initials = ((n: string) => {
    const words = n.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  })(name);
  $: disabled = status === 'habis' || maxed;
  $: label = `${name}, ${idr(netPrice)}, ${status === 'habis' ? 'habis' : `sisa ${stock}`}${inCart > 0 ? `, di keranjang ${inCart}` : ''}`;
</script>

<button
  type="button"
  {disabled}
  aria-label={label}
  title={maxed ? 'Stok sudah mentok di keranjang' : undefined}
  on:click
  class="relative flex h-28 flex-col justify-between rounded-panel border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-navy focus-visible:ring-offset-1 {status === 'habis'
    ? 'cursor-not-allowed border-border-cool bg-status-neutral-bg opacity-60'
    : inCart > 0
      ? 'border-status-positive bg-status-positive-bg'
      : 'border-border-input bg-white hover:border-ink-navy'} {maxed && status !== 'habis' ? 'cursor-not-allowed' : ''}"
>
  {#if inCart > 0}
    <span class="absolute -left-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded bg-status-positive px-1 text-label-sm tabular text-white">{inCart}</span>
  {/if}
  <span class="flex items-start justify-between gap-2">
    <span class="grid h-7 w-7 shrink-0 place-items-center rounded text-label-md {inCart > 0 && status !== 'habis' ? 'bg-status-positive text-white' : 'bg-status-neutral-bg text-ink-navy'}">{initials}</span>
    {#if status === 'habis'}
      <Badge size="sm" tone="negative">Habis</Badge>
    {:else if status === 'menipis'}
      <Badge size="sm" tone="warning">Sisa {stock}</Badge>
    {:else}
      <span class="inline-flex items-center whitespace-nowrap rounded border border-ink-navy bg-ink-navy/10 px-1.5 py-px text-[10px] font-semibold leading-[14px] tracking-wide text-ink-navy">Sisa {stock}</span>
    {/if}
  </span>
  <span class="flex min-h-0 flex-col gap-0.5">
    <span class="line-clamp-2 text-body-md font-semibold text-ink">{name}</span>
    <span class="flex flex-wrap items-center gap-1.5">
      {#if discountPercent !== null}
        <s class="text-body-sm tabular text-muted">{idr(grossPrice)}</s>
        <span class="text-body-md font-bold tabular text-ink-navy">{idr(netPrice)}</span>
        <Badge size="sm" tone="positive">−{discountPercent}%</Badge>
      {:else}
        <span class="text-body-md font-bold tabular text-ink-navy">{idr(netPrice)}</span>
      {/if}
    </span>
  </span>
</button>
