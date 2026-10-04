# PRD — Katalyst Copilot Demo

| | |
|---|---|
| Target | Demo siap dalam 3–5 hari kerja, sebelum final OASE III 15 Oktober 2026 |
| Pengguna | Owner usaha, bahasa Indonesia |
| Janji produk | AI menjelaskan data; angka selalu berasal dari engine Katalyst. |

## 1. Lingkup rilis demo

Copilot adalah halaman tanya-jawab Owner. Groq hanya memilih tool dan merangkai jawaban. Server menghitung angka dari database, lalu mengirim kartu hasil dan teks yang diperiksa terhadap angka hasil tool.

Lima tool yang wajib demo:

| ID | Tool | Contoh |
|---|---|---|
| TL-1 | `get_summary` | “Omzet minggu ini berapa?” |
| TL-2 | `rank_products` | “Produk paling laku?” |
| TL-3 | `compare_periods` | “Bandingkan bulan ini dan lalu.” |
| TL-4 | `explain_change` | “Kenapa profit turun?” |
| TL-5 | `simulate_price` | “Kalau harga naik Rp2.000?” |

TL-6 (`get_inventory`), TL-7 (`get_product_detail`), dan TL-8 (`get_insights`) menyusul setelah lima tool inti, UI, dan evaluasi sudah hijau. Tool tidak tersedia dijawab jujur, bukan ditebak.

Di luar lingkup demo: aksi tulis, forecasting, akses Staff, riwayat server, preset Simulator, stok mati, promo, toleransi typo, dan perubahan Dashboard/Statistik selain perbaikan yang benar-benar memblokir tool.

## 2. Batas yang tidak boleh berubah

- Read-only; `businessId` hanya dari session dan Owner-only diperiksa di endpoint.
- Data lintas bisnis tidak pernah diterima sebagai argumen tool.
- Rumus memakai `Facts`, `metricsOf`, dan `simulate()` yang sudah ada.
- Setiap angka yang dapat disebut model memiliki pasangan `Text`; jawaban berisi token `Rp` atau `%` yang tidak ada di hasil tool ditahan, lalu dicoba ulang sekali tanpa mengubah `LlmEvent`.
- Maksimum 45 subrequest, 5 langkah LLM, dan 6 panggilan tool per jawaban.
- Tidak menambah dependensi npm. Konfigurasi Groq tetap terbatas pada `domains/copilot/llm/`.

## 3. Kontrak ringkas

`POST /copilot/chat` menerima maksimal enam pesan user/assistant, masing-masing 800 karakter. SSE mengirim `tool_start`, `tool_result`, `text`, `notice`, lalu `done`; galat penyedia memakai `error`.

Tool menerima `(ctx, args)`, dengan `ctx` berisi database per-request, waktu, zona bisnis, dan anggaran. Validator menolak argumen/kunci asing. Hasil memakai amplop `{ ok, tool, data, notes }` atau `{ ok: false, tool, error }`.

Periode yang didukung: `today`, `this_week`, `this_month`, `last_30d`, dan `custom` (maksimum 366 hari). Perbandingan memakai jendela sebelumnya dengan panjang yang sama. Produk hanya cocok bila nama persis atau substring; bila lebih dari satu, tool meminta klarifikasi.

## 4. Rencana 5 hari

| Hari | Hasil |
|---|---|
| 1 | Formatter, periode, context/validator/resolver, query yang diperlukan, TL-1. |
| 2 | TL-2, TL-3, TL-4 dan skrip verifikasi DB/CLI. |
| 3 | TL-5, loop tool, grounding satu kali retry, batas harian sederhana bila masih diperlukan. |
| 4 | TL-6–8, UI chat nyata, kartu hasil, dan riwayat localStorage. |
| 5 | Tampilan mobile, eval 12–15 pertanyaan, deploy Free, dan load test 20 pertanyaan. |

Urutan potong bila waktu habis: TL-8, lalu TL-7, dan TL-6. TL-1–5 tetap dipertahankan karena memperlihatkan jawaban, analisis, dan keputusan bisnis.

## 5. Gerbang selesai

Demo selesai bila Owner dapat mengirim pertanyaan nyata di `/copilot`, tiap tool inti mengembalikan angka yang sama dengan engine, angka tak berdasar tidak tampil, dan `npm run check`, `npm run verify:all`, `npm run verify:arch`, serta evaluasi 12–15 soal hijau.

Evaluasi minimal mencakup ringkasan, ranking, perbandingan, simulasi, inventori, produk ambigu, data kosong, pertanyaan di luar data, penolakan aksi tulis, dan satu pertanyaan gabungan. Tambahkan lima pertanyaan bebas dari calon juri saat gladi bersih.

## 6. Keputusan implementasi

- Groq tetap streaming; kontrak `LlmEvent` yang sudah ada dipertahankan.
- Batas harian DB 40 jawaban dipertahankan bila tabel/migrasinya sudah ringan; bila belum ada pada akhir Hari 3, buang dari demo dan lindungi demo lewat rate limit penyedia.
- Simulator memakai tautan biasa tanpa preset skenario.
- Cloudflare Free digunakan bersyarat: cek beban 20 pertanyaan dan `budgetUsed <= 45`; pindah paket hanya bila batas nyata terlewati.

Dokumen penuh v1.1 tersimpan di riwayat Git. `STATUS.md` adalah sumber kemajuan harian.

## 7. Fase 5 — Riwayat percakapan

Riwayat bukan bagian dari jawaban AI dan tidak boleh menghambat demo. Setelah Fase 4, simpan percakapan di localStorage agar Owner dapat membuka percakapan sebelumnya, membuat percakapan baru, dan menghapus riwayat lokal. Riwayat server hanya dibuat bila kebutuhan sinkronisasi antar perangkat muncul; tidak ada data percakapan dikirim ke server selain konteks enam pesan yang dibutuhkan request aktif.
