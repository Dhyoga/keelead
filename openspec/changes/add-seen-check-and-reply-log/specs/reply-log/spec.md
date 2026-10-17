## ADDED Requirements

### Requirement: Catatan balasan
Sistem SHALL menyimpan setiap balasan sebagai record `Reply` dengan field: `postKey`, `postUrl`, `targetUsername`, `leadId` (opsional), `text`, `status`, `sentAt`, `replyUrl`, `note`, `client`, `createdAt`, `updatedAt`. Status SHALL salah satu dari `draft`, `sent`, `failed`; bawaan `sent`.

#### Scenario: Agent mencatat balasan terkirim
- **WHEN** agent memanggil `keelead_log_reply` dengan `postUrl` dan `text` valid
- **THEN** sistem membuat Reply berstatus `sent` dengan `sentAt` terisi, `postKey` dan `targetUsername` diturunkan dari `postUrl`, `client` berisi nama klien MCP pemanggil, dan `leadId` tertaut bila ada Lead dengan permalink yang sama

#### Scenario: Agent mencatat draf
- **WHEN** `keelead_log_reply` dipanggil dengan `status: "draft"`
- **THEN** Reply dibuat berstatus `draft` dengan `sentAt` kosong

#### Scenario: Input rusak
- **WHEN** `postUrl` atau `text` kosong, atau `status` di luar `draft|sent|failed`
- **THEN** sistem menolak dengan status 400 dan tidak membuat record

### Requirement: Pencatatan tidak ditolak karena aturan bisnis
Sistem SHALL tidak menolak pencatatan atau perubahan balasan karena alasan di luar validitas input, termasuk: post sudah punya catatan lain, akun baru saja dibalas, penulis bertanda `dnc`, jumlah balasan hari itu, atau urutan status. Sistem SHALL menambahkan keterangan pada respons (jumlah catatan lain untuk post yang sama dan untuk akun yang sama) agar agent mengetahuinya.

#### Scenario: Post yang sama dicatat dua kali
- **WHEN** agent mencatat balasan untuk post yang sudah punya satu Reply
- **THEN** sistem membuat Reply kedua dan respons berisi keterangan bahwa ada 1 catatan lain untuk post itu

#### Scenario: Penulis bertanda dnc
- **WHEN** agent mencatat balasan untuk akun yang punya Lead ber-tag `dnc`
- **THEN** sistem tetap mencatat dan respons memuat `dnc: true` sebagai keterangan

### Requirement: Mengubah catatan balasan
Sistem SHALL menyediakan `keelead_update_reply` dan `PATCH /api/replies/:id` untuk mengubah `status`, `text`, `replyUrl`, `note`, dan `sentAt`. Perubahan status ke nilai mana pun di antara `draft`, `sent`, `failed` SHALL diterima. Saat status menjadi `sent` dan `sentAt` kosong, sistem SHALL mengisinya dengan waktu sekarang.

#### Scenario: Draf menjadi terkirim
- **WHEN** Reply berstatus `draft` diubah menjadi `sent` dengan `replyUrl`
- **THEN** Reply berstatus `sent`, `sentAt` terisi, dan `replyUrl` tersimpan

#### Scenario: Status dikoreksi ke mana saja
- **WHEN** Reply berstatus `sent` diubah menjadi `failed`
- **THEN** sistem menerima dan tidak menolak karena urutan status

#### Scenario: Id tidak ada
- **WHEN** `id` tidak cocok dengan Reply mana pun
- **THEN** sistem menjawab 404

### Requirement: Lead naik status saat dibalas
Saat sebuah Reply menjadi `sent` dan tertaut ke Lead berstatus `new`, sistem SHALL mengubah status Lead itu menjadi `contacted`. Status Lead selain `new` SHALL tidak diubah.

#### Scenario: Lead baru dibalas
- **WHEN** Reply tertaut ke Lead `new` dicatat `sent`
- **THEN** Lead menjadi `contacted`

#### Scenario: Lead sudah lost
- **WHEN** Reply `sent` tertaut ke Lead berstatus `lost`
- **THEN** status Lead tetap `lost`

### Requirement: Melihat catatan balasan
Sistem SHALL menyediakan `keelead_list_replies` dan `GET /api/replies` dengan filter `status`, `username`, dan `limit` (bawaan 50, maksimum 200), diurutkan dari yang terbaru.

#### Scenario: Filter status
- **WHEN** agent meminta balasan dengan `status: "failed"`
- **THEN** hanya Reply berstatus `failed` yang dikembalikan

### Requirement: Menandai orang yang menolak lewat lead
Sistem SHALL mengizinkan `keelead_update_lead` dan `PATCH /api/leads/saved` menerima `addTags` (daftar tag) yang ditambahkan ke tag lead tanpa duplikat dan tanpa menghapus tag yang sudah ada. Tag `dnc` pada lead SHALL tampil sebagai `dnc: true` di hasil `check_seen` dan keterangan `log_reply`.

#### Scenario: Menambah tag dnc
- **WHEN** lead bertag `["threads"]` diperbarui dengan `addTags: ["dnc"]`, `status: "lost"`, dan `notes`
- **THEN** lead bertag `["threads","dnc"]`, berstatus `lost`, dan catatan tersimpan

#### Scenario: Tag tidak digandakan
- **WHEN** `addTags: ["dnc"]` dikirim dua kali
- **THEN** tag `dnc` muncul sekali

### Requirement: Menghapus catatan hanya lewat REST
Sistem SHALL menyediakan `DELETE /api/replies` (body `ids`) di balik BasicAuth untuk menghapus catatan yang keliru atau data uji, dan SHALL tidak menyediakan tool MCP untuk menghapus catatan.

#### Scenario: Pemilik menghapus catatan
- **WHEN** `DELETE /api/replies` dipanggil dengan `ids` yang valid
- **THEN** catatan itu terhapus dan respons berisi jumlah yang dihapus

#### Scenario: Tool MCP tidak menyediakan penghapusan
- **WHEN** klien MCP memanggil `tools/list`
- **THEN** tidak ada tool yang menghapus catatan balasan

### Requirement: Tidak ada pembatasan di sisi server
Sistem SHALL tidak menyediakan mekanisme persetujuan, claim, batas jumlah balasan, cooldown, jeda minimal, maupun daftar Do-Not-Contact terpisah; tool MCP SHALL tidak berisi tool dengan fungsi-fungsi tersebut.

#### Scenario: Daftar tool
- **WHEN** klien MCP memanggil `tools/list`
- **THEN** tidak ada tool bernama atau berfungsi approve, claim, limits, atau dnc
