<script lang="ts">
  import { page } from '$app/stores';
  import { signOut } from '$lib/auth-client';
  import { goto } from '$app/navigation';

  export let role: 'OWNER' | 'STAFF';
  export let businessName: string;

  // Setara array `ownerOnlyPaths` di proxy.ts versi Next — dipakai di sini
  // buat nyembunyiin link, sementara enforcement beneran tetep di hooks.server.ts.
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
    goto('/login');
  }
</script>

<aside class="sidebar">
  <div class="brand">
    <strong>Katalyst</strong>
    <span class="business-name">{businessName}</span>
  </div>
  <nav>
    {#each visibleLinks as link}
      <a href={link.href} class:active={$page.url.pathname.startsWith(link.href)}>
        {link.label}
      </a>
    {/each}
  </nav>
  <div class="footer">
    <span class="role-badge">{role}</span>
    <button on:click={handleLogout}>Keluar</button>
  </div>
</aside>

<style>
  .sidebar { display: flex; flex-direction: column; width: 220px; height: 100vh; border-right: 1px solid #e5e7eb; padding: 1rem; box-sizing: border-box; }
  .brand { display: flex; flex-direction: column; margin-bottom: 2rem; }
  .business-name { font-size: 0.75rem; color: #6b7280; }
  nav { display: flex; flex-direction: column; gap: 0.5rem; flex: 1; }
  nav a { padding: 0.5rem 0.75rem; border-radius: 6px; text-decoration: none; color: #374151; }
  nav a.active { background: #111827; color: white; }
  .footer { display: flex; align-items: center; justify-content: space-between; padding-top: 1rem; border-top: 1px solid #e5e7eb; }
  .role-badge { font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 999px; background: #f3f4f6; }
  button { border: none; background: none; color: #dc2626; cursor: pointer; font-size: 0.8rem; }
</style>
