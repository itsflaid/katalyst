<script lang="ts">
  export let headers: string[] = [];
</script>

<div class="overflow-x-auto rounded-panel border border-border-cool">
  <table class="w-full text-body-md">
    <thead class="bg-ink-navy border-b border-ink-navy">
      <tr>
        {#each headers as h}
          <th class="px-3 py-2 text-left text-label-md uppercase text-white">{h}</th>
        {/each}
      </tr>
    </thead>
    <!-- Body selang-seling putih standar: ganjil #FFFFFF, genap #F8FAFC -->
    <tbody class="divide-y divide-table-divider">
      <slot />
    </tbody>
  </table>
</div>

<style>
  :global(table tbody tr:nth-child(odd)) {
    background-color: #ffffff;
  }
  :global(table tbody tr:nth-child(even)) {
    background-color: #f8fafc;
  }
  :global(table tbody tr:hover) {
    background-color: #eff6ff;
  }
</style>
