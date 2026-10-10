<script lang="ts">
  import type { SubmitFunction } from "@sveltejs/kit";
  import { enhance } from "$app/forms";
  import Input from "$lib/components/ui/Input.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import SlideOver from "$lib/components/ui/SlideOver.svelte";
  import { isBelowCost, resolveWindow, unitDiscount, type WindowPreset } from "$lib/discount";
  import type { BizTime } from "$lib/shared/time";
  import type { DiscountRow } from "$lib/components/discount/DiscountTable.svelte";

  export let mode: 'create' | 'edit';
  export let discount: DiscountRow | null = null;
  export let products: { id: string; name: string; sellingPrice: number; costPrice: number; isActive: boolean }[] = [];
  export let T: BizTime;
  // Nilai awal prefill (dari simulator via ?new=1). Komponen dibuat fresh
  // tiap slide-over dibuka, jadi inisialisasi `let` cukup.
  export let initial: { productId?: string; percent?: string; quota?: string; preset?: string } | null = null;
  export let baselineLabel: string | null = null;
  export let form: { message?: string; code?: string; lossProducts?: { id: string; name: string }[] } | null = null;
  export let onSubmit: SubmitFunction;
  export let onClose: () => void;

  const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
  const PRESETS: { value: WindowPreset; label: string }[] = [
    { value: 'TODAY', label: 'Hari ini' },
    { value: 'DAYS_2', label: '2 hari' },
    { value: 'DAYS_7', label: 'Seminggu' },
    { value: 'CUSTOM', label: 'Custom' },
    { value: 'OPEN', label: 'Tanpa batas waktu' }
  ];
  const validPreset = (v: string | undefined): WindowPreset =>
    v === 'TODAY' || v === 'DAYS_2' || v === 'DAYS_7' || v === 'CUSTOM' || v === 'OPEN' ? v : 'TODAY';

  // State create
  let cName = "";
  let cScope: 'PRODUCT' | 'GLOBAL' = "PRODUCT";
  let cProductId = initial?.productId ?? "";
  let cPercent = initial?.percent ?? "";
  let cPreset: WindowPreset = validPreset(initial?.preset);
  let cStartDay = "";
  let cQuota = initial?.quota ?? "";
  let cEndDay = "";
  let cConfirmLoss = false;

  // State edit (disalin dari discount agar Batal tidak mengotori tabel)
  const e = discount;
  let eName = e?.name ?? "";
  let ePercent = e ? String(e.percent) : "";
  let ePreset: WindowPreset = e?.endsAt ? 'CUSTOM' : 'OPEN';
  let eStartDay = e && new Date(e.startsAt) > new Date() ? T.dayKey(new Date(e.startsAt)) : "";
  let eEndDay = e?.endsAt ? T.dayKey(new Date(e.endsAt)) : "";
  let eQuota = e?.quota !== null && e?.quota !== undefined ? String(e.quota) : "";
  let eConfirmLoss = false;

  // Unifikasi agar markup form bisa dipakai dua mode (create vs edit).
  $: isCreate = mode === 'create';
  $: scope = isCreate ? cScope : (e?.scope ?? 'PRODUCT');
  $: preset = isCreate ? cPreset : ePreset;
  $: startDay = isCreate ? cStartDay : eStartDay;
  $: endDay = isCreate ? cEndDay : eEndDay;
  $: quotaRaw = isCreate ? cQuota : eQuota;
  $: percentRaw = isCreate ? cPercent : ePercent;
  $: productId = isCreate ? cProductId : (e?.productId ?? '');

  // Global wajib berbatas waktu: jangan biarkan preset OPEN terpilih.
  $: if (isCreate && cScope === 'GLOBAL' && cPreset === 'OPEN') cPreset = 'TODAY';
  $: selectedProduct = products.find((p) => p.id === productId) ?? null;

  // Preview langsung: akhir jendela dihitung dengan aturan server yang sama.
  // T diteruskan sebagai argumen agar reaktif saat zona berubah (Svelte 4).
  $: preview = ((T) => {
    const w = resolveWindow(preset, new Date(), T, {
      startDay: startDay.trim() || undefined,
      endDay: endDay.trim() || undefined
    });
    if ('error' in w) return { text: w.error, ok: false };
    if (w.endsAt === null) return { text: `Tanpa batas waktu · mulai ${T.fmt(w.startsAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} ${T.short}`, ok: true };
    return { text: `Berakhir ${T.fmt(w.endsAt, { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} ${T.short}`, ok: true };
  })(T);

  // Ringkasan harga dari harga jual & modal saat ini.
  $: pct = Number(percentRaw);
  $: priceInfo = ((sp) => {
    if (!sp || !Number.isInteger(pct) || pct < 1 || pct > 100) return null;
    const disc = unitDiscount(sp.sellingPrice, pct);
    return { price: sp.sellingPrice, after: sp.sellingPrice - disc, cost: sp.costPrice, loss: isBelowCost(sp.sellingPrice, sp.costPrice, pct) };
  })(selectedProduct);

  // Peringatan non-blokir: tanpa batas waktu DAN tanpa kuota ≈ ganti harga.
  $: permanent = scope === 'PRODUCT' && preset === 'OPEN' && quotaRaw.trim() === '';
  $: quotaHint = scope === 'PRODUCT' ? 'Kosongkan = tanpa batas. Dihitung dalam unit.' : 'Diskon global tidak memakai kuota.';
