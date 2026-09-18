<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import Input from "$lib/components/ui/Input.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Table from "$lib/components/ui/Table.svelte";
  import SlideOver from "$lib/components/ui/SlideOver.svelte";
  import { fade, scale } from "svelte/transition";
  export let data;
  export let form;

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

  const statusOptions = [
    { value: "all", label: "Semua" },
    { value: "active", label: "Aktif" },
    { value: "inactive", label: "Nonaktif" },
  ] as const;
  type StatusFilter = (typeof statusOptions)[number]["value"];

  let query = "";
  let statusFilter: StatusFilter = "all";
  $: filtered = data.products.filter((p) => {
    const q = query.trim().toLowerCase();
    const matchQuery = !q || p.name.toLowerCase().includes(q);
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active" ? p.isActive : !p.isActive);
    return matchQuery && matchStatus;
  });
  $: activeCount = data.products.filter((p) => p.isActive).length;

  let showCreate = false;
  let editing: {
    id: string;
    name: string;
    costPrice: string;
    sellingPrice: string;
    isActive: boolean;
  } | null = null;
  let pendingDelete: { id: string; name: string } | null = null;

  let cName = "";
  let cCost = "";
  let cSell = "";
  let cActive = true;

  function openEdit(p: {
    id: string;
    name: string;
    costPrice: number;
    sellingPrice: number;
    isActive: boolean;
  }) {
    editing = {
      id: p.id,
      name: p.name,
      costPrice: String(p.costPrice),
      sellingPrice: String(p.sellingPrice),
      isActive: p.isActive,
    };
  }
  function closeModals() {
    showCreate = false;
    editing = null;
    pendingDelete = null;
  }
  function resetCreate() {
    cName = "";
    cCost = "";
    cSell = "";
    cActive = true;
  }

  const afterSubmit: SubmitFunction =
    () =>
    async ({ result, update }) => {
      await update();
      if (result.type === "success") {
        closeModals();
        resetCreate();
      }
    };

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") closeModals();
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="mb-1">
  <h1 class="text-headline-lg text-ink">Produk</h1>
  <p class="text-body-md text-muted">
    {data.products.length} produk terdaftar · {activeCount} aktif
  </p>
</div>

<div class="flex flex-wrap items-center gap-3 my-4">
  <Input
    bind:value={query}
    placeholder="Cari nama produk…"
    class="max-w-sm flex-1 min-w-[200px]"
    aria-label="Cari nama produk"
  />
  <div
    class="flex rounded border border-border-input overflow-hidden"
    role="group"
    aria-label="Filter status"
  >
    {#each statusOptions as o}
      <button
        type="button"
        on:click={() => (statusFilter = o.value)}
        aria-pressed={statusFilter === o.value}
        class="px-3 h-9 text-body-md border-none cursor-pointer {statusFilter === o.value
          ? 'bg-ink-navy text-white font-semibold'
          : 'bg-white text-muted hover:bg-table-header'}"
      >
        {o.label}
      </button>
    {/each}
  </div>
  <Button on:click={() => (showCreate = true)} class="flex-shrink-0 ml-auto">+ Tambah</Button>
</div>

{#if data.products.length === 0}
  <div class="rounded-panel border-2 border-dashed border-border-input text-center py-12 px-4">
    <p class="text-body-md text-muted mb-4">
      Belum ada produk. Tambahkan produk pertama untuk mulai mencatat transaksi.
    </p>
    <Button on:click={() => (showCreate = true)}>+ Tambah Produk</Button>
  </div>
{:else if filtered.length === 0}
  <div class="rounded-panel border-2 border-dashed border-border-input text-center py-12 px-4">
    <p class="text-body-md text-muted">
      Tidak ada produk yang cocok dengan filter ini.
    </p>
  </div>
{:else}
  <Table headers={["Produk", "Modal", "Jual", "Margin", "Status", "Aksi"]}>
    {#each filtered as p}
      {@const m = marginOf(p)}
      <tr class={!p.isActive ? "opacity-60" : ""}>
        <td class="px-3 py-2 text-ink font-semibold whitespace-nowrap"><a href={`/products/${p.id}`} class="text-ink-navy hover:underline">{p.name}</a></td>
        <td class="px-3 py-2 tabular text-muted whitespace-nowrap">{idr(p.costPrice)}</td>
        <td class="px-3 py-2 tabular text-ink whitespace-nowrap">{idr(p.sellingPrice)}</td>
        <td class="px-3 py-2">
          <Badge tone={marginTone(m)}>{m === null ? "—" : `${m}%`}</Badge>
        </td>
        <td class="px-3 py-2">
          <form method="POST" action="?/toggle" use:enhance={afterSubmit}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="isActive" value={p.isActive ? "off" : "on"} />
            <button
              type="submit"
              role="switch"
              aria-checked={p.isActive}
              aria-label={p.isActive ? `Nonaktifkan ${p.name}` : `Aktifkan ${p.name}`}
              title={p.isActive ? "Klik untuk menonaktifkan" : "Klik untuk mengaktifkan"}
              class="relative block h-6 w-10 rounded-full border transition-colors cursor-pointer {p.isActive
                ? 'bg-status-positive border-status-positive'
                : 'bg-surface-dim border-border-input'}"
            >
              <span
                class="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-all {p.isActive
                  ? 'left-[18px]'
                  : 'left-0.5'}"
              ></span>
            </button>
          </form>
        </td>
        <td class="px-3 py-2 whitespace-nowrap">
          <div class="flex items-center gap-3">
            <a href={`/products/${p.id}`} class="text-body-sm font-semibold text-ink-navy hover:underline">
              Detail
            </a>
            <button
              type="button"
              on:click={() => openEdit(p)}
              class="text-body-sm font-semibold text-ink-navy hover:underline bg-transparent border-none cursor-pointer p-0"
            >
              Edit
            </button>
            <a href={`/simulator?productId=${p.id}`} class="text-body-sm text-muted hover:underline">
              Simulasikan
            </a>
            <button
              type="button"
              on:click={() => (pendingDelete = { id: p.id, name: p.name })}
              class="text-body-sm font-semibold text-status-negative hover:underline bg-transparent border-none cursor-pointer p-0"
            >
              Hapus
            </button>
          </div>
        </td>
      </tr>
    {/each}
  </Table>
  <p class="text-body-sm text-muted mt-2">
    Menampilkan {filtered.length} dari {data.products.length} produk.
  </p>
{/if}

