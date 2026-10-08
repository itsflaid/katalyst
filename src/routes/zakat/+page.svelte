<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import type { SubmitFunction } from '@sveltejs/kit';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
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

  const refresh: SubmitFunction =
    () =>
    async ({ update }) => {
      await update();
      await invalidateAll();
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
</script>

<PageHeader title="Zakat Perdagangan" subtitle="Estimasi 2,5% dari aset bersih setelah 1 haul" />

{#if form?.message}
  <p role="alert" class="rounded border border-status-negative-border bg-status-negative-bg px-3 py-2 text-body-sm text-status-negative mb-4">{form.message}</p>
{/if}

{#if result && input}
  <Card class="mb-4">
    <div class="flex flex-wrap items-center gap-2">
      <Badge tone={statusMeta[result.status].tone}>{statusMeta[result.status].label}</Badge>
      {#if partial}<Badge tone="neutral">estimasi parsial</Badge>{/if}
    </div>
    <p class="mt-3 text-[15px] leading-5 font-bold sm:text-num-display text-ink tabular break-words [overflow-wrap:anywhere]">
      {partial ? '~' : ''}{fmtRupiah(result.amount)}
    </p>
    <p class="mt-1 text-body-sm text-muted">Sisa haul: {haulText}</p>
    {#if partial}
      <p class="mt-2 text-body-sm text-muted">Belum diisi: {result.missing.map((m) => missingLabel[m]).join(', ')} — angka di atas memakai 0 untuk yang kosong.</p>
    {/if}
  </Card>

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
    <p class="mt-2 text-body-sm text-muted">Tarif {fmtPercent(0.025)} × aset bersih, dibayar bila aset bersih mencapai nisab dan haul genap.</p>
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
      <label for="z-gold" class="flex flex-col gap-1 text-body-sm text-ink">
        Harga emas per gram (Rp)
        <Input id="z-gold" type="number" name="goldPrice" min="0" bind:value={goldPrice} placeholder="cth. 1350000" />
      </label>
      {#if data.setting}
        <p class="text-body-sm text-muted">
          {data.setting.goldAgeDays === null ? 'Harga emas belum pernah diisi.' : `Diperbarui ${data.setting.goldAgeDays} hari lalu.`}
          {#if data.setting.goldAgeDays !== null && data.setting.goldAgeDays > 30}
            <Badge tone="warning" size="sm">lebih dari 30 hari — perbarui</Badge>
          {/if}
        </p>
      {/if}
      <label for="z-nisab" class="flex flex-col gap-1 text-body-sm text-ink">
        Nisab (gram)
        <Input id="z-nisab" type="number" name="nisabGrams" min="1" bind:value={nisabGrams} />
      </label>
      <label for="z-haul" class="flex flex-col gap-1 text-body-sm text-ink">
        Tanggal mulai haul
        <Input id="z-haul" type="date" name="haulStartDate" bind:value={haulStartDate} />
      </label>
      <label for="z-valuasi" class="flex flex-col gap-1 text-body-sm text-ink">
        Metode valuasi stok
        <select id="z-valuasi" name="stockValuation" bind:value={stockValuation} class="flex h-9 w-full rounded border border-border-input bg-white px-3 py-1 text-body-md text-ink">
          <option value="SELLING">Harga jual</option>
          <option value="COST">Harga modal</option>
        </select>
      </label>
      <Button type="submit">Simpan pengaturan</Button>
    </form>
  </Card>

  <Card>
    <h2 class="text-headline-sm text-ink mb-1">Posisi keuangan</h2>
    <p class="text-body-sm text-muted mb-3">Kas adalah saldo tunai + rekening — bukan omzet. Kosongkan bila belum tahu.</p>
    <form method="POST" action="?/saveBalance" use:enhance={refresh} class="flex flex-col gap-3">
      <label for="z-cash" class="flex flex-col gap-1 text-body-sm text-ink">
        Kas (Rp)
        <Input id="z-cash" type="number" name="cash" min="0" bind:value={cash} placeholder="belum diisi" />
      </label>
      <label for="z-receivable" class="flex flex-col gap-1 text-body-sm text-ink">
        Piutang lancar (Rp)
        <Input id="z-receivable" type="number" name="receivable" min="0" bind:value={receivable} placeholder="belum diisi" />
      </label>
      <label for="z-debt" class="flex flex-col gap-1 text-body-sm text-ink">
        Utang jatuh tempo (Rp)
        <Input id="z-debt" type="number" name="debt" min="0" bind:value={debt} placeholder="belum diisi" />
      </label>
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
