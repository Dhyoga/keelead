# AGENTS.md — Sumber kebenaran pengembangan KeeLead (AI SDR Loox Travel)

> Dokumen ini adalah **sumber kebenaran** untuk siapa pun (manusia atau agent: Claude Code, Hermes, Grokbot) yang mengembangkan KeeLead.
> Jika dokumen lain (README.md, HANDOFF.md, KEELEAD-GROKBOT.md) bertentangan dengan dokumen ini, **dokumen ini yang benar**. Perbarui dokumen ini di commit yang sama dengan perubahan yang membuatnya usang.
>
> Terakhir diverifikasi terhadap kode + server: **2026-10-18**.

---

## 1. Misi

KeeLead dipakai sebagai **AI SDR (Sales Development Rep)** untuk mencari klien **Loox Travel** (https://looxtravel.com), bisnis milik pemilik repo ini.

Alur SDR yang dituju: **temukan sinyal minat → kualifikasi → simpan lead → balas/hubungi → lacak status sampai closing.** Agent (Grokbot/Hermes) dan pemilik yang memutuskan dan bertindak; **KeeLead hanya membukukan** (lihat bagian 2 dan keputusan 2026-10-18).

### Tentang Loox Travel (konteks untuk semua agent)

- Travel organizer + event organizer di Cikole, Lembang, Bandung Barat.
- Fokus utama **B2B / korporat**: corporate gathering, outbound, team building, gala dinner, event support (rundown, vendor, MC). Sekunder: keluarga, sekolah, komunitas.
- Area utama Bandung & Lembang; juga melayani Jakarta, Bali, Yogyakarta, Malang.
- Contoh harga per orang (per 2026-10-15): Gathering 2D1N mulai Rp699.000, One Day Rp295.000, Team Building Rp125.000, Fun Games Rp80.000, Offroad Lembang Rp249.000, Paintball Lembang Rp125.000.
- Kontak: WhatsApp +62 821-2020-9900, Hello@looxtravel.com, Instagram @looxtravel.
- Bahasa: **Indonesia** (santai-profesional). Semua teks outreach ditulis dalam Bahasa Indonesia.

### Ideal Customer Profile (ICP) — draf, pemilik yang memutuskan

| Segmen | Siapa | Sinyal yang dicari |
|---|---|---|
| **A. Korporat (prioritas)** | HRD, GA, office manager, ketua panitia acara kantor di Jabodetabek/Bandung | "cari tempat gathering", "rekomendasi outbound Lembang", "EO team building", "family gathering kantor" |
| **B. Sekolah/komunitas** | Panitia study tour, ketua komunitas, alumni | "study tour Bandung", "rekomendasi wisata rombongan" |
| **C. Mitra** | Travel agent / EO kecil yang butuh vendor lokal | "cari vendor Lembang" |

> TODO pemilik: konfirmasi segmen, ukuran grup minimum, area target, dan hal yang **tidak** boleh dijanjikan (harga, tanggal). Sampai ada konfirmasi, agent **tidak boleh mengarang harga atau ketersediaan** di balasan.

---

## 2. Aktor dan pembagian peran

| Aktor | Peran | Cara terhubung ke KeeLead |
|---|---|---|
| **KeeLead** (repo ini) | **Pembukuan / sekretaris**: menyimpan lead, mengingat post dan balasan, menjawab "apa yang saya ingat tentang post ini". **Tidak memakai LLM, tidak mengirim apa pun ke Threads, dan tidak pernah menolak, melarang, atau membatasi agent.** | HTTP API `/api/*`, MCP `/api/mcp` |
| **Hermes** (agent milik pemilik) | Agent utama pemilik: kualifikasi, drafting balasan, menjalankan alur SDR. | MCP |
| **Grokbot** (agent teman pemilik) | Mencari post, menilai, menulis dan mengirim balasan di Threads lewat browser sendiri (akun `@looxtravel`). Bisa mengurus lead tanpa KeeLead; KeeLead menghemat token dan memberi catatan. | MCP lewat **HTTP** |
| **n8n** (server yang sama) | Opsional di masa depan (belum dipakai): orkestrasi terjadwal bila jalur API resmi Threads aktif. | Jaringan Docker internal / HTTP |
| **Manusia (pemilik)** | Menentukan aturan main bagi agent (persetujuan, volume), meninjau lead dan catatan balasan di dashboard. | Dashboard / obrolan dengan agent |

### Mengapa KeeLead menghemat token Grokbot

Pencarian tetap dikerjakan agent, jadi penghematannya dari **ingatan**: dengan `keelead_check_seen` agent tahu dalam satu panggilan murah post mana yang sudah dikenal, sehingga tidak menilai ulang post lama dengan LLM. KeeLead memindahkan pekerjaan mekanis ke kode: agent hanya menerima **hasil ringkas terstruktur** dan memakai token untuk **menilai relevansi dan menulis balasan**. Aturan turunan untuk semua tool baru:

1. Tool MCP/API harus mengembalikan **JSON ringkas** (hanya field yang berguna, ada `limit`, tanpa HTML mentah).
2. Pekerjaan deterministik (dedup, filter kata kunci, verifikasi email, simpan) dilakukan di KeeLead, bukan di LLM.
3. LLM dipanggil hanya untuk: menilai relevansi, menulis draf balasan, kualifikasi.

---

## 3. Infrastruktur (fakta terverifikasi)

- **Server:** `ssh ubuntu@43.157.229.232` (host `VM-13-206-ubuntu`). Project di `~/keelead`.
- **Domain:** https://keelead.serdadu.dev lewat **Traefik** (container `n8n-compose-traefik-1`, TLS resolver `mytlschallenge`).
- **Auth:** **BasicAuth di Traefik saja** (user `admin`, password di `~/keelead/.admin-pass` di server). **Aplikasi KeeLead tidak punya login sendiri.** Akibatnya: siapa pun yang bisa menjangkau container langsung lewat jaringan Docker melewati auth.
- **Container berjalan di server:** `keelead-keelead-1`, `aladin-aladin-1`, `n8n-compose-n8n-1` (n8n 2.43.7, bind `127.0.0.1:5678`), `n8n-compose-traefik-1`. Server dipakai bersama proyek lain — jangan menyentuh container/folder selain `keelead`.
- **Jaringan:** KeeLead join ke jaringan Docker `n8n-compose_default` (sama dengan n8n). n8n bisa memanggil KeeLead di `http://keelead:3000` **tanpa BasicAuth** (internal) — dan itu berarti jangan pernah mempublikasikan port 3000 ke host.
- **Data:** SQLite di volume Docker `keelead-data` (dipetakan ke `/app/prisma`, file `keelead.db`). Skema dibuat saat start lewat `prisma db push`. **Awas:** volume ini dipasang di atas `/app/prisma` dan menutupi `schema.prisma` dari image, sehingga `db push` memakai schema lama di volume (bug yang ditemukan 2026-10-18: tabel `Reply` tidak terbuat). Dockerfile sekarang menyimpan salinan schema di `/app/schema.prisma.image` dan menimpanya ke volume saat start (diuji lokal dan sudah ter-deploy 2026-10-18, commit `6de2a45`). Jika suatu saat deploy dari commit tanpa perbaikan ini dan skema berubah, salin manual: `docker run --rm --entrypoint cat keelead:latest /app/prisma/schema.prisma > /tmp/s && docker cp /tmp/s keelead-keelead-1:/app/prisma/schema.prisma && docker exec -u root keelead-keelead-1 chown nextjs:nodejs /app/prisma/schema.prisma && docker restart keelead-keelead-1`.
- **Config:** `~/keelead/.env` di server (tidak di git) berisi `BASIC_AUTH_USERS` dan `THREADS_ACCESS_TOKEN`. **Per audit 2026-10-17, `THREADS_ACCESS_TOKEN` masih kosong** — pencarian Threads belum bisa dipakai sama sekali.
- **Stack:** Next.js 14 (app router), TypeScript, Prisma 5 + SQLite, Tailwind + shadcn/ui, Node 20 (Docker), MCP SDK.

### Deploy

Repo lokal → server dikirim dengan git/rsync, lalu build di server:

```bash
ssh ubuntu@43.157.229.232
cd ~/keelead
docker compose up -d --build     # build ulang image + restart
docker logs --tail 50 keelead-keelead-1
```

Aturan deploy:
- Jangan `docker compose down -v` (menghapus volume `keelead-data` = menghapus semua lead).
- Jangan commit `.env`, `.admin-pass`, token, atau hash BasicAuth. `.gitignore` sudah menutup `.env` dan `.admin-pass`.
- Server memakai branch `serdadu-deploy` dari remote `fork` (https://github.com/Dhyoga/keelead); remote `origin` di server menunjuk upstream Atum246. Alur deploy: push ke `fork/serdadu-deploy` → di server `git fetch fork && git merge --ff-only fork/serdadu-deploy` → `docker compose up -d --build`.
- Backup DB sebelum deploy: `docker run --rm -v keelead_keelead-data:/d -v ~/backups:/b alpine cp /d/keelead.db /b/keelead.db.$(date +%Y%m%d-%H%M)` (backup terakhir: `~/backups/keelead.db.20261018-0033`).

---

## 4. Status kemampuan (JUJUR — hasil audit)

Legenda: ✅ nyata dan berfungsi · ⚠️ nyata tapi terbatas/belum diuji · ❌ palsu/stub · 🚫 belum ada

| Kemampuan | Status | Catatan |
|---|---|---|
| Simpan/daftar/ubah/hapus lead (`/api/leads/saved`) | ✅ | SQLite. Dedup berdasar email, atau `website` (permalink) jika tanpa email. |
| Verifikasi email (`/api/verify`) | ✅ | Sintaks, DNS, MX, disposable. SMTP/catch-all belum diuji. |
| Cari bisnis lokal (OpenStreetMap lewat `/api/leads`) | ⚠️ | Cocok untuk kafe/toko; **bukan** untuk "HRD perusahaan X". Overpass publik kadang kosong. |
| GitHub / DuckDuckGo search | ⚠️ | Kualitas rendah, tidak relevan untuk ICP Loox. |
| Pola email (`/api/enrich/patterns`) | ⚠️ | Hanya tebakan kandidat. |
| **Threads keyword search** (`/api/threads/search`) | ⚠️ | Kode ada, **belum pernah diuji**, token server kosong, butuh App Review Meta. |
| **Cek post yang sudah dikenal** (`/api/seen`, tool `keelead_check_seen`) | ✅ | Informasi saja (lead, balasan, `authorLastRepliedAt`, `dnc`); 4 query untuk 1 maupun 100 post. Lolos skrip uji di produksi; belum diuji dengan Grokbot nyata. |
| **Catatan balasan** (`/api/replies`, tool `log_reply`/`update_reply`/`list_replies`) | ✅ | Tabel `Reply`, status `draft\|sent\|failed` bebas diubah; tidak pernah menolak karena aturan bisnis. Lolos skrip uji di produksi; belum diuji dengan Grokbot nyata. |
| **Mengirim balasan ke Threads** | 🚫 | **KeeLead tidak mengirim apa pun** (disengaja). Pengiriman dilakukan agent (Grokbot lewat browser) lalu dicatat ke KeeLead. |
| **Endpoint MCP lewat HTTP** (`/api/mcp`, 12 tool) | ⚠️ | **Sudah di-deploy** (2026-10-18) dan lolos 34 skenario `scripts/smoke-replies.mjs` lewat domain publik; belum diuji dengan Grokbot/Hermes (bagian 5.1). |
| Research perusahaan, enrich, signals, score, export | ❌ | Mengarang data (skor selalu 50, dst.). Sudah dicabut dari MCP. **Jangan dipakai & jangan dihubungkan ke SDR sebelum diganti implementasi nyata.** |
| Campaigns, analytics, pipeline, sequences, compliance (dashboard) | ❌ | Mockup/data statis; diberi banner "Demo data". |
| Chat / agents di dalam KeeLead | ❌ | Butuh API key AI; tidak dipakai. |
| "62/57 data source" | ❌ | Klaim README menyesatkan. Hanya yang tercantum ✅/⚠️ di atas yang benar-benar tersambung. |

**Aturan integritas data:** jangan menambah fitur yang mengembalikan data karangan. Jika sumber belum tersambung, kembalikan error yang jelas (seperti `503` pada Threads tanpa token), bukan data contoh.

### Model data lead (Prisma `Lead`)

`firstName, lastName, email?, phone?, company?, title?, website?, linkedin?, location?, source?, status (new|contacted|qualified|converted|lost), score, verified, tags (JSON), notes, metadata (JSON)`.

Untuk lead Threads: `firstName = username`, `website = permalink post`, `metadata = { threadsId, username, profileUrl, postText, postedAt, query, hasReplies, isQuotePost }`. **Threads tidak memberi email/telepon** — lead Threads berarti "akun yang menunjukkan minat", bukan kontak siap kirim.

### Model data balasan (Prisma `Reply`)

`postKey, postUrl, targetUsername, leadId?, text, status (draft|sent|failed), sentAt?, replyUrl?, note?, client, createdAt`. `postKey` = `threads:<kode post>` hasil normalisasi permalink (`lib/replies/postkey.ts`; host, query, slash, dan huruf besar/kecil username diabaikan); input yang bukan permalink Threads memakai kunci `raw:<teks>`. `leadId` hanya referensi biasa (tanpa foreign key) agar tabel `Lead` tidak berubah. Beberapa catatan untuk satu post sah. `client` = nama token MCP yang mencatat.

**Menandai orang yang menolak:** tidak ada tabel DNC. Simpan orang itu sebagai lead (`keelead_save_leads` dengan `firstName` = username tanpa @), lalu `keelead_update_lead` dengan `status: "lost"`, `addTags: ["dnc"]`, dan `notes`. `keelead_check_seen` akan menampilkan `dnc: true` untuk post mana pun dari penulis itu. Pencocokan penulis memakai `firstName` lead (tanpa membedakan huruf besar/kecil) — hanya andal untuk lead yang disimpan dengan konvensi ini.

---

## 5. Antarmuka untuk agent

### 5.1 MCP lewat HTTP — SUDAH DI-DEPLOY (2026-10-18, branch `serdadu-deploy`, commit `6de2a45`)

- Endpoint: `POST https://keelead.serdadu.dev/api/mcp` (Streamable HTTP, **stateless**, balasan JSON). `GET`/`DELETE` dijawab 405 (tidak ada sesi/stream).
- Kode: `app/api/mcp/route.ts` (endpoint), `lib/mcp/auth.ts` (bearer token), `lib/mcp/tools.ts` (**satu-satunya definisi tool**, dipakai HTTP dan stdio).
- **Auth:** header `Authorization: Bearer <token>`. Token per klien di env `MCP_TOKENS="grokbot:<token>,hermes:<token>"` (minimal 24 karakter; buat dengan `openssl rand -hex 24`). `MCP_TOKENS` kosong = endpoint mati (503). Token salah/hilang = 401.
- **Traefik:** path `/api/mcp` punya router sendiri (`keelead-mcp`, priority 100) yang **melewati BasicAuth**; seluruh sisanya tetap di balik BasicAuth. Artinya bearer token adalah **satu-satunya** pengaman endpoint ini — jaga kerahasiaannya, cabut dengan menghapus entrinya dari `MCP_TOKENS` lalu `docker compose up -d`.
- **Audit:** setiap pemanggilan tool mencatat baris JSON `{"event":"mcp_tool_call","client":...,"tool":...}` di log container (`docker logs keelead-keelead-1`). Audit ke database belum ada.
- Token `grokbot` dan `hermes` dibuat di `~/keelead/.env` server (`MCP_TOKENS`, mode 600). Ambil token dengan `ssh` ke server; jangan menempelkannya ke chat, repo, atau log.
- Diuji lokal dan di produksi (2026-10-18): tanpa token → 401, token salah → 401, dan 34 skenario `node scripts/smoke-replies.mjs` lolos lewat domain publik (lihat header skrip untuk env `MCP_URL`, `MCP_TOKEN`, `KEELEAD_REST_URL`, `KEELEAD_AUTH`; skrip menghapus data ujinya sendiri). Dashboard dan `/api/*` lain tetap 401 tanpa BasicAuth. **Belum diuji dengan klien MCP nyata (Grokbot/Hermes).**

Tool yang tersedia (12): `keelead_search_leads`, `keelead_verify_email`, `keelead_email_pattern`, `keelead_list_sources`, `keelead_search_threads`, `keelead_save_leads`, `keelead_list_saved_leads`, `keelead_update_lead` (status, notes, `addTags`), `keelead_check_seen`, `keelead_log_reply`, `keelead_update_reply`, `keelead_list_replies`. Resource & prompt lama yang merujuk fitur palsu sudah dihapus. Sengaja **tidak ada** tool untuk menyetujui, membatasi, atau menghapus; penghapusan catatan balasan hanya lewat REST (`DELETE /api/replies`, di balik BasicAuth).

**Protokol yang dianjurkan untuk agent** (tertulis juga di instruksi server MCP; KeeLead tidak memaksanya):
1. Cari post sendiri → `keelead_check_seen` dengan permalink-nya **sebelum** menilai dengan LLM.
2. `keelead_save_leads` untuk yang relevan (permalink di `website`, teks post di `notes`, `firstName` = username).
3. Setelah membalas di Threads → `keelead_log_reply` (dengan `replyUrl`); lead `new` otomatis menjadi `contacted`.
4. Ada yang menolak → `keelead_update_lead` (`lost` + `addTags: ["dnc"]` + `notes`).

Menambah tool baru: edit `TOOLS` dan `callTool` di `lib/mcp/tools.ts` (tool memanggil REST API `app/api/*`). Jangan menduplikasi definisi di tempat lain.

Cara menyambungkan di Grokbot: tambahkan custom MCP connector dengan URL `https://keelead.serdadu.dev/api/mcp` dan header `Authorization: Bearer <token grokbot>` (cek UI konektor Grokbot untuk tempat mengisi header).

### 5.2 MCP stdio (opsional, untuk pengembangan lokal)

`npx tsx mcp/server.ts` dari checkout repo, env `KEELEAD_API_URL` dan `KEELEAD_AUTH` (`user:password` BasicAuth). File ini tidak lagi berdiri sendiri (mengimpor `lib/mcp/tools.ts`), jadi jangan disalin sendirian ke laptop; agent jarak jauh pakai endpoint HTTP.

### 5.3 HTTP API (untuk n8n)

n8n memakai API yang sama (`http://keelead:3000/api/...` dari dalam jaringan Docker). Endpoint yang ada ada di `app/api/*`; yang valid untuk SDR: `seen` (POST), `replies` (GET, POST, DELETE), `replies/[id]` (PATCH), `leads/saved`, `threads/search`, `verify`, `enrich/patterns`.

---

## 6. Rencana: SDR di Threads (inti pengembangan)

### Masalah

KeeLead bisa (dalam teori) **mencari** post lewat API resmi Threads, tapi butuh App Review Meta yang lama; ia juga **tidak mengirim balasan**. Selama menunggu, Grokbot mencari dan membalas lewat browsernya, dan KeeLead membukukan. Workflow n8n adalah opsi masa depan.

### Prinsip desain

1. **KeeLead = pembukuan (mencatat dan mengingat); agent (Grokbot/Hermes) = pencari, penilai, penulis, dan pengirim; n8n = opsional di masa depan; pemilik = pembuat aturan main.** KeeLead tidak pernah menolak atau menghalangi aksi agent.
2. **Persetujuan dan batas volume bukan fitur KeeLead** (keputusan 2026-10-18). Balasan otomatis ke orang asing berisiko spam, melanggar ketentuan Meta, dan merusak akun/brand Loox; itu risiko yang dipegang agent dan pemilik. Anjuran (tidak ditegakkan server): minta persetujuan pemilik sebelum membalas orang asing, volume rendah, jeda antar balasan.
3. **Hindari balasan ganda:** agent memanggil `keelead_check_seen` sebelum membalas dan `keelead_log_reply` sesudahnya; KeeLead hanya memberi tahu, tidak melarang.
4. **Jangan mengarang.** Balasan tidak boleh memuat harga/tanggal/ketersediaan yang tidak ada di sumber resmi (website Loox / yang diisi pemilik).

### Fakta Threads API (verifikasi lagi sebelum implementasi — Meta sering berubah)

- Membalas = 2 langkah: `POST /{threads-user-id}/threads` dengan `media_type=TEXT`, `text`, `reply_to_id=<id post>` → lalu `POST /{threads-user-id}/threads_publish` dengan `creation_id`. Disarankan menunggu ~30 detik antar langkah.
- Izin untuk membalas post **orang lain**: dokumentasi "create replies" menyebut hanya boleh jika Anda pemilik root post, **atau** app memiliki `threads_keyword_search` atau `threads_manage_mentions`. Reply-management juga menyebut `threads_manage_replies` untuk POST ke endpoint balasan, dan publish butuh `threads_content_publish`. **Wajib diuji dengan panggilan nyata** — jangan berasumsi.
- Batas: ±1.000 balasan via API per 24 jam; keyword search 2.200 query per 24 jam per user. Kita akan jauh di bawah ini; batas praktis ditentukan oleh agent dan pemilik (KeeLead tidak membatasi).
- Tanpa App Review `threads_keyword_search`, pencarian hanya mencakup post **akun sendiri**. Akun yang ditambahkan sebagai tester di App Roles bisa memakai izin sebelum review.
- Token: pendek 1 jam → tukar ke panjang 60 hari → **harus di-refresh** sebelum kedaluwarsa (`GET /refresh_access_token?grant_type=th_refresh_token`, token minimal berumur 24 jam). Refresh belum otomatis.
- Sumber: [Create replies](https://developers.facebook.com/documentation/threads/retrieve-and-manage-replies/create-replies), [Reply management](https://developers.facebook.com/documentation/threads/reply-management), [Keyword search](https://developers.facebook.com/docs/threads/keyword-search).

### Jalur sementara: Grokbot dengan browser sendiri (aktif selama App Review Meta belum disetujui)

Per 2026-10-17 (keterangan dari teman pemilik, **belum diverifikasi langsung**): Grokbot punya browser sendiri dan bisa terhubung ke akun Threads `@looxtravel` (https://www.threads.com/@looxtravel) lewat browser tersebut, bukan lewat API resmi Meta.

Pembagian tugas selama jalur ini dipakai:

| | Tugas |
|---|---|
| **Grokbot** | Mencari post di Threads lewat browser, menilai relevansi, menulis dan mengirim balasan (apakah perlu persetujuan pemilik dulu adalah urusan pemilik dan Grokbot). |
| **KeeLead** | Pembukuan: menyimpan lead, memberi tahu post mana yang sudah dikenal/dibalas, mencatat riwayat balasan dan penanda `dnc`. Tidak melarang apa pun. |

Konsekuensi (wajib dipahami semua agent):
- Otomasi browser di Threads **tidak sama dengan API resmi** dan berisiko melanggar ketentuan Meta: akun bisa dibatasi, di-shadowban, atau diblokir. `@looxtravel` adalah akun brand utama, jadi risikonya ditanggung bisnis.
- **KeeLead tidak membatasi volume atau frekuensi balasan**; risiko pembatasan akun sepenuhnya ada di Grokbot dan pemilik. Mitigasi yang dianjurkan (tidak ditegakkan KeeLead): volume rendah, jeda acak antar aksi, balasan unik per post, persetujuan pemilik, berhenti seketika jika muncul peringatan/captcha/pembatasan dari Threads, dan akun cadangan untuk uji coba.
- **Kredensial login Threads tidak pernah disimpan di KeeLead, repo, atau `.env`.** Sesi login hanya hidup di Grokbot.
- Penghematan token hanya dari dedup dan memori; pencarian tetap dikerjakan Grokbot.
- Rute `/api/threads/search` (API resmi) tetap dipertahankan sebagai jalur masa depan, tapi **bukan** jalur utama sampai token + App Review beres. Ajukan App Review tetap berjalan paralel.

Pekerjaan KeeLead untuk jalur ini (tidak bergantung pada Meta):
- [x] Endpoint MCP lewat HTTP (`/api/mcp`, bearer token) sebagai custom connector Grokbot/Hermes — selesai dan ter-deploy; **tinggal uji dengan Grokbot** (bagian 5.1).
- [x] `keelead_check_seen`: ringkasan "yang saya ingat" untuk daftar permalink (di-deploy; belum diuji dengan Grokbot).
- [x] Catatan balasan terstruktur + penanda `dnc` lewat lead (di-deploy; belum diuji dengan Grokbot). Guardrail server (batas, cooldown, persetujuan, tabel DNC) **sengaja tidak dibuat**.
- [ ] Uji end-to-end dengan Grokbot nyata (tasks 8 di change `add-seen-check-and-reply-log`).
- [ ] Kueri pencarian tersimpan + metrik kueri mana yang menghasilkan lead relevan.

### Fase

**Fase 0 — Prasyarat (blokir semuanya; tindakan pemilik, bukan kode)**
- [ ] Buat Meta App (use case Threads), tambahkan akun Threads Loox sebagai tester, minta `threads_basic`, `threads_keyword_search`, `threads_content_publish`, `threads_manage_replies`, (cek `threads_manage_mentions`).
- [ ] Ajukan App Review `threads_keyword_search` (butuh privacy policy URL, deskripsi use case, screencast).
- [ ] Isi `THREADS_ACCESS_TOKEN` di `~/keelead/.env` server, `docker compose up -d`.
- [ ] Keputusan akun: balas dari akun brand (@looxtravel) atau akun personal? Tentukan.

**Fase 1 — Pencarian yang bisa dipercaya**
- [ ] Uji `threads/search` nyata dengan token; perbaiki bila perlu.
- [ ] Daftar kueri ICP Bahasa Indonesia (mulai dari tabel ICP), disimpan sebagai konfigurasi (bukan hardcode), mis. "cari tempat gathering kantor", "rekomendasi outbound lembang", "EO team building bandung".
- [ ] Filter di KeeLead (bukan di LLM): buang post lama, post dari akun sendiri, post yang sudah diproses, spam/promosi kompetitor.
- [ ] Refresh otomatis token Threads (job n8n mingguan atau route + penjadwal).

**Fase 2 — Pembukuan balasan (selesai di kode; menunggu uji Grokbot)**
- [x] Tabel `Reply`, `/api/seen`, `/api/replies`, tool MCP `check_seen`/`log_reply`/`update_reply`/`list_replies` (change `add-seen-check-and-reply-log`).
- [ ] (Opsional, setelah App Review lolos) pengiriman balasan lewat API resmi Threads (`threads` + `threads_publish`) dari KeeLead atau n8n.

**Fase 3 — Workflow n8n (opsional, masa depan; gambaran lama — sesuaikan dengan keputusan "KeeLead hanya membukukan")**
```
[Cron tiap N jam]
  → HTTP: POST keelead/api/threads/search (kueri ICP)
  → HTTP: filter+dedup (KeeLead)
  → LLM (Hermes/Grokbot): nilai relevansi 0-100 + draf balasan (Bahasa Indonesia, tanpa karangan)
  → HTTP: POST keelead/api/leads/saved (simpan lead + draf, status new)
  → Notifikasi ke pemilik (setuju/tolak/edit)
  → [Webhook persetujuan] → POST keelead/api/threads/reply
  → HTTP: PATCH keelead/api/leads/saved (status contacted, catat balasan)
[Cron harian] → pantau balasan masuk pada thread kita → notifikasi
```
- Simpan export workflow n8n ke repo (`n8n/workflows/*.json`, **tanpa kredensial**) agar versi workflow ikut ter-review.
- Kredensial (token Threads, key LLM) hanya di n8n Credentials / `.env`, tidak di JSON workflow.

**Fase 4 — Kualifikasi & tindak lanjut**
- [ ] Alur status lead nyata: `new → contacted → qualified → converted/lost`, dengan catatan percakapan.
- [ ] Setelah calon klien merespons: arahkan ke WhatsApp Loox / form; catat konversi.
- [ ] Ukur: jumlah post ditemukan, % relevan, % disetujui, % dibalas calon klien, % jadi booking. Ganti halaman analytics mockup dengan angka nyata dari DB.

**Fase 5 — Sumber tambahan (setelah Threads terbukti)**
- Pencarian bisnis/HRD di luar Threads: Google Maps/Places (butuh key), Instagram/LinkedIn (hati-hati ToS), direktori perusahaan Bandung/Jakarta. Setiap sumber baru harus lolos aturan integritas data (bagian 4).

---

## 7. Aturan main & kepatuhan (tanggung jawab agent dan pemilik — KeeLead tidak menegakkannya)

> Sejak 2026-10-18 KeeLead tidak punya persetujuan, batas harian, cooldown, atau tabel DNC. Semua poin di bawah dipatuhi agent dan diawasi pemilik.

- **Hindari scraping massal Threads/Instagram/LinkedIn** (Apify dkk.). Otomasi browser Grokbot adalah risiko yang diterima pemilik sementara App Review belum ada (bagian 6); jalur resmi tetap tujuannya.
- **UU PDP & ketentuan Platform Meta:** data yang dikumpulkan seminimal mungkin (username, isi post publik, permalink). Pemilik bertanggung jawab memeriksa kepatuhan untuk pesan dingin; agent tidak boleh menganggapnya aman begitu saja.
- **Tidak ada pengiriman massal.** Satu balasan = satu post yang relevan, ditulis spesifik untuk konteks post tersebut. Tidak ada balasan template identik.
- **Transparan:** balasan tidak boleh menyamar sebagai orang yang bukan pengirim, tidak boleh klaim palsu (diskon, testimoni, ketersediaan).
- **Hormati penolakan:** jika orang menolak/menyuruh berhenti, tandai lead `lost` + tag `dnc` (`keelead_update_lead`) dan jangan hubungi lagi; periksa `dnc` di `keelead_check_seen` sebelum membalas.
- **Tindakan keluar (outward-facing)** — mengirim balasan, mengirim email, memublikasikan apa pun — dianjurkan atas persetujuan pemilik, kecuali pemilik secara eksplisit memberi izin otomatis. Keputusan ini ada di agent dan pemilik, bukan di KeeLead.
- **Rahasia:** jangan pernah mencetak/commit isi `.env`, token, `.admin-pass`, atau hash BasicAuth (hash itu terlihat di label container Traefik — anggap sensitif). Redaksi saat mengutip log.
- **Server bersama:** jangan menyentuh container/folder lain di server (`aladin`, `n8n-backup`, dll.). Backup/ubah volume `keelead-data` hanya setelah backup file `keelead.db`.

---

## 8. Konvensi pengembangan

- TypeScript ketat, ikuti pola yang ada (`lib/leads/store.ts`, route `app/api/*/route.ts` dengan `NextResponse`). Validasi input di route, kembalikan error JSON `{ error }` dengan status yang tepat.
- Error eksternal diteruskan apa adanya (pesan Meta dll.), bukan ditelan.
- Perubahan skema: ubah `prisma/schema.prisma`; `prisma db push` dijalankan saat container start (tidak ada migrasi bertingkat). Perubahan yang merusak (hapus/ubah kolom) harus disertai backup `keelead.db` dan catatan di sini. Ingat catatan volume yang menutupi `schema.prisma` (bagian 3); setelah deploy skema baru, pastikan tabelnya ada (mis. panggil endpoint yang memakainya).
- Commit: gaya `feat:` / `fix:` / `docs:` seperti riwayat git terbaru. Commit kecil dan terfokus.
- Tidak ada test suite otomatis, kecuali `scripts/smoke-replies.mjs` (skenario `check_seen` dan catatan balasan lewat `/api/mcp`; jalankan lokal dan setelah deploy). Minimal sebelum deploy: `npm run build` lolos; untuk perubahan tool, tambahkan skenario ke skrip itu.
- Fitur nontrivial memakai **OpenSpec** (folder `openspec/`, perintah `/opsx:propose`, `/opsx:apply`, `/opsx:archive`). `openspec/` dilacak di git; `.claude/` ada di `.gitignore`.
- UI: tema gelap hitam, aksen biru `#3b82f6` & hijau `#10b981`, shadcn/ui.
- Bersihkan, jangan menambah: klaim "62 sources" di README, halaman mockup. Setiap halaman yang masih mockup wajib berlabel "Demo data".

### Utang teknis yang diketahui

1. README.md & HANDOFF.md masih mengklaim fitur yang tidak nyata → perbarui atau tandai usang.
2. (selesai) resource/prompt palsu di MCP sudah dihapus.
3. Tidak ada auth di level aplikasi (hanya Traefik).
4. Tidak ada refresh token Threads; audit aksi agent hanya berupa baris log container dan kolom `Reply.client` (belum ada audit di database).
5. Tidak ada backup terjadwal untuk `keelead-data`.
6. Pencarian OSM memakai Overpass publik tanpa retry/cadangan.
7. Pencocokan penulis untuk `dnc` bergantung pada konvensi `firstName` = username; lead dengan nama lain tidak dikenali.

---

## 9. Log keputusan

| Tanggal | Keputusan | Alasan |
|---|---|---|
| 2026-10-17 | Fitur karangan dicabut dari MCP; dashboard mockup diberi banner | Agent tidak boleh bertindak atas data palsu |
| 2026-10-17 | Sumber lead utama = Threads lewat API resmi (bukan scraping) | Patuh ToS Meta; gratis |
| 2026-10-17 | Balasan Threads lewat **n8n** + persetujuan manusia | Rencana awal pemilik; **digantikan keputusan 2026-10-18** di bawah |
| 2026-10-17 | Jalur sementara: Grokbot (browser sendiri, akun @looxtravel) mencari+membalas, KeeLead sebagai memori/penjaga | App Review Meta lama; risiko ToS diterima pemilik dengan mitigasi (bagian 6) — belum dikonfirmasi pemilik secara eksplisit |
| 2026-10-17 | MCP lewat Streamable HTTP, stateless, bearer token per klien, melewati BasicAuth Traefik hanya untuk `/api/mcp` | Grokbot mendukung MCP lewat HTTP; klien MCP tidak lazim mengirim BasicAuth; stateless agar aman saat restart |
| 2026-10-18 | **KeeLead = pembukuan/sekretaris**: tanpa persetujuan, claim, batas harian, cooldown, jeda, atau tabel DNC; tidak pernah menolak aksi agent. Penolakan orang dicatat sebagai lead `lost` + tag `dnc` | Pemilik: Grokbot bisa mengurus lead tanpa KeeLead, KeeLead hanya membantu pembukuan; jauh lebih sederhana. Risiko volume/akun dipegang agent dan pemilik |
| 2026-10-18 | Dockerfile menimpa `schema.prisma` di volume dari salinan image saat start | Volume `keelead-data` menutupi schema image sehingga tabel baru tidak terbuat (ditemukan saat deploy `Reply`) |

## 10. Pertanyaan terbuka (butuh jawaban pemilik)

1. Apakah pemilik menerima risiko otomasi browser di akun brand `@looxtravel`, atau memakai akun cadangan dulu? (Cek juga layar izin konektor Threads di x.ai/bot: OAuth Meta atau login kredensial.)
2. Segmen ICP mana yang diprioritaskan pertama, dan apa kueri/kata kunci awalnya?
3. Kanal notifikasi/persetujuan yang dipakai pemilik dengan Grokbot (obrolan Grokbot, WhatsApp, lainnya)?
4. Hermes akan memakai LLM apa, dan di mana ia berjalan?
5. Apakah Grokbot sudah punya cara menyimpan "lead + tag" dari hasil pencariannya, atau perlu contoh format `keelead_save_leads` di instruksi server? (Dijawab saat uji Grokbot.)
