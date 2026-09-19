<script lang="ts">
  import type { SubmitFunction } from "@sveltejs/kit";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Table from "$lib/components/ui/Table.svelte";
  import StockBadge from "$lib/components/products/StockBadge.svelte";
  import ActiveToggle from "$lib/components/products/ActiveToggle.svelte";
  import RowActions from "$lib/components/products/RowActions.svelte";

  type Product = {
    id: string;
    name: string;
    costPrice: number;
    sellingPrice: number;
    stock: number;
    isActive: boolean;
  };

  export let products: Product[];
  export let isOwner: boolean;
  export let onSubmit: SubmitFunction;
  export let onStock: (p: { id: string; name: string; stock: number }, mode: 'restock' | 'adjust') => void;
  export let onEdit: (p: { id: string; name: string; costPrice: number; sellingPrice: number; isActive: boolean }) => void;
  export let onDelete: (p: { id: string; name: string }) => void;

  const idr = (n: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(n);

  const marginOf = (p: { costPrice: number; sellingPrice: number }) =>
    p.sellingPrice > 0
      ? Math.round(((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100)
      : null;
  const marginTone = (m: number | null) =>
    m === null ? "neutral" : m >= 30 ? "positive" : "warning";
</script>

<Table headers={["Produk", "Modal", "Jual", "Margin", "Stok", "Status", "Aksi"]}>
  {#each products as p}
    {@const m = marginOf(p)}
    <tr class={!p.isActive ? "opacity-60" : ""}>
      <td class="px-3 py-2 text-ink font-semibold whitespace-nowrap"><a href={`/products/${p.id}`} class="text-ink-navy hover:underline">{p.name}</a></td>
      <td class="px-3 py-2 tabular text-muted whitespace-nowrap">{idr(p.costPrice)}</td>
      <td class="px-3 py-2 tabular text-ink whitespace-nowrap">{idr(p.sellingPrice)}</td>
      <td class="px-3 py-2">
        <Badge size="sm" tone={marginTone(m)}>{m === null ? "—" : `${m}%`}</Badge>
      </td>
      <td class="px-3 py-2 whitespace-nowrap">
        <StockBadge stock={p.stock} />
      </td>
      <td class="px-3 py-2">
        {#if isOwner}
          <ActiveToggle product={p} onSubmit={onSubmit} />
        {:else}
          <Badge size="sm" tone={p.isActive ? "positive" : "neutral"}>{p.isActive ? "Aktif" : "Nonaktif"}</Badge>
        {/if}
      </td>
      <td class="px-3 py-2 whitespace-nowrap">
        <RowActions product={{ id: p.id, name: p.name, stock: p.stock }} row={p} {isOwner} {onStock} {onEdit} {onDelete} />
      </td>
    </tr>
  {/each}
</Table>
