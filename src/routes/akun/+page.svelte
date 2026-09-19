<script lang="ts">
  import { authClient } from '$lib/auth-client';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';

  export let data;

  let name = data.name;
  let savingName = false;
  let nameSaved = false;
  let nameError = '';

  let currentPassword = '';
  let newPassword = '';
  let confirmPassword = '';
  let savingPassword = false;
  let passwordSaved = false;
  let passwordError = '';

  $: if (name !== data.name) nameSaved = false;

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed) {
      nameError = 'Nama tidak boleh kosong.';
      return;
    }
    savingName = true;
    nameSaved = false;
    nameError = '';
    let res: Response;
    try {
      res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      });
    } catch {
      savingName = false;
      nameError = 'Jaringan bermasalah, coba lagi.';
      return;
    }
    savingName = false;
    if (res.ok) {
      nameSaved = true;
      data.name = trimmed;
      name = trimmed;
    } else {
      const body = await res.json().catch(() => ({}));
      nameError = body.message ?? 'Gagal menyimpan nama.';
    }
  }

  async function changePassword() {
    passwordError = '';
    passwordSaved = false;
    if (newPassword.length < 6) {
      passwordError = 'Password baru minimal 6 karakter.';
      return;
    }
    if (newPassword !== confirmPassword) {
      passwordError = 'Konfirmasi password tidak cocok.';
      return;
    }
    savingPassword = true;
    const { error: changeError } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true
    });
    savingPassword = false;
    if (changeError) {
      passwordError = changeError.message ?? 'Gagal mengganti password. Cek password lama.';
      return;
    }
    passwordSaved = true;
    currentPassword = '';
    newPassword = '';
    confirmPassword = '';
  }
</script>

<PageHeader title="Akun" subtitle="Profil dan keamanan akun kamu." />

<div class="flex flex-col gap-6 max-w-lg">
  <Card>
    <h2 class="text-headline-sm text-ink mb-1">Profil</h2>
    <p class="text-body-sm text-muted mb-4">
      Nama ini tampil sebagai nama kasir di struk baru. Struk lama tetap menampilkan nama saat dicatat.
    </p>
    <form on:submit|preventDefault={saveName} class="flex flex-col gap-3">
      <label for="account-name" class="flex flex-col gap-1 text-body-md text-ink">
        Nama tampil
        <Input id="account-name" type="text" placeholder="Nama kamu" bind:value={name} maxlength={100} required />
      </label>
      <div class="flex items-center gap-2 text-body-md">
        <span class="text-muted">{data.email}</span>
        <Badge size="sm" tone={data.role === 'OWNER' ? 'neutral' : 'positive'}>{data.role}</Badge>
      </div>
      <p class="text-body-sm text-muted">Email tidak bisa diganti sendiri — hubungi owner kalau emailmu salah.</p>
      {#if nameError}<p role="alert" class="text-body-sm text-status-negative">{nameError}</p>{/if}
      <div><Button type="submit" disabled={savingName}>{savingName ? 'Menyimpan...' : 'Simpan Nama'}</Button></div>
      {#if nameSaved}<p role="status" class="text-body-sm text-status-positive">Nama tersimpan.</p>{/if}
    </form>
  </Card>

  <Card>
    <h2 class="text-headline-sm text-ink mb-1">Ganti Password</h2>
    <p class="text-body-sm text-muted mb-4">Password baru langsung berlaku di semua perangkat lain.</p>
    <form on:submit|preventDefault={changePassword} class="flex flex-col gap-3">
      <label for="account-current" class="flex flex-col gap-1 text-body-md text-ink">
        Password lama
        <Input id="account-current" type="password" placeholder="••••••••" bind:value={currentPassword} autocomplete="current-password" required />
      </label>
      <label for="account-new" class="flex flex-col gap-1 text-body-md text-ink">
        Password baru
        <Input id="account-new" type="password" placeholder="Min. 6 karakter" bind:value={newPassword} autocomplete="new-password" minlength={6} required />
      </label>
      <label for="account-confirm" class="flex flex-col gap-1 text-body-md text-ink">
        Konfirmasi password baru
        <Input id="account-confirm" type="password" placeholder="Ulangi password baru" bind:value={confirmPassword} autocomplete="new-password" minlength={6} required />
      </label>
      {#if passwordError}<p role="alert" class="text-body-sm text-status-negative">{passwordError}</p>{/if}
      <div><Button type="submit" disabled={savingPassword}>{savingPassword ? 'Menyimpan...' : 'Ganti Password'}</Button></div>
      {#if passwordSaved}<p role="status" class="text-body-sm text-status-positive">Password diganti.</p>{/if}
    </form>
  </Card>
</div>
