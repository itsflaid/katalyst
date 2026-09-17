<script lang="ts">
  import { cn } from '$lib/utils';

  // Nama tone mengikuti 4 status semantik tema — bukan
  // "success/warning/danger" generik Tailwind, biar konsisten sama
  // bahasa yang dipakai di lib/analytics.ts (insight type, dsb).
  export let tone: 'positive' | 'warning' | 'negative' | 'neutral' = 'neutral';
  let className = '';
  export { className as class };
</script>

<span
  class={cn(
    'inline-flex items-center rounded px-2 py-0.5 text-label-md border',
    tone === 'positive' && 'bg-status-positive-bg text-status-positive border-status-positive-border',
    tone === 'warning' && 'bg-status-warning-bg text-status-warning border-status-warning-border',
    tone === 'negative' && 'bg-status-negative-bg text-status-negative border-status-negative-border',
    tone === 'neutral' && 'bg-status-neutral-bg text-status-neutral border-status-neutral-border',
    className
  )}
>
  <slot />
</span>
