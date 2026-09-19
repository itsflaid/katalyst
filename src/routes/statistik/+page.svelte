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

  let activeRange: string = data.range ?? '30d';
  let fromInput: string = data.rangeFrom ?? '';
  let toInput: string = data.rangeTo ?? '';

  function goWithRange(key: string, from = '', to = '') {
    activeRange = key;
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

  const btn = (key: string) =>
    `rounded border px-2.5 py-1.5 text-body-sm ${activeRange === key ? 'border-ink-navy bg-ink-navy text-white font-semibold' : 'border-border-input bg-white text-ink hover:bg-table-header'}`;

  // Kartu "Performa per Produk": satu kartu + toggle metrik (client-side).
  let perfMetric: 'revenue' | 'profit' | 'margin' = 'revenue';
  $: perfSorted = [...data.productPerf]
    .sort((a, b) =>
      perfMetric === 'revenue' ? b.revenue - a.revenue : perfMetric === 'profit' ? b.profit - a.profit : b.margin - a.margin
    )
    .slice(0, 8);
  $: perfUnit = perfMetric === 'margin' ? '% · 8 teratas' : `${perfMetric === 'revenue' ? 'Nominal' : 'Nominal'} · 8 teratas`;
  const perfBtn = (key: 'revenue' | 'profit' | 'margin') =>
    `rounded border px-2.5 py-1 text-body-sm ${perfMetric === key ? 'border-ink-navy bg-ink-navy text-white font-semibold' : 'border-border-input bg-white text-ink hover:bg-table-header'}`;

  // Warna per-bar chart estimasi hari stok: ≤3 hari merah, ≤7 amber, sisanya navy.
  $: daysColors = data.inventory.daysList.map((p) =>
    p.days <= 3 ? '#DC2626' : p.days <= 7 ? '#B45309' : '#172554'
  );
</script>

<PageHeader title="Statistik" subtitle="Laporan performa per periode — delta selalu dibanding periode sebelumnya yang sama panjang." />

<Card class="mb-6">
  <div class="flex flex-wrap items-center gap-2">
    <button type="button" on:click={() => goWithRange('today')} class={btn('today')}>Hari ini</button>
    <button type="button" on:click={() => goWithRange('week')} class={btn('week')}>Minggu ini</button>
    <button type="button" on:click={() => goWithRange('30d')} class={btn('30d')}>30 hari</button>
    <button type="button" on:click={() => goWithRange('month')} class={btn('month')}>Bulan ini</button>
    <span class="flex items-center gap-1.5 ml-1">
      <input type="date" bind:value={fromInput} class="h-9 rounded border border-border-input bg-white px-2 text-body-sm text-ink" aria-label="Dari tanggal" />
      <span class="text-muted">–</span>
      <input type="date" bind:value={toInput} min={fromInput || undefined} class="h-9 rounded border border-border-input bg-white px-2 text-body-sm text-ink" aria-label="Sampai tanggal" />
      <Button size="compact" on:click={applyCustom}>Terapkan</Button>
    </span>
    {#if data.rangeLabel}
      <span class="text-body-sm text-muted ml-auto">Dipakai: <strong class="text-ink">{data.rangeLabel}</strong></span>
    {/if}
  </div>
</Card>

{#key [data.range, data.rangeFrom, data.rangeTo, data.trend.labels.join(',')].join('|')}
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
    <Card>
      <h2 class="text-headline-sm text-ink mb-1">Tren Revenue & Profit</h2>
      <p class="text-body-sm text-muted mb-3">{data.trend.unitLabel} · {data.rangeLabel}</p>
      <LineChart
        labels={data.trend.labels}
        datasets={[
          { label: 'Revenue', data: data.trend.revenue, color: '#172554' },
          { label: 'Profit', data: data.trend.profit, color: '#16A34A' }
        ]}
      />
    </Card>
    <Card>
      <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 class="text-headline-sm text-ink">Performa per Produk</h2>
        <div class="flex gap-1" role="group" aria-label="Metrik performa">
          <button type="button" on:click={() => (perfMetric = 'revenue')} class={perfBtn('revenue')}>Revenue</button>
          <button type="button" on:click={() => (perfMetric = 'profit')} class={perfBtn('profit')}>Profit</button>
          <button type="button" on:click={() => (perfMetric = 'margin')} class={perfBtn('margin')}>Margin</button>
        </div>
      </div>
      <p class="text-body-sm text-muted mb-3">{perfUnit}</p>
      {#key perfMetric}
        <BarChart
          labels={perfSorted.map((p) => p.name)}
          data={perfSorted.map((p) => (perfMetric === 'margin' ? Math.round(p.margin * 1000) / 10 : p[perfMetric]))}
          horizontal
          color="#16A34A"
          yFormat={perfMetric === 'margin' ? (v) => `${v}%` : fmtShort}
        />
      {/key}
    </Card>
  </div>

  <div class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4 mb-6">
    <Card class="min-w-0 overflow-hidden p-3 sm:p-5">
      <p class="text-label-sm uppercase text-muted mb-1 truncate">Rata-rata struk</p>
      <p class="text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular mb-1.5 break-words [overflow-wrap:anywhere]">{idr(Math.round(data.highlights.avgTicket))}</p>
      <Badge tone={deltaTone(data.highlights.avgTicketDelta)} class="text-[11px] sm:text-label-md">{fmtDelta(data.highlights.avgTicketDelta)}</Badge>
    </Card>
    <Card class="min-w-0 overflow-hidden p-3 sm:p-5">
      <p class="text-label-sm uppercase text-muted mb-1 truncate">Hari tersibuk</p>
      <p class="text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular mb-1.5 break-words">{data.highlights.bestDayLabel}</p>
      <p class="text-body-sm text-muted tabular break-words [overflow-wrap:anywhere]">{idr(data.highlights.bestDayRevenue)}</p>
    </Card>
    <Card class="min-w-0 overflow-hidden p-3 sm:p-5">
      <p class="text-label-sm uppercase text-muted mb-1 truncate">Margin tertinggi</p>
      <p class="text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular mb-1.5 break-words">{data.highlights.topMargin ? data.highlights.topMargin.name : '—'}</p>
      <p class="text-body-sm tabular break-words {data.highlights.topMargin ? 'text-status-positive font-semibold' : 'text-muted'}">{data.highlights.topMargin ? `${(data.highlights.topMargin.margin * 100).toFixed(1)}%` : ''}</p>
    </Card>
    <Card class="min-w-0 overflow-hidden p-3 sm:p-5">
      <p class="text-label-sm uppercase text-muted mb-1 truncate">Margin terendah</p>
      <p class="text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular mb-1.5 break-words">{data.highlights.lowMargin ? data.highlights.lowMargin.name : '—'}</p>
      <p class="text-body-sm tabular break-words {data.highlights.lowMargin ? 'text-status-warning font-semibold' : 'text-muted'}">{data.highlights.lowMargin ? `${(data.highlights.lowMargin.margin * 100).toFixed(1)}%` : ''}</p>
    </Card>
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
    <Card>
      <h2 class="text-headline-sm text-ink mb-1">Struk per Hari</h2>
      <p class="text-body-sm text-muted mb-3">Jumlah struk · {data.rangeLabel}</p>
      <BarChart labels={data.trend.labels} data={data.txPerDay} />
    </Card>
    <Card>
      <h2 class="text-headline-sm text-ink mb-1">Rata-rata Struk</h2>
      <p class="text-body-sm text-muted mb-3">{data.avgTicketPerDay.unitLabel} · {data.rangeLabel}</p>
      <LineChart
        labels={data.trend.labels}
        datasets={[{ label: 'Rata-rata struk', data: data.avgTicketPerDay.data, color: '#0284C7' }]}
        spanGaps={false}
      />
    </Card>
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
    <Card>
      <h2 class="text-headline-sm text-ink mb-1">Jam Tersibuk</h2>
      <p class="text-body-sm text-muted mb-3">Puncak: {data.hourly.peak} · {data.hourly.total} struk di periode ini</p>
      <BarChart labels={data.hourly.labels} data={data.hourly.data} />
    </Card>
    <Card>
      <h2 class="text-headline-sm text-ink mb-1">Hari dalam Seminggu</h2>
      {#if data.weekday.show}
        <p class="text-body-sm text-muted mb-3">Rata-rata revenue per hari · {data.rangeLabel}</p>
        <BarChart labels={data.weekday.labels} data={data.weekday.data} yFormat={fmtShort} />
      {:else}
        <p class="text-body-sm text-muted mb-3">Butuh rentang ≥ 2 minggu biar polanya kebaca.</p>
      {/if}
    </Card>
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
    <Card>
      <h2 class="text-headline-sm text-ink mb-1">Tren Margin</h2>
      <p class="text-body-sm text-muted mb-3">% per hari · {data.rangeLabel}</p>
      <LineChart
        labels={data.trend.labels}
        datasets={[{ label: 'Margin', data: data.marginTrend, color: '#B45309' }]}
      />
    </Card>
    {#if data.pie.labels.length > 0}
      <Card>
        <h2 class="text-headline-sm text-ink mb-1">Komposisi Profit</h2>
        <p class="text-body-sm text-muted mb-3">Makin besar potongan = makin besar keuntungan produknya</p>
        <PieChart labels={data.pie.labels} data={data.pie.data} />
      </Card>
    {/if}
  </div>

  {#if data.matrix.show}
    <Card class="mb-6">
      <h2 class="text-headline-sm text-ink mb-1">Matriks Volume vs Margin</h2>
      <p class="text-body-sm text-muted mb-3">Ukuran titik = revenue · garis = median qty & margin periode · klik titik untuk simulasi</p>
      <ScatterChart
        points={data.matrix.points}
        xLabel="Terjual (qty)"
        yLabel="Margin (%)"
        xLine={data.matrix.xLine}
        yLine={data.matrix.yLine}
      />
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-body-sm text-muted">
        <p><strong class="text-ink">Bintang</strong> (kanan atas): laku & margin baik — jaga stok.</p>
        <p><strong class="text-ink">Laris tapi margin tipis</strong> (kanan bawah): kandidat naik harga.</p>
        <p><strong class="text-ink">Margin bagus, kurang laku</strong> (kiri atas): butuh promosi.</p>
        <p><strong class="text-ink">Evaluasi</strong> (kiri bawah): pertimbangkan hentikan.</p>
      </div>
    </Card>
  {/if}

  {#if data.cashiers.show}
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
      <Card>
        <h2 class="text-headline-sm text-ink mb-1">Penjualan per Kasir</h2>
        <p class="text-body-sm text-muted mb-3">Revenue · {data.rangeLabel}</p>
        <BarChart
          labels={data.cashiers.list.map((c) => c.label)}
          data={data.cashiers.list.map((c) => c.revenue)}
          horizontal
          yFormat={fmtShort}
        />
      </Card>
      <Card>
        <h2 class="text-headline-sm text-ink mb-3">Ringkasan Kasir</h2>
        <Table headers={['Kasir', 'Struk', 'Revenue', 'Rata-rata']}>
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
      </Card>
    </div>
  {/if}

  <h2 class="text-headline-sm text-ink mb-3">Inventori (14 hari terakhir)</h2>
  <div class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4 mb-4">
    <Card class="min-w-0 overflow-hidden p-3 sm:p-5">
      <p class="text-label-sm uppercase text-muted mb-1 truncate">Nilai stok</p>
      <p class="text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular mb-1.5 break-words [overflow-wrap:anywhere]">{idr(data.inventory.stockValue)}</p>
    </Card>
    <Card class="min-w-0 overflow-hidden p-3 sm:p-5">
      <p class="text-label-sm uppercase text-muted mb-1 truncate">Habis</p>
      <p class="text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular mb-1.5">{num(data.inventory.outCount)}</p>
    </Card>
    <Card class="min-w-0 overflow-hidden p-3 sm:p-5">
      <p class="text-label-sm uppercase text-muted mb-1 truncate">Perlu restock</p>
      <p class="text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular mb-1.5">{num(data.inventory.restockCount)}</p>
    </Card>
    <Card class="min-w-0 overflow-hidden p-3 sm:p-5">
      <p class="text-label-sm uppercase text-muted mb-1 truncate">Stok mati</p>
      <p class="text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular mb-1.5">{num(data.inventory.deadCount)}</p>
      <p class="text-body-sm text-muted tabular break-words [overflow-wrap:anywhere]">Modal tertahan {idr(data.inventory.deadValue)}</p>
    </Card>
  </div>
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
    <Card>
      <h2 class="text-headline-sm text-ink mb-1">Estimasi Hari Stok</h2>
      <p class="text-body-sm text-muted mb-3">8 produk paling mendesak · merah ≤3 hari, kuning ≤7 hari</p>
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
    </Card>
    <Card>
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
    </Card>
  </div>

  <Card class="mb-6">
    <h2 class="text-headline-sm text-ink mb-1">Pergerakan Stok per Minggu</h2>
    <p class="text-body-sm text-muted mb-3">Satuan · {data.rangeLabel}</p>
    {#if data.movement.labels.length > 0}
      <BarChart
        labels={data.movement.labels}
        datasets={[
          { label: 'Restock', data: data.movement.restock, color: '#16A34A' },
          { label: 'Batal struk', data: data.movement.void, color: '#0284C7' },
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
  </Card>
{/key}

{#if data.rows.length === 0}
  <Card class="text-center py-10">
    <p class="text-body-md text-muted">Belum ada penjualan pada periode ini.</p>
  </Card>
{:else}
  <h2 class="text-headline-sm text-ink mb-3">Performa per Produk</h2>
  <Table headers={['Produk', 'Terjual', 'Revenue', 'Profit', 'Margin', 'Δ Profit']}>
    {#each data.rows as r}
      <tr>
        <td class="px-3 py-2 text-ink font-semibold whitespace-nowrap">{r.name}</td>
        <td class="px-3 py-2 tabular text-muted whitespace-nowrap">{num(r.current.quantitySold)}×</td>
        <td class="px-3 py-2 tabular text-ink whitespace-nowrap">{idr(r.current.revenue)}</td>
        <td class="px-3 py-2 tabular text-ink whitespace-nowrap">{idr(r.current.profit)}</td>
        <td class="px-3 py-2 tabular text-muted whitespace-nowrap">{(r.current.margin * 100).toFixed(1)}%</td>
        <td class="px-3 py-2 whitespace-nowrap"><Badge size="sm" tone={deltaTone(r.change.profitChangePercent * 100)}>{fmtDelta(r.change.profitChangePercent * 100)}</Badge></td>
      </tr>
    {/each}
  </Table>
{/if}

{#if data.lowMargin.length > 0}
  <Card class="mt-6">
    <h2 class="text-headline-sm text-ink mb-3">Margin tipis (&lt; 15%)</h2>
    <ul class="flex flex-col gap-2">
      {#each data.lowMargin as p}
        <li class="flex justify-between gap-3 rounded border border-status-warning-border bg-status-warning-bg px-3 py-2 text-body-md">
          <span class="text-ink">{p.name}</span>
          <span class="tabular font-semibold text-status-warning whitespace-nowrap">{(p.margin * 100).toFixed(1)}%</span>
        </li>
      {/each}
    </ul>
  </Card>
{/if}
