<script lang="ts">
  import Table from '$lib/components/ui/Table.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';

  export let staffList: { id: string; name: string | null; email: string }[] = [];

  let email = '';
  let password = '';
  let name = '';
  let loading = false;
  let error = '';

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
    staffList = [...staffList, { id: created.id, name: name || null, email: created.email }];
    email = '';
    password = '';
    name = '';
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
        <Table headers={['Nama', 'Email']}>
          {#each staffList as staff}
            <tr>
              <td class="px-3 py-2 text-ink">{staff.name ?? '—'}</td>
              <td class="px-3 py-2 text-muted">{staff.email}</td>
            </tr>
          {/each}
        </Table>
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
            <Input id="staff-password" type="password" placeholder="Password" bind:value={password} required />
          </label>
          {#if error}<p class="text-body-sm text-status-negative">{error}</p>{/if}
          <Button type="submit" disabled={loading}>{loading ? 'Menambahkan...' : 'Tambah Staff'}</Button>
        </form>
      </Card>
    </div>
  </div>
</div>
