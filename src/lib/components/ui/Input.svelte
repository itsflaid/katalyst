<script lang="ts">
  import { cn } from '$lib/utils';

  export let value: string = '';
  export let id: string | undefined = undefined;
  let className = '';
  export { className as class };
</script>

<input
  {id}
  bind:value
  class={cn(
    'flex h-9 w-full rounded border border-border-input bg-white px-3 py-1 text-body-md text-ink placeholder:text-placeholder',
    'focus:outline-none focus:border-ink-navy focus:ring-2 focus:ring-ink-navy/15', // crisp ring, bukan ambient glow
    className
  )}
  on:input
  on:change
  {...$$restProps}
/>
