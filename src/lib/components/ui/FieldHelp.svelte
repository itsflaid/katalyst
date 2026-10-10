<script lang="ts">
  import { CircleHelp, Info } from 'lucide-svelte';

  export let id: string;
  export let label: string;
  export let about: string;
  export let example: string | null = null;
  export let tip: string | null = null;

  let open = false;

  function handleKeydown(event: KeyboardEvent) {
    if (open && event.key === 'Escape') open = false;
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Akar `contents`: tombol dan panel ikut menjadi anak baris heading (flex-wrap) induknya, panel turun ke baris sendiri. -->
<span class="contents">
  <button
    type="button"
    class="-m-1 inline-flex rounded-full p-1 text-muted transition-colors hover:text-ink-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-navy/15"
    aria-label={`Bantuan: ${label}`}
    aria-expanded={open}
    aria-controls={id}
    on:click={() => (open = !open)}
  >
    <CircleHelp class="h-4 w-4" />
  </button>
  {#if open}
    <div {id} role="note" class="flex w-full basis-full items-start gap-2 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2.5 text-body-sm text-ink">
      <Info size={18} class="mt-0.5 shrink-0 text-[#0284C7]" />
      <div class="flex min-w-0 flex-col gap-1">
        <p>{about}</p>
        {#if example}
          <p><strong>Contoh:</strong> {example}</p>
        {/if}
        {#if tip}
          <p><strong>Tips:</strong> {tip}</p>
        {/if}
      </div>
    </div>
  {/if}
</span>
