<script lang="ts">
  import Table from '$lib/components/ui/Table.svelte';
  export let data;

  const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
</script>

<h1 class="text-2xl font-semibold mb-6">Produk</h1>

<Table headers={['Nama', 'Harga Modal', 'Harga Jual', 'Margin', '']}>
  {#each data.products as p}
    <tr>
      <td class="px-4 py-2"><a href={`/products/${p.id}`} class="underline">{p.name}</a></td>
      <td class="px-4 py-2">{idr(p.costPrice)}</td>
      <td class="px-4 py-2">{idr(p.sellingPrice)}</td>
      <td class="px-4 py-2">{(((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100).toFixed(0)}%</td>
      <td class="px-4 py-2"><a href={`/simulator?productId=${p.id}`} class="text-sm text-blue-600 underline">Simulasikan</a></td>
    </tr>
  {/each}
</Table>
