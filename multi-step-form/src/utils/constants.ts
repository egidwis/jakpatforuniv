export const MAX_REGULAR_ADS_PER_DAY = 4;
export const MAX_KILAT_ADS_PER_DAY = 5;
export const KILAT_ADDON_COST = 250000;
export const KILAT_ADDON_COST_VOUCHER = 200000;
export const MAX_EXTRA_ADS_PER_DAY = 4;

// PPN (Pajak Pertambahan Nilai / Indonesian VAT), dipungut di ATAS subtotal (DPP).
// PPN_PERCENT dipakai untuk menghitung & label; PPN_RATE disimpan per-invoice agar
// invoice lama tetap benar bila tarif berubah kelak (11% → 12%).
// DUPLICATED di functions/api/doku/create-payment.js — WAJIB diubah bersamaan.
export const PPN_PERCENT = 11;
export const PPN_RATE = 0.11;

// Kunci draft order form di localStorage. _v2 = skema step tanpa biodata
// (1 Detail Survei, 2 Jadwal, 3 Review & Pembayaran, 4 Jadwal Kilat).
// Kunci lama masih dibaca sekali untuk migrasi di MultiStepForm.
export const SURVEY_DRAFT_KEY = 'survey_form_draft_v2';
export const LEGACY_SURVEY_DRAFT_KEY = 'survey_form_draft';
