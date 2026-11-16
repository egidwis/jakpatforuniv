# Terbitkan Ulang Tagihan Tempo + Pengaman Ganda Jadwal #2 (admin)

Tanggal: 16 Nov 2026. Pemicu: insiden Mun#07–Mun12 (lihat
`multi-step-form/sql/ops_hidupkan_mun07_12_tempo_b.sql`).

## Intent

Admin perlu menagih ulang tagihan tempo, entah untuk memisahkan grup, membuang anggota dobel, atau
membetulkan nominal, TANPA menghentikan iklan yang sedang tayang. Hari ini satu-satunya jalan yang
terlihat adalah "Hentikan Tayang" atau "Batalkan jadwal", lalu "Jadwal Iklan Baru". Jadwal baru itu lahir
sebagai perpanjangan: Rp 0 atau tanpa reward, tanpa tayang dulu. Akibatnya iklan berhenti dan nominalnya
salah.

## Goals

1. **Terbitkan Ulang Tagihan Tempo.** Dari kartu yang tayang kredit dan sudah punya tagihan tempo, admin
   bisa menerbitkan tagihan tempo baru, satuan atau gabungan. Jadwal tidak disentuh.
2. **Pengaman ganda "Jadwal Iklan Baru" (opsi A).**
   - Lapis 1: popup konfirmasi saat tombol diklik.
   - Lapis 2: centang wajib di formulir sebelum Simpan aktif.

   Keduanya hanya muncul ketika aturan sisi peneliti (`scheduleAgainBlock`) akan menolak, yaitu order
   `slot_cancelled`/tidak aktif, atau ada jadwal yang menahan kuota tapi belum lunas.
3. **Arahkan admin ke jalan yang benar.**
   - Pesan K8 ("tagihan tempo tidak bisa dibatalkan") menyebut Terbitkan Ulang.
   - Dialog "Hentikan Tayang" memperingatkan bahwa menghentikan bukan cara menagih ulang.

## Non-goals

- Menghidupkan kembali jadwal #1 yang batal dari UI ("Jadwalkan Ulang"). Ditunda ke diskusi UX.
- Penjaga di database (opsi B) dan blokir total untuk admin (opsi C). Keduanya ditolak user.
- Mengubah aturan reward perpanjangan (`draftScheduleMoney`).

## Anti-goals

