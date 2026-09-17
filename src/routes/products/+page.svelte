<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import Table from '$lib/components/ui/Table.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  export let data;
  export let form;

  const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

  const marginOf = (p: { costPrice: number; sellingPrice: number }) =>
    p.sellingPrice > 0 ? (p.sellingPrice - p.costPrice) / p.sellingPrice : null;
  const marginTone = (m: number | null): 'positive' | 'warning' | 'negative' | 'neutral' =>
    m === null ? 'neutral' : m >= 0.3 ? 'positive' : m >= 0.1 ? 'warning' : 'negative';

  // Search client-side (tanpa roundtrip server)
  let query = '';
  $: filtered = data.products.filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  // State modal
  let showCreate = false;
  let editing: { id: string; name: string; costPrice: string; sellingPrice: string; isActive: boolean } | null = null;

  // Field form tambah (di-reset tiap sukses) — string karena <input> selalu string
  let cName = '';
  let cCost = '';
  let cSell = '';
  let cActive = true;

  function openEdit(p: { id: string; name: string; costPrice: number; sellingPrice: number; isActive: boolean }) {
    editing = { id: p.id, name: p.name, costPrice: String(p.costPrice), sellingPrice: String(p.sellingPrice), isActive: p.isActive };
  }
  function closeModals() {
    showCreate = false;
    editing = null;
  }
  function resetCreate() {
    cName = '';
    cCost = '';
    cSell = '';
    cActive = true;
  }

  // Modal tetap terbuka kalau validasi gagal (form.message tampil),
  // tertutup + field di-reset kalau sukses. update() me-refresh tabel.
  const afterSubmit: SubmitFunction = () => async ({ result, update }) => {
    await update();
    if (result.type === 'success') {
      closeModals();
      resetCreate();
    }
  };

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeModals();
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="flex items-center justify-between gap-4 mb-2">
  <h1 class="text-headline-lg text-ink">Produk</h1>
  <Button on:click={() => (showCreate = true)}>+ Tambah Produk</Button>
</div>
<p class="text-body-md text-muted mb-6">{data.products.length} produk terdaftar</p>

<Input bind:value={query} placeholder="Cari nama produk…" class="max-w-sm mb-4" />

