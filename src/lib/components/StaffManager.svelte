<script lang="ts">
  import Table from '$lib/components/ui/Table.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';

  export let staffList: { id: string; name: string | null; username: string | null; role: string }[] = [];
  export let pendingInvites: { id: string; username: string; name: string | null; expiresAt: string; createdAt: string }[] = [];
  export let currentUserId = '';

  let username = '';
  let name = '';
  let loading = false;
  let error = '';
  let createdInvite: { username: string; link: string } | null = null;
  let copied = false;
  let pendingDelete: { id: string; name: string } | null = null;
  let deleting = false;
  let pendingReset: { id: string; name: string } | null = null;
  let resetting = false;
  let resetResult: { name: string; tempPassword: string } | null = null;
  let editingUsername: { id: string; name: string; current: string | null } | null = null;
  let usernameValue = '';
  let savingUsername = false;
  let listError = '';
  let busyInviteId = '';

  function inviteLink(token: string): string {
    return `${window.location.origin}/invite/${token}`;
  }

  function isExpired(expiresAt: string): boolean {
    return new Date(expiresAt).getTime() < Date.now();
  }

  function formatExpiry(expiresAt: string): string {
    return new Date(expiresAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }

  // Buat undangan: owner cuma input username+nama, password dibuat staff
  // sendiri via link (48 jam, sekali pakai). Token mentah cuma muncul
  // sekali di modal — habis ditutup tidak bisa dilihat lagi.
  async function addStaff() {
    loading = true;
    error = '';
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, name })
    });
    loading = false;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      error = body.message ?? 'Gagal membuat undangan.';
      return;
    }
    const created = await res.json();
    pendingInvites = [
      { id: created.id, username: created.username, name: created.name ?? (name.trim() || null), expiresAt: created.expiresAt, createdAt: new Date().toISOString() },
      ...pendingInvites
    ];
    createdInvite = { username: created.username, link: inviteLink(created.token) };
    copied = false;
    username = '';
    name = '';
  }

  // Kirim ulang = revoke token lama + terbitkan baru (link lama mati).
  async function resendInvite(inviteId: string) {
    busyInviteId = inviteId;
    listError = '';
    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId })
    });
    busyInviteId = '';
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      listError = body.message ?? 'Gagal mengirim ulang undangan.';
      return;
    }
    const created = await res.json();
    pendingInvites = pendingInvites.map((i) =>
      i.id === inviteId ? { ...i, id: created.id, expiresAt: created.expiresAt } : i
    );
    createdInvite = { username: created.username, link: inviteLink(created.token) };
    copied = false;
  }

  async function revokeInvite(inviteId: string) {
    busyInviteId = inviteId;
    listError = '';
    const res = await fetch('/api/invites', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId })
    });
    busyInviteId = '';
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      listError = body.message ?? 'Gagal mencabut undangan.';
      return;
    }
    pendingInvites = pendingInvites.filter((i) => i.id !== inviteId);
  }

  async function resetPassword() {
    if (!pendingReset) return;
    resetting = true;
    listError = '';
    const res = await fetch('/api/staff/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pendingReset.id })
    });
    resetting = false;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      listError = body.message ?? 'Gagal me-reset password.';
      return;
    }
    const body = await res.json();
    resetResult = { name: pendingReset.name, tempPassword: body.tempPassword };
    copied = false;
    pendingReset = null;
  }

  function openUsernameEditor(staff: { id: string; name: string | null; username: string | null }) {
    editingUsername = { id: staff.id, name: staff.name ?? staff.username ?? 'Staff', current: staff.username };
    usernameValue = staff.username ?? '';
    listError = '';
  }

  async function saveUsername() {
    if (!editingUsername) return;
    savingUsername = true;
    listError = '';
    const res = await fetch('/api/staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingUsername.id, username: usernameValue })
    });
    savingUsername = false;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      listError = body.message ?? 'Gagal menyimpan username.';
      return;
    }
    const body = await res.json();
    staffList = staffList.map((s) => (s.id === editingUsername?.id ? { ...s, username: body.username } : s));
    editingUsername = null;
  }

  async function deleteStaff() {
    if (!pendingDelete) return;
    deleting = true;
    listError = '';
    const res = await fetch('/api/staff', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pendingDelete.id })
    });
    deleting = false;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      listError = body.message ?? 'Gagal menghapus staff.';
      return;
    }
    staffList = staffList.filter((s) => s.id !== pendingDelete?.id);
    pendingDelete = null;
  }
