# Rencana Fase 5 — Riwayat Copilot Server

## Tujuan

Riwayat Copilot tersimpan di server supaya Owner yang sama dapat membuka percakapan dari perangkat lain. Riwayat tetap private per bisnis dan hanya Owner yang dapat membaca atau menghapusnya.

## Lingkup

- Simpan percakapan dan pesan Copilot di PostgreSQL/Neon.
- Sidebar memuat 20 percakapan terbaru milik bisnis aktif.
- Owner dapat membuka, membuat baru, menghapus satu, dan menghapus semua riwayat bisnisnya.
- Pesan user, jawaban assistant, dan hasil tool disimpan agar kartu lama dapat dibaca lagi.
- Endpoint chat memakai riwayat server, maksimal enam pesan teks terakhir sebagai konteks LLM.
- LocalStorage lama hanya dibersihkan setelah server mengembalikan riwayat; jangan mencoba mengimpor otomatis karena data browser tidak dapat dipastikan milik bisnis aktif.

Di luar lingkup: akses Staff, berbagi percakapan, pencarian, ekspor, sinkronisasi offline, dan pengiriman seluruh riwayat ke LLM.

## Model data dan migrasi

Tambahkan migrasi Drizzle setelah migrasi terakhir yang ada.

`copilot_conversation`:

| Kolom | Tipe | Aturan |
|---|---|---|
| `id` | text PK | UUID dari server |
| `business_id` | text FK `business` | wajib, indeks bersama `updated_at` |
| `title` | text | awalnya `Percakapan baru`, diperbarui dari pesan user pertama, maks. 80 karakter |
| `created_at` | timestamp | wajib |
| `updated_at` | timestamp | wajib, dipakai urutan sidebar |

`copilot_message`:

| Kolom | Tipe | Aturan |
|---|---|---|
| `id` | text PK | UUID dari server |
| `conversation_id` | text FK `copilot_conversation` cascade | wajib, indeks bersama `created_at` |
| `role` | enum `user`/`assistant`/`tool`/`notice` | wajib |
| `content` | text | teks jawaban atau label tool; maks. 8.000 karakter |
| `tool_name` | text nullable | hanya untuk `tool` |
| `tool_result` | jsonb nullable | amplop hasil tool penuh untuk kartu lama |
| `created_at` | timestamp | wajib |

Tambahkan indeks `copilot_conversation(business_id, updated_at)` dan `copilot_message(conversation_id, created_at)`. Tidak ada data bisnis, user, atau tool yang boleh menerima `businessId` dari body request; scope selalu dari session.

## Endpoint

Semua endpoint berada di `/copilot`, menggunakan guard login/Owner yang telah ada dan memeriksa `locals.user.role === 'OWNER'` lagi di handler.

| Endpoint | Fungsi |
|---|---|
| `GET /copilot/conversations` | Maks. 20 judul terbaru untuk sidebar. |
| `POST /copilot/conversations` | Buat percakapan kosong. |
| `GET /copilot/conversations/[id]` | Muat percakapan dan pesan, hanya bila milik bisnis session. |
| `DELETE /copilot/conversations/[id]` | Hapus satu percakapan setelah konfirmasi UI. |
| `DELETE /copilot/conversations` | Hapus seluruh riwayat bisnis setelah konfirmasi UI. |
| `POST /copilot/chat` | Terima `conversationId` dan pesan user terakhir; simpan user message, stream jawaban, lalu simpan event hasil. |

`POST /copilot/chat` menolak `conversationId` yang tidak milik bisnis aktif dengan 404. Jika tidak ada `conversationId`, endpoint membuat percakapan baru dan mengirim ID-nya pada event SSE `conversation` sebelum `tool_start`.

## Alur streaming

1. Validasi request, Owner, origin, dan kepemilikan percakapan.
2. Simpan pesan user dan perbarui judul bila ini pertanyaan pertama.
3. Ambil enam pesan `user`/`assistant` terbaru; pesan `tool` dan `notice` tidak masuk konteks LLM.
4. Jalankan loop Copilot yang sudah ada.
5. Saat `tool_result`, kirim SSE terlebih dahulu lalu simpan baris `tool` dengan payload penuh.
6. Saat grounding lolos, simpan baris `assistant` sebelum `done`.
7. Saat grounding gagal, simpan baris `notice`; jangan menyimpan teks berangka yang ditahan.
8. Perbarui `updated_at` percakapan pada setiap pesan tersimpan.

Kegagalan tulis DB setelah tool/teks sudah dikirim harus dicatat di server dan menghasilkan event `error`; jangan mengirim ulang respons LLM. Tabel riwayat adalah satu-satunya pengecualian write untuk domain Copilot.

## UI

Pertahankan visual halaman `/copilot` yang ada.

- Saat halaman dimuat, ambil daftar percakapan server lalu buka yang terbaru.
- Tombol tambah membuat percakapan via server dan menjadikannya aktif.
- Tombol hapus tampil per item saat hover/focus; dialog konfirmasi menjelaskan bahwa semua pesan dan kartu tool di percakapan itu akan terhapus.
- Sediakan tindakan `Hapus semua riwayat` di bagian bawah sidebar dengan dialog konfirmasi terpisah.
- Simpan state `loading`, `empty`, `error`, dan `deleting`; jangan membuat sidebar kosong sementara request gagal.
- Hapus key localStorage lama hanya setelah daftar server berhasil dimuat. Bila request gagal, tetap tampilkan pemberitahuan dan jangan menghapus data lokal.

## Verifikasi

- Tes query: bisnis A tidak bisa membaca, menulis, atau menghapus riwayat bisnis B.
- Tes endpoint: Staff mendapat 403; percakapan asing mendapat 404; origin asing mendapat 403.
- Tes streaming: urutan event `conversation` → `tool_start` → `tool_result` → `text`/`notice` → `done`; reload halaman menampilkan kartu hasil dan teks yang sama.
- Tes grounding gagal: hanya `notice` dan hasil tool yang tersimpan, tanpa teks akhir yang ditahan.
- Tes UI: buka dari dua browser dengan Owner yang sama, percakapan yang dikirim di browser pertama muncul setelah refresh browser kedua.
- Jalankan `npm run check`, `npm run verify:all`, `npm run verify:arch`, serta skrip verifikasi baru sebelum commit.

## Urutan kerja OpenCode

1. Schema dan migrasi, lalu query server yang menerima `db` lewat argumen untuk tes.
2. Endpoint daftar/detail/buat/hapus dengan tes isolasi bisnis.
3. Integrasikan penyimpanan ke endpoint SSE tanpa mengubah kontrak tool atau grounding.
4. Ganti state localStorage UI menjadi fetch server dan tambahkan dialog hapus.
5. Jalankan tes dua browser dan eval 12 pertanyaan Groq nyata.
