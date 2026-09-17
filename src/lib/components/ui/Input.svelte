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
    'flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900',
    className
  )}
  on:input
  on:change
  {...$$restProps}
/>
