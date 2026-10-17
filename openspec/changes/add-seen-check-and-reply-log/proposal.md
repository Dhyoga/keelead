## Why

Grokbot (dan nanti Hermes) mencari post di Threads dan membalasnya sendiri lewat browser; ia bisa mengurus lead tanpa KeeLead. Yang tidak ia punya adalah **pembukuan**: ingatan tentang post mana yang sudah dilihat, siapa yang sudah dibalas dan kapan, serta orang yang minta berhenti. Akibatnya agent menilai ulang post yang sama (boros token) dan tidak ada catatan yang bisa Anda tinjau di dashboard. KeeLead berperan sebagai **sekretaris yang mencatat**, bukan penjaga: ia tidak pernah menolak, melarang, atau membatasi apa pun; semua keputusan tetap di Grokbot dan pemilik. Endpoint MCP (`/api/mcp`) sudah ter-deploy, jadi dua kemampuan ini melengkapinya sebelum diuji dengan Grokbot nyata.

## What Changes

- Tool MCP baru **`keelead_check_seen`**: agent mengirim daftar permalink; KeeLead menjawab dengan **informasi** apa yang ia ingat tentang tiap post (lead tersimpan, balasan yang pernah dicatat, kapan akun itu terakhir dibalas, tanda `dnc`). Tidak ada keputusan "lewati/larang" dari server.
- Tabel baru **`Reply`**: catatan balasan (link post, username, isi, status `draft | sent | failed`, waktu kirim, link balasan, catatan bebas, nama klien pencatat).
- Tool MCP baru **`keelead_log_reply`**, **`keelead_update_reply`**, **`keelead_list_replies`**, dengan endpoint REST padanannya. Pencatatan **tidak pernah ditolak** karena aturan bisnis (duplikat, status, frekuensi); server hanya menambahkan keterangan.
- Saat balasan dicatat `sent` dan tertaut ke lead berstatus `new`, lead otomatis menjadi `contacted`.
- Orang yang menolak/minta berhenti dicatat memakai **lead yang sudah ada**: status `lost` + tag `dnc` + catatan. `keelead_update_lead` diperluas agar bisa **menambah tag** (`addTags`). Tidak ada tabel DNC.
- Instruksi server MCP diperbarui: panggil `keelead_check_seen` sebelum menilai post, catat balasan dengan `keelead_log_reply`.
- Pengujian end-to-end `/api/mcp` dengan Grokbot nyata, deploy ke server, dan pembaruan `AGENTS.md` (termasuk menegaskan bahwa batas dan persetujuan adalah tanggung jawab agent/pemilik, bukan fitur KeeLead).

**Tidak termasuk (sengaja dibuang dari rencana awal):** persetujuan balasan, langkah claim, batas harian, cooldown per akun, jeda minimal, tabel Do-Not-Contact, pengaturan `reply.*`. Tidak ada perubahan **BREAKING**; tabel `Lead` tidak diubah.

## Capabilities

### New Capabilities
- `seen-check`: menjawab, untuk daftar post, apa yang sudah dicatat KeeLead (lead, balasan, tanda `dnc`, balasan terakhir ke akun itu), bersifat informasi saja.
- `reply-log`: pencatatan balasan yang bebas aturan (tanpa penolakan bisnis) beserta tool untuk membuat, mengubah, dan melihatnya, serta penandaan `dnc` lewat lead.

### Modified Capabilities
<!-- Tidak ada: openspec/specs/ masih kosong. -->

## Impact

- **Kode:** `prisma/schema.prisma` (model `Reply`), `lib/replies/` (normalisasi permalink, store; baru), `app/api/seen/`, `app/api/replies/` (route baru), `app/api/leads/saved/route.ts` (`addTags` pada PATCH), `lib/mcp/tools.ts` (tool baru, `addTags`, instruksi, nama klien diteruskan ke `log_reply`).
- **Database:** satu tabel baru lewat `prisma db push` saat container start; hanya penambahan. Backup `keelead.db` sebelum deploy.
- **API/MCP:** tool MCP bertambah; tidak ada yang berubah atau dihapus.
- **Operasional:** deploy ke `ubuntu@43.157.229.232` (alur `AGENTS.md` bagian 3); uji akhir dengan token `grokbot`.
- **Dokumen:** `AGENTS.md` (bagian 4, 5.1, 6, 7) dan `KEELEAD-GROKBOT.md`.
- **Risiko yang tidak ditangani KeeLead:** frekuensi dan volume balasan dari `@looxtravel` (risiko pembatasan akun oleh Threads) sepenuhnya ada di Grokbot dan pemilik.
