export const MAX_REGULAR_ADS_PER_DAY = 4;
export const MAX_KILAT_ADS_PER_DAY = 5;
export const KILAT_ADDON_COST = 250000;
export const KILAT_ADDON_COST_VOUCHER = 200000;
export const MAX_EXTRA_ADS_PER_DAY = 4;

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
// DUPLICATED sebagai ISO literal di functions/api/doku/create-payment.js — jaga tetap sama.
export const ILKOMUNY_VALID_UNTIL = '2026-12-31T17:00:00Z';
export const JFUFEB_VALID_UNTIL = '2027-02-20T17:00:00Z';

// Kunci draft order form di localStorage. _v2 = skema step tanpa biodata
// (1 Detail Survei, 2 Jadwal, 3 Review & Pembayaran, 4 Jadwal Kilat).
// Kunci lama masih dibaca sekali untuk migrasi di MultiStepForm.
export const SURVEY_DRAFT_KEY = 'survey_form_draft_v2';
export const LEGACY_SURVEY_DRAFT_KEY = 'survey_form_draft';