- Iklan yang sedang tayang berhenti karena admin menagih ulang.
- Dua link tempo hidup bersamaan untuk satu jadwal (risiko bayar dobel).
- Popup yang muncul di kasus normal (#1 lunas), sehingga admin terbiasa mengklik lewat.

## Approaches (jadwal #2)

| | Pendekatan | Untung | Rugi |
|---|---|---|---|
| **A (dipilih)** | Popup + centang wajib, predikat sama dengan sisi peneliti | Cepat, tanpa migrasi, admin tetap bisa untuk kasus sah | Hanya menjaga pintu drawer admin |
| B | Popup + penjaga RPC `create_ad_schedule` | Menutup semua pintu | Butuh migrasi SQL dan perubahan RPC |
| C | Blokir total untuk admin | Paling aman | Perpanjangan untuk order kredit jadi mustahil; #1 batal jadi buntu |

## Desain

### 1. Terbitkan Ulang Tagihan Tempo

Mesinnya sudah ada. `writeInvoiceRows` memanggil `killDokuLinksForSchedule(id, { markCancelled: true })`
untuk setiap jadwal yang ditagih, SEBELUM baris baru ditulis. Akibatnya:
- tagihan lama jadwal itu jadi `cancelled` dan link DOKU-nya dimatikan;
- `expires_at` saudara segrup yang tidak ikut ditagih ulang dimundurkan, sehingga `/bayar/` menerbitkan
  link baru untuk sisa anggota (`tempo_renewable`);
- status jadwal tidak berubah.

Indeks `invoices_one_pending_tempo_per_schedule` aman, karena baris lama sudah `cancelled` sebelum yang
baru ditulis.

Yang diubah:
- `scheduleCardActions.ts`, `case 'airing_on_credit'`: kalau `hasBill` dan tagihannya tempo, tambahkan aksi
  menu `reissue_tempo` ("Terbitkan Ulang Tagihan Tempo"). Aksi ini membuka formulir tagihan tempo yang sama
  (`subView invoice tempo:true`). `canTempo`/"Tayangkan Dulu" tetap tersembunyi; ini aksi yang terpisah dan
  eksplisit.
- Sebelum formulir dibuka, tampilkan dialog konfirmasi berisi cakupan dan akibatnya:
  - "Iklan TETAP tayang; hanya tagihannya yang diganti."
  - "Link lama {payment_id} dimatikan."
  - Untuk grup: "N pesanan lain di tagihan gabungan ini ditagih ulang otomatis dengan nominal sisanya saat
    link /bayar/-nya dibuka. Untuk menagih ulang seluruh grup sekaligus, pakai Tagihan Gabungan."
- `bulkInvoiceCandidates.ts`: `airing_on_credit` dengan tagihan tempo aktif menjadi kandidat yang bisa
  dicentang dalam mode tempo (sekarang ditolak, "Sudah tayang sebelum lunas dengan tagihan tempo aktif").
  Label alasannya berubah menjadi peringatan "menggantikan tagihan {payment_id}".
- Pesan K8 (`tempoCancelBlockReason`) ditambah: "Untuk mengganti nominal atau anggota tagihan, pakai
  Terbitkan Ulang Tagihan Tempo. Iklannya tetap tayang."
- Dialog "Hentikan Tayang" (jadwal kredit yang sudah tayang) ditambah satu baris peringatan: "Kalau
  tujuanmu menagih ulang atau mengganti nominal, jangan hentikan. Pakai Terbitkan Ulang Tagihan Tempo.
  Jadwal yang dihentikan tidak bisa ditayangkan lagi dari dashboard, dan jadwal baru dicatat sebagai
  perpanjangan tanpa reward."

### 2. Pengaman ganda Jadwal Iklan Baru

- **Predikat:** `scheduleAgainBlock(submission, schedules)` dari `canScheduleAgain.ts`, diabaikan kalau
  hasilnya `'kilat'` (Kilat sudah digerbang tersendiri). Yang memicu pengaman hanya `order_inactive` dan
  `quota_held`.
- **Lapis 1, popup** (`SchedulePaymentTab`, tombol "Jadwal Iklan Baru"). Memakai `setPendingConfirm` yang
  sudah ada, nada `danger`. Isinya:
  - Sebabnya, sesuai keadaan #1:
    - dibatalkan ("Jadwal #1 sudah dibatalkan");
    - belum lunas / tayang kredit ("Jadwal #1 belum lunas");
    - plus kalimat "Peneliti tidak bisa membuat jadwal baru di keadaan ini".
  - Akibatnya: jadwal baru dicatat sebagai perpanjangan. Reward/insentif responden tidak ditagihkan lagi,
    jadi nominalnya berbeda dari #1. Sebutkan `Harga Tercatat #1 = Rp X`.
  - Kalau #1 belum lunas karena tayang kredit: "Kalau tujuanmu menagih ulang, pakai Terbitkan Ulang
    Tagihan Tempo di kartu #1."
  - Tombol: "Tetap buat jadwal baru" / "Batal".
- **Lapis 2, centang wajib** (`ScheduleForm` mode `create`, prop baru misalnya `unpaidParentWarning`).
  Kotak peringatan di atas tombol Simpan, berisi ringkasan sebab dan Estimasi Total jadwal baru vs Harga
  Tercatat #1. Tombol Simpan nonaktif sampai kotak "Saya paham: jadwal ini perpanjangan tanpa reward, dan
  jadwal #1 tidak ikut pindah" dicentang. Centangnya di-reset setiap formulir dibuka.

### 3. Anggota grup yang mati tidak dihitung (temuan 16 Nov, Mun11 Y9HSZVZC)

Anggota grup yang barisnya mati (`expired`/`cancelled`, misalnya karena jadwalnya dibatalkan sebelum
tayang) masih ikut dihitung di tiga permukaan sampai `/bayar/` memperbarui tagihannya:

| Permukaan | Sumber | Gejala |
|---|---|---|
| Drawer admin, panel "Tagihan gabungan" | `fetchInvoiceGroups` → `InvoiceGroupPanel` | "7 pesanan", total Rp 3.457.650 (seharusnya 6 / Rp 2.963.700) |
| Dashboard peneliti, kartu jadwal | `fetchInvoiceGroups` → `groupInfoFor` → `SchedulePhase` | chip "gabungan N pesanan" dan nominal di sebelah tombol bayar ikut menghitung anggota mati |
| Halaman invoice `/invoices/:id` | `buildInvoiceDocument` (transaksi per `payment_id`) | anggota mati tercetak tanpa tanda, dan `grandTotal` plus "Terbilang" ikut menjumlahkannya. Ini dokumen pertanggungjawaban dana kampus |

Uang yang ditagih DOKU tidak salah: `tempo_renewal_candidate` hanya menjumlahkan baris `pending`.

Perbaikan:
- **`fetchInvoiceGroups`.** `memberCount`/`total`/urutan lead dihitung dari anggota hidup saja (belum
  mati). Anggota mati tetap dikembalikan di daftar terpisah (`deadMembers`) supaya panel admin masih bisa
  menampilkannya sebagai riwayat dicoret. Kalau SEMUA anggota mati, perilaku lama dipertahankan:
  `allDead`, dan grup tetap utuh.
- **`InvoicePage` / `buildInvoiceDocument`.** Bundel dengan baris mati dikeluarkan dari total, dan ditampilkan
  sebagai "dikeluarkan dari tagihan" (atau disembunyikan, diputuskan saat review), selama tagihannya masih
  punya anggota hidup. Kuitansi lunas tidak berubah.
- **Lead di SQL** (`authoritative_payment_url`, CTE `grp`) juga menghitung baris mati, sehingga anggota
  mati bisa terpilih jadi lead. Akibatnya tombol bayar semua anggota hidup terlempar ke halaman invoice.
  Belum terpicu di kasus ini, karena yang mati bukan yang paling awal. Opsi: migrasi SQL kecil untuk
  menyaring `grp` ke anggota hidup. Ini perlu ditimbang saat rencana, karena aturan lead WAJIB identik di
  TS dan SQL (lihat komentar di sana).

### Pengujian

- Unit (vitest):
  - `planCardActions` `airing_on_credit` + tagihan tempo → ada `reissue_tempo`. Tanpa tagihan → tetap
    `tempo_invoice`. Tagihan non-tempo → tidak ada.
  - Kandidat bulk: kredit + tempo aktif → bisa dicentang di mode tempo, ditolak di mode biasa.
  - Predikat pengaman: lunas → tanpa popup; `slot_cancelled` → popup; kredit belum lunas → popup;
    Kilat → tidak dipicu.
  - `ScheduleForm`: Simpan nonaktif sampai dicentang (hanya bila prop ada).
- Gerbang tsc: `tsc -p tsconfig.app.json`, plus grep `TS2304`/`TS2552` = kosong.
- Uji manual lewat `npm run dev:full` pada order uji:
  - Terbitkan Ulang untuk anggota grup → link lama mati, sisa anggota `tempo_renewable`, jadwal tetap
    `scheduled`/`live`.
  - Popup dan centang muncul di order #1 batal, dan tidak muncul di order lunas.

## Diputuskan builder

Teks persis, penempatan aksi di menu, dan nama prop.
