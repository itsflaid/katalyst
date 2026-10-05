# Copilot — STATUS

Sumber kebenaran **kemajuan**. `PRD.md` (di folder yang sama) adalah sumber kebenaran **lingkup**. Perbarui file ini di akhir setiap sesi, oleh agen mana pun.

## Cara memakai

1. Awal sesi: baca file ini, pilih tugas `[ ]` pertama yang prasyaratnya selesai.
2. Kerjakan hanya tugas itu (maks 3 bila saling bergantung), di branch `feat/copilot`.
3. Akhir sesi: centang tugas, isi "Pengukuran" bila ada angka baru, tambah satu baris di "Log sesi", catat penyimpangan dari PRD.

## Keputusan

| ID | Keputusan | Status |
|---|---|---|
| D1 | Penyedia: Groq (API OpenAI-compatible), adapter portabel | final |
| D1b | Kolam model Groq dengan failover otomatis (anggota dan urutan) | ditentukan eval T3.6 |
| D2 | Inventori hanya produk aktif | final |
| D3 | Batas harian 40 per bisnis (`COPILOT_DAILY_LIMIT`), dasar token kolam | final |
| D4 | Jawaban dibuffer sampai pembumian lolos | final |
| D5 | Tanpa pembulatan | final |
| D6 | `custom` maks 366 hari | final |
| D7 | Nama kasir ke LLM | gugur di v1 |
| D8 | Cloudflare Free, anggaran ≤ 45 subrequest | ditentukan data T0.4 |
| D9 | Grounding gagal: teks ditahan, kartu + notice | final |
| D10 | Lingkup v1 = TL-1..8, garis potong H−21 | final |
| D11 | Paket Groq: Free; naik ke Developer plan bila eval/juri membentur limit | ditentukan data |

## Pengukuran

| Item | Nilai | Sumber dan tanggal |
|---|---|---|
| Limit `openai/gpt-oss-120b` dan `openai/gpt-oss-20b` (masing-masing) | 30 RPM, 1K RPD, 8K TPM, 200K TPD | console Groq, Settings → Limits, 3 Okt 2026 22.56, org Personal / Default Project (limit dasar organisasi) |
| Limit `qwen/qwen3.8-27b` | 30 RPM, 1K RPD, 8K TPM, 200K TPD | idem; ID persis dikonfirmasi pemilik 4 Okt 2026 (langsung dari Groq console) |
| Limit `allam-2-7b` | 30 RPM, 7K RPD, 6K TPM, 500K TPD | idem; dilepas dari kandidat oleh pemilik 4 Okt 2026 (model Arab-Inggris) |
| Model di akun yang bukan kandidat kolam | `meta-llama/llama-prompt-guard-2-22m` dan `-86m`, `openai/gpt-oss-safeguard-20b` (klasifikasi/guard), `whisper-large-v3` dan `-turbo` (suara), `canopylabs/orpheus-*` (TTS) | idem |
| Kandidat kolam awal | `gpt-oss-120b`, `gpt-oss-20b`, `qwen3.8-27b` (`allam-2-7b` dilepas 4 Okt 2026) | tool calling + streaming **belum diverifikasi** (T0.2); anggota final ditentukan eval T3.6 |
| Kapasitas token kolam 3 model | ≈ 24K token/menit dan ≈ 600K token/hari bila beban tersebar | hitungan dari tiga baris limit di atas; asumsi TPM/TPD menghitung masukan + keluaran (belum diverifikasi) |
| Paket akun Groq | Free; console menawarkan Developer plan untuk limit lebih tinggi | screenshot; harga belum dicek |
| Pengaturan retensi/pelatihan data akun Groq | Global ZDR Disabled; Inference ZDR Disabled (simpan ≤30 hari untuk reliabilitas); Batch On; Fine-tuning On (keduanya tak dipakai Copilot); data di GCP US | Data Controls console + docs Your Data, 4 Okt 2026 |
| Kekhasan Groq terverifikasi (parameter penalaran, `parallel_tool_calls`, `usage` di stream, header batas laju) | terverifikasi 4 Okt 2026: base `https://api.groq.com/openai/v1` (/docs/openai); tool+streaming gpt-oss-120b/20b Ya, paralel gpt-oss Tidak, qwen Ya (/docs/tool-use/overview); penalaran gpt-oss `reasoning_effort` low/med/high + `include_reasoning`, tanpa `reasoning_format` (/docs/reasoning); 429 + `retry-after` detik + `x-ratelimit-*` (/docs/rate-limits); `usage` di stream tak eksplisit → `usageInStream` tidak diset; profil memakai `extraBodyByModel` penalaran rendah (per model, bukan per provider); `--live` 19/19 | T0.2 |
| Tanggal final OASE III | 15 Okt 2026 (batas selesai dari pemilik, 4 Okt 2026) | |
| Garis potong (H−21) | menunggu pemilik | |
| CPU p95 per jawaban di Cloudflare Free | belum terukur (Traces paket Free kosong; D8 diputuskan bersyarat, revalidasi wajib di T4.9) | T0.4, 4 Okt 2026 |
| Subrequest terburuk per jawaban | 10 (ukur 8 query: budget 10 = 2 LLM + 8 DB; jawaban nyata `get_summary` budget 3) | T0.4, produksi 4 Okt 2026 |
| Mekanisme penghitung query (§8.6) | instance drizzle per request dari `neon()` yang dibungkus: tiap pemanggilan `.query` spend(1); 1 query drizzle = 1 HTTP (drizzle memakai `.query`, bukan pemanggilan langsung); terverifikasi lokal (`get_summary` budget 3 = 2 LLM + 1 DB; `__measure` 5 query budget 7) | T0.4 |
| Keputusan D8 (Free atau Paid) | Free (bersyarat: subrequest 10/45 lolos, token 700/6000 lolos, CPU belum terukur; final di T4.9; bila CPU > 8 ms pindah Paid sebelum Fase 3) | T0.4, 4 Okt 2026 |
| Kolam model final (urutan) | belum | T3.6 |

