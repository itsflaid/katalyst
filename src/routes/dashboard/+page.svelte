<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import LineChart from '$lib/components/ui/LineChart.svelte';
  import BarChart from '$lib/components/ui/BarChart.svelte';
  export let data;

  const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
  const num = (n: number) => new Intl.NumberFormat('id-ID').format(n);
  const fmtDate = (d: string | Date) => new Date(d).toLocaleString('id-ID');

  // Dummy sementara — loader dashboard belum ada query time-series
  // harian, jadi trend line ini cuma buat isi layout dulu. Nanti tinggal
  // ganti array di bawah dengan hasil query group-by-tanggal beneran.
  const trendLabels = ['1', '5', '10', '15', '20', '25', '30'];
  const revenueTrend = [3.1, 3.6, 2.4, 4.2, 6.8, 4.9, 5.3];
  const profitTrend = [1.1, 1.3, 0.9, 1.7, 2.7, 1.9, 2.1];

  $: topProductLabels = data.topByRevenue.map((p) => p.name);
  $: topProductRevenue = data.topByRevenue.map((p) => p.revenue);
</script>

<h1 class="text-headline-lg text-ink mb-6">Dashboard</h1>

<!-- Baris 1: 4 KPI full width -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
  <Card>
    <p class="text-label-sm uppercase text-muted mb-1">Revenue</p>
    <p class="text-num-display text-ink tabular">{idr(data.summary.revenue)}</p>
  </Card>
  <Card>
    <p class="text-label-sm uppercase text-muted mb-1">Jumlah Transaksi</p>
    <p class="text-num-display text-ink tabular">{num(data.transactionCount)}</p>
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

<!-- Baris 2: 2 grafik 50-50 -->
<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
  <Card>
    <h2 class="text-headline-sm text-ink mb-3">Tren Revenue & Profit</h2>
    <LineChart
      labels={trendLabels}
      datasets={[
        { label: 'Revenue', data: revenueTrend, color: '#172554' },
        { label: 'Profit', data: profitTrend, color: '#16A34A' }
      ]}
    />
  </Card>
  <Card>
    <h2 class="text-headline-sm text-ink mb-3">Revenue per Produk (Top 5)</h2>
    <BarChart labels={topProductLabels} data={topProductRevenue} />
  </Card>
</div>

<!-- Baris 3: kiri Transaksi Terbaru (flex-1) + kanan Copilot (lg:w-80) -->
<div class="flex flex-col lg:flex-row gap-6 items-start">
  <div class="flex-1 min-w-0 w-full">
    <h2 class="text-headline-sm text-ink mb-3">Transaksi Terbaru</h2>
    <Card class="!p-0 overflow-hidden">
      <ul>
        {#each data.recentTransactions as t, i}
          <li
            class="flex justify-between items-center gap-4 px-5 py-3 text-body-md"
            class:border-b={i < data.recentTransactions.length - 1}
            class:border-table-divider={i < data.recentTransactions.length - 1}
          >
            <div class="min-w-0">
              <p class="text-ink truncate">{t.productName}</p>
              <p class="text-body-sm text-muted">{t.quantity}× · {fmtDate(t.createdAt)}</p>
            </div>
            <span class="tabular text-ink whitespace-nowrap">{idr(t.quantity * t.priceAtSale)}</span>
          </li>
        {:else}
          <li class="px-5 py-4 text-body-md text-muted">Belum ada transaksi.</li>
        {/each}
      </ul>
      {#if data.recentTransactions.length > 0}
        <div class="border-t border-table-divider px-5 py-3 text-right">
          <a href="/transactions" class="text-body-md font-semibold text-status-positive hover:underline no-underline">Lihat lainnya →</a>
        </div>
      {/if}
    </Card>
  </div>

  <!-- Kolom kanan: shell Copilot, belum ada konten -->
  <div class="w-full lg:w-80 flex-shrink-0">
    <div class="rounded-panel bg-ink-navy p-5 shadow-level1 min-h-[280px]">
      <h2 class="text-headline-sm text-white">Katalyst Copilot</h2>
    </div>
  </div>
</div>
