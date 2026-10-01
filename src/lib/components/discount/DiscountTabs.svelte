<script lang="ts">
  export let tab: 'aktif' | 'terjadwal' | 'selesai';
  export let counts: { aktif: number; terjadwal: number; selesai: number };

  const tabs = [
    { key: 'aktif', label: 'Aktif' },
    { key: 'terjadwal', label: 'Terjadwal' },
    { key: 'selesai', label: 'Selesai' }
  ] as const;
</script>

<div class="flex gap-1 border-b border-border-cool mb-4" role="tablist" aria-label="Tab diskon">
  {#each tabs as t}
    <a
      href={`/diskon?tab=${t.key}`}
      role="tab"
      aria-selected={tab === t.key}
      class="px-4 h-10 inline-flex items-center gap-2 text-body-md no-underline border-b-2 -mb-px {tab === t.key
        ? 'border-ink-navy text-ink font-semibold'
        : 'border-transparent text-muted hover:text-ink'}"
    >{t.label} <span class="tabular text-body-sm text-muted">{counts[t.key]}</span></a>
  {/each}
</div>
