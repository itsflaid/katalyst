<script context="module" lang="ts">
  export interface DiscountRow {
    id: string;
    name: string;
    scope: 'PRODUCT' | 'GLOBAL';
    percent: number;
    productId: string | null;
    productName: string | null;
    isActive: boolean;
    startsAt: string;
    endsAt: string | null;
    quota: number | null;
    quotaUsed: number;
    createdAt: string;
    status: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'SOLD_OUT' | 'INACTIVE';
  }
</script>

<script lang="ts">
  import type { SubmitFunction } from "@sveltejs/kit";
  import { enhance } from "$app/forms";
  import Button from "$lib/components/ui/Button.svelte";
  import Table from "$lib/components/ui/Table.svelte";
  import DiscountStatusBadge from "$lib/components/discount/DiscountStatusBadge.svelte";
  import type { BizTime } from "$lib/shared/time";

  export let discounts: DiscountRow[];
  export let T: BizTime;
  export let onSubmit: SubmitFunction;
  export let onEdit: (d: DiscountRow) => void;
  export let onDelete: (d: DiscountRow) => void;

  // T cukup dirujuk di markup (reaktif via prop) — tidak ada fungsi pembantu
  // di luar markup yang butuh T sebagai argumen di sini.
  const fmtRange = (d: DiscountRow) => {
    const start = T.fmt(d.startsAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    if (!d.endsAt) return `${start} → Tanpa batas waktu`;
    const end = T.fmt(d.endsAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `${start} → ${end} ${T.short}`;
  };
</script>

{#if discounts.length === 0}
  <div class="rounded-panel border-2 border-dashed border-border-input text-center py-12 px-4">
    <p class="text-body-md text-muted">Belum ada diskon di tab ini.</p>
  </div>
{:else}
  <Table headers={['Nama', 'Cakupan', 'Diskon', 'Berlaku', 'Kuota', 'Status', 'Aksi']}>
    {#each discounts as d}
      <tr>
        <td class="px-3 py-2 text-ink font-semibold whitespace-nowrap">{d.name}</td>
        <td class="px-3 py-2 text-muted whitespace-nowrap">{d.scope === 'PRODUCT' ? (d.productName ?? '—') : 'Semua produk'}</td>
        <td class="px-3 py-2 tabular text-ink whitespace-nowrap">{d.percent}%</td>
        <td class="px-3 py-2 text-body-sm text-muted whitespace-nowrap">{fmtRange(d)}</td>
        <td class="px-3 py-2 text-body-sm text-muted whitespace-nowrap">
          {#if d.quota === null}
            Tanpa batas · terpakai {d.quotaUsed}
          {:else}
            <span class="tabular">{d.quotaUsed}/{d.quota}</span>
            <div class="h-1 w-20 rounded bg-table-header mt-1">
              <div class="h-1 rounded bg-ink-navy" style="width:{Math.min(100, Math.round((d.quotaUsed / d.quota) * 100))}%"></div>
            </div>
          {/if}
        </td>
        <td class="px-3 py-2 whitespace-nowrap"><DiscountStatusBadge status={d.status} /></td>
        <td class="px-3 py-2 whitespace-nowrap">
          <div class="flex items-center gap-2">
            <Button size="compact" variant="secondary" type="button" on:click={() => onEdit(d)}>Edit</Button>
            <form method="POST" action="?/toggle" use:enhance={onSubmit} class="inline">
              <input type="hidden" name="id" value={d.id} />
              <Button size="compact" variant="secondary" type="submit">{d.isActive ? 'Nonaktifkan' : 'Aktifkan'}</Button>
            </form>
            {#if d.quotaUsed === 0}
              <Button size="compact" variant="destructive" type="button" on:click={() => onDelete(d)}>Hapus</Button>
            {/if}
          </div>
        </td>
      </tr>
    {/each}
  </Table>
{/if}
