export const MAX_REGULAR_ADS_PER_DAY = 4;
// Add-on JFU Kilat — HANYA untuk rumus lama (instan tarif < KILAT_TARIFF_FROM).
// Lihat KILAT_RATE_SCHEDULE di bawah.
export const KILAT_ADDON_COST = 200000;
export const KILAT_ADDON_COST_VOUCHER = 200000;
export const MAX_EXTRA_ADS_PER_DAY = 4;

// Gelombang push JFU Kilat: DUA kali sehari (11.00 & 15.00 WIB, keputusan 5 Okt
// 2026), dua order per gelombang, HANYA Senin–Jumat dan bukan hari libur
// operasional. Iklan regular tidak punya konsep ini — ia tayang serentak 15.00
// WIB dan berjalan kelipatan 24 jam (lihat airing-window.ts).
//
// DICERMINKAN di database (sql/117) — WAJIB diubah bersamaan:
//   KILAT_SLOT_HOURS        ↔ kilat_wave_hours()      (trigger klaim peneliti)
//   KILAT_QUOTA_PER_SLOT    ↔ max_kilat_per_wave()    (trigger kuota, SEMUA penulis)
//   KILAT_BOOKING_LEAD_MIN  ↔ kilat_booking_closes_at()
// kilatWaveRules.spec.ts membandingkan keduanya.
//
// Jam lama 08/14/17 tetap sah di CHECK database demi riwayat (19 order lunas
// Agu–Sep 2026); papan admin tetap merender barisnya bila sebuah minggu
// memuatnya. Pilihan BARU hanya 11/15.
export const KILAT_SLOT_HOURS = [11, 15] as const;
export const KILAT_QUOTA_PER_SLOT = 2;

/** Pesan paling lambat 2 jam sebelum gelombang: 11.00 → 09.00, 15.00 → 13.00. */
export const KILAT_BOOKING_LEAD_MIN = 120;
/** Bayar paling lambat 1 jam sebelum gelombang: 11.00 → 10.00, 15.00 → 14.00. */
export const KILAT_PAY_LEAD_MIN = 60;

/**
 * Pintu Kilat swalayan untuk peneliti (Phase 5). `false` sampai rilis R7 —
 * selama itu order Kilat hanya lahir lewat "Jadikan Kilat" oleh admin.
 */
export const KILAT_SELF_SERVE_OPEN = true;

/**
 * Akun uji yang boleh memakai pintu Kilat sebelum dibuka untuk semua (Push
 * Uji, rencana Phase 5 §Rilis). Huruf kecil. ⚠️ JANGAN email admin: trigger
 * sql/117 dan create-payment.js melewati pemeriksaan untuk admin, jadi order
 * admin tidak menguji jalur peneliti. Dikosongkan lagi di Push B.
 */
export const KILAT_PILOT_EMAILS: readonly string[] = [];

// Turunan, bukan angka lepas. Dipakai cek ketersediaan per-hari di jalur Kilat
// lama (JFUSUHUD, sudah mati); pemilih gelombang R5 menghitung per gelombang.
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

// Tarif iklan per hari tayang, BERTANGGAL (keputusan 4 & 29 Sep 2026).
//
// `list` = harga katalog. `effective` = yang benar-benar ditagih. Selisihnya
// tampil sebagai baris "Harga perkenalan" — jadi 1 Des dan 1 Jan cukup
// menambah entri di sini, tanpa menyentuh satu pun pemanggil.
//
// Tier: [1–15, 16–30, 31–50, 51–70, >70] soal. `from` = instan pertama entri
// berlaku (tengah malam WIB). Entri pertama `null` = sejak dulu.
//
// Instan yang dipakai memilih entri ("instan tarif"): `ad_schedules.rate_locked_at`
// (sql/103) untuk jadwal yang sudah ada, "sekarang" untuk order yang sedang
// dibuat. Lihat `rateInstantOf` di cost-calculator.ts.
//
// DUPLICATED sebagai literal di functions/api/doku/create-payment.js — WAJIB
// diubah bersamaan; rateSchedule.spec.ts membandingkan keduanya.
/** Label rentang soal per tier, urut sama dengan `list`/`effective`. */
export const AD_TIER_LABELS = ['1–15', '16–30', '31–50', '51–70', '>70'] as const;

