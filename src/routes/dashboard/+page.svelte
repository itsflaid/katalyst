<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  export let data;

  const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
</script>

<h1 class="text-headline-lg text-ink mb-6">Dashboard</h1>

<div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
  <Card>
    <p class="text-label-sm uppercase text-muted mb-1">Revenue</p>
    <p class="text-num-display text-ink tabular">{idr(data.summary.revenue)}</p>
  </Card>
  <Card>
    <p class="text-label-sm uppercase text-muted mb-1">Cost</p>
    <p class="text-num-display text-ink tabular">{idr(data.summary.cost)}</p>
  </Card>
  <Card>
    <p class="text-label-sm uppercase text-muted mb-1">Profit</p>
    <p class="text-num-display text-ink tabular">{idr(data.summary.profit)}</p>
  </Card>
  <Card>
    <p class="text-label-sm uppercase text-muted mb-1">Margin</p>
    <p class="text-num-display tabular" class:text-status-positive={data.summary.margin >= 0.3} class:text-ink={data.summary.margin < 0.3}>
      {(data.summary.margin * 100).toFixed(1)}%
    </p>
  </Card>
</div>

<h2 class="text-headline-sm text-ink mb-3">Top 5 Produk (by Revenue)</h2>
<Card class="mb-8 !p-0">
  <ul>
    {#each data.topByRevenue as p, i}
      <li class="flex justify-between items-center px-5 py-3 text-body-md" class:border-b={i < data.topByRevenue.length - 1} class:border-table-divider={i < data.topByRevenue.length - 1}>
        <span class="text-ink">{p.name}</span>
        <span class="tabular text-muted">{idr(p.revenue)} <span class="text-status-positive">· {(p.margin * 100).toFixed(0)}%</span></span>
      </li>
    {/each}
  </ul>
</Card>

<h2 class="text-headline-sm text-ink mb-3">Insight Otomatis</h2>
<div class="flex flex-col gap-3">
  {#each data.insights as insight}
    <Card class="flex items-start gap-3">
      <Badge tone={insight.type === 'high_margin_low_demand' ? 'positive' : 'warning'}>{insight.type}</Badge>
      <p class="text-body-md text-ink">{insight.message}</p>
    </Card>
  {:else}
    <p class="text-body-md text-muted">Belum ada insight — data transaksi masih terlalu sedikit.</p>
  {/each}
</div>
