<script lang="ts">
  import { page } from '$app/stores';
  import { signOut } from '$lib/auth-client';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';

  import {
    LayoutDashboard,
    TrendingUp,
    FlaskConical,
    Package,
    Receipt,
    Settings,
    CircleHelp,
    LogOut,
    ChevronLeft,
    ChevronDown
  } from 'lucide-svelte';

  export let role: 'OWNER' | 'STAFF';
  export let businessName: string;

  // Flat list + field `group` — dipisah jadi kelompok visual (Analisis /
  // Operasional / Lainnya) alih-alih list rata kayak sebelumnya.
  const links = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, ownerOnly: true, group: 'Analisis' },
    { href: '/statistik', label: 'Statistik', icon: TrendingUp, ownerOnly: true, group: 'Analisis' },
    { href: '/simulator', label: 'Simulator', icon: FlaskConical, ownerOnly: true, group: 'Analisis' },
    { href: '/products', label: 'Produk', icon: Package, ownerOnly: false, group: 'Operasional' },
    { href: '/transactions', label: 'Transaksi', icon: Receipt, ownerOnly: false, group: 'Operasional' },
    { href: '/settings', label: 'Pengaturan', icon: Settings, ownerOnly: true, group: 'Lainnya' },
    { href: '/bantuan', label: 'Bantuan', icon: CircleHelp, ownerOnly: false, group: 'Lainnya' }
  ];

  $: visibleLinks = links.filter((l) => !l.ownerOnly || role === 'OWNER');
  $: groupedLinks = ['Analisis', 'Operasional', 'Lainnya']
    .map((label) => ({ label, links: visibleLinks.filter((l) => l.group === label) }))
    .filter((g) => g.links.length > 0);

  $: initials =
    businessName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?';

  // Mode ringkas (icon-only rail) — preferensi disimpan di localStorage
  // biar gak balik ke expanded tiap navigasi/refresh.
  let collapsed = false;

  // Grup collapsible (dropdown) — preferensi disimpan di localStorage
  // sebagai daftar nama grup yang dilipat.
  let collapsedGroups: string[] = [];
  onMount(() => {
    collapsed = localStorage.getItem('katalyst-sidebar-collapsed') === '1';
    try {
      const raw = localStorage.getItem('katalyst-sidebar-groups-collapsed');
      if (raw) collapsedGroups = JSON.parse(raw);
    } catch {
      collapsedGroups = [];
    }
  });
  function toggleGroup(label: string) {
    collapsedGroups = collapsedGroups.includes(label)
      ? collapsedGroups.filter((g) => g !== label)
      : [...collapsedGroups, label];
    localStorage.setItem('katalyst-sidebar-groups-collapsed', JSON.stringify(collapsedGroups));
  }
  function toggleCollapsed() {
    collapsed = !collapsed;
    localStorage.setItem('katalyst-sidebar-collapsed', collapsed ? '1' : '0');
  }

  async function handleLogout() {
    try {
      await signOut();
    } finally {
      // finally: walau request sign-out gagal (mis. network), user tetap
      // dikeluarkan dari app shell ke /login — kalau sesi ternyata masih
      // hidup, hooks proteksi route akan menolak akses halaman lama.
      // await: pastikan pindah ke /login sebelum handler kelar.
      await goto('/login', { invalidateAll: true });
    }
  }
</script>

<aside
  class="scroll-navy flex flex-col h-full flex-shrink-0 border-r border-white/10 bg-ink-navy p-3 box-border overflow-y-auto overflow-x-hidden transition-[width] duration-150 {collapsed
    ? 'w-[64px] items-center'
    : 'w-60'}"
