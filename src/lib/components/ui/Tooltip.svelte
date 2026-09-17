<script lang="ts">
  // Ikon tanda tanya kecil dipasang di kanan label field. Hover (desktop)
  // ATAU klik/tap (mobile, karena gak ada hover state di touch) sama-sama
  // munculin bubble penjelasan. Klik di luar bubble nutup lagi.
  export let text: string;
  export let label = 'Info field ini';

  let open = false;
  let wrapperEl: HTMLElement;

  function handleWindowClick(event: MouseEvent) {
    if (wrapperEl && !wrapperEl.contains(event.target as Node)) {
      open = false;
    }
  }
</script>

<svelte:window on:click={handleWindowClick} />

<span class="relative inline-flex" bind:this={wrapperEl}>
  <button
    type="button"
    class="flex items-center justify-center w-4 h-4 rounded-full border border-border-input text-muted hover:text-ink-navy hover:border-ink-navy focus:outline-none focus:ring-2 focus:ring-ink-navy/15 transition-colors"
    aria-label={label}
    aria-expanded={open}
    on:mouseenter={() => (open = true)}
    on:mouseleave={() => (open = false)}
    on:click|stopPropagation={() => (open = !open)}
  >
    <svg viewBox="0 0 16 16" class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M6.1 6.3c0-1.1.8-1.9 1.9-1.9s1.9.7 1.9 1.7c0 1-.7 1.3-1.4 1.8-.4.3-.5.6-.5 1" stroke-linecap="round" />
      <circle cx="8" cy="11.2" r="0.2" fill="currentColor" stroke="none" />
    </svg>
  </button>

  {#if open}
    <div
      role="tooltip"
      class="absolute z-20 left-1/2 -translate-x-1/2 bottom-[calc(100%+6px)] w-56 rounded border border-border-cool bg-ink text-white text-body-sm px-3 py-2 shadow-level2"
    >
      {text}
      <span class="absolute left-1/2 -translate-x-1/2 top-full -mt-1 w-2 h-2 bg-ink rotate-45"></span>
    </div>
  {/if}
</span>
