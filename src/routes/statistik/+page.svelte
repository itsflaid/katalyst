<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Table from '$lib/components/ui/Table.svelte';
  import LineChart from '$lib/components/ui/LineChart.svelte';
  import BarChart from '$lib/components/ui/BarChart.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { goto } from '$app/navigation';
  export let data;

  const idrFmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  const numFmt = new Intl.NumberFormat('id-ID');
  const idr = (n: number) => idrFmt.format(n);
  const num = (n: number) => numFmt.format(n);
  const deltaTone = (d: number | null) => (d === null || d >= 0 ? 'positive' : 'negative');
  const fmtDelta = (d: number | null) => (d === null ? 'baru' : `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`);

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
</script>

<h1 class="text-headline-lg text-ink">Statistik</h1>
<p class="text-body-md text-muted mt-1 mb-4">Laporan performa per periode — delta selalu dibanding periode sebelumnya yang sama panjang.</p>

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

<div class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4 mb-6">
  <Card class="min-w-0 overflow-hidden p-3 sm:p-5">
    <p class="text-label-sm uppercase text-muted mb-1 truncate">Revenue</p>
    <p class="text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular mb-1.5 break-words [overflow-wrap:anywhere]">{idr(data.kpi.revenue)}</p>
    <Badge tone={deltaTone(data.deltas.revenue)} class="text-[11px] sm:text-label-md">{fmtDelta(data.deltas.revenue)}</Badge>
  </Card>
  <Card class="min-w-0 overflow-hidden p-3 sm:p-5">
    <p class="text-label-sm uppercase text-muted mb-1 truncate">Profit</p>
    <p class="text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular mb-1.5 break-words [overflow-wrap:anywhere]">{idr(data.kpi.profit)}</p>
    <Badge tone={deltaTone(data.deltas.profit)} class="text-[11px] sm:text-label-md">{fmtDelta(data.deltas.profit)}</Badge>
  </Card>
  <Card class="min-w-0 overflow-hidden p-3 sm:p-5">
    <p class="text-label-sm uppercase text-muted mb-1 truncate">Margin</p>
    <p class="text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular mb-1.5 break-words">{(data.kpi.margin * 100).toFixed(1)}%</p>
    <Badge tone={data.deltas.margin >= 0 ? 'positive' : 'negative'} class="text-[11px] sm:text-label-md">{fmtDelta(data.deltas.margin)}</Badge>
  </Card>
  <Card class="min-w-0 overflow-hidden p-3 sm:p-5">
    <p class="text-label-sm uppercase text-muted mb-1 truncate">Transaksi</p>
    <p class="text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular mb-1.5 break-words">{num(data.kpi.tx)}</p>
    <Badge tone={deltaTone(data.deltas.transactions)} class="text-[11px] sm:text-label-md">{fmtDelta(data.deltas.transactions)}</Badge>
  </Card>
</div>

<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
  <Card>
    <h2 class="text-headline-sm text-ink mb-1">Tren Revenue & Profit</h2>
    <p class="text-body-sm text-muted mb-3">jt Rp · {data.rangeLabel}</p>
    <LineChart
      labels={data.trend.labels}
      datasets={[
        { label: 'Revenue', data: data.trend.revenue, color: '#172554' },
        { label: 'Profit', data: data.trend.profit, color: '#16A34A' }
      ]}
    />
  </Card>
  <Card>
    <h2 class="text-headline-sm text-ink mb-3">Revenue per Produk (Top 8)</h2>
    <BarChart labels={data.bar.labels} data={data.bar.data} />
  </Card>
</div>

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
