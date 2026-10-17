## 1. Skema dan fondasi

- [x] 1.1 Tambah model `Reply` (beserta indeks `postKey`, `targetUsername`, `sentAt`) di `prisma/schema.prisma`; tanpa mengubah model `Lead`
- [x] 1.2 Jalankan `prisma generate` dan `prisma db push` di lokal pada database kosong; pastikan `npx tsc --noEmit -p .` bersih
- [x] 1.3 Buat `lib/replies/postkey.ts`: ekstraksi `postKey`/`username` dari permalink, kunci opak `raw:` untuk input lain

## 2. Cek catatan (seen-check)

- [x] 2.1 Di `lib/replies/store.ts`, implementasi pencarian batch: Lead per permalink (`website contains /post/<code>`), Lead per penulis (`LOWER(firstName) IN (...)`), Reply per `postKey`, Reply per username; jumlah query tetap
- [x] 2.2 Buat `app/api/seen/route.ts` (`POST`): validasi 1–100 input (400 di luar itu), kembalikan `{ new, known }` ringkas dengan field `lead`, `replies`, `authorLastRepliedAt`, `dnc` hanya bila ada nilainya
- [x] 2.3 Tambah tool MCP `keelead_check_seen` di `lib/mcp/tools.ts` (definisi + `callTool`)

## 3. Catatan balasan (reply-log)

- [x] 3.1 Implementasi pembuatan Reply di `lib/replies/store.ts`: turunkan `postKey`/`targetUsername`, tautkan `leadId` bila ada Lead dengan permalink yang sama, bawaan `status="sent"` + `sentAt=sekarang`, validasi 400 hanya untuk input rusak
- [x] 3.2 Keterangan pada respons pembuatan: jumlah catatan lain untuk post yang sama, jumlah untuk akun yang sama, dan `dnc: true` bila ada lead bertag `dnc`; tidak pernah menolak karena aturan bisnis
- [x] 3.3 Implementasi perubahan Reply (`status`, `text`, `replyUrl`, `note`, `sentAt`) tanpa aturan urutan; isi `sentAt` otomatis saat menjadi `sent`; 404 bila id tidak ada
- [x] 3.4 Saat Reply menjadi `sent` dan tertaut ke Lead berstatus `new`, ubah Lead menjadi `contacted` (status lain tidak diubah)
- [x] 3.5 Buat `app/api/replies/route.ts` (`GET` dengan filter `status`/`username`/`limit` bawaan 50 maks. 200, `POST`) dan `app/api/replies/[id]/route.ts` (`PATCH`)
- [x] 3.6 Tambah tool MCP `keelead_log_reply`, `keelead_update_reply`, `keelead_list_replies`; `callTool` menerima nama klien dan menambahkannya sebagai `client` pada body `log_reply`
- [x] 3.7 Tambah `DELETE /api/replies` (body `ids`, hanya REST, bukan tool MCP) untuk membersihkan data uji atau catatan keliru

## 4. Penandaan dnc lewat lead

- [x] 4.1 `PATCH /api/leads/saved` menerima `addTags` (tambah tanpa duplikat, tanpa menghapus tag lama); `tags` bawaan tetap ada di REST
- [x] 4.2 Tool MCP `keelead_update_lead` mengekspos `addTags` (dan tidak mengekspos `tags` yang menimpa); perbarui deskripsi dengan contoh penandaan `dnc` (`status: "lost"`, `addTags: ["dnc"]`, `notes`)

## 5. Instruksi agent

- [x] 5.1 Perbarui `SERVER_INSTRUCTIONS` dan deskripsi tool: panggil `keelead_check_seen` sebelum menilai post; catat balasan dengan `keelead_log_reply`; simpan orang yang menolak sebagai lead `lost` + tag `dnc`; tegaskan bahwa KeeLead hanya mencatat dan keputusan ada pada agent
- [x] 5.2 Pastikan `tools/list` tidak berisi tool approve, claim, limits, atau dnc

## 6. Verifikasi lokal

