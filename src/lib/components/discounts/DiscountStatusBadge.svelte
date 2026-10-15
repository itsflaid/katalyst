<script lang="ts">
  import Badge from '$lib/components/ui/Badge.svelte';
  export let status: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'SOLD_OUT' | 'INACTIVE';

  // Label dan tone per status.
  const meta: Record<typeof status, { label: string; tone: 'positive' | 'warning' | 'neutral' | 'negative' }> = {
    ACTIVE: { label: 'Aktif', tone: 'positive' },
    SCHEDULED: { label: 'Terjadwal', tone: 'neutral' },
    EXPIRED: { label: 'Berakhir', tone: 'neutral' },
    SOLD_OUT: { label: 'Kuota habis', tone: 'warning' },
    INACTIVE: { label: 'Nonaktif', tone: 'negative' }
  };
  $: m = meta[status];
</script>

<Badge size="sm" tone={m.tone}>{m.label}</Badge>
