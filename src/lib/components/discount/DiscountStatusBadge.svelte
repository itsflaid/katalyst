<script lang="ts">
  import Badge from "$lib/components/ui/Badge.svelte";
  export let status: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'SOLD_OUT' | 'INACTIVE';

  // Label + tone per status turunan (lihat SPEC Fase 4.3).
  const meta: Record<typeof status, { label: string; tone: 'positive' | 'warning' | 'neutral' }> = {
    ACTIVE: { label: 'Aktif', tone: 'positive' },
    SCHEDULED: { label: 'Terjadwal', tone: 'neutral' },
    EXPIRED: { label: 'Berakhir', tone: 'neutral' },
    SOLD_OUT: { label: 'Kuota habis', tone: 'warning' },
    INACTIVE: { label: 'Nonaktif', tone: 'neutral' }
  };
  $: m = meta[status];
</script>

<Badge size="sm" tone={m.tone}>{m.label}</Badge>
