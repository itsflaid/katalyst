<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import ProductTile from '$lib/components/transaksi/ProductTile.svelte';
  import { enhance } from '$app/forms';
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import type { SubmitFunction } from '@sveltejs/kit';
  import Badge from '$lib/components/ui/Badge.svelte';
  import { calculateCart, getDiscountStatus, unitDiscount } from '$lib/discount';
  import { lineNetOf } from '$lib/analytics';
  import { makeTime, DEFAULT_TZ, type BizTime } from '$lib/shared/time';
  import { Search, ChevronDown, Minus, Plus, Trash2, Check, Pencil } from 'lucide-svelte';
  export let data;
  export let form;

  const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
  // Zona bisnis (bukan zona perangkat). T diteruskan eksplisit ke fungsi
  // pembantu karena Svelte 4 tidak melacak variabel yang hanya dirujuk
  // di dalam badan fungsi.
  $: T = makeTime(data.timezone ?? DEFAULT_TZ);
  // Jam struk tampil zona bisnis (bukan zona lokal browser) biar sama dengan SSR.
  const fmtTime = (d: string | Date, T: BizTime) => T.fmt(d, { hour: '2-digit', minute: '2-digit' });

  function dayLabel(d: Date, T: BizTime) {
    const todayKey = T.dayKey(new Date());
    const yesterdayKey = T.dayKey(T.addDays(T.startOfDay(new Date()), -1));
    const key = T.dayKey(d);
    const dateStr = T.fmt(d, { weekday: 'long', day: 'numeric', month: 'long' });
    if (key === todayKey) return `Hari ini · ${dateStr}`;
    if (key === yesterdayKey) return `Kemarin · ${dateStr}`;
    return dateStr;
  }

  // Kelompokkan struk (sudah urut desc dari server) per hari zona bisnis + subtotal.
  // `key` disimpan biar bisa dipakai filter dropdown hari di bawah.
  // T diteruskan sebagai argumen IIFE agar blok reaktif terpicu saat zona berubah.
  $: dayGroups = ((T) => {
    const map = new Map<string, { key: string; label: string; rows: typeof data.receipts; subtotal: number }>();
    for (const t of data.receipts) {
      const d = new Date(t.createdAt);
      const key = T.dayKey(d);
      if (!map.has(key)) map.set(key, { key, label: dayLabel(d, T), rows: [], subtotal: 0 });
      const g = map.get(key)!;
      g.rows.push(t);
      g.subtotal += t.total;
    }
    return Array.from(map.values());
  })(T);

  // Navigasi hari — filter client-side dari struk yang sudah di-load server.
  // Default 'all' biar riwayat tetap kelihatan.
  let selectedDayKey = 'all';
  $: visibleGroups = selectedDayKey === 'all' ? dayGroups : dayGroups.filter((g) => g.key === selectedDayKey);
  $: if (selectedDayKey !== 'all' && dayGroups.length > 0 && !dayGroups.some((g) => g.key === selectedDayKey)) {
    selectedDayKey = 'all';
  }

  // Filter kasir — server-side via ?kasir=<userId> (bukan nama) biar pagination tetap benar. Value userId stabil: staff ganti nama pun struk lamanya tetap keikut.
  // Satu sumber kebenaran = URL/server (data.kasir). Select pakai value satu arah (bukan bind) biar tidak berantem dengan statement reaktif di bawah.
  $: selectedKasir = data.kasir ?? 'all';
  function goKasir(e: Event) {
    const value = (e.currentTarget as HTMLSelectElement).value;
    const params = new URLSearchParams();
    if (value !== 'all') params.set('kasir', value);
    const qs = params.toString();
    goto(`/transactions${qs ? `?${qs}` : ''}`, { keepFocus: true });
  }
  $: moreHref = `/transactions?page=${data.page + 1}${data.kasir ? `&kasir=${data.kasir}` : ''}`;

  // Keranjang multi-produk di client, disimpan sebagai 1 struk (1 transaction + N item) lewat actions.create.
  // State keranjang hanya { productId, qty }; nama & harga diturunkan reaktif dari data.products — bukan snapshot saat ditambahkan (snapshot bikin expectedTotal basi setelah harga berubah → 409 berulang).
  // Produk habis (stok 0) tidak bisa di-tap; tambah dibatasi sisa stok (server memvalidasi ulang).
  let lines: { productId: string; qty: number }[] = [];
  let selectedGlobalId = '';
  let copyMsg = false;
  let copyMsgTimer: ReturnType<typeof setTimeout> | null = null;
  let query = '';
  let gridEl: HTMLDivElement | null = null;

  // Jam server: offset dihitung sekali saat load; semua perhitungan diskon
  // client memakai now ini (diperbarui tiap 30 detik).
  const clockOffset = (data.serverNow ?? Date.now()) - Date.now();
  let tick = 0;
  onMount(() => {
    const iv = setInterval(() => (tick += 1), 30000);
    return () => {
      clearInterval(iv);
      if (copyMsgTimer) clearTimeout(copyMsgTimer);
    };
  });
  // `0 * tick` sengaja merujuk tick agar statement reaktif terpicu tiap
  // interval, tapi nilainya tetap jam akurat (tanpa asumsi interval tepat).
  $: now = new Date(Date.now() + clockOffset + 0 * tick);

  $: prodMap = new Map(data.products.map((p) => [p.id, p]));
  // Diskon server (ISO string → Date). Status dihitung dengan jam offset.
  $: allDiscounts = (data.discounts ?? []).map((d) => ({
    ...d,
    startsAt: new Date(d.startsAt),
    endsAt: d.endsAt ? new Date(d.endsAt) : null,
    createdAt: new Date(d.createdAt)
  }));
  $: activeDiscounts = ((list, now) => list.filter((d) => getDiscountStatus(d, now) === 'ACTIVE'))(allDiscounts, now);
  $: productDiscountPool = activeDiscounts.filter((d) => d.scope === 'PRODUCT');
  $: globalList = activeDiscounts.filter((d) => d.scope === 'GLOBAL');
  $: activeByProduct = ((list) => {
    const m = new Map<string, (typeof list)[number]>();
    for (const d of list) {
      if (d.scope !== 'PRODUCT' || !d.productId) continue;
      const cur = m.get(d.productId);
      if (!cur || d.createdAt > cur.createdAt || (d.createdAt.getTime() === cur.createdAt.getTime() && d.id < cur.id)) {
        m.set(d.productId, d);
      }
    }
    return m;
  })(productDiscountPool);

  // Global terpilih yang tak lagi ACTIVE tidak dipakai (efektif kosong) +
  // notifikasi kecil. Murni turunan tanpa assign-diri (Svelte menolak
  // statement $: yang membaca sekaligus menulis variabel yang sama).
  $: effectiveGlobalId =
    selectedGlobalId !== '' && !globalList.some((g) => g.id === selectedGlobalId) ? '' : selectedGlobalId;
  $: globalExpired = selectedGlobalId !== '' && effectiveGlobalId === '';
  $: selectedGlobal = effectiveGlobalId === '' ? null : (globalList.find((g) => g.id === effectiveGlobalId) ?? null);

  // Produk stok 0 ikut ada di data.products (untuk tile abu-abu), jadi
  // tidak tersedia berarti hilang atau stoknya habis.
  const unavailable = (id: string) => {
    const p = prodMap.get(id);
    return !p || p.stock <= 0;
  };
  $: validLines = lines.filter((l) => !unavailable(l.productId));
  $: missingLines = lines.filter((l) => unavailable(l.productId));
  $: cartInputs = validLines.map((l) => ({ productId: l.productId, qty: l.qty, price: prodMap.get(l.productId)!.sellingPrice }));
  $: cart = ((inputs, pd, g, now) => calculateCart(inputs, { productDiscounts: pd, global: g, now }))(cartInputs, productDiscountPool, selectedGlobal, now);
  $: cartRows = cart.lines.map((l) => ({ ...l, name: prodMap.get(l.productId)?.name ?? '—' }));
  $: discountRows = ((cart) => {
    const m = new Map<string, { name: string; amount: number }>();
    for (const l of cart.lines) {
      if (!l.discountId) continue;
      const e = m.get(l.discountId) ?? { name: l.discountName ?? '', amount: 0 };
      e.amount += l.discountAmount;
      m.set(l.discountId, e);
    }
    return Array.from(m.values());
  })(cart);
  $: cartPayload = JSON.stringify(validLines.map((l) => ({ productId: l.productId, qty: l.qty })));
  $: hasMissing = missingLines.length > 0;

  // Kartu grid: saring nama, stok-ada urut A–Z, habis di akhir.
  // Kuota diskon tidak dihitung di kartu; info parsial tetap di keranjang.
  $: productCards = ((list, by, ls, q) => {
    const needle = q.trim().toLowerCase();
    const inCartOf = new Map(ls.map((l) => [l.productId, l.qty]));
    const out = [];
    for (const p of list) {
      if (needle && !p.name.toLowerCase().includes(needle)) continue;
      const d = by.get(p.id);
      const inCart = inCartOf.get(p.id) ?? 0;
      const limit = p.minStock ?? 5;
      out.push({
        id: p.id,
        name: p.name,
        stock: p.stock,
        sellingPrice: p.sellingPrice,
        netPrice: d ? p.sellingPrice - unitDiscount(p.sellingPrice, d.percent) : p.sellingPrice,
        discountPercent: d ? d.percent : null,
        inCart,
        status: (p.stock <= 0 ? 'habis' : p.stock <= limit ? 'menipis' : 'normal') as 'normal' | 'menipis' | 'habis',
        maxed: inCart >= p.stock
      });
    }
    out.sort((a, b) => {
      const ao = a.stock <= 0 ? 1 : 0;
      const bo = b.stock <= 0 ? 1 : 0;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name, 'id');
    });
    return out;
  })(data.products, activeByProduct, lines, query);

  // Pencarian baru mulai dari baris atas grid.
  $: ((q, el) => {
    if (el) el.scrollTop = 0;
  })(query, gridEl);
  $: todayLabel = T.fmt(now, { day: 'numeric', month: 'short' });
  $: cartItemCount = cart.lines.reduce((s, l) => s + l.qty, 0);

  const afterCreate: SubmitFunction = () => async ({ result, update }) => {
    await update();
    if (result.type === 'success') {
      lines = [];
      copyMsg = false;
    } else if (result.type === 'failure' && (result.status === 409 || result.status === 400)) {
      // Muat ulang produk & diskon (harga/kuota berubah); keranjang dipertahankan.
      await invalidateAll();
    }
  };

  // Notifikasi "Transaksi tersimpan." muncul tiap struk tercatat lalu
  // hilang sendiri setelah 5 detik.
  let showSavedMsg = false;
  let savedMsgTimer: ReturnType<typeof setTimeout> | null = null;
  $: if (form?.success) {
    showSavedMsg = true;
    if (savedMsgTimer) clearTimeout(savedMsgTimer);
    savedMsgTimer = setTimeout(() => (showSavedMsg = false), 5000);
  }

  // Void struk (OWNER-only di server): pola audit POS — struk salah catat
  // dibatalkan utuh lalu buat struk koreksi baru, tanpa edit qty in-place.
  $: isOwner = data.user?.role === 'OWNER';
  let pendingVoid: { txId: string; total: number; cashier: string } | null = null;
  const afterVoid: SubmitFunction = () => async ({ result, update }) => {
    await update();
    if (result.type === 'success') pendingVoid = null;
  };

  // Duplikat struk sebagai koreksi: salin productId + qty saja, diskon
  // dihitung ulang dengan aturan saat ini (bukan snapshot struk lama).
  function copyToCart(r: (typeof data.receipts)[number]) {
    for (const it of r.items) {
      const found = lines.find((c) => c.productId === it.productId);
      lines = found
        ? lines.map((c) => (c.productId === it.productId ? { ...c, qty: c.qty + it.quantity } : c))
        : [...lines, { productId: it.productId, qty: it.quantity }];
    }
    copyMsg = true;
    if (copyMsgTimer) clearTimeout(copyMsgTimer);
    copyMsgTimer = setTimeout(() => (copyMsg = false), 8000);
  }

  function addProduct(productId: string) {
    const p = prodMap.get(productId);
    if (!p || p.stock <= 0) return;
    const inCart = lines.find((c) => c.productId === p.id)?.qty ?? 0;
    if (inCart + 1 > p.stock) return;
    const found = lines.find((c) => c.productId === p.id);
    lines = found
      ? lines.map((c) => (c.productId === p.id ? { ...c, qty: c.qty + 1 } : c))
      : [...lines, { productId: p.id, qty: 1 }];
  }
  function clearCart() {
    lines = [];
  }
  function incLine(id: string) {
    // Dibatasi stok (server tetap memvalidasi ulang).
    const max = prodMap.get(id)?.stock ?? Infinity;
    const cur = lines.find((c) => c.productId === id)?.qty ?? 0;
    if (cur + 1 > max) return;
    lines = lines.map((c) => (c.productId === id ? { ...c, qty: c.qty + 1 } : c));
  }
  function decLine(id: string) {
    lines = lines.map((c) => (c.productId === id ? { ...c, qty: Math.max(1, c.qty - 1) } : c));
  }
  function removeLine(id: string) {
    lines = lines.filter((c) => c.productId !== id);
  }
