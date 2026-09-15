<script lang="ts">
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

<div class="staff-manager">
  <h2>Staff</h2>
  <ul>
    {#each staffList as staff}
      <li>{staff.name ?? staff.email} — {staff.email}</li>
    {/each}
  </ul>

  <form on:submit|preventDefault={addStaff}>
    <input type="text" placeholder="Nama" bind:value={name} />
    <input type="email" placeholder="Email" bind:value={email} required />
    <input type="password" placeholder="Password" bind:value={password} required />
    {#if error}<p class="error">{error}</p>{/if}
    <button type="submit" disabled={loading}>{loading ? 'Menambahkan...' : 'Tambah Staff'}</button>
  </form>
</div>

<style>
  .staff-manager { display: flex; flex-direction: column; gap: 1rem; max-width: 400px; }
  ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
  form { display: flex; flex-direction: column; gap: 0.5rem; }
  input { padding: 0.5rem; border: 1px solid #d4d4d4; border-radius: 6px; }
  .error { color: #dc2626; font-size: 0.875rem; }
  button { padding: 0.5rem; border-radius: 6px; background: #111827; color: white; border: none; cursor: pointer; }
</style>
