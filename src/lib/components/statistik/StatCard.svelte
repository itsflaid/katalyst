<script lang="ts">
  import { cn } from '$lib/shared/utils';
  export let tone: 'light' | 'navy' = 'light';
  let className = '';
  export { className as class };
</script>

<div class={cn('rounded-[5px] border border-border-stat shadow-stat-card p-5', tone === 'navy' ? 'bg-ink-navy text-white' : 'bg-surface', className)}>
  <slot />
</div>
