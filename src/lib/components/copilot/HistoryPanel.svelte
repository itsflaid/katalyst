<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ChevronRight, Plus, Trash2 } from 'lucide-svelte';

  interface Conversation {
    id: string;
    title: string;
    updatedAt: number;
  }

  export let conversations: Conversation[] = [];
  export let activeId = '';
  export let loading = false;
  export let error = '';
  export let sending = false;
  export let deleting = '';
  export let alwaysShowDelete = false;

  const dispatch = createEventDispatcher<{
    select: string;
    remove: string;
    removeAll: void;
    create: void;
  }>();
</script>

<div class="flex items-center justify-between px-5 pb-4 pt-5">
  <div><h2 class="text-headline-sm text-ink">Katalyst Copilot</h2><p class="mt-1 text-body-sm text-muted">Riwayat percakapan</p></div>
  <button type="button" on:click={() => dispatch('create')} disabled={sending} class="grid h-8 w-8 place-items-center rounded-panel border border-border-warm text-ink hover:bg-black/[0.04] disabled:opacity-50" aria-label="Percakapan baru"><Plus size={16} /></button>
</div>
<div class="flex-1 overflow-y-auto px-3">
  {#if loading}
    <p class="px-3 py-3 text-body-sm text-muted">Memuat riwayat…</p>
  {:else if error && conversations.length === 0}
    <p class="px-3 py-3 text-body-sm text-muted">{error}</p>
  {:else}
    {#each conversations as conversation}
      <div class="group mb-1 flex items-center gap-1">
        <button type="button" on:click={() => dispatch('select', conversation.id)} disabled={sending} class:active={conversation.id === activeId} class="history flex min-w-0 flex-1 items-center gap-2 border-l-2 border-transparent px-3 py-3 text-left hover:bg-black/[0.025] disabled:opacity-60">
          <span class="min-w-0 flex-1 truncate text-body-sm text-ink">{conversation.title}</span><ChevronRight size={15} class="shrink-0 text-muted/50 group-hover:translate-x-0.5" />
        </button>
        <button type="button" on:click={() => dispatch('remove', conversation.id)} disabled={sending || deleting !== ''} class={alwaysShowDelete ? 'grid h-11 w-11 shrink-0 place-items-center rounded text-muted hover:bg-black/[0.05] hover:text-ink disabled:opacity-50' : 'hidden h-7 w-7 shrink-0 place-items-center rounded text-muted hover:bg-black/[0.05] hover:text-ink group-hover:grid group-focus-within:grid disabled:opacity-50'} aria-label={`Hapus ${conversation.title}`}><Trash2 size={14} /></button>
      </div>
    {/each}
  {/if}
</div>
{#if conversations.length > 0}
  <div class="border-t border-border-warm px-5 py-3">
    <button type="button" on:click={() => dispatch('removeAll')} disabled={sending || deleting !== ''} class="text-body-sm text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50">{deleting === 'all' ? 'Menghapus…' : 'Hapus semua riwayat'}</button>
  </div>
{/if}

<style>
  .history.active { border-left-color: #172033; background: rgba(0, 0, 0, 0.045); }
</style>
