<script lang="ts">
  import { Calendar, CalendarDays, ChevronDown } from 'lucide-svelte';
  import type { PeriodKey } from '$lib/shared/period';
  export let activeRange: string;
  export let rangeLabel: string;
  export let fromInput: string;
  export let toInput: string;
  export let onSelect: (key: PeriodKey) => void;
  export let onApply: () => void;
  export let desktopOnly = true;
  export let ranges: { value: string; label: string }[] = [
    { value: 'today', label: 'Hari ini' },
    { value: 'week', label: 'Minggu ini' },
    { value: '30d', label: '30 hari' },
    { value: 'month', label: 'Bulan ini' }
  ];

  function pick(e: Event) {
    onSelect((e.currentTarget as HTMLSelectElement).value as PeriodKey);
  }
</script>

<div class={desktopOnly ? 'hidden sm:flex items-stretch gap-0 divide-x divide-border-stat' : 'flex flex-col sm:flex-row items-stretch gap-0 divide-y sm:divide-y-0 sm:divide-x divide-border-stat'}>
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
        min={fromInput || undefined}
        class="h-9 w-full sm:w-auto rounded-[9px] border border-border-stat bg-surface px-3 pr-9 text-body-md text-ink [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
        aria-label="Sampai tanggal"
      />
      <Calendar size={16} class="pointer-events-none absolute right-2.5 text-muted" />
    </span>
  </div>
  <div class="flex items-center px-4 py-3">
    <button
      type="button"
      on:click={onApply}
      class="h-[46px] w-full sm:w-auto rounded-[9px] border border-border-stat bg-ink-navy px-5 text-body-md font-semibold text-white"
    >
      Terapkan
    </button>
  </div>
  {#if rangeLabel}
    <div class="flex min-w-0 ml-auto shrink-0 items-center gap-2 px-4 py-3">
      <CalendarDays size={20} class="shrink-0 text-muted" />
      <span class="shrink-0 text-body-sm text-muted">Ditampilkan:</span>
      <strong class="truncate text-body-md text-ink-navy max-w-[360px]" title={rangeLabel}>{rangeLabel}</strong>
    </div>
  {/if}
</div>
