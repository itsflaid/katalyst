<script lang="ts">
  // Heading standar tiap halaman: h1 headline-lg + subteks opsional.
  // Satu komponen biar ritme vertikal konsisten (mb-6) dan tidak ada
  // duplikasi class di tiap +page.svelte. Slot "badge" buat aksen
  // inline di samping judul (mis. status Aktif di detail produk).
  export let title = '';
  export let subtitle = '';
  let className = '';
  export { className as class };
</script>

<div class="mb-6 {className}">
  <div class="flex flex-wrap items-center gap-3">
    <h1 class="text-headline-lg text-ink">{title}</h1>
    <slot name="badge" />
  </div>
  {#if subtitle}
    <p class="text-body-md text-muted mt-1">{subtitle}</p>
  {/if}
</div>
