<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  export let data;
  const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
</script>

<h1 class="text-2xl font-semibold mb-2">{data.product.name}</h1>
<p class="text-sm text-neutral-500 mb-6">Harga modal {idr(data.product.costPrice)} · Harga jual {idr(data.product.sellingPrice)}</p>

<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
  <Card><p class="text-sm text-neutral-500">Terjual</p><p class="text-xl font-semibold">{data.performance.quantitySold}</p></Card>
  <Card><p class="text-sm text-neutral-500">Revenue</p><p class="text-xl font-semibold">{idr(data.performance.revenue)}</p></Card>
  <Card><p class="text-sm text-neutral-500">Profit</p><p class="text-xl font-semibold">{idr(data.performance.profit)}</p></Card>
  <Card><p class="text-sm text-neutral-500">Margin</p><p class="text-xl font-semibold">{(data.performance.margin * 100).toFixed(1)}%</p></Card>
</div>

<a href={`/simulator?productId=${data.product.id}`} class="inline-block mt-6 text-sm text-blue-600 underline">
  Coba simulasikan skenario harga →
</a>
