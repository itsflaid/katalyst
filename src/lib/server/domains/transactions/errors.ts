// CHECK ..._nonneg / ..._not_exceeded (SQLSTATE 23514) meledak kalau stok terpotong minus atau kuota diskon terlampaui, ada kasir lain yang menghabiskan stok/kuota di sela validasi dan penyimpanan.
// Bentuk error beda antar driver/versi (kode di error langsung atau di `cause`), jadi nama constraint dicari di keduanya.
export function checkViolationName(e: unknown): string | null {
  const err = e as {
    code?: unknown;
    constraint?: unknown;
    message?: unknown;
    cause?: { code?: unknown; constraint?: unknown; message?: unknown };
  } | null;
  const hay = `${String(err?.code ?? '')} ${String(err?.constraint ?? '')} ${String(err?.message ?? '')} ${String(err?.cause?.code ?? '')} ${String(err?.cause?.constraint ?? '')} ${String(err?.cause?.message ?? '')}`;
  if (/discount_quota_not_exceeded/.test(hay)) return 'discount_quota_not_exceeded';
  if (/product_stock_nonneg/.test(hay)) return 'product_stock_nonneg';
  if (err?.code === '23514' || err?.cause?.code === '23514') return 'check_23514';
  return null;
}
