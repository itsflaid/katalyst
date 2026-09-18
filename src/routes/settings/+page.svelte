<script lang="ts">
  import BusinessProfileForm from '$lib/components/BusinessProfileForm.svelte';
  import StaffManager from '$lib/components/StaffManager.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  export let data;
</script>

<PageHeader title="Pengaturan" />

<nav class="flex gap-2 overflow-x-auto mb-8 -mx-1 px-1">
  <a href="#profil" class="flex-shrink-0 text-label-md rounded px-3 py-2 bg-ink-navy text-white no-underline">Identitas Bisnis</a>
  <a href="#staff" class="flex-shrink-0 text-label-md rounded px-3 py-2 border border-border-input text-muted no-underline hover:bg-table-header">Akses & Staff</a>
  <a href="#danger" class="flex-shrink-0 text-label-md rounded px-3 py-2 border border-status-negative-border text-status-negative no-underline hover:bg-status-negative-bg">Zona Berbahaya</a>
</nav>

<section id="profil" class="mb-10 scroll-mt-4">
  <h2 class="text-label-sm uppercase text-muted mb-3">Identitas Bisnis</h2>
  <Card class="max-w-sm">
    <BusinessProfileForm businessName={data.businessName} />
  </Card>
</section>

<section id="staff" class="mb-10 scroll-mt-4">
  <h2 class="text-label-sm uppercase text-muted mb-3">Akses & Staff</h2>
  <StaffManager staffList={data.staffList} currentUserId={data.currentUserId} />
</section>

<section id="danger" class="scroll-mt-4">
  <h2 class="text-label-sm uppercase text-status-negative mb-3">Zona Berbahaya</h2>
  <div class="rounded-panel border border-status-negative-border bg-status-negative-bg p-4">
    <p class="text-body-sm text-status-negative mb-3">
      Menghapus bisnis akan menghilangkan seluruh data produk & transaksi secara permanen. Fitur ini belum tersedia.
    </p>
    <Button variant="destructive" disabled>Hapus Bisnis</Button>
  </div>
</section>