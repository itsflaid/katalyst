<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import MoneyInput from '$lib/components/ui/MoneyInput.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Tooltip from '$lib/components/ui/Tooltip.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import StatCard from '$lib/components/statistics/StatCard.svelte';
  import StatFilterBar from '$lib/components/statistics/StatFilterBar.svelte';
  import { goto } from '$app/navigation';
  import { fmtInt, fmtPercent, fmtQty, fmtRupiah } from '$lib/shared/format';
  import { assessScenario, sanitizeLevers, simulate, type ScenarioCode } from '$lib/analytics/simulation';
  import { ZERO_FACTS, zakatImpactOf } from '$lib/analytics';
  export let data;

  type BadgeTone = 'positive' | 'warning' | 'negative' | 'neutral';
  interface Verdict {
    tone: BadgeTone;
    title: string;
    desc: string;
  }

  const fmtDeltaPct = (v: number | null) => (v === null ? 'dari nol' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);
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

  // Rentang baseline: hari ini / minggu ini / 7 hari / 30 hari / bulan ini / semua / custom. Default bulan ini (dari server) biar load awal ringan.
  // Ganti rentang = reload server (goto) biar agregat dihitung ulang dari transaction.created_at.
  // Hitungan live di client (responsif tiap geser tuas); rumusnya sama dengan lib/analytics/simulation.ts (satu fungsi simulate).
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
    goWithRange('custom', fromInput, toInput);
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

  $: overrideQty = qtyOverride.trim() === '' ? null : Math.max(0, Math.floor(Number(qtyOverride) || 0));

  // Satu-satunya hitungan simulasi, tak ada rumus lokal lagi.
  // Respons pembeli selalu aktif; engine yang memutuskan dipakai tidaknya.
  $: simLevers = ((ov) =>
    sanitizeLevers({
      price: priceValue,
      cost: costValue,
      discount: discountMode === 'keep' ? { kind: 'keep' } : { kind: 'percent', pct: discountPct },
      volume: ov !== null ? { kind: 'override', qty: ov } : { kind: 'pct', pct: volPct },
      demand: ov !== null ? { kind: 'off' } : { kind: 'on' }
    }))(overrideQty);
  $: result = simulate({
    baseline: base.facts,
    product: { sellingPrice: sellBase, costPrice: costBase },
    levers: simLevers
  });

  $: simQty = result.qty.simulated;
  $: effPrice = result.simulated.avgNetPrice;
  $: unitProfit = result.unit.unitProfit;

  // Delta utama & verdict = dibanding kondisi sekarang (bukan aktual).
  $: revDelta = result.impact.vsStatusQuo.revenue;
  $: profitDelta = result.impact.vsStatusQuo.profit;
  $: volDelta = result.impact.vsStatusQuo.qty;
  $: marginPts = result.impact.vsStatusQuo.marginPoints;
  $: histRatePct = (result.actual.discountRate * 100).toFixed(1);
  // Posisi slider saat mode histori: pembulatan histori, dibatasi rentang slider (0..50).
  $: histRateInt = Math.min(50, Math.round(result.actual.discountRate * 100));

  // Qty impas & diskon maks dari engine (integer; null = mustahil/tak tentu).
  // (Deklarasi `let` + assign reaktif terpisah, Svelte tidak mengizinkan
  // anotasi tipe langsung di statement `$:`.)
  let breakEvenQty: number | null = 0;
  let maxDiscount: number | null = null;
  let verdict: Verdict = { tone: 'neutral', title: '', desc: '' };
  let assumptions: string[] = [];
  $: breakEvenQty = result.breakEvenQty;
  $: maxDiscount = result.maxDiscountPct;
  // Alasan harga optimal kosong, untuk keterangan kecil di kartu.
  $: peakEmptyReason =
    overrideQty !== null
      ? 'qty manual'
      : result.qty.baseline === 0
        ? 'tidak ada histori'
        : result.flags.includes('QUOTA_DEMAND_IGNORED')
          ? 'diskon berkuota'
          : '';
  $: maxDrop = result.maxVolumeDrop;
  $: maxDropText =
    maxDrop === null ? '-' : maxDrop >= 0 ? `${fmtPercent(maxDrop)} dari ${fmtInt(result.qty.baseline)} unit` : `harus naik ${fmtPercent(-maxDrop)}`;

  // Teks verdict per kode; angkaQty/harga persenan hanya untuk tampil.
  function verdictText(
    code: ScenarioCode,
    v: {
      effPrice: number;
      costValue: number;
      profitDelta: number | null;
      margin: number;
      marginPts: number;
      priceValue: number;
      pricePct: number;
    }
  ): { title: string; desc: string } {
    switch (code) {
      case 'NO_VOLUME':
        return { title: 'Belum ada volume', desc: 'Isi override quantity atau pastikan produk punya histori penjualan.' };
      case 'DEMAND_COLLAPSE':
        return {
          title: 'Pembeli diperkirakan hilang',
          desc: `Pada harga ${fmtRupiah(v.effPrice)}, model memperkirakan hampir tidak ada yang membeli.`
        };
      case 'UNIT_LOSS':
        return {
          title: 'Tiap unit merugi',
          desc: `Harga efektif ${fmtRupiah(v.effPrice)} di bawah modal ${fmtRupiah(v.costValue)}. Skenario ini rugi di setiap unit.`
        };
      case 'LOSS':
        return {
          title: 'Skenario merugikan',
          desc: `Profit ${fmtDeltaPct(v.profitDelta)} dibanding kondisi sekarang dan margin ${fmtPoin(v.marginPts)}. Pertimbangkan ulang tuasnya.`
        };
      case 'OUT_OF_RANGE':
        return {
          title: 'Di luar jangkauan data',
          desc: `Harga ${fmtRupiah(v.priceValue)} berubah ${v.pricePct >= 0 ? '+' : ''}${v.pricePct.toFixed(0)}% dari harga sekarang, jauh di luar yang bisa diprediksi dari histori. Anggap hasilnya spekulatif dan uji dulu dengan kenaikan bertahap.`
        };
      case 'PROFITABLE':
        return {
          title: 'Skenario menguntungkan',
          desc: `Profit ${fmtDeltaPct(v.profitDelta)} dibanding kondisi sekarang dengan margin terjaga di ${fmtPercent(v.margin)}.`
        };
      case 'NEUTRAL':
        return {
          title: 'Dampak netral',
          desc: 'Perubahan kecil terhadap profit dibanding kondisi sekarang. Coba geser tuas lebih jauh atau ubah volume.'
        };
      default:
        return {
          title: 'Dampak netral',
          desc: 'Perubahan kecil terhadap profit dibanding kondisi sekarang. Coba geser tuas lebih jauh atau ubah volume.'
        };
    }
  }

  // Penilaian skenario satu pintu di engine; halaman hanya memetakan teks.
  $: verdict = ((r, ctx) => {
    const a = assessScenario(r);
    return { tone: a.tone, ...verdictText(a.code, ctx) };
  })(result, {
    effPrice,
    costValue,
    profitDelta,
    margin: result.simulated.margin,
    marginPts,
    priceValue,
    pricePct
  });

  $: demandDeltaPct = ((r) => {
    if (!r.demand.applied) return null;
    const pe = (r.demand.ratio - 1) * 100;
    const qe = (r.demand.factor - 1) * 100;
    return { pe, qe };
  })(result);
  $: assumptions = [
    `Baseline memakai rentang: ${data.rangeLabel ?? 'Semua waktu'}.`,
    overrideQty !== null
      ? `Quantity memakai angka manual: ${fmtQty(simQty)} unit.`
      : result.demand.applied
        ? `Quantity dihitung dari respons harga lalu disesuaikan ${volPct >= 0 ? '+' : ''}${volPct}%: ${fmtQty(simQty)} unit.`
        : `Quantity mengikuti histori ${histQty === 0 ? 'produk ini belum pernah terjual pada rentang ini' : `disesuaikan ${volPct >= 0 ? '+' : ''}${volPct}%`}: ${fmtQty(simQty)} unit.`,
    ...(result.demand.applied && demandDeltaPct
      ? [
          `Respons pembeli: harga efektif ${demandDeltaPct.pe >= 0 ? '+' : ''}${demandDeltaPct.pe.toFixed(1).replace('.', ',')}% → penjualan ${demandDeltaPct.qe >= 0 ? '+' : ''}${demandDeltaPct.qe.toFixed(1).replace('.', ',')}% (angka ini hanya asumsi/perkiraan, bukan kepastian).`
        ]
      : []),
    ...(result.flags.includes('NO_HISTORY')
      ? ['Tidak ada data transaksi pada rentang ini untuk produk ini, hasil simulasi kurang bisa diandalkan. Isi quantity manual atau ganti rentang.']
      : []),
    ...(result.flags.includes('DISCOUNT_ON_CHANGED_PRICE') ? ['Diskon diterapkan di atas harga jual skenario, bukan harga jual saat ini.'] : []),
    ...(result.flags.includes('LOW_MARGIN') ? ['Margin simulasi di bawah 15%, waspada terhadap biaya tak terduga.'] : []),
    ...(result.flags.includes('BELOW_COST') ? ['Harga efektif di bawah modal, tiap unit menambah kerugian.'] : []),
    ...(result.demand.capped ? ['Kenaikan volume dibatasi 3× dari baseline (batas serap pasar).'] : []),
    ...(result.flags.includes('QUOTA_DEMAND_IGNORED') ? ['Diskon berkuota: respons volume dari diskon tidak dihitung.'] : []),
    ...(result.outOfRange ? ['Harga skenario di luar ±30% dari harga sekarang; hasil spekulatif.'] : []),
    ...(base.txCount > 0 ? [`Baseline dari ${fmtInt(base.txCount)} transaksi tercatat.`] : []),
    'Dampak zakat dihitung dari selisih profit produk ini pada rentang baseline, dengan asumsi selisih tersebut tertahan sebagai kas atau stok sampai haul; kas, piutang, dan utang diambil dari halaman Zakat.'
  ];
  $: driftNote =
    result.flags.includes('DRIFT_PRICE') || result.flags.includes('DRIFT_COST')
      ? `Catatan netral: harga rata-rata terjual periode ini ${fmtRupiah(result.actual.avgGrossPrice)} (modal ${fmtRupiah(result.actual.avgCost)}), harga sekarang ${fmtRupiah(sellBase)} (modal ${fmtRupiah(costBase)}). Selisihnya bukan efek tuas.`
      : null;

  // Lebar bar perbandingan (relatif ke nilai terbesar, min 2% biar kelihatan).
  // Basis bar = kondisi sekarang (bukan aktual).
  $: sqRev = result.statusQuo.revenue;
  $: sqProfit = result.statusQuo.profit;
  $: sqMargin = result.statusQuo.margin;

  // Dampak zakat dari selisih profit skenario (Rupiah, bukan rasio impact).
  $: zakatImpact = data.zakat ? zakatImpactOf(data.zakat, { statusQuo: result.statusQuo.profit, simulated: result.simulated.profit }) : null;
  $: zakatPartial = (zakatImpact?.before.missing.length ?? 1) > 0;
  // Tanda estimasi hanya untuk jumlah positif; nol aturan tampil tegas.
  $: zakatBeforeUncertain = zakatPartial && (zakatImpact?.before.amount ?? 0) > 0;
  $: zakatAfterUncertain = zakatPartial && (zakatImpact?.after.amount ?? 0) > 0;
  // Haul sama untuk sebelum/sesudah (penyesuaian cuma mengubah aset).
  $: zakatHaulDue = zakatImpact?.before.haul.reached === true;
  $: maxRev = Math.max(sqRev, result.simulated.revenue, 1);
  $: maxProfit = Math.max(sqProfit, result.simulated.profit, 1);
  $: maxQty = Math.max(histQty, simQty, 1);
  const w = (v: number, max: number) => `${Math.max(2, (v / max) * 100).toFixed(1)}%`;
  // Jembatan ke /discounts: persen simulasi dijadikan draf diskon produk yang dihitung dari harga jual saat ini, tombol aktif hanya bila tuas harga jual tidak diubah.
  // Baseline week/month parsial (Senin–sekarang / tgl 1–sekarang), jadi kuota dari simQty hanyalah saran awal.
  function goToDiscount() {
    if (!prod || discountMode !== 'percent' || discountPct <= 0 || priceValue !== sellBase) return;
    const params = new URLSearchParams({
      new: '1',
      productId: prod.id,
      percent: String(Math.round(discountPct))
    });
    if (simQty > 0) params.set('quota', String(Math.round(simQty)));
    const preset = data.range === 'today' ? 'TODAY' : data.range === 'week' || data.range === '7d' ? 'DAYS_7' : null;
    if (preset) params.set('preset', preset);
    if (data.rangeLabel) params.set('baseline', data.rangeLabel);
    goto(`/discounts?${params.toString()}`);
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
      volPct = 0;
    }
    if (kind === 'modal8') costValue = Math.round(prod.costPrice * 0.92);
    if (kind === 'gudang') {
      discountMode = 'percent';
      discountPct = 30;
      volPct = 0;
    }
  }
