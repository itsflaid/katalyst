<script lang="ts">
  import Table from '$lib/components/ui/Table.svelte';
  export let data;
  const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
  const fmtDate = (d: string | Date) => new Date(d).toLocaleString('id-ID');
</script>

<h1 class="text-2xl font-semibold mb-6">Transaksi Terbaru</h1>

<Table headers={['Waktu', 'Produk', 'Qty', 'Harga', 'Dilayani']}>
  {#each data.transactions as t}
    <tr>
      <td class="px-4 py-2">{fmtDate(t.createdAt)}</td>
      <td class="px-4 py-2">{t.productName}</td>
      <td class="px-4 py-2">{t.quantity}</td>
      <td class="px-4 py-2">{idr(t.priceAtSale)}</td>
      <td class="px-4 py-2">{t.servedBy}</td>
    </tr>
  {/each}
</Table>
