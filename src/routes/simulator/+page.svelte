<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Tooltip from '$lib/components/ui/Tooltip.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import { goto } from '$app/navigation';
  import { sanitizeLevers, simulate } from '$lib/simulation';
  import { ZERO_FACTS } from '$lib/analytics';
  export let data;

  type BadgeTone = 'positive' | 'warning' | 'negative' | 'neutral';
  interface Verdict {
    tone: BadgeTone;
    title: string;
    desc: string;
  }

  // Formatter dibuat sekali di level modul — sebelumnya new
  // Intl.NumberFormat tiap pemanggilan idr()/num(), padahal dipanggil
  // puluhan kali tiap render + tiap geser slider.
  const idrFmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  const numFmt = new Intl.NumberFormat('id-ID');
  const idr = (n: number) => idrFmt.format(n);
  const num = (n: number) => numFmt.format(n);
  const fmtDeltaPct = (v: number | null) =>
    v === null ? 'dari nol' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
  const fmtPoin = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)} pp`;
  const toneOf = (v: number | null) => (v === null ? 'neutral' : v >= 0 ? 'positive' : 'negative') as BadgeTone;

  // Produk awal: hormati ?productId= (deep-link dari halaman Produk).
  const initial = data.products.find((p) => p.id === data.preselectedProductId) ?? data.products[0] ?? null;
  let productId: string = initial?.id ?? '';
  let priceValue: number = initial?.sellingPrice ?? 0;
  let costValue: number = initial?.costPrice ?? 0;
  // Tuas diskon tiga-keadaan: 'keep' = sesuai histori (default, identitas
  // tepat); menggeser slider/mengetik ⇒ 'percent'.
  let discountMode: 'keep' | 'percent' = 'keep';
  let discountPct = 0;
  let volPct = 0;
  let qtyOverride = '';

  // Rentang baseline: hari ini / minggu ini / bulan ini / semua / custom.
  // Default bulan ini (dari server) biar load awal ringan — 'Semua'
  // tetap tersedia sebagai opt-in. Ganti rentang = reload server (goto)
  // biar agregat dihitung ulang dari transaction.created_at.
  // Hitungan live di bawah sengaja di client (responsif tiap geser tuas);
  // rumusnya SAMA dengan lib/simulation.ts (satu fungsi simulate).
  let activeRange: string = data.range ?? 'month';
  let fromInput: string = data.rangeFrom ?? '';
  let toInput: string = data.rangeTo ?? '';

  function goWithRange(key: string, from = '', to = '') {
    activeRange = key;
    const u = new URL(window.location.href);
    u.searchParams.set('range', key);
    if (key === 'custom') {
      if (from) u.searchParams.set('from', from);
      else u.searchParams.delete('from');
      if (to) u.searchParams.set('to', to);
      else u.searchParams.delete('to');
    } else {
      u.searchParams.delete('from');
      u.searchParams.delete('to');
    }
    if (productId) u.searchParams.set('productId', productId);
    goto(u.toString(), { invalidateAll: true });
  }

  function applyCustom() {
    if (!fromInput && !toInput) return;
    if (fromInput && toInput && fromInput > toInput) {
      const t = fromInput;
      fromInput = toInput;
      toInput = t;
    }
    showCustomModal = false;
    goWithRange('custom', fromInput, toInput);
  }

  let showCustomModal = false;
  function openCustomModal() {
    fromInput = data.rangeFrom ?? fromInput;
    toInput = data.rangeTo ?? toInput;
    showCustomModal = true;
  }

  $: prod = data.products.find((p) => p.id === productId) ?? data.products[0] ?? null;
  $: base = (prod && data.baselines.find((b) => b.productId === prod.id)) ?? {
    productId: '',
    qty: 0,
    revenue: 0,
    cost: 0,
    profit: 0,
    margin: 0,
    txCount: 0,
    facts: { ...ZERO_FACTS }
  };

  $: sellBase = prod?.sellingPrice ?? 0;
  $: costBase = prod?.costPrice ?? 0;
  $: histQty = base.qty;

  $: pricePct = sellBase === 0 ? 0 : ((priceValue - sellBase) / sellBase) * 100;
  $: costPct = costBase === 0 ? 0 : ((costValue - costBase) / costBase) * 100;

  $: overrideQty =
    qtyOverride.trim() === '' ? null : Math.max(0, Math.floor(Number(qtyOverride) || 0));

  // SATU-SATUNYA hitungan simulasi — tak ada rumus lokal lagi.
  $: result = simulate({
    baseline: base.facts,
    product: { sellingPrice: sellBase, costPrice: costBase },
    levers: sanitizeLevers({
      price: priceValue,
      cost: costValue,
      discount: discountMode === 'keep' ? { kind: 'keep' } : { kind: 'percent', pct: discountPct },
      volume: overrideQty !== null ? { kind: 'override', qty: overrideQty } : { kind: 'pct', pct: volPct }
    })
  });

  $: simQty = result.qty.simulated;
  $: effPrice = result.simulated.avgNetPrice;
  $: unitProfit = result.unit.unitProfit;

  // Delta utama & verdict = dibanding KONDISI SEKARANG (bukan aktual).
  $: revDelta = result.impact.vsStatusQuo.revenue;
  $: profitDelta = result.impact.vsStatusQuo.profit;
  $: volDelta = result.impact.vsStatusQuo.qty;
  $: marginPts = result.impact.vsStatusQuo.marginPoints;
  $: histRatePct = (result.actual.discountRate * 100).toFixed(1);

  // Qty impas & diskon maks dari engine (integer; null = mustahil/tak tentu).
  // (Deklarasi `let` + assign reaktif terpisah — Svelte tidak mengizinkan
  // anotasi tipe langsung di statement `$:`.)
  let breakEvenQty: number | null = 0;
  let maxDiscount: number | null = null;
  let verdict: Verdict = { tone: 'neutral', title: '', desc: '' };
  let assumptions: string[] = [];
  $: breakEvenQty = result.breakEvenQty;
  $: maxDiscount = result.maxDiscountPct;

  $: verdict =
    simQty === 0
      ? { tone: 'neutral', title: 'Belum ada volume', desc: 'Isi override quantity atau pastikan produk punya histori penjualan.' }
      : unitProfit < 0
        ? { tone: 'negative', title: 'Tiap unit merugi', desc: `Harga efektif ${idr(effPrice)} di bawah modal ${idr(costValue)} — skenario ini rugi di setiap unit.` }
        : (profitDelta ?? 0) >= 0.05 && marginPts >= -0.02
          ? { tone: 'positive', title: 'Skenario menguntungkan', desc: `Profit ${fmtDeltaPct(profitDelta)} dibanding kondisi sekarang dengan margin terjaga di ${(result.simulated.margin * 100).toFixed(1)}%.` }
          : (profitDelta ?? 0) <= -0.05 || result.simulated.margin < 0
            ? { tone: 'negative', title: 'Skenario merugikan', desc: `Profit ${fmtDeltaPct(profitDelta)} dibanding kondisi sekarang dan margin ${fmtPoin(marginPts)} — pertimbangkan ulang tuasnya.` }
            : { tone: 'warning', title: 'Dampak netral', desc: 'Perubahan kecil terhadap profit dibanding kondisi sekarang. Coba geser tuas lebih jauh atau ubah volume.' };

  $: assumptions = [
    `Baseline memakai rentang: ${data.rangeLabel ?? 'Semua waktu'}.`,
    overrideQty !== null
      ? `Quantity memakai angka manual: ${num(simQty)} unit.`
      : `Quantity mengikuti histori ${histQty === 0 ? '— produk ini belum pernah terjual pada rentang ini' : `disesuaikan ${volPct >= 0 ? '+' : ''}${volPct}%`}: ${num(simQty)} unit.`,
    ...(result.flags.includes('NO_HISTORY')
      ? ['Tidak ada data transaksi pada rentang ini untuk produk ini — hasil simulasi kurang bisa diandalkan. Isi quantity manual atau ganti rentang.']
      : []),
    ...(result.flags.includes('DISCOUNT_ON_CHANGED_PRICE')
      ? ['Diskon diterapkan di atas harga jual skenario, bukan harga jual saat ini.']
      : []),
    ...(result.flags.includes('LOW_MARGIN')
      ? ['Margin simulasi di bawah 15% — waspada terhadap biaya tak terduga.']
      : []),
    ...(result.flags.includes('BELOW_COST')
      ? ['Harga efektif di bawah modal — tiap unit menambah kerugian.']
      : []),
    ...(base.txCount > 0 ? [`Baseline dari ${num(base.txCount)} transaksi tercatat.`] : [])
  ];
  $: driftNote =
    result.flags.includes('DRIFT_PRICE') || result.flags.includes('DRIFT_COST')
      ? `Catatan netral: harga rata-rata terjual periode ini ${idr(result.actual.avgGrossPrice)} (modal ${idr(result.actual.avgCost)}), harga sekarang ${idr(sellBase)} (modal ${idr(costBase)}). Selisihnya bukan efek tuas.`
      : null;

  // Lebar bar perbandingan (relatif ke nilai terbesar, min 2% biar kelihatan).
  // Basis bar = kondisi SEKARANG (bukan aktual).
  $: sqRev = result.statusQuo.revenue;
  $: sqProfit = result.statusQuo.profit;
  $: sqMargin = result.statusQuo.margin;
  $: maxRev = Math.max(sqRev, result.simulated.revenue, 1);
  $: maxProfit = Math.max(sqProfit, result.simulated.profit, 1);
  $: maxQty = Math.max(histQty, simQty, 1);
  const w = (v: number, max: number) => `${Math.max(2, (v / max) * 100).toFixed(1)}%`;

  // Jembatan ke /diskon: persen simulasi dijadikan draf diskon produk yang
  // dihitung dari harga jual SAAT INI — makanya tombol aktif hanya bila tuas
  // harga jual tidak diubah. Baseline week/month parsial (Senin–sekarang /
  // tgl 1–sekarang), jadi kuota dari simQty hanyalah saran awal.
  function goToDiscount() {
    if (!prod || discountMode !== 'percent' || discountPct <= 0 || priceValue !== sellBase) return;
    const params = new URLSearchParams({
      new: '1',
      productId: prod.id,
      percent: String(Math.round(discountPct))
    });
    if (simQty > 0) params.set('quota', String(simQty));
    const preset = data.range === 'today' ? 'TODAY' : data.range === 'week' ? 'DAYS_7' : null;
    if (preset) params.set('preset', preset);
    if (data.rangeLabel) params.set('baseline', data.rangeLabel);
    goto(`/diskon?${params.toString()}`);
  }
  $: discountActive = discountMode === 'percent' && discountPct > 0 && priceValue === sellBase && !!prod;

  function selectProduct(id: string) {
    const p = data.products.find((x) => x.id === id);
    if (!p) return;
    productId = p.id;
    priceValue = p.sellingPrice;
    costValue = p.costPrice;
    discountMode = 'keep';
    discountPct = 0;
    volPct = 0;
    qtyOverride = '';
    const u = new URL(window.location.href);
    u.searchParams.set('productId', p.id);
    history.replaceState(null, '', u);
  }

  function resetLevers() {
    if (!prod) return;
    priceValue = prod.sellingPrice;
    costValue = prod.costPrice;
    discountMode = 'keep';
    discountPct = 0;
    volPct = 0;
    qtyOverride = '';
  }

  const setNum = (e: Event, apply: (v: number) => void) => {
    const raw = (e.target as HTMLInputElement).value;
    apply(raw === '' ? 0 : Math.max(0, Number(raw) || 0));
  };
  const sliderVal = (e: Event) => Number((e.target as HTMLInputElement).value);
  const onProductChange = (e: Event) => selectProduct((e.target as HTMLSelectElement).value);
  const onPricePct = (e: Event) => applyPricePct(sliderVal(e));
  const onCostPct = (e: Event) => applyCostPct(sliderVal(e));
  const onDiscount = (e: Event) => {
    discountMode = 'percent';
    discountPct = sliderVal(e);
  };
  const onDiscountNum = (e: Event) => {
    discountMode = 'percent';
    setNum(e, (v) => (discountPct = v));
  };
  const backToHist = () => {
    discountMode = 'keep';
  };
  const applyPricePct = (p: number) => {
    priceValue = Math.max(0, Math.round(sellBase * (1 + p / 100)));
  };
  const applyCostPct = (p: number) => {
    costValue = Math.max(0, Math.round(costBase * (1 + p / 100)));
  };

  function preset(kind: 'naik10' | 'diskon15' | 'modal8' | 'gudang') {
    if (!prod) return;
    resetLevers();
    if (kind === 'naik10') priceValue = Math.round(prod.sellingPrice * 1.1);
    if (kind === 'diskon15') {
      discountMode = 'percent';
      discountPct = 15;
      volPct = 30;
    }
    if (kind === 'modal8') costValue = Math.round(prod.costPrice * 0.92);
    if (kind === 'gudang') {
      discountMode = 'percent';
      discountPct = 30;
      volPct = 60;
    }
  }
</script>

<PageHeader title="Simulator “What-if”" subtitle="Lab skenario satu produk — geser tuasnya, hasilnya terhitung otomatis dari data historimu." />

<Card class="mb-6">
  <div class="flex flex-wrap items-center gap-2">
    <span class="text-label-md text-ink mr-1">Baseline:</span>
    <button type="button" on:click={() => goWithRange('today')} class="rounded border px-2.5 py-1.5 text-body-sm {activeRange === 'today' ? 'border-ink-navy bg-ink-navy text-white font-semibold' : 'border-border-input bg-white text-ink hover:bg-table-header'}">Hari ini</button>
    <button type="button" on:click={() => goWithRange('week')} class="rounded border px-2.5 py-1.5 text-body-sm {activeRange === 'week' ? 'border-ink-navy bg-ink-navy text-white font-semibold' : 'border-border-input bg-white text-ink hover:bg-table-header'}">Minggu ini</button>
    <button type="button" on:click={() => goWithRange('month')} class="rounded border px-2.5 py-1.5 text-body-sm {activeRange === 'month' ? 'border-ink-navy bg-ink-navy text-white font-semibold' : 'border-border-input bg-white text-ink hover:bg-table-header'}">Bulan ini</button>
    <button type="button" on:click={() => goWithRange('all')} class="rounded border px-2.5 py-1.5 text-body-sm {activeRange === 'all' ? 'border-ink-navy bg-ink-navy text-white font-semibold' : 'border-border-input bg-white text-ink hover:bg-table-header'}">Semua</button>
    <button type="button" on:click={openCustomModal} class="rounded border px-2.5 py-1.5 text-body-sm border-status-positive bg-status-positive text-white font-semibold hover:opacity-90 {activeRange === 'custom' ? 'ring-2 ring-status-positive/40 ring-offset-1 ring-offset-white' : ''}">Custom</button>
    {#if data.rangeLabel}
      <span class="text-body-sm text-muted ml-auto">Dipakai: <strong class="text-ink">{data.rangeLabel}</strong></span>
    {/if}
  </div>
</Card>

{#if showCustomModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Atur rentang custom">
    <button type="button" class="absolute inset-0 bg-ink/40 border-none cursor-default p-0" aria-label="Tutup" on:click={() => (showCustomModal = false)}></button>
    <div class="relative w-full max-w-sm rounded-panel border border-border-cool bg-surface p-5 shadow-level3">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-headline-sm text-ink">Rentang custom</h2>
        <button type="button" on:click={() => (showCustomModal = false)} class="text-muted hover:text-ink text-body-lg leading-none bg-transparent border-none cursor-pointer" aria-label="Tutup">✕</button>
      </div>
      <div class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-body-sm text-muted">
          Dari
          <input type="date" bind:value={fromInput} max={toInput || undefined} class="h-9 rounded border border-border-input bg-white px-2.5 text-body-md text-ink focus:outline-none focus:border-ink-navy" />
        </label>
        <label class="flex flex-col gap-1 text-body-sm text-muted">
          Sampai
          <input type="date" bind:value={toInput} min={fromInput || undefined} class="h-9 rounded border border-border-input bg-white px-2.5 text-body-md text-ink focus:outline-none focus:border-ink-navy" />
        </label>
        {#if !fromInput && !toInput}
          <p class="text-body-sm text-muted">Isi minimal satu tanggal dulu.</p>
        {/if}
      </div>
      <div class="flex justify-end gap-2 mt-5">
        <Button variant="secondary" size="compact" on:click={() => (showCustomModal = false)}>Batal</Button>
        <Button size="compact" on:click={applyCustom}>Terapkan</Button>
      </div>
    </div>
  </div>
{/if}

{#if !prod}
  <Card class="text-center py-10">
    <p class="text-body-md text-muted">Belum ada produk. Tambahkan dulu sebelum bersimulasi.</p>
    <a href="/products" class="text-body-md font-semibold text-status-positive hover:underline no-underline">Ke halaman Produk →</a>
  </Card>
{:else}
  <div class="grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] gap-6 items-start">
    <!-- KIRI: meja kontrol -->
    <div class="flex flex-col gap-4 lg:sticky lg:top-6">
      <Card>
        <label for="sim-product" class="flex flex-col gap-1.5">
          <span class="flex items-center justify-between text-label-md text-ink">
            Produk
            <Tooltip text="Pilih produk yang mau disimulasikan perubahan harga, biaya, diskon, atau volumenya." />
          </span>
          <select
            id="sim-product"
            value={productId}
            on:change={onProductChange}
            class="h-9 w-full rounded border border-border-input bg-white px-3 text-body-md text-ink focus:outline-none focus:border-ink-navy focus:ring-2 focus:ring-ink-navy/15"
          >
            {#each data.products as p}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </label>
        <div class="grid grid-cols-2 gap-2 mt-3">
          <div class="rounded border border-border-cool px-2.5 py-2">
            <p class="text-label-sm uppercase text-muted">Jual · Modal</p>
            <p class="text-num-cell text-ink tabular">{idr(sellBase)} · {idr(costBase)}</p>
          </div>
          <div class="rounded border border-border-cool px-2.5 py-2">
            <p class="text-label-sm uppercase text-muted">Histori</p>
            <p class="text-num-cell text-ink tabular">{num(histQty)} unit · {num(base.txCount)} trx</p>
          </div>
        </div>
      </Card>

      <Card>
        <p class="text-label-md text-ink mb-2">Skenario cepat</p>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" on:click={() => preset('naik10')} class="rounded border border-border-input bg-white px-2.5 py-2 text-body-sm text-ink hover:bg-table-header text-left">Harga +10%</button>
          <button type="button" on:click={() => preset('diskon15')} class="rounded border border-border-input bg-white px-2.5 py-2 text-body-sm text-ink hover:bg-table-header text-left">Diskon 15% · Vol +30%</button>
          <button type="button" on:click={() => preset('modal8')} class="rounded border border-border-input bg-white px-2.5 py-2 text-body-sm text-ink hover:bg-table-header text-left">Modal −8%</button>
          <button type="button" on:click={() => preset('gudang')} class="rounded border border-border-input bg-white px-2.5 py-2 text-body-sm text-ink hover:bg-table-header text-left">Cuci gudang</button>
        </div>
      </Card>

      <Card>
        <div class="flex items-center justify-between mb-3">
          <p class="text-label-md text-ink">Tuas skenario</p>
          <button type="button" on:click={resetLevers} class="text-body-sm font-semibold text-muted hover:text-ink">Reset</button>
        </div>

        <div class="flex flex-col gap-4">
          <!-- Harga jual -->
          <div class="rounded border-l-2 border-l-ink-navy border border-border-cool p-3">
            <div class="flex items-center justify-between mb-1">
              <span class="flex items-center gap-1.5 text-body-md text-ink font-semibold">
                Harga jual
                <Tooltip text="Harga jual pengganti buat produk ini di skenario simulasi." />
              </span>
              <span class="text-body-sm tabular {pricePct >= 0 ? 'text-status-positive' : 'text-status-negative'}">{pricePct >= 0 ? '+' : ''}{pricePct.toFixed(0)}%</span>
            </div>
            <input type="range" min={-30} max={50} step={1} value={pricePct} on:input={onPricePct} class="w-full accent-ink-navy" aria-label="Persentase perubahan harga jual" />
            <Input type="number" min="0" step="500" value={String(priceValue)} on:input={(e) => setNum(e, (v) => (priceValue = v))} aria-label="Harga jual skenario (rupiah)" />
          </div>

          <!-- Diskon -->
          <div class="rounded border-l-2 border-l-status-warning border border-border-cool p-3">
            <div class="flex items-center justify-between mb-1">
              <span class="flex items-center gap-1.5 text-body-md text-ink font-semibold">
                Diskon
                <Tooltip text="Awalnya mengikuti pola promo histori. Menggeser slider/mengetik mengubah jadi diskon persen skenario." />
              </span>
              {#if discountMode === 'keep'}
                <span class="text-body-sm tabular text-ink">histori ({histRatePct}%)</span>
              {:else}
                <span class="text-body-sm tabular text-ink">{discountPct}%</span>
              {/if}
            </div>
            {#if discountMode === 'keep'}
              <p class="text-body-sm text-muted">Sesuai histori ({histRatePct}% rata-rata nilai). Geser slider atau isi angka untuk mencoba diskon lain.</p>
              <input type="range" min={0} max={50} step={1} value={0} on:input={onDiscount} class="w-full accent-ink-navy" aria-label="Persentase diskon" />
              <Input type="number" min="0" step="1" value="" placeholder="cth: 15" on:input={onDiscountNum} aria-label="Diskon skenario (persen)" />
            {:else}
              <input type="range" min={0} max={50} step={1} value={discountPct} on:input={onDiscount} class="w-full accent-ink-navy" aria-label="Persentase diskon" />
              <Input type="number" min="0" step="1" value={String(discountPct)} on:input={onDiscountNum} aria-label="Diskon skenario (persen)" />
              <button type="button" on:click={backToHist} class="text-body-sm font-semibold text-muted hover:text-ink mt-1">Kembali ke histori</button>
            {/if}
            <p class="text-body-sm text-muted mt-1">Harga efektif: <strong class="text-ink tabular">{idr(effPrice)}</strong></p>
          </div>

          <!-- Modal -->
          <div class="rounded border-l-2 border-l-status-negative border border-border-cool p-3">
            <div class="flex items-center justify-between mb-1">
              <span class="flex items-center gap-1.5 text-body-md text-ink font-semibold">
                Harga modal
                <Tooltip text="Biaya modal (COGS) pengganti buat produk ini di skenario simulasi." />
              </span>
              <span class="text-body-sm tabular {costPct <= 0 ? 'text-status-positive' : 'text-status-negative'}">{costPct >= 0 ? '+' : ''}{costPct.toFixed(0)}%</span>
            </div>
            <input type="range" min={-30} max={30} step={1} value={costPct} on:input={onCostPct} class="w-full accent-ink-navy" aria-label="Persentase perubahan harga modal" />
            <Input type="number" min="0" step="500" value={String(costValue)} on:input={(e) => setNum(e, (v) => (costValue = v))} aria-label="Harga modal skenario (rupiah)" />
          </div>

          <!-- Volume -->
          <div class="rounded border-l-2 border-l-status-positive border border-border-cool p-3">
            <div class="flex items-center justify-between mb-1">
              <span class="flex items-center gap-1.5 text-body-md text-ink font-semibold">
                Volume penjualan
                <Tooltip text="Geser buat menaikkan/menurunkan volume relatif ke histori, atau isi angka pasti di bawah." />
              </span>
              <span class="text-body-sm tabular text-ink">{volPct >= 0 ? '+' : ''}{volPct}%</span>
            </div>
            <input type="range" min={-50} max={100} step={5} bind:value={volPct} class="w-full accent-ink-navy" aria-label="Persentase perubahan volume" />
            <Input type="number" min="0" step="10" bind:value={qtyOverride} placeholder={`Otomatis: ${num(simQty)} unit`} aria-label="Override quantity (opsional)" />
          </div>
        </div>

        <div class="rounded bg-status-neutral-bg border border-status-neutral-border px-3 py-2 mt-4 text-body-sm text-muted">
          Laba/unit: <strong class="tabular {unitProfit >= 0 ? 'text-status-positive' : 'text-status-negative'}">{idr(unitProfit)}</strong>
          · Qty simulasi: <strong class="text-ink tabular">{num(simQty)}</strong>
        </div>
      </Card>
    </div>

    <!-- KANAN: panggung hasil (identitas simulator: panel gelap) -->
    <div class="flex flex-col gap-4 min-w-0">
      <div class="relative overflow-hidden rounded-panel bg-ink-navy p-5 shadow-level1">
        <span aria-hidden="true" class="pointer-events-none absolute inset-0">
          <span class="copilot-sheen absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent"></span>
        </span>
        <div class="relative flex items-center justify-between gap-3 mb-2">
          <Badge size="sm" tone={verdict.tone}>{verdict.title}</Badge>
          <span class="text-body-sm text-white/50 uppercase tracking-widest">Live</span>
        </div>
        <p class="relative text-body-md text-white/80 mb-4">{verdict.desc}</p>
        <div class="relative grid grid-cols-1 sm:grid-cols-3 gap-4 min-w-0">
          <div class="min-w-0">
            <p class="text-label-sm uppercase text-white/50">Revenue</p>
            <p class="text-num-display text-white tabular break-words">{fmtDeltaPct(revDelta)}</p>
            <p class="text-body-sm text-white/60 tabular break-words [overflow-wrap:anywhere]">{idr(sqRev)} → {idr(result.simulated.revenue)}</p>
          </div>
          <div class="min-w-0">
            <p class="text-label-sm uppercase text-white/50">Profit</p>
            <p class="text-num-display text-white tabular break-words">{fmtDeltaPct(profitDelta)}</p>
            <p class="text-body-sm text-white/60 tabular break-words [overflow-wrap:anywhere]">{idr(sqProfit)} → {idr(result.simulated.profit)}</p>
          </div>
          <div class="min-w-0">
            <p class="text-label-sm uppercase text-white/50">Margin simulasi</p>
            <p class="text-num-display text-white tabular">{(result.simulated.margin * 100).toFixed(1)}%</p>
            <p class="text-body-sm text-white/60 tabular">{fmtPoin(marginPts)} dari {(sqMargin * 100).toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {#if discountMode === 'percent' && discountPct > 0 && prod}
        <div class="rounded-panel border border-border-cool bg-surface p-4">
          {#if discountActive}
            <Button on:click={goToDiscount}>Jadikan diskon {Math.round(discountPct)}%</Button>
            <p class="text-body-sm text-muted mt-2">Membuka draf diskon produk {prod.name} sebesar {Math.round(discountPct)}%{simQty > 0 ? ` dengan saran kuota ${num(simQty)} unit` : ''}.</p>
          {:else}
            <Button disabled>Jadikan diskon</Button>
            <p class="text-body-sm text-muted mt-2">Skenario juga mengubah harga jual. Ubah harga jual di halaman Produk, lalu buat diskonnya secara terpisah.</p>
          {/if}
        </div>
      {/if}

      <Card class="min-w-0 overflow-hidden">
        <div class="flex items-center justify-between gap-3 mb-4">
          <h2 class="text-headline-sm text-ink">Perbandingan aktual vs kondisi sekarang vs simulasi</h2>
          <span class="text-body-sm text-muted hidden sm:inline">garis = skrg · bar = simulasi</span>
        </div>
        <div class="overflow-x-auto mb-5">
          <table class="w-full text-body-sm">
            <thead>
              <tr class="text-left text-label-sm uppercase text-muted">
                <th class="py-1 pr-3 font-medium"></th>
                <th class="py-1 pr-3 font-medium text-right">Revenue</th>
                <th class="py-1 pr-3 font-medium text-right">Profit</th>
                <th class="py-1 pr-3 font-medium text-right">Margin</th>
                <th class="py-1 font-medium text-right">Unit</th>
              </tr>
            </thead>
            <tbody class="tabular">
              <tr class="border-t border-border-cool">
                <td class="py-1.5 pr-3 text-muted">Aktual (periode)</td>
                <td class="py-1.5 pr-3 text-right text-ink">{idr(result.actual.revenue)}</td>
                <td class="py-1.5 pr-3 text-right text-ink">{idr(result.actual.profit)}</td>
                <td class="py-1.5 pr-3 text-right text-ink">{(result.actual.margin * 100).toFixed(1)}%</td>
                <td class="py-1.5 text-right text-ink">{num(result.qty.baseline)}</td>
              </tr>
              <tr class="border-t border-border-cool">
                <td class="py-1.5 pr-3 text-muted">Kondisi sekarang</td>
                <td class="py-1.5 pr-3 text-right text-ink">{idr(sqRev)}</td>
                <td class="py-1.5 pr-3 text-right text-ink">{idr(sqProfit)}</td>
                <td class="py-1.5 pr-3 text-right text-ink">{(sqMargin * 100).toFixed(1)}%</td>
                <td class="py-1.5 text-right text-ink">{num(result.qty.baseline)}</td>
              </tr>
              <tr class="border-t border-border-cool font-semibold">
                <td class="py-1.5 pr-3 text-ink">Simulasi</td>
                <td class="py-1.5 pr-3 text-right text-ink">{idr(result.simulated.revenue)}</td>
                <td class="py-1.5 pr-3 text-right text-ink">{idr(result.simulated.profit)}</td>
                <td class="py-1.5 pr-3 text-right text-ink">{(result.simulated.margin * 100).toFixed(1)}%</td>
                <td class="py-1.5 text-right text-ink">{num(simQty)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {#if driftNote}
          <p class="text-body-sm text-muted mb-4">{driftNote}</p>
        {/if}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 min-w-0">
          <div class="min-w-0">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-label-sm uppercase text-muted">Revenue</span>
              <Badge size="sm" tone={toneOf(revDelta)}>{fmtDeltaPct(revDelta)}</Badge>
            </div>
            <p class="text-lg font-bold text-ink tabular break-words [overflow-wrap:anywhere]">{idr(result.simulated.revenue)}</p>
            <p class="text-body-sm text-muted tabular mb-2 break-words [overflow-wrap:anywhere]">dari {idr(sqRev)}</p>
            <div class="relative h-2 rounded-full bg-border-cool" role="img" aria-label="Revenue simulasi dibanding kondisi sekarang">
              <div class="absolute inset-y-0 left-0 rounded-full bg-ink-navy transition-[width]" style="width: {w(result.simulated.revenue, maxRev)}"></div>
              <div class="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded bg-white ring-2 ring-slate-400" style="left: {w(sqRev, maxRev)}" title="Sekarang: {idr(sqRev)}"></div>
            </div>
          </div>
          <div class="min-w-0">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-label-sm uppercase text-muted">Profit</span>
              <Badge size="sm" tone={toneOf(profitDelta)}>{fmtDeltaPct(profitDelta)}</Badge>
            </div>
            <p class="text-lg font-bold text-ink tabular break-words [overflow-wrap:anywhere]">{idr(result.simulated.profit)}</p>
            <p class="text-body-sm text-muted tabular mb-2 break-words [overflow-wrap:anywhere]">dari {idr(sqProfit)}</p>
            <div class="relative h-2 rounded-full bg-border-cool" role="img" aria-label="Profit simulasi dibanding kondisi sekarang">
              <div class="absolute inset-y-0 left-0 rounded-full bg-status-positive transition-[width]" style="width: {w(Math.max(0, result.simulated.profit), maxProfit)}"></div>
              <div class="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded bg-white ring-2 ring-slate-400" style="left: {w(Math.max(0, sqProfit), maxProfit)}" title="Sekarang: {idr(sqProfit)}"></div>
            </div>
          </div>
          <div class="min-w-0">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-label-sm uppercase text-muted">Margin</span>
              <Badge size="sm" tone={marginPts >= 0 ? 'positive' : 'negative'}>{fmtPoin(marginPts)}</Badge>
            </div>
            <p class="text-lg font-bold text-ink tabular break-words">{(result.simulated.margin * 100).toFixed(1)}%</p>
            <p class="text-body-sm text-muted tabular mb-2 break-words">dari {(sqMargin * 100).toFixed(1)}%</p>
            <div class="relative h-2 rounded-full bg-border-cool" role="img" aria-label="Margin simulasi dibanding kondisi sekarang">
              <div class="absolute inset-y-0 left-0 rounded-full bg-ink-navy transition-[width]" style="width: {w(result.simulated.margin * 100, Math.max(sqMargin, result.simulated.margin, 0.01) * 100)}"></div>
              <div class="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded bg-white ring-2 ring-slate-400" style="left: {w(sqMargin * 100, Math.max(sqMargin, result.simulated.margin, 0.01) * 100)}" title="Sekarang: {(sqMargin * 100).toFixed(1)}%"></div>
            </div>
          </div>
          <div class="min-w-0">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-label-sm uppercase text-muted">Unit terjual</span>
              <Badge size="sm" tone={toneOf(volDelta)}>{fmtDeltaPct(volDelta)}</Badge>
            </div>
            <p class="text-lg font-bold text-ink tabular break-words">{num(simQty)} unit</p>
            <p class="text-body-sm text-muted tabular mb-2 break-words">dari {num(histQty)} unit</p>
            <div class="relative h-2 rounded-full bg-border-cool" role="img" aria-label="Unit simulasi dibanding kondisi sekarang">
              <div class="absolute inset-y-0 left-0 rounded-full bg-ink-navy transition-[width]" style="width: {w(simQty, maxQty)}"></div>
              <div class="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded bg-white ring-2 ring-slate-400" style="left: {w(histQty, maxQty)}" title="Sekarang: {num(histQty)} unit"></div>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-4 mt-4 text-body-sm text-muted">
          <span class="flex items-center gap-1.5"><span class="inline-block h-2 w-4 rounded-full bg-ink-navy"></span>Simulasi</span>
          <span class="flex items-center gap-1.5"><span class="inline-block h-3.5 w-[3px] rounded bg-white ring-2 ring-slate-400"></span>Sekarang</span>
        </div>
      </Card>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <h2 class="text-headline-sm text-ink mb-3">Titik impas</h2>
          <dl class="flex flex-col gap-2 text-body-md">
            <div class="flex justify-between"><dt class="text-muted">Laba / unit simulasi</dt><dd class="tabular font-semibold {unitProfit >= 0 ? 'text-status-positive' : 'text-status-negative'}">{idr(unitProfit)}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Qty simulasi</dt><dd class="tabular text-ink">{num(simQty)} unit</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Qty impas (profit = kondisi sekarang)</dt><dd class="tabular text-ink font-semibold">{breakEvenQty === null ? 'Tidak impas' : breakEvenQty === 0 ? '—' : `${num(breakEvenQty)} unit`}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Diskon maks sebelum rugi</dt><dd class="tabular text-ink">{maxDiscount === null ? '—' : `${maxDiscount}%`}</dd></div>
          </dl>
          {#if breakEvenQty === null}
            <p class="text-body-sm text-status-negative mt-3">Harga efektif di bawah modal — tiap unit menambah kerugian.</p>
          {:else if breakEvenQty > 0 && simQty >= breakEvenQty}
            <p class="text-body-sm text-status-positive mt-3">Qty simulasi sudah melewati titik impas. Skenario menutup profit kondisi sekarang.</p>
          {:else if breakEvenQty > 0}
            <p class="text-body-sm text-status-warning mt-3">Butuh {num(breakEvenQty - simQty)} unit lagi biar profit menyamai kondisi sekarang.</p>
          {/if}
        </Card>
        <Card>
          <h2 class="text-headline-sm text-ink mb-3">Asumsi & catatan</h2>
          <ul class="text-body-sm text-muted list-disc list-inside flex flex-col gap-1.5">
            {#each assumptions as a}<li>{a}</li>{/each}
          </ul>
          <div class="mt-4">
            <Button variant="secondary" size="compact" on:click={resetLevers}>Kembalikan ke kondisi sekarang</Button>
          </div>
        </Card>
      </div>
    </div>
  </div>
{/if}