- [x] 6.1 Tulis `scripts/smoke-replies.mjs` (Node, tanpa dependensi) yang menjalankan skenario kedua spec: normalisasi permalink, `check_seen` (new, sudah dibalas, lead belum dibalas, `authorLastRepliedAt`, `dnc`, batas 1–100), `log_reply` (bawaan, draft, input rusak, duplikat tetap tercatat + keterangan), `update_reply` (draft→sent, sent→failed, 404), kenaikan Lead `new→contacted`, Lead `lost` tidak berubah, `addTags` tanpa duplikat
- [x] 6.2 Jalankan skrip terhadap `next dev` lokal dengan database kosong dan pastikan semua skenario lolos (34 lolos; `check_seen` memakai 4 query untuk 1 maupun 100 input)
- [x] 6.3 Uji lewat `/api/mcp` lokal: `tools/list` memuat tool baru, `tools/call` end-to-end untuk alur check → log → update → check lagi (post kini `known`), dan `client` pada Reply berisi nama klien token
- [x] 6.4 `npm run build` lolos

## 7. Deploy

- [x] 7.1 Commit dan push ke `fork/serdadu-deploy` (pemilik); pastikan folder change `openspec/` ikut ter-commit
- [x] 7.2 Backup `keelead.db` di server (perintah di `AGENTS.md` bagian 3)
- [x] 7.3 Di server: `git fetch fork && git merge --ff-only fork/serdadu-deploy`, lalu `docker compose up -d --build` di `~/keelead`; pastikan container lain tidak tersentuh
- [x] 7.4 Verifikasi di server (tabel `Reply` baru terbuat setelah perbaikan manual schema di volume, lihat 7.6): jumlah lead lama tidak berubah, dashboard dan `/api/*` tetap 401 tanpa BasicAuth, `/api/mcp` 401 tanpa token
- [x] 7.5 Jalankan alur inti `scripts/smoke-replies.mjs` melawan `https://keelead.serdadu.dev` lewat `/api/mcp` dengan token `grokbot`, lalu hapus data uji (lead dan reply uji) agar pembukuan asli tidak tercemar

- [ ] 7.6 Perbaiki bug deploy yang ditemukan di 7.4: volume `keelead-data` menutupi `schema.prisma` terbaru sehingga `prisma db push` memakai schema lama. Dockerfile menyimpan salinan schema di luar volume dan menimpanya saat start (`cp -f`); uji lokal dengan volume berisi schema lama, lalu commit, push, dan deploy ulang dengan backup (perbaikan manual sekali jalan sudah dilakukan di server)

## 8. Uji end-to-end dengan Grokbot nyata

- [ ] 8.1 Ambil token `grokbot` dari `~/keelead/.env` server dan kirim ke teman pemilik lewat kanal pribadi (bukan chat grup, repo, atau log)
- [ ] 8.2 Tambahkan custom MCP connector di Grokbot (`https://keelead.serdadu.dev/api/mcp`, header `Authorization: Bearer <token>`); catat di mana header diisi di UI Grokbot
- [ ] 8.3 Uji koneksi: Grokbot memanggil `keelead_list_saved_leads` dan melihat tool baru
- [ ] 8.4 Uji alur nyata dengan **satu** post uji: `keelead_check_seen` → (Grokbot membalas di Threads) → `keelead_log_reply` dengan `replyUrl` → `keelead_check_seen` pada post yang sama menampilkan balasan tadi
- [ ] 8.5 Uji penandaan penolakan: Grokbot menyimpan lead uji lalu `keelead_update_lead` (`lost` + `addTags: ["dnc"]`), dan `keelead_check_seen` pada post akun itu menampilkan `dnc: true`
- [ ] 8.6 Catat temuan (apakah Grokbot memakai `check_seen`/`log_reply` sesuai instruksi, format `save_leads` yang dipakainya, error) dan sesuaikan deskripsi tool bila perlu

## 9. Dokumentasi

- [ ] 9.1 Perbarui `AGENTS.md`: tabel status (bagian 4), daftar tool + alur (bagian 5.1), checklist "Jalur sementara" dan Fase 2 (bagian 6) agar tidak lagi menyebut guardrail/persetujuan/claim sebagai fitur KeeLead, dan bagian 7 agar menyatakan bahwa persetujuan, batas volume, dan risiko akun adalah tanggung jawab agent/pemilik, bukan KeeLead; perbarui log keputusan (keputusan "KeeLead = sekretaris pencatat", 2026-10-18)
- [ ] 9.2 Perbarui `KEELEAD-GROKBOT.md` bagian 4 (tool MCP) dan alur yang disarankan untuk bot
- [ ] 9.3 Arsipkan change dengan `/opsx:archive` setelah semua uji lolos
