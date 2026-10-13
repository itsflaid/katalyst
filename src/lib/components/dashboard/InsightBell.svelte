<script lang="ts">
  import { Bell } from 'lucide-svelte';
  import { cn } from '$lib/shared/utils';

  export let count = 0;
  export let variant: 'bar' | 'float' = 'bar';
  let className = '';
  export { className as class };
</script>

<button
  type="button"
  on:click
  aria-label={count > 0 ? `Notifikasi, ${count} perlu perhatian` : 'Notifikasi'}
  class={cn(
    'relative grid cursor-pointer place-items-center rounded border-none bg-transparent transition-colors',
    variant === 'bar' && 'h-9 w-9 text-white hover:bg-white/10',
    variant === 'float' &&
      'h-10 w-10 rounded-full bg-status-positive text-white shadow-level2 hover:bg-white hover:text-status-positive',
    className
  )}
>
  <Bell size={variant === 'float' ? 20 : 18} aria-hidden="true" />
  {#if count > 0}
    <span
      class="absolute -right-1 -top-1 grid h-4 min-w-[1rem] place-items-center rounded-full bg-status-negative px-1 text-[10px] font-bold leading-none text-white"
    >
      {count}
    </span>
  {/if}
</button>