## Checklist tugas

**Fase 0**
- [ ] T0.0 README: Copilot "dalam pengembangan" (DITUNDA ke T4.8 atas permintaan pemilik, 4 Okt 2026)
- [x] T0.1 `.env.example`, rujukan di `AGENTS.md`, kolom limit "menunggu pemilik"
- [x] T0.2 lapisan LLM + `verify:copilot-llm`
- [x] T0.3 endpoint `/copilot/chat` + loop minimal
- [x] T0.4 `budget.ts`, alat ukur, deploy dan pengukuran Free (subrequest terukur 10/45; D8 Free bersyarat, CPU revalidasi T4.9)

**Fase 1**
- [x] T1.1 format
- [x] T1.2 periode bernama
- [ ] T1.3 fungsi `analytics` (dipindahkan ke Fase 2: dipakai TL-4/TL-5)
- [ ] T1.4 refactor `loaders.ts` + D2 (dipindahkan: tidak memblokir Copilot demo)
- [ ] T1.5 query (productIds, handle, recent movements) (dipindahkan ke Fase 2: dipakai tool lanjutan)
- [x] T1.6 kerangka `copilot/` (context, envelope, validator, resolver, sanitasi, model-view, registry)
- [x] T1.7 TL-1, TL-2, TL-3, TL-6
- [x] T1.8 `verify-copilot-tools.ts`
- [x] T1.9 `copilot-call.ts`

**Fase 2**
- [x] T2.1 dekomposisi
- [ ] T2.2 stok habis (di luar scope demo)
- [ ] T2.3 `queryDiscountUse` (di luar scope demo)
- [x] T2.4 TL-4
- [x] T2.5 TL-5 (toleransi volume dan preset Simulator di luar scope demo)
- [ ] T2.6 Simulator `preset` (di luar scope demo)
- [ ] T2.7 TL-7, TL-8 (dikerjakan bersama UI pada Fase 4 demo)

**Fase 3**
- [x] T3.1 prompt
- [x] T3.2 loop
- [x] T3.3 grounding
- [x] T3.4 `limits.ts` stub (batas harian DB dibuang dari scope demo)
- [x] T3.5 log
- [ ] T3.6 eval + pilih model (set 12 kasus siap; perlu eksekusi LLM nyata)

