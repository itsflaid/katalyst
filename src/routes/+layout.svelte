<script lang="ts">
  import '../app.css';
  import Sidebar from '$lib/components/Sidebar.svelte';
  export let data;
</script>

{#if data.user}
  <div class="app-shell">
    <Sidebar role={data.user.role} businessName={data.businessName ?? 'Bisnis Kamu'} />
    <main>
      <slot />
    </main>
  </div>
{:else}
  <slot />
{/if}

<style>
  /*
    Sebelumnya .app-shell gak punya batas tinggi, jadi begitu konten
    <main> lebih tinggi dari layar, yang jadi scroll container adalah
    dokumen itu sendiri — otomatis Sidebar (sibling flex biasa) ikut
    kegeser ke atas juga. Fix: pin .app-shell di 100vh + overflow hidden,
    lalu biarin cuma <main> yang scroll sendiri. Sidebar jadi diam total.
  */
  .app-shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }
  main {
    flex: 1;
    padding: 2rem;
    height: 100%;
    overflow-y: auto;
  }
</style>
