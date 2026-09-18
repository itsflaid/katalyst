<script lang="ts">
  import { fly, fade } from "svelte/transition";
  export let title: string;
  export let onClose: () => void;
</script>

<button
  type="button"
  class="fixed inset-0 z-50 bg-ink/40 border-none cursor-default p-0"
  transition:fade={{ duration: 150 }}
  aria-label={`Tutup ${title}`}
  on:click={onClose}
></button>

<div
  class="fixed top-4 bottom-4 right-4 left-4 sm:left-auto z-50 w-auto sm:w-full sm:max-w-md rounded-panel border border-border-cool bg-surface shadow-level3 flex flex-col overflow-hidden"
  transition:fly={{ x: 40, duration: 200 }}
  role="dialog"
  aria-modal="true"
  aria-label={title}
>
  <div
    class="flex items-center justify-between px-5 py-4 border-b border-border-cool flex-shrink-0"
  >
    <h2 class="text-headline-sm text-ink">{title}</h2>
    <button
      on:click={onClose}
      class="text-muted hover:text-ink text-body-lg leading-none bg-transparent border-none cursor-pointer"
      aria-label="Tutup">✕</button
    >
  </div>
  <div class="flex-1 overflow-y-auto p-5">
    <slot />
  </div>
</div>
