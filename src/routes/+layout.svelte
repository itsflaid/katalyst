<script lang="ts">
  import '../app.css';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import { fly, fade } from 'svelte/transition';
  import { Menu } from 'lucide-svelte';
  import type { BusinessInsight } from '$lib/analytics';
  import type { BellRestock } from '$lib/components/dashboard/insight-meta';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import InsightBell from '$lib/components/dashboard/InsightBell.svelte';
  import InsightModal from '$lib/components/dashboard/InsightModal.svelte';
  export let data;

  // Lonceng tampil bila ada insights: layout mengisinya untuk owner di semua halaman.
  $: insights = $page.data.insights as BusinessInsight[] | undefined;
  $: restock = $page.data.restock as BellRestock | undefined;
  // Badge menghitung insight + produk kritis.
  $: bellCount = (insights?.length ?? 0) + (restock?.list.length ?? 0);
  let insightsOpen = false;

  // <main> adalah scroll container (bukan document); layout tidak dihancurkan saat navigasi client-side.
  // scrollTop halaman A kebawa ke halaman B, reset manual tiap pathname berubah.
  let mainEl: HTMLElement | null = null;

  // Drawer mobile: sidebar disembunyikan di <lg, dibuka via hamburger.
  let sidebarOpen = false;
  afterNavigate(({ from, to }) => {
    if (from?.url.pathname !== to?.url.pathname) mainEl?.scrollTo(0, 0);
    sidebarOpen = false;
    insightsOpen = false;
  });
</script>

{#if data.user}
  <div class="app-shell">
    <!-- Desktop: sidebar statis -->
    <div class="hidden lg:contents">
      <Sidebar role={data.user.role} businessName={data.businessName ?? 'Bisnis Kamu'} />
    </div>
    <div class="content-col">
      <!-- Mobile: topbar + hamburger -->
      <header class="mobile-bar">
        <button
          type="button"
          class="hamburger"
          aria-label="Buka navigasi"
          on:click={() => (sidebarOpen = true)}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <span class="mobile-brand">Katalyst</span>
        {#if insights}
          <InsightBell class="ml-auto" count={bellCount} on:click={() => (insightsOpen = true)} />
        {/if}
      </header>
      <main bind:this={mainEl}>
        <slot />
      </main>
    </div>
  </div>

  {#if insights}
    <div class="float-bell">
      <InsightBell variant="float" count={bellCount} on:click={() => (insightsOpen = true)} />
    </div>
  {/if}

  {#if insightsOpen && insights}
    <InsightModal {insights} {restock} onClose={() => (insightsOpen = false)} />
  {/if}

  <!-- Mobile: drawer geser dari kiri -->
  {#if sidebarOpen}
    <div class="drawer-root">
      <button
        type="button"
        class="drawer-overlay"
        transition:fade={{ duration: 150 }}
        aria-label="Tutup navigasi"
        on:click={() => (sidebarOpen = false)}
      ></button>
      <div class="drawer-panel" transition:fly={{ x: -48, duration: 200 }}>
        <Sidebar role={data.user.role} businessName={data.businessName ?? 'Bisnis Kamu'} />
      </div>
    </div>
  {/if}
{:else}
  <slot />
{/if}

<style>
  /*
    .app-shell di-pin 100vh + overflow hidden: tanpa batas tinggi, scroll
    container jadi dokumen dan Sidebar ikut kegeser. Hanya <main> yang scroll.
  */
  .app-shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }
  .content-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    --mobile-bar-h: 3.75rem;
  }
  main {
    flex: 1;
    padding: 1rem;
    height: 100%;
    overflow-y: auto;
  }
  @media (min-width: 1024px) {
    main {
      padding: 2rem;
    }
  }
  .mobile-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: var(--mobile-bar-h);
    padding: 0.75rem 1rem;
    background: #172554;
    color: #fff;
    flex-shrink: 0;
  }
  @media (min-width: 1024px) {
    .mobile-bar {
      display: none;
    }
  }
  .float-bell {
    display: none;
  }
  @media (min-width: 1024px) {
    .float-bell {
      display: block;
      position: fixed;
      top: 1rem;
      right: 1.5rem;
      z-index: 30;
    }
  }
  .hamburger {
    display: grid;
    place-items: center;
    height: 2.25rem;
    width: 2.25rem;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: transparent;
    color: #fff;
    cursor: pointer;
  }
  .hamburger:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .mobile-brand {
    font-weight: 700;
    font-size: 16px;
    letter-spacing: -0.01em;
  }
  .drawer-root {
    position: fixed;
    inset: 0;
    z-index: 50;
  }
  @media (min-width: 1024px) {
    .drawer-root {
      display: none;
    }
  }
  .drawer-overlay {
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.5);
    border: none;
    padding: 0;
    cursor: default;
  }
  .drawer-panel {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    /* Lebar ngikutin isi Sidebar (w-60 expanded / 64px rail collapsed) */
    box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.3);
  }
</style>
