<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/stores";
  import type { SubmitFunction } from "@sveltejs/kit";
  import Button from "$lib/components/ui/Button.svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import DiscountTabs from "$lib/components/discount/DiscountTabs.svelte";
  import DiscountTable, { type DiscountRow } from "$lib/components/discount/DiscountTable.svelte";
  import DiscountFormSlideOver from "$lib/components/discount/DiscountFormSlideOver.svelte";
  import { DEFAULT_TZ, makeTime } from "$lib/shared/time";
  export let data;
  export let form;

  $: T = makeTime(data.timezone ?? DEFAULT_TZ);

  // Tampilkan T.short di judul biar zona laporan eksplisit.
  // Daftar sesuai tab server (?tab=), difilter client untuk jaga-jaga.
  $: visible =
    data.tab === 'terjadwal'
      ? data.discounts.filter((d) => d.status === 'SCHEDULED')
      : data.tab === 'selesai'
        ? data.discounts.filter((d) => ['EXPIRED', 'SOLD_OUT', 'INACTIVE'].includes(d.status))
        : data.discounts.filter((d) => d.status === 'ACTIVE');

  // Prefill dari simulator (?new=1&productId&percent&quota&preset&baseline).
  $: prefillNew = $page.url.searchParams.get('new') === '1';
  $: initial = prefillNew
    ? {
        productId: $page.url.searchParams.get('productId') ?? undefined,
        percent: $page.url.searchParams.get('percent') ?? undefined,
        quota: $page.url.searchParams.get('quota') ?? undefined,
        preset: $page.url.searchParams.get('preset') ?? undefined
      }
    : null;
  $: baselineLabel = $page.url.searchParams.get('baseline');

  let showCreate = false;
  let editing: DiscountRow | null = null;
  let pendingDelete: DiscountRow | null = null;
  // Buka otomatis saat datang dari simulator.
  $: if (prefillNew && !showCreate && !editing) showCreate = true;

  function closeModals() {
    showCreate = false;
    editing = null;
    pendingDelete = null;
  }

  const afterSubmit: SubmitFunction =
    () =>
    async ({ result, update }) => {
      await update();
      if (result.type === "success") {
        closeModals();
        // Kembali ke /diskon bersih (tanpa query prefill) setelah simpan.
        if ($page.url.searchParams.has('new')) goto('/diskon');
        else await invalidateAll();
      }
    };

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") closeModals();
  }
</script>

<svelte:window on:keydown={onKeydown} />

<PageHeader title="Diskon" subtitle={`Harga coret otomatis · zona ${T.short}`} />

<div class="flex justify-end mb-2">
  <Button on:click={() => (showCreate = true)}>+ Tambah Diskon</Button>
</div>

<DiscountTabs tab={data.tab} counts={data.counts} />

<DiscountTable
  discounts={visible}
  {T}
  onSubmit={afterSubmit}
  onEdit={(d) => (editing = d)}
  onDelete={(d) => (pendingDelete = d)}
/>

{#if form?.message && !showCreate && !editing && !pendingDelete}
  <p role="alert" class="rounded border border-status-negative-border bg-status-negative-bg px-3 py-2 text-body-sm text-status-negative mt-3">{form.message}</p>
{/if}

{#if showCreate}
  <DiscountFormSlideOver
    mode="create"
    products={data.products}
    {T}
    {initial}
    {baselineLabel}
    {form}
    onSubmit={afterSubmit}
    onClose={closeModals}
  />
{/if}

{#if editing}
  <DiscountFormSlideOver
    mode="edit"
    discount={editing}
    products={data.products}
    {T}
    initial={null}
    baselineLabel={null}
    {form}
    onSubmit={afterSubmit}
    onClose={closeModals}
  />
{/if}

{#if pendingDelete}
  <ConfirmDialog title="Hapus diskon?" onClose={closeModals}>
    Hapus diskon "{pendingDelete.name}"? Hanya bisa dihapus bila belum pernah dipakai.
    <div slot="actions" class="flex gap-2 w-full">
      <Button variant="secondary" class="flex-1" on:click={closeModals}>Batal</Button>
      <form method="POST" action="?/delete" use:enhance={afterSubmit} class="flex-1">
        <input type="hidden" name="id" value={pendingDelete.id} />
        <Button variant="destructive" type="submit" class="w-full">Hapus</Button>
      </form>
    </div>
  </ConfirmDialog>
{/if}
