<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import SlideOver from '$lib/components/ui/SlideOver.svelte';
  import { Calendar, CalendarDays, ChevronDown } from 'lucide-svelte';
  import type { PeriodKey } from '$lib/shared/period';
  export let activeRange: string;
  export let rangeLabel: string;
  export let fromInput: string;
  export let toInput: string;
  export let onSelect: (key: PeriodKey) => void;
  export let onApply: () => void;
  export let ranges: { value: string; label: string }[] = [
    { value: 'today', label: 'Hari ini' },
    { value: 'week', label: 'Minggu ini' },
    { value: '7d', label: '7 hari' },
    { value: '30d', label: '30 hari' },
    { value: 'month', label: 'Bulan ini' }
  ];

  let sheetOpen = false;
  let draftFrom = '';
  let draftTo = '';

  $: activeName = activeRange === 'custom' ? 'Custom' : (ranges.find((r) => r.value === activeRange)?.label ?? '');

  function openSheet() {
    draftFrom = fromInput;
    draftTo = toInput;
    sheetOpen = true;
  }
  function pickPreset(key: string) {
    sheetOpen = false;
    onSelect(key as PeriodKey);
  }
  function applyDraft() {
    if (!draftFrom && !draftTo) return;
    // Assignment ke prop bind terpropagasi sinkron ke induk sebelum onApply dibaca.
    fromInput = draftFrom;
    toInput = draftTo;
    sheetOpen = false;
    onApply();
  }
  const presetClass = (active: boolean) =>
    `w-full rounded border px-2.5 py-1.5 text-left text-body-sm ${active ? 'border-ink-navy bg-ink-navy font-semibold text-white' : 'border-border-input bg-white text-ink hover:bg-table-header'}`;

  function pick(e: Event) {
    onSelect((e.currentTarget as HTMLSelectElement).value as PeriodKey);
  }
  // Sinkron eksplisit sebelum apply: urutan listener bind vs on:change tak dijamin.
  function changedFrom(e: Event) {
    fromInput = (e.currentTarget as HTMLInputElement).value;
    onApply();
  }
  function changedTo(e: Event) {
    toInput = (e.currentTarget as HTMLInputElement).value;
    onApply();
  }
</script>

<div class="hidden sm:flex items-stretch gap-0 divide-x divide-border-stat">
  <div class="flex flex-col justify-center gap-1 px-4 py-3">
    <span class="text-body-sm text-muted">Periode</span>
    <span class="relative inline-flex">
      <select
        value={activeRange}
        on:change={pick}
        class="h-9 w-full sm:w-auto appearance-none rounded-[9px] border border-border-stat bg-surface pl-3 pr-9 text-body-md text-ink"
        aria-label="Periode"
      >
        {#each ranges as r}
          <option value={r.value}>{r.label}</option>
        {/each}
        {#if activeRange === 'custom'}
          <option value="custom" selected>Custom</option>
        {/if}
      </select>
      <ChevronDown size={16} class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
    </span>
  </div>
  <div class="flex flex-col justify-center gap-1 px-4 py-3">
    <span class="text-body-sm text-muted">Tanggal Mulai</span>
    <span class="relative inline-flex items-center">
      <input
        type="date"
        bind:value={fromInput}
        on:change={changedFrom}
        class="h-9 w-full sm:w-auto rounded-[9px] border border-border-stat bg-surface px-3 pr-9 text-body-md text-ink [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
        aria-label="Dari tanggal"
      />
      <Calendar size={16} class="pointer-events-none absolute right-2.5 text-muted" />
    </span>
  </div>
  <div class="flex flex-col justify-center gap-1 px-4 py-3">
    <span class="text-body-sm text-muted">Tanggal Akhir</span>
    <span class="relative inline-flex items-center">
      <input
        type="date"
        bind:value={toInput}
        on:change={changedTo}
        min={fromInput || undefined}
        class="h-9 w-full sm:w-auto rounded-[9px] border border-border-stat bg-surface px-3 pr-9 text-body-md text-ink [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
        aria-label="Sampai tanggal"
      />
      <Calendar size={16} class="pointer-events-none absolute right-2.5 text-muted" />
    </span>
  </div>
  {#if rangeLabel}
    <div class="flex min-w-0 ml-auto shrink-0 items-center gap-2 px-4 py-3">
      <CalendarDays size={20} class="shrink-0 text-muted" />
      <span class="shrink-0 text-body-sm text-muted">Ditampilkan:</span>
      <strong class="truncate text-body-md text-ink-navy max-w-[360px]" title={rangeLabel}>{rangeLabel}</strong>
    </div>
  {/if}
</div>

<div class="flex flex-col gap-2 p-5 sm:hidden">
  <button
    type="button"
    on:click={openSheet}
    aria-haspopup="dialog"
    class="inline-flex h-9 items-center justify-between rounded border border-border-input bg-white px-3 text-body-md text-ink"
  >
    <span>Periode: <strong>{activeName}</strong></span>
    <span aria-hidden="true" class="text-muted">▾</span>
  </button>
  {#if rangeLabel}
    <span class="text-body-sm text-muted">Dipakai: <strong class="text-ink">{rangeLabel}</strong></span>
  {/if}
</div>

{#if sheetOpen}
  <SlideOver title="Pilih Periode" onClose={() => (sheetOpen = false)}>
    <div class="flex flex-col gap-2">
      {#each ranges as r}
        <button type="button" on:click={() => pickPreset(r.value)} class={presetClass(activeRange === r.value)}>{r.label}</button>
      {/each}
      <div class="flex flex-col gap-2 rounded border border-border-cool p-3">
        <label class="flex flex-col gap-1 text-body-md text-ink">
          Dari
          <input type="date" bind:value={draftFrom} class="h-9 w-full min-w-0 rounded border border-border-input bg-white px-2 text-body-sm text-ink" />
        </label>
        <label class="flex flex-col gap-1 text-body-md text-ink">
          Sampai
          <input
            type="date"
            bind:value={draftTo}
            min={draftFrom || undefined}
            class="h-9 w-full min-w-0 rounded border border-border-input bg-white px-2 text-body-sm text-ink"
          />
        </label>
        <Button class="w-full" disabled={!draftFrom && !draftTo} on:click={applyDraft}>Terapkan</Button>
      </div>
    </div>
  </SlideOver>
{/if}
