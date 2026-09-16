<script lang="ts">
  import BusinessProfileForm from '$lib/components/BusinessProfileForm.svelte';
  import StaffManager from '$lib/components/StaffManager.svelte';
  export let data;
</script>

<h1 class="text-2xl font-semibold mb-6">Pengaturan</h1>

<section class="mb-10">
  <h2 class="text-lg font-medium mb-3">Profil Bisnis</h2>
  <BusinessProfileForm businessName={data.businessName} />
</section>

<section>
  <StaffManager staffList={data.staffList} />
</section>
