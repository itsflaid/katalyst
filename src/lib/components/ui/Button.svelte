<script lang="ts">
  import { cn } from '$lib/utils';

  export let variant: 'primary' | 'secondary' | 'danger' = 'primary';
  let className = '';
  export { className as class };
</script>

<button
  class={cn(
    'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
    variant === 'primary' && 'bg-neutral-900 text-white hover:bg-neutral-800',
    variant === 'secondary' && 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200',
    variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
    className
  )}
  on:click
  {...$$restProps}
>
  <slot />
</button>