{#if data.products.length === 0}
  <Card class="text-center py-10">
    <p class="text-body-md text-muted mb-4">Belum ada produk. Tambahkan produk pertama untuk mulai mencatat transaksi.</p>
    <Button on:click={() => (showCreate = true)}>+ Tambah Produk</Button>
  </Card>
{:else if filtered.length === 0}
  <Card class="text-center py-10">
    <p class="text-body-md text-muted">Tidak ada produk yang cocok dengan “{query.trim()}”.</p>
  </Card>
{:else}
  <Table headers={['Produk', 'Harga Modal', 'Harga Jual', 'Margin', 'Status', 'Aksi']}>
    {#each filtered as p}
      {@const m = marginOf(p)}
      <tr>
        <td class="px-3 py-2">
          <a href={`/products/${p.id}`} class="font-semibold text-ink-navy no-underline hover:underline">{p.name}</a>
        </td>
        <td class="px-3 py-2 tabular">{idr(p.costPrice)}</td>
        <td class="px-3 py-2 tabular">{idr(p.sellingPrice)}</td>
        <td class="px-3 py-2">
          {#if m === null}
            <span class="text-muted">—</span>
          {:else}
            <Badge tone={marginTone(m)}>{(m * 100).toFixed(0)}%</Badge>
          {/if}
        </td>
        <td class="px-3 py-2">
          {#if p.isActive}
            <Badge tone="positive">Aktif</Badge>
          {:else}
            <Badge tone="neutral">Nonaktif</Badge>
          {/if}
        </td>
        <td class="px-3 py-2">
          <div class="flex items-center gap-2">
            <a href={`/simulator?productId=${p.id}`} class="text-body-sm text-ink-navy underline whitespace-nowrap">Simulasikan</a>
            <Button size="compact" variant="secondary" on:click={() => openEdit(p)}>Edit</Button>
            <form
              method="POST"
              action="?/delete"
              on:submit={(e) => {
                if (!confirm(`Hapus "${p.name}"?`)) e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={p.id} />
              <Button size="compact" variant="destructive" type="submit">Hapus</Button>
            </form>
          </div>
        </td>
      </tr>
    {/each}
  </Table>
{/if}

<!-- Modal tambah -->
{#if showCreate}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
    role="button"
    tabindex="0"
    aria-label="Tutup dialog tambah produk"
    on:click|self={closeModals}
    on:keydown={(e) => {
      if (e.target === e.currentTarget && (e.key === 'Escape' || e.key === 'Enter')) closeModals();
    }}
  >
    <Card class="w-full max-w-md">
      <h2 class="text-headline-sm text-ink mb-4">Tambah Produk</h2>
      <form method="POST" action="?/create" use:enhance={afterSubmit} class="flex flex-col gap-3">
        <label for="c-name" class="flex flex-col gap-1 text-body-md text-ink">
          Nama produk
          <Input id="c-name" name="name" bind:value={cName} placeholder="Contoh: Kopi Susu" required />
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label for="c-cost" class="flex flex-col gap-1 text-body-md text-ink">
            Harga modal
            <Input id="c-cost" name="costPrice" type="number" min="0" bind:value={cCost} placeholder="15000" required />
          </label>
          <label for="c-sell" class="flex flex-col gap-1 text-body-md text-ink">
            Harga jual
            <Input id="c-sell" name="sellingPrice" type="number" min="1" bind:value={cSell} placeholder="25000" required />
          </label>
        </div>
        <label class="flex items-center gap-2 text-body-md text-ink">
          <input type="checkbox" name="isActive" bind:checked={cActive} class="h-4 w-4 accent-ink-navy" />
          Aktif dijual
        </label>
        {#if form?.for === 'create'}
          <p class="text-body-sm text-status-negative">{form.message}</p>
        {/if}
        <div class="flex justify-end gap-2 mt-1">
          <Button variant="secondary" type="button" on:click={closeModals}>Batal</Button>
          <Button type="submit">Simpan</Button>
        </div>
      </form>
    </Card>
  </div>
{/if}

<!-- Modal edit -->
{#if editing}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
    role="button"
    tabindex="0"
    aria-label="Tutup dialog edit produk"
    on:click|self={closeModals}
    on:keydown={(e) => {
      if (e.target === e.currentTarget && (e.key === 'Escape' || e.key === 'Enter')) closeModals();
    }}
  >
    <Card class="w-full max-w-md">
      <h2 class="text-headline-sm text-ink mb-4">Edit Produk</h2>
      <form method="POST" action="?/update" use:enhance={afterSubmit} class="flex flex-col gap-3">
        <input type="hidden" name="id" value={editing.id} />
        <label for="e-name" class="flex flex-col gap-1 text-body-md text-ink">
          Nama produk
          <Input id="e-name" name="name" bind:value={editing.name} required />
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label for="e-cost" class="flex flex-col gap-1 text-body-md text-ink">
            Harga modal
            <Input id="e-cost" name="costPrice" type="number" min="0" bind:value={editing.costPrice} required />
          </label>
          <label for="e-sell" class="flex flex-col gap-1 text-body-md text-ink">
            Harga jual
            <Input id="e-sell" name="sellingPrice" type="number" min="1" bind:value={editing.sellingPrice} required />
          </label>
        </div>
        <label class="flex items-center gap-2 text-body-md text-ink">
          <input type="checkbox" name="isActive" bind:checked={editing.isActive} class="h-4 w-4 accent-ink-navy" />
          Aktif dijual
        </label>
        {#if form?.for === 'update'}
          <p class="text-body-sm text-status-negative">{form.message}</p>
        {/if}
        <div class="flex justify-end gap-2 mt-1">
          <Button variant="secondary" type="button" on:click={closeModals}>Batal</Button>
          <Button type="submit">Simpan</Button>
        </div>
      </form>
    </Card>
  </div>
{/if}