</script>

<!-- Layout 2 kolom ala halaman Transaksi: kiri daftar (flex-1) +
     kanan form (lg:w-80, sticky). Di mobile form naik ke atas. -->
<div class="flex flex-col lg:flex-row gap-6 items-start">
  <div class="flex-1 min-w-0 w-full order-2 lg:order-1 flex flex-col gap-6">
    <!-- Bar judul putih (bukan biru) biar tidak monoton ketemu thead
         tabel yang biru: putih → biru → zebra. -->
    <div>
      <div class="flex flex-wrap items-center justify-between gap-3 bg-surface px-5 py-3 rounded-t-panel border border-border-cool border-b-0">
        <h3 class="text-headline-sm text-ink">Daftar Staff</h3>
        <span class="text-body-sm text-muted tabular">{staffList.length} orang</span>
      </div>

      {#if staffList.length === 0}
        <Card class="!rounded-t-none !border-t-0 text-center py-10">
          <p class="text-body-md text-muted">Belum ada staff.</p>
        </Card>
      {:else}
        <div class="[&>div]:!rounded-t-none [&>div]:!border-t-0">
          {#if listError}<p role="alert" class="rounded border border-status-negative-border bg-status-negative-bg px-3 py-2 text-body-sm text-status-negative mb-3">{listError}</p>{/if}
          <Table headers={['Nama', 'Username', 'Role', 'Aksi']}>
            {#each staffList as staff}
              <tr>
                <td class="px-3 py-2 text-ink">{staff.name ?? '—'}</td>
                <td class="px-3 py-2 text-muted tabular">{staff.username ?? '—'}</td>
                <td class="px-3 py-2"><Badge size="sm" tone={staff.role === 'OWNER' ? 'neutral' : 'positive'}>{staff.role}</Badge></td>
                <td class="px-3 py-2 whitespace-nowrap">
                  {#if staff.role === 'STAFF' && staff.id !== currentUserId}
                    <button
                      type="button"
                      on:click={() => openUsernameEditor(staff)}
                      class="text-body-sm font-semibold text-ink-navy hover:underline bg-transparent border-none cursor-pointer p-0 mr-3"
                    >
                      Username
                    </button>
                    <button
                      type="button"
                      on:click={() => (pendingReset = { id: staff.id, name: staff.name ?? staff.username ?? 'Staff' })}
                      class="text-body-sm font-semibold text-ink-navy hover:underline bg-transparent border-none cursor-pointer p-0 mr-3"
                    >
                      Reset password
                    </button>
                    <button
                      type="button"
                      on:click={() => (pendingDelete = { id: staff.id, name: staff.name ?? staff.username ?? 'Staff' })}
                      class="text-body-sm font-semibold text-status-negative hover:underline bg-transparent border-none cursor-pointer p-0"
                    >
                      Hapus
                    </button>
                  {:else}
                    <span class="text-body-sm text-muted">—</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </Table>
          <p class="text-body-sm text-muted mt-2">Riwayat transaksi staff yang dihapus tetap menampilkan namanya.</p>
        </div>
      {/if}
    </div>

    <div>
      <div class="flex flex-wrap items-center justify-between gap-3 bg-surface px-5 py-3 rounded-t-panel border border-border-cool border-b-0">
        <h3 class="text-headline-sm text-ink">Undangan Pending</h3>
        <span class="text-body-sm text-muted tabular">{pendingInvites.length} undangan</span>
      </div>

      {#if pendingInvites.length === 0}
        <Card class="!rounded-t-none !border-t-0 text-center py-8">
          <p class="text-body-md text-muted">Tidak ada undangan pending.</p>
        </Card>
      {:else}
        <div class="[&>div]:!rounded-t-none [&>div]:!border-t-0">
          <Table headers={['Username', 'Status', 'Aksi']}>
            {#each pendingInvites as invite}
              {@const expired = isExpired(invite.expiresAt)}
              <tr>
                <td class="px-3 py-2">
                  <p class="text-ink text-body-md">{invite.name ?? invite.username}</p>
                  <p class="text-body-sm text-muted tabular">@{invite.username}</p>
                  <p class="text-body-sm text-muted tabular">s/d {formatExpiry(invite.expiresAt)}</p>
                </td>
                <td class="px-3 py-2"><Badge size="sm" tone={expired ? 'negative' : 'warning'}>{expired ? 'KEDALUWARSA' : 'MENUNGGU'}</Badge></td>
                <td class="px-3 py-2 whitespace-nowrap">
                  <button
                    type="button"
                    disabled={busyInviteId === invite.id}
                    on:click={() => resendInvite(invite.id)}
                    class="text-body-sm font-semibold text-ink-navy hover:underline bg-transparent border-none cursor-pointer p-0 mr-3 disabled:opacity-50"
                  >
                    {busyInviteId === invite.id ? 'Memproses...' : 'Kirim ulang'}
                  </button>
                  <button
                    type="button"
                    disabled={busyInviteId === invite.id}
                    on:click={() => revokeInvite(invite.id)}
                    class="text-body-sm font-semibold text-status-negative hover:underline bg-transparent border-none cursor-pointer p-0 disabled:opacity-50"
                  >
                    Cabut
                  </button>
                </td>
              </tr>
            {/each}
          </Table>
          <p class="text-body-sm text-muted mt-2">Link undangan berlaku 48 jam dan sekali pakai. Kirim ulang akan mematikan link lama.</p>
        </div>
      {/if}
    </div>
  </div>

  <div class="w-full lg:w-80 flex-shrink-0 order-1 lg:order-2">
    <div class="lg:sticky lg:top-6">
      <Card>
        <h3 class="text-headline-sm text-ink mb-1">Undang Staff</h3>
        <p class="text-body-sm text-muted mb-3">Staff bikin password sendiri via link — owner tidak perlu tahu password.</p>
        <form on:submit|preventDefault={addStaff} class="flex flex-col gap-3">
          <label for="staff-name" class="flex flex-col gap-1 text-body-md text-ink">
            Nama
            <Input id="staff-name" type="text" placeholder="Nama" bind:value={name} />
          </label>
          <label for="staff-username" class="flex flex-col gap-1 text-body-md text-ink">
            Username
            <Input id="staff-username" type="text" placeholder="mis. budi" bind:value={username} required />
          </label>
          <p class="text-body-sm text-muted -mt-2">3–20 karakter: huruf kecil, angka, titik, underscore, strip. Dipakai staff untuk masuk.</p>
          {#if error}<p class="text-body-sm text-status-negative">{error}</p>{/if}
          <Button type="submit" disabled={loading}>{loading ? 'Membuat...' : 'Buat Undangan'}</Button>
        </form>
      </Card>
    </div>
  </div>
</div>

{#if createdInvite}
  <div class="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Undangan dibuat">
    <button type="button" class="absolute inset-0 bg-ink/40 border-none cursor-default p-0" aria-label="Tutup" on:click={() => (createdInvite = null)}></button>
    <div class="relative w-full max-w-sm rounded-panel border border-border-cool bg-surface p-5 shadow-level3">
      <h3 class="text-headline-sm text-ink mb-2">Undangan dibuat</h3>
      <p class="text-body-md text-muted">Teruskan link ini ke <strong class="text-ink">@{createdInvite.username}</strong> (mis. via WA). Link tampil <strong class="text-ink">sekali ini saja</strong>, berlaku 48 jam dan sekali pakai.</p>
      <div class="mt-3 flex gap-2">
        <Input value={createdInvite.link} readonly class="flex-1" aria-label="Link undangan" />
        <Button variant="secondary" on:click={() => createdInvite && copyLink(createdInvite.link)}>{copied ? 'Tersalin!' : 'Salin'}</Button>
      </div>
      <div class="flex gap-2 mt-4">
        <Button class="flex-1" on:click={() => (createdInvite = null)}>Selesai</Button>
      </div>
    </div>
  </div>
{/if}

{#if pendingReset}
  <div class="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Konfirmasi reset password">
    <button type="button" class="absolute inset-0 bg-ink/40 border-none cursor-default p-0" aria-label="Batal" on:click={() => (pendingReset = null)}></button>
    <div class="relative w-full max-w-sm rounded-panel border border-border-cool bg-surface p-5 shadow-level3">
      <h3 class="text-headline-sm text-ink mb-2">Reset password?</h3>
      <p class="text-body-md text-muted">“{pendingReset.name}” langsung keluar dari semua perangkat dan password lamanya mati. Kamu dapat password sementara untuk diteruskan ke dia.</p>
      <div class="flex gap-2 mt-4">
        <Button variant="secondary" class="flex-1" on:click={() => (pendingReset = null)}>Batal</Button>
        <Button class="flex-1" disabled={resetting} on:click={resetPassword}>{resetting ? 'Memproses...' : 'Reset'}</Button>
      </div>
    </div>
  </div>
{/if}

{#if resetResult}
  <div class="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Password sementara">
    <button type="button" class="absolute inset-0 bg-ink/40 border-none cursor-default p-0" aria-label="Tutup" on:click={() => (resetResult = null)}></button>
    <div class="relative w-full max-w-sm rounded-panel border border-border-cool bg-surface p-5 shadow-level3">
      <h3 class="text-headline-sm text-ink mb-2">Password sementara</h3>
      <p class="text-body-md text-muted">Teruskan ke <strong class="text-ink">{resetResult.name}</strong> (mis. via WA) lalu minta dia segera ganti sendiri di halaman <strong class="text-ink">Akun</strong>. Password ini tampil <strong class="text-ink">sekali ini saja</strong>.</p>
      <div class="mt-3 flex gap-2">
        <Input value={resetResult.tempPassword} readonly class="flex-1 tabular" aria-label="Password sementara" />
        <Button variant="secondary" on:click={() => resetResult && copyLink(resetResult.tempPassword)}>{copied ? 'Tersalin!' : 'Salin'}</Button>
      </div>
      <div class="flex gap-2 mt-4">
        <Button class="flex-1" on:click={() => (resetResult = null)}>Selesai</Button>
      </div>
    </div>
  </div>
{/if}

{#if pendingDelete}
  <div class="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Konfirmasi hapus staff">
    <button type="button" class="absolute inset-0 bg-ink/40 border-none cursor-default p-0" aria-label="Batal" on:click={() => (pendingDelete = null)}></button>
    <div class="relative w-full max-w-sm rounded-panel border border-border-cool bg-surface p-5 shadow-level3">
      <h3 class="text-headline-sm text-ink mb-2">Hapus staff?</h3>
      <p class="text-body-md text-muted">“{pendingDelete.name}” tidak bisa login lagi. Riwayat transaksinya tetap tampil dengan nama ini.</p>
      <div class="flex gap-2 mt-4">
        <Button variant="secondary" class="flex-1" on:click={() => (pendingDelete = null)}>Batal</Button>
        <Button variant="destructive" class="flex-1" disabled={deleting} on:click={deleteStaff}>{deleting ? 'Menghapus...' : 'Hapus'}</Button>
      </div>
    </div>
  </div>
{/if}

{#if editingUsername}
  <div class="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Atur username">
    <button type="button" class="absolute inset-0 bg-ink/40 border-none cursor-default p-0" aria-label="Batal" on:click={() => (editingUsername = null)}></button>
    <div class="relative w-full max-w-sm rounded-panel border border-border-cool bg-surface p-5 shadow-level3">
      <h3 class="text-headline-sm text-ink mb-2">Username “{editingUsername.name}”</h3>
      <p class="text-body-sm text-muted mb-3">Dipakai staff untuk masuk. 3–20 karakter: huruf kecil, angka, titik, underscore, strip.</p>
      <label for="staff-username-edit" class="flex flex-col gap-1 text-body-md text-ink">
        Username
        <Input id="staff-username-edit" type="text" placeholder="mis. budi" bind:value={usernameValue} />
      </label>
      {#if listError}<p role="alert" class="rounded border border-status-negative-border bg-status-negative-bg px-3 py-2 text-body-sm text-status-negative mt-3">{listError}</p>{/if}
      <div class="flex gap-2 mt-4">
        <Button variant="secondary" class="flex-1" on:click={() => (editingUsername = null)}>Batal</Button>
        <Button class="flex-1" disabled={savingUsername} on:click={saveUsername}>{savingUsername ? 'Menyimpan...' : 'Simpan'}</Button>
      </div>
    </div>
  </div>
{/if}
