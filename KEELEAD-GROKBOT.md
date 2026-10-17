# KeeLead + Grokbot (via MCP): ringkasan

Diperbarui 2026-10-17. Server: https://keelead.serdadu.dev (Traefik + BasicAuth). Project: `~/keelead`.

## 1. Arsitektur

```
Grokbot (laptop) -> MCP stdio (mcp/server.ts, di laptop) -> HTTPS + BasicAuth -> KeeLead (server) -> Threads API / OpenStreetMap / SQLite
```

- Server MCP berjalan **di laptop** dan memanggil API KeeLead di server. Tidak ada port tambahan yang dibuka.
- Login BasicAuth: user `admin`, password di `~/keelead/.admin-pass` (server). Dikirim lewat env `KEELEAD_AUTH`.
- Tidak butuh API key AI. Tidak ada fitur yang memakai LLM di jalur MCP ini.

## 2. Hasil audit (apa yang jalan)

Diuji langsung ke server pada 2026-10-17.

| Fitur | Status | Catatan |
|---|---|---|
| Verifikasi email (`verify`) | **Nyata** | Cek sintaks, DNS, MX, disposable. SMTP/catch-all belum diuji. |
| Cari bisnis lokal (`leads`) | **Nyata, terbatas** | OpenStreetMap: nama, telepon, alamat, website jika ada di OSM. Cocok untuk kafe/restoran/toko, tidak untuk "CTO fintech". Overpass publik kadang penuh, hasil bisa kosong. |
| Cari GitHub / DuckDuckGo | Nyata, kualitas rendah | Nama diambil dari username / teks topik, bukan orang sebenarnya. |
| Simpan / daftar / ubah / hapus lead (`leads/saved`) | **Nyata (baru)** | SQLite di volume `keelead-data`. Duplikat dilewati (email, atau permalink). |
| Threads keyword search (`threads/search`) | **Baru, belum diuji** | Butuh token Meta (bagian 3). Tanpa token mengembalikan error 503 yang jelas. |
| Pola email (`enrich/patterns`) | Tebakan | Menghasilkan kandidat alamat, bukan alamat terkonfirmasi. |
| Research perusahaan | **Karangan** | Contoh: Tokopedia "berkantor di San Francisco". Dicabut dari MCP. |
| Enrich, signals, score, export | **Karangan / stub** | Skor selalu 50, export melaporkan 12.847 lead padahal dikirim 1. Dicabut dari MCP. |
| Campaigns, analytics, templates | Data statis | Angka contoh. Halaman dashboard diberi label "Demo data". |
| Chat / agents | Butuh API key AI | Tidak dipakai. |
| 57 "data source" | Sebagian besar tidak tersambung | Banyak yang butuh key pihak ketiga; yang jalan hanya yang tercantum di atas. |

Perubahan pada dashboard: halaman **Leads** sekarang membaca database (kosong sampai ada lead tersimpan). Halaman Dashboard, Analytics, Pipeline, Campaigns, Sequences, Signals, Compliance, Research, Export masih mockup dan diberi banner kuning.

## 3. Yang perlu disiapkan untuk mencari lead di Threads

API yang dipakai: `GET https://graph.threads.net/v1.0/keyword_search` (resmi dari Meta, gratis).

### Daftar persiapan

