<script lang="ts">
  import Table from '$lib/components/ui/Table.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';

  export let staffList: { id: string; name: string | null; email: string; role: string }[] = [];
  export let currentUserId = '';

  let email = '';
  let password = '';
  let name = '';
  let loading = false;
  let error = '';
  let pendingDelete: { id: string; name: string } | null = null;
  let deleting = false;
  let listError = '';

  async function addStaff() {
    loading = true;
    error = '';
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    loading = false;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      error = body.message ?? 'Gagal menambahkan staff.';
      return;
    }
    const created = await res.json();
    staffList = [...staffList, { id: created.id, name: name.trim() || null, email: created.email, role: 'STAFF' }];
    email = '';
    password = '';
    name = '';
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
  <div class="flex-1 min-w-0 w-full order-2 lg:order-1">
    <!-- Bar judul putih (bukan biru) biar tidak monoton ketemu thead
         tabel yang biru: putih → biru → zebra. -->
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
        <Table headers={['Nama', 'Email', 'Role', 'Aksi']}>
          {#each staffList as staff}
            <tr>
              <td class="px-3 py-2 text-ink">{staff.name ?? '—'}</td>
              <td class="px-3 py-2 text-muted">{staff.email}</td>
              <td class="px-3 py-2"><Badge tone={staff.role === 'OWNER' ? 'neutral' : 'positive'}>{staff.role}</Badge></td>
              <td class="px-3 py-2 whitespace-nowrap">
                {#if staff.role === 'STAFF' && staff.id !== currentUserId}
                  <button
                    type="button"
                    on:click={() => (pendingDelete = { id: staff.id, name: staff.name ?? staff.email })}
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

  <div class="w-full lg:w-80 flex-shrink-0 order-1 lg:order-2">
    <div class="lg:sticky lg:top-6">
      <Card>
        <h3 class="text-headline-sm text-ink mb-3">Tambah Staff</h3>
        <form on:submit|preventDefault={addStaff} class="flex flex-col gap-3">
          <label for="staff-name" class="flex flex-col gap-1 text-body-md text-ink">
            Nama
            <Input id="staff-name" type="text" placeholder="Nama" bind:value={name} />
          </label>
          <label for="staff-email" class="flex flex-col gap-1 text-body-md text-ink">
            Email
            <Input id="staff-email" type="email" placeholder="Email" bind:value={email} required />
          </label>
          <label for="staff-password" class="flex flex-col gap-1 text-body-md text-ink">
            Password
            <Input id="staff-password" type="password" placeholder="Min. 6 karakter" bind:value={password} minlength={6} required />
          </label>
          {#if error}<p class="text-body-sm text-status-negative">{error}</p>{/if}
          <Button type="submit" disabled={loading}>{loading ? 'Menambahkan...' : 'Tambah Staff'}</Button>
        </form>
      </Card>
    </div>
  </div>
</div>

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
