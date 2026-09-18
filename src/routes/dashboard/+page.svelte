<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import LineChart from '$lib/components/ui/LineChart.svelte';
  import BarChart from '$lib/components/ui/BarChart.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Table from '$lib/components/ui/Table.svelte';
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

  // Dummy juga — belum ada query "periode sebelumnya" buat bandingin.
  // Begitu ada, ganti angka statis ini dengan hasil hitung asli:
  // (nilai sekarang - nilai lalu) / nilai lalu.
  const kpiDeltas = { revenue: 8.4, transactions: -2.1, profit: 11.9, margin: 1.5 };
  const deltaTone = (d: number) => (d >= 0 ? 'positive' : 'negative');
  const fmtDelta = (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(1)}% vs bulan lalu`;

  $: topProductLabels = data.topByRevenue.map((p) => p.name);
  $: topProductRevenue = data.topByRevenue.map((p) => p.revenue);
</script>

<h1 class="text-headline-lg text-ink mb-6">Dashboard</h1>

<!-- Baris 1: 4 KPI full width -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
  <Card>
    <p class="text-label-sm uppercase text-muted mb-1">Revenue</p>
    <p class="text-num-display text-ink tabular mb-1.5">{idr(data.summary.revenue)}</p>
    <Badge tone={deltaTone(kpiDeltas.revenue)}>{fmtDelta(kpiDeltas.revenue)}</Badge>
  </Card>
  <Card>
    <p class="text-label-sm uppercase text-muted mb-1">Jumlah Transaksi</p>
    <p class="text-num-display text-ink tabular mb-1.5">{num(data.transactionCount)}</p>
    <Badge tone={deltaTone(kpiDeltas.transactions)}>{fmtDelta(kpiDeltas.transactions)}</Badge>
  </Card>
  <Card>
    <p class="text-label-sm uppercase text-muted mb-1">Profit</p>
    <p class="text-num-display text-ink tabular mb-1.5">{idr(data.summary.profit)}</p>
    <Badge tone={deltaTone(kpiDeltas.profit)}>{fmtDelta(kpiDeltas.profit)}</Badge>
  </Card>
  <Card>
    <p class="text-label-sm uppercase text-muted mb-1">Margin</p>
    <p class="text-num-display text-ink tabular mb-1.5">{(data.summary.margin * 100).toFixed(1)}%</p>
    <Badge tone={data.summary.margin >= 0.3 ? 'positive' : 'warning'}>
      {data.summary.margin >= 0.3 ? 'Sehat' : 'Perlu perhatian'}
    </Badge>
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
    {#if data.recentTransactions.length === 0}
      <Card class="text-center py-8">
        <p class="text-body-md text-muted">Belum ada transaksi.</p>
      </Card>
    {:else}
      <Table headers={['Produk', 'Qty', 'Waktu', 'Total']}>
        {#each data.recentTransactions as t}
          <tr>
            <td class="px-3 py-2 text-ink">{t.productName}</td>
            <td class="px-3 py-2 tabular text-muted">{t.quantity}×</td>
            <td class="px-3 py-2 text-body-sm text-muted whitespace-nowrap">{fmtDate(t.createdAt)}</td>
            <td class="px-3 py-2 tabular text-ink whitespace-nowrap">{idr(t.quantity * t.priceAtSale)}</td>
          </tr>
        {/each}
      </Table>
      <div class="text-right mt-2">
        <a href="/transactions" class="text-body-md font-semibold text-status-positive hover:underline no-underline">Lihat lainnya →</a>
      </div>
    {/if}
  </div>

  <!-- Kolom kanan: Copilot — diisi teaser + quick prompts, bukan cuma judul kosong -->
  <div class="w-full lg:w-80 flex-shrink-0">
    <div class="relative overflow-hidden rounded-panel bg-ink-navy p-5 shadow-level1 min-h-[280px] flex flex-col">
      <div class="flex items-center gap-2.5 mb-3">
        <img src="/logo/logo-copilot.png" alt="Copilot AI" class="h-8 w-8 flex-shrink-0 rounded object-cover" />
        <h2 class="text-headline-sm text-white">Katalyst Copilot</h2>
      </div>
      <p class="text-body-sm text-white/65 mb-4">Tanya apa aja soal performa bisnismu bulan ini.</p>

      <div class="flex flex-col gap-2 mb-4">
        <a href="/copilot" class="block rounded border border-white/10 bg-white/5 px-3 py-2 text-body-sm text-white/85 no-underline hover:bg-white/10">
          "Produk mana yang marginnya paling tipis?"
        </a>
        <a href="/copilot" class="block rounded border border-white/10 bg-white/5 px-3 py-2 text-body-sm text-white/85 no-underline hover:bg-white/10">
          "Kenapa profit bulan ini turun?"
        </a>
      </div>

      
      <a  href="/copilot"
        class="mt-auto flex items-center justify-center gap-2 rounded bg-status-positive text-white text-body-md font-semibold py-2 no-underline hover:opacity-90"
      >
        Buka Copilot
      </a>
    </div>
  </div>
</div>