## ADDED Requirements

### Requirement: Normalisasi identitas post
Sistem SHALL menurunkan `postKey` dan `username` dari permalink Threads dengan mengabaikan host (`threads.com` atau `threads.net`), query string, fragment, dan slash di ujung. Input yang tidak cocok pola permalink SHALL diperlakukan sebagai kunci opak dan tetap diproses.

#### Scenario: Permalink dengan variasi penulisan memberi kunci sama
- **WHEN** `https://www.threads.com/@Budi/post/ABC123?xmt=x` dan `https://threads.net/@budi/post/ABC123/` diperiksa
- **THEN** keduanya menghasilkan `postKey` `threads:ABC123` dan `username` `budi`

#### Scenario: Input bukan permalink Threads
- **WHEN** string `https://example.com/post/1` atau `12345` diperiksa
- **THEN** sistem memakai kunci opak `raw:<string>` dan tidak menolak permintaan

### Requirement: Cek catatan untuk daftar post
Sistem SHALL menyediakan tool MCP `keelead_check_seen` dan endpoint `POST /api/seen` yang menerima 1–100 permalink/id dan mengembalikan `new` (daftar input tanpa catatan apa pun) dan `known` (daftar objek untuk input yang punya catatan). Setiap objek `known` SHALL berisi `input` dan hanya field yang ada nilainya dari: `lead` (`id`, `status`, `tags`), `replies` (daftar `status` dan `sentAt`), `authorLastRepliedAt`, dan `dnc`. Pengecekan SHALL bersifat informasi saja: sistem SHALL tidak menyatakan sebuah post harus dilewati atau dilarang, dan SHALL tidak mengubah data.

#### Scenario: Post belum pernah dicatat
- **WHEN** agent mengirim permalink yang tidak ada di tabel Lead maupun Reply dan penulisnya tidak bertanda `dnc`
- **THEN** input itu muncul di `new` dan tidak ada data yang tersimpan

#### Scenario: Post sudah dibalas
- **WHEN** ada Reply berstatus `sent` untuk `postKey` yang sama
- **THEN** input itu muncul di `known` dengan `replies` yang memuat `status: "sent"` dan `sentAt`

#### Scenario: Post tersimpan sebagai lead tetapi belum dibalas
- **WHEN** ada Lead dengan `website` yang berisi `/post/<code>` yang sama dan tidak ada Reply untuk post itu
- **THEN** input itu muncul di `known` dengan `lead.id`, `lead.status`, dan `lead.tags`, tanpa field `replies`

#### Scenario: Akun pernah dibalas pada post lain
- **WHEN** post yang diperiksa belum dicatat tetapi `username` penulisnya punya Reply `sent` pada post lain
- **THEN** input itu muncul di `known` dengan `authorLastRepliedAt` berisi `sentAt` terbaru milik akun itu

#### Scenario: Penulis bertanda dnc
- **WHEN** ada Lead dengan tag `dnc` yang `firstName`-nya sama dengan `username` penulis (tanpa membedakan huruf besar/kecil)
- **THEN** input itu muncul di `known` dengan `dnc: true` dan tetap dikembalikan sebagai informasi, bukan penolakan

#### Scenario: Batas ukuran
- **WHEN** daftar input kosong atau lebih dari 100 item
- **THEN** sistem menolak dengan status 400 dan pesan yang menyebut batas 1–100

### Requirement: Pengecekan efisien dan ringkas
Sistem SHALL mengerjakan satu pengecekan dengan jumlah query basis data yang tetap (tidak bertambah per input) dan SHALL tidak memuat teks post, isi balasan, atau data lead lengkap dalam respons.

#### Scenario: Seratus input satu panggilan
- **WHEN** agent mengirim 100 permalink
- **THEN** jumlah item `new` ditambah jumlah item `known` sama dengan 100 dan respons hanya berisi field ringkas yang disebut di atas
