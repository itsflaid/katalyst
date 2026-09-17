<script lang="ts">
  import { cn } from '$lib/utils';
  let className = '';
  export { className as class };
</script>

<!-- Level 1 elevation persis spec: white di atas canvas krem, border warm,
     shadow tipis — BUKAN shadow abu-abu generik SaaS-card yang di-flag
     frontend-design skill sebagai default yang harus dihindari. -->
<div class={cn('rounded-panel border border-border-warm bg-surface p-5 shadow-level1', className)}>
  <slot />
</div>
