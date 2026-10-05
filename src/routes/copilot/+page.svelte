<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount, tick } from 'svelte';
  import { ChevronRight, Plus, Send, Trash2 } from 'lucide-svelte';
  import { renderChatMarkdown } from '$lib/shared/chat-markdown';

  type Role = 'user' | 'assistant';
  type ToolResult = Record<string, unknown>;

  interface ChatMessage {
    id: string;
    role: Role;
    content: string;
    toolName?: string;
    result?: ToolResult;
    loading?: boolean;
  }

  interface Conversation {
    id: string;
    title: string;
    updatedAt: number;
  }

  const storageKey = 'katalyst-copilot-conversations-v1';
  const suggestions = ['Omzet minggu ini berapa?', 'Produk paling laku bulan ini?', 'Kenapa profit turun?', 'Stok apa yang menipis?'];
  let conversations: Conversation[] = [];
  let activeId = '';
  let messages: ChatMessage[] = [];
  let draft = '';
  let sending = false;
  let loadingList = true;
  let listError = '';
  let deleting = '';

  function newId() {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  }

  async function api(path: string, init?: RequestInit) {
    const response = await fetch(path, init);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? 'Copilot tidak dapat memproses permintaan ini.');
    }
    return response.json();
  }

  function toChat(row: { id: string; role: string; content: string; toolName: string | null; toolResult: unknown }): ChatMessage | null {
    if (row.role === 'tool') {
      return { id: row.id, role: 'assistant', content: '', toolName: row.toolName ?? undefined, result: (row.toolResult as ToolResult) ?? {}, loading: false };
    }
    if (row.role === 'user' || row.role === 'assistant' || row.role === 'notice') {
      return { id: row.id, role: row.role === 'notice' ? 'assistant' : row.role, content: row.content };
    }
    return null;
  }

  async function refreshList() {
    const body = await api('/copilot/conversations');
    conversations = (body.conversations as Conversation[]).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function openConversation(conversationId: string) {
    const body = await api(`/copilot/conversations/${conversationId}`);
    activeId = body.conversation.id as string;
    messages = ((body.messages as Parameters<typeof toChat>[0][]).map(toChat).filter(Boolean)) as ChatMessage[];
    await scrollToBottom();
  }

  onMount(async () => {
    try {
      await refreshList();
      if (browser) localStorage.removeItem(storageKey);
      if (conversations.length > 0) await openConversation(conversations[0].id);
    } catch (error) {
      listError = error instanceof Error ? error.message : 'Riwayat tidak dapat dimuat.';
    } finally {
      loadingList = false;
    }
  });

  function createConversation() {
    activeId = '';
    messages = [];
    draft = '';
  }

  async function deleteConversation(conversationId: string) {
    const target = conversations.find((item) => item.id === conversationId);
    if (!target || deleting) return;
    if (!globalThis.confirm(`Hapus "${target.title}"? Semua pesan dan kartu tool di percakapan ini akan terhapus.`)) return;
    deleting = conversationId;
    try {
      await api(`/copilot/conversations/${conversationId}`, { method: 'DELETE' });
      conversations = conversations.filter((item) => item.id !== conversationId);
      if (activeId === conversationId) {
        if (conversations.length > 0) await openConversation(conversations[0].id);
        else createConversation();
      }
    } catch (error) {
      addLocal({ id: newId(), role: 'assistant', content: error instanceof Error ? error.message : 'Gagal menghapus percakapan.' });
    } finally {
      deleting = '';
    }
  }

  async function deleteAll() {
    if (deleting || conversations.length === 0) return;
    if (!globalThis.confirm('Hapus seluruh riwayat Copilot bisnis ini? Tindakan ini tidak dapat dibatalkan.')) return;
    deleting = 'all';
    try {
      await api('/copilot/conversations', { method: 'DELETE' });
      conversations = [];
      createConversation();
    } catch (error) {
      addLocal({ id: newId(), role: 'assistant', content: error instanceof Error ? error.message : 'Gagal menghapus riwayat.' });
    } finally {
      deleting = '';
    }
  }

  function addLocal(message: ChatMessage) {
    messages = [...messages, message];
    void scrollToBottom();
  }

  async function scrollToBottom() {
    await tick();
    scrollTarget?.scrollTo({ top: scrollTarget.scrollHeight, behavior: 'smooth' });
  }

  function updateToolMessage(messageId: string, result: ToolResult) {
    messages = messages.map((message) => message.id === messageId ? { ...message, result, loading: false } : message);
  }

  function resultText(result: ToolResult | undefined) {
    if (!result) return '';
    return JSON.stringify(result.data ?? result.error ?? result, null, 2);
  }

  function toolLabel(name: string) {
    return ({ get_summary: 'Membaca ringkasan bisnis', rank_products: 'Menyusun ranking produk', compare_periods: 'Membandingkan periode', get_inventory: 'Memeriksa inventori', explain_change: 'Mengurai perubahan profit', simulate_price: 'Menjalankan simulasi harga' } as Record<string, string>)[name] ?? name;
  }

  async function ask(question = draft.trim()) {
    if (!question || sending) return;
    draft = '';
    const tempId = activeId;
    if (!tempId) {
      conversations = [{ id: `baru-${Date.now()}`, title: question.slice(0, 52), updatedAt: Date.now() }, ...conversations];
    }
    addLocal({ id: newId(), role: 'user', content: question });
    sending = true;
    try {
      const response = await fetch('/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: tempId || undefined, messages: [{ role: 'user', content: question }] })
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Copilot tidak dapat memproses pertanyaan ini.');
      }
      await readStream(response.body);
    } catch (error) {
      addLocal({ id: newId(), role: 'assistant', content: error instanceof Error ? error.message : 'Copilot sedang bermasalah. Coba lagi sebentar.' });
    } finally {
      sending = false;
      await refreshAfterStream();
    }
  }

  async function refreshAfterStream() {
    try {
      await refreshList();
      if (activeId) {
        const body = await api(`/copilot/conversations/${activeId}`);
        messages = ((body.messages as Parameters<typeof toChat>[0][]).map(toChat).filter(Boolean)) as ChatMessage[];
        await scrollToBottom();
      }
    } catch {
      return;
    }
  }

  async function readStream(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const toolMessages = new Map<string, string>();
    let buffer = '';
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const event of events) handleEvent(event, toolMessages);
    }
  }

  function handleEvent(raw: string, toolMessages: Map<string, string>) {
    const event = raw.match(/^event: (.+)$/m)?.[1];
    const line = raw.match(/^data: (.+)$/m)?.[1];
    if (!event || !line) return;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(line);
    } catch {
      return;
    }
    if (event === 'conversation' && typeof data.id === 'string') {
      activeId = data.id;
      conversations = conversations.filter((item) => !item.id.startsWith('baru-'));
    } else if (event === 'tool_start') {
      const messageId = newId();
      toolMessages.set(String(data.id), messageId);
      addLocal({ id: messageId, role: 'assistant', content: '', toolName: String(data.name), loading: true });
    } else if (event === 'tool_result') {
      const messageId = toolMessages.get(String(data.id));
      if (messageId) updateToolMessage(messageId, data.result as ToolResult);
    } else if (event === 'text' && typeof data.text === 'string') {
      addLocal({ id: newId(), role: 'assistant', content: data.text });
    } else if ((event === 'notice' || event === 'error') && typeof data.message === 'string') {
      addLocal({ id: newId(), role: 'assistant', content: data.message });
    }
  }

  let scrollTarget: HTMLDivElement;