</script>

<PageHeader title="Simulator “What-if”" subtitle="Lab skenario satu produk, geser tuasnya, hasilnya terhitung otomatis dari data historimu." />

<StatCard class="mb-6 p-0">
  <StatFilterBar
    {activeRange}
    rangeLabel={data.rangeLabel}
    bind:fromInput
    bind:toInput
    onSelect={(k) => goWithRange(k)}
    onApply={applyCustom}
    desktopOnly={false}
    ranges={[
      { value: 'today', label: 'Hari ini' },
      { value: 'week', label: 'Minggu ini' },
      { value: '7d', label: '7 hari' },
      { value: '30d', label: '30 hari' },
      { value: 'month', label: 'Bulan ini' },
      { value: 'all', label: 'Semua' }
    ]}
  />
</StatCard>

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
            <p class="text-num-cell text-ink tabular">{fmtRupiah(sellBase)} · {fmtRupiah(costBase)}</p>
          </div>
          <div class="rounded border border-border-cool px-2.5 py-2">
            <p class="text-label-sm uppercase text-muted">Histori</p>
            <p class="text-num-cell text-ink tabular">{fmtInt(histQty)} unit · {fmtInt(base.txCount)} trx</p>
          </div>
        </div>
      </Card>

      <Card>
        <p class="text-label-md text-ink mb-2">Skenario cepat</p>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            on:click={() => preset('naik10')}
            class="rounded border border-border-input bg-white px-2.5 py-2 text-body-sm text-ink hover:bg-table-header text-left">Harga +10%</button
          >
          <button
            type="button"
            on:click={() => preset('diskon15')}
            class="rounded border border-border-input bg-white px-2.5 py-2 text-body-sm text-ink hover:bg-table-header text-left">Diskon 15%</button
          >
          <button
            type="button"
            on:click={() => preset('modal8')}
            class="rounded border border-border-input bg-white px-2.5 py-2 text-body-sm text-ink hover:bg-table-header text-left">Modal −8%</button
          >
          <button
            type="button"
            on:click={() => preset('gudang')}
            class="rounded border border-border-input bg-white px-2.5 py-2 text-body-sm text-ink hover:bg-table-header text-left">Cuci gudang</button
          >
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
              <span class="text-body-sm tabular {pricePct >= 0 ? 'text-status-positive' : 'text-status-negative'}"
                >{pricePct >= 0 ? '+' : ''}{pricePct.toFixed(0)}%</span
              >
            </div>
            <input
              type="range"
              min={-30}
              max={50}
              step={1}
              value={pricePct}
              on:input={onPricePct}
              class="w-full accent-ink-navy"
              aria-label="Persentase perubahan harga jual"
            />
            <MoneyInput value={String(priceValue)} on:input={(e) => (priceValue = Number(e.detail) || 0)} aria-label="Harga jual skenario (rupiah)" />
            {#if result.outOfRange}
              <p class="text-body-sm text-status-warning mt-1">Di luar ±30% dari harga sekarang. Hasilnya spekulatif.</p>
            {/if}
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
              <p class="text-body-sm text-muted">
                Sesuai histori ({histRatePct}% rata-rata nilai). Geser slider atau isi angka untuk mencoba diskon lain.
              </p>
            {/if}
            <!-- Elemen input tidak boleh berada di dalam cabang {#if}: ganti mode akan membongkarnya dan memutus drag/fokus ketikan. -->
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={discountMode === 'keep' ? histRateInt : discountPct}
              on:input={onDiscount}
              class="w-full accent-ink-navy"
              aria-label="Persentase diskon"
            />
            <Input
              type="number"
              min="0"
              step="1"
              value={discountMode === 'keep' ? '' : String(discountPct)}
              placeholder={`histori ${histRatePct}%`}
              on:input={onDiscountNum}
              aria-label="Diskon skenario (persen)"
            />
            {#if discountMode === 'percent'}
              <button type="button" on:click={backToHist} class="text-body-sm font-semibold text-muted hover:text-ink mt-1">Kembali ke histori</button
              >
            {/if}
            <p class="text-body-sm text-muted mt-1">Harga efektif: <strong class="text-ink tabular">{fmtRupiah(effPrice)}</strong></p>
          </div>

          <!-- Modal -->
          <div class="rounded border-l-2 border-l-status-negative border border-border-cool p-3">
            <div class="flex items-center justify-between mb-1">
              <span class="flex items-center gap-1.5 text-body-md text-ink font-semibold">
                Harga modal
                <Tooltip text="Biaya modal (COGS) pengganti buat produk ini di skenario simulasi." />
              </span>
              <span class="text-body-sm tabular {costPct <= 0 ? 'text-status-positive' : 'text-status-negative'}"
                >{costPct >= 0 ? '+' : ''}{costPct.toFixed(0)}%</span
              >
            </div>
            <input
              type="range"
              min={-30}
              max={30}
              step={1}
              value={costPct}
              on:input={onCostPct}
              class="w-full accent-ink-navy"
              aria-label="Persentase perubahan harga modal"
            />
            <MoneyInput value={String(costValue)} on:input={(e) => (costValue = Number(e.detail) || 0)} aria-label="Harga modal skenario (rupiah)" />
          </div>

          <!-- Volume -->
          <div class="rounded border-l-2 border-l-status-positive border border-border-cool p-3">
            <div class="flex items-center justify-between mb-1">
              <span class="flex items-center gap-1.5 text-body-md text-ink font-semibold">
                Penyesuaian volume
                <Tooltip text="Tambahan di luar respons harga. 0% berarti ikuti hitungan model." />
              </span>
              <span class="text-body-sm tabular text-ink">{volPct >= 0 ? '+' : ''}{volPct}%</span>
            </div>
            <input
              type="range"
              min={-50}
              max={100}
              step={5}
              bind:value={volPct}
              class="w-full accent-ink-navy"
              aria-label="Persentase perubahan volume"
            />
            <Input
              type="number"
              min="0"
              step="10"
              bind:value={qtyOverride}
              placeholder={`Otomatis: ${fmtQty(simQty)} unit`}
              aria-label="Override quantity (opsional)"
            />
          </div>
        </div>

        <div class="rounded bg-status-neutral-bg border border-status-neutral-border px-3 py-2 mt-4 text-body-sm text-muted">
          Laba/unit: <strong class="tabular {unitProfit >= 0 ? 'text-status-positive' : 'text-status-negative'}">{fmtRupiah(unitProfit)}</strong>
          · Qty simulasi: <strong class="text-ink tabular">{fmtQty(simQty)}</strong>
        </div>
      </Card>
    </div>

    <!-- KANAN: panggung hasil (identitas simulator: panel gelap) -->
    <div class="flex flex-col gap-4 min-w-0">
      <div class="relative overflow-hidden rounded-panel bg-ink-navy p-5 shadow-stat-card">
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
            <p class="text-body-sm text-white/60 tabular break-words [overflow-wrap:anywhere]">
              {fmtRupiah(sqRev)} → {fmtRupiah(result.simulated.revenue)}
            </p>
          </div>
          <div class="min-w-0">
            <p class="text-label-sm uppercase text-white/50">Profit</p>
            <p class="text-num-display text-white tabular break-words">{fmtDeltaPct(profitDelta)}</p>
            <p class="text-body-sm text-white/60 tabular break-words [overflow-wrap:anywhere]">
              {fmtRupiah(sqProfit)} → {fmtRupiah(result.simulated.profit)}
            </p>
          </div>
          <div class="min-w-0">
            <p class="text-label-sm uppercase text-white/50">Margin simulasi</p>
            <p class="text-num-display text-white tabular">{fmtPercent(result.simulated.margin)}</p>
            <p class="text-body-sm text-white/60 tabular">{fmtPoin(marginPts)} dari {fmtPercent(sqMargin)}</p>
          </div>
        </div>
      </div>

      {#if discountMode === 'percent' && discountPct > 0 && prod}
        <div class="rounded-panel border border-border-cool bg-surface p-4">
          {#if discountActive}
            <Button on:click={goToDiscount}>Jadikan diskon {Math.round(discountPct)}%</Button>
            <p class="text-body-sm text-muted mt-2">
              Membuka draf diskon produk {prod.name} sebesar {Math.round(discountPct)}%{simQty > 0
                ? ` dengan saran kuota ${fmtInt(Math.round(simQty))} unit`
                : ''}.
            </p>
          {:else}
            <Button disabled>Jadikan diskon</Button>
            <p class="text-body-sm text-muted mt-2">
              Skenario juga mengubah harga jual. Ubah harga jual di halaman Produk, lalu buat diskonnya secara terpisah.
            </p>
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
                <td class="py-1.5 pr-3 text-right text-ink">{fmtRupiah(result.actual.revenue)}</td>
                <td class="py-1.5 pr-3 text-right text-ink">{fmtRupiah(result.actual.profit)}</td>
                <td class="py-1.5 pr-3 text-right text-ink">{fmtPercent(result.actual.margin)}</td>
                <td class="py-1.5 text-right text-ink">{fmtInt(result.qty.baseline)}</td>
              </tr>
              <tr class="border-t border-border-cool">
                <td class="py-1.5 pr-3 text-muted">Kondisi sekarang</td>
                <td class="py-1.5 pr-3 text-right text-ink">{fmtRupiah(sqRev)}</td>
                <td class="py-1.5 pr-3 text-right text-ink">{fmtRupiah(sqProfit)}</td>
                <td class="py-1.5 pr-3 text-right text-ink">{fmtPercent(sqMargin)}</td>
                <td class="py-1.5 text-right text-ink">{fmtInt(result.qty.baseline)}</td>
              </tr>
              <tr class="border-t border-border-cool font-semibold">
                <td class="py-1.5 pr-3 text-ink">Simulasi</td>
                <td class="py-1.5 pr-3 text-right text-ink">{fmtRupiah(result.simulated.revenue)}</td>
                <td class="py-1.5 pr-3 text-right text-ink">{fmtRupiah(result.simulated.profit)}</td>
                <td class="py-1.5 pr-3 text-right text-ink">{fmtPercent(result.simulated.margin)}</td>
                <td class="py-1.5 text-right text-ink">{fmtQty(simQty)}</td>
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
            <p class="text-lg font-bold text-ink tabular break-words [overflow-wrap:anywhere]">{fmtRupiah(result.simulated.revenue)}</p>
            <p class="text-body-sm text-muted tabular mb-2 break-words [overflow-wrap:anywhere]">dari {fmtRupiah(sqRev)}</p>
            <div class="relative h-2 rounded-full bg-border-cool" role="img" aria-label="Revenue simulasi dibanding kondisi sekarang">
              <div
                class="absolute inset-y-0 left-0 rounded-full bg-ink-navy transition-[width]"
                style="width: {w(result.simulated.revenue, maxRev)}"
              ></div>
              <div
                class="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded bg-white ring-2 ring-slate-400"
                style="left: {w(sqRev, maxRev)}"
                title="Sekarang: {fmtRupiah(sqRev)}"
              ></div>
            </div>
          </div>
          <div class="min-w-0">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-label-sm uppercase text-muted">Profit</span>
              <Badge size="sm" tone={toneOf(profitDelta)}>{fmtDeltaPct(profitDelta)}</Badge>
            </div>
            <p class="text-lg font-bold text-ink tabular break-words [overflow-wrap:anywhere]">{fmtRupiah(result.simulated.profit)}</p>
            <p class="text-body-sm text-muted tabular mb-2 break-words [overflow-wrap:anywhere]">dari {fmtRupiah(sqProfit)}</p>
            <div class="relative h-2 rounded-full bg-border-cool" role="img" aria-label="Profit simulasi dibanding kondisi sekarang">
              <div
                class="absolute inset-y-0 left-0 rounded-full bg-status-positive transition-[width]"
                style="width: {w(Math.max(0, result.simulated.profit), maxProfit)}"
              ></div>
              <div
                class="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded bg-white ring-2 ring-slate-400"
                style="left: {w(Math.max(0, sqProfit), maxProfit)}"
                title="Sekarang: {fmtRupiah(sqProfit)}"
              ></div>
            </div>
          </div>
          <div class="min-w-0">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-label-sm uppercase text-muted">Margin</span>
              <Badge size="sm" tone={marginPts >= 0 ? 'positive' : 'negative'}>{fmtPoin(marginPts)}</Badge>
            </div>
            <p class="text-lg font-bold text-ink tabular break-words">{fmtPercent(result.simulated.margin)}</p>
            <p class="text-body-sm text-muted tabular mb-2 break-words">dari {fmtPercent(sqMargin)}</p>
            <div class="relative h-2 rounded-full bg-border-cool" role="img" aria-label="Margin simulasi dibanding kondisi sekarang">
              <div
                class="absolute inset-y-0 left-0 rounded-full bg-ink-navy transition-[width]"
                style="width: {w(result.simulated.margin * 100, Math.max(sqMargin, result.simulated.margin, 0.01) * 100)}"
              ></div>
              <div
                class="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded bg-white ring-2 ring-slate-400"
                style="left: {w(sqMargin * 100, Math.max(sqMargin, result.simulated.margin, 0.01) * 100)}"
                title="Sekarang: {fmtPercent(sqMargin)}"
              ></div>
            </div>
          </div>
          <div class="min-w-0">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-label-sm uppercase text-muted">Unit terjual</span>
              <Badge size="sm" tone={toneOf(volDelta)}>{fmtDeltaPct(volDelta)}</Badge>
            </div>
            <p class="text-lg font-bold text-ink tabular break-words">{fmtQty(simQty)} unit</p>
            <p class="text-body-sm text-muted tabular mb-2 break-words">dari {fmtInt(histQty)} unit</p>
            <div class="relative h-2 rounded-full bg-border-cool" role="img" aria-label="Unit simulasi dibanding kondisi sekarang">
              <div class="absolute inset-y-0 left-0 rounded-full bg-ink-navy transition-[width]" style="width: {w(simQty, maxQty)}"></div>
              <div
                class="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded bg-white ring-2 ring-slate-400"
                style="left: {w(histQty, maxQty)}"
                title="Sekarang: {fmtInt(histQty)} unit"
              ></div>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-4 mt-4 text-body-sm text-muted">
          <span class="flex items-center gap-1.5"><span class="inline-block h-2 w-4 rounded-full bg-ink-navy"></span>Simulasi</span>
          <span class="flex items-center gap-1.5"
            ><span class="inline-block h-3.5 w-[3px] rounded bg-white ring-2 ring-slate-400"></span>Sekarang</span
          >
        </div>
      </Card>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <h2 class="text-headline-sm text-ink mb-3">Titik impas</h2>
          <dl class="flex flex-col gap-2 text-body-md">
            <div class="flex justify-between">
              <dt class="text-muted">Laba / unit simulasi</dt>
              <dd class="tabular font-semibold {unitProfit >= 0 ? 'text-status-positive' : 'text-status-negative'}">{fmtRupiah(unitProfit)}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Qty simulasi</dt>
              <dd class="tabular text-ink">{fmtQty(simQty)} unit</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Qty impas (profit = kondisi sekarang)</dt>
              <dd class="tabular text-ink font-semibold">
                {breakEvenQty === null ? 'Tidak impas' : breakEvenQty === 0 ? '-' : `${fmtInt(breakEvenQty)} unit`}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Diskon maks sebelum rugi</dt>
              <dd class="tabular text-ink">{maxDiscount === null ? '-' : `${maxDiscount}%`}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Penjualan boleh turun maks</dt>
              <dd class="tabular font-semibold {maxDrop === null || maxDrop >= 0 ? 'text-ink' : 'text-status-warning'}">{maxDropText}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted">Harga paling untung dalam rentang</dt>
              <dd class="tabular text-right text-ink">
                {#if result.peak}
                  <span class="font-semibold">{fmtRupiah(result.peak.price)}</span>
                  <span class="block text-body-sm text-muted">profit {fmtRupiah(result.peak.profit)}</span>
                {:else}
                  <span class="font-semibold">-</span>
                  {#if peakEmptyReason}<span class="block text-body-sm text-muted">{peakEmptyReason}</span>{/if}
                {/if}
              </dd>
            </div>
          </dl>
          {#if breakEvenQty === null}
            <p class="text-body-sm text-status-negative mt-3">Harga efektif di bawah modal, tiap unit menambah kerugian.</p>
          {:else if breakEvenQty > 0 && simQty >= breakEvenQty}
            <p class="text-body-sm text-status-positive mt-3">Qty simulasi sudah melewati titik impas. Skenario menutup profit kondisi sekarang.</p>
          {:else if breakEvenQty > 0}
            <p class="text-body-sm text-status-warning mt-3">
              Butuh {fmtQty(breakEvenQty - simQty)} unit lagi biar profit menyamai kondisi sekarang.
            </p>
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

      <Card>
        <h2 class="text-headline-sm text-ink mb-1">Dampak ke zakat</h2>
        {#if zakatImpact && zakatImpact.before.status !== 'NEEDS_GOLD_PRICE'}
          <p class="text-body-sm text-muted mb-3">Skenario {prod?.name ?? 'produk ini'} pada rentang {data.rangeLabel ?? 'baseline'}.</p>
          <dl class="flex flex-col gap-2 text-body-md">
            <div class="flex justify-between">
              <dt class="text-muted">Zakat sekarang</dt>
              <dd class="tabular text-ink">{zakatBeforeUncertain ? '~' : ''}{fmtRupiah(zakatImpact.before.amount)}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Zakat simulasi</dt>
              <dd class="tabular text-ink">{zakatAfterUncertain ? '~' : ''}{fmtRupiah(zakatImpact.after.amount)}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">Selisih</dt>
              <dd class="tabular font-semibold {zakatImpact.deltaAmount >= 0 ? 'text-status-positive' : 'text-status-negative'}">
                {zakatImpact.deltaAmount >= 0 ? '+' : ''}{fmtRupiah(zakatImpact.deltaAmount)}
              </dd>
            </div>
          </dl>
          {#if zakatImpact.crossesNisab}
            {#if zakatHaulDue}
              <p class="text-body-sm text-status-warning mt-3">Skenario ini melewati batas nisab, status kewajiban zakat berubah.</p>
            {:else}
              <p class="text-body-sm text-status-warning mt-3">
                Skenario ini melewati batas nisab, tapi haul belum genap sehingga zakat belum jatuh tempo.
              </p>
            {/if}
          {/if}
          {#if !zakatHaulDue}
            <p class="text-body-sm text-muted mt-2">
              {#if zakatImpact.before.haul.daysLeft === null}
                Isi tanggal mulai haul di halaman Zakat agar jatuh tempo bisa dihitung; zakat saat ini Rp0.
              {:else}
                Haul belum genap sehingga zakat belum jatuh tempo; kedua jumlah di atas Rp0.
              {/if}
            </p>
          {/if}
          {#if zakatPartial}
            <p class="text-body-sm text-muted mt-2">Estimasi parsial: sebagian data zakat belum diisi.</p>
          {/if}
          <p class="text-body-sm text-muted mt-2">
            Estimasi berdasarkan data yang Anda isi, bukan fatwa. Konfirmasi ke BAZNAS atau lembaga amil zakat.
          </p>
        {:else}
          <p class="text-body-md text-muted mb-3">Isi data zakat dulu untuk melihat dampak skenario ini ke zakat.</p>
          <a href="/zakat" class="text-body-md font-semibold text-ink-navy hover:underline no-underline">Buka halaman Zakat →</a>
        {/if}
      </Card>
    </div>
  </div>
{/if}