1. **Akun Threads** (milik Anda) yang terhubung ke Instagram. Token akan mewakili akun ini.
2. **Akun Meta for Developers** (developers.facebook.com).
3. **Meta App dengan use case "Threads"**. Ini menghasilkan Threads App ID + App Secret terpisah dari App ID utama.
4. **Tambahkan akun Anda sebagai tester**: App Dashboard > App roles > Roles > Add People, lalu terima undangan di Threads (Settings > Website permissions).
5. **Minta permission** `threads_basic` dan `threads_keyword_search`.
6. **App Review untuk `threads_keyword_search`** (langkah yang paling menentukan). Tanpa persetujuan, pencarian hanya mencakup **postingan akun Anda sendiri**, bukan postingan publik orang lain. Meta biasanya meminta app dipublikasikan, privacy policy URL, deskripsi use case, dan screencast. Apakah juga butuh Business Verification: halaman dokumentasi tidak menyebutkannya, cek langsung di App Dashboard.
7. **Access token**: lewat alur OAuth Threads (atau Graph API Explorer untuk uji coba). Token pendek berlaku 1 jam, tukar ke token panjang (60 hari), lalu **perpanjang sebelum kedaluwarsa** (`GET /refresh_access_token?grant_type=th_refresh_token`, minimal berumur 24 jam). Token yang lewat 60 hari tanpa refresh mati dan harus dibuat ulang.
8. Taruh token di `~/keelead/.env` sebagai `THREADS_ACCESS_TOKEN=...`, lalu `docker compose up -d`.

### Batas dan fakta penting

- Limit resmi: **2.200 query per 24 jam per user** (rolling). Query tanpa hasil tidak dihitung. Kata yang dianggap sensitif mengembalikan hasil kosong.
- Maks 100 post per request. Filter: `RECENT`/`TOP`, `KEYWORD`/`TAG`, `since`/`until`, `author_username`.
- **Hasilnya hanya username + isi post + permalink + waktu.** Threads tidak memberikan email atau nomor telepon. "Lead" dari Threads artinya akun yang menunjukkan minat, bukan kontak siap kirim.
- Lookup profil (bio, follower) lewat `profile_lookup` ada, tapi dengan akses standar hanya untuk akun resmi Meta, dan hanya akun publik dengan 100+ follower. Belum dipakai di KeeLead.
- Sumber resmi lain yang sengaja tidak dipakai: scraping Threads (Apify dan sejenisnya) berbayar dan melanggar ketentuan Meta, jadi tidak dipakai.
- Yang perlu Anda cek sendiri: ketentuan Platform Meta soal penggunaan data (misalnya pengumpulan data pengguna untuk pesan dingin) dan aturan privasi yang berlaku (UU PDP). Itu di luar apa yang bisa saya pastikan.

## 4. Tool MCP yang tersedia sekarang

| Tool | Fungsi |
|---|---|
| `keelead_search_threads` | Cari post publik di Threads (butuh token + App Review) |
| `keelead_search_leads` | Cari bisnis lokal (OpenStreetMap) |
| `keelead_verify_email` | Verifikasi email |
| `keelead_email_pattern` | Kandidat alamat email (tebakan) |
| `keelead_save_leads` | Simpan hasil pencarian ke database |
| `keelead_list_saved_leads` | Lihat lead tersimpan (filter status/sumber/teks) |
| `keelead_update_lead` | Ubah status / catatan lead |
| `keelead_list_sources` | Daftar source terdaftar (banyak yang tidak tersambung) |

Alur yang disarankan untuk bot: `search_threads` -> bot menyaring postingan yang relevan -> `save_leads` -> Anda meninjau di https://keelead.serdadu.dev/dashboard/leads -> `update_lead` saat status berubah.

## 5. Menyambungkan agent

Sejak 2026-10-17 agent jarak jauh memakai **MCP lewat HTTP** (`https://keelead.serdadu.dev/api/mcp`, header `Authorization: Bearer <token>`), bukan stdio di laptop. Detail dan status deploy: lihat `AGENTS.md` bagian 5.1.

## 6. Belum dikerjakan

- Uji nyata `threads/search` (butuh token yang sudah lolos App Review).
- Refresh otomatis token Threads (sekarang manual tiap < 60 hari).
- Halaman Dashboard/Analytics/Pipeline/dll masih mockup.
- Perbaikan upstream yang saya lakukan: lihat `git diff` terhadap https://github.com/Atum246/keelead (type error, `next.config.js`, Dockerfile, Prisma engine).
