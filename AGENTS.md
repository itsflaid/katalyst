# AGENTS.md

Aturan menulis komentar di repo ini. Berlaku untuk agen dan manusia, di semua file (`.ts`, `.svelte`, `.js`, `.cjs`, `.css`, `.jsonc`, skrip).

## Prinsip

Kode menjelaskan apa yang terjadi. Komentar hanya untuk yang tidak terlihat dari kode: alasan, jebakan, invarian, satuan, dan rumus. Kalau ragu, jangan tulis.

## Aturan

1. **Kenapa, bukan apa.** Komentar yang menerjemahkan kode ke kalimat dihapus.
2. **Maksimal 3 baris** per komentar lebih bagus 1 baris aja, 3 baris untuk kondisi tertentu saja. Kalau lebih panjang, perbaiki nama atau struktur kodenya. Pengecualian: blok rumus.
3. **Tanpa hiasan.** Tidak ada banner, garis (`// ----`, `// ====`), kotak, judul berbingkai (`// --- Judul ---`), atau emoji. Pemisah bagian cukup baris kosong.
4. **Tanpa rujukan ke dokumen di luar repo**: `§3`, `SPEC`, `Fase 4`, `PR5`, nomor tiket. Tulis aturannya langsung. File di repo boleh dirujuk dengan path yang benar-benar ada.
5. **Tanpa riwayat.** Komentar menggambarkan kode apa adanya. Jangan tulis "dulu X, kini Y", "pengganti …", "hasil refactor", "tidak lagi …". Riwayat ada di pesan commit. Kata "sekarang" dan "sebelumnya" boleh bila istilah domain ("harga sekarang", "periode sebelumnya"), bukan perbandingan dengan versi kode.
6. **Tanpa penekanan kosong**: huruf kapital (`WAJIB`, `SATU-SATUNYA`) atau tanda seru. Peringatan yang nyata ditulis datar beserta alasannya.
7. **Kode mati dihapus**, bukan dikomentari.
8. **`TODO(kondisi): …`** harus punya kondisi atau isu. TODO tanpa kondisi tidak diterima.
9. **JSDoc** hanya untuk API publik yang tidak sepele: satu kalimat, plus satuan atau parameter yang tidak jelas. Tidak ada `@param x - nilai x`.
10. **Bahasa**: komentar Indonesia, identifier Inggris. Direktif (`@ts-expect-error`, `eslint-disable`, `svelte-ignore`, `/// <reference>`) tidak diubah.

## Komentar rumus

Rumus bisnis ditulis tepat di atas kode yang menghitungnya, satu baris per rumus:

```ts
// nama = rumus
```

Rumus bisnis = angka yang tampil ke pengguna atau memengaruhi keputusan: revenue, profit, margin, delta, diskon, penyebab perubahan, simulasi, stok.

- Nama di kiri sama dengan identifier di kode. Bila tidak ada identifier, pakai frasa pendek (`efek volume`).
- Rumus yang berkaitan ditulis berurutan dalam satu blok tanpa baris kosong; `=` boleh disejajarkan. Blok rumus tidak dibatasi 3 baris, tapi tiap barisnya tetap berbentuk `nama = rumus`.
- Operator boleh memakai simbol ringkas (`× − Σ ≤`) agar mudah dibaca; selain itu seperti di kode.
- Satuan dan kasus tepi di akhir baris dalam kurung: `(Rupiah)`, `(0 bila revenue = 0)`.
- Ditulis sekali, di tempat rumus diimplementasikan (engine, simulasi, fragmen SQL). Pemanggil yang hanya memakai fungsinya tidak mengulang rumus.
- Rumus di komentar harus sama dengan kodenya. Mengubah rumus berarti mengubah komentarnya di commit yang sama.
- Aritmetika sepele (`i + 1`, `a + b`) bukan rumus bisnis; tidak perlu komentar.

Contoh:

```ts
export function metricsOf(f: Facts): Metrics {
  // revenue = gross - discount
  // profit  = revenue - cost
  // margin  = profit / revenue   (0 bila revenue = 0)
  const revenue = f.gross - f.discount;
  const profit = revenue - f.cost;
  // ...
}
```

## Contoh komentar

| Jangan | Gunakan |
|---|---|
| `// ---------- Inventori ----------` | hapus; pisahkan dengan baris kosong |
| `// Hitung total revenue` di atas `sum(...)` | hapus |
| `// Dulu pakai harga list, kini harga net` | `// Memakai harga net: diskon sudah dipotong.` |
| `// Lihat SPEC Fase 4 §3` | tulis aturannya langsung, atau hapus |
| `// PENTING!!! JANGAN DIUBAH` | `// Urutan menentukan prioritas; jangan diurutkan ulang.` |
| `// TODO: perbaiki` | `// TODO(kuota habis di tengah keranjang): tampilkan peringatan.` |

Komentar alasan yang baik:

```ts
// Hari dihitung di zona bisnis: transaksi 00:30 WITA masih tanggal sebelumnya di UTC.
```

## Sebelum commit

- Jalankan `npm run verify:arch`; ia memeriksa bentuk komentar (banner, rujukan dokumen, kata riwayat, panjang, TODO tanpa kondisi).
- Baca ulang komentar yang baru ditulis: masih benar dan berguna bagi orang yang tidak ikut diskusinya?

Pekerjaan Copilot: baca docs/copilot/STATUS.md dan docs/copilot/PRD.md sebelum mulai.