# Laporan Fase 0 — Copilot Katalyst (untuk analisa independen)

Tanggal: 4 Okt 2026. Branch: `feat/copilot` → PR #15 → `main`. Agen: OpenCode / Muse Spark.
Dokumen acuan: `docs/copilot/PRD.md` (v1.1 Final), `docs/copilot/STATUS.md`. Rencana meminta laporan ini untuk dianalisa oleh Claude.

## 1. Ringkasan eksekutif

Fase 0 (spike platform) selesai di sisi kode. Semua verifikasi hijau, uji manual lokal lulus, pengukuran produksi parsial lulus. Satu-satunya lubang bukti: **CPU p95 belum terukur** (Traces paket Cloudflare Free kosong). Rekomendasi agen: **opsi B — D8 = Free bersyarat**, lanjut Fase 1, revalidasi CPU wajib di T4.9. Alasan ada di §7.

## 2. Cakupan yang dikerjakan

| Tugas | Status | Commit |
|---|---|---|
| T0.0 README | DITUNDA ke T4.8 (permintaan pemilik) | — |
| T0.1 env + rujukan + data pemilik | selesai | `3767911` |
| T0.2 lapisan LLM + kontrak SSE | selesai, 17/17 | `d2e7d2d` |
| T0.4a budget + verify-core | selesai, 6/6 | `1e2b3a6` |
| T0.3 endpoint + loop minimal | selesai, manual lulus | `128f565` |
| T0.4b counting + measure + prosedur | selesai, ukur produksi lulus | `4c4e202` |
| fix(simulator) milik pemilik | 1 file, commit terpisah | `32159d0` |

Berkas baru: `llm/{types,profiles,openai-compat,pool,index}.ts`, `copilot/budget.ts`, `src/routes/copilot/chat/+server.ts`, `script/verify-copilot-{llm,core}.ts`. Diubah: `.env.example`, `AGENTS.md` (+1 baris), `package.json` (2 skrip), `docs/copilot/*`, `simulator/+page.svelte` (milik pemilik).

## 3. Hasil verifikasi (perintah benar-benar dijalankan)

| Perintah | Baseline (`main`) | Akhir (`feat/copilot`) |
|---|---|---|
| `npm run check` | 0 error | 0 error |
| `npm run verify:all` | 171 passed / 0 failed (33+36+40+18+39+5) | 194 passed / 0 failed (+17 llm, +6 core) |
| `npm run verify:arch` | bersih | bersih |
| `verify-copilot-llm.ts --live` | SKIP (tanpa kunci) | 19/19 lulus (kunci Groq nyata) |

## 4. Pengukuran produksi (katalyst-6pk.pages.dev, 4 Okt 2026, model `openai/gpt-oss-120b`)

| Skenario | budgetUsed | wallMs DB | token in/out | failovers |
|---|---|---|---|---|
| `__measure` 2 query | 4 (= 2 LLM + 2 DB) | 8 | 578/111 | 0 |
| `__measure` 5 query | 7 (= 2 LLM + 5 DB) | 11 | 578/109 | 0 |
| `__measure` 8 query | 10 (= 2 LLM + 8 DB) | 18 | 578/111 | 0 |
| `get_summary` nyata | 3 (= 2 LLM + 1 DB) | — | 553/81 | 0 |

Jawaban nyata benar ("Rp66.972.000", 775 struk) dan memuat string format persis dari tool. Kriteria PRD §17: subrequest 10 ≤ 45 (lolos); CPU p95 ≤ 8 ms (**belum terukur** — Traces Free kosong; wallMs di atas adalah I/O, bukan CPU).

## 5. Verifikasi dokumentasi Groq (4 Okt 2026, dari docs resmi, bukan ingatan)

