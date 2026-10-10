<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FieldHelp from '$lib/components/ui/FieldHelp.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import StatCard from '$lib/components/statistik/StatCard.svelte';
  import { ZAKAT_RATE } from '$lib/analytics';
  import { fmtPercent, fmtRupiah } from '$lib/shared/format';
  export let data;
  export let form;

  // Prefill dari baris tersimpan; string kosong berarti belum diisi.
  let goldPrice = data.setting?.goldPricePerGram?.toString() ?? '';
  let nisabGrams = data.setting?.nisabGrams?.toString() ?? '85';
  let haulStartDate = data.setting?.haulStartDate ?? '';
  let stockValuation = data.setting?.stockValuation ?? 'SELLING';
  let cash = data.setting?.cash?.toString() ?? '';
  let receivable = data.setting?.receivable?.toString() ?? '';
  let debt = data.setting?.debt?.toString() ?? '';

  // reset: false menjaga isian tetap tampil; reset bawaan mengosongkan input tetapi tidak variabelnya, sehingga simpan ulang menimpa data dengan kosong.
  const refresh: SubmitFunction =
    () =>
    async ({ update }) => {
      await update({ reset: false });
    };

  const moneyTip = 'Ketik angka saja, tanpa Rp, titik, atau koma. Kosong = belum diisi; ketik 0 bila memang tidak ada.';

  const help = {
    gold: {
      about: 'Harga 1 gram emas, dipakai menghitung nisab (nisab gram × harga ini). Lihat di toko emas langganan atau situs harga emas harian.',
      example: 'Harga Rp1.350.000 per gram → ketik 1350000. Angka ini hanya contoh; isi sesuai harga hari ini.',
      tip: 'Ketik angka saja, tanpa Rp, titik, atau koma. Perbarui kira-kira sebulan sekali.'
    },
    nisab: {
      about: 'Batas minimum harta, dalam gram emas, agar zakat wajib. Standarnya 85 gram; ubah hanya bila lembaga zakat yang diikuti menetapkan lain.',
      example: 'Standar 85 gram → ketik 85. Nisab dalam rupiah = 85 × harga emas per gram, tampil di Rincian.',
      tip: 'Isi bilangan bulat saja, tanpa koma.'
    },
    haul: {
      about: 'Tanggal harta dagang pertama kali mencapai nisab. Zakat wajib setelah genap 1 haul (±354 hari) dihitung dari tanggal ini.',
      example: 'Mulai 20 Oktober 2025 → jatuh tempo 9 Oktober 2026. Pilih lewat kalender atau ketik tanggalnya.',
      tip: 'Belum yakin tanggalnya? Kosongkan dulu dan tanyakan ke BAZNAS atau amil zakat.'
    },
    valuation: {
      about: 'Cara menilai barang dagangan yang masih ada di stok. Harga jual: stok dinilai harga jual × jumlah. Harga modal: harga beli × jumlah.',
      example: 'Stok 10 unit, modal Rp7.000, jual Rp10.000 → harga jual = Rp100.000, harga modal = Rp70.000.',
      tip: 'Aplikasi tidak menentukan metode mana yang benar; tanyakan ke amil zakat.'
    },
    cash: {
      about: 'Uang tunai dan saldo rekening usaha saat ini. Bukan omzet dan bukan laba.',
      example: 'Tunai Rp3.500.000 + rekening Rp6.500.000 → ketik 10000000.',
      tip: moneyTip
    },
    receivable: {
      about: 'Uang yang masih ditagih ke pelanggan dan diperkirakan bisa tertagih, misalnya kasbon pelanggan. Piutang yang macet tidak dimasukkan.',
      example: 'Pelanggan A Rp500.000 + pelanggan B Rp750.000 → ketik 1250000.',
      tip: moneyTip
    },
    debt: {
      about: 'Utang usaha yang harus dilunasi dalam waktu dekat atau sudah jatuh tempo, misalnya tagihan supplier. Mengurangi aset bersih.',
      example: 'Tagihan supplier Rp2.000.000 + cicilan jatuh tempo Rp1.000.000 → ketik 3000000.',
      tip: moneyTip
    }
  };

  const statusMeta = {
    NEEDS_GOLD_PRICE: { tone: 'warning', label: 'Butuh harga emas' },
    BELOW_NISAB: { tone: 'neutral', label: 'Di bawah nisab' },
    HAUL_PENDING: { tone: 'warning', label: 'Haul belum genap' },
    DUE: { tone: 'positive', label: 'Sudah wajib' }
  } as const;

  const missingLabel: Record<string, string> = {
    goldPrice: 'harga emas',
    cash: 'kas',
    receivable: 'piutang',
    debt: 'utang',
    haulStart: 'tanggal mulai haul'
  };

  $: result = data.zakat?.result ?? null;
  $: input = data.zakat?.input ?? null;
  $: partial = (result?.missing.length ?? 1) > 0;
  $: haulText =
    !result || result.haul.daysLeft === null
      ? 'Isi tanggal mulai haul.'
      : result.haul.daysLeft > 0
        ? `kira-kira ${result.haul.daysLeft} hari lagi`
        : 'Haul sudah genap.';
  // selisih = asetBersih − nisab   (null bila harga emas belum diisi)
  $: nisabGap = result && result.nisab !== null ? result.netAssets - result.nisab : null;
  $: nisabPct =
    result && result.nisab !== null && result.nisab > 0 ? Math.min(100, Math.max(0, (result.netAssets / result.nisab) * 100)) : 0;
  $: nisabText =
    nisabGap === null ? '' : nisabGap < 0 ? `Kurang ${partial ? '~' : ''}${fmtRupiah(-nisabGap)} lagi untuk mencapai nisab.` : `Sudah ${partial ? '~' : ''}${fmtRupiah(nisabGap)} di atas nisab.`;
