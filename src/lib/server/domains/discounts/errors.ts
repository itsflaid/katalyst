// Kode Postgres untuk pelanggaran exclusion constraint.
export const EXCLUSION_VIOLATION = '23P01';

// Galat balapan overlap (lolos cek aplikasi) ke pesan ramah; null bila bukan galat itu.
export function overlapDbMessage(e: unknown, clashName: string | null): string | null {
	const err = e as { code?: unknown; cause?: { code?: unknown } };
	const code = err?.code ?? err?.cause?.code;
	if (code !== EXCLUSION_VIOLATION) return null;
	return clashName
		? `Rentang waktu bertabrakan dengan diskon "${clashName}".`
		: 'Rentang waktu bertabrakan dengan diskon lain untuk produk ini.';
}
