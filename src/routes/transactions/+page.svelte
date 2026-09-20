<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { fmtWita, dayKeyWita, startOfDayWita, addDaysWita } from '$lib/shared/time';
  export let data;
  export let form;

  const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
  // Jam struk tampil WITA (bukan zona lokal browser) biar sama dengan SSR.
  const fmtTime = (d: string | Date) => fmtWita(d, { hour: '2-digit', minute: '2-digit' });

  function dayLabel(d: Date) {
    const todayKey = dayKeyWita(new Date());
    const yesterdayKey = dayKeyWita(addDaysWita(startOfDayWita(new Date()), -1));
    const key = dayKeyWita(d);
    const dateStr = fmtWita(d, { weekday: 'long', day: 'numeric', month: 'long' });
    if (key === todayKey) return `Hari ini · ${dateStr}`;
    if (key === yesterdayKey) return `Kemarin · ${dateStr}`;
    return dateStr;
  }

  // Kelompokkan struk (sudah urut desc dari server) per hari WITA + subtotal.
  // `key` disimpan biar bisa dipakai filter dropdown hari di bawah.
  $: dayGroups = (() => {
    const map = new Map<string, { key: string; label: string; rows: typeof data.receipts; subtotal: number }>();
    for (const t of data.receipts) {
      const d = new Date(t.createdAt);
      const key = dayKeyWita(d);
      if (!map.has(key)) map.set(key, { key, label: dayLabel(d), rows: [], subtotal: 0 });
      const g = map.get(key)!;
      g.rows.push(t);
      g.subtotal += t.total;
    }
    return Array.from(map.values());
  })();

  // Navigasi hari — filter client-side dari struk yang sudah di-load server.
  // Default 'all' biar riwayat tetap kelihatan.
  let selectedDayKey = 'all';
  $: visibleGroups = selectedDayKey === 'all' ? dayGroups : dayGroups.filter((g) => g.key === selectedDayKey);
  $: if (selectedDayKey !== 'all' && dayGroups.length > 0 && !dayGroups.some((g) => g.key === selectedDayKey)) {
    selectedDayKey = 'all';
  }

  // Filter kasir — server-side via ?kasir=<userId> (bukan nama) biar
  // pagination tetap benar. Value userId stabil: staff ganti nama pun
  // struk lamanya tetap keikut, label dropdown selalu nama terkini.
  // Satu sumber kebenaran = URL/server (data.kasir). Select pakai
  // value satu arah (BUKAN bind) biar tidak berantem dengan statement
  // reaktif di bawah — nilai dibaca dari event lalu navigasi.
  $: selectedKasir = data.kasir ?? 'all';
  function goKasir(e: Event) {
    const value = (e.currentTarget as HTMLSelectElement).value;
    const params = new URLSearchParams();
    if (value !== 'all') params.set('kasir', value);
    const qs = params.toString();
    goto(`/transactions${qs ? `?${qs}` : ''}`, { keepFocus: true });
  }
  $: moreHref = `/transactions?page=${data.page + 1}${data.kasir ? `&kasir=${data.kasir}` : ''}`;

  // Ringkasan kanan — mengikuti filter hari yang dipilih, biar kartu
  // di bawah form selalu relevan dan kolom kanan tidak kosong.
  $: visibleTotal = visibleGroups.reduce((s, g) => s + g.subtotal, 0);
  $: visibleCount = visibleGroups.reduce((s, g) => s + g.rows.length, 0);

  // Panel "Transaksi Baru" — keranjang multi-produk di client, disimpan
  // sebagai 1 struk (1 transaction + N item) lewat actions.create.
  // Produk habis (stok 0) tidak bisa dipilih; tambah dibatasi sisa stok
  // (server memvalidasi ulang).
  let selectedProductId = data.products.find((p) => p.stock > 0)?.id ?? '';
  let qty = 1;
  let cart: { productId: string; name: string; price: number; qty: number }[] = [];
  $: selectedProduct = data.products.find((p) => p.id === selectedProductId);
  $: cartTotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  $: cartPayload = JSON.stringify(cart.map((c) => ({ productId: c.productId, qty: c.qty })));

  const afterCreate: SubmitFunction = () => async ({ result, update }) => {
    await update();
    if (result.type === 'success') cart = [];
  };

  // Batalkan struk (OWNER-only di server): pola audit POS — struk salah dibatalkan
  // utuh lalu buat struk koreksi baru, tanpa edit qty in-place.
  $: isOwner = data.user?.role === 'OWNER';
  let pendingVoid: { txId: string; total: number; cashier: string } | null = null;
  const afterVoid: SubmitFunction = () => async ({ result, update }) => {
    await update();
    if (result.type === 'success') pendingVoid = null;
  };

  // Duplikat struk sebagai koreksi: salin item ke keranjang biar owner
  // tinggal sesuaikan qty lalu catat ulang.
  function copyToCart(r: (typeof data.receipts)[number]) {
    for (const it of r.items) {
      const prod = data.products.find((p) => p.id === it.productId);
      const found = cart.find((c) => c.productId === it.productId);
      const price = prod?.sellingPrice ?? it.priceAtSale;
      const nm = prod?.name ?? it.productName;
      cart = found
        ? cart.map((c) => (c.productId === it.productId ? { ...c, qty: c.qty + it.quantity } : c))
        : [...cart, { productId: it.productId, name: nm, price, qty: it.quantity }];
    }
  }

  function addToCart() {
    if (!selectedProduct || selectedProduct.stock <= 0) return;
    const found = cart.find((c) => c.productId === selectedProduct.id);
    const inCart = found?.qty ?? 0;
    const addable = Math.min(qty, selectedProduct.stock - inCart);
    if (addable <= 0) return;
    cart = found
      ? cart.map((c) => (c.productId === selectedProduct.id ? { ...c, qty: c.qty + addable } : c))
      : [...cart, { productId: selectedProduct.id, name: selectedProduct.name, price: selectedProduct.sellingPrice, qty: addable }];
    qty = 1;
  }
  function incLine(id: string) {
    cart = cart.map((c) => (c.productId === id ? { ...c, qty: c.qty + 1 } : c));
  }
  function decLine(id: string) {
    cart = cart.map((c) => (c.productId === id ? { ...c, qty: Math.max(1, c.qty - 1) } : c));
  }
  function removeLine(id: string) {
    cart = cart.filter((c) => c.productId !== id);
  }
