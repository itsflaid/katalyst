<script lang="ts">
  import { enhance } from '$app/forms';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Tooltip from '$lib/components/ui/Tooltip.svelte';
  export let data;
  export let form;

  const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
</script>

<h1 class="text-2xl font-semibold mb-6">Simulator "What-if"</h1>

<form method="POST" action="?/simulate" use:enhance class="flex flex-col gap-4 max-w-md mb-8">
  <label class="flex flex-col gap-1 text-sm">
    <span class="flex items-center justify-between">
      Produk
      <Tooltip text="Pilih produk yang mau disimulasikan perubahan harga, biaya, diskon, atau volumenya." />
    </span>
    <select name="productId" class="border border-neutral-300 rounded-md px-3 py-2 text-sm">
      {#each data.products as p}
        <option value={p.id} selected={p.id === data.preselectedProductId}>{p.name}</option>
      {/each}
    </select>
  </label>

  <label for="sim-price" class="flex flex-col gap-1 text-sm">
    <span class="flex items-center justify-between">
      Harga jual baru (opsional)
      <Tooltip text="Harga jual pengganti buat produk ini di skenario simulasi. Kosongkan kalau harga jual gak berubah." />
    </span>
    <Input id="sim-price" name="newSellingPrice" type="number" placeholder="Contoh: 35000" />
  </label>

  <label for="sim-cost" class="flex flex-col gap-1 text-sm">
    <span class="flex items-center justify-between">
      Harga modal baru (opsional)
      <Tooltip text="Biaya modal (COGS) pengganti buat produk ini di skenario simulasi. Kosongkan kalau biaya modal gak berubah." />
    </span>
    <Input id="sim-cost" name="newCostPrice" type="number" placeholder="Contoh: 18000" />
  </label>

  <label for="sim-discount" class="flex flex-col gap-1 text-sm">
    <span class="flex items-center justify-between">
      Diskon % (opsional)
      <Tooltip text="Persentase diskon yang diterapkan ke harga jual pada skenario ini. Contoh: isi 10 buat diskon 10%." />
    </span>
    <Input id="sim-discount" name="discountPercent" type="number" placeholder="Contoh: 10" />
  </label>

  <label for="sim-qty" class="flex flex-col gap-1 text-sm">
    <span class="flex items-center justify-between">
      Override quantity (opsional)
      <Tooltip text="Ganti jumlah unit terjual yang dipakai simulasi, buat lihat dampak kalau volume penjualan naik/turun. Kosongkan buat pakai volume histori." />
    </span>
    <Input id="sim-qty" name="quantityOverride" type="number" placeholder="Contoh: 500" />
  </label>

  <Button type="submit">Simulasikan</Button>
</form>

{#if form?.result}
  {@const r = form.result}
  <div class="grid grid-cols-2 gap-6 max-w-2xl">
    <Card>
      <h3 class="font-medium mb-2">Kondisi Sekarang</h3>
      <p class="text-sm">Revenue: {idr(r.current.revenue)}</p>
      <p class="text-sm">Profit: {idr(r.current.profit)}</p>
      <p class="text-sm">Margin: {(r.current.margin * 100).toFixed(1)}%</p>
    </Card>
    <Card>
      <h3 class="font-medium mb-2">Simulasi</h3>
      <p class="text-sm">Revenue: {idr(r.simulated.revenue)}</p>
      <p class="text-sm">Profit: {idr(r.simulated.profit)}</p>
      <p class="text-sm">Margin: {(r.simulated.margin * 100).toFixed(1)}%</p>
    </Card>
  </div>
  <p class="mt-4 text-sm">
    Perubahan revenue: <strong>{(r.impact.revenueChangePercent * 100).toFixed(1)}%</strong> ·
    Perubahan profit: <strong>{(r.impact.profitChangePercent * 100).toFixed(1)}%</strong>
  </p>
  <ul class="mt-2 text-xs text-neutral-500 list-disc list-inside">
    {#each r.assumptions as a}<li>{a}</li>{/each}
  </ul>
{/if}
