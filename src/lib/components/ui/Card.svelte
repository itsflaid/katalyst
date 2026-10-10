<script lang="ts">
  import { cn } from '$lib/shared/utils';
  let className = '';
  export { className as class };
</script>

<!-- Shadow samakan StatCard: white di atas canvas krem, border warm,
     shadow tegas — BUKAN shadow abu-abu generik SaaS-card yang di-flag
     frontend-design skill sebagai default yang harus dihindari. -->
<div class={cn('rounded-panel border border-border-warm bg-surface p-5 shadow-stat-card', className)}>
  <slot />
</div>
