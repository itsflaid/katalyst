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
| Kekhasan Groq terverifikasi (parameter penalaran, `parallel_tool_calls`, `usage` di stream, header batas laju) | terverifikasi 4 Okt 2026: base `https://api.groq.com/openai/v1` (/docs/openai); tool+streaming gpt-oss-120b/20b Ya, paralel gpt-oss Tidak, qwen Ya (/docs/tool-use/overview); penalaran gpt-oss `reasoning_effort` low/med/high + `include_reasoning`, tanpa `reasoning_format` (/docs/reasoning); 429 + `retry-after` detik + `x-ratelimit-*` (/docs/rate-limits); `usage` di stream tak eksplisit → `usageInStream` tidak diset; profil memakai `extraBody` penalaran rendah; `--live` SKIP (tanpa kunci) | T0.2 |
| Tanggal final OASE III | 15 Okt 2026 (batas selesai dari pemilik, 4 Okt 2026) | |
| Garis potong (H−21) | menunggu pemilik | |
| CPU p95 per jawaban di Cloudflare Free | belum | T0.4 |
| Subrequest terburuk per jawaban | belum | T0.4 |
| Mekanisme penghitung query (§8.6) | belum dipilih | T0.4 |
| Keputusan D8 (Free atau Paid) | belum | T0.4 |
| Kolam model final (urutan) | belum | T3.6 |

## Checklist tugas

**Fase 0**
- [ ] T0.0 README: Copilot "dalam pengembangan" (DITUNDA ke T4.8 atas permintaan pemilik, 4 Okt 2026)
- [x] T0.1 `.env.example`, rujukan di `AGENTS.md`, kolom limit "menunggu pemilik"
- [x] T0.2 lapisan LLM + `verify:copilot-llm`
- [x] T0.3 endpoint `/copilot/chat` + loop minimal
- [ ] T0.4 `budget.ts`, alat ukur, deploy dan pengukuran Free

**Fase 1**
- [ ] T1.1 format
- [ ] T1.2 periode bernama
- [ ] T1.3 fungsi `analytics`
- [ ] T1.4 refactor `loaders.ts` + D2
- [ ] T1.5 query (productIds, handle, recent movements)
- [ ] T1.6 kerangka `copilot/`
- [ ] T1.7 TL-1, TL-2, TL-3, TL-6
- [ ] T1.8 `verify-copilot-tools.ts`
- [ ] T1.9 `copilot-call.ts`

**Fase 2**
- [ ] T2.1 dekomposisi
- [ ] T2.2 stok habis
- [ ] T2.3 `queryDiscountUse`
- [ ] T2.4 TL-4
- [ ] T2.5 TL-5 + `volumeTolerance`
- [ ] T2.6 Simulator `preset`
- [ ] T2.7 TL-7, TL-8

**Fase 3**
- [ ] T3.1 prompt
- [ ] T3.2 loop
- [ ] T3.3 grounding
- [ ] T3.4 `copilot_usage` + `limits.ts`
- [ ] T3.5 log
- [ ] T3.6 eval + pilih model

**Fase 4**
- [ ] T4.1 kartu
- [ ] T4.2 halaman chat
- [ ] T4.3 riwayat
- [ ] T4.4 state
- [ ] T4.5 mobile dan aksesibilitas
- [ ] T4.6 hapus mockup
- [ ] T4.7 hapus pengecualian `verify-arch`
- [ ] T4.8 README final
- [ ] T4.9 uji produksi Free

## Log sesi

| Tanggal | Agen / model | Tugas | Commit | Catatan |
|---|---|---|---|---|
| 4 Okt 2026 | OpenCode / Muse Spark | T0.1 | | `.env.example` + rujukan AGENTS; docs/copilot/ masuk repo; retensi Groq + batas 15 Okt dari pemilik; T0.0 ditunda ke T4.8 |
| 4 Okt 2026 | OpenCode / Muse Spark | T0.2 | | `llm/` + `verify:copilot-llm` 17/17; docs Groq diverifikasi; `--live` SKIP tanpa kunci |
| 4 Okt 2026 | OpenCode / Muse Spark | T0.3 | | endpoint + loop `get_summary` sementara; manual lulus semua (tanpa cookie 303, STAFF 303, origin asing 403, tanpa origin 403, body salah 400, owner 200: tool_start→tool_result→text→done, Rp66.612.000/774 struk, usage 553/82, budget 2); `--live` script 19/19 setelah kunci ada; `onAttempt` diteruskan ke pool untuk spend per percobaan |

## Penyimpangan dari PRD dan temuan

(kosong)