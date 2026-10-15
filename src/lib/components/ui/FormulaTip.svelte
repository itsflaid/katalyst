<script context="module" lang="ts">
  let seq = 0;
</script>

<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { Info } from 'lucide-svelte';
  import { portal } from '$lib/shared/portal';
  import type { Explain } from '$lib/analytics/explain';

  export let explain: Explain;
  export let variant: 'light' | 'dark' = 'light';

  const popId = `formula-tip-${(seq += 1)}`;
  let open = false;
  let placed = false;
  let trigger: HTMLButtonElement;
  let pop: HTMLDivElement;
  let left = 0;
  let top = 0;

  function close() {
    if (!open) return;
    open = false;
    placed = false;
    window.removeEventListener('scroll', close, true);
  }

  function onBus(event: Event) {
    if ((event as CustomEvent).detail !== popId) close();
  }

  // Posisi dihitung setelah render agar tinggi popover terukur.
  async function position() {
    await tick();
    if (!open || !trigger || !pop) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(pop.offsetWidth, window.innerWidth - 16);
    left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    const below = rect.bottom + 6;
    top = below + pop.offsetHeight + 8 > window.innerHeight ? Math.max(8, rect.top - pop.offsetHeight - 6) : below;
    placed = true;
  }

  async function toggle(event: MouseEvent) {
    event.stopPropagation();
    if (open) {
      close();
      return;
    }
    // Satu popover terbuka dalam satu waktu; svelte:window tak mengenal
    // event kustom sehingga bus dipasang manual.
    window.addEventListener('formula-tip:open', onBus);
    window.dispatchEvent(new CustomEvent('formula-tip:open', { detail: popId }));
    open = true;
    window.addEventListener('scroll', close, true);
    await position();
  }

  function onWindowClick(event: MouseEvent) {
    const t = event.target as Node;
    if (trigger && !trigger.contains(t) && pop && !pop.contains(t)) close();
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') close();
  }

  // onDestroy ikut jalan saat render server; sentuh window hanya di browser.
  onDestroy(() => {
    if (typeof window === 'undefined') return;
    window.removeEventListener('scroll', close, true);
    window.removeEventListener('formula-tip:open', onBus);
  });
</script>

<svelte:window on:click={onWindowClick} on:keydown={onKey} on:resize={close} />

<button
  type="button"
  bind:this={trigger}
  on:click={toggle}
  aria-label={`Rumus ${explain.title}`}
  aria-expanded={open}
  aria-controls={popId}
  class="relative grid h-4 w-4 place-items-center rounded-full transition-colors after:absolute after:-inset-2.5 after:content-[''] {variant === 'dark'
    ? 'text-white/60 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30'
    : 'text-muted hover:text-ink-navy focus-visible:ring-2 focus-visible:ring-ink-navy/15'}"
  ><Info class="h-2.5 w-2.5" aria-hidden="true" /></button
>

{#if open}
  <div
    bind:this={pop}
    use:portal={'body'}
    id={popId}
    role="dialog"
    aria-label={explain.title}
    class="fixed z-[60] w-72 max-w-[calc(100vw-16px)] rounded-lg border border-border-cool bg-surface p-3 text-body-sm text-ink shadow-level2"
    style="left: {left}px; top: {top}px; visibility: {placed ? 'visible' : 'hidden'};"
  >
    <p class="text-label-sm uppercase text-muted">{explain.title}</p>
    <p class="mt-1 font-semibold">Rumus: {explain.formula}</p>
    {#if explain.main}
      <p class="mt-2 tabular">
        Hitungan: {explain.main.expr}
        {explain.main.approx ? '≈' : '='}
        <strong>{explain.main.result}</strong>
      </p>
    {/if}
    {#if explain.parts.length > 0}
      <div class="mt-2">
        <p class="text-muted">Rincian:</p>
        {#each explain.parts as part}
          <p class="mt-1 tabular"><span class="text-muted">{part.label}:</span> {part.expr} {part.approx ? '≈' : '='} {part.result}</p>
        {/each}
      </div>
    {/if}
    {#if explain.versus}
      <div class="mt-2">
        <p class="text-muted">Dibanding kondisi sekarang:</p>
        <p class="mt-1 tabular"><span class="text-muted">{explain.versus.label}:</span> {explain.versus.expr} {explain.versus.approx ? '≈' : '='} {explain.versus.result}</p>
      </div>
    {/if}
    {#if explain.notes.length > 0}
      <div class="mt-2">
        {#each explain.notes as note}
          <p class="text-muted">{note}</p>
        {/each}
      </div>
    {/if}
  </div>
{/if}
