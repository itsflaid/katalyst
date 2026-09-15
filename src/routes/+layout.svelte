<script lang="ts">
  import Sidebar from '$lib/components/Sidebar.svelte';
  export let data;
</script>

{#if data.user}
  <div class="app-shell">
    <Sidebar role={data.user.role} businessName={data.user.businessName ?? 'Bisnis Kamu'} />
    <main>
      <slot />
    </main>
  </div>
{:else}
  <slot />
{/if}

<style>
  .app-shell { display: flex; }
  main { flex: 1; padding: 2rem; }
</style>