**Fase 4**
- [x] T4.1 kartu
- [x] T4.2 halaman chat
- [x] T4.3 riwayat localStorage
- [x] T4.4 state
- [x] T4.5 mobile dan aksesibilitas
- [x] T4.6 hapus mockup
- [x] T4.7 hapus pengecualian `verify-arch`
- [x] T4.8 README final (preview menunggu gladi bersih)
- [ ] T4.9 uji produksi Free

**Fase 5**
- [x] T5.1 riwayat percakapan server: daftar, detail, buat, hapus (migrasi 0013; tulis histori satu-satunya pengecualian I1 baru)
- [x] T5.2 keputusan riwayat server: diperlukan untuk lintas perangkat

## Prosedur pengukuran T0.4 (untuk pemilik)

1. Deploy branch `feat/copilot` ke Cloudflare Free; set secret `LLM_API_KEY` dan env `COPILOT_MEASURE=1`.
2. Sebagai owner, kirim tiga pertanyaan yang memicu `__measure`: masing-masing dengan `queries` 2, 5, dan 8 (mis. "Panggil tool __measure dengan queries 5.").
3. Dari tiap jawaban catat `budgetUsed` (event `done`) dan CPU time di observability Cloudflare.
4. Isi tabel: CPU p95 per jawaban dan subrequest terburuk; putuskan D8 (tetap Free bila CPU p95 ≤ 8 ms dan subrequest ≤ 45, selain itu Workers Paid sebelum Fase 3).

## Log sesi