{#if showCreate}
  <SlideOver title="Tambah Produk" onClose={closeModals}>
    <form
      method="POST"
      action="?/create"
      use:enhance={afterSubmit}
      class="flex flex-col gap-3"
    >
      <label for="c-name" class="flex flex-col gap-1 text-body-md text-ink">
        Nama produk
        <Input
          id="c-name"
          name="name"
          bind:value={cName}
          placeholder="Contoh: Kopi Susu"
          required
        />
      </label>
      <label for="c-cost" class="flex flex-col gap-1 text-body-md text-ink">
        Harga modal
        <Input
          id="c-cost"
          name="costPrice"
          type="number"
          min="0"
          bind:value={cCost}
          placeholder="15000"
          required
        />
      </label>
      <label for="c-sell" class="flex flex-col gap-1 text-body-md text-ink">
        Harga jual
        <Input
          id="c-sell"
          name="sellingPrice"
          type="number"
          min="1"
          bind:value={cSell}
          placeholder="25000"
          required
        />
      </label>
      <label class="flex items-center gap-2 text-body-md text-ink">
        <input
          type="checkbox"
          name="isActive"
          bind:checked={cActive}
          class="h-4 w-4 accent-ink-navy"
        />
        Aktif dijual
      </label>
      {#if form?.for === "create"}<p class="text-body-sm text-status-negative">
          {form.message}
        </p>{/if}
      <div class="flex justify-end gap-2 mt-1">
        <Button variant="secondary" type="button" on:click={closeModals}
          >Batal</Button
        >
        <Button type="submit">Simpan</Button>
      </div>
    </form>
  </SlideOver>
{/if}

{#if editing}
  <SlideOver title="Edit Produk" onClose={closeModals}>
    <form
      method="POST"
      action="?/update"
      use:enhance={afterSubmit}
      class="flex flex-col gap-3"
    >
      <input type="hidden" name="id" value={editing.id} />
      <label for="e-name" class="flex flex-col gap-1 text-body-md text-ink">
        Nama produk
        <Input id="e-name" name="name" bind:value={editing.name} required />
      </label>
      <label for="e-cost" class="flex flex-col gap-1 text-body-md text-ink">
        Harga modal
        <Input
          id="e-cost"
          name="costPrice"
          type="number"
          min="0"
          bind:value={editing.costPrice}
          required
        />
      </label>
      <label for="e-sell" class="flex flex-col gap-1 text-body-md text-ink">
        Harga jual
        <Input
          id="e-sell"
          name="sellingPrice"
          type="number"
          min="1"
          bind:value={editing.sellingPrice}
          required
        />
      </label>
      <label class="flex items-center gap-2 text-body-md text-ink">
        <input
          type="checkbox"
          name="isActive"
          bind:checked={editing.isActive}
          class="h-4 w-4 accent-ink-navy"
        />
        Aktif dijual
      </label>
      {#if form?.for === "update"}<p class="text-body-sm text-status-negative">
          {form.message}
        </p>{/if}
      <div class="flex items-center justify-between gap-2 mt-1">
        <a
          href={`/simulator?productId=${editing.id}`}
          class="text-body-sm text-ink-navy underline">Simulasikan</a
        >
        <div class="flex gap-2">
          <Button variant="secondary" type="button" on:click={closeModals}
            >Batal</Button
          >
          <Button type="submit">Simpan</Button>
        </div>
      </div>
    </form>
  </SlideOver>
{/if}

{#if pendingDelete}
  <button
    type="button"
    class="fixed inset-0 z-50 bg-ink/40 border-none cursor-default p-0"
    transition:fade={{ duration: 150 }}
    aria-label="Batalkan hapus"
    on:click={closeModals}
  ></button>
  <div class="fixed inset-0 z-50 grid place-items-center p-4 pointer-events-none">
    <div
      class="pointer-events-auto w-full max-w-sm rounded-panel border border-border-cool bg-surface p-5 shadow-level3"
      transition:scale={{ duration: 150, start: 0.96 }}
      role="dialog"
      aria-modal="true"
      aria-label="Konfirmasi hapus produk"
    >
      <h2 class="text-headline-sm text-ink mb-2">Hapus produk?</h2>
      <p class="text-body-md text-muted">
        “{pendingDelete.name}” akan dihapus permanen. Produk yang sudah punya
        riwayat transaksi tidak bisa dihapus — nonaktifkan saja.
      </p>
      <div class="flex gap-2 mt-4">
        <Button variant="secondary" class="flex-1" on:click={closeModals}>Batal</Button>
        <form
          method="POST"
          action="?/delete"
          use:enhance={afterSubmit}
          class="flex-1"
        >
          <input type="hidden" name="id" value={pendingDelete.id} />
          <Button variant="destructive" type="submit" class="w-full">Hapus</Button>
        </form>
      </div>
    </div>
  </div>
{/if}
