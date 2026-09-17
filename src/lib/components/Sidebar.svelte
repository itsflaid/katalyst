<script lang="ts">
  import { page } from '$app/stores';
  import { signOut } from '$lib/auth-client';
  import { goto } from '$app/navigation';

  export let role: 'OWNER' | 'STAFF';
  export let businessName: string;

  // Icon inline gaya Lucide (stroke currentColor, 24x24) — path disalin
  // dari lucide-svelte. Dibikin inline karena rilis lucide-svelte@1.0.1
  // cacat (barrel dist/lucide-svelte.js me-refer ./icons/index yang tidak
  // ada di paket) sehingga `import ... from 'lucide-svelte'` crash saat dev.
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
  const iconSparkles: IconNode[] = [
    ['path', { d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z' }],
    ['path', { d: 'M20 2v4' }],
    ['path', { d: 'M22 4h-4' }],
    ['circle', { cx: 4, cy: 20, r: 2 }]
  ];
  const iconLogOut: IconNode[] = [
    ['path', { d: 'm16 17 5-5-5-5' }],
    ['path', { d: 'M21 12H9' }],
    ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }]
  ];
  const iconArrowRight: IconNode[] = [
    ['path', { d: 'M5 12h14' }],
    ['path', { d: 'm12 5 7 7-7 7' }]
  ];

  // Urutan sesuai request: Dashboard - Produk - Transaksi - Simulator - Pengaturan.
  const links = [
    { href: '/dashboard', label: 'Dashboard', icon: iconDashboard, ownerOnly: true },
    { href: '/products', label: 'Produk', icon: iconPackage, ownerOnly: false },
    { href: '/transactions', label: 'Transaksi', icon: iconReceipt, ownerOnly: false },
    { href: '/simulator', label: 'Simulator', icon: iconFlask, ownerOnly: true },
    { href: '/settings', label: 'Pengaturan', icon: iconSettings, ownerOnly: true }
  ];

  $: visibleLinks = links.filter((l) => !l.ownerOnly || role === 'OWNER');

  async function handleLogout() {
    await signOut();
    // invalidateAll: paksa load function layout (+layout.server.ts) jalan
    // ulang — tanpa ini data.user masih kebawa (hasil load waktu masih
    // logged-in) dan Sidebar gak hilang sampai user refresh manual.
    goto('/login', { invalidateAll: true });
  }
</script>

<!--
  h-full (bukan h-screen) + flex-shrink-0: tinggi sidebar ngikutin tinggi
  .app-shell (yang di-pin 100vh di +layout.svelte), bukan viewport
  langsung — biar gak ikut ke-scroll pas konten <main> lebih tinggi dari
  layar. overflow-y-auto jaga-jaga kalau suatu saat nav item-nya nambah
  banyak dan gak muat di layar pendek.
-->
<aside class="flex flex-col w-60 h-full flex-shrink-0 border-r border-white/10 bg-ink-navy p-4 box-border overflow-y-auto">
  <div class="flex flex-col mb-8 px-2">
    <strong class="text-headline-sm text-white">Katalyst</strong>
    <span class="text-body-sm text-white/50">{businessName}</span>
  </div>
  <nav class="flex flex-col gap-1 flex-1">
    {#each visibleLinks as link}
      {@const active = $page.url.pathname.startsWith(link.href)}
      <a
        href={link.href}
        class="flex items-center gap-2.5 rounded-r px-3 py-2 text-body-md no-underline transition-colors border-l-[3px] {active
          ? 'bg-white/10 text-white font-semibold border-status-positive'
          : 'text-white/70 border-transparent hover:bg-white/5 hover:text-white'}"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0" aria-hidden="true">
          {#each link.icon as [tag, attrs]}
            <svelte:element this={tag} {...attrs} />
          {/each}
        </svg>
        {link.label}
      </a>
    {/each}

    <a
      href="/copilot"
      class="group relative mt-3 block overflow-hidden rounded-panel bg-status-positive p-3 no-underline shadow-level1 transition-all hover:-translate-y-px hover:shadow-level2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-positive-border"
    >
      <span aria-hidden="true" class="pointer-events-none absolute inset-0">
        <span class="copilot-sheen absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent"></span>
      </span>
      <div class="relative flex items-center gap-2.5">
        <span class="grid h-8 w-8 flex-shrink-0 place-items-center rounded bg-white/20 text-white">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            {#each iconSparkles as [tag, attrs]}
              <svelte:element this={tag} {...attrs} />
            {/each}
          </svg>
        </span>
        <span class="min-w-0 flex-1">
          <span class="text-body-md font-semibold text-white">
            Copilot AI
          </span>
          <span class="block truncate text-body-sm text-white/75">Tanya soal bisnismu</span>
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0 text-white/70 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
          {#each iconArrowRight as [tag, attrs]}
            <svelte:element this={tag} {...attrs} />
          {/each}
        </svg>
      </div>
    </a>
  </nav>
  <div class="flex items-center justify-between pt-4 border-t border-white/10">
    <span class="text-label-sm uppercase px-2 py-1 rounded bg-white/10 text-white/80 border border-white/10">{role}</span>
    <button on:click={handleLogout} class="flex items-center gap-1.5 border-none bg-transparent text-status-negative text-body-sm cursor-pointer hover:text-red-400">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0" aria-hidden="true">
        {#each iconLogOut as [tag, attrs]}
          <svelte:element this={tag} {...attrs} />
        {/each}
      </svg>
      Keluar
    </button>
  </div>
</aside>
