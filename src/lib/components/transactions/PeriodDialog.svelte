<script lang="ts">
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  export let initialFrom: string;
  export let initialTo: string;
  export let onApply: (from: string, to: string) => void;
  export let onReset: () => void;
  export let onClose: () => void;

  let draftFrom = initialFrom;
  let draftTo = initialTo;

  function apply() {
    if (!draftFrom && !draftTo) return onReset();
    // Format ISO bisa dibandingkan sebagai string; urutan dibalik bila terbalik.
    const swap = draftFrom && draftTo && draftFrom > draftTo;
    onApply(swap ? draftTo : draftFrom, swap ? draftFrom : draftTo);
  }
</script>

<ConfirmDialog title="Atur Periode" {onClose}>
  <div class="flex flex-col gap-3">
    <label class="flex flex-col gap-1 text-body-md text-ink">
      Dari
      <input type="date" bind:value={draftFrom} class="h-9 w-full min-w-0 rounded border border-border-input bg-white px-2 text-body-md text-ink" />
    </label>
    <label class="flex flex-col gap-1 text-body-md text-ink">
      Sampai
      <input type="date" bind:value={draftTo} class="h-9 w-full min-w-0 rounded border border-border-input bg-white px-2 text-body-md text-ink" />
    </label>
  </div>
  <svelte:fragment slot="actions">
    <Button variant="secondary" class="flex-1" on:click={onReset}>Reset</Button>
    <Button class="flex-1" on:click={apply}>Terapkan</Button>
  </svelte:fragment>
</ConfirmDialog>
