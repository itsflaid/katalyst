<script lang="ts">
  import type { SubmitFunction } from "@sveltejs/kit";
  export let product: { id: string; name: string; isActive: boolean };
  export let onSubmit: SubmitFunction;
  import { enhance } from "$app/forms";
</script>

<form method="POST" action="?/toggle" use:enhance={onSubmit}>
  <input type="hidden" name="id" value={product.id} />
  <input type="hidden" name="isActive" value={product.isActive ? "off" : "on"} />
  <button
    type="submit"
    role="switch"
    aria-checked={product.isActive}
    aria-label={product.isActive ? `Nonaktifkan ${product.name}` : `Aktifkan ${product.name}`}
    title={product.isActive ? "Klik untuk menonaktifkan" : "Klik untuk mengaktifkan"}
    class="relative block h-6 w-10 rounded-full border transition-colors cursor-pointer {product.isActive
      ? 'bg-status-positive border-status-positive'
      : 'bg-surface-dim border-border-input'}"
  >
    <span
      class="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-all {product.isActive
        ? 'left-[18px]'
        : 'left-0.5'}"
    ></span>
  </button>
</form>