export interface AdRateEntry {
  from: string | null;
  list: readonly [number, number, number, number, number];
  effective: readonly [number, number, number, number, number];
  /** Tanggal terakhir harga perkenalan entri ini berlaku (label, WIB). */
  introUntil: string | null;
}

export const AD_RATE_SCHEDULE: readonly AdRateEntry[] = [
  {
    from: null,
    list: [150000, 200000, 300000, 400000, 500000],
    effective: [150000, 200000, 300000, 400000, 500000],
    introUntil: null,
  },
  {
    from: '2026-10-01T00:00:00+07:00',
    list: [200000, 350000, 500000, 650000, 800000],
    effective: [150000, 200000, 300000, 400000, 500000],
    introUntil: '2026-11-30',
  },
  {
    from: '2026-12-01T00:00:00+07:00',
    list: [200000, 350000, 500000, 650000, 800000],
    effective: [160000, 280000, 400000, 520000, 640000],
    introUntil: '2026-12-31',
  },
  {
    from: '2027-01-01T00:00:00+07:00',
    list: [200000, 350000, 500000, 650000, 800000],
    effective: [200000, 350000, 500000, 650000, 800000],
    introUntil: null,
  },
];

// Tarif JFU Kilat per GELOMBANG, BERTANGGAL (keputusan 14 Okt 2026, Phase 5
// Task 5.1). Tabel sendiri per tier — BUKAN lagi "tarif harian Iklan + add-on".
//
// Aturannya: Kilat efektif = 2,5 × tarif harian Iklan efektif pada tanggal yang
// sama (harga Iklan 2 hari + 25%), sehingga Kilat tidak pernah lebih murah dari
// Iklan multi-hari. `from` sengaja sejajar dengan AD_RATE_SCHEDULE; invarian
// 2,5× dikunci rateSchedule.spec.ts.
//
// ⚠️ TABEL INI BARU BERLAKU SEJAK `KILAT_TARIFF_FROM`. Selama ia `null`, semua
// order Kilat (termasuk "Jadikan Kilat" admin) memakai RUMUS LAMA:
// tarif Iklan efektif × 1 + KILAT_ADDON_COST, tanpa diskon voucher. Tanggalnya
// diisi literal di commit buka pintu (Task 5.9) — jangan berlaku surut: order
// yang sudah dikutip dengan rumus lama tidak boleh ditagih berbeda saat dibayar.
//
// Instan pembanding = instan TARIF (`rate_locked_at`, lihat `rateInstantOf`),
// sama dengan Iklan.
//
// DUPLICATED sebagai literal di functions/api/doku/create-payment.js — WAJIB
// diubah bersamaan; rateSchedule.spec.ts membandingkan keduanya.
export const KILAT_TARIFF_FROM: string | null = '2026-10-26T16:00:00+07:00';

export const KILAT_RATE_SCHEDULE: readonly AdRateEntry[] = [
  {
    from: '2026-10-01T00:00:00+07:00',
    list: [500000, 875000, 1250000, 1625000, 2000000],
    effective: [375000, 500000, 750000, 1000000, 1250000],
    introUntil: '2026-11-30',
  },
  {
    from: '2026-12-01T00:00:00+07:00',
    list: [500000, 875000, 1250000, 1625000, 2000000],
    effective: [400000, 700000, 1000000, 1300000, 1600000],
    introUntil: '2026-12-31',
  },
  {
    from: '2027-01-01T00:00:00+07:00',
    list: [500000, 875000, 1250000, 1625000, 2000000],
    effective: [500000, 875000, 1250000, 1625000, 2000000],
    introUntil: null,
  },
];

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
