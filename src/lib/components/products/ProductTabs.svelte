<script lang="ts">
  import { page } from '$app/stores';
  export let isOwner: boolean;
  $: active = $page.url.pathname.startsWith('/products/stok') ? 'stok' : 'daftar';
</script>

<!-- Garis bawah dipegang pembungkus luar supaya slot aksi (CTA) bisa duduk
     sejajar tab tanpa memutus garis. -->
<div class="flex items-end justify-between gap-3 border-b border-border-cool mb-4">
<div class="flex gap-1" role="tablist" aria-label="Navigasi produk">
  <a
    href="/products"
    role="tab"
    aria-selected={active === 'daftar'}
    class="px-4 h-10 inline-flex items-center text-body-md no-underline border-b-2 -mb-px {active === 'daftar'
      ? 'border-ink-navy text-ink font-semibold'
      : 'border-transparent text-muted hover:text-ink'}"
  >Daftar</a>
  {#if isOwner}
    <a
      href="/products/stok"
      role="tab"
      aria-selected={active === 'stok'}
      class="px-4 h-10 inline-flex items-center text-body-md no-underline border-b-2 -mb-px {active === 'stok'
        ? 'border-ink-navy text-ink font-semibold'
        : 'border-transparent text-muted hover:text-ink'}"
    >Riwayat Stok</a>
  {/if}
</div>
{#if $$slots.actions}
  <div class="mb-2 flex-shrink-0"><slot name="actions" /></div>
{/if}
</div>
