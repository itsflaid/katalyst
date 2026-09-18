<script lang="ts">
  import '../app.css';
  import { afterNavigate } from '$app/navigation';
  import Sidebar from '$lib/components/Sidebar.svelte';
  export let data;

  // <main> adalah scroll container (bukan document), dan elemen layout ini
  // TIDAK dihancurkan saat navigasi client-side — cuma <slot /> yang ganti.
  // Akibatnya scrollTop halaman A kebawa ke halaman B (SvelteKit cuma
  // me-reset document scroll). Fix: reset manual tiap pathname berubah.
  let mainEl: HTMLElement | null = null;
  afterNavigate(({ from, to }) => {
    if (from?.url.pathname !== to?.url.pathname) mainEl?.scrollTo(0, 0);
  });
</script>

{#if data.user}
  <div class="app-shell">
    <Sidebar role={data.user.role} businessName={data.businessName ?? 'Bisnis Kamu'} />
    <main bind:this={mainEl}>
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