</script>

<PageHeader title="Zakat Perdagangan" subtitle="Estimasi 2,5% dari aset bersih setelah 1 haul" />

{#if form?.message}
  <p role="alert" class="rounded border border-status-negative-border bg-status-negative-bg px-3 py-2 text-body-sm text-status-negative mb-4">{form.message}</p>
{/if}

{#if result && input}
  <StatCard tone="navy" class="mb-4">
    <div class="flex flex-col lg:flex-row gap-5 lg:items-center">
      <div class="flex-1 min-w-0">
        <h2 class="text-headline-lg text-white">Hitung zakat usahamu <span class="text-status-positive">dengan data yang kamu isi sendiri</span></h2>
        <p class="text-body-sm text-white/70 mt-2">Harga emas diisi manual dari toko emas langganan — tanpa API eksternal. Estimasi {fmtPercent(ZAKAT_RATE)} dari aset bersih setelah 1 haul.</p>
      </div>
      <div class="rounded-[9px] bg-white/10 px-5 py-4 lg:w-[300px] shrink-0">
        <p class="text-label-sm uppercase text-white/70">Nisab saat ini</p>
        <p class="text-num-display text-white tabular break-words">{result.nisab === null ? '—' : fmtRupiah(result.nisab)}</p>
        <div class="flex gap-5 mt-3 pt-3 border-t border-white/15 text-body-sm">
          <div>
            <p class="text-white/70">Stok ({input.valuation === 'COST' ? 'Modal' : 'Jual'})</p>
            <p class="text-white tabular font-semibold">{fmtRupiah(result.stockValue)}</p>
          </div>
          <div>
            <p class="text-white/70">Kas</p>
            <p class="text-white tabular font-semibold">{input.cash === null ? '—' : fmtRupiah(input.cash)}</p>
          </div>
        </div>
      </div>
    </div>
  </StatCard>

  <StatCard class="mb-4">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <p class="text-num-display lg:text-[48px] font-bold leading-none text-ink tabular break-words [overflow-wrap:anywhere]">
        {partial ? '~' : ''}{fmtRupiah(result.amount)}
      </p>
      <div class="flex flex-col items-end gap-1.5">
        <Badge tone={statusMeta[result.status].tone} class="rounded-full">{statusMeta[result.status].label}</Badge>
        {#if partial}<Badge tone="neutral" class="rounded-full">estimasi parsial</Badge>{/if}
      </div>
    </div>
    {#if nisabGap !== null}
      <p class="mt-2 text-body-sm text-muted">{nisabText}</p>
      <div class="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-status-neutral-bg" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(nisabPct)} aria-label="Posisi aset terhadap nisab">
        <div class="h-full rounded-full {nisabGap >= 0 ? 'bg-status-positive' : 'bg-status-warning'}" style="width: {nisabPct}%"></div>
      </div>
    {/if}
    <p class="mt-1 text-body-sm text-muted">Sisa haul: {haulText}</p>
    {#if partial}
      <p class="mt-2 text-body-sm text-muted">Belum diisi: {result.missing.map((m) => missingLabel[m]).join(', ')} — angka di atas memakai 0 untuk yang kosong.</p>
    {/if}
  </StatCard>

  <Card class="mb-4">
    <h2 class="text-headline-sm text-ink mb-3">Rincian</h2>
    <dl class="flex flex-col gap-1.5 text-body-md">
      <div class="flex justify-between gap-3 border-b border-table-divider py-1.5">
        <dt class="text-muted">Stok ({input.valuation === 'COST' ? 'harga modal' : 'harga jual'})</dt>
        <dd class="tabular text-ink">{fmtRupiah(result.stockValue)}</dd>
      </div>
      <div class="flex justify-between gap-3 border-b border-table-divider py-1.5">
        <dt class="text-muted">Kas</dt>
        <dd class="tabular text-ink">{input.cash === null ? 'belum diisi' : fmtRupiah(input.cash)}</dd>
      </div>
      <div class="flex justify-between gap-3 border-b border-table-divider py-1.5">
        <dt class="text-muted">Piutang lancar</dt>
        <dd class="tabular text-ink">{input.receivable === null ? 'belum diisi' : fmtRupiah(input.receivable)}</dd>
      </div>
      <div class="flex justify-between gap-3 border-b border-table-divider py-1.5">
        <dt class="text-muted">Utang jatuh tempo</dt>
        <dd class="tabular text-ink">{input.debt === null ? 'belum diisi' : fmtRupiah(input.debt)}</dd>
      </div>
      <div class="flex justify-between gap-3 border-b border-table-divider py-1.5">
        <dt class="text-muted">Aset bersih</dt>
        <dd class="tabular font-semibold text-ink">{fmtRupiah(result.netAssets)}</dd>
      </div>
      <div class="flex justify-between gap-3 py-1.5">
        <dt class="text-muted">Nisab ({input.nisabGrams} gram)</dt>
        <dd class="tabular text-ink">{result.nisab === null ? 'isi harga emas dulu' : fmtRupiah(result.nisab)}</dd>
      </div>
    </dl>
    <p class="mt-2 text-body-sm text-muted">Tarif {fmtPercent(ZAKAT_RATE)} × aset bersih, dibayar bila aset bersih mencapai nisab dan haul genap.</p>
  </Card>
{:else}
  <Card class="mb-4">
    <h2 class="text-headline-sm text-ink mb-1">Mulai hitung zakat</h2>
    <p class="text-body-md text-muted">Isi pengaturan dan posisi keuangan di bawah — hasil estimasi muncul di sini.</p>
  </Card>
{/if}

<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
  <Card>
    <h2 class="text-headline-sm text-ink mb-1">Pengaturan zakat</h2>
    <p class="text-body-sm text-muted mb-3">Harga emas diisi manual dari toko emas langganan — tanpa API eksternal.</p>
    <form method="POST" action="?/saveSetting" use:enhance={refresh} class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-1.5 text-body-sm text-ink">
          <label for="z-gold">Harga emas per gram (Rp)</label>
          <FieldHelp id="help-z-gold" label="Harga emas per gram" {...help.gold} />
        </div>
        <Input id="z-gold" type="number" name="goldPrice" min="1" bind:value={goldPrice} placeholder="cth. 1350000" />
      </div>
      {#if data.setting}
        <p class="text-body-sm text-muted">
          {data.setting.goldAgeDays === null ? 'Harga emas belum pernah diisi.' : `Diperbarui ${data.setting.goldAgeDays} hari lalu.`}
          {#if data.setting.goldAgeDays !== null && data.setting.goldAgeDays > 30}
            <Badge tone="warning" size="sm">lebih dari 30 hari — perbarui</Badge>
          {/if}
        </p>
      {/if}
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-1.5 text-body-sm text-ink">
          <label for="z-nisab">Nisab (gram)</label>
          <FieldHelp id="help-z-nisab" label="Nisab" {...help.nisab} />
        </div>
        <Input id="z-nisab" type="number" name="nisabGrams" min="1" bind:value={nisabGrams} />
      </div>
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-1.5 text-body-sm text-ink">
          <label for="z-haul">Tanggal mulai haul</label>
          <FieldHelp id="help-z-haul" label="Tanggal mulai haul" {...help.haul} />
        </div>
        <Input id="z-haul" type="date" name="haulStartDate" bind:value={haulStartDate} />
      </div>
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-1.5 text-body-sm text-ink">
          <label for="z-valuasi">Metode valuasi stok</label>
          <FieldHelp id="help-z-valuasi" label="Metode valuasi stok" {...help.valuation} />
        </div>
        <select id="z-valuasi" name="stockValuation" bind:value={stockValuation} class="flex h-9 w-full rounded border border-border-input bg-white px-3 py-1 text-body-md text-ink">
          <option value="SELLING">Harga jual</option>
          <option value="COST">Harga modal</option>
        </select>
      </div>
      <Button type="submit">Simpan pengaturan</Button>
    </form>
  </Card>

  <Card>
    <h2 class="text-headline-sm text-ink mb-1">Posisi keuangan</h2>
    <p class="text-body-sm text-muted mb-3">Kas adalah saldo tunai + rekening — bukan omzet. Kosongkan bila belum tahu.</p>
    <form method="POST" action="?/saveBalance" use:enhance={refresh} class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-1.5 text-body-sm text-ink">
          <label for="z-cash">Kas (Rp)</label>
          <FieldHelp id="help-z-cash" label="Kas" {...help.cash} />
        </div>
        <Input id="z-cash" type="number" name="cash" min="0" bind:value={cash} placeholder="belum diisi" />
      </div>
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-1.5 text-body-sm text-ink">
          <label for="z-receivable">Piutang lancar (Rp)</label>
          <FieldHelp id="help-z-receivable" label="Piutang lancar" {...help.receivable} />
        </div>
        <Input id="z-receivable" type="number" name="receivable" min="0" bind:value={receivable} placeholder="belum diisi" />
      </div>
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-1.5 text-body-sm text-ink">
          <label for="z-debt">Utang jatuh tempo (Rp)</label>
          <FieldHelp id="help-z-debt" label="Utang jatuh tempo" {...help.debt} />
        </div>
        <Input id="z-debt" type="number" name="debt" min="0" bind:value={debt} placeholder="belum diisi" />
      </div>
      {#if data.setting?.balanceAgeDays !== null && data.setting?.balanceAgeDays !== undefined}
        <p class="text-body-sm text-muted">Diperbarui {data.setting.balanceAgeDays} hari lalu.</p>
      {/if}
      <Button type="submit">Simpan posisi keuangan</Button>
    </form>
  </Card>
</div>

<Card class="mt-4">
  <p class="text-body-sm text-muted">Estimasi berdasarkan data yang Anda isi, bukan fatwa. Konfirmasi ke BAZNAS atau lembaga amil zakat.</p>
</Card>
