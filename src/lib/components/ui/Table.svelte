<script lang="ts">
  export let headers: string[] = [];
</script>

<div class="overflow-x-auto rounded-lg border border-neutral-200">
  <table class="w-full text-sm">
    <thead class="bg-neutral-50 text-left text-neutral-500">
      <tr>
        {#each headers as h}
          <th class="px-4 py-2 font-medium">{h}</th>
        {/each}
      </tr>
    </thead>
    <tbody class="divide-y divide-neutral-100">
      <slot />
    </tbody>
  </table>
</div>
