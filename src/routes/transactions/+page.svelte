<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import { enhance } from '$app/forms';
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import type { SubmitFunction } from '@sveltejs/kit';
  import Badge from '$lib/components/ui/Badge.svelte';
  import { calculateCart, getDiscountStatus, unitDiscount } from '$lib/discount';
  import { lineNetOf } from '$lib/analytics';
  import { makeTime, DEFAULT_TZ, type BizTime } from '$lib/shared/time';
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

  // visibleTotal    = Σ total bersih (net)
  // visibleDiscount = Σ diskon diberikan
  $: visibleTotal = visibleGroups.reduce((s, g) => s + g.subtotal, 0);
  $: visibleCount = visibleGroups.reduce((s, g) => s + g.rows.length, 0);
  $: visibleDiscount = visibleGroups.reduce((s, g) => s + g.rows.reduce((a, r) => a + (r.discountTotal ?? 0), 0), 0);

  // Panel "Transaksi Baru" — keranjang multi-produk di client, disimpan sebagai 1 struk (1 transaction + N item) lewat actions.create.
  // State keranjang hanya { productId, qty }; nama & harga diturunkan reaktif dari data.products — bukan snapshot saat ditambahkan (snapshot bikin expectedTotal basi setelah harga berubah → 409 berulang).
  // Produk habis (stok 0) tidak bisa dipilih; tambah dibatasi sisa stok (server memvalidasi ulang).
  let selectedProductId = data.products.find((p) => p.stock > 0)?.id ?? '';
  let qty = 1;
  let lines: { productId: string; qty: number }[] = [];
  let selectedGlobalId = '';
  let copyMsg = false;
  let copyMsgTimer: ReturnType<typeof setTimeout> | null = null;

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
  // Label picker: harga sudah termasuk diskon produk bila ada.
  $: productOptions = ((list, by) =>
    list.map((p) => {
      const d = by.get(p.id);
      const label = d
        ? `${p.name} · ${idr(p.sellingPrice - unitDiscount(p.sellingPrice, d.percent))} (−${d.percent}%) · sisa ${p.stock}`
        : `${p.name} · ${idr(p.sellingPrice)} · sisa ${p.stock}`;
      return { ...p, label };
    }))(data.products, activeByProduct);
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

  // Produk yang hilang dari data.products (habis/nonaktif) dikeluarkan dari
  // perhitungan + ditandai merah; tombol Catat mati sampai dihapus.
  $: validLines = lines.filter((l) => prodMap.has(l.productId));
  $: missingLines = lines.filter((l) => !prodMap.has(l.productId));
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

  // Preview baris di bawah picker (aturan sama dengan keranjang).
  $: selectedProduct = prodMap.get(selectedProductId);
  $: previewLine = ((pid, q, price, pd, g, now) =>
    pid && price !== null
      ? calculateCart([{ productId: pid, qty: Math.max(1, Math.floor(Number(q) || 1)), price }], { productDiscounts: pd, global: g, now }).lines[0]
      : null)(selectedProductId, qty, selectedProduct?.sellingPrice ?? null, productDiscountPool, selectedGlobal, now);

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

  // Batalkan struk (OWNER-only di server): pola audit POS — struk salah dibatalkan
  // utuh lalu buat struk koreksi baru, tanpa edit qty in-place.
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

  function addToCart() {
    const p = prodMap.get(selectedProductId);
    if (!p || p.stock <= 0) return;
    const q = Math.max(1, Math.floor(Number(qty) || 1));
    const inCart = lines.find((c) => c.productId === p.id)?.qty ?? 0;
    const addable = Math.min(q, p.stock - inCart);
    if (addable <= 0) return;
    const found = lines.find((c) => c.productId === p.id);
    lines = found
      ? lines.map((c) => (c.productId === p.id ? { ...c, qty: c.qty + addable } : c))
      : [...lines, { productId: p.id, qty: addable }];
    qty = 1;
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

<PageHeader title="Transaksi" />

<!-- Layout 2 kolom: kiri daftar (flex-1) + kanan form (lg:w-80, sticky).
     Di mobile form naik ke atas (order-1) biar gampang tambah tanpa
     scroll lewat list yang panjang. -->
<div class="flex flex-col lg:flex-row gap-6 items-start">
  <div class="flex-1 min-w-0 w-full order-2 lg:order-1">
    <!-- Header bar biru navy yang nyambung langsung ke list di bawahnya:
         rounded atas saja, tanpa margin bawah biar nempel. -->
    <div class="flex flex-wrap items-center justify-between gap-3 bg-ink-navy px-5 py-3 rounded-t-panel border border-ink-navy">
      <div class="flex flex-col">
        <h2 class="text-headline-sm text-white">Daftar Transaksi</h2>
        <p class="text-body-sm text-white/60">Waktu ditampilkan dalam {T.short}</p>
      </div>
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
          <!-- Tiap hari dibungkus blok sendiri: header band gelap di atas, subtotal di bawah, dan divider 2px antar hari biar batasnya tegas. -->
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
                      <p class="text-ink font-semibold tabular whitespace-nowrap">Struk · {fmtTime(r.createdAt, T)} · {r.cashier}</p>
                      <p class="text-body-sm text-muted">{r.items.reduce((s, i) => s + i.quantity, 0)} item · {r.items.length} jenis produk</p>
                    </div>
                    <span class="tabular font-semibold text-ink whitespace-nowrap">{idr(r.total)}</span>
                  </div>
                  <ul class="mt-1.5 ml-1 flex flex-col gap-0.5">
                    {#each r.items as it}
                      <li class="flex justify-between gap-4 text-body-sm">
                        <span class="text-muted truncate">
                          {it.quantity}× {it.productName}
                          {#if it.discountAmount > 0}<span class="text-status-positive"> · Diskon {it.discountName} −{idr(it.discountAmount)}</span>{/if}
                        </span>
                        <span class="tabular text-muted whitespace-nowrap">{idr(lineNetOf(it))}</span>
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

  <div class="w-full lg:w-96 flex-shrink-0 order-1 lg:order-2 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
    <Card>
        <h2 class="text-headline-sm text-ink mb-3">Transaksi Baru</h2>
        {#if data.products.length === 0}
          <p class="text-body-sm text-muted">Belum ada produk aktif untuk dicatat.</p>
        {:else}
          <label for="t-product" class="flex flex-col gap-1 text-body-md text-ink mb-3">
            Produk
            <select id="t-product" bind:value={selectedProductId} class="h-9 w-full rounded border border-border-input bg-white px-3 text-body-md text-ink">
              {#each productOptions as p}
                <option value={p.id} disabled={p.stock <= 0}>{p.label}</option>
              {/each}
            </select>
          </label>
          <label for="t-qty" class="flex flex-col gap-1 text-body-md text-ink mb-1">Jumlah</label>
          <div class="flex items-center gap-3 mb-1">
            <button type="button" class="h-8 w-8 rounded border border-border-input text-ink font-bold" on:click={() => (qty = Math.max(1, Math.floor(Number(qty) || 1) - 1))}>−</button>
            <input
              type="number"
              id="t-qty"
              bind:value={qty}
              min="1"
              max={selectedProduct ? Math.max(1, selectedProduct.stock - (lines.find((l) => l.productId === selectedProduct.id)?.qty ?? 0)) : 1}
              class="h-8 w-16 rounded border border-border-input bg-white px-2 text-body-md tabular text-ink text-center"
            />
            <button type="button" class="h-8 w-8 rounded border border-border-input text-ink font-bold" on:click={() => (qty = Math.max(1, Math.floor(Number(qty) || 1) + 1))}>+</button>
          </div>
          {#if previewLine}
            <div class="text-body-sm text-muted mb-3">
              {previewLine.qty} × {idr(previewLine.price)} =
              {#if previewLine.discountAmount > 0}
                <s>{idr(previewLine.gross)}</s>
                <strong class="text-ink">{idr(previewLine.net)}</strong>
                <span class="text-status-positive">hemat {idr(previewLine.discountAmount)}</span>
                {#if previewLine.partial}
                  <span> · {previewLine.discountedQty} dari {previewLine.qty} unit kena diskon (kuota habis)</span>
                {/if}
              {:else}
                <strong class="text-ink">{idr(previewLine.gross)}</strong>
              {/if}
            </div>
          {/if}
          <Button variant="secondary" class="w-full mb-4" on:click={addToCart} disabled={!selectedProduct}>
            + Tambah produk
          </Button>
          {#if globalList.length > 0}
            <label for="t-global" class="flex flex-col gap-1 text-body-md text-ink mb-1">
              Gunakan diskon
              <select id="t-global" bind:value={selectedGlobalId} class="h-9 w-full rounded border border-border-input bg-white px-3 text-body-md text-ink">
                <option value="">Tanpa diskon global</option>
                {#each globalList as g}
                  <option value={g.id}>{g.name} — {g.percent}% · s.d. {g.endsAt ? T.fmt(g.endsAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'tanpa batas'}</option>
                {/each}
              </select>
            </label>
            <p class="text-body-sm text-muted mb-3">Tidak menimpa diskon produk.</p>
          {/if}
          {#if globalExpired}
            <p role="status" class="rounded border border-status-warning-border bg-status-warning-bg px-3 py-2 text-body-sm text-status-warning mb-3">Diskon global yang dipilih sudah tidak berlaku.</p>
          {/if}
          {#if cartRows.length === 0 && missingLines.length === 0}
            <p class="text-body-sm text-muted mb-3">Keranjang masih kosong — tambah satu atau beberapa produk dulu.</p>
          {:else}
            <ul class="mb-3 divide-y divide-table-divider rounded border border-border-cool">
              {#each cartRows as c}
                <li class="px-3 py-2">
                  <div class="flex justify-between items-center gap-2 text-body-md">
                    <p class="text-ink truncate">{c.name}</p>
                    <button type="button" class="text-body-sm text-status-negative hover:underline" on:click={() => removeLine(c.productId)}>Hapus</button>
                  </div>
                  {#if c.discountAmount > 0}
                    <div class="flex items-center gap-2 mt-0.5">
                      <s class="text-body-sm text-muted tabular">{idr(c.gross)}</s>
                      <Badge size="sm" tone="positive">Diskon {c.discountPercent}%</Badge>
                    </div>
                    {#if c.partial}
                      <p class="text-body-sm text-status-warning mt-0.5">Sebagian: {c.discountedQty} dari {c.qty} unit kena diskon.</p>
                    {/if}
                  {/if}
                  <div class="flex justify-between items-center gap-2 mt-1">
                    <div class="flex items-center gap-2">
                      <button type="button" class="h-7 w-7 rounded border border-border-input text-ink font-bold" on:click={() => decLine(c.productId)}>−</button>
                      <span class="tabular text-body-md w-6 text-center">{c.qty}×</span>
                      <button type="button" class="h-7 w-7 rounded border border-border-input text-ink font-bold" on:click={() => incLine(c.productId)}>+</button>
                    </div>
                    <span class="tabular text-body-md text-ink whitespace-nowrap">{idr(c.net)}</span>
                  </div>
                </li>
              {/each}
              {#each missingLines as m}
                <li class="px-3 py-2">
                  <div class="flex justify-between items-center gap-2 text-body-md">
                    <p class="text-status-negative">Produk tidak tersedia</p>
                    <button type="button" class="text-body-sm text-status-negative hover:underline" on:click={() => removeLine(m.productId)}>Hapus</button>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
          <div class="flex flex-col gap-1 py-2 border-t border-dashed border-border-cool mb-3 text-body-md">
            <div class="flex justify-between items-center">
              <span class="text-body-sm text-muted">Subtotal</span>
              <span class="tabular text-ink">{idr(cart.subtotal)}</span>
            </div>
            {#each discountRows as dr}
              <div class="flex justify-between items-center">
                <span class="text-body-sm text-muted">Diskon {dr.name}</span>
                <span class="tabular text-status-positive">−{idr(dr.amount)}</span>
              </div>
            {/each}
            <div class="flex justify-between items-center">
              <span class="text-body-sm text-muted">Total</span>
              <strong class="text-headline-sm text-ink tabular">{idr(cart.total)}</strong>
            </div>
          </div>
          <form method="POST" action="?/create" use:enhance={afterCreate}>
            <input type="hidden" name="items" value={cartPayload} />
            <input type="hidden" name="globalDiscountId" value={effectiveGlobalId} />
            <input type="hidden" name="expectedTotal" value={cart.total} />
            {#if copyMsg}<p role="status" class="rounded border border-border-cool bg-table-header px-3 py-2 text-body-sm text-muted mb-3">Diskon dihitung ulang dengan aturan saat ini.</p>{/if}
            {#if form?.message}<p role="alert" class="rounded border border-status-negative-border bg-status-negative-bg px-3 py-2 text-body-sm text-status-negative mb-3">{form.message}</p>{/if}
            {#if showSavedMsg}<p role="status" class="rounded border border-status-positive-border bg-status-positive-bg px-3 py-2 text-body-sm text-status-positive mb-3">Transaksi tersimpan.</p>{/if}
            <Button type="submit" class="w-full" disabled={validLines.length === 0 || hasMissing}>Catat Transaksi</Button>
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
        {#if visibleDiscount > 0}
          <div class="flex justify-between items-center py-1.5 border-b border-table-divider text-body-md">
            <span class="text-muted">Diskon diberikan</span>
            <span class="tabular text-status-positive">−{idr(visibleDiscount)}</span>
          </div>
        {/if}
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