</script>

<PageHeader title="Transaksi" />

<!-- Layout 2 kolom: kiri daftar (flex-1) + kanan form (lg:w-80, sticky).
     Di mobile form naik ke atas (order-1) biar gampang tambah tanpa
     scroll lewat list yang panjang. -->
<div class="flex flex-col lg:flex-row gap-6 items-start">
  <div class="flex-1 min-w-0 w-full order-2 lg:order-1">
    <!-- Header bar biru navy yang nyambung langsung ke list di bawahnya:
         rounded atas saja, tanpa margin bawah biar nempel. -->
    <div class="flex flex-wrap items-center justify-between gap-3 bg-ink-navy px-5 py-3 rounded-t-panel border border-ink-navy">
      <h2 class="text-headline-sm text-white">Daftar Transaksi</h2>
      <div class="flex flex-wrap items-center gap-3">
        {#if data.staffOptions.length > 1}
          <label for="t-kasir" class="flex items-center gap-2 text-body-sm text-white/70">
            Kasir
            <select
              id="t-kasir"
              value={selectedKasir}
              on:change={goKasir}
              class="h-9 max-w-40 rounded border border-border-input bg-white px-3 text-body-md text-ink"
            >
              <option value="all">Semua kasir</option>
              {#each data.staffOptions as s}
                <option value={s.id}>{s.name}</option>
              {/each}
            </select>
          </label>
        {/if}
        {#if dayGroups.length > 0}
          <label for="t-day" class="flex items-center gap-2 text-body-sm text-white/70">
            Hari
            <select
              id="t-day"
              bind:value={selectedDayKey}
              class="h-9 rounded border border-border-input bg-white px-3 text-body-md text-ink"
            >
              <option value="all">Semua hari</option>
              {#each dayGroups as g}
                <option value={g.key}>{g.label}</option>
              {/each}
            </select>
          </label>
        {/if}
      </div>
    </div>

    {#if dayGroups.length === 0}
      <Card class="!rounded-t-none !border-t-0 text-center py-10">
        <p class="text-body-md text-muted">Belum ada transaksi.</p>
      </Card>
    {:else if visibleGroups.length === 0}
      <Card class="!rounded-t-none !border-t-0 text-center py-10">
        <p class="text-body-md text-muted">Tidak ada transaksi yang cocok dengan filter.</p>
      </Card>
    {:else}
      <Card class="!p-0 overflow-hidden !rounded-t-none !border-t-0">
        {#each visibleGroups as group}
          <!-- Tiap hari dibungkus blok sendiri: header band gelap di atas,
               subtotal di bawah, dan divider 2px antar hari biar batasnya
               tegas (sebelumnya subtotal #F8FAFC nempel label berikutnya). -->
          <div class="border-b-2 border-border-cool last:border-b-0">
            <div class="flex items-center justify-between gap-3 border-b border-border-cool bg-status-neutral-bg px-5 py-2.5">
              <p class="text-label-md font-semibold uppercase text-ink">{group.label}</p>
              <span class="text-body-sm tabular text-muted whitespace-nowrap">{group.rows.length} struk</span>
            </div>
            <ul>
              {#each group.rows as r}
                <li class="px-5 py-3 text-body-md border-b border-table-divider last:border-b-0">
                  <div class="flex justify-between items-center gap-4">
                    <div class="min-w-0">
                      <p class="text-ink font-semibold tabular whitespace-nowrap">Struk · {fmtTime(r.createdAt)} · {r.cashier}</p>
                      <p class="text-body-sm text-muted">{r.items.reduce((s, i) => s + i.quantity, 0)} item · {r.items.length} jenis produk</p>
                    </div>
                    <span class="tabular font-semibold text-ink whitespace-nowrap">{idr(r.total)}</span>
                  </div>
                  <ul class="mt-1.5 ml-1 flex flex-col gap-0.5">
                    {#each r.items as it}
                      <li class="flex justify-between gap-4 text-body-sm">
                        <span class="text-muted truncate">{it.quantity}× {it.productName}</span>
                        <span class="tabular text-muted whitespace-nowrap">{idr(it.quantity * it.priceAtSale)}</span>
                      </li>
                    {/each}
                  </ul>
                  <div class="flex gap-4 mt-1.5">
                    <button type="button" class="text-body-sm text-ink-navy hover:underline bg-transparent border-none cursor-pointer p-0" on:click={() => copyToCart(r)}>Buat koreksi</button>
                    {#if isOwner}
                      <button type="button" class="text-body-sm font-semibold text-status-negative hover:underline bg-transparent border-none cursor-pointer p-0" on:click={() => (pendingVoid = { txId: r.txId, total: r.total, cashier: r.cashier })}>Batalkan struk</button>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
            <div class="flex justify-between border-t border-border-cool bg-table-header px-5 py-2.5 text-label-md font-semibold text-ink">
              <span>Subtotal</span>
              <span class="tabular">{idr(group.subtotal)}</span>
            </div>
          </div>
        {/each}
      </Card>
      <div class="flex items-center justify-between gap-3 mt-2">
        <p class="text-body-sm text-muted">Halaman {data.page} · {data.receipts.length} struk, dikelompokkan per hari.</p>
        {#if data.hasMore}
          <a href={moreHref} class="text-body-sm font-semibold text-ink-navy hover:underline no-underline">Muat struk lebih lama →</a>
        {/if}
      </div>
      {#if form?.message}<p role="alert" class="rounded border border-status-negative-border bg-status-negative-bg px-3 py-2 text-body-sm text-status-negative mt-2">{form.message}</p>{/if}
    {/if}
  </div>

  <div class="w-full lg:w-80 flex-shrink-0 order-1 lg:order-2 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
    <Card>
        <h2 class="text-headline-sm text-ink mb-3">Transaksi Baru</h2>
        {#if data.products.length === 0}
          <p class="text-body-sm text-muted">Belum ada produk aktif untuk dicatat.</p>
        {:else}
          <label for="t-product" class="flex flex-col gap-1 text-body-md text-ink mb-3">
            Produk
            <select id="t-product" bind:value={selectedProductId} class="h-9 w-full rounded border border-border-input bg-white px-3 text-body-md text-ink">
              {#each data.products as p}
                <option value={p.id} disabled={p.stock <= 0}>{p.name} (sisa {p.stock})</option>
              {/each}
            </select>
          </label>
          <label for="t-qty" class="flex flex-col gap-1 text-body-md text-ink mb-1">Jumlah</label>
          <div class="flex items-center gap-3 mb-3">
            <button type="button" class="h-8 w-8 rounded border border-border-input text-ink font-bold" on:click={() => (qty = Math.max(1, qty - 1))}>−</button>
            <span class="tabular text-body-md w-6 text-center">{qty}</span>
            <button type="button" class="h-8 w-8 rounded border border-border-input text-ink font-bold" on:click={() => (qty += 1)}>+</button>
          </div>
          <Button variant="secondary" class="w-full mb-4" on:click={addToCart} disabled={!selectedProduct}>
            + Tambah produk
          </Button>
          {#if cart.length === 0}
            <p class="text-body-sm text-muted mb-3">Keranjang masih kosong — tambah satu atau beberapa produk dulu.</p>
          {:else}
            <ul class="mb-3 divide-y divide-table-divider rounded border border-border-cool">
              {#each cart as c}
                <li class="px-3 py-2">
                  <div class="flex justify-between items-center gap-2 text-body-md">
                    <p class="text-ink truncate">{c.name}</p>
                    <button type="button" class="text-body-sm text-status-negative hover:underline" on:click={() => removeLine(c.productId)}>Hapus</button>
                  </div>
                  <div class="flex justify-between items-center gap-2 mt-1">
                    <div class="flex items-center gap-2">
                      <button type="button" class="h-7 w-7 rounded border border-border-input text-ink font-bold" on:click={() => decLine(c.productId)}>−</button>
                      <span class="tabular text-body-md w-6 text-center">{c.qty}×</span>
                      <button type="button" class="h-7 w-7 rounded border border-border-input text-ink font-bold" on:click={() => incLine(c.productId)}>+</button>
                    </div>
                    <span class="tabular text-body-md text-ink whitespace-nowrap">{idr(c.price * c.qty)}</span>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
          <div class="flex justify-between items-center py-2 border-t border-dashed border-border-cool mb-3">
            <span class="text-body-sm text-muted">Total</span>
            <strong class="text-headline-sm text-ink tabular">{idr(cartTotal)}</strong>
          </div>
          <form method="POST" action="?/create" use:enhance={afterCreate}>
            <input type="hidden" name="items" value={cartPayload} />
            {#if form?.message}<p role="alert" class="rounded border border-status-negative-border bg-status-negative-bg px-3 py-2 text-body-sm text-status-negative mb-3">{form.message}</p>{/if}
            {#if form?.success}<p role="status" class="rounded border border-status-positive-border bg-status-positive-bg px-3 py-2 text-body-sm text-status-positive mb-3">Transaksi tersimpan.</p>{/if}
            <Button type="submit" class="w-full" disabled={cart.length === 0}>Catat Transaksi</Button>
          </form>
        {/if}
      </Card>

      <!-- CTA sengaja tetap biru (primary #172554): hijau dicadangkan buat
           status semantik positif, bukan aksi utama. Kartu ringkasan ini
           mengisi ruang kosong di bawah form + selalu ngikutin filter hari. -->
      <Card class="mt-4">
        <h2 class="text-headline-sm text-ink mb-1">Ringkasan</h2>
        <p class="text-body-sm text-muted mb-3">
          {selectedDayKey === 'all' ? 'Semua hari yang ditampilkan' : (visibleGroups[0]?.label ?? '')}
        </p>
        <div class="flex justify-between items-center py-1.5 border-b border-table-divider text-body-md">
          <span class="text-muted">Pemasukan</span>
          <strong class="tabular text-ink">{idr(visibleTotal)}</strong>
        </div>
        <div class="flex justify-between items-center py-1.5 text-body-md">
          <span class="text-muted">Struk</span>
          <span class="tabular text-ink">{visibleCount}×</span>
        </div>
      </Card>
  </div>
</div>

{#if pendingVoid}
  <div class="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Konfirmasi batalkan struk">
    <button type="button" class="absolute inset-0 bg-ink/40 border-none cursor-default p-0" aria-label="Batal" on:click={() => (pendingVoid = null)}></button>
    <div class="relative w-full max-w-sm rounded-panel border border-border-cool bg-surface p-5 shadow-level3">
      <h2 class="text-headline-sm text-ink mb-2">Batalkan struk ini?</h2>
      <p class="text-body-md text-muted">Struk {idr(pendingVoid.total)} ({pendingVoid.cashier}) dihapus permanen. Buat struk koreksi baru kalau transaksinya tetap ada tapi salah catat.</p>
      <div class="flex gap-2 mt-4">
        <Button variant="secondary" class="flex-1" on:click={() => (pendingVoid = null)}>Batal</Button>
        <form method="POST" action="?/deleteTx" use:enhance={afterVoid} class="flex-1">
          <input type="hidden" name="txId" value={pendingVoid.txId} />
          <Button variant="destructive" type="submit" class="w-full">Batalkan struk</Button>
        </form>
      </div>
    </div>
  </div>
{/if}