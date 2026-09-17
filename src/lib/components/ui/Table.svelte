<script lang="ts">
  export let headers: string[] = [];
</script>

<div class="overflow-x-auto rounded-panel border border-border-cool">
  <table class="w-full text-body-md">
    <thead class="bg-table-header border-b border-border-input">
      <tr>
        {#each headers as h}
          <th class="px-3 py-2 text-left text-label-md text-muted">{h}</th>
        {/each}
      </tr>
    </thead>
    <!-- Zebra fill sengaja dimatiin (design.md eksplisit minta clean divider
         1px, bukan alternating row) -->
    <tbody class="divide-y divide-table-divider">
      <slot />
    </tbody>
  </table>
</div>

<style>
  :global(table tbody tr:hover) {
    background-color: #F8FAFC;
  }
</style>
