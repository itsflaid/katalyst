<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  export let data;

  const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
</script>

<h1 class="text-2xl font-semibold mb-6">Dashboard</h1>

<div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
  <Card><p class="text-sm text-neutral-500">Revenue</p><p class="text-xl font-semibold">{idr(data.summary.revenue)}</p></Card>
  <Card><p class="text-sm text-neutral-500">Cost</p><p class="text-xl font-semibold">{idr(data.summary.cost)}</p></Card>
  <Card><p class="text-sm text-neutral-500">Profit</p><p class="text-xl font-semibold">{idr(data.summary.profit)}</p></Card>
  <Card><p class="text-sm text-neutral-500">Margin</p><p class="text-xl font-semibold">{(data.summary.margin * 100).toFixed(1)}%</p></Card>
</div>

<h2 class="text-lg font-medium mb-3">Top 5 Produk (by Revenue)</h2>
<Card class="mb-8">
  <ul class="divide-y divide-neutral-100">
    {#each data.topByRevenue as p}
      <li class="flex justify-between py-2 text-sm">
        <span>{p.name}</span>
        <span>{idr(p.revenue)} · margin {(p.margin * 100).toFixed(0)}%</span>
      </li>
    {/each}
  </ul>
</Card>

<h2 class="text-lg font-medium mb-3">Insight Otomatis</h2>
<div class="flex flex-col gap-3">
  {#each data.insights as insight}
    <Card class="flex items-start gap-3">
      <Badge tone={insight.type === 'high_margin_low_demand' ? 'success' : 'warning'}>{insight.type}</Badge>
      <p class="text-sm">{insight.message}</p>
    </Card>
  {:else}
    <p class="text-sm text-neutral-500">Belum ada insight — data transaksi masih terlalu sedikit.</p>
  {/each}
</div>