| Tanggal | Agen / model | Tugas | Commit | Catatan |
|---|---|---|---|---|
| 4 Okt 2026 | OpenCode / Muse Spark | T0.1 | | `.env.example` + rujukan AGENTS; docs/copilot/ masuk repo; retensi Groq + batas 15 Okt dari pemilik; T0.0 ditunda ke T4.8 |
| 4 Okt 2026 | OpenCode / Muse Spark | T0.2 | | `llm/` + `verify:copilot-llm` 17/17; docs Groq diverifikasi; `--live` SKIP tanpa kunci |
| 4 Okt 2026 | OpenCode / Muse Spark | T0.3 | | endpoint + loop `get_summary` sementara; manual lulus semua (tanpa cookie 303, STAFF 303, origin asing 403, tanpa origin 403, body salah 400, owner 200: tool_start→tool_result→text→done, Rp66.612.000/774 struk, usage 553/82, budget 2); `--live` script 19/19 setelah kunci ada; `onAttempt` diteruskan ke pool untuk spend per percobaan |
| 4 Okt 2026 | OpenCode / Muse Spark | T0.4 | | `budget.ts` + `verify:copilot-core` 6/6; db per-request terhitung (drizzle memakai `.query`, bukan call langsung — temuan saat `__measure` gagal); `__measure` lulus lokal (5 query wallMs 179, budget 7); tiap jawaban log JSON; pengukuran Free + putusan D8 menunggu pemilik |
| 4 Okt 2026 | OpenCode / Muse Spark | Finish Fase 0 | | ukur produksi 2/5/8 lolos (budget 4/7/10, wallMs 8/11/18, token ±700, failovers 0); Traces Free kosong → D8 Free bersyarat + revalidasi T4.9; rekomendasi opsi B; laporan `docs/copilot/LAPORAN-FASE0.md` |
| 4 Okt 2026 | OpenCode / Muse Spark | Temuan Claude 1-3 | | cooldown modul-level (dibagi semua kolam, injeksi map untuk tes); failover hanya 429/404/5xx/gagal jaringan, abort dilempar ulang; `extraBody` per model; kontrak 22/22 |
| 4 Okt 2026 | OpenCode / Muse Spark | Temuan Claude 4-6 | | batas body 6×800; field `grounding` dihapus dari `done` sampai pemeriksaan nyata ada; `db.batch` ikut terhitung via forward `transaction`; manual lulus (400 + happy path tanpa grounding) |
| 4 Okt 2026 | OpenCode / Muse Spark | Resolver + grounding | | resolver: normalisasi kemasan, cocok per-token, typo ≤2, saran 3 nama; `PRODUCT_NOT_FOUND` bawa kandidat; grounding: banding tanpa tanda, token poin/satuan, Rupiah tak telan titik akhir; core 20/20, grounding 9/9; simulasi 25rb lolos (`grounding: ok`) |
| 4 Okt 2026 | Codex / GPT-5 | Fase 1 fondasi + TL-1 | | PRD dipadatkan untuk demo; formatter, periode bernama, context/envelope/validator/resolver/sanitasi/registry, dan `get_summary` masuk endpoint; verify core 16/16, period 5/5, arch bersih. |
| 4 Okt 2026 | Codex / GPT-5 | Selesai Fase 1 demo | | Tambah `rank_products`, `compare_periods`, `get_inventory`, model-view, CLI, dan verifikasi DB; copilot-tools 4/4 serta facts-db 20/20 lulus terhadap Neon. |
| 4 Okt 2026 | Codex / GPT-5 | Fase 2 inti demo | | Tambah dekomposisi profit deterministik dan TL-4/TL-5; uji dekomposisi 10.000 kasus serta pemeriksaan tipe dan arsitektur lulus. Verifikasi DB nyata menunggu otorisasi lingkungan. |
| 4 Okt 2026 | Codex / GPT-5 | Fase 3 inti | | Prompt tool-aware, loop 5 langkah/6 tool dengan cache, grounding + retry sekali, limits stub, dan set eval 12 kasus; grounding 4/4, core 17/17, kontrak LLM 22/22, arsitektur bersih. |
| 4 Okt 2026 | Codex / GPT-5 | Fase 4 UI | | Mock diganti chat SSE nyata dengan kartu tool, state kirim/gagal, responsif, dan riwayat localStorage; svelte-check 0 error/0 warning, verify-arch tanpa pengecualian Copilot bersih; visual diverifikasi pemilik. |
| 4 Okt 2026 | OpenCode / Muse Spark | T5.1 | | migrasi 0013 + `history.ts` + 5 endpoint + chat pakai konteks server + UI server-state; `verify-history-db` 19/19; manual lulus (staff 303, asing 404, urutan conversation→done, judul dari pertanyaan pertama, lintas sesi, hapus 1/semuanya); budget jawaban 2-tool 15; jawab 6 pesan terakhir dari server |
| 5 Okt 2026 | OpenCode / Muse Spark | Bug B1–B5 | | B1 sudah sembuh di HEAD, tambah uji regresi titik penutup; B2 `marginText` di `compare_periods`; B3 `enum` period di 4 skema tool; B4/B5 `custom` tak valid atau >366 hari ditolak; grounding 10/10, period 5/5, core 20/20, kontrak LLM 22/22, arch bersih |

## Penyimpangan dari PRD dan temuan

Fase 1 dipersempit sesuai PRD demo agar pekerjaan analitik yang belum dipakai tidak menunda empat tool siap demo. T1.3–T1.5 digabung dengan TL-4/TL-5 di Fase 2.
T5.1: tabel `copilot_conversation`/`copilot_message` menjadi pengecualian tulis I1 kedua setelah `copilot_usage`; `role` memakai teks tervalidasi (bukan enum PG); event `conversation` selalu dikirim; `done` juga dikirim setelah `notice`; tulis histori lewat db per-request yang terhitung.

Fase 2 demo mencakup TL-4 dan TL-5. Riwayat stok habis, penggunaan promo, preset Simulator, toleransi volume, serta TL-7/TL-8 tidak mengubah alur keputusan inti dan dilanjutkan setelah UI chat nyata selesai.

Batas harian `copilot_usage` tidak dibuat untuk demo karena memerlukan migrasi dan jalur tulis khusus; anggaran per jawaban serta batas penyedia tetap berlaku. T3.6 baru ditutup setelah 12 kasus dijalankan melalui endpoint dengan model Groq yang dipilih.
D6 kini ditegakkan di `resolveNamedPeriod`: `custom` tak valid atau lebih dari 366 hari dikembalikan tanpa `from`/`to` sehingga tool menjawab "Periode tidak valid."; halaman statistik/simulator tidak terpengaruh karena memakai `resolvePeriod` langsung.
