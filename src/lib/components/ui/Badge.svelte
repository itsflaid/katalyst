<script lang="ts">
  import { cn } from '$lib/utils';

  export let tone: 'neutral' | 'success' | 'warning' | 'danger' = 'neutral';
  let className = '';
  export { className as class };
</script>

<span
  class={cn(
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
    tone === 'neutral' && 'bg-neutral-100 text-neutral-800',
    tone === 'success' && 'bg-green-100 text-green-800',
    tone === 'warning' && 'bg-amber-100 text-amber-800',
    tone === 'danger' && 'bg-red-100 text-red-800',
    className
  )}
>
  <slot />
</span>
