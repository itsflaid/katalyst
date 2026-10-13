<script lang="ts">
  import { tick } from 'svelte';
  import { Ellipsis, Eye, PackagePlus, Pencil, FlaskConical, Trash2 } from 'lucide-svelte';
  import { portal } from '$lib/shared/portal';

  export let product: { id: string; name: string; stock: number };
  export let isOwner: boolean;
  export let onStock: (p: { id: string; name: string; stock: number }, mode: 'restock' | 'adjust') => void;
  export let onEdit: (p: { id: string; name: string; costPrice: number; sellingPrice: number; isActive: boolean; minStock?: number | null }) => void;
  export let onDelete: (p: { id: string; name: string }) => void;
  export let row: { id: string; name: string; costPrice: number; sellingPrice: number; isActive: boolean; stock: number; minStock?: number | null };

  const GAP = 4;
  const EDGE = 8;

  let open = false;
  let placed = false;
  let top = 0;
  let left = 0;
  let triggerEl: HTMLButtonElement | null = null;
  let menuEl: HTMLDivElement | null = null;

  async function toggle() {
    if (open) {
      close();
      return;
    }
    open = true;
    await place();
  }

  function close() {
    open = false;
    placed = false;
  }

  // Menu dirender di body dengan posisi fixed: tidak terpotong overflow tabel.
  // Buka ke atas bila ruang di bawah tombol tidak cukup.
  async function place() {
    await tick();
    if (!open || !triggerEl || !menuEl) return;
    const t = triggerEl.getBoundingClientRect();
    const w = menuEl.offsetWidth;
    const h = menuEl.offsetHeight;
    const spaceBelow = window.innerHeight - t.bottom - EDGE;
    const spaceAbove = t.top - EDGE;
    const flip = spaceBelow < h + GAP && spaceAbove > spaceBelow;
    const rawTop = flip ? t.top - h - GAP : t.bottom + GAP;
    top = Math.max(EDGE, Math.min(rawTop, window.innerHeight - h - EDGE));
    left = Math.max(EDGE, Math.min(t.right - w, window.innerWidth - w - EDGE));
    placed = true;
    menuEl.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }

  function onKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      close();
      triggerEl?.focus();
    }
  }

  function onScroll(e: Event) {
    if (open && !menuEl?.contains(e.target as Node)) close();
  }

  function run(action: () => void) {
    close();
    action();
  }

  const itemClass =
    'flex w-full items-center gap-2 px-3 py-2 text-left text-body-sm font-semibold no-underline bg-transparent border-none cursor-pointer outline-none hover:bg-table-header focus-visible:bg-table-header';
</script>

<svelte:window on:keydown={onKey} on:resize={() => open && place()} on:scroll|capture={onScroll} />

<button
  bind:this={triggerEl}
  type="button"
  on:click={toggle}
  aria-haspopup="menu"
  aria-expanded={open}
  aria-label={`Aksi untuk ${product.name}`}
  class="grid h-8 w-8 cursor-pointer place-items-center rounded border border-border-input text-ink hover:bg-table-header {open
    ? 'bg-table-header'
    : 'bg-white'}"
>
  <Ellipsis size={16} aria-hidden="true" />
</button>

{#if open}
  <div use:portal>
    <button
      type="button"
      class="fixed inset-0 z-40 cursor-default border-none bg-transparent p-0"
      tabindex="-1"
      aria-label="Tutup menu aksi"
      on:click={close}
    ></button>
    <div
      bind:this={menuEl}
      role="menu"
      aria-label={`Aksi untuk ${product.name}`}
      class="fixed z-50 w-44 rounded border border-border-cool bg-surface py-1 shadow-level3"
      style="top: {top}px; left: {left}px; visibility: {placed ? 'visible' : 'hidden'};"
    >
      <a role="menuitem" href={`/products/${product.id}`} on:click={close} class="{itemClass} text-ink-navy">
        <Eye size={14} aria-hidden="true" />Detail
      </a>
      {#if isOwner}
        <button role="menuitem" type="button" on:click={() => run(() => onStock(product, 'restock'))} class="{itemClass} text-status-positive">
          <PackagePlus size={14} aria-hidden="true" />Stok
        </button>
        <button role="menuitem" type="button" on:click={() => run(() => onEdit(row))} class="{itemClass} text-ink-navy">
          <Pencil size={14} aria-hidden="true" />Edit
        </button>
        <a role="menuitem" href={`/simulator?productId=${product.id}`} on:click={close} class="{itemClass} !font-normal text-muted">
          <FlaskConical size={14} aria-hidden="true" />Simulasikan
        </a>
        <div class="my-1 border-t border-border-cool"></div>
        <button role="menuitem" type="button" on:click={() => run(() => onDelete(product))} class="{itemClass} text-status-negative">
          <Trash2 size={14} aria-hidden="true" />Hapus
        </button>
      {/if}
    </div>
  </div>
{/if}
