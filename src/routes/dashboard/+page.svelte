<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import LineChart from '$lib/components/ui/LineChart.svelte';
  import BarChart from '$lib/components/ui/BarChart.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Table from '$lib/components/ui/Table.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import { page } from '$app/stores';
  import { fmtWita } from '$lib/time';
  export let data;
  const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
  const num = (n: number) => new Intl.NumberFormat('id-ID').format(n);
  const fmtDate = (d: string | Date) => fmtWita(d, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // Tren + delta 30 hari dihitung di load (agregat harian SQL 60 hari:
  // 30 terakhir buat chart, 30 vs 30 sebelumnya buat delta). Nilai tren
  // dalam jt Rp biar sumbu terbaca. Delta null = tumbuh dari nol.
  $: trendLabels = data.trend.labels;
  $: revenueTrend = data.trend.revenue;
  $: profitTrend = data.trend.profit;
  $: kpiDeltas = data.deltas;
  const deltaTone = (d: number | null) => (d === null || d >= 0 ? 'positive' : 'negative');
  const fmtDeltaShort = (d: number | null) => (d === null ? 'baru' : `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`);

  $: topProductLabels = data.topByRevenue.map((p) => p.name);
  $: topProductRevenue = data.topByRevenue.map((p) => p.revenue);
</script>

<PageHeader title="Dashboard" />

<!-- Baris 1: 4 KPI full width — di HP tetap 4 sebaris versi kompak -->
<div class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4 mb-6">
  <Card class="min-w-0 overflow-hidden p-3 sm:p-5">
    <p class="text-label-sm uppercase text-muted mb-1 truncate">Revenue</p>
    <p class="text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular mb-1.5 break-words [overflow-wrap:anywhere]">{idr(data.summary.revenue)}</p>
    <Badge tone={deltaTone(kpiDeltas.revenue)} class="text-[11px] sm:text-label-md">{fmtDeltaShort(kpiDeltas.revenue)}<span class="hidden sm:inline">&nbsp;vs 30 hari lalu</span></Badge>
  </Card>
  <Card class="min-w-0 overflow-hidden p-3 sm:p-5">
    <p class="text-label-sm uppercase text-muted mb-1 truncate">Transaksi</p>
    <p class="text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular mb-1.5 break-words">{num(data.transactionCount)}</p>
    <Badge tone={deltaTone(kpiDeltas.transactions)} class="text-[11px] sm:text-label-md">{fmtDeltaShort(kpiDeltas.transactions)}<span class="hidden sm:inline">&nbsp;vs 30 hari lalu</span></Badge>
  </Card>
  <Card class="min-w-0 overflow-hidden p-3 sm:p-5">
    <p class="text-label-sm uppercase text-muted mb-1 truncate">Profit</p>
    <p class="text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular mb-1.5 break-words [overflow-wrap:anywhere]">{idr(data.summary.profit)}</p>
    <Badge tone={deltaTone(kpiDeltas.profit)} class="text-[11px] sm:text-label-md">{fmtDeltaShort(kpiDeltas.profit)}<span class="hidden sm:inline">&nbsp;vs 30 hari lalu</span></Badge>
  </Card>
  <Card class="min-w-0 overflow-hidden p-3 sm:p-5">
    <p class="text-label-sm uppercase text-muted mb-1 truncate">Margin</p>
    <p class="text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular mb-1.5 break-words">{(data.summary.margin * 100).toFixed(1)}%</p>
    <Badge tone={data.summary.margin >= 0.3 ? 'positive' : 'warning'} class="text-[11px] sm:text-label-md">
      {data.summary.margin >= 0.3 ? 'Sehat' : 'Perlu perhatian'}
    </Badge>
  </Card>
</div>

<!-- Baris 2: 2 grafik 50-50. {#key} biar chart dibuat ulang + animasi
     entrance tiap masuk halaman. -->
{#key $page.url.pathname}
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
  <Card>
    <h2 class="text-headline-sm text-ink mb-1">Tren Revenue & Profit</h2>
    <p class="text-body-sm text-muted mb-3">{data.trend.unitLabel} · 30 hari terakhir</p>
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
{/key}

{#if data.insights.length > 0}
  <Card class="mb-6">
    <h2 class="text-headline-sm text-ink mb-3">Insight otomatis</h2>
    <ul class="flex flex-col gap-2.5">
      {#each data.insights as ins}
        <li class="rounded border border-border-cool bg-table-header px-3 py-2.5 text-body-md text-ink">{ins.message}</li>
      {/each}
    </ul>
  </Card>
{/if}

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