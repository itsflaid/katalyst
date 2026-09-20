<script lang="ts">
  import { cn } from '$lib/shared/utils';

  export let variant: 'primary' | 'secondary' | 'destructive' = 'primary';
  export let size: 'default' | 'compact' = 'default';
  let className = '';
  export { className as class };
</script>

<!--
  Sengaja gak ada rounded-full sama sekali di seluruh komponen ini —
  harus solid structural corner (radius 4px) buat kesan institusional.
-->
<button
  class={cn(
    'inline-flex items-center justify-center font-label-lg text-label-lg transition-colors border disabled:opacity-50 disabled:pointer-events-none',
    'rounded', // 4px, token DEFAULT
    size === 'default' && 'h-9 px-4', // 36px
    size === 'compact' && 'h-[30px] px-3', // 30px
    variant === 'primary' && 'bg-ink-navy border-ink-navy text-white hover:bg-ink',
    variant === 'secondary' && 'bg-white border-border-input text-ink hover:bg-table-header',
    variant === 'destructive' && 'bg-status-negative border-status-negative text-white hover:bg-red-700',
    className
  )}
  on:click
  {...$$restProps}
>
  <slot />
</button>
