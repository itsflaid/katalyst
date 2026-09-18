<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  export let data;
  const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
  const num = (n: number) => new Intl.NumberFormat('id-ID').format(n);
</script>

<a href="/products" class="text-body-sm text-muted hover:text-ink no-underline hover:underline">← Kembali ke Produk</a>
<div class="flex flex-wrap items-center gap-3 mt-2 mb-6">
  <h1 class="text-headline-lg text-ink">{data.product.name}</h1>
  <Badge size="sm" tone={data.product.isActive ? 'positive' : 'neutral'}>{data.product.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
</div>
<p class="text-body-md text-muted mb-6">Harga modal {idr(data.product.costPrice)} · Harga jual {idr(data.product.sellingPrice)}</p>

{#if data.performance.quantitySold === 0}
  <Card class="text-center py-8 mb-6">
    <p class="text-body-md text-muted">Belum ada penjualan untuk produk ini.</p>
  </Card>
{:else}
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
    <Card><p class="text-label-sm uppercase text-muted">Terjual</p><p class="text-num-display text-ink tabular">{num(data.performance.quantitySold)}</p></Card>
    <Card><p class="text-label-sm uppercase text-muted">Revenue</p><p class="text-num-display text-ink tabular break-words [overflow-wrap:anywhere]">{idr(data.performance.revenue)}</p></Card>
    <Card><p class="text-label-sm uppercase text-muted">Profit</p><p class="text-num-display text-ink tabular break-words [overflow-wrap:anywhere]">{idr(data.performance.profit)}</p></Card>
    <Card><p class="text-label-sm uppercase text-muted">Margin</p><p class="text-num-display text-ink tabular">{(data.performance.margin * 100).toFixed(1)}%</p></Card>
  </div>
{/if}

<div class="flex flex-wrap gap-2">
  <a href={`/simulator?productId=${data.product.id}`} class="inline-flex items-center justify-center h-9 px-4 rounded bg-ink-navy border border-ink-navy text-white text-label-lg no-underline hover:bg-ink">Coba simulasikan skenario harga →</a>
  <a href="/products" class="inline-flex items-center justify-center h-9 px-4 rounded bg-white border border-border-input text-ink text-label-lg no-underline hover:bg-table-header">Ke daftar produk</a>
</div>
