<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/stores";
  import type { SubmitFunction } from "@sveltejs/kit";
  import Button from "$lib/components/ui/Button.svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import ProductToolbar from "$lib/components/products/ProductToolbar.svelte";
  import type { StockFilter } from "$lib/components/products/ProductToolbar.svelte";
  import ProductTabs from "$lib/components/products/ProductTabs.svelte";
  import ProductTable from "$lib/components/products/ProductTable.svelte";
  import ProductFormSlideOver from "$lib/components/products/ProductFormSlideOver.svelte";
  import StockSlideOver from "$lib/components/products/StockSlideOver.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  export let data;
  export let form;

  type StatusFilter = "all" | "active" | "inactive";

  const minOf = (p: { minStock?: number | null }) => p.minStock ?? 5;

  let query = "";
  let statusFilter: StatusFilter = "all";
  // Nilai awal dari ?stok=restock|habis (dipakai tautan dari dashboard).
  const stokParam = $page.url.searchParams.get("stok");
  let stockFilter: StockFilter = stokParam === "habis" ? "habis" : stokParam === "restock" ? "restock" : "all";
  $: restockCount = data.products.filter((p) => p.stock <= minOf(p)).length;
  $: outCount = data.products.filter((p) => p.stock <= 0).length;
  $: filtered = data.products
    .filter((p) => {
      const q = query.trim().toLowerCase();
      const matchQuery = !q || p.name.toLowerCase().includes(q);
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? p.isActive : !p.isActive);
      const matchStock =
        stockFilter === "all" ||
        (stockFilter === "restock" ? p.stock <= minOf(p) : p.stock <= 0);
      return matchQuery && matchStatus && matchStock;
    })
    // Saat filter stok aktif, urutkan stok naik (yang paling kritis dulu).
    .sort((a, b) => (stockFilter === "all" ? 0 : a.stock - b.stock));
  $: activeCount = data.products.filter((p) => p.isActive).length;
  // STAFF boleh lihat daftar & stok, tapi semua aksi ubah data ditolak server
  // (OWNER-only) — di sini tombolnya disembunyikan biar tidak ada dead-end.
  $: isOwner = data.role === "OWNER";

  let showCreate = false;
  let stockModal: { mode: 'restock' | 'adjust'; id: string; name: string; stock: number } | null = null;
  let editing: { id: string; name: string; costPrice: string; sellingPrice: string; isActive: boolean; minStock: string } | null = null;
  let pendingDelete: { id: string; name: string } | null = null;

  function openEdit(p: { id: string; name: string; costPrice: number; sellingPrice: number; isActive: boolean; minStock?: number | null }) {
    editing = { id: p.id, name: p.name, costPrice: String(p.costPrice), sellingPrice: String(p.sellingPrice), isActive: p.isActive, minStock: String(p.minStock ?? 5) };
  }
  function openStock(p: { id: string; name: string; stock: number }, mode: 'restock' | 'adjust') {
    stockModal = { mode, id: p.id, name: p.name, stock: p.stock };
  }
  function switchStockMode(mode: 'restock' | 'adjust') {
    if (!stockModal) return;
    stockModal = { ...stockModal, mode };
  }
  function closeModals() {
    showCreate = false;
    editing = null;
    pendingDelete = null;
    stockModal = null;
  }

  const afterSubmit: SubmitFunction =
    () =>
    async ({ result, update }) => {
      await update();
      if (result.type === "success") closeModals();
    };

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") closeModals();
  }
</script>

<svelte:window on:keydown={onKeydown} />

<PageHeader title="Produk" subtitle={`${data.products.length} produk terdaftar · ${activeCount} aktif`} />

<ProductTabs {isOwner} />

<ProductToolbar bind:query bind:statusFilter bind:stockFilter {restockCount} {outCount} {isOwner} onAdd={() => (showCreate = true)} />

{#if data.products.length === 0}
  <div class="rounded-panel border-2 border-dashed border-border-input text-center py-12 px-4">
    <p class="text-body-md text-muted {isOwner ? 'mb-4' : ''}">
      {isOwner
        ? "Belum ada produk. Tambahkan produk pertama untuk mulai mencatat transaksi."
        : "Belum ada produk. Minta Owner menambahkan produk dulu."}
    </p>
    {#if isOwner}
      <Button on:click={() => (showCreate = true)}>+ Tambah Produk</Button>
    {/if}
  </div>
{:else if filtered.length === 0}
  <div class="rounded-panel border-2 border-dashed border-border-input text-center py-12 px-4">
    <p class="text-body-md text-muted">
      Tidak ada produk yang cocok dengan filter ini.
    </p>
  </div>
{:else}
  <ProductTable
    products={filtered}
    {isOwner}
    onSubmit={afterSubmit}
    onStock={openStock}
    onEdit={openEdit}
    onDelete={(p) => (pendingDelete = p)}
  />
  <p class="text-body-sm text-muted mt-2">
    Menampilkan {filtered.length} dari {data.products.length} produk.
  </p>
{/if}

{#if showCreate}
  <ProductFormSlideOver mode="create" {form} onSubmit={afterSubmit} onClose={closeModals} />
{/if}

{#if editing}
  <ProductFormSlideOver mode="edit" product={editing} {form} onSubmit={afterSubmit} onClose={closeModals} />
{/if}

{#if pendingDelete}
  <ConfirmDialog title="Hapus produk?" onClose={closeModals}>
    “{pendingDelete.name}” akan dihapus permanen. Produk yang sudah punya
    riwayat penjualan tidak bisa dihapus — nonaktifkan saja.
    {#if form?.for === "delete"}<p class="text-body-sm text-status-negative mt-2">{form.message}</p>{/if}
    <svelte:fragment slot="actions">
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
    </svelte:fragment>
  </ConfirmDialog>
{/if}

{#if stockModal}
  {#key stockModal.id + stockModal.mode}
    <StockSlideOver modal={stockModal} {form} onSubmit={afterSubmit} onClose={closeModals} onSwitchMode={switchStockMode} />
  {/key}
{/if}
