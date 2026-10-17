## Context

- Grokbot mencari dan membalas post Threads lewat browser sendiri (akun `@looxtravel`); KeeLead tidak pernah mengirim apa pun ke Threads dan tidak bisa menghalanginya. Grokbot dapat mengelola lead tanpa KeeLead; KeeLead menambah nilai sebagai **pembukuan**.
- Data yang ada: model `Lead` (dedup lewat `website` = permalink, `firstName` = username untuk lead Threads, `tags` JSON, `status`), SQLite lewat Prisma, skema diterapkan saat container start (`prisma db push`).
- Endpoint `/api/mcp` (bearer token per klien) sudah ter-deploy; definisi tool ada di `lib/mcp/tools.ts` dan memanggil REST API lewat loopback.
- Keputusan pemilik: KeeLead = sekretaris yang mencatat dan mengingat. **Tidak ada persetujuan, batas, atau penolakan** di sisi server.

## Goals / Non-Goals

**Goals:**
- Satu panggilan murah memberi agent ringkasan "yang saya ingat" untuk puluhan post, supaya agent tidak menilai ulang post lama.
- Setiap balasan tercatat dan terlihat (siapa mencatat, kapan, isinya, link balasan).
- Orang yang menolak dapat ditandai dan muncul kembali di `check_seen`.
- Perubahan skema minimal: satu tabel baru, `Lead` tidak diubah.

**Non-Goals:**
- Tidak menolak, membatasi, atau menunda aksi agent (tidak ada batas harian, cooldown, jeda, persetujuan, claim, atau tabel DNC).
- Tidak mengirim balasan ke Threads, tidak menyimpan kredensial Threads.
- Tidak ada UI dashboard untuk balasan di change ini, tidak ada n8n, tidak ada Threads API resmi.

## Decisions

### D1. Identitas post = `postKey` hasil normalisasi permalink
`lib/replies/postkey.ts` mengekstrak `username` dan `code` dari **path** permalink (`/@user/post/<code>`), mengabaikan host (`threads.com`/`threads.net`), query, fragment, dan slash di ujung; `postKey = "threads:<code>"`, `username` huruf kecil tanpa `@`. Input yang tidak cocok pola menjadi kunci opak `raw:<string>` agar tetap berguna untuk sumber lain.
- *Alternatif:* mencocokkan string permalink mentah (rapuh); id numerik Threads (agent berbasis browser biasanya hanya punya URL).
- Lead lama dicari dengan `website contains "/post/<code>"`; tidak perlu migrasi data.

### D2. Satu tabel baru, tanpa aturan
`Reply`: `id, postKey, postUrl, targetUsername, leadId?, text, status ("draft"|"sent"|"failed"), sentAt?, replyUrl?, note?, client, createdAt, updatedAt`; indeks pada `postKey`, `targetUsername`, `sentAt`. Status boleh diubah ke nilai mana saja (buku catatan tidak mengatur urutan). Tidak ada constraint unik pada `postKey`: beberapa catatan untuk satu post sah (mis. draf lalu terkirim, atau balasan kedua yang disengaja).
- *Alternatif:* menyimpan di `Lead.metadata` JSON → sulit di-query/diindeks untuk "kapan akun ini terakhir dibalas".

### D3. Server tidak pernah menolak karena aturan bisnis
`log_reply` dan `update_reply` hanya mengembalikan error untuk input yang rusak (teks kosong, `postUrl` kosong, id tidak ada, status di luar tiga nilai). Duplikat, frekuensi, atau akun yang bertanda `dnc` **tidak** menggagalkan pencatatan; respons menambahkan keterangan (`note`, jumlah catatan lain untuk post/akun itu) agar agent tahu. Ini mengikuti keputusan "sekretaris yang mangut-mangut".

