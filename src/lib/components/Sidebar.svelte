<script lang="ts">
  import { page } from '$app/stores';
  import { signOut } from '$lib/auth-client';
  import { goto } from '$app/navigation';

  export let role: 'OWNER' | 'STAFF';
  export let businessName: string;

  const links = [
    { href: '/transactions', label: 'Transaksi', ownerOnly: false },
    { href: '/products', label: 'Produk', ownerOnly: false },
    { href: '/dashboard', label: 'Dashboard', ownerOnly: true },
    { href: '/simulator', label: 'Simulator', ownerOnly: true },
    { href: '/settings', label: 'Pengaturan', ownerOnly: true }
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

<aside class="flex flex-col w-56 h-screen border-r border-border-warm bg-surface p-4 box-border">
  <div class="flex flex-col mb-8 px-2">
    <strong class="text-headline-sm text-ink">Katalyst</strong>
    <span class="text-body-sm text-muted">{businessName}</span>
  </div>
  <nav class="flex flex-col gap-1 flex-1">
    {#each visibleLinks as link}
      <a
        href={link.href}
        class="rounded px-3 py-2 text-body-md no-underline"
        class:bg-ink-navy={$page.url.pathname.startsWith(link.href)}
        class:text-white={$page.url.pathname.startsWith(link.href)}
        class:text-ink={!$page.url.pathname.startsWith(link.href)}
      >
        {link.label}
      </a>
    {/each}
  </nav>
  <div class="flex items-center justify-between pt-4 border-t border-border-warm">
    <span class="text-label-sm uppercase px-2 py-1 rounded bg-status-neutral-bg text-status-neutral border border-status-neutral-border">{role}</span>
    <button on:click={handleLogout} class="border-none bg-transparent text-status-negative text-body-sm cursor-pointer">Keluar</button>
  </div>
</aside>