</script>

<div class="flex -m-8 h-screen min-h-[560px] overflow-hidden bg-[#F7F1E6]">
  <aside class="hidden w-72 shrink-0 flex-col border-r border-border-warm bg-[#F7F1E6] lg:flex">
    <div class="flex items-center justify-between px-5 pb-4 pt-5">
      <div><h1 class="text-headline-sm text-ink">Katalyst Copilot</h1><p class="mt-1 text-body-sm text-muted">Riwayat percakapan</p></div>
      <button type="button" on:click={createConversation} disabled={sending} class="grid h-8 w-8 place-items-center rounded-panel border border-border-warm text-ink hover:bg-black/[0.04] disabled:opacity-50" aria-label="Percakapan baru"><Plus size={16} /></button>
    </div>
    <div class="flex-1 overflow-y-auto px-3">
      {#if loadingList}
        <p class="px-3 py-3 text-body-sm text-muted">Memuat riwayat…</p>
      {:else if listError && conversations.length === 0}
        <p class="px-3 py-3 text-body-sm text-muted">{listError}</p>
      {:else}
        {#each conversations as conversation}
          <div class="group mb-1 flex items-center gap-1">
            <button type="button" on:click={() => openConversation(conversation.id)} disabled={sending} class:active={conversation.id === activeId} class="history flex min-w-0 flex-1 items-center gap-2 border-l-2 border-transparent px-3 py-3 text-left hover:bg-black/[0.025] disabled:opacity-60">
              <span class="min-w-0 flex-1 truncate text-body-sm text-ink">{conversation.title}</span><ChevronRight size={15} class="shrink-0 text-muted/50 group-hover:translate-x-0.5" />
            </button>
            <button type="button" on:click={() => deleteConversation(conversation.id)} disabled={sending || deleting !== ''} class="hidden h-7 w-7 shrink-0 place-items-center rounded text-muted hover:bg-black/[0.05] hover:text-ink group-hover:grid group-focus-within:grid disabled:opacity-50" aria-label={`Hapus ${conversation.title}`}><Trash2 size={14} /></button>
          </div>
        {/each}
      {/if}
    </div>
    {#if conversations.length > 0}
      <div class="border-t border-border-warm px-5 py-3">
        <button type="button" on:click={deleteAll} disabled={sending || deleting !== ''} class="text-body-sm text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50">{deleting === 'all' ? 'Menghapus…' : 'Hapus semua riwayat'}</button>
      </div>
    {/if}
  </aside>

  <section class="flex min-w-0 flex-1 flex-col bg-ink-navy">
    <header class="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6 lg:hidden"><h1 class="text-body-md font-medium text-white">Katalyst Copilot</h1><button type="button" on:click={createConversation} class="text-body-sm text-white/70">Percakapan baru</button></header>
    <div class="min-h-0 flex-1 overflow-y-auto scroll-navy" bind:this={scrollTarget} aria-live="polite">
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-5 sm:px-6">
        {#if messages.length === 0}
          <div class="border border-white/10 bg-white/[0.06] px-5 py-4">
            <div class="flex items-start gap-3"><img src="/logo/logo-copilot.png" alt="Katalyst Copilot" class="h-8 w-8 shrink-0 rounded object-cover" /><div><p class="text-body-md font-medium text-white">Mau menganalisis apa hari ini?</p><p class="mt-1 text-body-sm leading-relaxed text-white/50">Katalyst membantu membaca penjualan, profit, margin, stok, dan simulasi harga dari data bisnis Anda.</p></div></div>
            <div class="mt-4 grid gap-2 sm:grid-cols-2">{#each suggestions as suggestion}<button type="button" on:click={() => ask(suggestion)} class="border border-white/10 px-3 py-2.5 text-left text-body-sm text-white/70 hover:bg-white/[0.06]">{suggestion}</button>{/each}</div>
          </div>
        {/if}
        {#each messages as message}
          {#if message.toolName}
            <div class="border border-white/10 bg-white/[0.06] px-4 py-3 text-body-sm text-white/80"><p class="font-medium text-white">{toolLabel(message.toolName)}</p>{#if message.loading}<p class="mt-1 text-white/55">Mengambil data…</p>{:else}<details class="mt-2"><summary class="cursor-pointer text-white/65">Lihat data</summary><pre class="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-white/70">{resultText(message.result)}</pre></details>{/if}</div>
          {:else if message.role === 'user'}
            <div class="flex justify-end"><p class="max-w-[84%] rounded-panel rounded-br-sm bg-status-positive px-4 py-3 text-body-md leading-relaxed text-white">{message.content}</p></div>
          {:else}
            <div class="flex gap-3"><img src="/logo/logo-copilot.png" alt="" class="mt-1 h-7 w-7 shrink-0 rounded object-cover" /><div class="md max-w-[88%] rounded-panel rounded-tl-sm bg-[#F7F1E6] px-4 py-3 text-body-md leading-relaxed text-[#30343B]">{@html renderChatMarkdown(message.content)}</div></div>
          {/if}
        {/each}
      </div>
    </div>
    <form class="shrink-0 border-t border-white/10 px-4 py-4 sm:px-6" on:submit|preventDefault={() => ask()}>
      <div class="mx-auto flex max-w-4xl items-center gap-2 border border-white/15 bg-white/[0.06] p-1.5"><input bind:value={draft} disabled={sending} maxlength="800" placeholder="Tanyakan sesuatu tentang bisnis Anda..." class="min-w-0 flex-1 bg-transparent px-3 py-2 text-body-md text-white outline-none placeholder:text-white/35 disabled:opacity-60" aria-label="Pertanyaan untuk Copilot" /><button type="submit" disabled={sending || !draft.trim()} aria-label="Kirim" class="grid h-9 w-9 place-items-center rounded-panel bg-status-positive text-white disabled:opacity-50"><Send size={16} /></button></div>
    </form>
  </section>
</div>

<style>
  .md :global(p) { margin: 0 0 0.5rem; }
  .md :global(p:last-child) { margin-bottom: 0; }
  .md :global(h3) { margin: 0.75rem 0 0.375rem; font-size: 1rem; font-weight: 600; }
  .md :global(h4) { margin: 0.625rem 0 0.25rem; font-size: 0.9375rem; font-weight: 600; }
  .md :global(ul), .md :global(ol) { margin: 0 0 0.5rem; padding-left: 1.25rem; }
  .md :global(ul) { list-style: disc; }
  .md :global(ol) { list-style: decimal; }
  .md :global(li) { margin: 0.125rem 0; }
  .md :global(code) { padding: 0.05rem 0.3rem; border-radius: 0.25rem; background: rgba(23, 32, 51, 0.08); font-size: 0.875em; }
  .md :global(.md-table) { margin: 0 0 0.5rem; overflow-x: auto; }
  .md :global(table) { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
  .md :global(th), .md :global(td) { border: 1px solid rgba(23, 32, 51, 0.18); padding: 0.375rem 0.625rem; text-align: left; vertical-align: top; }
  .md :global(thead th) { background: rgba(23, 32, 51, 0.07); font-weight: 600; }
  .history.active { border-left-color: #172033; background: rgba(0, 0, 0, 0.045); }
  .scroll-navy { scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.25) transparent; }
  .scroll-navy::-webkit-scrollbar { width: 6px; }
  .scroll-navy::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.25); border-radius: 9999px; }
</style>
