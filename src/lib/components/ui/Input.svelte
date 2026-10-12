<script context="module" lang="ts">
  // Fokus memakai ring tegas, bukan glow ambient.
  export const inputClass =
    'flex h-9 w-full rounded border border-border-input bg-white px-3 py-1 text-body-md text-ink placeholder:text-placeholder focus:outline-none focus:border-ink-navy focus:ring-2 focus:ring-ink-navy/15';
</script>

<script lang="ts">
  import { cn } from '$lib/shared/utils';

  export let value: string = '';
  export let id: string | undefined = undefined;
  let className = '';
  export { className as class };
</script>

<input
  {id}
  bind:value
  class={cn(inputClass, className)}
  on:input
  on:change
  {...$$restProps}
/>
