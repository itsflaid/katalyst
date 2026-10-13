<script lang="ts">
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Table from '$lib/components/ui/Table.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import { goto } from '$app/navigation';
  import { ACTION_FILTERS, ACTIVITY_LABEL, describeActivity, describeUserAgent, parseMeta } from '$lib/shared/activity';
  import { makeTime, DEFAULT_TZ, type BizTime } from '$lib/shared/time';

  export let data;

  // Zona bisnis agar jam sama dengan SSR, bukan zona perangkat.
  $: T = makeTime(data.timezone ?? DEFAULT_TZ);
  const fmtTime = (d: string | Date, T: BizTime) =>
    T.fmt(d, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // Satu sumber kebenaran = URL/server; kontrol satu arah biar tidak berantem dengan state reaktif.
  function paramsWith(patch: Record<string, string | null>): string {
    const p = new URLSearchParams();
    const peran = patch.peran !== undefined ? patch.peran : data.peran;
    const orang = patch.orang !== undefined ? patch.orang : data.orang;
    const aksi = patch.aksi !== undefined ? patch.aksi : data.aksi;
    const from = patch.from !== undefined ? patch.from : data.rangeFrom;
    const to = patch.to !== undefined ? patch.to : data.rangeTo;
    if (peran && peran !== 'all') p.set('peran', peran);
    if (orang) p.set('orang', orang);
    if (aksi) p.set('aksi', aksi);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return p.toString();
  }
  function go(patch: Record<string, string | null>) {
    const qs = paramsWith(patch);
    goto(`/log${qs ? `?${qs}` : ''}`, { keepFocus: true });
  }

  let fromEl: HTMLInputElement | null = null;
  let toEl: HTMLInputElement | null = null;
  function goOrang(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    go({ orang: v === 'all' ? null : v });
  }
  function goAksi(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    go({ aksi: v === 'all' ? null : v });
  }
  function goRange() {
    go({ from: fromEl?.value || null, to: toEl?.value || null });
  }
  function resetRange() {
    go({ from: null, to: null });
  }

  $: rangeActive = !!(data.rangeFrom || data.rangeTo);
  $: moreHref = `/log?page=${data.page + 1}${paramsWith({}) ? `&${paramsWith({})}` : ''}`;

  const segClass = (active: boolean) =>
    `rounded border px-2.5 py-1.5 text-body-sm ${active ? 'border-ink-navy bg-ink-navy text-white font-semibold' : 'border-border-input bg-white text-ink hover:bg-table-header'}`;

  // Waktu struk asli untuk void; null bila meta rusak atau tak ada.
  function voidTxTime(row: (typeof data.rows)[number]): string | null {
    const m = parseMeta('TX_VOID', row.meta);
    if (m.txCreatedAt === null) return null;
    const d = new Date(m.txCreatedAt);
    return Number.isNaN(d.getTime()) ? null : fmtTime(d, T);
  }
</script>

<PageHeader title="Log Aktivitas" subtitle="Riwayat login, kunjungan, dan aktivitas lainnya" />

<Card class="mb-4">
  <div class="flex flex-wrap items-center gap-2">
    <div class="flex gap-1.5" role="group" aria-label="Filter peran">
      <button type="button" class={segClass(data.peran === 'all')} aria-pressed={data.peran === 'all'} on:click={() => go({ peran: 'all', orang: null })}>Semua</button>
      <button type="button" class={segClass(data.peran === 'owner')} aria-pressed={data.peran === 'owner'} on:click={() => go({ peran: 'owner', orang: null })}>Owner</button>
      <button type="button" class={segClass(data.peran === 'staff')} aria-pressed={data.peran === 'staff'} on:click={() => go({ peran: 'staff', orang: null })}>Staff</button>
    </div>
    <select
      aria-label="Filter orang"
      class="h-9 rounded border border-border-input bg-white px-3 text-body-md text-ink"
      value={data.orang ?? 'all'}
      on:change={goOrang}
    >
      <option value="all">Semua orang</option>
      {#each data.orangOptions as o}
        <option value={o.id}>{o.name}</option>
      {/each}
    </select>
    <select
      aria-label="Filter jenis aktivitas"
      class="h-9 rounded border border-border-input bg-white px-3 text-body-md text-ink"
      value={data.aksi ?? 'all'}
      on:change={goAksi}
    >
      <option value="all">Semua aktivitas</option>
      {#each ACTION_FILTERS as a}
        <option value={a.key}>{a.label}</option>
      {/each}
    </select>
    <input
      type="date"
      aria-label="Dari tanggal"
      bind:this={fromEl}
      value={data.rangeFrom ?? ''}
      class="h-9 rounded border border-border-input bg-white px-2 text-body-sm text-ink"
    />
    <input
      type="date"
      aria-label="Sampai tanggal"
      bind:this={toEl}
      value={data.rangeTo ?? ''}
      min={data.rangeFrom ?? undefined}
      class="h-9 rounded border border-border-input bg-white px-2 text-body-sm text-ink"
    />
    <button type="button" class="h-9 rounded border border-border-input bg-white px-3 text-body-md text-ink hover:bg-table-header" on:click={goRange}>Terapkan</button>
    {#if rangeActive}
      <button type="button" class="h-9 rounded border border-border-input bg-white px-3 text-body-md text-ink hover:bg-table-header" on:click={resetRange}>Reset</button>
    {/if}
  </div>
</Card>

{#if data.rows.length === 0}
  <Card>
    <p class="text-body-md text-ink">Belum ada aktivitas tercatat.</p>
    <p class="mt-1 text-body-sm text-muted">Log mulai tercatat sejak fitur ini aktif, transaksi lama tidak ikut.</p>
  </Card>
{:else}
  <Table headers={['Waktu', 'Siapa', 'Aktivitas', 'Perangkat']}>
    {#each data.rows as row}
      <tr>
        <td class="whitespace-nowrap px-3 py-2 text-body-sm text-ink">
          {fmtTime(row.createdAt, T)}
          <span class="text-muted">{T.short}</span>
        </td>
        <td class="px-3 py-2">
          <span class="mr-1.5 text-body-md text-ink">{row.actorName}</span>
          <Badge tone={row.actorRole === 'OWNER' ? 'positive' : 'neutral'} size="sm">
            {row.actorRole === 'OWNER' ? 'Owner' : 'Staff'}
          </Badge>
        </td>
        <td class="px-3 py-2">
          <p class="text-body-md text-ink">{ACTIVITY_LABEL[row.action]}</p>
          {#if describeActivity(row.action, row.meta)}
            <p class="text-body-sm text-muted">{describeActivity(row.action, row.meta)}</p>
          {/if}
          {#if row.action === 'TX_VOID' && voidTxTime(row)}
            <p class="text-body-sm text-muted">· struk dicatat {voidTxTime(row)}</p>
          {/if}
        </td>
        <td class="px-3 py-2">
          {#if row.userAgent || row.ip}
            <p class="text-body-sm text-ink">{describeUserAgent(row.userAgent)}</p>
            <p class="text-body-sm text-muted">{row.ip ?? '-'}</p>
            {#if row.action === 'LOGIN' && parseMeta('LOGIN', row.meta).newDevice}
              <Badge tone="warning" size="sm">Perangkat baru</Badge>
            {/if}
          {:else}
            <span class="text-body-sm text-muted">-</span>
          {/if}
        </td>
      </tr>
    {/each}
  </Table>
  {#if data.hasMore}
    <div class="mt-3 text-center">
      <a href={moreHref} class="text-body-sm font-semibold text-ink-navy hover:underline no-underline">Muat aktivitas lebih lama →</a>
    </div>
  {/if}
{/if}