>
  <div class="flex items-center gap-2.5 mb-6 px-1 w-full {collapsed ? 'justify-center' : ''}">
    <img src="/logo/logo-sidebar.png" alt="Logo Katalyst" class="h-7 w-7 flex-shrink-0 rounded object-cover" />
    {#if !collapsed}
      <div class="min-w-0">
        <strong class="block text-headline-sm text-white truncate">Katalyst</strong>
        <span class="block text-body-sm text-white/50 truncate">{businessName}</span>
      </div>
    {/if}
  </div>

  <nav class="flex flex-col flex-1 w-full gap-3">
    {#each groupedLinks as group}
      {@const folded = !collapsed && collapsedGroups.includes(group.label)}
      <div>
        {#if !collapsed}
          <button
            type="button"
            on:click={() => toggleGroup(group.label)}
            aria-expanded={!folded}
            class="flex w-full items-center justify-between rounded px-2 py-1 text-label-sm uppercase text-white/35 hover:text-white bg-transparent border-none cursor-pointer"
          >
            <span>{group.label}</span>
            <ChevronDown size={12} class="transition-transform {folded ? '-rotate-90' : ''}" aria-hidden="true" />
          </button>
        {/if}
        {#if !folded}
        <div class="flex flex-col gap-0.5" transition:slide={{ duration: 200 }}>
          {#each group.links as link}
            {@const active = $page.url.pathname.startsWith(link.href)}
            
            <a  href={link.href}
              title={link.label}
              class="flex items-center gap-2.5 rounded px-2.5 py-2 text-body-md no-underline transition-colors border {collapsed
                ? 'justify-center'
                : ''} {active
                ? 'bg-white/[0.08] border-white/10 text-white font-semibold'
                : 'border-transparent text-white/65 hover:bg-white/5 hover:text-white'}"
            >
              <svelte:component this={link.icon} size={16} class="flex-shrink-0" aria-hidden="true" />
              {#if !collapsed}{link.label}{/if}
            </a>
          {/each}
        </div>
        {/if}
      </div>
    {/each}

    
    {#if role === 'OWNER'}
    <a href="/copilot"
      title="Copilot AI"
      class="group relative mt-1 block overflow-hidden rounded-panel bg-status-positive px-3 py-2 no-underline shadow-level1 transition-all hover:-translate-y-px hover:shadow-level2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-positive-border {collapsed
        ? 'flex justify-center'
        : ''}"
    >
      <span aria-hidden="true" class="pointer-events-none absolute inset-0">
        <span class="copilot-sheen absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent"></span>
      </span>
      {#if collapsed}
        <img src="/logo/logo-copilot.png" alt="Copilot AI" class="relative h-7 w-7 rounded object-cover" />
      {:else}
        <div class="relative flex items-center gap-2.5">
          <img src="/logo/logo-copilot.png" alt="Copilot AI" class="h-8 w-8 flex-shrink-0 rounded object-cover" />
          <span class="min-w-0 flex-1">
            <span class="text-body-md font-semibold text-white">Copilot AI</span>
            <span class="block truncate text-body-sm text-white/75">Tanya soal bisnismu</span>
          </span>
        </div>
        {/if}
      </a>
    {/if}
  </nav>

  <button
    on:click={toggleCollapsed}
    title={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
    class="flex items-center justify-center gap-1.5 mt-2 mb-1 w-full rounded border border-white/10 py-1.5 text-white/50 hover:text-white hover:bg-white/5 bg-transparent cursor-pointer"
  >
    <ChevronLeft size={14} class="transition-transform {collapsed ? 'rotate-180' : ''}" aria-hidden="true" />
  </button>

  <div class="flex items-center gap-2 pt-3 border-t border-white/10 w-full {collapsed ? 'flex-col' : ''}">
    <div class="grid h-7 w-7 flex-shrink-0 place-items-center rounded bg-white/10 border border-white/15 text-white text-label-sm font-bold">{initials}</div>
    {#if !collapsed}
      <div class="min-w-0 flex-1">
        <p class="text-body-sm text-white truncate font-semibold leading-5">{businessName}</p>
        <p class="truncate text-[10px] uppercase tracking-[0.08em] text-white/40 leading-4">{role}</p>
      </div>
    {/if}
    <button on:click={handleLogout} title="Keluar" class="grid h-7 w-7 flex-shrink-0 place-items-center rounded border-none bg-transparent text-status-negative hover:bg-white/5 cursor-pointer">
      <LogOut size={14} aria-hidden="true" />
    </button>
  </div>
</aside>