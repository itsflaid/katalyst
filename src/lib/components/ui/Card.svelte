<script lang="ts">
  import { cn } from '$lib/utils';
  let className = '';
  export { className as class };
</script>

<div class={cn('rounded-xl border border-neutral-200 bg-white p-4 shadow-sm', className)}>
  <slot />
</div>
