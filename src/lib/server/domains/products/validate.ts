// Validasi form produk. Murni tanpa db/$env biar bisa dites pakai tsx.

// Batas keras kolom integer Postgres (int4).
export const INT4_MAX = 2_147_483_647;
// Harga per unit; sengaja jauh di bawah INT4_MAX. Naikkan bila ada produk lebih mahal, jangan lewat INT4_MAX.
export const MAX_PRICE = 100_000_000;

// Field form tambah/edit sengaja tanpa `stock`: stok hanya berubah lewat
// ledger (penjualan, restock, koreksi).
export function parseProductFields(form: FormData) {
  const name = String(form.get('name') ?? '').trim();
  const costRaw = Number(form.get('costPrice'));
  const sellRaw = Number(form.get('sellingPrice'));
  const isActive = form.get('isActive') === 'on';
  const minRaw = form.get('minStock');
  const minStock = minRaw === null || minRaw === '' ? 5 : Number(minRaw);
  if (!name) return { error: 'Nama produk wajib diisi.' };
  // Cek mentah sebelum dibulatkan: 0.4 harus ditolak, bukan jadi 0.
  if (!Number.isFinite(costRaw) || !Number.isFinite(sellRaw)) {
    return { error: 'Harga harus angka yang valid.' };
  }
  const cost = Math.round(costRaw);
  const sell = Math.round(sellRaw);
  if (cost < 0 || cost > MAX_PRICE) return { error: 'Harga modal harus 0–Rp 100.000.000.' };
  if (sell < 1 || sell > MAX_PRICE) return { error: 'Harga jual harus Rp 1–Rp 100.000.000.' };
  if (!Number.isInteger(minStock) || minStock < 0 || minStock > 100000) {
    return { error: 'Batas stok menipis harus bilangan bulat 0–100000.' };
  }
  return {
    data: { name, costPrice: cost, sellingPrice: sell, isActive, minStock }
  };
}

export function parseInitialStock(form: FormData) {
  const raw = form.get('stock');
  const stock = raw === null || raw === '' ? 0 : Number(raw);
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
    return { error: 'Stok awal harus bilangan bulat 0–1000000.' };
  }
  return { data: stock };
}
