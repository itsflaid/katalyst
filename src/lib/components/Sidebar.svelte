<script lang="ts">
  import { page } from '$app/stores';
  import { signOut } from '$lib/auth-client';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  export let role: 'OWNER' | 'STAFF';
  export let businessName: string;

  type IconNode = [string, Record<string, string | number>];

  const iconDashboard: IconNode[] = [
    ['rect', { width: 7, height: 9, x: 3, y: 3, rx: 1 }],
    ['rect', { width: 7, height: 5, x: 14, y: 3, rx: 1 }],
    ['rect', { width: 7, height: 9, x: 14, y: 12, rx: 1 }],
    ['rect', { width: 7, height: 5, x: 3, y: 16, rx: 1 }]
  ];
  const iconPackage: IconNode[] = [
    ['path', { d: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z' }],
    ['path', { d: 'M12 22V12' }],
    ['polyline', { points: '3.29 7 12 12 20.71 7' }],
    ['path', { d: 'm7.5 4.27 9 5.15' }]
  ];
  const iconReceipt: IconNode[] = [
    ['path', { d: 'M12 17V7' }],
    ['path', { d: 'M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8' }],
    ['path', { d: 'M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z' }]
  ];
  const iconFlask: IconNode[] = [
    ['path', { d: 'M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2' }],
    ['path', { d: 'M6.453 15h11.094' }],
    ['path', { d: 'M8.5 2h7' }]
  ];
  const iconSettings: IconNode[] = [
    ['path', { d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915' }],
    ['circle', { cx: 12, cy: 12, r: 3 }]
  ];
  const iconLogOut: IconNode[] = [
    ['path', { d: 'm16 17 5-5-5-5' }],
    ['path', { d: 'M21 12H9' }],
    ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }]
  ];
  const iconChevron: IconNode[] = [['path', { d: 'm15 18-6-6 6-6' }]];

  // Flat list + field `group` — dipisah jadi kelompok visual (Analisis /
  // Operasional / Lainnya) alih-alih list rata kayak sebelumnya.
  const links = [
    { href: '/dashboard', label: 'Dashboard', icon: iconDashboard, ownerOnly: true, group: 'Analisis' },
    { href: '/simulator', label: 'Simulator', icon: iconFlask, ownerOnly: true, group: 'Analisis' },
    { href: '/products', label: 'Produk', icon: iconPackage, ownerOnly: false, group: 'Operasional' },
    { href: '/transactions', label: 'Transaksi', icon: iconReceipt, ownerOnly: false, group: 'Operasional' },
    { href: '/settings', label: 'Pengaturan', icon: iconSettings, ownerOnly: true, group: 'Lainnya' }
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
  onMount(() => {
    collapsed = localStorage.getItem('katalyst-sidebar-collapsed') === '1';
  });
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
      <div>
        {#if !collapsed}
          <p class="text-label-sm uppercase text-white/35 px-2 mb-1">{group.label}</p>
        {/if}
        <div class="flex flex-col gap-0.5">
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
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0" aria-hidden="true">
                {#each link.icon as [tag, attrs]}
                  <svelte:element this={tag} {...attrs} />
                {/each}
              </svg>
              {#if !collapsed}{link.label}{/if}
            </a>
          {/each}
        </div>
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
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="transition-transform {collapsed ? 'rotate-180' : ''}" aria-hidden="true">
      {#each iconChevron as [tag, attrs]}<svelte:element this={tag} {...attrs} />{/each}
    </svg>
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
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        {#each iconLogOut as [tag, attrs]}<svelte:element this={tag} {...attrs} />{/each}
      </svg>
    </button>
  </div>
</aside>