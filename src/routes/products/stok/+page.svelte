<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Table from '$lib/components/ui/Table.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import ProductTabs from '$lib/components/products/ProductTabs.svelte';
  import { fmtWita } from '$lib/time';
  export let data;

  const fmtDate = (d: string | Date) => fmtWita(d, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const reasonLabel: Record<string, string> = { SALE: 'Penjualan', VOID_RESTORE: 'Batal struk', RESTOCK: 'Restock', ADJUST: 'Koreksi' };
  const reasonTone = (r: string) =>
    r === 'RESTOCK' ? 'positive' : r === 'SALE' ? 'neutral' : r === 'VOID_RESTORE' ? 'neutral' : 'warning';

  let reasonInput = data.reason ?? '';
  let productInput = data.productFilter ?? '';
  let fromInput = data.fromISO ?? '';
  let toInput = data.toISO ?? '';
</script>

<PageHeader title="Produk" subtitle="Kelola barang dagangan & riwayat stok" />
<ProductTabs isOwner={true} />

<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
  <Card><p class="text-label-sm uppercase text-muted">Masuk (restock + batal struk)</p><p class="text-num-display text-status-positive tabular">+{data.summary.masuk}</p></Card>
  <Card><p class="text-label-sm uppercase text-muted">Terjual</p><p class="text-num-display text-status-negative tabular">−{data.summary.terjual}</p></Card>
  <Card><p class="text-label-sm uppercase text-muted">Koreksi bersih</p><p class="text-num-display text-ink tabular">{data.summary.koreksi >= 0 ? `+${data.summary.koreksi}` : data.summary.koreksi}</p></Card>
</div>

<Card class="mb-4">
  <form method="GET" action="/products/stok" class="flex flex-wrap items-end gap-3">
    <label class="flex flex-col gap-1 text-body-md text-ink">
      Alasan
      <select name="reason" bind:value={reasonInput} class="h-9 rounded border border-border-input bg-white px-3 text-body-md text-ink">
        <option value="">Semua alasan</option>
        <option value="SALE">Penjualan</option>
        <option value="VOID_RESTORE">Batal struk</option>
        <option value="RESTOCK">Restock</option>
        <option value="ADJUST">Koreksi</option>
      </select>
    </label>
    <label class="flex flex-col gap-1 text-body-md text-ink">
      Produk
      <select name="product" bind:value={productInput} class="h-9 rounded border border-border-input bg-white px-3 text-body-md text-ink max-w-60">
        <option value="">Semua produk</option>
        {#each data.products as p}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    </label>
    <label class="flex flex-col gap-1 text-body-md text-ink">
      Dari
      <input type="date" name="from" bind:value={fromInput} class="h-9 rounded border border-border-input bg-white px-2 text-body-sm text-ink" />
    </label>
    <label class="flex flex-col gap-1 text-body-md text-ink">
      Sampai
      <input type="date" name="to" bind:value={toInput} min={fromInput || undefined} class="h-9 rounded border border-border-input bg-white px-2 text-body-sm text-ink" />
    </label>
    <button type="submit" class="h-9 rounded bg-ink-navy border border-ink-navy text-white text-label-lg px-4 cursor-pointer">Terapkan</button>
    <a href="/products/stok" class="h-9 inline-flex items-center rounded border border-border-input px-4 text-body-md text-ink no-underline">Reset</a>
  </form>
</Card>

{#if data.movements.length === 0}
  <Card class="text-center py-10">
    <p class="text-body-md text-muted">Belum ada pergerakan stok yang cocok dengan filter ini.</p>
  </Card>
{:else}
  <Table headers={['Waktu', 'Produk', 'Perubahan', 'Alasan', 'Catatan', 'Oleh', 'Struk']}>
    {#each data.movements as m}
      <tr>
        <td class="px-3 py-2 text-body-sm text-muted whitespace-nowrap">{fmtDate(m.createdAt)}</td>
        <td class="px-3 py-2 whitespace-nowrap"><a href={`/products/${m.productId}`} class="text-ink-navy font-semibold hover:underline">{m.productName}</a></td>
        <td class="px-3 py-2 tabular font-semibold whitespace-nowrap {m.qtyChange >= 0 ? 'text-status-positive' : 'text-status-negative'}">{m.qtyChange >= 0 ? `+${m.qtyChange}` : m.qtyChange}</td>
        <td class="px-3 py-2 whitespace-nowrap"><Badge size="sm" tone={reasonTone(m.reason)}>{reasonLabel[m.reason] ?? m.reason}</Badge></td>
        <td class="px-3 py-2 text-muted">{m.note ?? '—'}</td>
        <td class="px-3 py-2 text-muted whitespace-nowrap">{m.createdByName ?? '—'}</td>
        <td class="px-3 py-2 text-body-sm text-muted whitespace-nowrap">{m.refTxId ? `#${m.refTxId.slice(0, 8)}` : '—'}</td>
      </tr>
    {/each}
  </Table>
  <div class="flex items-center justify-between gap-3 mt-2">
    <p class="text-body-sm text-muted">Halaman {data.page} · {data.movements.length} pergerakan.</p>
    {#if data.hasMore}
      <a href={data.moreHref} class="text-body-sm font-semibold text-ink-navy hover:underline no-underline">Muat lebih lama →</a>
    {/if}
  </div>
{/if}
