<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Table from '$lib/components/ui/Table.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import { fmtWita } from '$lib/shared/time';
  export let data;
  const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
  const num = (n: number) => new Intl.NumberFormat('id-ID').format(n);
  const fmtDate = (d: string | Date) => fmtWita(d, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const reasonLabel: Record<string, string> = { SALE: 'Penjualan', VOID_RESTORE: 'Batal struk', RESTOCK: 'Restock', ADJUST: 'Koreksi' };
</script>

<a href="/products" class="text-body-sm text-muted hover:text-ink no-underline hover:underline">← Kembali ke Produk</a>
<PageHeader title={data.product.name} subtitle={`Harga modal ${idr(data.product.costPrice)} · Harga jual ${idr(data.product.sellingPrice)}`} class="!mt-2">
  <span slot="badge"><Badge size="sm" tone={data.product.isActive ? 'positive' : 'neutral'}>{data.product.isActive ? 'Aktif' : 'Nonaktif'}</Badge></span>
</PageHeader>

<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
  <Card>
    <p class="text-label-sm uppercase text-muted">Stok sekarang</p>
    <p class="text-num-display text-ink tabular">{num(data.product.stock)}</p>
    {#if data.product.stock <= 0}
      <p class="text-body-sm text-status-negative mt-1">Habis — tidak muncul di kasir sampai direstock.</p>
    {:else if data.product.stock <= (data.product.minStock ?? 5)}
      <p class="text-body-sm text-status-warning mt-1">Menipis — segera restock.</p>
    {/if}
  </Card>
  <Card>
    <p class="text-label-sm uppercase text-muted">Kelola</p>
    <p class="text-body-sm text-muted mt-1 mb-3">Restock dan koreksi stok dilakukan dari halaman Produk.</p>
    <a href="/products" class="text-body-md font-semibold text-ink-navy hover:underline no-underline">Ke halaman Produk →</a>
  </Card>
</div>

{#if data.performance.quantitySold === 0}
  <Card class="text-center py-8 mb-6">
    <p class="text-body-md text-muted">Belum ada penjualan untuk produk ini.</p>
  </Card>
{:else}
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
    <Card><p class="text-label-sm uppercase text-muted">Terjual</p><p class="text-num-display text-ink tabular">{num(data.performance.quantitySold)}</p></Card>
    <Card><p class="text-label-sm uppercase text-muted">Revenue</p><p class="text-num-display text-ink tabular break-words [overflow-wrap:anywhere]">{idr(data.performance.revenue)}</p></Card>
    <Card><p class="text-label-sm uppercase text-muted">Profit</p><p class="text-num-display text-ink tabular break-words [overflow-wrap:anywhere]">{idr(data.performance.profit)}</p></Card>
    <Card><p class="text-label-sm uppercase text-muted">Margin</p><p class="text-num-display text-ink tabular">{(data.performance.margin * 100).toFixed(1)}%</p></Card>
  </div>
{/if}

<div class="flex flex-wrap gap-2">
  <a href={`/simulator?productId=${data.product.id}`} class="inline-flex items-center justify-center h-9 px-4 rounded bg-ink-navy border border-ink-navy text-white text-label-lg no-underline hover:bg-ink">Coba simulasikan skenario harga →</a>
  <a href="/products" class="inline-flex items-center justify-center h-9 px-4 rounded bg-white border border-border-input text-ink text-label-lg no-underline hover:bg-table-header">Ke daftar produk</a>
</div>

<h2 class="text-headline-sm text-ink mt-8 mb-3">Riwayat Stok (20 terbaru)</h2>
{#if data.role === 'OWNER'}
  <p class="mb-3"><a href={`/products/stok?product=${data.product.id}`} class="text-body-md font-semibold text-ink-navy hover:underline no-underline">Lihat semua riwayat →</a></p>
{/if}
{#if data.movements.length === 0}
  <Card class="text-center py-8">
    <p class="text-body-md text-muted">Belum ada pergerakan stok. Stok awal produk lama tidak tercatat sebagai riwayat.</p>
  </Card>
{:else}
  <Table headers={['Waktu', 'Perubahan', 'Alasan', 'Catatan', 'Oleh']}>
    {#each data.movements as m}
      <tr>
        <td class="px-3 py-2 text-body-sm text-muted whitespace-nowrap">{fmtDate(m.createdAt)}</td>
        <td class="px-3 py-2 tabular font-semibold whitespace-nowrap {m.qtyChange >= 0 ? 'text-status-positive' : 'text-status-negative'}">{m.qtyChange >= 0 ? `+${m.qtyChange}` : m.qtyChange}</td>
        <td class="px-3 py-2 text-ink whitespace-nowrap">{reasonLabel[m.reason] ?? m.reason}</td>
        <td class="px-3 py-2 text-muted">{m.note ?? '—'}</td>
        <td class="px-3 py-2 text-muted whitespace-nowrap">{m.createdByName ?? '—'}</td>
      </tr>
    {/each}
  </Table>
{/if}
