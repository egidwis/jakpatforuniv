export const MAX_REGULAR_ADS_PER_DAY = 4;
export const KILAT_ADDON_COST = 200000;
export const KILAT_ADDON_COST_VOUCHER = 200000;
export const MAX_EXTRA_ADS_PER_DAY = 4;

// Gelombang push JFU Kilat: empat kali sehari, dua order per gelombang, HANYA
// Senin–Jumat. Iklan regular tidak punya konsep ini — ia tayang serentak 15.00
// WIB dan berjalan kelipatan 24 jam (lihat airing-window.ts).
//
// Jamnya DUPLICATED sebagai CHECK constraint di sql/42_kilat_slots.sql — WAJIB
// diubah bersamaan, kalau tidak database menolak jam yang baru.
//
// Aturan hari kerja sengaja hidup di UI penjadwalan saja (KilatScheduleStep),
// bukan sebagai constraint: hari libur nasional tidak terwakili oleh nomor hari,
// dan constraint akan mengunci baris lama yang terlanjur jatuh di akhir pekan.
export const KILAT_SLOT_HOURS = [8, 11, 14, 17] as const;
export const KILAT_QUOTA_PER_SLOT = 2;

// Turunan, bukan angka lepas — dulu 5, yang tidak pernah cocok dengan pembagian
// slot mana pun. Dipakai wizard user, yang memesan Kilat per-hari tanpa memilih
// jam; slotnya ditugaskan admin belakangan lewat kolom kilat_slot_hour.
export const MAX_KILAT_ADS_PER_DAY = KILAT_SLOT_HOURS.length * KILAT_QUOTA_PER_SLOT;

// Banner cadangan untuk halaman iklan yang belum punya banner sendiri.
// Alasannya visual, bukan teknis: tanpa banner, aplikasi Jakpat memakai tampilan
// bawaannya yang sangat berbeda dari kartu iklan, sehingga responden ragu apakah
// yang dilihatnya iklan survei atau sekadar pengumuman.
//
// Path relatif dari root situs (file ada di public/), bukan URL Supabase Storage.
// Konsumen wajib menanganinya: getCdnUrl() meneruskan URL non-storage apa adanya,
// dan functions/api/surveys.js melengkapinya jadi absolut untuk aplikasi mobile.
//
// Sengaja tidak memuat nominal hadiah, jadi ia tidak pernah basi saat reward
// batch berubah — itu sebabnya requires_banner_update tetap false saat halaman
// dibuat otomatis (lihat sql/40).
// DUPLICATED di sql/40_auto_publish_page.sql — WAJIB diubah bersamaan.
export const DEFAULT_AD_BANNER_URL = '/default-ad-banner.jpg';

// PPN (Pajak Pertambahan Nilai / Indonesian VAT), dipungut di ATAS subtotal (DPP).
// PPN_PERCENT dipakai untuk menghitung & label; PPN_RATE disimpan per-invoice agar
// invoice lama tetap benar bila tarif berubah kelak (11% → 12%).
// DUPLICATED di functions/api/doku/create-payment.js — WAJIB diubah bersamaan.
export const PPN_PERCENT = 11;
export const PPN_RATE = 0.11;

// Masa berlaku voucher (batas = instan pertama yang SUDAH tidak valid, WIB/UTC+7).
// ILKOMUNY s/d 31 Des 2026 → 2027-01-01 00:00 WIB = 2026-12-31T17:00Z.
// JFUFEB   s/d 20 Feb 2027 → 2027-02-21 00:00 WIB = 2027-02-20T17:00Z.
// JFUSUHUD s/d 31 Agu 2026 → 2026-09-01 00:00 WIB = 2026-08-31T17:00Z.
// PPISWEDIA s/d 30 Jun 2026 → 2026-07-01 00:00 WIB = 2026-06-30T17:00Z. Batas
// ini sampai 2026-08-24 hanya hidup sebagai kalimat di pesan form; kodenya tidak
// menegakkan apa pun sehingga diskon 20% masih keluar dua bulan setelah lewat.
// DUPLICATED sebagai ISO literal di functions/api/doku/create-payment.js — jaga tetap sama.
export const ILKOMUNY_VALID_UNTIL = '2026-12-31T17:00:00Z';
export const JFUFEB_VALID_UNTIL = '2027-02-20T17:00:00Z';
export const PPISWEDIA_VALID_UNTIL = '2026-06-30T17:00:00Z';

// JFUSUHUD adalah pintu masuk pilot JFU Kilat, bukan sekadar diskon 10%: saat ia
// mati, tombol upgrade Kilat di Ringkasan Pesanan ikut hilang karena
// getVoucherInfo berhenti mengembalikan isKilatEligible. Itu memang yang
// diinginkan — Kilat akan lahir kembali sebagai menu tersendiri di dashboard
// peneliti (lihat docs/superpowers/plans/2026-08-18-kilat-menu-mandiri.md).
export const JFUSUHUD_VALID_UNTIL = '2026-08-31T17:00:00Z';

// Tanggal `sql/68_campaign_link_clicks.sql` dijalankan di produksi — instan
// pertama yang klik-nya tercatat PER TANGGAL. Sebelum ini klik hanya ada sebagai
// `campaign_links.click_count`, satu angka kumulatif tanpa tanggal (44 klik,
// Mei–Agu 2026), dan angka itu TIDAK BISA dipecah per hari.
//
// Dipakai tab Campaign untuk memutuskan kapan footnote cakupan muncul: rentang
// yang mendahului tanggal ini menampilkan nol klik, dan nol yang tidak dijelaskan
// terbaca sebagai "tidak ada yang mengklik" alih-alih "belum dicatat".
export const CAMPAIGN_CLICK_LOG_SINCE = '2026-08-24T00:00:00+07:00';

// Kunci draft order form di localStorage. _v2 = skema step tanpa biodata
// (1 Detail Survei, 2 Jadwal, 3 Review & Pembayaran, 4 Jadwal Kilat).
// Kunci lama masih dibaca sekali untuk migrasi di MultiStepForm.
export const SURVEY_DRAFT_KEY = 'survey_form_draft_v2';
export const LEGACY_SURVEY_DRAFT_KEY = 'survey_form_draft';
