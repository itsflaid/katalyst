<script lang="ts">
  import Badge from "$lib/components/ui/Badge.svelte";
  export let stock: number;
  export let minStock = 5;
</script>

{#if stock <= 0}
  <Badge size="sm" tone="negative">Habis</Badge>
{:else if stock <= minStock}
  <span class="tabular text-muted">{stock} </span><Badge size="sm" tone="warning">Menipis</Badge>
{:else}
  <span class="tabular text-ink">{stock}</span>
{/if}
