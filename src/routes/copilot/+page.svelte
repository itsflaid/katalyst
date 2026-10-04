<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount, tick } from 'svelte';
  import { ChevronRight, Plus, Send } from 'lucide-svelte';

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
    messages: ChatMessage[];
  }

  const storageKey = 'katalyst-copilot-conversations-v1';
  const suggestions = ['Omzet minggu ini berapa?', 'Produk paling laku bulan ini?', 'Kenapa profit turun?', 'Stok apa yang menipis?'];
  let conversations: Conversation[] = [];
  let activeId = '';
  let messages: ChatMessage[] = [];
  let draft = '';
  let sending = false;
  let ready = false;
  let scrollTarget: HTMLDivElement;

  $: if (ready && browser) localStorage.setItem(storageKey, JSON.stringify(conversations));

  onMount(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      conversations = saved ? JSON.parse(saved) : [];
    } catch {
      conversations = [];
    }
    if (conversations.length > 0) openConversation(conversations[0].id);
    else createConversation();
    ready = true;
  });

  function newId() {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  }

  function createConversation() {
    const conversation: Conversation = { id: newId(), title: 'Percakapan baru', updatedAt: Date.now(), messages: [] };
    conversations = [conversation, ...conversations];
    activeId = conversation.id;
    messages = [];
    draft = '';
  }

  function openConversation(conversationId: string) {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;
    activeId = conversation.id;
    messages = conversation.messages;
  }

  function sync(title?: string) {
    conversations = conversations
      .map((conversation) => conversation.id === activeId ? { ...conversation, title: title ?? conversation.title, updatedAt: Date.now(), messages } : conversation)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function addMessage(message: ChatMessage) {
    messages = [...messages, message];
    sync();
    void scrollToBottom();
  }

  async function scrollToBottom() {
    await tick();
    scrollTarget?.scrollTo({ top: scrollTarget.scrollHeight, behavior: 'smooth' });
  }

  function updateToolMessage(messageId: string, result: ToolResult) {
    messages = messages.map((message) => message.id === messageId ? { ...message, result, loading: false } : message);
    sync();
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
    addMessage({ id: newId(), role: 'user', content: question });
    sync(messages.filter((message) => message.role === 'user').length === 1 ? question.slice(0, 52) : undefined);
    sending = true;
    try {
      const payload = messages.filter((message) => !message.toolName && message.content).slice(-6).map((message) => ({ role: message.role, content: message.content }));
      const response = await fetch('/copilot/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: payload }) });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Copilot tidak dapat memproses pertanyaan ini.');
      }
      await readStream(response.body);
    } catch (error) {
      addMessage({ id: newId(), role: 'assistant', content: error instanceof Error ? error.message : 'Copilot sedang bermasalah. Coba lagi sebentar.' });
    } finally {
      sending = false;
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
    if (event === 'tool_start') {
      const messageId = newId();
      toolMessages.set(String(data.id), messageId);
      addMessage({ id: messageId, role: 'assistant', content: '', toolName: String(data.name), loading: true });
    } else if (event === 'tool_result') {
      const messageId = toolMessages.get(String(data.id));
      if (messageId) updateToolMessage(messageId, data.result as ToolResult);
    } else if (event === 'text' && typeof data.text === 'string') {
      addMessage({ id: newId(), role: 'assistant', content: data.text });
    } else if ((event === 'notice' || event === 'error') && typeof data.message === 'string') {
      addMessage({ id: newId(), role: 'assistant', content: data.message });
    }
  }
</script>

<div class="flex -m-8 h-screen min-h-[560px] overflow-hidden bg-[#F7F1E6]">
  <aside class="hidden w-72 shrink-0 flex-col border-r border-border-warm bg-[#F7F1E6] lg:flex">
    <div class="flex items-center justify-between px-5 pb-4 pt-5">
      <div><h1 class="text-headline-sm text-ink">Katalyst Copilot</h1><p class="mt-1 text-body-sm text-muted">Riwayat percakapan</p></div>
      <button type="button" on:click={createConversation} class="grid h-8 w-8 place-items-center rounded-panel border border-border-warm text-ink hover:bg-black/[0.04]" aria-label="Percakapan baru"><Plus size={16} /></button>
    </div>
    <div class="flex-1 overflow-y-auto px-3">
      {#each conversations as conversation}
        <button type="button" on:click={() => openConversation(conversation.id)} class:active={conversation.id === activeId} class="history group mb-1 flex w-full items-center gap-2 border-l-2 border-transparent px-3 py-3 text-left hover:bg-black/[0.025]">
          <span class="min-w-0 flex-1 truncate text-body-sm text-ink">{conversation.title}</span><ChevronRight size={15} class="shrink-0 text-muted/50 group-hover:translate-x-0.5" />
        </button>
      {/each}
    </div>
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
            <div class="flex gap-3"><img src="/logo/logo-copilot.png" alt="" class="mt-1 h-7 w-7 shrink-0 rounded object-cover" /><div class="max-w-[88%] rounded-panel rounded-tl-sm bg-[#F7F1E6] px-4 py-3 text-body-md leading-relaxed text-[#30343B]">{message.content}</div></div>
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
  .history.active { border-left-color: #172033; background: rgba(0, 0, 0, 0.045); }
  .scroll-navy { scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.25) transparent; }
  .scroll-navy::-webkit-scrollbar { width: 6px; }
  .scroll-navy::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.25); border-radius: 9999px; }
</style>