### D4. `check_seen`: informasi, bukan keputusan
`POST /api/seen` menerima 1–100 permalink dan mengembalikan:
```json
{ "new": ["<input>", ...],
  "known": [{ "input": "...", "lead": { "id": "...", "status": "...", "tags": ["..."] },
              "replies": [{ "status": "sent", "sentAt": "..." }],
              "authorLastRepliedAt": "...", "dnc": true }] }
```
- `new` = tidak ada lead untuk post itu, tidak ada Reply untuk post itu, dan tidak ada lead bertanda `dnc` untuk penulisnya.
- `known` hanya memuat field yang ada nilainya; `dnc: true` bila ada lead dengan tag `dnc` untuk username penulis (lead dicari lewat `LOWER(firstName) = username`, atau permalink yang sama). `authorLastRepliedAt` = `sentAt` terbaru dari Reply `sent` ke username itu.
- Satu query `IN` per tabel (Lead per permalink, Lead per penulis, Reply per `postKey`, Reply per username), bukan N query. Hanya membaca.
- *Alternatif:* mengembalikan `skip: true` + alasan → itu keputusan; ditolak sesuai Non-Goals.

### D5. Penandaan "jangan hubungi" lewat lead (tanpa tabel DNC)
Orang yang menolak disimpan sebagai lead (`keelead_save_leads`), lalu `keelead_update_lead` dengan `status: "lost"`, `addTags: ["dnc"]`, dan `notes`. Perubahan kecil: `PATCH /api/leads/saved` menerima `addTags` (menambah tag, tanpa duplikat, tanpa menimpa tag lain) dan tool MCP `keelead_update_lead` mengekspos `addTags`. `tags` yang menimpa seluruh tag tetap ada di REST tetapi tidak diekspos ke tool MCP.
- *Alternatif:* tabel `DoNotContact` + 3 tool + endpoint → lebih banyak yang dibuat untuk informasi yang sama.

### D6. Nama klien tanpa header khusus
`createKeeleadServer(api, client)` sudah mengetahui nama klien MCP. `callTool` menerima `client` dan, untuk `keelead_log_reply`, menambahkannya ke body (`client`). Panggilan REST langsung tanpa `client` memakai `"api"`.

### D7. Pembagian kode
`lib/replies/postkey.ts`, `lib/replies/store.ts` (buat/ubah/daftar Reply, pencarian seen, kenaikan status Lead), route `app/api/seen/route.ts` (`POST`), `app/api/replies/route.ts` (`GET`, `POST`), `app/api/replies/[id]/route.ts` (`PATCH`). Tool: `keelead_check_seen`, `keelead_log_reply`, `keelead_update_reply`, `keelead_list_replies`.

## Risks / Trade-offs

- **Tidak ada pengaman volume/frekuensi** → akun `@looxtravel` bisa dibatasi Threads jika Grokbot membalas terlalu banyak/cepat. Disengaja oleh pemilik; mitigasi sepenuhnya di luar KeeLead. Dicatat di `AGENTS.md`.
- **Agent bisa tidak memanggil `check_seen`/`log_reply`** → pembukuan tidak lengkap; tidak ada cara memaksa. Mitigasi: instruksi server MCP dan deskripsi tool yang jelas; uji dengan Grokbot nyata.
- **`dnc` hanya terlihat jika orang itu sudah menjadi lead** → agent harus menyimpan lead dulu lalu menandainya (dua panggilan). Diterima demi kesederhanaan.
- **Pencocokan username ke `firstName` lead** → hanya andal untuk lead Threads yang disimpan dengan konvensi saat ini (`firstName` = username). Lead dengan nama lain tidak dikenali sebagai penulis yang sama; dicatat sebagai batasan.
- **Perubahan format permalink Threads** → kunci opak sebagai cadangan; `postKey` tersimpan sehingga mudah dimigrasi.

## Migration Plan

1. Tambah model `Reply` di `prisma/schema.prisma` (hanya tambahan); `prisma db push` saat container start membuat tabelnya tanpa menyentuh data.
2. Backup `keelead.db` sebelum deploy (perintah di `AGENTS.md` bagian 3).
3. Deploy: push ke `fork/serdadu-deploy` → di server `git fetch fork && git merge --ff-only fork/serdadu-deploy` → `docker compose up -d --build`.
4. Uji end-to-end dengan Grokbot nyata (token `grokbot` di `~/keelead/.env`).
5. **Rollback:** redeploy commit sebelumnya; tabel baru dibiarkan (tidak merusak). Bila perlu, pulihkan `keelead.db` dari backup.

## Open Questions

1. Apakah Grokbot sudah punya cara menyimpan "lead + tag" dari hasil pencariannya, atau perlu contoh format `keelead_save_leads` di instruksi server? (Diputuskan saat uji dengan Grokbot, tugas 8.)
