<script lang="ts">
  import { enhance } from '$app/forms';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  export let data;
  export let form;

  const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
</script>

<h1 class="text-2xl font-semibold mb-6">Simulator "What-if"</h1>

<form method="POST" action="?/simulate" use:enhance class="flex flex-col gap-4 max-w-md mb-8">
  <label class="flex flex-col gap-1 text-sm">
    Produk
    <select name="productId" class="border border-neutral-300 rounded-md px-3 py-2 text-sm">
      {#each data.products as p}
        <option value={p.id} selected={p.id === data.preselectedProductId}>{p.name}</option>
      {/each}
    </select>
  </label>
  <label for="sim-price" class="flex flex-col gap-1 text-sm">Harga jual baru (opsional)<Input id="sim-price" name="newSellingPrice" type="number" /></label>
  <label for="sim-cost" class="flex flex-col gap-1 text-sm">Harga modal baru (opsional)<Input id="sim-cost" name="newCostPrice" type="number" /></label>
  <label for="sim-discount" class="flex flex-col gap-1 text-sm">Diskon % (opsional)<Input id="sim-discount" name="discountPercent" type="number" /></label>
  <label for="sim-qty" class="flex flex-col gap-1 text-sm">Override quantity (opsional)<Input id="sim-qty" name="quantityOverride" type="number" /></label>
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