</script>

<SlideOver title={isCreate ? 'Tambah Diskon' : 'Edit Diskon'} onClose={onClose}>
  <form method="POST" action={isCreate ? '?/create' : '?/update'} use:enhance={onSubmit} class="flex flex-col gap-3">
    {#if !isCreate && e}
      <input type="hidden" name="id" value={e.id} />
      <input type="hidden" name="scope" value={e.scope} />
      {#if e.productId}<input type="hidden" name="productId" value={e.productId} />{/if}
    {/if}

    {#if isCreate && baselineLabel}
      <p class="rounded border border-border-cool bg-table-header px-3 py-2 text-body-sm text-muted">Nilai awal dari simulator (baseline: {baselineLabel})</p>
    {/if}
    {#if !isCreate && e}
      <p class="text-body-sm text-muted">Terpakai {e.quotaUsed} unit · status tidak diubah dari sini.</p>
    {/if}

    <label for="d-name" class="flex flex-col gap-1 text-body-md text-ink">
      Nama diskon
      {#if isCreate}
        <Input id="d-name" name="name" bind:value={cName} maxlength={60} placeholder="Contoh: Promo Kemerdekaan 15%" required />
      {:else}
        <Input id="d-name" name="name" bind:value={eName} maxlength={60} required />
      {/if}
    </label>

    {#if isCreate}
      <fieldset class="flex flex-col gap-1 text-body-md text-ink">
        <legend class="text-body-md">Cakupan</legend>
        <label class="flex items-center gap-2">
          <input type="radio" name="scope" value="PRODUCT" bind:group={cScope} class="h-4 w-4 accent-ink-navy" />
          Produk (otomatis berlaku)
        </label>
        <label class="flex items-center gap-2">
          <input type="radio" name="scope" value="GLOBAL" bind:group={cScope} class="h-4 w-4 accent-ink-navy" />
          Global / semua produk (dipilih di kasir)
        </label>
      </fieldset>
    {:else}
      <p class="text-body-md text-ink">Cakupan: <strong>{e?.scope === 'PRODUCT' ? `Produk (${e?.productId ? (products.find((p) => p.id === e?.productId)?.name ?? '-') : '-'})` : 'Global / semua produk'}</strong> <span class="text-body-sm text-muted">(tidak bisa diubah)</span></p>
    {/if}

    {#if scope === 'PRODUCT' && isCreate}
      <label for="d-product" class="flex flex-col gap-1 text-body-md text-ink">
        Produk
        <select id="d-product" name="productId" bind:value={cProductId} class="h-9 w-full rounded border border-border-input bg-white px-3 text-body-md text-ink" required>
          <option value="">- Pilih produk -</option>
          {#each products as p}
            <option value={p.id}>{p.name} · jual {idr(p.sellingPrice)} · modal {idr(p.costPrice)}{p.isActive ? '' : ' (nonaktif)'}</option>
          {/each}
        </select>
      </label>
    {/if}

    <label for="d-percent" class="flex flex-col gap-1 text-body-md text-ink">
      Diskon (%)
      {#if isCreate}
        <Input id="d-percent" name="percent" type="number" min="1" max="100" step="1" bind:value={cPercent} placeholder="15" required />
      {:else}
        <Input id="d-percent" name="percent" type="number" min="1" max="100" step="1" bind:value={ePercent} required />
      {/if}
    </label>

    {#if priceInfo}
      <p class="text-body-md text-ink tabular">{idr(priceInfo.price)} → <strong>{idr(priceInfo.after)}</strong> <span class="text-body-sm text-muted">(modal {idr(priceInfo.cost)})</span></p>
    {/if}

    <fieldset class="flex flex-col gap-1 text-body-md text-ink">
      <legend class="text-body-md">Berlaku</legend>
      {#each PRESETS as pr}
        <label class="flex items-center gap-2 {scope === 'GLOBAL' && pr.value === 'OPEN' ? 'text-muted' : ''}">
          {#if isCreate}
            <input type="radio" name="preset" value={pr.value} bind:group={cPreset} disabled={scope === 'GLOBAL' && pr.value === 'OPEN'} class="h-4 w-4 accent-ink-navy" />
          {:else}
            <input type="radio" name="preset" value={pr.value} bind:group={ePreset} disabled={scope === 'GLOBAL' && pr.value === 'OPEN'} class="h-4 w-4 accent-ink-navy" />
          {/if}
          {pr.label}
        </label>
      {/each}
      <label for="d-startday" class="flex flex-col gap-1 mt-1">
        <span class="text-body-sm text-muted">Mulai tanggal (opsional, default hari ini)</span>
        {#if isCreate}
          <input id="d-startday" type="date" name="startDay" bind:value={cStartDay} class="h-9 rounded border border-border-input bg-white px-2 text-body-sm text-ink" />
        {:else}
          <input id="d-startday" type="date" name="startDay" bind:value={eStartDay} class="h-9 rounded border border-border-input bg-white px-2 text-body-sm text-ink" />
        {/if}
      </label>
      {#if preset === 'CUSTOM'}
        <label for="d-endday" class="flex flex-col gap-1">
          <span class="text-body-sm text-muted">Tanggal akhir</span>
          {#if isCreate}
            <input id="d-endday" type="date" name="endDay" bind:value={cEndDay} class="h-9 rounded border border-border-input bg-white px-2 text-body-sm text-ink" required />
          {:else}
            <input id="d-endday" type="date" name="endDay" bind:value={eEndDay} class="h-9 rounded border border-border-input bg-white px-2 text-body-sm text-ink" required />
          {/if}
        </label>
      {/if}
      <p class="text-body-sm {preview.ok ? 'text-muted' : 'text-status-negative'}">{preview.text}</p>
    </fieldset>

    {#if scope === 'PRODUCT'}
      <label for="d-quota" class="flex flex-col gap-1 text-body-md text-ink">
        Kuota (unit)
        {#if isCreate}
          <Input id="d-quota" name="quota" type="number" min="1" max="1000000" step="1" bind:value={cQuota} placeholder="Kosongkan = tanpa batas" />
        {:else}
          <Input id="d-quota" name="quota" type="number" min="1" max="1000000" step="1" bind:value={eQuota} placeholder="Kosongkan = tanpa batas" />
        {/if}
        <span class="text-body-sm text-muted">{quotaHint}</span>
      </label>
    {:else}
      <p class="text-body-sm text-muted">{quotaHint}</p>
    {/if}

    {#if permanent}
      <p class="rounded border border-status-warning-border bg-status-warning-bg px-3 py-2 text-body-sm text-status-warning">Diskon permanen sebaiknya diganti dengan mengubah harga jual.</p>
    {/if}

    {#if form?.code === 'BELOW_COST'}
      <div class="rounded border border-status-negative-border bg-status-negative-bg px-3 py-2">
        <p class="text-body-sm text-status-negative">{form.message}</p>
        <label class="mt-2 flex items-start gap-2 text-body-sm text-ink">
          {#if isCreate}
            <input type="checkbox" name="confirmLoss" bind:checked={cConfirmLoss} class="mt-0.5 h-4 w-4 accent-ink-navy" />
          {:else}
            <input type="checkbox" name="confirmLoss" bind:checked={eConfirmLoss} class="mt-0.5 h-4 w-4 accent-ink-navy" />
          {/if}
          Saya paham, tetap simpan
        </label>
      </div>
    {/if}

    {#if form?.message && form?.code !== 'BELOW_COST'}<p role="alert" class="text-body-sm text-status-negative">{form.message}</p>{/if}

    <div class="flex justify-end gap-2 mt-1">
      <Button variant="secondary" type="button" on:click={onClose}>Batal</Button>
      <Button type="submit">Simpan</Button>
    </div>
  </form>
</SlideOver>
