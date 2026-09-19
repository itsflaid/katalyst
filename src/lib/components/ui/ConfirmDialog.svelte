<script lang="ts">
  import { fade, scale } from "svelte/transition";
  export let title = "Konfirmasi";
  export let onClose: () => void;
</script>

<button
  type="button"
  class="fixed inset-0 z-50 bg-ink/40 border-none cursor-default p-0"
  transition:fade={{ duration: 150 }}
  aria-label="Tutup {title}"
  on:click={onClose}
></button>
<div class="fixed inset-0 z-50 grid place-items-center p-4 pointer-events-none">
  <div
    class="pointer-events-auto w-full max-w-sm rounded-panel border border-border-cool bg-surface p-5 shadow-level3"
    transition:scale={{ duration: 150, start: 0.96 }}
    role="dialog"
    aria-modal="true"
    aria-label={title}
  >
    <h2 class="text-headline-sm text-ink mb-2">{title}</h2>
    <div class="text-body-md text-muted">
      <slot />
    </div>
    <div class="flex gap-2 mt-4">
      <slot name="actions" />
    </div>
  </div>
</div>