- Base OpenAI-compatible: `https://api.groq.com/openai/v1` (`/docs/openai`).
- Tool + streaming: gpt-oss-120b/20b Ya; paralel gpt-oss **Tidak**, qwen Ya (`/docs/tool-use/overview`).
- Penalaran gpt-oss: `reasoning_effort` low/med/high + `include_reasoning`; `reasoning_format` **tidak didukung** gpt-oss (`/docs/reasoning`). Profil memakai `extraBody` `{ reasoning_effort: 'low', include_reasoning: false }`, lolos `--live`.
- Rate limit: 429 + header `retry-after` (detik) + `x-ratelimit-*` (`/docs/rate-limits`).
- `usage` di stream tidak eksplisit di docs → `usageInStream` tidak diset; observasi live: usage tetap muncul di stream.
- Kolam awal: `gpt-oss-120b → gpt-oss-20b` (+ `qwen/qwen3.8-27b` cadangan, ID dikonfirmasi pemilik); `allam-2-7b` dilepas (Arab-Inggris).
- Retensi data: Global ZDR Disabled, Inference ZDR Disabled (simpan ≤30 hari untuk reliabilitas), Batch/Fine-tuning On (tak dipakai Copilot), data di GCP US.

## 6. Uji manual endpoint (dev lokal + DB seed, lulus semua)

Tanpa cookie → 303 `/login`; STAFF → 303 `/transactions` (+cek 403 di handler); origin asing → 403; tanpa origin → 403; body salah (kosong / terakhir bukan user) → 400; owner valid → 200 dengan urutan `tool_start → tool_result → text → done`.

## 7. Keputusan desain yang perlu dinilai ulang oleh Claude

1. **D8 bersyarat (opsi B vs A).** Opsi A (tunggu angka `wrangler tail`) memberi bukti keras tapi menunda Fase 1 menjelang batas 15 Okt. Opsi B (dipilih) mencatat Free bersyarat + revalidasi wajib T4.9. Argumen struktur: kerja CPU per jawaban hanya parse SSE + agregasi ≤31 baris + serialisasi JSON; I/O DB/LLM tidak dihitung CPU oleh Cloudflare. Apakah argumen ini cukup kuat, atau ada jalur CPU tersembunyi (mis. cold start isolate, JSON besar)?
2. **Penghitung query via pembungkus `.query`.** Temuan: drizzle neon-http memanggil `client.query`, bukan call langsung (driver versi ini menolak string-call). Satu pemanggilan = satu HTTP = satu `spend(1)`. Apakah ada jalur drizzle (batch, relasional, transaksi) yang memecah asumsi 1:1 ini di pemakaian copilot mendatang (TL-1..8)?
3. **`onAttempt` di `LlmConfig`.** Dipilih dibanding wrapper tipis agar tiap percobaan model (termasuk gagal) `spend(1)`. Apakah bocoran konsep pool ke buyer acceptable, atau sebaiknya counting di dalam pool?
4. **`extraBody` penalaran rendah + `include_reasoning: false`.** Menghemat token keluaran di bawah TPM 8K, lolos live. Risiko: apakah menyembunyikan penalaran merusak kualitas tool-calling gpt-oss pada eval T3.6 nanti?
5. **Token Fase 3.** Kini ±700/jawaban; Fase 3 menambah system prompt + 8 spek tool (±2K) + riwayat + hasil tool → estimasi 4–6K, dekat TPM 8K; failover menggandakan. Apakah penangkal PRD (trim riwayat di 5K, maxFailover 2) memadai, atau perlu batas lebih agresif?
6. **RPD 1K/model/hari se-akun.** Demo juri aman; eval T3.6 (±230K token/model) melebihi kuota harian satu model → bertahap atau Developer plan (D11). Apakah strategi eval perlu diubah sejak sekarang?

## 8. Penyimpangan dari PRD (disengaja, kecil)

T0.0 ditunda ke T4.8; validasi body 12×2000 (ikut prompt sesi, bukan 6×800 di §5.6); `usage` stream muncul tanpa flag (observasi live); satu baris `// TODO(T1.7…)` dan `// TODO(T1.7: hapus…)` sebagai penanda sementara sesuai spesifikasi sesi.

## 9. Handoff Fase 1

Fondasi siap: `LlmClient` + pool + budget + endpoint + counting + prosedur ukur. Struktur `copilot/` menunggu T1.6 (registry, envelope, validate). Tidak ada utang kode dari Fase 0 kecuali: hapus `__measure` + `get_summary` sementara saat TL-1 masuk (sudah ber-TODO), dan konfirmasi CPU final di T4.9.
