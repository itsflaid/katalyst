<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Table from '$lib/components/ui/Table.svelte';
  import LineChart from '$lib/components/ui/LineChart.svelte';
  import BarChart from '$lib/components/ui/BarChart.svelte';
  import PieChart from '$lib/components/ui/PieChart.svelte';
  import ScatterChart from '$lib/components/ui/ScatterChart.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import SlideOver from '$lib/components/ui/SlideOver.svelte';
  import StatFilterBar from '$lib/components/statistik/StatFilterBar.svelte';
  import StatCard from '$lib/components/statistik/StatCard.svelte';
  import DonutLegendCard from '$lib/components/statistik/DonutLegendCard.svelte';
  import { Receipt } from 'lucide-svelte';
  import type { PeriodKey } from '$lib/shared/period';
  import { goto } from '$app/navigation';
  export let data;

  const idrFmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  const numFmt = new Intl.NumberFormat('id-ID');
  const idr = (n: number) => idrFmt.format(n);
  const num = (n: number) => numFmt.format(n);
  const deltaTone = (d: number | null) => (d === null || d >= 0 ? 'positive' : 'negative');
  const fmtDelta = (d: number | null) => (d === null ? 'baru' : `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`);
  const fmtShort = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)} jt` : v >= 1_000 ? `${Math.round(v / 1_000)} rb` : `${v}`;

  $: activeRange = data.range ?? '30d';
  let fromInput: string = data.rangeFrom ?? '';
  let toInput: string = data.rangeTo ?? '';

  function goWithRange(key: PeriodKey, from = '', to = '') {
    activeRange = key;
    showPeriodSheet = false;
    const u = new URL(window.location.href);
    u.searchParams.set('range', key);
    if (from) u.searchParams.set('from', from);
    else u.searchParams.delete('from');
    if (to) u.searchParams.set('to', to);
    else u.searchParams.delete('to');
    u.searchParams.delete('page');
    goto(u.toString(), { invalidateAll: true });
  }

  function applyCustom() {
    if (!fromInput && !toInput) return;
    goWithRange('custom', fromInput, toInput);
  }

  const btn = (current: string, key: string) =>
    `rounded border px-2.5 py-1.5 text-body-sm ${current === key ? 'border-ink-navy bg-ink-navy text-white font-semibold' : 'border-border-input bg-white text-ink hover:bg-table-header'}`;
  const rangeNames: Record<string, string> = { today: 'Hari ini', week: 'Minggu ini', '30d': '30 hari', month: 'Bulan ini', custom: 'Custom' };

  let showPeriodSheet = false;

  // Kartu "Performa per Produk": satu kartu + toggle metrik (client-side).
  let perfMetric: 'revenue' | 'profit' | 'margin' = 'revenue';
  $: perfSorted = [...data.productPerf]
    .sort((a, b) =>
      perfMetric === 'revenue' ? b.revenue - a.revenue : perfMetric === 'profit' ? b.profit - a.profit : b.margin - a.margin
    )
    .slice(0, 8);
  $: perfUnit = perfMetric === 'margin' ? '% · 8 teratas' : `${perfMetric === 'revenue' ? 'Nominal' : 'Nominal'} · 8 teratas`;
  const perfBtn = (current: 'revenue' | 'profit' | 'margin', key: 'revenue' | 'profit' | 'margin') =>
    `rounded-[5px] border border-border-stat px-2.5 py-1 text-body-sm ${current === key ? 'bg-ink-navy text-white font-semibold' : 'bg-surface text-ink hover:bg-table-header'}`;

  // Warna per-bar chart estimasi hari stok: ≤3 hari merah, ≤7 amber, sisanya navy.
  $: daysColors = data.inventory.daysList.map((p) =>
    p.days <= 3 ? '#DC2626' : p.days <= 7 ? '#B45309' : '#172554'
  );
</script>

<PageHeader title="Statistik" subtitle="Laporan performa per periode — delta selalu dibanding periode sebelumnya yang sama panjang." />

<StatCard class="mb-6 p-0 shadow-stat-bar">
  <StatFilterBar
    {activeRange}
    rangeLabel={data.rangeLabel}
    bind:fromInput
    bind:toInput
    onSelect={(k) => goWithRange(k)}
    onApply={applyCustom}
  />
  <div class="sm:hidden flex flex-col gap-2 p-5">
    <button type="button" on:click={() => (showPeriodSheet = true)} class="inline-flex h-9 items-center justify-between rounded border border-border-input bg-white px-3 text-body-md text-ink">
      <span>Periode: <strong>{rangeNames[activeRange] ?? '30 hari'}</strong></span>
      <span aria-hidden="true" class="text-muted">▾</span>
    </button>
    {#if data.rangeLabel}
      <span class="text-body-sm text-muted">Dipakai: <strong class="text-ink">{data.rangeLabel}</strong></span>
    {/if}
  </div>
</StatCard>

{#if showPeriodSheet}
  <SlideOver title="Pilih Periode" onClose={() => (showPeriodSheet = false)}>
    <div class="flex flex-col gap-2">
      <button type="button" on:click={() => goWithRange('today')} class={`${btn(activeRange, 'today')} w-full text-left`}>Hari ini</button>
      <button type="button" on:click={() => goWithRange('week')} class={`${btn(activeRange, 'week')} w-full text-left`}>Minggu ini</button>
      <button type="button" on:click={() => goWithRange('30d')} class={`${btn(activeRange, '30d')} w-full text-left`}>30 hari</button>
      <button type="button" on:click={() => goWithRange('month')} class={`${btn(activeRange, 'month')} w-full text-left`}>Bulan ini</button>
      <div class="flex flex-col gap-2 rounded border border-border-cool p-3">
        <label class="flex flex-col gap-1 text-body-md text-ink">
          Dari
          <input type="date" bind:value={fromInput} class="h-9 w-full min-w-0 rounded border border-border-input bg-white px-2 text-body-sm text-ink" />
        </label>
        <label class="flex flex-col gap-1 text-body-md text-ink">
          Sampai
          <input type="date" bind:value={toInput} min={fromInput || undefined} class="h-9 w-full min-w-0 rounded border border-border-input bg-white px-2 text-body-sm text-ink" />
        </label>
        <Button class="w-full" on:click={applyCustom}>Terapkan</Button>
      </div>
    </div>
  </SlideOver>
{/if}

{#key [data.range, data.rangeFrom, data.rangeTo, data.trend.labels.join(',')].join('|')}
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
    <StatCard>
      <h2 class="text-headline-sm text-ink mb-1">Tren Revenue & Profit</h2>
      <p class="text-body-sm text-muted mb-3">{data.trend.unitLabel} · {data.rangeLabel}</p>
      <LineChart
        labels={data.trend.labels}
        datasets={[
          { label: 'Revenue', data: data.trend.revenue, color: '#172554' },
          { label: 'Profit', data: data.trend.profit, color: '#16A34A' }
        ]}
      />
    </StatCard>
    <StatCard>
      <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 class="text-headline-sm text-ink">Performa per Produk</h2>
        <div class="flex gap-1" role="group" aria-label="Metrik performa">
          <button type="button" on:click={() => (perfMetric = 'revenue')} class={perfBtn(perfMetric, 'revenue')}>Revenue</button>
          <button type="button" on:click={() => (perfMetric = 'profit')} class={perfBtn(perfMetric, 'profit')}>Profit</button>
          <button type="button" on:click={() => (perfMetric = 'margin')} class={perfBtn(perfMetric, 'margin')}>Margin</button>
        </div>
      </div>
      <p class="text-body-sm text-muted mb-3">{perfUnit}</p>
      {#key perfMetric}
        <BarChart
          labels={perfSorted.map((p) => p.name)}
          data={perfSorted.map((p) => (perfMetric === 'margin' ? Math.round(p.margin * 1000) / 10 : p[perfMetric]))}
          horizontal
          color="#172554"
          rounded="edge"
          yFormat={perfMetric === 'margin' ? (v) => `${v}%` : fmtShort}
        />
      {/key}
    </StatCard>
  </div>

  <div class="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-6">
    <StatCard tone="navy" class="min-w-0 overflow-hidden lg:min-h-[162px]">
      <p class="text-label-md uppercase text-white mb-1 truncate">Rata-rata struk</p>
      <p class="text-[15px] leading-5 font-bold sm:text-num-display text-white tabular mb-1.5 break-words [overflow-wrap:anywhere]">{idr(Math.round(data.highlights.avgTicket))}</p>
      <Badge tone={deltaTone(data.highlights.avgTicketDelta)} class="rounded-full">{fmtDelta(data.highlights.avgTicketDelta)}</Badge>
    </StatCard>
    <StatCard tone="navy" class="min-w-0 overflow-hidden lg:min-h-[162px]">
      <p class="text-label-md uppercase text-white mb-1 truncate">Hari tersibuk</p>
      <p class="text-[15px] leading-5 font-bold sm:text-num-display text-white tabular mb-1.5 break-words">{data.highlights.bestDayLabel}</p>
      <p class="text-body-sm text-white/70 tabular break-words [overflow-wrap:anywhere]">{idr(data.highlights.bestDayRevenue)}</p>
    </StatCard>
    <StatCard tone="navy" class="min-w-0 overflow-hidden lg:min-h-[162px]">
      <p class="text-label-md uppercase text-white mb-1 truncate">Margin tertinggi</p>
      <p class="text-[15px] leading-5 font-bold sm:text-num-display text-white tabular mb-1.5 break-words">{data.highlights.topMargin ? data.highlights.topMargin.name : '—'}</p>
      {#if data.highlights.topMargin}
        <p class="text-body-sm tabular break-words"><Badge tone="positive" class="rounded-full">{`${(data.highlights.topMargin.margin * 100).toFixed(1)}%`}</Badge></p>
      {/if}
    </StatCard>
    <StatCard tone="navy" class="min-w-0 overflow-hidden lg:min-h-[162px]">
      <p class="text-label-md uppercase text-white mb-1 truncate">Margin terendah</p>
      <p class="text-[15px] leading-5 font-bold sm:text-num-display text-white tabular mb-1.5 break-words">{data.highlights.lowMargin ? data.highlights.lowMargin.name : '—'}</p>
      {#if data.highlights.lowMargin}
        <p class="text-body-sm tabular break-words"><Badge tone="warning" class="rounded-full">{`${(data.highlights.lowMargin.margin * 100).toFixed(1)}%`}</Badge></p>
      {/if}
    </StatCard>
  </div>

  <StatCard class="mb-6">
    <h2 class="text-headline-sm text-ink mb-1">Struk per Hari</h2>
    <p class="text-body-sm text-muted mb-3">Jumlah struk · {data.rangeLabel}</p>
    <BarChart labels={data.trend.labels} data={data.txPerDay} color="#172554" rounded="edge" />
  </StatCard>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
    <StatCard tone="navy">
      <h2 class="text-headline-sm text-white mb-1">Jam Tersibuk</h2>
      <p class="text-body-sm text-white/70 mb-3">Puncak: {data.hourly.peak} · {data.hourly.total} struk di periode ini</p>
      <BarChart labels={data.hourly.labels} data={data.hourly.data} tone="navy" rounded="edge" />
    </StatCard>
    <StatCard>
      <h2 class="text-headline-sm text-ink mb-1">Rata-rata Struk</h2>
      <p class="text-body-sm text-muted mb-3">{data.avgTicketPerDay.unitLabel} · {data.rangeLabel}</p>
      <LineChart
        labels={data.trend.labels}
        datasets={[{ label: 'Rata-rata struk', data: data.avgTicketPerDay.data, color: '#0284C7' }]}
        spanGaps={false}
      />
    </StatCard>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
    <StatCard>
      <h2 class="text-headline-sm text-ink mb-1">Tren Margin</h2>
      <p class="text-body-sm text-muted mb-3">% per hari · {data.rangeLabel}</p>
      <LineChart
        labels={data.trend.labels}
        datasets={[{ label: 'Margin', data: data.marginTrend, color: '#B45309' }]}
      />
    </StatCard>
    <StatCard>
      <h2 class="text-headline-sm text-ink mb-1">Hari dalam Seminggu</h2>
      {#if data.weekday.show}
        <p class="text-body-sm text-muted mb-3">Rata-rata revenue per hari · {data.rangeLabel}</p>
        <BarChart labels={data.weekday.labels} data={data.weekday.data} yFormat={fmtShort} color="#172554" rounded="edge" />
      {:else}
        <p class="text-body-sm text-muted mb-3">Butuh rentang ≥ 2 minggu biar polanya kebaca.</p>
      {/if}
    </StatCard>
  </div>

  {#if data.pie.labels.length > 0}
    <div class="mb-6">
      <DonutLegendCard labels={data.pie.labels} data={data.pie.data} />
    </div>
  {/if}

  {#if data.matrix.show}
    <StatCard class="mb-6">
      <h2 class="text-headline-sm text-ink mb-1">Matriks Volume vs Margin</h2>
      <p class="text-body-sm text-muted mb-3">Ukuran titik = revenue · garis = median qty & margin periode · klik titik untuk simulasi</p>
      <ScatterChart
        points={data.matrix.points}
        xLabel="Terjual (qty)"
        yLabel="Margin (%)"
        xLine={data.matrix.xLine}
        yLine={data.matrix.yLine}
      />
      <div class="grid grid-cols-1 sm:grid-cols-2 sm:grid-flow-col sm:grid-rows-2 gap-2 mt-3 text-body-sm text-muted">
        <p><strong class="text-ink">Bintang</strong> (kanan atas): laku & margin baik — jaga stok.</p>
        <p><strong class="text-ink">Margin bagus, kurang laku</strong> (kiri atas): butuh promosi.</p>
        <p><strong class="text-ink">Laris tapi margin tipis</strong> (kanan bawah): kandidat naik harga.</p>
        <p><strong class="text-ink">Evaluasi</strong> (kiri bawah): pertimbangkan hentikan.</p>
      </div>
    </StatCard>
  {/if}

  {#if data.cashiers.show}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <StatCard>
        <h2 class="text-headline-sm text-ink mb-1">Penjualan per Kasir</h2>
        <p class="text-body-sm text-muted mb-3">Revenue · {data.rangeLabel}</p>
        <BarChart
          labels={data.cashiers.list.map((c) => c.label)}
          data={data.cashiers.list.map((c) => c.revenue)}
          horizontal
          color="#172554"
          rounded="edge"
          yFormat={fmtShort}
        />
      </StatCard>
      <StatCard class="p-0 overflow-hidden">
        <div class="flex items-center gap-2 bg-ink-navy text-white px-4 h-[44px]">
          <Receipt size={18} class="shrink-0" />
          <h2 class="text-headline-sm">Ringkasan Transaksi</h2>
        </div>
        <div class="p-5">
          <Table headTone="light" headers={['Kasir', 'Struk', 'Revenue', 'Rata-rata']}>
            {#each data.cashiers.list as c}
              <tr>
                <td class="px-3 py-2 text-ink font-semibold whitespace-nowrap">
                  {#if c.userId}
                    <a href={`/transactions?kasir=${c.userId}`} class="text-ink-navy hover:underline">{c.label}</a>
                  {:else}
                    {c.label}
                  {/if}
                </td>
                <td class="px-3 py-2 tabular text-muted whitespace-nowrap">{num(c.tx)}×</td>
                <td class="px-3 py-2 tabular text-ink whitespace-nowrap">{idr(c.revenue)}</td>
                <td class="px-3 py-2 tabular text-muted whitespace-nowrap">{idr(Math.round(c.avg))}</td>
              </tr>
            {/each}
          </Table>
        </div>
      </StatCard>
    </div>
  {/if}

  <h2 class="w-fit rounded-[5px] bg-ink-navy px-6 py-4 text-headline-sm text-white mb-4">Inventori (14 hari terakhir)</h2>
  <div class="grid grid-cols-2 lg:grid-cols-[2.2fr_1fr_1fr_1fr] gap-4 mb-4">
    <StatCard tone="navy" class="min-w-0 overflow-hidden text-center">
      <p class="text-label-md uppercase text-white mb-1">Nilai stok</p>
      <p class="text-num-display text-white tabular break-words [overflow-wrap:anywhere]">{idr(data.inventory.stockValue)}</p>
    </StatCard>
    <StatCard tone="navy" class="min-w-0 overflow-hidden text-center">
      <p class="text-label-md uppercase text-white mb-1">Habis</p>
      <p class="text-num-display lg:text-[72px] font-bold leading-none text-white tabular">{num(data.inventory.outCount)}</p>
      <p class="text-body-sm text-white/70 mt-1">Produk dengan Stok 0</p>
    </StatCard>
    <StatCard tone="navy" class="min-w-0 overflow-hidden text-center">
      <p class="text-label-md uppercase text-white mb-1">Perlu restock</p>
      <p class="text-num-display lg:text-[72px] font-bold leading-none text-white tabular">{num(data.inventory.restockCount)}</p>
      <p class="text-body-sm text-white/70 mt-1">Stok di bawah Batas Minimum</p>
    </StatCard>
    <StatCard tone="navy" class="min-w-0 overflow-hidden text-center">
      <p class="text-label-md uppercase text-white mb-1">Stok mati</p>
      <p class="text-num-display lg:text-[72px] font-bold leading-none text-white tabular">{num(data.inventory.deadCount)}</p>
      <p class="text-body-sm text-white/70 tabular break-words [overflow-wrap:anywhere] mt-1">Modal Tertahan {idr(data.inventory.deadValue)}</p>
    </StatCard>
  </div>
  {#if data.inventory.inactiveStock.count > 0}
    <p class="text-body-sm text-muted mb-4">Stok di produk nonaktif: {idr(data.inventory.inactiveStock.value)} ({num(data.inventory.inactiveStock.count)} produk)</p>
  {/if}
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
    <StatCard>
      <div class="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h2 class="text-headline-sm text-ink mb-1">Estimasi Hari Stok</h2>
          <p class="text-body-sm text-muted">8 produk paling mendesak</p>
        </div>
        <div class="flex items-center gap-3 text-body-sm text-muted">
          <span class="inline-flex items-center gap-1.5"><span class="inline-block h-[14px] w-[14px] rounded-[3px]" style="background-color: #DC2626;"></span>≤3 hari</span>
          <span class="inline-flex items-center gap-1.5"><span class="inline-block h-[14px] w-[14px] rounded-[3px]" style="background-color: #B45309;"></span>≤7 hari</span>
        </div>
      </div>
      {#if data.inventory.daysList.length > 0}
        <BarChart
          labels={data.inventory.daysList.map((p) => p.name)}
          data={data.inventory.daysList.map((p) => Math.round(p.days * 10) / 10)}
          horizontal
          colors={daysColors}
          yFormat={(v) => `${v} hari`}
        />
      {:else}
        <p class="text-body-md text-muted">Belum ada penjualan 14 hari terakhir.</p>
      {/if}
    </StatCard>
    <StatCard>
      <h2 class="text-headline-sm text-ink mb-1">Stok Mati</h2>
      <p class="text-body-sm text-muted mb-3">Stok &gt; 0 tapi 0 terjual 14 hari · 5 modal terbesar</p>
      {#if data.inventory.deadList.length > 0}
        <Table headers={['Produk', 'Stok', 'Modal tertahan']}>
          {#each data.inventory.deadList as p}
            <tr>
              <td class="px-3 py-2 text-ink font-semibold whitespace-nowrap">{p.name}</td>
              <td class="px-3 py-2 tabular text-muted whitespace-nowrap">{num(p.stock)}</td>
              <td class="px-3 py-2 tabular text-ink whitespace-nowrap">{idr(p.value)}</td>
            </tr>
          {/each}
        </Table>
      {:else}
        <p class="text-body-md text-muted">Tidak ada stok mati — semua produk bergerak.</p>
      {/if}
    </StatCard>
  </div>

  <StatCard class="mb-6">
    <h2 class="text-headline-sm text-ink mb-1">Pergerakan Stok per Minggu</h2>
    <p class="text-body-sm text-muted mb-3">Satuan · {data.rangeLabel}</p>
    {#if data.movement.labels.length > 0}
      <BarChart
        labels={data.movement.labels}
        datasets={[
          { label: 'Restock', data: data.movement.restock, color: '#16A34A' },
          { label: 'Void', data: data.movement.void, color: '#0284C7' },
          { label: 'Terjual', data: data.movement.sold, color: '#172554' },
          { label: 'Koreksi', data: data.movement.adjust, color: '#B45309' }
        ]}
        stacked
      />
      <p class="text-body-sm text-muted mt-3">
        Susut (koreksi negatif): {num(data.movement.susut.units)} unit · ≈ {idr(data.movement.susut.value)} pakai harga modal saat ini.
      </p>
    {:else}
      <p class="text-body-md text-muted">Belum ada pergerakan stok pada periode ini.</p>
    {/if}
  </StatCard>
{/key}

{#if data.rows.length === 0}
  <Card class="text-center py-10">
    <p class="text-body-md text-muted">Belum ada penjualan pada periode ini.</p>
  </Card>
{:else}
  <StatCard class="p-0 overflow-hidden mb-6">
    <div class="flex items-center bg-ink-navy text-white px-4 h-[44px]">
      <h2 class="text-headline-sm">Performa per Produk</h2>
    </div>
    <div class="p-5">
      <Table headTone="light" headers={['Produk', 'Terjual', 'Revenue', 'Profit', 'Margin', 'Δ Profit']}>
        {#each data.rows as r}
          <tr>
            <td class="px-3 py-2 text-ink font-semibold whitespace-nowrap">{r.name}</td>
            <td class="px-3 py-2 tabular text-muted whitespace-nowrap">{num(r.current.quantitySold)}×</td>
            <td class="px-3 py-2 tabular text-ink whitespace-nowrap">{idr(r.current.revenue)}</td>
            <td class="px-3 py-2 tabular text-ink whitespace-nowrap">{idr(r.current.profit)}</td>
            <td class="px-3 py-2 tabular text-muted whitespace-nowrap">{(r.current.margin * 100).toFixed(1)}%</td>
            <td class="px-3 py-2 whitespace-nowrap"><Badge size="sm" tone={deltaTone(r.change.profitChangePercent * 100)} class="rounded-full">{fmtDelta(r.change.profitChangePercent * 100)}</Badge></td>
          </tr>
        {/each}
      </Table>
    </div>
  </StatCard>
{/if}

{#if data.lowMargin.length > 0}
  <StatCard tone="navy" class="mt-6">
    <h2 class="text-headline-sm text-white mb-3">Margin tipis (&lt; 15%)</h2>
    <ul class="flex flex-col gap-2">
      {#each data.lowMargin as p}
        <li class="flex items-center justify-between gap-2 rounded-[10px] bg-white px-5 py-4 text-body-md">
          <span class="text-ink">{p.name}</span>
          <span class="tabular text-num-display text-status-warning whitespace-nowrap">{(p.margin * 100).toFixed(1)}%</span>
        </li>
      {/each}
    </ul>
  </StatCard>
{/if}
