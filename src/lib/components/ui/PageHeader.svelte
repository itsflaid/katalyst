<script lang="ts">
// Heading standar tiap halaman: h1 headline-lg + subteks opsional.
// Ritme vertikal konsisten (mb-6); slot "badge" untuk aksen di samping judul.
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