</script>

<PageHeader title="Transaksi" subtitle="Catat penjualan di kasir" />

<div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
  <section class="min-w-0 lg:col-start-1 lg:row-start-1">
    <Card>
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-headline-sm text-ink">Pilih Produk</h2>
        <span class="hidden text-body-sm text-muted sm:inline">Ketuk produk untuk menambahkan ke kasir</span>
      </div>
      {#if data.products.length > 0}
        <div class="relative mt-3">
          <input
            type="search"
            bind:value={query}
            placeholder="Cari nama produk"
            aria-label="Cari nama produk"
            class="h-10 w-full rounded border border-ink-navy bg-white pl-3 pr-10 text-body-md text-ink placeholder:text-placeholder focus:outline-none focus:ring-2 focus:ring-ink-navy/20"
          />
          <Search size={18} class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-navy" />
        </div>
      {/if}
      {#if data.products.length === 0}
        <p class="mt-3 text-body-md text-muted">Belum ada produk aktif untuk dicatat.</p>
      {:else}
        <div bind:this={gridEl} class="mt-3 max-h-[356px] overflow-y-auto overscroll-contain p-1 -m-1">
          {#if productCards.length === 0}
            <p class="text-body-md text-muted">Produk "{query}" tidak ditemukan.</p>
          {:else}
            <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
              {#each productCards as c (c.id)}
                <ProductTile
                  name={c.name}
                  stock={c.stock}
                  netPrice={c.netPrice}
                  grossPrice={c.sellingPrice}
                  discountPercent={c.discountPercent}
                  status={c.status}
                  inCart={c.inCart}
                  maxed={c.maxed}
                  on:click={() => addProduct(c.id)}
                />
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </Card>
  </section>

  <aside class="min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
    <Card>
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-headline-sm text-ink">Kasir</h2>
        <span class="text-body-sm text-muted">Struk baru · {todayLabel}</span>
      </div>
      <div class="border-b border-border-cool mt-3"></div>
      <div class="mt-3">
        {#if cartRows.length === 0 && missingLines.length === 0}
          <p class="text-body-sm text-muted">Keranjang masih kosong. Ketuk produk di samping untuk menambah.</p>
        {:else}
          <ul class="divide-y divide-table-divider">
            {#each cartRows as c}
              <li class="py-2 first:pt-0 last:pb-0">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate text-body-md font-semibold text-ink">{c.name}</p>
                    <p class="text-body-sm text-muted">{idr(c.price)}/unit</p>
                  </div>
                  <div class="flex shrink-0 items-center gap-1.5">
                    <span class="whitespace-nowrap text-body-md font-semibold tabular text-ink">{idr(c.net)}</span>
                    <button
                      type="button"
                      aria-label="Hapus {c.name}"
                      on:click={() => removeLine(c.productId)}
                      class="grid h-7 w-7 place-items-center rounded text-status-negative hover:bg-status-negative-bg"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {#if c.discountAmount > 0}
                  <div class="mt-0.5 flex items-center gap-2">
                    <s class="text-body-sm tabular text-muted">{idr(c.gross)}</s>
                    <Badge size="sm" tone="positive">Diskon {c.discountPercent}%</Badge>
                  </div>
                  {#if c.partial}
                    <p class="mt-0.5 text-body-sm text-status-warning">Sebagian: {c.discountedQty} dari {c.qty} unit kena diskon.</p>
                  {/if}
                {/if}
                <div class="mt-1 flex items-center justify-between gap-2">
                  <span class="inline-flex items-center rounded border border-border-input">
                    <button
                      type="button"
                      aria-label="Kurangi {c.name}"
                      on:click={() => decLine(c.productId)}
                      class="grid h-7 w-7 place-items-center text-ink hover:bg-table-header"
                    >
                      <Minus size={14} />
                    </button>
                    <span class="min-w-6 text-center text-body-md tabular text-ink">{c.qty}</span>
                    <button
                      type="button"
                      aria-label="Tambah {c.name}"
                      on:click={() => incLine(c.productId)}
                      class="grid h-7 w-7 place-items-center text-ink hover:bg-table-header"
                    >
                      <Plus size={14} />
                    </button>
                  </span>
                </div>
              </li>
            {/each}
            {#each missingLines as m}
              <li class="py-2">
                <div class="flex items-center justify-between gap-2 text-body-md">
                  <p class="text-status-negative">Produk tidak tersedia</p>
                  <button type="button" class="text-body-sm text-status-negative hover:underline" on:click={() => removeLine(m.productId)}>Hapus</button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      {#if globalList.length > 0}
        <label for="t-global" class="mt-4 flex flex-col gap-1">
          <span class="text-label-sm uppercase text-muted">Gunakan diskon</span>
          <select id="t-global" bind:value={selectedGlobalId} class="h-9 w-full rounded border border-border-input bg-white px-3 text-body-md text-ink">
            <option value="">Tanpa diskon</option>
            {#each globalList as g}
              <option value={g.id}>{g.name} — {g.percent}% · s.d. {g.endsAt ? T.fmt(g.endsAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'tanpa batas'}</option>
            {/each}
          </select>
        </label>
        <p class="mb-1 mt-1 text-body-sm text-muted">Tidak menimpa diskon produk.</p>
      {/if}
      {#if globalExpired}
        <p role="status" class="mb-3 rounded border border-status-warning-border bg-status-warning-bg px-3 py-2 text-body-sm text-status-warning">Diskon global yang dipilih sudah tidak berlaku.</p>
      {/if}
      <div class="mt-3 flex flex-col gap-1 border-t border-dashed border-border-cool py-2 text-body-md">
        <div class="flex items-center justify-between">
          <span class="text-body-sm text-muted">Subtotal {cartItemCount} item</span>
          <span class="font-semibold tabular text-ink">{idr(cart.subtotal)}</span>
        </div>
        {#if discountRows.length > 0}
          {#each discountRows as dr}
            <div class="flex items-center justify-between">
              <span class="text-body-sm text-muted">Diskon {dr.name}</span>
              <span class="tabular text-status-positive">−{idr(dr.amount)}</span>
            </div>
          {/each}
        {:else}
          <div class="flex items-center justify-between">
            <span class="text-body-sm text-muted">Diskon</span>
            <span class="tabular text-muted">{idr(0)}</span>
          </div>
        {/if}
      </div>
      <div class="flex items-center justify-between rounded-panel bg-ink-navy px-4 py-3 shadow-level2">
        <span class="text-label-md uppercase text-white/70">Total</span>
        <span class="text-headline-lg tabular text-white">{idr(cart.total)}</span>
      </div>
      <form method="POST" action="?/create" use:enhance={afterCreate} class="mt-3">
        <input type="hidden" name="items" value={cartPayload} />
        <input type="hidden" name="globalDiscountId" value={effectiveGlobalId} />
        <input type="hidden" name="expectedTotal" value={cart.total} />
        {#if copyMsg}<p role="status" class="mb-3 rounded border border-border-cool bg-table-header px-3 py-2 text-body-sm text-muted">Diskon dihitung ulang dengan aturan saat ini.</p>{/if}
        {#if form?.message}<p role="alert" class="mb-3 rounded border border-status-negative-border bg-status-negative-bg px-3 py-2 text-body-sm text-status-negative">{form.message}</p>{/if}
        {#if showSavedMsg}<p role="status" class="mb-3 rounded border border-status-positive-border bg-status-positive-bg px-3 py-2 text-body-sm text-status-positive">Transaksi tersimpan.</p>{/if}
        <Button type="submit" class="w-full bg-status-positive border-status-positive hover:bg-status-positive hover:brightness-95" disabled={validLines.length === 0 || hasMissing}><span class="inline-flex items-center gap-1.5"><Check size={16} />Catat Transaksi</span></Button>
      </form>
      {#if lines.length > 0}
        <div class="mt-2">
          <Button variant="destructive" class="w-full" on:click={clearCart}><span class="inline-flex items-center gap-1.5"><Trash2 size={16} />Kosongkan Keranjang</span></Button>
        </div>
      {/if}
    </Card>
  </aside>

  <section class="min-w-0 lg:col-start-1 lg:row-start-2">
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-t-panel border border-ink-navy bg-ink-navy px-5 py-3">
      <div class="flex flex-col">
        <h2 class="text-headline-sm text-white">Daftar Transaksi</h2>
        <p class="text-body-sm text-white/60">Waktu ditampilkan dalam {T.short}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        {#if data.staffOptions.length > 1}
          <span class="flex h-9 items-center gap-2 rounded border border-white/25 bg-white/10 px-3 text-white">
            <span class="text-label-sm uppercase text-white/60">Kasir</span>
            <span class="relative flex items-center">
              <select
                aria-label="Filter kasir"
                value={selectedKasir}
                on:change={goKasir}
                class="appearance-none border-none bg-transparent py-1 pl-0 pr-5 text-body-md text-white focus:outline-none"
              >
                <option value="all" class="text-ink">Semua kasir</option>
                {#each data.staffOptions as s}
                  <option value={s.id} class="text-ink">{s.name}</option>
                {/each}
              </select>
              <ChevronDown size={14} class="pointer-events-none absolute right-0 text-white/70" />
            </span>
          </span>
        {/if}
        {#if dayGroups.length > 0}
          <span class="flex h-9 items-center gap-2 rounded border border-white/25 bg-white/10 px-3 text-white">
            <span class="text-label-sm uppercase text-white/60">Hari</span>
            <span class="relative flex items-center">
              <select
                aria-label="Filter hari"
                bind:value={selectedDayKey}
                class="appearance-none border-none bg-transparent py-1 pl-0 pr-5 text-body-md text-white focus:outline-none"
              >
                <option value="all" class="text-ink">Semua hari</option>
                {#each dayGroups as g}
                  <option value={g.key} class="text-ink">{g.label}</option>
                {/each}
              </select>
              <ChevronDown size={14} class="pointer-events-none absolute right-0 text-white/70" />
            </span>
          </span>
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
          <div class="border-b-2 border-border-cool last:border-b-0">
            <div class="flex items-center justify-between gap-3 border-b border-border-cool bg-status-neutral-bg px-5 py-2.5">
              <p class="text-label-md font-semibold uppercase text-ink">{group.label}</p>
              <span class="whitespace-nowrap text-body-sm tabular text-muted">{group.rows.length} struk</span>
            </div>
            <ul>
              {#each group.rows as r}
                <li class="border-b border-table-divider px-5 py-3 text-body-md last:border-b-0">
                  <div class="flex items-center justify-between gap-4">
                    <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <p class="truncate font-semibold tabular text-ink">Struk · {fmtTime(r.createdAt, T)} <span class="font-normal text-ink-navy/70">· {r.cashier}</span></p>
                      <span class="shrink-0 rounded border border-border-cool px-1.5 py-px text-label-sm text-muted">{r.items.reduce((s, i) => s + i.quantity, 0)} item · {r.items.length} jenis produk</span>
                    </div>
                    <span class="whitespace-nowrap font-semibold tabular text-ink">{idr(r.total)}</span>
                  </div>
                  <ul class="ml-1 mt-1.5 flex flex-col gap-0.5">
                    {#each r.items as it}
                      <li class="flex justify-between gap-4 text-body-sm">
                        <span class="truncate text-muted">
                          {it.quantity}× {it.productName}
                          {#if it.discountAmount > 0}<span class="text-status-positive"> · Diskon {it.discountName} −{idr(it.discountAmount)}</span>{/if}
                        </span>
                        <span class="whitespace-nowrap tabular text-muted">{idr(lineNetOf(it))}</span>
                      </li>
                    {/each}
                  </ul>
                  <div class="mt-1.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      on:click={() => copyToCart(r)}
                      class="inline-flex items-center gap-1 rounded border-none bg-transparent px-1 py-0.5 text-label-sm text-ink hover:underline"
                    >
                      <Pencil size={13} />Buat koreksi
                    </button>
                    {#if isOwner}
                      <button type="button" class="inline-flex items-center rounded border border-status-negative-border bg-status-negative-bg px-2 py-0.5 text-label-sm text-status-negative hover:brightness-95" on:click={() => (pendingVoid = { txId: r.txId, total: r.total, cashier: r.cashier })}>Void struk</button>
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
      <div class="mt-2 flex items-center justify-between gap-3">
        <p class="text-body-sm text-muted">Halaman {data.page} · {data.receipts.length} struk, dikelompokkan per hari.</p>
        {#if data.hasMore}
          <a href={moreHref} class="text-body-sm font-semibold text-ink-navy hover:underline no-underline">Muat struk lebih lama →</a>
        {/if}
      </div>
      {#if form?.message}<p role="alert" class="mt-2 rounded border border-status-negative-border bg-status-negative-bg px-3 py-2 text-body-sm text-status-negative">{form.message}</p>{/if}
    {/if}
  </section>
</div>

{#if pendingVoid}
  <div class="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Konfirmasi void struk">
    <button type="button" class="absolute inset-0 cursor-default border-none bg-ink/40 p-0" aria-label="Batal" on:click={() => (pendingVoid = null)}></button>
    <div class="relative w-full max-w-sm rounded-panel border border-border-cool bg-surface p-5 shadow-level3">
      <h2 class="text-headline-sm text-ink mb-2">Void struk ini?</h2>
      <p class="text-body-md text-muted">Struk {idr(pendingVoid.total)} ({pendingVoid.cashier}) dihapus permanen. Buat struk koreksi baru kalau transaksinya tetap ada tapi salah catat.</p>
      <div class="flex gap-2 mt-4">
        <Button variant="secondary" class="flex-1" on:click={() => (pendingVoid = null)}>Batal</Button>
        <form method="POST" action="?/deleteTx" use:enhance={afterVoid} class="flex-1">
          <input type="hidden" name="txId" value={pendingVoid.txId} />
          <Button variant="destructive" type="submit" class="w-full">Void struk</Button>
        </form>
      </div>
    </div>
  </div>
{/if}
