import { createClient } from '@supabase/supabase-js';
import type { ReviewHistoryEntry } from '../components/submissions/types';
import { toAiringEndIso, toAiringStartIso, toWibYmd } from './airing-window';
import { isPlaceholderBannerUrl } from './page-banner';
import { isLiveInvoice } from './billingCompare';
import {
  calculateAdCostPerDay,
  calculateTotalAdCost,
  calculateIncentiveCost,
  calculateDiscount,
  calculatePpn,
  getKilatAddonCost,
  voucherInstantOf,
} from './cost-calculator';

// Supabase URL dan anon key akan diambil dari environment variables
// Anda perlu menambahkan variabel ini di file .env.local
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Deteksi placeholder values
const isPlaceholderUrl = supabaseUrl.includes('your-project-id') || supabaseUrl === '';
const isPlaceholderKey = supabaseAnonKey.includes('your-anon-key') || supabaseAnonKey === '';

// Gunakan URL dan key yang valid jika yang ada adalah placeholder
const validSupabaseUrl = isPlaceholderUrl ? 'https://jakpatforuniv.supabase.co' : supabaseUrl;
const validSupabaseKey = isPlaceholderKey ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder' : supabaseAnonKey;

// Log untuk debugging
console.log('Supabase URL:', isPlaceholderUrl ? 'Using placeholder (will run in offline mode)' : 'Configured');
console.log('Supabase Anon Key:', isPlaceholderKey ? 'Using placeholder (will run in offline mode)' : 'Configured');
console.log('Running in offline mode:', isPlaceholderUrl || isPlaceholderKey);

// Buat Supabase client dengan URL dan key yang valid
export const supabase = createClient(validSupabaseUrl, validSupabaseKey);

// ─────────────────────────────────────────────────────────────
// PEREDAM PERMINTAAN KEMBAR
//
// `auth.getUser()` SELALU memanggil /auth/v1/user lewat jaringan — beda dengan
// `getSession()` yang membaca storage. Tiap helper di bawah memanggilnya
// sendiri-sendiri, dan tiap komponen memanggil helper-nya sendiri-sendiri,
// jadi satu kali muat halaman menembakkan permintaan yang sama berkali-kali.
// Terukur di produksi 2026-08-19: `user` 4x dan `profiles` 4x dalam SATU kali
// muat — keduanya dari `getOwnProfile()` yang dipanggil DashboardLayout,
// MultiStepForm, StepCheckout, dan ProfileForm.
//
// Diperbaiki di HELPER-nya, bukan di tiap pemanggil: menyuruh empat komponen
// saling menunggu berarti menaruh satu aturan di empat tempat, dan komponen
// kelima nanti tidak akan tahu aturannya.
//
// Kegagalan TIDAK di-cache — `inFlight` dilepas lewat finally, jadi percobaan
// berikutnya benar-benar mencoba lagi.
// ─────────────────────────────────────────────────────────────

const REQUEST_COALESCE_TTL_MS = 30_000;

function createCoalescer<T>(ttlMs: number = REQUEST_COALESCE_TTL_MS) {
  let inFlight: Promise<T> | null = null;
  let cached: { at: number; value: T } | null = null;
  return {
    run(fetcher: () => Promise<T>): Promise<T> {
      if (cached && Date.now() - cached.at < ttlMs) return Promise.resolve(cached.value);
      if (inFlight) return inFlight;
      inFlight = fetcher()
        .then((value) => {
          cached = { at: Date.now(), value };
          return value;
        })
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
    clear() {
      cached = null;
      inFlight = null;
    },
  };
}

type AuthUser = Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'];

const authUserCoalescer = createCoalescer<AuthUser>();

/** Pengganti tunggal `auth.getUser()` — jawaban sama, satu putaran jaringan. */
export const getAuthUser = async (): Promise<AuthUser> =>
  authUserCoalescer.run(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  });

const ownProfileCoalescer = createCoalescer<any>();

/**
 * ⚠️ Callback SINKRON — jangan pernah memanggil fungsi Supabase async di
 * dalamnya. `onAuthStateChange` memegang lock auth selagi callback berjalan;
 * memanggil balik ke supabase-js dari sini adalah deadlock yang terdokumentasi.
 * Di sini isinya cuma membuang cache.
 */
supabase.auth.onAuthStateChange(() => {
  authUserCoalescer.clear();
  ownProfileCoalescer.clear();
  voucherBlockedCoalescers.forEach((c) => c.clear());
});

/**
 * Rewrites a Supabase Storage public URL to use our Cloudflare CDN proxy.
 * This eliminates Supabase cached egress costs since Cloudflare serves from its own cache.
 * 
 * Input:  https://xxx.supabase.co/storage/v1/object/public/page-uploads/banners/img.webp
 * Output: /cdn/page-uploads/banners/img.webp
 */
export const getCdnUrl = (url: string | null | undefined): string => {
    if (!url) return '';
    const marker = '/storage/v1/object/public/';
    const idx = url.indexOf(marker);
    if (idx === -1) return url; // Not a Supabase Storage URL, return as-is
    return '/cdn/' + url.substring(idx + marker.length);
};

// Fungsi untuk memeriksa koneksi Supabase
export const checkSupabaseConnection = async (): Promise<boolean> => {
  try {
    // Jika menggunakan placeholder, langsung return false
    if (isPlaceholderUrl || isPlaceholderKey) {
      console.warn('Using placeholder Supabase credentials, running in offline mode');
      return false;
    }

    // Coba melakukan query sederhana dengan timeout
    const timeoutPromise = new Promise<{ error: any }>((_, reject) =>
      setTimeout(() => reject(new Error('Supabase connection timeout')), 5000)
    );

    const queryPromise = supabase.from('form_submissions').select('count').limit(1);

    // Race antara query dan timeout
    const { error } = await Promise.race([queryPromise, timeoutPromise]);

    if (error) {
      console.error('Supabase connection test failed:', error);
      return false;
    }

    console.log('Supabase connection successful');
    return true;
  } catch (error: any) {
    console.error('Error checking Supabase connection:', error);
    return false;
  }
};

// ============= AUTH FUNCTIONS =============

export const signInWithGoogle = async (redirectTo?: string) => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo || `${window.location.origin}/dashboard`,
      },
    });

    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
};

export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return true;
  } catch (error: any) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export const getCurrentUser = async () => {
  try {
    const user = await getAuthUser();
    return user;
  } catch (error: any) {
    console.error('Error getting current user:', error);
    return null;
  }
};

export const signInWithPassword = async (email: string, password: string) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Error signing in with password:', error);
    throw error;
  }
};

export interface SignUpBiodata {
  fullName: string;
  phoneNumber: string;
  university: string;
  department: string;
  status: string;
  referralSource?: string;
}

export const signUp = async (email: string, password: string, biodata: SignUpBiodata) => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: biodata.fullName,
          phone_number: biodata.phoneNumber,
          university: biodata.university,
          department: biodata.department,
          status: biodata.status,
          referral_source: biodata.referralSource || null,
        },
      },
    });
    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Error signing up:', error);
    throw error;
  }
};

/**
 * Profil researcher milik user yang sedang login (RLS: SELECT owner-only,
 * lihat sql/28). Satu akun = satu researcher; biodata di sini menjadi sumber
 * prefill multi-step form dan default kartu Detail Invoice.
 */
export interface ResearcherProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  phone_number: string | null;
  university: string | null;
  department: string | null;
  status: string | null;
  referral_source: string | null;
}

export const isProfileComplete = (profile: ResearcherProfile | null): boolean => {
  if (!profile) return false;
  return Boolean(
    profile.full_name?.trim() &&
    profile.phone_number?.trim() &&
    profile.university?.trim() &&
    profile.department?.trim() &&
    profile.status?.trim()
  );
};

export const getOwnProfile = async (): Promise<ResearcherProfile | null> =>
  ownProfileCoalescer.run(async () => {
    try {
      const user = await getAuthUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, phone_number, university, department, status, referral_source')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data as ResearcherProfile | null;
    } catch (error: any) {
      console.error('Error fetching own profile:', error);
      return null;
    }
  });

export const updateOwnProfile = async (updates: Partial<Omit<ResearcherProfile, 'id' | 'email'>>) => {
  const user = await getAuthUser();
  if (!user) throw new Error('Not authenticated');
  // Cache dibuang DULU: kalau update berhasil tapi pembuangannya terlewat,
  // ProfileForm memuat ulang dan mendapat datanya sendiri yang sudah basi.
  ownProfileCoalescer.clear();
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id);
  if (error) throw error;
  // Sinkronkan user_metadata agar prefill berbasis auth (nama) tetap konsisten.
  const { error: metaError } = await supabase.auth.updateUser({ data: updates });
  if (metaError) console.error('Error syncing user metadata:', metaError);
};

/**
 * Redemption voucher sekali-pakai per akun (mis. ILKOMUNY). Baris ditulis
 * server-side oleh webhook DOKU saat pembayaran lunas; UI hanya MEMBACA lewat
 * hasRedeemedVoucher() untuk memblokir pemakaian ganda. Lihat sql/35.
 */
export interface VoucherRedemption {
  id?: string;
  auth_user_id: string;
  voucher_code: string;
  form_submission_id?: string | null;
  redeemed_at?: string;
}

/**
 * True bila akun yang sedang login sudah pernah me-redeem `code`.
 * Belum login → false (gate "wajib login" ditangani terpisah di pemanggil).
 * Fail-open bila query error: gerbang otoritatif tetap UNIQUE(auth_user_id,
 * voucher_code) di DB + pencatatan webhook, jadi UI tak boleh menghalangi user
 * karena gangguan sesaat.
 */
export const hasRedeemedVoucher = async (code: string): Promise<boolean> => {
  const user = await getAuthUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from('voucher_redemptions')
    .select('id')
    .eq('auth_user_id', user.id)
    .eq('voucher_code', code.toUpperCase())
    .limit(1);
  if (error) {
    console.error('Error checking voucher redemption:', error);
    return false;
  }
  return !!(data && data.length > 0);
};

/**
 * True bila akun yang login sudah punya submission dengan `code` yang masih
 * "hidup" — belum dibatalkan / gagal / kadaluarsa. Melengkapi hasRedeemedVoucher
 * (yang hanya terisi saat pembayaran lunas via webhook): ini menangkap order
 * yang baru di-submit tapi belum dibayar, sehingga voucher sekali-pakai langsung
 * terasa dipakai sejak submit pertama (dan bisa diuji di lokal). Pemakaian ulang
 * tetap diperbolehkan bila order lama dibatalkan admin / gagal / kadaluarsa.
 */
export const hasActiveVoucherSubmission = async (code: string): Promise<boolean> => {
  const user = await getAuthUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from('form_submissions')
    .select('payment_status, submission_status')
    .eq('auth_user_id', user.id)
    .ilike('voucher_code', code);
  if (error) {
    console.error('Error checking active voucher submission:', error);
    return false;
  }
  return (data || []).some((s: any) =>
    s.payment_status !== 'failed' &&
    s.payment_status !== 'expired' &&
    s.submission_status !== 'cancelled');
};

const voucherBlockedCoalescers = new Map<string, ReturnType<typeof createCoalescer<boolean>>>();

/**
 * Apakah voucher sekali-pakai `code` sudah terpakai oleh akun yang login.
 *
 * Menyatukan `hasRedeemedVoucher` + `hasActiveVoucherSubmission` menjadi SATU
 * pertanyaan, dengan peredam per kode.
 *
 * Sebabnya terukur: `useIlkomunyBlocked` dipasang di EMPAT komponen sekaligus
 * (StepCheckout, UnifiedHeader, Sidebar, MultiStepForm) karena total harga
 * muncul di empat tempat. Tiap instance menjalankan kedua cek itu sendiri, jadi
 * satu kali muat halaman menembakkan `voucher_redemptions` dan
 * `form_submissions` masing-masing empat kali untuk jawaban yang identik.
 */
export const isVoucherBlockedForAccount = async (code: string): Promise<boolean> => {
  const key = code.toUpperCase();
  let coalescer = voucherBlockedCoalescers.get(key);
  if (!coalescer) {
    coalescer = createCoalescer<boolean>();
    voucherBlockedCoalescers.set(key, coalescer);
  }
  return coalescer.run(async () =>
    (await hasRedeemedVoucher(key)) || (await hasActiveVoucherSubmission(key)),
  );
};

/**
 * Mengirim email recovery agar user bisa mengatur ulang password-nya sendiri.
 * Link di email akan mengarahkan user ke halaman /reset-password.
 * Catatan keamanan: Supabase tidak pernah mengungkap apakah email terdaftar,
 * jadi respons sukses tidak menandakan email tersebut ada di sistem.
 */
export const sendPasswordResetEmail = async (email: string) => {
  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

/**
 * Mengatur password baru untuk user yang sedang login.
 * Dipakai di halaman /reset-password setelah sesi recovery terbentuk
 * dari link email (event PASSWORD_RECOVERY).
 */
export const updateUserPassword = async (newPassword: string) => {
  try {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Error updating password:', error);
    throw error;
  }
};

// Tipe data untuk form submissions
export interface FormSubmission {
  id?: string;
  survey_url: string;
  title: string;
  description: string;
  question_count: number;
  criteria_responden?: string;
  duration: number;
  start_date?: string | null;
  end_date?: string | null;
  full_name?: string;
  email?: string;
  phone_number?: string;
  university?: string;
  department?: string;
  status?: string;
  submission_status?: 'in_review' | 'approved' | 'rejected' | 'spam'
    | 'slot_reserved' | 'waiting_payment' | 'paid'
    | 'scheduled' | 'live' | 'completed'
    // `cancelled`  = SELURUH ORDER dihentikan (admin atau peneliti). Sejak
    //                sql/69 kata ini akhirnya berarti apa yang tertulis:
    //                sebelumnya ia dipakai untuk "sembunyikan dari daftar".
    // `slot_cancelled` = hanya SLOTNYA yang dilepas admin; sumbu review-nya
    //                sengaja tetap 'approved' (sql/62 §2).
    | 'cancelled' | 'slot_cancelled';
  referral_source?: string;
  winner_count?: number;
  prize_per_winner?: number;
  voucher_code?: string;
  total_cost: number;          // grand total, termasuk PPN
  subtotal?: number;           // DPP sebelum PPN (null utk submission pra-PPN)
  ppn_amount?: number;         // PPN 11% (null utk submission pra-PPN)
  payment_status?: string;
  submission_method?: string;
  /** Disingkirkan pemilik baris dari daftarnya (sql/69). Bukan keadaan order. */
  dismissed_at?: string | null;
  review_history?: ReviewHistoryEntry[];
  detected_keywords?: string[];
  custom_form_id?: string | null;
  admin_notes?: string;
  slot_booked_by?: string;
  slot_reserved_at?: string;
  auth_user_id?: string;
  created_at?: string;
  updated_at?: string;
  distribution_type?: 'regular' | 'kilat';
}

// Tipe data untuk transactions
export interface Transaction {
  id?: string;
  form_submission_id: string;
  payment_id?: string;
  payment_method?: string;
  amount: number;              // grand total, termasuk PPN
  subtotal?: number;           // DPP sebelum PPN
  ppn_rate?: number;           // tarif PPN yang berlaku saat transaksi (mis. 0.11)
  ppn_amount?: number;         // nominal PPN
  status: string;
  payment_url?: string;
  payment_channel?: string;
  note?: string;
  entity_type?: 'submission' | 'extend';
  extend_id?: string;
  /** Voucher milik TAGIHAN, bukan order (sql/53). NULL = tanpa voucher. */
  voucher_code?: string | null;
  /** Jendela tayang yang ditagihkan, dibekukan saat terbit (sql/60). */
  billed_start_date?: string | null;
  /** `original_request_id` untuk Cancel Order API (sql/84). */
  doku_request_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

// Tipe data untuk invoices
export interface Invoice {
  id?: string;
  form_submission_id: string;
  payment_id: string;
  invoice_url: string;
  amount: number;              // grand total, termasuk PPN
  subtotal?: number;           // DPP sebelum PPN
  ppn_rate?: number;           // tarif PPN yang berlaku (mis. 0.11)
  ppn_amount?: number;         // nominal PPN
  status: string;
  entity_type?: 'submission' | 'extend';
  extend_id?: string;
  /** Voucher milik TAGIHAN, bukan order (sql/53). NULL = tanpa voucher. */
  voucher_code?: string | null;
  /** Jendela tayang yang ditagihkan, dibekukan saat terbit (sql/60). */
  billed_start_date?: string | null;
  created_at?: string;
  /** Kapan link DOKU berhenti berlaku. NULL untuk baris pra-Bagian 3. */
  expires_at?: string | null;
  /** `original_request_id` untuk Cancel Order API (sql/84). */
  doku_request_id?: string | null;
  /** Kapan DOKU mengonfirmasi link-nya mati. NULL = tidak pernah (sql/84). */
  doku_cancelled_at?: string | null;
  paid_at?: string;
}

// Tipe data untuk extend ad duration
export interface FormSubmissionExtend {
  id?: string;
  submission_id: string;
  duration: number;
  start_date?: string | null;
  end_date?: string | null;
  slot_booked_by?: string;
  slot_reserved_at?: string;
  submission_status?: 'waiting_payment' | 'paid' | 'scheduled' | 'live' | 'completed' | 'cancelled';
  payment_status?: 'pending' | 'paid' | 'expired' | 'failed';
  prize_per_winner?: number;
  winner_count?: number;
  additional_prize_per_winner?: number;
  is_new_month?: boolean;
  period_batch?: string;
  total_cost: number;          // grand total, termasuk PPN
  subtotal?: number;           // DPP sebelum PPN
  ppn_amount?: number;         // PPN 11%
  voucher_code?: string;
  admin_notes?: string;
  /**
   * Kolam kuota jadwal INI. Dibawa view sejak sql/63.
   *
   * Dihilangkan (undefined) berarti "warisi jadwal ordinal 1", BUKAN "reguler"
   * — `extend_view_insert()` yang memutuskannya di DB. Mengirim `false` secara
   * eksplisit untuk jadwal ke-2 sebuah iklan tambahan akan memindahkannya ke
   * kolam reguler dan menjual satu slot reguler lebih banyak dari yang ada.
   */
  is_extra_ad?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduledAd {
  id?: string;
  form_submission_id: string;
  start_date: string;
  end_date: string;
  ad_link: string;
  notes?: string;
  google_calendar_event_id?: string;
  is_extra_ad?: boolean;
  created_at?: string;
  created_by?: string;
  // Joins
  form_title?: string; // from form_submissions
  researcher_name?: string; // from form_submissions
}

// Fungsi untuk menyimpan form submission (with duplicate detection)
export const saveFormSubmission = async (formData: FormSubmission) => {
  try {
    // Duplicate detection: check if same email + title + total_cost exists within last 60 seconds
    if (formData.email && formData.title) {
      const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from('form_submissions')
        .select('*')
        .eq('email', formData.email)
        .eq('title', formData.title)
        .eq('total_cost', formData.total_cost)
        .gte('created_at', sixtySecondsAgo)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        console.warn('Duplicate submission detected, returning existing record:', existing[0].id);
        return existing[0];
      }
    }

    const { data, error } = await supabase
      .from('form_submissions')
      .insert([formData])
      .select();

    if (error) throw error;
    return data[0];
  } catch (error: any) {
    console.error('Error saving form submission:', error);
    throw error;
  }
};

// Fungsi untuk update form submission by ID (used for reschedule)
export const updateFormSubmissionById = async (id: string, formData: Partial<FormSubmission>) => {
  try {
    const { data, error } = await supabase
      .from('form_submissions')
      .update({
        ...formData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Submission not found');
    return data[0];
  } catch (error: any) {
    console.error('Error updating form submission:', error);
    throw error;
  }
};

// Fungsi untuk membuat transaksi
export const createTransaction = async (transaction: Transaction) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .insert([transaction])
      .select();

    if (error) throw error;
    return data[0];
  } catch (error: any) {
    console.error('Error creating transaction:', error);
    throw error;
  }
};

// Fungsi untuk menghapus transaksi
export const deleteTransaction = async (id: string) => {
  try {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error: any) {
    console.error('Error deleting transaction:', error);
    throw error;
  }
};

// Fungsi untuk menghapus banyak transaksi
export const deleteTransactions = async (ids: string[]) => {
  try {
    const { error, count } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .in('id', ids);

    if (error) throw error;

    // Check if rows were actually deleted
    if (count === 0) {
      console.warn('Delete operation returned 0 count. Check RLS policies.');
      throw new Error('Tidak ada data yang terhapus (Permasalahan Izin/RLS)');
    }

    return true;
  } catch (error: any) {
    console.error('Error deleting transactions:', error);
    throw error;
  }
};

// Fungsi untuk mendapatkan transaksi berdasarkan form_submission_id
export const getTransactionsByFormSubmissionId = async (formSubmissionId: string) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('form_submission_id', formSubmissionId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting transactions:', error);
    return [];
  }
};

// `getExtendsBySubmissionIds` DIHAPUS 2026-08-30 (langkah contract Task 11).
// Ia satu-satunya pembaca `select('*')` dari view, dan ternyata KODE MATI —
// nol pemanggil di seluruh repo, termasuk spec. Memindahkannya ke `ad_schedules`
// berarti menulis pemeta kolom (source_id→id, status→submission_status,
// is_new_period→is_new_month) untuk fungsi yang tidak pernah dipanggil siapa pun.
// Preseden yang sama dipakai saat `updatePaymentStatus` dibuang di §00T.

// Halaman iklan (survey_pages) per submission — link publik (slug) + jumlah
// views, ditampilkan sebagai satu blok order-level (satu halaman dipakai
// semua jadwal iklan, views akumulatif seluruh jadwal, bukan milik satu jadwal).
export const getSurveyPagesBySubmissionIds = async (
  submissionIds: string[]
): Promise<Record<string, { views: number; slug: string | null }>> => {
  if (!submissionIds.length) return {};
  try {
    const { data, error } = await supabase
      .from('survey_pages')
      .select('submission_id, views_count, slug')
      .in('submission_id', submissionIds);

    if (error) throw error;
    const result: Record<string, { views: number; slug: string | null }> = {};
    (data || []).forEach((row: { submission_id: string; views_count: number | null; slug: string | null }) => {
      result[row.submission_id] = { views: row.views_count || 0, slug: row.slug || null };
    });
    return result;
  } catch (error) {
    console.error('Error getting survey pages by submission ids:', error);
    return {};
  }
};

// Fungsi untuk mendapatkan form submission berdasarkan ID
export const getFormSubmissionById = async (id: string) => {
  try {
    console.log('Fetching form submission with ID:', id);

    // Cek koneksi ke Supabase terlebih dahulu
    const isConnected = await checkSupabaseConnection();
    if (!isConnected) {
      console.warn('Supabase connection is not available, returning mock data');

      // Return mock data jika tidak terhubung ke Supabase
      return {
        id: id,
        survey_url: 'https://example.com/form',
        title: '[OFFLINE MODE] Form Submission',
        description: 'Data ini ditampilkan dalam mode offline karena tidak dapat terhubung ke database.',
        question_count: 10,
        duration: 1,
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 86400000).toISOString(), // +1 hari
        status: 'active',
        total_cost: 100000,
        payment_status: 'pending'
      } as FormSubmission;
    }

    // Lanjutkan dengan query utama jika terhubung
    const { data, error } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Supabase error when fetching form submission:', error);

      // Jika error adalah "not found", berikan pesan yang lebih jelas
      if (error.code === 'PGRST116') {
        throw new Error(`Form submission dengan ID ${id} tidak ditemukan`);
      }

      throw error;
    }

    if (!data) {
      console.warn('No data found for form submission ID:', id);
      return null;
    }

    console.log('Form submission data retrieved successfully');
    return data;
  } catch (error: any) {
    console.error('Error getting form submission:', error);

    // Tambahkan informasi tambahan ke error untuk debugging
    if (error.message) {
      error.message = `Error fetching form ID ${id}: ${error.message}`;
    }

    // Throw error dengan informasi yang lebih jelas
    throw new Error(`Gagal mengambil data form: ${error.message || 'Unknown error'}`);
  }
};

/**
 * Berapa baris tagihan yang benar-benar tersentuh oleh satu aksi uang.
 *
 * Nol BUKAN kegagalan di sini — lihat `assertScheduleRowTouched()` untuk
 * pembagian tanggung jawabnya. Pemanggil memakai angka ini untuk berkata jujur
 * di toast ("lunas, tapi nol tagihan ikut ditandai") alih-alih menampilkan
 * sukses polos yang menyembunyikan bahwa tidak ada catatan tagihan apa pun.
 */
export type ScheduleBillingTouch = { invoices: number; transactions: number };

/**
 * Penjaga baris untuk penulisan jadwal — pasangan `.select('id')` yang WAJIB
 * menyertai setiap `.update()` ke `form_submissions` / `form_submissions_extend`
 * di jalur uang.
 *
 * ⚠️ INI MENUTUP KELAS BUG "GAGAL SENYAP". PostgREST membalas 2xx tanpa error
 * saat RLS menyaring hasilnya jadi NOL baris — jadi `.update()` tanpa
 * `.select()` tidak bisa dibedakan antara "tersimpan" dan "ditolak diam-diam".
 * RLS di sini mengunci tulisan kolom uang ke `service_role` atau satu email
 * hardcoded (`guard_extend_payment_columns`, sql/33), jadi nol baris adalah
 * keadaan yang benar-benar bisa terjadi pada admin lain — dan sebelum ini
 * tampil sebagai toast hijau "ditandai lunas" padahal tidak ada yang berubah.
 *
 * ⚠️ SENGAJA HANYA UNTUK BARIS JADWAL, bukan untuk `invoices`/`transactions`.
 * Di kedua tabel itu nol baris adalah keadaan SAH: order yang dilunasi di luar
 * sistem memang tidak punya catatan tagihan sama sekali. Melempar di sana akan
 * memblokir pelunasan yang benar. Karena itu jumlahnya dikembalikan
 * (`ScheduleBillingTouch`) untuk dilaporkan, bukan dilempar.
 *
 * Aman dipakai pada `form_submissions_extend` meski ia VIEW: `extend_view_update()`
 * mengembalikan `NEW` (sql/52), jadi `RETURNING` di baliknya tetap berisi.
 */
const assertScheduleRowTouched = (rows: unknown[] | null, entry: AdScheduleEntry): void => {
  if (rows && rows.length > 0) return;
  throw new Error(
    `Perubahan jadwal #${entry.bookingId} TIDAK tersimpan — nol baris tersentuh. ` +
    'Biasanya karena akun ini tidak berhak menulis kolom pembayaran, atau ' +
    'jadwalnya sudah berubah di tempat lain. Muat ulang lalu coba lagi.'
  );
};

/**
 * Tandai SATU jadwal lunas — pelunasan manual oleh admin.
 *
 * ⚠️ SATU-SATUNYA JALAN PELUNASAN MANUAL. Pendahulunya, `updatePaymentStatus`,
 * menyaring `form_submission_id` saja — jadi pada order berjadwal banyak ia
 * melunasi tagihan jadwal LAIN sekaligus, termasuk jadwal yang uangnya belum
 * pernah diterima. Fungsi ini menyaring `schedule_id` (sql/51), jadi cakupannya
 * persis kartu yang diklik. `updatePaymentStatus` sendiri sudah DIHAPUS: ia
 * berakhir sebagai kode mati (prop `onPaymentStatusChange` tak pernah
 * di-destructure penerimanya), jadi jangan hidupkan kembali pola berlingkup
 * order untuk aksi berlingkup jadwal.
 *
 * Efek sampingnya sengaja dibuat IDENTIK dengan jalur webhook DOKU, supaya
 * pelunasan manual dan pelunasan otomatis tidak meninggalkan baris yang
 * berbeda bentuk:
 *
 *   ordinal 1  → form_submissions.payment_status='paid', submission_status='paid'
 *   ordinal ≥2 → form_submissions_extend.payment_status='paid',
 *                submission_status='scheduled'
 *              + survey_pages.requires_banner_update=true kalau hadiahnya berubah
 *                (`flagStaleBannerForExtend`, padanan STEP 5 webhook — sampai
 *                2026-09-03 efek inilah yang membuat kalimat "IDENTIK" di atas
 *                tidak benar)
 *
 * `'scheduled'` untuk perpanjangan BUKAN pilihan bebas: `cron_activate_extends()`
 * (sql/36) hanya mengangkat baris `scheduled` + `paid` jadi `live`. Menulis
 * `'paid'` ke sana membuat iklannya tidak pernah tayang.
 *
 * ⚠️ Penjaga kolom uang (`guard_extend_payment_columns`, sql/33) hanya
 * meloloskan `service_role` atau `product@jakpat.net`. Admin lain akan ditolak
 * DB — itu perilaku yang sudah ada sejak sql/33, bukan yang dibawa fungsi ini.
 * Sampai sekarang penolakan itu TIDAK TERLIHAT: `.update()` tanpa `.select()`
 * membalas sukses meski nol baris berubah, jadi admin melihat toast hijau untuk
 * pelunasan yang tidak pernah terjadi. `assertScheduleRowTouched()` menutupnya.
 *
 * Mengembalikan jumlah baris `invoices`/`transactions` yang ikut ditandai.
 * ⚠️ Nol di sana BUKAN kegagalan — order yang dibayar di luar sistem memang tak
 * punya catatan tagihan. Laporkan angkanya di toast, jangan lempar.
 */
export const markScheduleAsPaid = async (entry: AdScheduleEntry): Promise<ScheduleBillingTouch> => {
  // `invoices` TIDAK punya kolom `payment_method` — hanya `transactions` yang
  // punya. Patch-nya harus terpisah per skema; menyamakannya (seperti versi
  // lama) membuat PostgREST menolak update invoices dengan 400 PGRST204.
  const { data: invRows, error: invErr } = await supabase
    .from('invoices')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('schedule_id', entry.id)
    .in('status', ['pending', 'expired'])
    .select('id');
  if (invErr) throw invErr;

  const { data: txnRows, error: txnErr } = await supabase
    .from('transactions')
    .update({ status: 'paid', payment_method: 'manual', payment_channel: 'MANUAL_VERIFIED' })
    .eq('schedule_id', entry.id)
    .in('status', ['pending', 'expired'])
    .select('id');
  if (txnErr) throw txnErr;

  if (entry.isExtension) {
    // ⚠️ `entry.sourceId` = `ad_schedules.source_id`, BUKAN `ad_schedules.id`.
    // Filter `source_table` ikut eksplisit: tanpa itu `source_id` bisa
    // bertabrakan dengan id order pada baris ordinal 1.
    const { data, error } = await supabase
      .from('ad_schedules')
      .update({ payment_status: 'paid', status: 'scheduled' })
      .eq('source_table', 'form_submissions_extend')
      .eq('source_id', entry.sourceId)
      .select('id');
    if (error) throw error;
    assertScheduleRowTouched(data, entry);
    await flagStaleBannerForExtend(entry);
  } else {
    const { data, error } = await supabase
      .from('form_submissions')
      .update({ payment_status: 'paid', submission_status: 'paid' })
      .eq('id', entry.sourceId)
      .select('id');
    if (error) throw error;
    assertScheduleRowTouched(data, entry);
  }

  return { invoices: invRows?.length || 0, transactions: txnRows?.length || 0 };
};

/**
 * Tandai banner halaman iklan sebagai BASI — padanan STEP 5 di webhook DOKU.
 *
 * ⚠️ TANPA INI, KLAIM DI KEPALA `markScheduleAsPaid` TIDAK BENAR. Docblock-nya
 * berbunyi "efek sampingnya sengaja dibuat IDENTIK dengan jalur webhook DOKU",
 * padahal satu efek tidak pernah ikut: `functions/api/doku/webhook.js` (STEP 5,
 * cabang extend) menyalakan `requires_banner_update` ketika perpanjangannya
 * membuka periode hadiah baru atau menambah hadiah — pelunasan manual tidak.
 *
 * Akibat kalau dilewatkan: `cron_activate_extends()` memindahkan jendela publish
 * halaman ke jadwal baru dan menyalakannya `live`, lalu `/api/surveys`
 * menyajikan banner LAMA ke app Jakpat — iklan yang tayang menjanjikan nominal
 * hadiah periode sebelumnya, dan tidak ada satu pun permukaan yang memberi tahu
 * siapa pun. Chip "Banner perlu diupdate" di `PageDetailDrawer` adalah
 * SATU-SATUNYA pembacanya; ia tidak menggerakkan cron, API, atau gerbang aksi
 * mana pun.
 *
 * ⚠️ Nol perpanjangan pernah dilunasi manual di produksi (9 lunas, semuanya
 * lewat gateway per 2026-09-03) — dan itu BUKAN bukti risikonya kecil: jadwal
 * ke-2 memang belum dirilis ke peneliti, settingnya masih di dashboard admin.
 * Begitu tagihan gabungan dipakai sebagaimana mestinya (peneliti transfer di
 * luar DOKU, admin melunasi seluruh batch), jalur inilah yang jadi jalur utama.
 *
 * ⚠️ MENELAN GALATNYA SENDIRI, sama dengan webhook. Ini penanda untuk mata
 * admin; membiarkannya menggagalkan pelunasan yang UANGNYA SUDAH DITERIMA
 * adalah pertukaran yang salah arah. Nol baris juga sah — order Kilat tidak
 * pernah punya halaman (guard `ensure_survey_page`, sql/42).
 *
 * Syaratnya dibaca dari `entry`, bukan di-SELECT ulang seperti webhook: di sana
 * yang ada di tangan hanya `extend_id`, di sini barisnya sudah utuh.
 */
async function flagStaleBannerForExtend(entry: AdScheduleEntry): Promise<void> {
  const rewardChanged = entry.isNewPeriod || (entry.additionalPrizePerWinner ?? 0) > 0;
  if (!rewardChanged) return;

  try {
    const { data, error } = await supabase
      .from('survey_pages')
      .update({ requires_banner_update: true })
      .eq('submission_id', entry.submissionId)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      console.info(
        `[markScheduleAsPaid] Jadwal #${entry.bookingId} membuka hadiah baru, tapi order `
        + `${entry.submissionId} belum punya halaman iklan — penanda banner basi dilewati.`,
      );
    }
  } catch (e) {
    console.error('[markScheduleAsPaid] Gagal menandai banner basi (pelunasan TETAP sah):', e);
  }
}

/**
 * Batalkan pelunasan manual — invers `markScheduleAsPaid()`.
 *
 * ⚠️ GERBANGNYA SENGAJA LEBIH KETAT DARI `markScheduleAsPaid`. Dipanggil hanya
 * kalau `payment.paymentChannel === 'MANUAL_VERIFIED'` (dicek di pemanggil,
 * `ScheduleCardList.tsx`) — itu satu-satunya nilai yang ditulis fungsi ini
 * sendiri, tidak pernah oleh webhook DOKU (`functions/api/doku/webhook.js`
 * menulis kode kanal ASLI dari DOKU, bukan string ini). Filter
 * `.eq('payment_channel', 'MANUAL_VERIFIED')` di `transactions` mengulang
 * pemeriksaan itu di level DB supaya tidak mungkin membalik transaksi yang
 * sungguh dibayar lewat gateway hanya karena berbagi `schedule_id` dengan
 * percobaan bayar lain.
 *
 * Target baliknya BUKAN tebakan — persis bentuk yang dipakai `InvoiceForm.tsx`
 * saat menerbitkan tagihan baru (`submission_status: 'waiting_payment',
 * payment_status: 'pending'`), dan `create-payment.js` hanya memblokir
 * penerbitan ulang saat `payment_status IN ('paid','expired')` — 'pending'
 * aman, order bisa ditagih lagi tanpa halangan.
 *
 * `payment_method`/`payment_channel` dikosongkan (bukan ditebak balik ke
 * 'doku') karena kita tidak tahu — dan tidak boleh berpura-pura tahu — cara
 * bayar SEBELUM ditandai lunas manual.
 *
 * Pembagian penjaganya sama persis dengan `markScheduleAsPaid()`: baris jadwal
 * WAJIB tersentuh (`assertScheduleRowTouched`), baris tagihan boleh nol dan
 * jumlahnya dikembalikan untuk dilaporkan.
 */
export const unmarkScheduleAsPaid = async (entry: AdScheduleEntry): Promise<ScheduleBillingTouch> => {
  const { data: invRows, error: invErr } = await supabase
    .from('invoices')
    .update({ status: 'pending', paid_at: null })
    .eq('schedule_id', entry.id)
    .eq('status', 'paid')
    .select('id');
  if (invErr) throw invErr;

  const { data: txnRows, error: txnErr } = await supabase
    .from('transactions')
    .update({ status: 'pending', payment_method: null, payment_channel: null })
    .eq('schedule_id', entry.id)
    .eq('payment_channel', 'MANUAL_VERIFIED')
    .select('id');
  if (txnErr) throw txnErr;

  if (entry.isExtension) {
    // Pemetaan sama seperti markScheduleAsPaid: source_id + filter source_table.
    const { data, error } = await supabase
      .from('ad_schedules')
      .update({ payment_status: 'pending', status: 'waiting_payment' })
      .eq('source_table', 'form_submissions_extend')
      .eq('source_id', entry.sourceId)
      .select('id');
    if (error) throw error;
    assertScheduleRowTouched(data, entry);
  } else {
    const { data, error } = await supabase
      .from('form_submissions')
      .update({ payment_status: 'pending', submission_status: 'waiting_payment' })
      .eq('id', entry.sourceId)
      .select('id');
    if (error) throw error;
    assertScheduleRowTouched(data, entry);
  }

  return { invoices: invRows?.length || 0, transactions: txnRows?.length || 0 };
};

/**
 * Batalkan SATU TAGIHAN (= satu `payment_id`, N pesanan kalau ia gabungan) —
 * bukan jadwalnya, bukan pembayarannya.
 *
 * Sebelum ini tidak ada jalan keluar untuk tagihan yang salah terbit: ia
 * menggantung selamanya. Akibatnya terukur di produksi saat fitur ini dibuat —
 * 194 invoice `pending` di 146 jadwal, dan cacat seperti `V3M9285H` yang punya
 * tagihan Rp 370.000 DAN Rp 3.700.000 di hari yang sama (satu nol kelebihan).
 *
 * Sesudah dibatalkan: statusnya `cancelled` (rank 2 di `payment_status_rank`,
 * sql/53), jadi ia otomatis keluar dari `billed` dan membebaskan penjaga "satu
 * tagihan terbuka per jadwal". Barisnya TIDAK dihapus — kartu tetap
 * menampilkannya dicoret, karena riwayat tagihan adalah catatan uang.
 *
 * ⚠️ HANYA UNTUK TAGIHAN YANG BELUM DIBAYAR. Filter `.eq('status','pending')`
 * mengulang syarat itu di level DB. Membatalkan tagihan lunas bukan
 * pembatalan, melainkan REFUND — dan refund diurus finance di luar sistem
 * (keputusan pemilik produk 2026-08-09).
 *
 * ⚠️ INI MEMATIKAN LINK DOKU LEBIH DULU (`killDokuLink`, sejak sql/84) — dan
 * kalimat ini dulu berbunyi sebaliknya. Panggilannya boleh GAGAL tanpa menahan
 * pembatalan; `dokuCancelled: false` yang memberi tahu admin bahwa VA-nya masih
 * bisa dibayar dari sisi bank. Kalau uangnya tetap datang, penjaga
 * `paid_on_dead_bill` (sql/80) mencatatnya TANPA menghidupkan jadwalnya —
 * uang yang diterima tidak pernah hilang, tapi ia juga tidak lagi diam-diam
 * memindahkan jadwal yang sudah dibatalkan.
 *
 * ⚠️ CAKUPANNYA SELURUH `payment_id`, jadi untuk tagihan gabungan ia mematikan
 * SEMUA anggotanya sekaligus. Itu satu-satunya perilaku yang mungkin — link
 * DOKU tidak bisa dibatalkan separuh — tapi pemanggil WAJIB mengatakannya di
 * dialog. Pakai `fetchInvoiceGroups()` untuk menyebut berapa pesanan yang ikut.
 *
 * Mengembalikan jumlah baris yang benar-benar berubah. ⚠️ Jangan buang nilai
 * itu: `.update()` tanpa `.select()` TIDAK melempar error saat RLS menyaring
 * hasilnya jadi nol baris — persis cara "Tandai Lunas" gagal diam-diam selama
 * berbulan-bulan sebelum `sql/59`.
 */
export interface CancelInvoiceResult {
  /** Baris yang benar-benar berubah, di kedua tabel. */
  changed: number;
  /** DOKU mengonfirmasi link bayarnya mati? */
  dokuCancelled: boolean;
  /** Kenapa tidak, kalau tidak. `null` saat berhasil. */
  dokuReason: string | null;
}

/**
 * Matikan link DOKU-nya lebih dulu, lalu catat hasilnya.
 *
 * ⚠️ KEGAGALANNYA TIDAK BOLEH MENAHAN PEMBATALAN. Kontrak yang sama dengan
 * `notifyScheduleChange`: tidak pernah melempar, kabari lewat nilai balik.
 * Membiarkan tagihan tetap hidup di sistem kita gara-gara satu HTTP gagal jauh
 * lebih buruk daripada link DOKU yang mungkin masih terbuka — yang kedua sudah
 * dijaga penjaga webhook `paid_on_dead_bill` (sql/80).
 */
async function killDokuLink(
  paymentId: string,
  knownRequestId?: string | null,
): Promise<{ ok: boolean; reason: string | null }> {
  try {
    /*
      ⚠️ `knownRequestId` MENANG ATAS QUERY, DAN ITU BUKAN OPTIMASI.

      Jalur pembatalan manual punya barisnya di DB, jadi query di bawah sah.
      Tapi `cleanUp()` di `invoiceWrite.ts` memanggil ini justru ketika
      penulisan baris GAGAL — link DOKU-nya sudah hidup sementara barisnya
      mungkin tidak pernah mendarat. Di situ query mengembalikan nol baris, dan
      tanpa jalur konteks ini link yang seharusnya tidak pernah ada akan tetap
      menagih. Itu tempat TERBAIK memanggil Cancel Order, bukan yang terburuk.
    */
    let requestId = knownRequestId ?? null;
    if (!requestId) {
      const { data } = await supabase
        .from('invoices')
        .select('doku_request_id')
        .eq('payment_id', paymentId)
        .limit(1)
        .maybeSingle();
      requestId = data?.doku_request_id ?? null;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/doku/cancel-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        invoice_number: paymentId,
        original_request_id: requestId,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const out = await res.json();
    return { ok: !!out?.cancelled, reason: out?.cancelled ? null : (out?.message || out?.reason || 'Tidak diketahui') };
  } catch (e: any) {
    console.error('[cancelInvoice] gagal memanggil Cancel Order DOKU:', e);
    return { ok: false, reason: e?.message || 'Panggilan ke DOKU gagal' };
  }
}

export const cancelInvoice = async (
  paymentId: string,
  knownRequestId?: string | null,
): Promise<CancelInvoiceResult> => {
  // ⚠️ URUTANNYA MENGIKAT: DOKU DULU, BARU DATABASE. Kalau dibalik dan
  // panggilan DOKU-nya lambat, ada jendela ketika baris kita sudah `cancelled`
  // sementara link-nya masih hidup — dan justru di jendela itu peneliti yang
  // sedang membuka halaman bayar akan membayarnya.
  const doku = await killDokuLink(paymentId, knownRequestId);

  const { data: invRows, error: invErr } = await supabase
    .from('invoices')
    .update({
      status: 'cancelled',
      // Hanya diisi kalau DOKU BENAR-BENAR mengonfirmasi. NULL = dialog dan
      // email wajib memakai cabang peringatan. Jangan pernah menuliskannya
      // "optimistis" — kalimat menenangkan tanpa dasar persis yang membuat
      // insiden af004b84 terjadi.
      ...(doku.ok ? { doku_cancelled_at: new Date().toISOString() } : {}),
    })
    .eq('payment_id', paymentId)
    .eq('status', 'pending')
    .select('id');
  if (invErr) throw invErr;

  const { data: txnRows, error: txnErr } = await supabase
    .from('transactions')
    .update({ status: 'cancelled' })
    .eq('payment_id', paymentId)
    .eq('status', 'pending')
    .select('id');
  if (txnErr) throw txnErr;

  return {
    changed: (invRows?.length || 0) + (txnRows?.length || 0),
    dokuCancelled: doku.ok,
    dokuReason: doku.reason,
  };
};

/**
 * ── TAGIHAN GABUNGAN (satu `payment_id`, N pesanan) ────────────────────────
 *
 * ⚠️ `schedule_billing_bulk()` TIDAK BISA MENJAWAB INI, dan itu bukan detail
 * implementasi. RPC itu dijangkar ke SATU `submission_id`, sementara anggota
 * sebuah tagihan gabungan justru tersebar di ORDER-ORDER YANG BERBEDA — jadi
 * menurunkan "berapa pesanan yang ditanggung tagihan ini" dari hasilnya selalu
 * menjawab 1, tepat pada kasus yang pertanyaannya diajukan.
 *
 * Karena itu jumlah anggotanya ditanyakan langsung ke `invoices`, dikunci
 * `payment_id`. Aman untuk kedua sisi: RLS `Users Select Invoices` menyaring
 * lewat `form_submissions.auth_user_id`, dan satu grup selalu dijangkar ke SATU
 * peneliti (`distinctAccounts` di `bulkInvoiceCandidates.ts`) — jadi peneliti
 * melihat seluruh anggotanya, dan tidak pernah milik orang lain.
 */
export interface InvoiceGroupMember {
  paymentId: string;
  /** `ad_schedules.id` — null hanya untuk baris warisan pra-sql/51. */
  scheduleId: string | null;
  /**
   * `ad_schedules.source_id` — KUNCI YANG DIPAKAI KARTU PENELITI (`sourceId` di
   * `airingPeriods.ts` / `SchedulePaymentMap`). Tanpa ini kartu tidak punya cara
   * mengenali dirinya sendiri di dalam daftar anggota, dan "siapa yang memegang
   * tombol bayar" jadi tebakan.
   */
  sourceId: string | null;
  submissionId: string | null;
  bookingId: string | null;
  /** Judul survei yang ditanggung baris ini; '(tanpa judul)' kalau kosong. */
  title: string;
  /** Porsi baris ini, BUKAN total grup. */
  amount: number;
  status: string;
  isPaid: boolean;
  ordinal: number | null;
  startDate: string | null;
}

export interface InvoiceGroup {
  paymentId: string;
  /** Urut tanggal tayang paling awal dulu — anggota pertama adalah "lead". */
  members: InvoiceGroupMember[];
  memberCount: number;
  /**
   * Σ porsi tiap anggota. ⚠️ JANGAN dihitung dari satu baris dikali N: PPN 11%
   * dibulatkan per baris, jadi `Σ round(sᵢ×0,11) ≠ round(Σsᵢ×0,11)`.
   */
  total: number;
  allPaid: boolean;
}

const PAID_ROW_STATUSES = ['paid', 'completed'];

/**
 * Anggota tiap tagihan yang disebut `paymentIds`.
 *
 * Selalu mengembalikan entri untuk `payment_id` yang punya baris — termasuk
 * yang beranggota SATU. Pemanggil yang memutuskan (`memberCount > 1`), supaya
 * tidak ada dua definisi "ini grup atau bukan" yang bisa menyimpang.
 *
 * Kegagalannya tidak melempar: peta kosong berarti "tidak ada yang diketahui
 * soal grup", dan seluruh permukaan jatuh ke perilaku per-jadwal seperti
 * sebelum fitur ini ada. Layar tidak boleh gelap gara-gara hiasan.
 */
export const fetchInvoiceGroups = async (
  paymentIds: (string | null | undefined)[],
): Promise<Map<string, InvoiceGroup>> => {
  const ids = Array.from(new Set(paymentIds.filter((v): v is string => !!v)));
  const out = new Map<string, InvoiceGroup>();
  if (ids.length === 0) return out;

  try {
    const { data: rows, error } = await supabase
      .from('invoices')
      .select('payment_id, schedule_id, form_submission_id, amount, status')
      .in('payment_id', ids);
    if (error) throw error;

    const invRows = (rows || []) as any[];
    if (invRows.length === 0) return out;

    const scheduleIds = Array.from(
      new Set(invRows.map((r) => r.schedule_id).filter((v): v is string => !!v)),
    );
    const schedById = new Map<string, any>();
    if (scheduleIds.length > 0) {
      const { data: scheds } = await supabase
        .from('ad_schedules')
        .select('id, submission_id, source_id, ordinal, booking_id, start_date')
        .in('id', scheduleIds);
      for (const s of scheds || []) schedById.set(s.id, s);
    }

    const submissionIds = Array.from(new Set([
      ...invRows.map((r) => r.form_submission_id),
      ...Array.from(schedById.values()).map((s) => s.submission_id),
    ].filter((v): v is string => !!v)));
    const titleById = new Map<string, string>();
    if (submissionIds.length > 0) {
      const { data: subs } = await supabase
        .from('form_submissions')
        .select('id, title')
        .in('id', submissionIds);
      for (const s of subs || []) titleById.set(s.id, s.title || '');
    }

    const byPayment = new Map<string, InvoiceGroupMember[]>();
    for (const r of invRows) {
      const sched = r.schedule_id ? schedById.get(r.schedule_id) : null;
      const submissionId = sched?.submission_id ?? r.form_submission_id ?? null;
      const status = String(r.status || '');
      const member: InvoiceGroupMember = {
        paymentId: r.payment_id,
        scheduleId: r.schedule_id ?? null,
        sourceId: sched?.source_id ?? r.form_submission_id ?? null,
        submissionId,
        bookingId: sched?.booking_id ?? null,
        title: (submissionId ? titleById.get(submissionId) : '') || '(tanpa judul)',
        amount: Number(r.amount || 0),
        status,
        isPaid: PAID_ROW_STATUSES.includes(status.toLowerCase()),
        ordinal: sched?.ordinal ?? null,
        startDate: sched?.start_date ?? null,
      };
      const list = byPayment.get(member.paymentId);
      if (list) list.push(member);
      else byPayment.set(member.paymentId, [member]);
    }

    for (const [paymentId, members] of byPayment) {
      /*
        Urutan = tanggal tayang paling awal dulu, dan ini BUKAN kosmetik.
        Anggota itulah yang memegang tombol bayar di dashboard peneliti, dan
        jadwal itu pula yang mematikan link duluan (`invoiceLifetimeMinutes`) —
        jadi kartu yang menagih adalah kartu dengan tenggat paling ketat.
        Yang tak bertanggal ditaruh di belakang, bukan dianggap paling awal.
      */
      members.sort((a, b) => {
        const at = a.startDate ? new Date(a.startDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bt = b.startDate ? new Date(b.startDate).getTime() : Number.MAX_SAFE_INTEGER;
        if (at !== bt) return at - bt;
        return (a.ordinal ?? 0) - (b.ordinal ?? 0);
      });
      out.set(paymentId, {
        paymentId,
        members,
        memberCount: members.length,
        total: members.reduce((sum, m) => sum + m.amount, 0),
        allPaid: members.length > 0 && members.every((m) => m.isPaid),
      });
    }
    return out;
  } catch (e) {
    console.error('[fetchInvoiceGroups] gagal memuat anggota tagihan gabungan:', e);
    return out;
  }
};

/** Hasil pelunasan manual satu tagihan gabungan — per anggota, bukan borongan. */
export interface GroupSettleResult {
  /** Anggota yang benar-benar jadi lunas. */
  settled: { bookingId: string | null; title: string }[];
  /** Anggota yang gagal, beserta alasan DB-nya. */
  failed: { bookingId: string | null; title: string; reason: string }[];
  /** Baris tagihan yang ikut ditandai, dijumlahkan seluruh anggota. */
  touched: ScheduleBillingTouch;
  dokuCancelled: boolean;
  dokuReason: string | null;
}

/**
 * "Tandai Lunas" berskala GRUP — pelunasan manual satu tagihan gabungan.
 *
 * ⚠️ CAKUPANNYA, BUKAN AKSINYA, YANG DULU SALAH. `markScheduleAsPaid()`
 * menyaring `schedule_id`, jadi memakainya pada anggota grup membalik SATU
 * baris jadi lunas sementara link DOKU-nya tetap menagih total penuh. Tidak ada
 * lapisan yang menangkapnya: webhook STEP 0 menjumlahkan kolom `amount` (yang
 * tidak berubah oleh pembalikan status) sehingga tetap cocok, dan STEP 0b tidak
 * menyala karena `paid` bukan status mati. Ujungnya porsi yang sama dibayar dua
 * kali, dalam uang sungguhan, tanpa satu pun tanda di layar mana pun.
 *
 * ⚠️ URUTANNYA MENGIKAT — DOKU DULU, BARU DATABASE. Sama dengan `cancelInvoice`:
 * kalau dibalik, ada jendela ketika baris kita sudah `paid` sementara link-nya
 * masih hidup, dan justru di jendela itu peneliti yang sedang membuka halaman
 * bayar akan membayarnya. Kegagalan mematikan link TIDAK menahan pelunasan —
 * dilaporkan lewat nilai balik (`dokuCancelled`), kontrak yang sama.
 *
 * ⚠️ LOOP-NYA TIDAK TRANSAKSIONAL. `assertScheduleRowTouched` melempar pada nol
 * baris (mis. admin selain `product@jakpat.net` yang ditolak
 * `guard_extend_payment_columns`, sql/33), jadi 3 dari 4 anggota bisa berhasil.
 * Pemanggil WAJIB melaporkan angkanya — jangan pernah mengklaim sukses borongan.
 */
export const settleGroupAsPaid = async (paymentId: string): Promise<GroupSettleResult> => {
  const groups = await fetchInvoiceGroups([paymentId]);
  const group = groups.get(paymentId);
  if (!group || group.memberCount === 0) {
    throw new Error(`Tagihan ${paymentId} tidak punya baris anggota — tidak ada yang bisa dilunasi.`);
  }

  const doku = await killDokuLink(paymentId);

  // Satu pengambilan untuk seluruh anggota, lalu dicocokkan lewat `id` jadwal.
  // `markScheduleAsPaid` menuntut entry yang UTUH (ia membaca `isExtension`,
  // `sourceId`, `bookingId`) — merakit bentuk mirip-entry di sini berarti
  // menyalin aturan ordinal-1-vs-ordinal-≥2 yang justru tidak boleh disalin.
  const submissionIds = Array.from(
    new Set(group.members.map((m) => m.submissionId).filter((v): v is string => !!v)),
  );
  const entries = await fetchAdSchedules(submissionIds);
  const entryById = new Map(entries.map((e) => [e.id, e]));

  const result: GroupSettleResult = {
    settled: [],
    failed: [],
    touched: { invoices: 0, transactions: 0 },
    dokuCancelled: doku.ok,
    dokuReason: doku.reason,
  };

  for (const member of group.members) {
    const entry = member.scheduleId ? entryById.get(member.scheduleId) : undefined;
    if (!entry) {
      result.failed.push({
        bookingId: member.bookingId,
        title: member.title,
        reason: 'baris jadwalnya tidak ditemukan',
      });
      continue;
    }
    try {
      const touched = await markScheduleAsPaid(entry);
      result.touched.invoices += touched.invoices;
      result.touched.transactions += touched.transactions;
      result.settled.push({ bookingId: entry.bookingId, title: member.title });
    } catch (err: any) {
      result.failed.push({
        bookingId: entry.bookingId,
        title: member.title,
        reason: err?.message || 'gagal tanpa keterangan',
      });
    }
  }

  return result;
};

/** Hasil pembalikan pelunasan satu tagihan gabungan — per anggota, bukan borongan. */
export interface GroupUnsettleResult {
  /** Anggota yang benar-benar kembali "menunggu bayar". */
  reverted: { bookingId: string | null; title: string }[];
  failed: { bookingId: string | null; title: string; reason: string }[];
  touched: ScheduleBillingTouch;
}

/**
 * "Tandai Belum Lunas" berskala GRUP — invers `settleGroupAsPaid()`.
 *
 * ⚠️ CACAT CERMIN B2, DAN IA LAHIR DARI PERBAIKANNYA. `settleGroupAsPaid`
 * menulis `payment_channel = 'MANUAL_VERIFIED'` di tiap baris — dan justru nilai
 * itulah gerbang yang memunculkan "Tandai Belum Lunas" di kartu. Jadi sesudah
 * satu grup dilunasi, tiap anggota menawarkan pembalikan SENDIRI-SENDIRI, dan
 * `unmarkScheduleAsPaid()` menyaring `schedule_id`. Membalik satu anggota
 * memecah grup jadi separuh-lunas: dokumen `/invoices/<payment_id>` berhenti
 * jadi RECEIPT dan kembali jadi INVOICE **bernominal penuh** — untuk pesanan
 * yang uangnya sudah diterima.
 *
 * ⚠️ TIDAK ADA PANGGILAN DOKU DI SINI, DAN ITU BUKAN KELALAIAN. Link-nya sudah
 * dimatikan saat grup dilunasi (`killDokuLink` di `settleGroupAsPaid`), dan API
 * DOKU tidak punya "batalkan pembatalan". Membalik status di sisi kita TIDAK
 * menghidupkan kembali link bayarnya — pemanggil WAJIB mengatakan itu di dialog,
 * karena langkah berikutnya adalah menerbitkan tagihan BARU, bukan mengirim
 * ulang link lama.
 *
 * Sama seperti settle: loopnya tidak transaksional, jadi laporannya per anggota.
 */
export const unsettleGroupAsPaid = async (paymentId: string): Promise<GroupUnsettleResult> => {
  const groups = await fetchInvoiceGroups([paymentId]);
  const group = groups.get(paymentId);
  if (!group || group.memberCount === 0) {
    throw new Error(`Tagihan ${paymentId} tidak punya baris anggota — tidak ada yang bisa dibalik.`);
  }

  const submissionIds = Array.from(
    new Set(group.members.map((m) => m.submissionId).filter((v): v is string => !!v)),
  );
  const entries = await fetchAdSchedules(submissionIds);
  const entryById = new Map(entries.map((e) => [e.id, e]));

  const result: GroupUnsettleResult = {
    reverted: [],
    failed: [],
    touched: { invoices: 0, transactions: 0 },
  };

  for (const member of group.members) {
    const entry = member.scheduleId ? entryById.get(member.scheduleId) : undefined;
    if (!entry) {
      result.failed.push({
        bookingId: member.bookingId,
        title: member.title,
        reason: 'baris jadwalnya tidak ditemukan',
      });
      continue;
    }
    try {
      const touched = await unmarkScheduleAsPaid(entry);
      result.touched.invoices += touched.invoices;
      result.touched.transactions += touched.transactions;
      result.reverted.push({ bookingId: entry.bookingId, title: member.title });
    } catch (err: any) {
      result.failed.push({
        bookingId: entry.bookingId,
        title: member.title,
        reason: err?.message || 'gagal tanpa keterangan',
      });
    }
  }

  return result;
};

// Fungsi untuk update status form
export const updateFormStatus = async (
  id: string,
  status: string,
  notes?: string,
  reviewHistory?: ReviewHistoryEntry[]
) => {
  try {
    const updateData: any = { submission_status: status };
    if (notes !== undefined) {
      updateData.admin_notes = notes;
    }
    if (reviewHistory !== undefined) {
      updateData.review_history = reviewHistory;
    }

    // ⚠️ TIDAK ADA LAGI FALLBACK 42703 DI SINI.
    //
    // Dulu fungsi ini menangkap "kolom tidak ada" lalu diam-diam mengulang
    // TANPA `review_history`. Kolomnya memang tidak pernah ada, jadi cabang
    // "fallback" itu ternyata SATU-SATUNYA jalur yang pernah diambil — dan
    // setiap keputusan review menguap begitu halaman di-refresh, tanpa satu
    // pun tanda di layar. Kolomnya lahir di sql/69; kalau penulisannya gagal
    // sekarang, itu HARUS berisik.
    const { data, error } = await supabase
      .from('form_submissions')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) throw error;
    return data[0];
  } catch (error: any) {
    console.error('Error updating form status:', error);
    throw error;
  }
};

/**
 * Menghapus form submission secara PERMANEN.
 *
 * ⚠️ Untuk user biasa ini SELALU gagal, dan itu memang disengaja: `form_submissions`
 * punya RLS aktif tanpa satu pun policy DELETE (hanya INSERT/SELECT/UPDATE), jadi
 * PostgREST mengembalikan sukses dengan NOL baris terhapus — bukan error. Dulu
 * pemanggilnya menganggap itu berhasil, membuang baris dari state, lalu menampilkan
 * toast sukses; order muncul lagi begitu halaman di-refresh.
 *
 * Karena itu `.select('id')` di bawah wajib: ia memaksa PostgREST mengembalikan baris
 * yang benar-benar terhapus, sehingga "tidak ada yang terhapus" bisa dibedakan dari
 * "berhasil" dan dilempar sebagai error. JANGAN hapus `.select()` itu.
 *
 * Untuk menyingkirkan order dari daftar user, pakai `dismissSubmission()` —
 * ia menyimpan datanya (bisa ditelusuri saat ada keluhan), bukan menghapusnya.
 */
export const deleteFormSubmission = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('form_submissions')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        `Tidak ada baris yang terhapus untuk submission ${id} — kemungkinan besar ditolak RLS (tidak ada policy DELETE).`
      );
    }
    return true;
  } catch (error: any) {
    console.error('Error deleting form submission:', error);
    throw error;
  }
};

/**
 * Menyingkirkan order MATI dari daftar user, tanpa menghapus datanya dan tanpa
 * menyentuh statusnya.
 *
 * Dulu ini bernama `dismissRejectedSubmission` dan menulis
 * `submission_status = 'cancelled'`. Itu keliru dua kali:
 *
 *   1. Menyembunyikan adalah PREFERENSI TAMPILAN PEMILIK BARIS, bukan keadaan
 *      order. Ia tidak berhak menduduki satu nilai status — apalagi nilai yang
 *      kata-katanya berarti hal lain sama sekali.
 *   2. Karena kata 'cancelled' terpakai untuk ini, tidak tersisa kata untuk
 *      pembatalan yang sesungguhnya. sql/69 memindahkan perilakunya ke kolom
 *      `dismissed_at` dan membebaskan 'cancelled' berarti "dibatalkan".
 *
 * Soft-hide, bukan DELETE, karena `survey_pages`, `invoices`, dan `transactions`
 * TIDAK punya foreign key ke `form_submissions`: penghapusan keras meninggalkan
 * baris yatim, dan riwayat order tetap perlu ada saat user menghubungi bantuan.
 *
 * `.select('id')` WAJIB: RLS membalas sukses-dengan-nol-baris, bukan error, jadi
 * tanpa ini "tidak ada yang tersentuh" tidak bisa dibedakan dari "berhasil".
 *
 * Penyaring `.in(...)` kini mencakup SEMUA keadaan mati — menyembunyikan sudah
 * orthogonal terhadap sebabnya, bukan cuma melayani satu tombol.
 */
export const dismissSubmission = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('form_submissions')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', id)
      .in('submission_status', ['rejected', 'spam', 'cancelled'])
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        `Order ${id} tidak bisa disingkirkan — statusnya masih aktif, atau ditolak RLS.`
      );
    }
    return true;
  } catch (error: any) {
    console.error('Error dismissing submission:', error);
    throw error;
  }
};

/**
 * Peneliti membatalkan pesanannya sendiri — SELAMA BELUM LUNAS.
 *
 * Ini keadaan order yang sesungguhnya, bukan preferensi tampilan: ordernya
 * TETAP TERLIHAT peneliti (pindah ke tab "Selesai" bertanda Dibatalkan), dan
 * hanya hilang kalau ia juga menekan "Hapus dari Order Saya" (`dismissSubmission`).
 *
 * DUA LAPIS PENJAGA, dan lapis pertamanya bukan di sini:
 *
 *   1. Trigger `guard_payment_columns()` (sql/33) di DATABASE. Ia denylist:
 *      memblokir transisi yang menyentuh paid|scheduled|live|completed untuk
 *      pemanggil non-admin. Jadi order lunas ditolak database — dipanggil paksa
 *      lewat konsol pun tetap gagal. Aturan "order lunas hanya lewat admin"
 *      sudah ditegakkan di sana, bukan sekadar disembunyikan di UI.
 *   2. `.in(...)` di bawah, sebagai jaring kedua yang eksplisit terbaca.
 *
 * `.select('id')` wajib, alasannya sama dengan `dismissSubmission`.
 */
export const cancelOrder = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('form_submissions')
      .update({ submission_status: 'cancelled' })
      .eq('id', id)
      .in('submission_status', [
        'in_review',
        'pending',
        'rejected',
        'approved',
        'slot_reserved',
        'waiting_payment',
      ])
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        `Pesanan ${id} tidak bisa dibatalkan sendiri — kemungkinan sudah lunas atau sedang tayang.`
      );
    }
    return true;
  } catch (error: any) {
    console.error('Error cancelling order:', error);
    throw error;
  }
};

/**
 * ⚠️ MENULIS DUA MASUKAN HARGA — jadi ia SELALU menghitung ulang harganya.
 *
 * `prize_per_winner` dan `winner_count` masuk ke subtotal lewat
 * `calculateIncentiveCost`. Sampai sebelum ini fungsinya menulis keduanya lalu
 * berhenti, dan `total_cost/subtotal/ppn_amount` tetap memegang angka lama.
 * Lihat catatan panjang di `updateFormDetails` untuk kenapa penghitungan
 * ulangnya ditaruh DI SINI dan bukan di pemanggil.
 */
export const updateSubmissionCriteria = async (
  id: string, criteria: string, prizePerWinner: number, winnerCount: number,
): Promise<{ row: any; pricing: OrderPriceResult | null }> => {
  try {
    const { data, error } = await supabase
      .from('form_submissions')
      .update({
        criteria_responden: criteria,
        prize_per_winner: prizePerWinner,
        winner_count: winnerCount
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { row: data, pricing: await recomputeOrderPrice(id) };
  } catch (error: any) {
    console.error('Error updating submission criteria:', error);
    throw error;
  }
};

/** Kolom yang ikut menentukan harga order. Menulis salah satunya WAJIB
 *  diikuti `recomputeOrderPrice` — lihat `updateFormDetails`. */
const PRICE_INPUT_COLUMNS = ['question_count', 'duration'] as const;

/**
 * ⚠️ KIRIM HANYA KOLOM YANG BENAR-BENAR DIUBAH.
 *
 * Keempat kolom ini disunting dari DUA sisi: admin lewat tab Info, peneliti
 * lewat "Ganti link" di dashboard-nya. Mengirim keempatnya padahal cuma satu
 * yang berubah membuat salinan lokal yang basi menimpa suntingan pihak lain —
 * dan `question_count`/`duration` adalah masukan harga, jadi yang tertimpa
 * bukan sekadar teks.
 *
 * ⚠️ HARGANYA IKUT DIHITUNG ULANG DI SINI, BUKAN DI PEMANGGIL.
 *
 * Dulu `recomputeOrderPrice` adalah tanggung jawab pemanggil, dan dari EMPAT
 * permukaan yang menulis masukan harga hanya SATU yang mengingatnya (tombol
 * Approve). Tiga sisanya — tab Info, `EditFormDetailsModal`,
 * `EditCriteriaModal` — menulis `question_count`/`duration`/hadiah lalu
 * berhenti, sementara `InvoiceForm` menghitung tagihan ULANG dari kolom yang
 * baru itu. Hasilnya order yang ditagih dengan tarif benar tapi mencatat harga
 * lama: 17 dari 90 order era-PPN, 12 di antaranya sudah lunas.
 *
 * Aturan pemanggil yang harus diingat adalah aturan yang akan dilupakan
 * pemanggil kelima. Jadi penulisnya sendiri yang memikulnya sekarang.
 *
 * Tidak ada masukan harga di `updates` (mis. peneliti hanya mengganti tautan
 * lewat `ReviewPhase`) → `pricing` bernilai `null` dan nol query tambahan.
 */
export const updateFormDetails = async (
  id: string,
  updates: Partial<{
    title: string;
    survey_url: string;
    question_count: number;
    duration: number;
  }>
): Promise<{ row: any; pricing: OrderPriceResult | null }> => {
  try {
    const { data, error } = await supabase
      .from('form_submissions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    const touchesPrice = PRICE_INPUT_COLUMNS.some((c) => c in updates);
    return { row: data, pricing: touchesPrice ? await recomputeOrderPrice(id) : null };
  } catch (error: any) {
    console.error('Error updating form details:', error);
    throw error;
  }
};

// Fungsi untuk mendapatkan semua form submissions (untuk internal dashboard)
// Fungsi untuk mendapatkan semua form submissions (untuk internal dashboard, deprecated for pagination)
export const getAllFormSubmissions = async () => {
  try {
    const { data, error } = await supabase
      .from('form_submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Error getting all form submissions:', error);
    throw error;
  }
};

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SHORT_ID_RE = /^[0-9a-fA-F]{8}$/;
/** Bentuk `booking_id` (sql/51): 8 karakter, alfabet tanpa `0 O 1 I L U`. */
const BOOKING_ID_RE = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

/**
 * Rentang uuid yang memuat seluruh nilai berawalan `hex` (8 hex pertama).
 *
 * Pembandingnya uuid, bukan teks, jadi HURUF BESAR/KECIL TIDAK BERPENGARUH —
 * penting karena dashboard peneliti menampilkan Booking ID dalam huruf besar
 * (`#24D76FD9`) sementara admin menampilkannya huruf kecil. Terverifikasi ke
 * PostgREST produksi 2026-08-17: kedua bentuk mengembalikan baris yang sama.
 */
const uuidPrefixRange = (hex: string): [string, string] => [
  `${hex}-0000-0000-0000-000000000000`,
  `${hex}-ffff-ffff-ffff-ffffffffffff`,
];

/**
 * Order mana yang kode-nya cocok — lewat cermin `ad_schedules`.
 *
 * ⚠️ TIGA BENTUK HARUS TETAP BISA DICARI, dan itu disengaja:
 *
 *   1. `booking_id` (sql/51)   — bentuk BARU, yang dilihat peneliti & admin
 *   2. id `form_submissions`   — Booking ID lama untuk jadwal ke-1
 *   3. id `form_submissions_extend` — Booking ID lama untuk jadwal ke-2 dst.
 *
 * Bentuk 2 & 3 sudah beredar berbulan-bulan di WhatsApp, email, dan tangkapan
 * layar; support akan menerima kutipannya lama setelah kolom baru mendarat.
 * Keduanya ditutup oleh SATU lookup ke `source_id`, karena baris ordinal 1
 * memang punya `source_id = submission_id`.
 *
 * Riwayat kenapa bentuk 3 pernah hilang sama sekali: sampai 2026-08-17 kotak
 * pencarian admin hanya mencocokkan `form_submissions.id`, jadi dari 13 Booking
 * ID jadwal lanjutan NOL yang bisa ditemukan. Peneliti mengutip kodenya, admin
 * mengetiknya, hasilnya kosong — tanpa error, cuma "tidak ada hasil", jadi
 * tidak ada yang sadar pencariannya yang salah.
 *
 * ⚠️ Bentuk 1 dan bentuk 2/3 BISA TUMPANG TINDIH. Sebuah `booking_id` yang
 * kebetulan hanya memakai karakter hex (mis. `23456789`) juga lolos
 * `SHORT_ID_RE` — sekitar 1 dari 580 kode. Karena itu keduanya TIDAK dipilih
 * salah satu: yang cocok dicari semua, lalu hasilnya digabung.
 */
const submissionIdsForBookingId = async (
  cleanCode: string,
  isFullUuid: boolean,
  isHexId: boolean
): Promise<string[]> => {
  const upper = cleanCode.toUpperCase();
  const found = new Set<string>();

  if (BOOKING_ID_RE.test(upper)) {
    const { data, error } = await supabase
      .from('ad_schedules')
      .select('submission_id')
      .eq('booking_id', upper);
    if (error) {
      console.warn('Pencarian booking_id gagal; jatuh kembali ke bentuk lama.', error);
    } else {
      for (const r of data || []) if (r.submission_id) found.add(r.submission_id);
    }
  }

  if (!isFullUuid && !isHexId) {
    return Array.from(found);
  }

  let q = supabase.from('ad_schedules').select('submission_id');

  if (isFullUuid) {
    q = q.eq('source_id', cleanCode);
  } else {
    const [lo, hi] = uuidPrefixRange(cleanCode);
    q = q.gte('source_id', lo).lte('source_id', hi);
  }

  const { data, error } = await q;

  // Cermin bermasalah tidak boleh MENJATUHKAN pencarian — ia cuma boleh
  // mengecilkannya kembali ke pencocokan id submission langsung, yaitu persis
  // perilaku sebelum perbaikan ini.
  if (error) {
    console.warn(
      'Pencarian Booking ID: lookup ad_schedules gagal, jatuh kembali ke id submission saja.',
      error
    );
    return Array.from(found);
  }

  for (const r of (data || []) as any[]) if (r.submission_id) found.add(r.submission_id);
  return Array.from(found);
};

/**
 * Berapa jadwal yang dimiliki order ini, dan berapa totalnya menurut
 * `ad_schedules` — sisi-DB dari `orderTotalOf()` (utils/orderTotals.ts).
 *
 * Dipakai oleh fungsi yang MENULIS `form_submissions.total_cost` dari input
 * tingkat-order. Kolom itu cuma menampung harga jadwal ke-1, jadi begitu sebuah
 * order punya jadwal ke-2, angka yang mereka hitung berhenti menjadi harga
 * order — dan menampilkannya sebagai "harga order" adalah cara paling mudah
 * membuat admin dan peneliti memegang dua angka berbeda.
 */
const readOrderScheduleTotals = async (
  submissionId: string
): Promise<{ count: number; total: number }> => {
  const { data, error } = await supabase
    .from('ad_schedules')
    .select('total_cost')
    .eq('submission_id', submissionId);
  if (error) throw error;
  const rows = (data || []) as { total_cost: number | null }[];
  return {
    count: rows.length,
    total: rows.reduce((sum, r) => sum + (Number(r.total_cost) || 0), 0),
  };
};

// Fungsi untuk mendapatkan form submissions dengan pagination
/**
 * Hitung ulang harga order dari kolom-kolomnya, lalu tulis
 * `total_cost/subtotal/ppn_amount`.
 *
 * ⚠️ Ada karena `updateFormDetails` menulis `question_count` TANPA menyentuh
 * ketiga kolom harga itu. Padahal InvoiceForm dan `SchedulePhase` peneliti
 * menghitung ulang dari `question_count`, jadi koreksi jumlah pertanyaan oleh
 * admin membuat peneliti melihat harga baru tanpa penjelasan sementara kolom
 * `total_cost` di daftar admin masih angka lama. Dua layar, satu order, dua
 * harga.
 *
 * Rumusnya SENGAJA dipinjam dari `convertDistributionType` alih-alih ditulis
 * ulang — versi kelima dari rumus yang sama adalah versi yang akan menyimpang
 * lebih dulu. Voucher tetap dinilai pada tanggal order LAHIR: mengoreksi jumlah
 * pertanyaan tidak boleh mencabut hak diskon yang sudah dimiliki pemesannya.
 *
 * Order LUNAS tidak pernah ditulis ulang — harganya mencatat uang yang sudah
 * masuk, dan mengubahnya membuat pembukuan berbohong.
 *
 * ⚠️ `totalCost` YANG DIKEMBALIKAN BUKAN HARGA ORDER PADA ORDER BERJADWAL
 * BANYAK. Ia harga jadwal ke-1 — satu-satunya yang muat di
 * `form_submissions.total_cost`. Jadwal ke-2 dst. dihargai terpisah lewat
 * `InvoiceForm` dan tidak ikut terhitung di rumus mana pun di atas. Karena itu
 * `orderTotal` + `scheduleCount` ikut dikembalikan: begitu `scheduleCount > 1`,
 * yang boleh dikutip ke admin adalah `orderTotal`, bukan `totalCost`.
 */
export interface OrderPriceResult {
  totalCost: number;
  subtotal: number;
  ppn: number;
  /**
   * `'paid'` = harga TIDAK ditulis ulang karena uangnya sudah masuk, dan
   * `totalCost` di atas adalah angka LAMA yang tersimpan.
   *
   * ⚠️ Pemanggil wajib mengatakannya kepada admin. Sebelum ini nilainya
   * dilewatkan diam-diam, jadi admin yang mengoreksi jumlah pertanyaan pada
   * order lunas melihat "tersimpan" dan menyimpulkan harganya ikut berubah —
   * padahal justru di situlah selisih tercatat-vs-ditagih lahir dan hanya
   * tagihan susulan yang bisa menutupnya.
   */
  skipped?: 'paid';
  /** Total SELURUH jadwal order ini sesudah tulisan di atas — lihat `readOrderScheduleTotals`. */
  orderTotal: number;
  /** >1 berarti `totalCost` di atas hanya harga jadwal ke-1, bukan harga order. */
  scheduleCount: number;
}

export const recomputeOrderPrice = async (
  submissionId: string,
  overrides: { questionCount?: number } = {}
): Promise<OrderPriceResult> => {
  const { data: sub, error: readError } = await supabase
    .from('form_submissions')
    .select('question_count, duration, winner_count, prize_per_winner, voucher_code, payment_status, submission_status, distribution_type, created_at, total_cost, subtotal, ppn_amount')
    .eq('id', submissionId)
    .single();

  if (readError) throw readError;
  if (!sub) throw new Error('Order tidak ditemukan.');

  const isPaid =
    ['paid', 'completed'].includes(sub.payment_status || '') ||
    ['paid', 'scheduled', 'live', 'completed'].includes(sub.submission_status || '');

  const questionCount = Number(overrides.questionCount ?? sub.question_count) || 0;
  const duration = Number(sub.duration) || 0;
  const winnerCount = Number(sub.winner_count) || 0;
  const prizePerWinner = Number(sub.prize_per_winner) || 0;
  const incentiveCost = calculateIncentiveCost(winnerCount, prizePerWinner);

  let subtotal: number;
  if (sub.distribution_type === 'kilat') {
    subtotal =
      calculateAdCostPerDay(questionCount) +
      getKilatAddonCost(sub.voucher_code) +
      incentiveCost;
  } else {
    const adCost = calculateTotalAdCost(questionCount, duration);
    const discount = calculateDiscount(
      sub.voucher_code, adCost, incentiveCost, duration, voucherInstantOf(sub.created_at),
    );
    subtotal = adCost + incentiveCost - discount;
  }

  const ppn = calculatePpn(subtotal);
  const totalCost = subtotal + ppn;

  if (isPaid) {
    const scoped = await readOrderScheduleTotals(submissionId);
    return {
      totalCost: Number(sub.total_cost) || 0,
      subtotal: Number(sub.subtotal) || 0,
      ppn: Number(sub.ppn_amount) || 0,
      skipped: 'paid',
      orderTotal: scoped.total,
      scheduleCount: scoped.count,
    };
  }

  const { error: writeError } = await supabase
    .from('form_submissions')
    .update({ total_cost: totalCost, subtotal, ppn_amount: ppn })
    .eq('id', submissionId);

  if (writeError) throw writeError;

  // ⚠️ DIBACA SESUDAH TULISAN, BUKAN SEBELUM. Tulisan di atas menyalakan
  // `trg_ad_schedule_from_submission`, yang memperbarui baris ordinal 1 di
  // `ad_schedules`. Membaca lebih dulu akan menjumlahkan harga LAMA jadwal ke-1
  // dengan harga baru — angka yang tidak pernah benar.
  const scoped = await readOrderScheduleTotals(submissionId);
  return { totalCost, subtotal, ppn, orderTotal: scoped.total, scheduleCount: scoped.count };
};

/** Pratinjau harga TANPA menulis apa pun — untuk dialog konfirmasi. */
export const previewOrderPrice = async (
  submissionId: string,
  questionCount: number
): Promise<number> => {
  const { data: sub, error } = await supabase
    .from('form_submissions')
    .select('duration, winner_count, prize_per_winner, voucher_code, distribution_type, created_at')
    .eq('id', submissionId)
    .single();
  if (error || !sub) throw error || new Error('Order tidak ditemukan.');

  const duration = Number(sub.duration) || 0;
  const incentiveCost = calculateIncentiveCost(
    Number(sub.winner_count) || 0,
    Number(sub.prize_per_winner) || 0,
  );
  let subtotal: number;
  if (sub.distribution_type === 'kilat') {
    subtotal = calculateAdCostPerDay(questionCount) + getKilatAddonCost(sub.voucher_code) + incentiveCost;
  } else {
    const adCost = calculateTotalAdCost(questionCount, duration);
    const discount = calculateDiscount(
      sub.voucher_code, adCost, incentiveCost, duration, voucherInstantOf(sub.created_at),
    );
    subtotal = adCost + incentiveCost - discount;
  }
  return subtotal + calculatePpn(subtotal);
};

/**
 * Berapa order yang berstatus ini — DI SELURUH DATABASE, tanpa filter bulan.
 *
 * Angka pada tab antrean dulu dihitung dari 50 baris yang kebetulan termuat,
 * jadi ia mengukur halaman, bukan pekerjaan. `head: true` membuat Postgres
 * mengembalikan hitungan tanpa satu pun baris ikut terkirim.
 */
export const countSubmissionsByStatus = async (statuses: string[]): Promise<number> => {
  try {
    const { count, error } = await supabase
      .from('form_submissions')
      .select('id', { count: 'exact', head: true })
      .in('submission_status', statuses);
    if (error) throw error;
    return count ?? 0;
  } catch (error: any) {
    console.error('Error counting submissions by status:', error);
    return 0;
  }
};

export const getFormSubmissionsPaginated = async (
  page: number,
  limit: number,
  searchQuery: string = '',
  startDate?: string,
  endDate?: string,
  ascending: boolean = false,
  /**
   * Saring `submission_status` DI SERVER, dan lewati filter bulan saat terisi.
   *
   * Antrean review adalah PEKERJAAN YANG BELUM SELESAI, bukan arsip bulan
   * tertentu. Tanpa ini, order yang masuk Juli lalu diperbaiki penelitinya hari
   * ini tidak pernah muncul lagi di layar admin: `created_at`-nya Juli, dan
   * layar default hanya memuat bulan berjalan × 50 baris — lalu menyaring
   * statusnya dari 50 baris itu saja. Perbaikan yang tidak pernah terlihat sama
   * saja dengan perbaikan yang tidak pernah terjadi.
   *
   * Alasannya sejajar dengan pengecualian pencarian ID di bawah.
   */
  statusIn?: string[]
) => {
  try {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('form_submissions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending })
      .range(from, to);

    const cleanHex = searchQuery.replace(/#/g, '').trim();
    const isFullUuid = UUID_RE.test(cleanHex);
    const isShortId = SHORT_ID_RE.test(cleanHex);
    const isBookingId = BOOKING_ID_RE.test(cleanHex.toUpperCase());
    const isHexId = isFullUuid || isShortId;
    const isIdSearch = !!searchQuery && (isHexId || isBookingId);

    if (isIdSearch) {
      const viaSchedule = await submissionIdsForBookingId(cleanHex, isFullUuid, isShortId);

      // Cabang langsung ke `form_submissions.id` hanya masuk akal untuk bentuk
      // hex — sebuah `booking_id` tidak pernah jadi awalan uuid yang sah.
      const direct = isFullUuid
        ? `id.eq.${cleanHex}`
        : isShortId
          ? (() => { const [lo, hi] = uuidPrefixRange(cleanHex); return `and(id.gte.${lo},id.lte.${hi})`; })()
          : null;

      if (viaSchedule.length > 0 && direct) {
        // Keduanya digabung, bukan dipilih salah satu: cermin menutupi jadwal
        // ke-2 dst. dan `booking_id`, sementara cabang langsung menutupi order
        // yang cerminnya belum sempat ditulis.
        query = query.or(`${direct},id.in.(${viaSchedule.join(',')})`);
      } else if (viaSchedule.length > 0) {
        query = query.in('id', viaSchedule);
      } else if (direct) {
        if (isFullUuid) {
          query = query.eq('id', cleanHex);
        } else {
          const [lo, hi] = uuidPrefixRange(cleanHex);
          query = query.gte('id', lo).lte('id', hi);
        }
      } else {
        // Bentuk booking_id yang tidak cocok apa pun. Tanpa cabang ini query
        // pulang tanpa filter dan menampilkan SELURUH order seolah semuanya
        // cocok — gagal yang jauh lebih menyesatkan daripada "tidak ada hasil".
        return { data: [], count: 0 };
      }
    } else if (searchQuery) {
      query = query.or(`title.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`);
    }

    // ⚠️ PENCARIAN ID SENGAJA MELEWATI FILTER BULAN.
    //
    // Sebuah id menunjuk tepat satu order, jadi menyaringnya lagi per bulan tidak
    // menyempitkan apa pun — ia cuma menyembunyikan. Dan yang disembunyikan
    // hampir semuanya: 985 order tersebar di 16 bulan, cuma 60 di bulan berjalan,
    // jadi ~94% pencarian id akan kosong hanya karena admin sedang membuka bulan
    // yang lain. Gagalnya sunyi dan mirip sekali dengan "order tidak ada".
    //
    // Pencarian TEKS tetap terikat bulan: di sana bulan memang menyempitkan
    // sesuatu yang bisa cocok di ratusan baris.
    const isStatusQueue = !!statusIn && statusIn.length > 0;
    if (isStatusQueue) {
      query = query.in('submission_status', statusIn!);
    }

    if (startDate && endDate && !isIdSearch && !isStatusQueue) {
      query = query.gte('created_at', startDate).lte('created_at', endDate);
    }

    const { data, error, count } = await query;

    if (error) throw error;
    return { data, count };
  } catch (error: any) {
    console.error('Error getting paginated submissions:', error);
    return { data: [], count: 0 };
  }
};

// ============= INVOICE FUNCTIONS =============

// Fungsi untuk membuat invoice baru
export const createInvoice = async (invoice: Invoice) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .insert([invoice])
      .select();

    if (error) throw error;
    return data[0];
  } catch (error) {
    console.error('Error creating invoice:', error);
    throw error;
  }
};

// Fungsi untuk mendapatkan semua invoice berdasarkan form_submission_id
export const getInvoicesByFormSubmissionId = async (formSubmissionId: string) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('form_submission_id', formSubmissionId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting invoices:', error);
    throw error;
  }
};

// Fungsi untuk update status invoice
export const updateInvoiceStatus = async (paymentId: string, status: string) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .update({ status: status })
      .eq('payment_id', paymentId)
      .select();

    if (error) throw error;
    return data[0];
  } catch (error: any) {
    console.error('Error updating invoice status:', error);
    throw error;
  }
};

// Fungsi untuk mendapatkan submissions berdasarkan auth user ID (with email fallback)
export const getFormSubmissionsByUser = async (userId: string, emailFallback?: string) => {
  try {
    // Primary: query by auth_user_id
    let { data, error } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('auth_user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fallback: also include email-matched submissions (pre-migration data without auth_user_id)
    if (emailFallback) {
      const { data: emailData } = await supabase
        .from('form_submissions')
        .select('*')
        .eq('email', emailFallback)
        .is('auth_user_id', null)
        .order('created_at', { ascending: false });

      if (emailData?.length) {
        const existingIds = new Set((data || []).map(d => d.id));
        data = [...(data || []), ...emailData.filter(d => !existingIds.has(d.id))];
      }
    }

    return data || [];
  } catch (error: any) {
    console.error('Error getting user submissions:', error);
    // Return empty array instead of throwing to prevent page crash
    return [];
  }
};

// Legacy alias — kept for backward compatibility with any external callers
export const getFormSubmissionsByEmail = async (email: string) => {
  try {
    const { data, error } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('Error getting user submissions by email:', error);
    return [];
  }
};
// ============= CHAT FUNCTIONS =============

export interface ChatSession {
  id: string;
  user_email: string;
  last_message_at: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// Get or create session for user
export const getOrCreateChatSession = async (userEmail: string) => {
  try {
    // 1. Try to find existing session
    const { data: existingSession } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_email', userEmail)
      .single();

    if (existingSession) return existingSession;

    // 2. If not found, create new
    const { data: newSession, error: createError } = await supabase
      .from('chat_sessions')
      .insert([{ user_email: userEmail }])
      .select()
      .single();

    if (createError) throw createError;
    return newSession;
  } catch (error) {
    console.error('Error in getOrCreateChatSession:', error);
    return null;
  }
};

// Get messages for a session
export const getChatMessages = async (sessionId: string) => {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting chat messages:', error);
    return [];
  }
};

// Save a new message
export const saveChatMessage = async (sessionId: string, role: 'user' | 'assistant', content: string) => {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert([{ session_id: sessionId, role, content }])
      .select()
      .single();

    if (error) throw error;

    // Update last_message_at in session (fire and forget update)
    supabase
      .from('chat_sessions')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', sessionId)
      .then();

    return data;
  } catch (error) {
    console.error('Error saving chat message:', error);
    return null;
  }
};

// Admin: Get all chat sessions (for internal dashboard)
export const getAllChatSessions = async () => {
  try {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .order('last_message_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching all chat sessions:', error);
    return [];
  }
}
// ============= SCHEDULING FUNCTIONS =============
// NOTE: scheduled_ads table is ARCHIVED. All scheduling now uses
// survey_pages (source of truth) + form_submissions (slot reservation & sync).

/**
 * Update schedule dates in both form_submissions and survey_pages (if page exists).
 * Replaces the old trigger `handle_scheduled_ad_sync`.
 */
export const updateScheduleDates = async (
  submissionId: string,
  startDate: string,
  endDate: string,
  hourWib?: number,
  minuteWib?: number
) => {
  // Pin string tanggal-saja ke instant WIB (default 15.00 WIB), tetapi biarkan
  // nilai yang sudah memuat jam & menit (ISO instant dengan 'T') tetap utuh —
  // admin boleh menyetel jam tayang non-standar lewat ScheduleForm.
  const normalize = (ds: string): string => {
    if (ds.includes('T')) {
      const d = new Date(ds);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    return toAiringStartIso(ds);
  };
  const normalizedStart = normalize(startDate);
  const normalizedEnd = normalize(endDate);

  // ⚠️ DUA TABEL, DUA TIPE — dan menyamakan nilainya justru yang bikin salah.
  //
  //   form_submissions.start_date        DATE
  //   survey_pages.publish_start_date    TIMESTAMPTZ
  //
  // Mengoper instant UTC ke kolom DATE membuat Postgres meng-cast-nya di zona
  // sesi (UTC), jadi setiap jam WIB di bawah 07.00 MUNDUR SEHARI: 12 Agu 03.00
  // WIB = 11 Agu 20.00 UTC, tersimpan sebagai `2026-08-11`. Tanggalnya karena
  // itu diturunkan lewat toWibYmd() — kalendernya WIB, bukan UTC. Kolom
  // TIMESTAMPTZ tetap menerima instant penuh supaya jamnya benar-benar tersimpan.
  const startYmdWib = toWibYmd(new Date(normalizedStart));
  const endYmdWib = toWibYmd(new Date(normalizedEnd));

  try {
    // 1. Update form_submissions (slot reservation / sync)
    //
    // ⚠️ start_date/end_date DATE tidak bisa menyimpan jam sama sekali — itulah
    // kenapa airing_hour_wib/airing_minute_wib (sql/49) ikut ditulis di sini,
    // eksplisit, bukan diselundupkan lewat instant di atas. Tanpa keduanya
    // cermin ad_schedules (dibaca halaman Schedule) tidak mungkin tahu jam
    // kustom pernah dipilih — lihat header sql/49 untuk kejadian nyatanya.
    const { error: subError } = await supabase
      .from('form_submissions')
      .update({
        start_date: startYmdWib,
        end_date: endYmdWib,
        airing_hour_wib: hourWib ?? null,
        airing_minute_wib: hourWib !== undefined ? (minuteWib ?? 0) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId);

    if (subError) throw subError;

    // 2. Sync to survey_pages — but only when this is the schedule that owns
    //    the airing window. If the survey has a later schedule, the page's
    //    publish_* window belongs to cron_activate_extends, and rewriting it
    //    from the first schedule's period takes a running ad off the air.
    // ⚠️ Filter `source_table` WAJIB. Tanpa itu baris ordinal 1 order ini
    // sendiri ikut terhitung sebagai "jadwal lain", `ownsAiringWindow` selalu
    // false, dan sinkronisasi ke survey_pages berhenti total tanpa error.
    const { data: otherSchedules, error: otherError } = await supabase
      .from('ad_schedules')
      .select('id')
      .eq('source_table', 'form_submissions_extend')
      .eq('submission_id', submissionId)
      .in('status', ['waiting_payment', 'paid', 'scheduled', 'live'])
      .limit(1);

    // Fail safe: if the check itself failed, skip the sync rather than risk
    // clobbering a live window on a guess.
    const ownsAiringWindow = !otherError && !(otherSchedules && otherSchedules.length > 0);

    if (ownsAiringWindow) {
      const { error: pageError } = await supabase
        .from('survey_pages')
        .update({ publish_start_date: normalizedStart, publish_end_date: normalizedEnd, updated_at: new Date().toISOString() })
        .eq('submission_id', submissionId);

      // pageError is non-fatal — page may not exist yet (slot_reserved stage)
      if (pageError) {
        console.warn('Could not sync dates to survey_pages (page may not exist yet):', pageError.message);
      }
    } else {
      console.info('Skipped survey_pages date sync: another schedule owns the airing window.');
    }

    return true;
  } catch (error: any) {
    console.error('Error updating schedule dates:', error);
    throw error;
  }
};

/**
 * Memindahkan satu jadwal antara kolam kuota REGULER dan TAMBAHAN.
 *
 * Lewat RPC, dan itu bukan pilihan gaya: `ad_schedules` TIDAK punya policy
 * UPDATE sama sekali (hanya SELECT untuk pemilik/admin, plus service_role).
 * Setiap tulisan dari dashboard melewati view atau trigger SECURITY DEFINER —
 * dan jadwal ordinal 1 tidak ada di view mana pun. Tanpa `set_schedule_extra_ad`
 * togglenya mustahil justru untuk jadwal PERTAMA, yang dimiliki 21 dari 21
 * order tambahan hari ini.
 *
 * Berlaku untuk SATU jadwal, tidak menular ke saudaranya. Itu memang inti
 * sql/63: sebelumnya flagnya per-order dan tidak ada cara menyatakan "jadwal
 * ke-2 ini tambahan, yang pertama reguler".
 *
 * DB menolak KERAS kalau jadwalnya Kilat. Biarkan pesannya naik apa adanya ke
 * toast: "JFU Kilat tidak punya kuota iklan tambahan" menjelaskan aturannya
 * jauh lebih baik daripada "Gagal menyimpan".
 */
export const setScheduleExtraAd = async (scheduleId: string, isExtraAd: boolean) => {
  const { error } = await supabase.rpc('set_schedule_extra_ad', {
    p_schedule_id: scheduleId,
    p_is_extra: isExtraAd,
  });
  if (error) throw error;
};

/**
 * Pindahkan jendela tayang sebuah jadwal KE-2 DST. (`form_submissions_extend`).
 *
 * Kembaran `updateScheduleDates` untuk tabel yang satunya, dan sengaja dipisah
 * alih-alih diberi cabang: keduanya berbeda di dua hal yang tidak boleh
 * tertukar.
 *
 *   1. TIPE KOLOMNYA BEDA. `form_submissions.start_date` adalah `DATE`;
 *      `form_submissions_extend.start_date` adalah `TIMESTAMPTZ`. Karena itu di
 *      sini kita menulis instant penuh jam WIB lewat `toAiringStartIso` /
 *      `toAiringEndIso`, bukan tanggal telanjang.
 *   2. TIDAK MENYENTUH `survey_pages`. Jendela publish sebuah perpanjangan
 *      dikelola `cron_activate_extends`; menulisnya dari sini akan menurunkan
 *      iklan yang sedang tayang, atau menaikkan yang belum waktunya.
 *
 * `trg_extend_no_overlap` (sql/38) tetap penjaga terakhirnya — jadwal yang
 * bertabrakan ditolak di database, bukan hanya di kalender klien.
 */
export const updateExtendScheduleDates = async (
  extendId: string,
  startYmd: string,
  durationDays: number,
  hourWib: number = 15,
  minuteWib: number = 0
) => {
  const { error } = await supabase
    .from('ad_schedules')
    .update({
      start_date: toAiringStartIso(startYmd, hourWib, minuteWib),
      end_date: toAiringEndIso(startYmd, durationDays, hourWib, minuteWib),
      updated_at: new Date().toISOString(),
    })
    .eq('source_table', 'form_submissions_extend')
    .eq('source_id', extendId);

  if (error) throw error;
  return true;
};


/**
 * Get scheduled page for a specific submission.
 * Replaces: getScheduledAdsBySubmission()
 */
export const getScheduledPageBySubmission = async (submissionId: string) => {
  try {
    const { data, error } = await supabase
      .from('survey_pages')
      .select('*')
      .eq('submission_id', submissionId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Error fetching scheduled page by submission:', error);
    return null;
  }
};

/**
 * Helper to get a string date YYYY-MM-DD from a Date object
 */
const getDateString = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/**
 * Status jadwal lanjutan yang MENAHAN slot harian — `waiting_payment`, `paid`,
 * `scheduled`, `live`: semuanya kecuali `cancelled` (tidak pernah tayang) dan
 * `completed` (sudah selesai tayang). Daftar-izin, bukan daftar-tolak, supaya
 * status baru harus diklasifikasikan dengan sengaja.
 *
 * ⚠️ SEJAK sql/52 DAFTARNYA HIDUP DI SATU TEMPAT SAJA: badan fungsi DB
 * `get_extend_slot_occupancy()`. Dulu ia juga jadi konstanta di berkas ini dan
 * dikirim sebagai filter `.in(...)`; sesudah kuota dihitung lewat RPC,
 * menyimpan salinannya di sini berarti dua tempat menulis satu aturan — pola
 * yang sudah tiga kali jadi bug di proyek ini (sql/49 vs sql/46, invoices vs
 * transactions, matchesFilter vs chipCounts). Ubah daftarnya di migrasi DB.
 */

/**
 * One airing window competing for a day's capacity, regardless of whether it
 * came from form_submissions (the first schedule) or form_submissions_extend
 * (every schedule after it). Both sources are normalised into this shape so the
 * expiry rule and the day-counting loop can only ever be written once.
 */
type SlotOccupancy = {
  id: string;
  submissionId: string;
  title: string;
  startDate: string;
  endDate: string;
  status: string;
  paymentStatus: string | null;
  slotBookedBy: string | null;
  slotReservedAt: string | null;
  /**
   * Kolam kuota jadwal INI, dari `ad_schedules.is_extra_ad` (sql/63).
   *
   * ⚠️ TIDAK ADA LAGI CADANGAN `admin_notes LIKE '[EXTRA_AD]'` di sini, dan itu
   * disengaja. Backfill sql/63 sudah menyerap penanda teks itu ke kolomnya —
   * membacanya lagi hanya bisa MENAMBAH baris yang sengaja dikeluarkan, yaitu
   * order Kilat ber-'[EXTRA_AD]'. Kilat tidak punya kolam tambahan; melemparnya
   * ke `extraCounts` membuatnya lolos dari kuota Kilat tanpa jejak.
   */
  isExtraAd: boolean;
};

/**
 * A user-booked slot that is still unpaid after an hour has lapsed and no
 * longer holds capacity. Admin-booked slots never expire.
 */
const holdsSlot = (slot: SlotOccupancy) => {
  const paymentStatus = slot.paymentStatus || 'pending';
  const isPaid = ['paid', 'completed'].includes(paymentStatus);

  if (slot.slotBookedBy === 'user' && !isPaid && slot.slotReservedAt) {
    const reservedAt = new Date(slot.slotReservedAt).getTime();
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (reservedAt < oneHourAgo) return false;
  }
  return true;
};

/**
 * Fetch slot availability for calendar components.
 * Consolidates slot-checking logic used by SchedulePaymentView (admin & user flows).
 * Also handles user-booked slots timeout (1 hour), hiding expired slots.
 *
 * Counts BOTH the first schedule and every extend. Extends used to be invisible
 * here, so a date could be sold past MAX_REGULAR_ADS_PER_DAY.
 *
 * ⚠️ KOREKSI sql/63. Catatan lama di sini berbunyi "extends carry no
 * distribution_type or is_extra_ad of their own — both are inherited from the
 * parent submission". Separuhnya masih benar (`distribution_type` memang
 * diturunkan dari induk), separuhnya TIDAK LAGI: sejak sql/63 setiap jadwal
 * memiliki `is_extra_ad`-nya sendiri, dan jadwal ke-2 sebuah order boleh
 * berbeda kolam dari jadwal pertamanya. Pewarisan tetap ada, tapi ia kini
 * cuma NILAI AWAL yang ditulis `extend_view_insert()` saat jadwal lahir —
 * bukan aturan yang berlaku selamanya.
 *
 * Kedua kakinya lewat RPC SECURITY DEFINER. Kuota harus menghitung jadwal
 * SEMUA ORANG, sementara RLS klien hanya memapar milik sendiri.
 */
export const fetchSlotAvailability = async (
  excludeSubmissionId?: string,
  distributionType: 'regular' | 'kilat' = 'regular',
  /**
   * Kecualikan SATU jadwal, bukan seluruh order.
   *
   * ⚠️ Ini yang biasanya dimaksud saat menjadwalkan ulang. `excludeSubmissionId`
   * membuang SEMUA jendela milik order itu, jadi kalender berhenti melihat
   * jadwal ke-2 order yang sama — hari yang sebenarnya sudah dipakai tampil
   * kosong, dan admin baru tahu saat `trg_submission_no_overlap` (sql/38)
   * menolak simpanannya. Cocokkan dengan `AdScheduleEntry.sourceId`: id
   * `form_submissions` untuk ordinal 1, id `form_submissions_extend` untuk
   * sisanya — persis kunci yang dipakai `SlotOccupancy.id`.
   */
  excludeSourceId?: string
): Promise<{
  regularCounts: Record<string, number>;
  extraCounts: Record<string, number>;
  details: Record<string, Array<{ id: string, title: string, isExtra: boolean, status: string }>>;
}> => {
  try {
    /*
      Kanari kueri lambat. Kalender ini menggantung >15 detik di produksi
      (2026-08-19) dan `Promise.all` membuat ketiga kakinya tidak bisa
      dibedakan: yang terlihat cuma "semuanya lambat". Ambang 3 detik dipilih
      karena statement_timeout Supabase untuk peran authenticated ada di
      bawahnya — kaki yang melewatinya berarti tidak sedang menunggu kueri,
      melainkan menunggu KONEKSI (pool habis) atau lock.
    */
    const t0 = Date.now();
    const warnIfSlow = (leg: string, startedAt: number) => {
      const ms = Date.now() - startedAt;
      if (ms > 3000) console.warn(`[slot-availability] ${leg} lambat: ${ms}ms`);
      return ms;
    };

    const [submissionsResult, extendsResult] = await Promise.all([
      // ⚠️ LEWAT RPC SEJAK sql/63, dulu SELECT langsung ke `form_submissions`.
      //
      // Pemicunya `is_extra_ad`: kolom itu hidup di `ad_schedules`, yang RLS-nya
      // membatasi peneliti ke ordernya sendiri. Saringannya IDENTIK dengan query
      // lama — termasuk pengecualian 'cancelled'/'slot_cancelled', tanpanya
      // kalender pemesanan dan papan kapasitas berselisih: admin melihat hari
      // kosong, peneliti ditolak karena penuh — dan `start_date`/`end_date`
      // tetap DATE, bukan TIMESTAMPTZ cermin, supaya tidak ada perubahan
      // perilaku tanggal yang menyelinap.
      supabase.rpc('get_submission_slot_occupancy', { p_distribution_type: distributionType }),
      // ⚠️ LEWAT RPC, BUKAN SELECT LANGSUNG — dan itu wajib sejak sql/52.
      //
      // `form_submissions_extend` kini VIEW ber-`security_invoker = true`, jadi
      // bacaannya tunduk RLS `ad_schedules`: peneliti hanya melihat jadwalnya
      // SENDIRI. Kuota slot justru harus menghitung jadwal SEMUA ORANG — dengan
      // SELECT langsung, tanggal yang sebenarnya penuh tampak kosong dan order
      // baru menembus kuota 2-per-slot. `get_extend_slot_occupancy()` SECURITY
      // DEFINER, memapar hanya kolom yang dibutuhkan kalender.
      //
      // Filter statusnya dikunci di badan fungsi DB dan harus tetap sama dengan
      // SLOT_OCCUPYING_EXTEND_STATUSES di atas — kalau salah satu berubah,
      // ubah keduanya.
      supabase.rpc('get_extend_slot_occupancy', { p_distribution_type: distributionType }),
    ]);
    warnIfSlow('get_submission_slot_occupancy + get_extend_slot_occupancy', t0);

    if (submissionsResult.error) throw submissionsResult.error;
    if (extendsResult.error) throw extendsResult.error;

    const fromSubmissions: SlotOccupancy[] = (submissionsResult.data || []).map((row: any) => ({
      id: row.id,
      submissionId: row.id,
      title: row.title || 'Untitled Ad',
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.submission_status,
      paymentStatus: row.payment_status,
      slotBookedBy: row.slot_booked_by,
      slotReservedAt: row.slot_reserved_at,
      isExtraAd: !!row.is_extra_ad,
    }));

    // `get_extend_slot_occupancy()` sudah men-JOIN induknya di dalam DB, jadi
    // `title`/`admin_notes` datang sebagai kolom datar — tidak ada lagi objek
    // tersemat PostgREST yang perlu dibongkar di sini.
    const fromExtends: SlotOccupancy[] = (extendsResult.data || []).map((row: any) => ({
      id: row.id,
      submissionId: row.submission_id,
      title: row.title || 'Untitled Ad',
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.submission_status,
      paymentStatus: row.payment_status,
      slotBookedBy: row.slot_booked_by,
      slotReservedAt: row.slot_reserved_at,
      isExtraAd: !!row.is_extra_ad,
    }));

    const activeSlots = [...fromSubmissions, ...fromExtends].filter(holdsSlot);

    const regularCounts: Record<string, number> = {};
    const extraCounts: Record<string, number> = {};
    const details: Record<string, Array<{ id: string, title: string, isExtra: boolean, status: string }>> = {};

    activeSlots.forEach((slot) => {
      // Pengecualian sengaja punya dua tingkat: per jadwal (yang sedang
      // dipindah) dan — untuk pemanggil lama — per order.
      const isExcluded =
        (excludeSourceId !== undefined && slot.id === excludeSourceId) ||
        (excludeSubmissionId !== undefined && slot.submissionId === excludeSubmissionId);
      if (slot.startDate && slot.endDate && !isExcluded) {
        const current = new Date(slot.startDate);
        current.setHours(0, 0, 0, 0);
        const endDay = new Date(slot.endDate);
        endDay.setHours(0, 0, 0, 0);

        const targetCounts = slot.isExtraAd ? extraCounts : regularCounts;

        // end-exclusive: the end date is the hand-over day, not an aired day
        while (current < endDay) {
          const dateStr = getDateString(current);
          targetCounts[dateStr] = (targetCounts[dateStr] || 0) + 1;

          if (!details[dateStr]) {
            details[dateStr] = [];
          }
          details[dateStr].push({
            id: slot.id,
            title: slot.title,
            isExtra: slot.isExtraAd,
            status: slot.status
          });

          current.setDate(current.getDate() + 1);
        }
      }
    });

    return { regularCounts, extraCounts, details };
  } catch (error) {
    console.error("Failed to fetch ads for capacity checking:", error);
    throw error;
  }
};


// ─────────────────────────────────────────────────────────────
// JFU Kilat — slot harian, penjadwalan, dan konversi jalur distribusi
// ─────────────────────────────────────────────────────────────

/** Tambah n hari ke sebuah YYYY-MM-DD tanpa melewati zona waktu sama sekali. */
const addDaysToYmd = (ymd: string, days: number): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

export interface KilatDayAvailability {
  /** jam WIB (8|11|14|17) -> berapa order sudah mengisi gelombang itu */
  byHour: Record<number, number>;
  /** order Kilat di tanggal ini yang slotnya belum ditugaskan admin */
  unassigned: number;
  details: Array<{ id: string; title: string; hour: number | null; status: string }>;
}

/**
 * Ketersediaan slot Kilat per tanggal, untuk grid penjadwalan admin.
 *
 * Kenapa tidak memakai fetchSlotAvailability: fungsi itu menghitung kapasitas
 * HARIAN sepanjang jendela tayang multi-hari. Kilat bukan itu — satu order
 * menempati satu gelombang push selama ~2 jam pada satu tanggal, dan kuotanya
 * per-gelombang, bukan per-hari.
 *
 * Perpanjangan (form_submissions_extend) sengaja tidak dihitung: sebuah extend
 * tidak punya kilat_slot_hour sendiri, jadi ia tidak bisa ditempatkan di
 * gelombang mana pun. Kilat juga tidak dijual sebagai tayangan yang diperpanjang.
 *
 * Aturan kedaluwarsa 1 jam untuk reservasi user yang belum bayar dipakai ulang
 * dari holdsSlot(), supaya jalur Kilat dan regular tidak pernah berbeda pendapat
 * soal kapan sebuah reservasi berhenti memegang kapasitas.
 */
export const fetchKilatSlotAvailability = async (
  excludeSubmissionId?: string
): Promise<Record<string, KilatDayAvailability>> => {
  const { data, error } = await supabase
    .from('form_submissions')
    .select('id, title, start_date, kilat_slot_hour, submission_status, payment_status, slot_booked_by, slot_reserved_at')
    .eq('distribution_type', 'kilat')
    .not('start_date', 'is', null)
    .not('submission_status', 'in', '("rejected","spam","in_review","completed")');

  if (error) throw error;

  const byDate: Record<string, KilatDayAvailability> = {};

  (data || []).forEach((row: any) => {
    if (row.id === excludeSubmissionId) return;

    const holds = holdsSlot({
      id: row.id,
      submissionId: row.id,
      title: row.title || 'Untitled Ad',
      startDate: row.start_date,
      endDate: row.start_date,
      status: row.submission_status,
      paymentStatus: row.payment_status,
      slotBookedBy: row.slot_booked_by,
      slotReservedAt: row.slot_reserved_at,
      // Kilat, jadi selalu false — sql/63 menjadikannya jaminan skema, bukan
      // sekadar kebiasaan: Kilat tidak punya kolam iklan tambahan.
      isExtraAd: false,
    });
    if (!holds) return;

    // start_date bertipe DATE, jadi PostgREST mengembalikan 'YYYY-MM-DD' apa
    // adanya. Kalau suatu saat ia membawa jam, potong ke tanggalnya saja —
    // jangan lewat new Date(), yang akan menggeser hari di zona non-UTC.
    const ymd = String(row.start_date).slice(0, 10);
    if (!byDate[ymd]) {
      byDate[ymd] = { byHour: {}, unassigned: 0, details: [] };
    }

    const hour = row.kilat_slot_hour == null ? null : Number(row.kilat_slot_hour);
    if (hour === null) {
      byDate[ymd].unassigned += 1;
    } else {
      byDate[ymd].byHour[hour] = (byDate[ymd].byHour[hour] || 0) + 1;
    }

    byDate[ymd].details.push({
      id: row.id,
      title: row.title || 'Untitled Ad',
      hour,
      status: row.submission_status,
    });
  });

  return byDate;
};

/**
 * Simpan jadwal Kilat: satu tanggal + satu gelombang push.
 *
 * SENGAJA TIDAK lewat updateScheduleDates(). Fungsi itu memaku setiap jendela ke
 * 15.00 WIB dan menyinkronkan survey_pages.publish_* — dua-duanya benar untuk
 * iklan regular dan dua-duanya salah untuk Kilat, yang tayang di jamnya sendiri
 * dan tidak punya halaman sama sekali (lihat guard di sql/42).
 *
 * start_date/end_date tetap diisi supaya order Kilat tetap terbaca oleh semua
 * yang sudah ada (daftar jadwal, pengecekan overlap sql/38, ad_schedules).
 * Jendela sehari [d, d+1) mengikuti apa yang sudah ditulis StepCheckout untuk
 * Kilat — jam sebenarnya hidup di kilat_slot_hour.
 */
export const updateKilatSchedule = async (
  submissionId: string,
  ymd: string,
  hour: number
) => {
  const { error } = await supabase
    .from('form_submissions')
    .update({
      start_date: ymd,
      end_date: addDaysToYmd(ymd, 1),
      kilat_slot_hour: hour,
      slot_booked_by: 'admin',
      slot_reserved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId);

  if (error) throw error;

  // Jangan pernah menurunkan status order yang sudah lunas kembali ke
  // 'slot_reserved' — pola yang sama dipakai handleBookSchedule untuk regular.
  const { data: fresh } = await supabase
    .from('form_submissions')
    .select('payment_status')
    .eq('id', submissionId)
    .single();

  if (!fresh || !['paid', 'completed'].includes(fresh.payment_status)) {
    await updateFormStatus(submissionId, 'slot_reserved');
  }

  return true;
};

/**
 * Pindahkan sebuah order antara jalur iklan regular dan JFU Kilat.
 *
 * Ini jembatan admin untuk user yang terlanjur submit sebagai iklan biasa lalu
 * ingin pindah ke Kilat. Empat hal terjadi sekaligus, dan semuanya harus terjadi
 * bersama supaya tidak ada keadaan setengah jalan:
 *
 *   1. Reservasi lama DILEPAS. Ini inti konversinya — slot iklan regular harus
 *      kembali ke pool, bukan dipegang order yang sudah pindah jalur. Admin
 *      memilih slot barunya lewat KilatScheduleStep sesudah ini.
 *   2. Halaman iklan lama DIHAPUS kalau menuju Kilat. Kilat tidak pernah punya
 *      halaman (guard di sql/42's ensure_survey_page mencegahnya terbit
 *      otomatis) — tapi guard itu tidak berlaku surut ke halaman yang sudah ada
 *      dari saat order ini masih regular. Pola nyata yang pernah terjadi:
 *      admin meng-unpublish halaman regular yang sudah terlanjur terbit
 *      (supaya lolos blokir #4 di bawah), lalu konversi — tanpa baris ini,
 *      halaman yang sudah di-unpublish itu tertinggal yatim piatu selamanya,
 *      menempel ke order yang sudah bukan pemiliknya (insiden nyata
 *      2026-08-04, order e9cb5944-...).
 *   3. Harga DIHITUNG ULANG dengan rumus jalur tujuan. Rumus Kilat identik
 *      dengan salinan otoritatif di functions/api/doku/create-payment.js: base
 *      rate 1× (tanpa pengali durasi) + add-on + insentif, TANPA diskon voucher.
 *   4. Status review hanya diturunkan ke 'approved' kalau order belum lunas.
 *
 * `duration` sengaja tidak diubah. Kilat mengabaikannya, dan menimpanya akan
 * menghapus jejak pesanan asli kalau admin membatalkan konversi.
 *
 * DUA penolakan keras. Yang pertama: order yang punya jadwal ke-2 — alasannya
 * ditulis panjang di badan fungsi, intinya konversi berlingkup satu jadwal
 * sementara ordernya tidak. Yang kedua: halaman iklan yang MASIH published. Order itu
 * sedang tayang di feed aplikasi Jakpat, dan memindahkannya diam-diam ke Kilat
 * meninggalkan kartu iklan hidup untuk order yang tidak lagi membayarnya. Kalau
 * halamannya sudah di-unpublish (draft), konversi boleh jalan — dan baris #2
 * di atas yang membersihkannya, bukan admin secara manual.
 */
export const convertDistributionType = async (
  submissionId: string,
  target: 'regular' | 'kilat'
): Promise<{ totalCost: number; subtotal: number; ppn: number }> => {
  // Baca ulang dari DB — props di dashboard bisa basi beberapa menit.
  const { data: sub, error: readError } = await supabase
    .from('form_submissions')
    .select('question_count, duration, winner_count, prize_per_winner, voucher_code, payment_status, submission_status, created_at')
    .eq('id', submissionId)
    .single();

  if (readError) throw readError;
  if (!sub) throw new Error('Order tidak ditemukan.');

  // ⚠️ PENOLAKAN KEDUA: order yang punya jadwal ke-2 tidak boleh dikonversi.
  //
  // Tiga hal di bawah bekerja pada asumsi "satu order = satu jadwal", dan
  // semuanya rusak diam-diam begitu ada ordinal ≥2:
  //
  //   * `total_cost/subtotal/ppn_amount` ditulis dari input tingkat-order, jadi
  //     yang tersimpan hanya harga jadwal ke-1 — harga jadwal lanjutan tidak
  //     pernah masuk rumus mana pun di sini;
  //   * `start_date`/`end_date` dikosongkan untuk melepas reservasi. Di
  //     `sync_ad_schedule_from_submission()` (sql/49) `start_date IS NULL`
  //     berarti HAPUS baris cermin ordinal 1 — sementara baris ordinal ≥2 tetap
  //     berdiri, kini menempel ke order yang jadwal pertamanya sudah lenyap;
  //   * rumus Kilat tidak mengenal perpanjangan sama sekali (lihat pagar yang
  //     sama di `SchedulePaymentTab`), jadi jadwal lanjutan akan tertinggal
  //     dengan harga jalur lama pada order berjalur baru.
  //
  // Menolaknya di sini, bukan di UI: ini satu-satunya pintu, dan penolakan yang
  // hidup di tombol selalu bisa dilewati pemanggil berikutnya.
  const scoped = await readOrderScheduleTotals(submissionId);
  if (scoped.count > 1) {
    throw new Error(
      `Order ini punya ${scoped.count} jadwal iklan, jadi jalur distribusinya tidak bisa dipindahkan. ` +
      'Konversi menghitung ulang harga dan melepas reservasi untuk SATU jadwal saja — ' +
      'jadwal lanjutannya akan tertinggal dengan harga jalur lama. ' +
      'Batalkan dulu jadwal lanjutannya kalau order ini memang harus pindah jalur.'
    );
  }

  const { data: page } = await supabase
    .from('survey_pages')
    .select('is_published')
    .eq('submission_id', submissionId)
    .maybeSingle();

  if (page?.is_published) {
    throw new Error(
      'Halaman iklan order ini sudah published — tarik atau sembunyikan halamannya dulu sebelum memindahkan jalur distribusi.'
    );
  }

  // Kilat tidak pernah punya halaman iklan. Kalau ada baris survey_pages di
  // sini, ia pasti draft (published sudah diblokir barusan) — sisa dari saat
  // order ini masih regular. Hapus sebelum menulis distribution_type, supaya
  // tidak ada jendela di mana order ini sudah 'kilat' tapi masih tercatat
  // punya halaman.
  if (target === 'kilat' && page) {
    const { error: deletePageError } = await supabase
      .from('survey_pages')
      .delete()
      .eq('submission_id', submissionId);
    if (deletePageError) throw deletePageError;
  }

  const questionCount = Number(sub.question_count) || 0;
  const duration = Number(sub.duration) || 0;
  const winnerCount = Number(sub.winner_count) || 0;
  const prizePerWinner = Number(sub.prize_per_winner) || 0;
  const incentiveCost = calculateIncentiveCost(winnerCount, prizePerWinner);

  let subtotal: number;
  if (target === 'kilat') {
    subtotal =
      calculateAdCostPerDay(questionCount) +
      getKilatAddonCost(sub.voucher_code) +
      incentiveCost;
  } else {
    const adCost = calculateTotalAdCost(questionCount, duration);
    // Voucher dinilai pada tanggal order lahir: memindahkan jalur distribusi
    // tidak boleh mencabut hak diskon yang sudah dimiliki pemesannya.
    const discount = calculateDiscount(
      sub.voucher_code, adCost, incentiveCost, duration, voucherInstantOf(sub.created_at),
    );
    subtotal = adCost + incentiveCost - discount;
  }

  const ppn = calculatePpn(subtotal);
  const totalCost = subtotal + ppn;

  const isPaid =
    ['paid', 'completed'].includes(sub.payment_status || '') ||
    ['paid', 'scheduled', 'live', 'completed'].includes(sub.submission_status || '');

  const updateData: Record<string, any> = {
    distribution_type: target,
    total_cost: totalCost,
    subtotal,
    ppn_amount: ppn,
    // Lepas reservasi lama: slot jalur asal kembali ke pool.
    start_date: null,
    end_date: null,
    kilat_slot_hour: null,
    slot_booked_by: null,
    slot_reserved_at: null,
    updated_at: new Date().toISOString(),
  };

  // Tanpa jadwal, 'slot_reserved'/'waiting_payment' jadi bohong. Order lunas
  // tidak pernah diturunkan — statusnya mencatat uang yang sudah masuk.
  if (!isPaid && ['slot_reserved', 'waiting_payment'].includes(sub.submission_status || '')) {
    updateData.submission_status = 'approved';
  }

  const { error: writeError } = await supabase
    .from('form_submissions')
    .update(updateData)
    .eq('id', submissionId);

  if (writeError) throw writeError;

  return { totalCost, subtotal, ppn };
};

export interface KilatScheduleEntry {
  id: string;
  title: string;
  researcherName: string;
  hour: number | null;
  ymd: string;
  submissionStatus: string;
  paymentStatus: string | null;
  createdAt: string;
}

/**
 * Semua order Kilat pada rentang tanggal [fromYmd, toYmd] (inklusif), untuk
 * papan jadwal admin (KilatScheduleBoard). Beda dengan fetchKilatSlotAvailability
 * di atas: fungsi itu menghitung KAPASITAS (makanya membuang 'completed' dan
 * tidak dibatasi tanggal); ini menampilkan RIWAYAT satu minggu (makanya
 * 'completed' ikut, supaya minggu yang sudah lewat tidak kosong melompong).
 * Jangan menyatukan keduanya — filter yang berbeda ini sengaja; mengubah salah
 * satu tanpa yang lain akan menggeser diam-diam matematika kuota di
 * KilatScheduleStep.
 */
export const fetchKilatSchedule = async (
  fromYmd: string,
  toYmd: string
): Promise<KilatScheduleEntry[]> => {
  const { data, error } = await supabase
    .from('form_submissions')
    .select('id, title, full_name, start_date, kilat_slot_hour, submission_status, payment_status, slot_booked_by, slot_reserved_at, created_at')
    .eq('distribution_type', 'kilat')
    .gte('start_date', fromYmd)
    .lte('start_date', toYmd)
    .not('start_date', 'is', null)
    .not('submission_status', 'in', '("rejected","spam")');

  if (error) throw error;

  return (data || [])
    .filter((row: any) => holdsSlot({
      id: row.id,
      submissionId: row.id,
      title: row.title || 'Untitled Ad',
      startDate: row.start_date,
      endDate: row.start_date,
      status: row.submission_status,
      paymentStatus: row.payment_status,
      slotBookedBy: row.slot_booked_by,
      slotReservedAt: row.slot_reserved_at,
      // Kilat, jadi selalu false — sql/63 menjadikannya jaminan skema, bukan
      // sekadar kebiasaan: Kilat tidak punya kolam iklan tambahan.
      isExtraAd: false,
    }))
    .map((row: any) => ({
      id: row.id,
      title: row.title || 'Untitled Ad',
      researcherName: row.full_name || 'Unknown',
      hour: row.kilat_slot_hour == null ? null : Number(row.kilat_slot_hour),
      ymd: String(row.start_date).slice(0, 10),
      submissionStatus: row.submission_status,
      paymentStatus: row.payment_status,
      createdAt: row.created_at,
    }));
};

/**
 * Kanari untuk regresi sql/40: order Kilat seharusnya TIDAK PERNAH punya baris
 * survey_pages (lihat sql/42_kilat_slots.sql). Kalau ini > 0, sql/40 kemungkinan
 * besar dijalankan ulang sesudah sql/42 dan mengembalikan definisi lama
 * ensure_survey_page() yang tidak memeriksa distribution_type.
 */
export const countKilatPagesLeak = async (): Promise<number> => {
  const { count, error } = await supabase
    .from('survey_pages')
    .select('id, form_submissions!inner(distribution_type)', { count: 'exact', head: true })
    .eq('form_submissions.distribution_type', 'kilat');
  if (error) {
    console.error('Gagal cek kebocoran halaman Kilat:', error);
    return 0;
  }
  return count || 0;
};


/**
 * Release a user-booked slot that has expired due to 1-hour timeout.
 * Also marks payment as expired and expires pending transactions.
 * DOKU payments auto-expire via payment_due_date — no manual link closure needed.
 */
export const releaseExpiredSlot = async (submissionId: string) => {
  try {
    // Guard: don't release if payment was already completed (race condition
    // between DOKU webhook and the 1-hour client-side timer).
    const { data: current } = await supabase
      .from('form_submissions')
      .select('payment_status')
      .eq('id', submissionId)
      .single();

    if (current && ['paid', 'completed'].includes(current.payment_status)) {
      console.log(`Slot release skipped for ${submissionId}: payment already '${current.payment_status}'`);
      return true;
    }

    // 1. Clear slot data and mark payment as expired in form_submissions
    const { error: subError } = await supabase
      .from('form_submissions')
      .update({
        start_date: null,
        end_date: null,
        slot_booked_by: null,
        slot_reserved_at: null,
        submission_status: 'slot_reserved',
        payment_status: 'expired',
        updated_at: new Date().toISOString()
      })
      .eq('id', submissionId);

    if (subError) throw subError;

    // 2. Mark all pending transactions as expired
    const { data: pendingTxs } = await supabase
      .from('transactions')
      .select('id')
      .eq('form_submission_id', submissionId)
      .eq('status', 'pending');

    if (pendingTxs && pendingTxs.length > 0) {
      await supabase
        .from('transactions')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .in('id', pendingTxs.map(t => t.id));
    }

    // 3. Try to clear publish_start_date, publish_end_date in survey_pages (non-fatal if missing)
    await supabase
      .from('survey_pages')
      .update({
        publish_start_date: null,
        publish_end_date: null,
        updated_at: new Date().toISOString()
      })
      .eq('submission_id', submissionId);

    return true;
  } catch (error) {
    console.error("Failed to release expired slot:", error);
    throw error;
  }
};

/**
 * Batalkan SATU jadwal atas keputusan admin — dan SIMPAN tanggalnya.
 *
 * Berlingkup satu baris jadwal, bukan satu order. Untuk order berjadwal satu
 * keduanya identik; untuk order berjadwal banyak, `releaseExpiredSlot` akan
 * ikut mematikan tagihan jadwal lain.
 *
 * ⚠️ TANGGALNYA SENGAJA DIPERTAHANKAN — INI PERUBAHAN DARI VERSI SEBELUMNYA.
 *
 * Versi lama MENGOSONGKAN `start_date`/`end_date` dan menyimpan larangan
 * panjang di sini: menulis 'cancelled' katanya mustahil karena
 * `airing_status_of()` (sql/46) memetakannya jadi 'requested', sehingga jadwal
 * yang dibatalkan tampak seperti permintaan aktif. Larangan itu BENAR saat
 * ditulis dan sudah TIDAK berlaku sejak `sql/62`: sumbu tayang kini punya
 * `slot_cancelled` sendiri, terpisah dari `'cancelled'`. (sql/69 kemudian
 * memberi `'cancelled'` sebuah cabang sendiri juga, jadi larangan itu tidak
 * berlaku untuk nilai mana pun sekarang.)
 *
 * Mengosongkan tanggal memang membebaskan kuota, tapi dengan ongkos yang baru
 * terasa belakangan: RIWAYATNYA IKUT TERHAPUS. Tidak ada lagi cara menjawab
 * "jadwal mana yang kami batalkan, dan untuk tanggal apa" — padahal itu
 * pertanyaan pertama yang muncul saat peneliti menghubungi bantuan. Sekarang
 * tanggalnya tinggal; yang membebaskan kuota adalah STATUSNYA, lewat
 * `occupiesSlot()` yang mengecualikan chip 'cancelled'.
 *
 * ⚠️ Kosakata sumbernya beda, dan itu disengaja (lihat kepala sql/62):
 *   ordinal 1 → `form_submissions.submission_status = 'slot_cancelled'`
 *   ordinal ≥2 → `form_submissions_extend.submission_status = 'cancelled'`
 * Keduanya mendarat sebagai `ad_schedules.status = 'cancelled'` — satu konsep,
 * satu representasi, di tabel yang dibaca semua layar.
 *
 * Penautan jadwal→pembayaran memakai aturan yang sama dengan `fetchScheduleBilling`:
 * `entity_type = 'extend'` + `extend_id` untuk ordinal ≥2, sisanya milik ordinal 1.
 */
/**
 * Kenapa UPDATE ini menyentuh nol baris?
 *
 * ⚠️ ADA KARENA "0 BARIS" PUNYA DUA SEBAB YANG SANGAT BERBEDA, dan selama
 * keduanya memakai kalimat yang sama, yang satu menyamar jadi yang lain.
 * Penjaga `.not('payment_status','in',…)` memang bisa menahan baris yang
 * BARUSAN lunas — itu sebab yang sah. Tapi RLS yang menolak juga pulang "0
 * baris cocok", tanpa error, dan selama berhari-hari pesan "jadwal ini sudah
 * lunas atau sudah dibatalkan" menutupi kenyataan bahwa `ad_schedules` tidak
 * punya policy UPDATE sama sekali (sql/78).
 *
 * SELECT selalu diizinkan, jadi barisnya bisa dibaca ulang dan ditanya: apakah
 * ia benar-benar sudah lunas/dibatalkan? Kalau TIDAK, penolakannya bukan soal
 * keadaan — dan kalimatnya harus mengatakan itu, bukan menebak.
 */
async function explainNoRowsCancelling(
  table: 'ad_schedules' | 'form_submissions',
  filter: (q: any) => any,
  subject: string,
): Promise<string> {
  try {
    const { data } = await filter(
      supabase.from(table).select(
        table === 'ad_schedules' ? 'status, payment_status' : 'submission_status, payment_status',
      ),
    ).limit(1);
    const row: any = Array.isArray(data) && data.length > 0 ? data[0] : null;

    if (!row) return `${subject} tidak ditemukan. Muat ulang dulu.`;

    if (['paid', 'completed'].includes(row.payment_status || '')) {
      return `${subject} sudah lunas — tidak bisa dibatalkan dari sini.`;
    }
    const state = row.status ?? row.submission_status;
    if (['cancelled', 'slot_cancelled'].includes(state || '')) {
      return `${subject} sudah dibatalkan. Muat ulang dulu.`;
    }

    // Barisnya ada, belum lunas, belum dibatalkan — jadi bukan keadaannya yang
    // menolak. Sisa tersangkanya izin tulis.
    return `${subject} masih bisa dibatalkan, tapi perubahannya DITOLAK database `
      + `(kemungkinan policy RLS pada \`${table}\`). Ini bug, bukan keadaan order — laporkan.`;
  } catch {
    return `${subject} gagal dibatalkan dan sebabnya tidak bisa dipastikan. Muat ulang dulu.`;
  }
}

export const cancelSchedule = async (entry: {
  submissionId: string;
  sourceId: string;
  isExtension: boolean;
  paymentStatus: string | null;
  /**
   * `ad_schedules.id`. Opsional demi pemanggil lama, tapi TANPA-nya blok
   * `invoices` di bawah tidak bisa membedakan tagihan jadwal ini dari anggota
   * lain sebuah tagihan gabungan — lihat catatannya di sana. Seluruh pemanggil
   * hari ini mengoper `AdScheduleEntry` utuh, jadi ia selalu ada.
   */
  id?: string;
}) => {
  // Penjaga yang sama dengan releaseExpiredSlot: yang sudah lunas tidak
  // pernah dilepas dari sini, apa pun yang diklik admin.
  if (['paid', 'completed'].includes(entry.paymentStatus || '')) {
    throw new Error('Jadwal yang sudah lunas tidak bisa dibatalkan dari sini.');
  }

  // ⚠️ Penjaga lunas diulang DI DALAM query, bukan cuma dari `entry` yang bisa
  // basi: pembayaran bisa mendarat lewat webhook DOKU tepat saat admin mengklik.
  // Nol baris terpengaruh = ada yang lebih dulu, dan kita berhenti tanpa
  // mematikan tagihan siapa pun. Pola yang sama dipakai `rebookSlotForSubmission`.
  const unpaidOnly = '("paid","completed")';

  if (entry.isExtension) {
    // `ad_schedules.status` MEMANG kosakata sumbu tayang, jadi 'cancelled'
    // langsung tepat — dulu ini ditulis lewat view sebagai `submission_status`,
    // dan mirror-nya meneruskannya apa adanya ke kolom yang sama ini.
    const { data, error } = await supabase
      .from('ad_schedules')
      .update({
        status: 'cancelled',
        // Tanggal TETAP. Yang dilepas adalah tahanannya, bukan riwayatnya.
        slot_booked_by: null,
        slot_reserved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('source_table', 'form_submissions_extend')
      .eq('source_id', entry.sourceId)
      .not('payment_status', 'in', unpaidOnly)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(await explainNoRowsCancelling(
        'ad_schedules',
        (q) => q.eq('source_table', 'form_submissions_extend').eq('source_id', entry.sourceId),
        'Jadwal ini',
      ));
    }
  } else {
    const { data, error } = await supabase
      .from('form_submissions')
      .update({
        // `slot_cancelled`, BUKAN `cancelled` — dua peristiwa yang berbeda.
        // `cancelled` membatalkan SELURUH ORDER: sumbu review-nya ikut mati.
        // `slot_cancelled` cuma melepas SLOTNYA; sql/62 §2 sengaja menjaga
        // sumbu review tetap 'approved', karena membatalkan slot tidak
        // membatalkan persetujuan kuesionernya. Melipat keduanya membuat
        // laporan tidak bisa lagi memisahkan "order ini dihentikan" dari
        // "jadwalnya kami lepas, ordernya masih hidup".
        submission_status: 'slot_cancelled',
        payment_status: 'expired',
        // Tanggal TETAP — lihat kepala fungsi.
        slot_booked_by: null,
        slot_reserved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entry.submissionId)
      .not('payment_status', 'in', unpaidOnly)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(await explainNoRowsCancelling(
        'form_submissions',
        (q) => q.eq('id', entry.submissionId),
        'Order ini',
      ));
    }

    // Halaman iklan ikut kehilangan jendela terbitnya — hanya untuk ordinal 1,
    // karena hanya jadwal pertama yang memilikinya secara langsung.
    await supabase
      .from('survey_pages')
      .update({
        publish_start_date: null,
        publish_end_date: null,
        updated_at: new Date().toISOString(),
      })
      .eq('submission_id', entry.submissionId);
  }

  // Transaksi pending MILIK JADWAL INI saja.
  const { data: txs } = await supabase
    .from('transactions')
    .select('id, entity_type, extend_id')
    .eq('form_submission_id', entry.submissionId)
    .eq('status', 'pending');

  const mine = (txs || []).filter((tx) => {
    const owner = tx.entity_type === 'extend' && tx.extend_id ? tx.extend_id : entry.submissionId;
    return owner === entry.sourceId;
  });

  if (mine.length > 0) {
    const { error } = await supabase
      .from('transactions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .in('id', mine.map((t) => t.id))
      /*
        ⚠️ `.eq('status','pending')` MENGULANG SYARAT SELECT DI ATAS, DAN ITU
        BUKAN KEMUBAZIRAN. Antara SELECT dan UPDATE ini ada jendela nyata:
        webhook DOKU boleh mendarat di sela keduanya dan membalik barisnya jadi
        `completed`. Tanpa penjaga ini, pembatalan jadwal menimpanya kembali
        jadi `expired` — uang yang sungguh diterima kalah oleh status di layar,
        persis kebalikan dari aturan yang dipegang seluruh berkas ini.

        Blok `invoices` di bawah sudah memakai penjaga yang sama sejak awal;
        asimetri dalam satu fungsi yang sama adalah kelalaian, bukan desain.
      */
      .eq('status', 'pending');
    if (error) throw error;
  }

  // ⚠️ `invoices` IKUT DIMATIKAN — sebelumnya TIDAK, dan itu meninggalkan
  // tagihan hantu. Satu tagihan hidup di DUA tabel; melewatkan satu membuat
  // barisnya bertahan `pending` selamanya walau slotnya sudah dilepas.
  // Kelas bug yang sama dengan `payment_method` di markScheduleAsPaid: satu
  // konsep, dua tabel, hanya satu diperbarui.
  //
  // Penautannya lewat `payment_id` transaksi yang baru saja di-expire, bukan
  // `schedule_id` — supaya HANYA tagihan yang benar-benar berpasangan dengan
  // percobaan bayar ini yang tersentuh.
  if (mine.length > 0) {
    const { data: pids } = await supabase
      .from('transactions').select('payment_id').in('id', mine.map((t) => t.id));
    const paymentIds = (pids || []).map((r: any) => r.payment_id).filter(Boolean);
    if (paymentIds.length > 0) {
      const q = supabase
        .from('invoices')
        .update({ status: 'expired' })
        .in('payment_id', paymentIds)
        .eq('status', 'pending');
        /*
          ⚠️ `payment_id` SAJA TIDAK LAGI BERARTI "TAGIHAN JADWAL INI".
          Sejak tagihan gabungan, satu `payment_id` boleh menaungi N pesanan —
          jadi filter lama mematikan baris invoice milik pesanan LAIN sementara
          baris `transactions` mereka (yang disaring `mine` di atas) tetap
          `pending`. Satu tagihan hidup di dua tabel; mematikan separuhnya
          meninggalkan grup dalam keadaan yang tidak bisa dijelaskan layar mana
          pun.

          `schedule_id` NULL sengaja ikut lolos: baris pra-sql/51 tidak pernah
          punya kolom itu terisi, dan menyaringnya habis akan menghidupkan lagi
          tagihan hantu yang blok ini justru ada untuk menutup.
        */
      const scoped = entry.id
        ? q.or(`schedule_id.eq.${entry.id},schedule_id.is.null`)
        : q;
      const { error } = await scoped;
      if (error) throw error;
    }
  }

  return true;
};

/**
 * Kunci ulang slot untuk order yang SUDAH ada, tanpa membuat baris baru.
 *
 * Ini pasangan dari `releaseExpiredSlot`: dipakai saat jendela pembayaran habis
 * dan user memilih tanggal lain langsung di halaman pembayaran. Sebelumnya
 * pemulihan itu harus lewat `prepareForReschedule` + draft localStorage +
 * lempar balik ke wizard — jalur yang dulu memicu insiden survei tertimpa,
 * karena niat reschedule bisa tertinggal di draft dan mengenai order lain.
 * Di sini id-nya eksplisit, jadi tidak ada yang bisa salah sasaran.
 *
 * `guard_payment_columns()` mengizinkan transisi non-admin antar
 * slot_reserved / approved / waiting_payment, dan payment_status → 'pending'.
 * Filter `payment_status` di bawah menutup lomba dengan webhook DOKU: order
 * yang ternyata sudah lunas tidak boleh dijadwalkan ulang diam-diam.
 */
export const rebookSlotForSubmission = async (
  submissionId: string,
  startYmd: string,
  durationDays: number
) => {
  const { data, error } = await supabase
    .from('form_submissions')
    .update({
      start_date: toAiringStartIso(startYmd),
      end_date: toAiringEndIso(startYmd, Math.max(durationDays, 1)),
      slot_booked_by: 'user',
      slot_reserved_at: new Date().toISOString(),
      submission_status: 'waiting_payment',
      payment_status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .not('payment_status', 'in', '("paid","completed")')
    // ⚠️ PENJAGA TRACK B2 — jadwal yang DIBATALKAN ADMIN tidak boleh dihidupkan
    // kembali oleh peneliti.
    //
    // `cancelSchedule()` menulis `submission_status = 'slot_cancelled'` dan
    // `payment_status = 'expired'`. Filter `payment_status` di atas TIDAK
    // menangkapnya — 'expired' bukan 'paid'/'completed' — jadi sampai sekarang
    // tombol "Jadwalkan Ulang" di dashboard peneliti membatalkan keputusan
    // admin tanpa satu pun peringatan ke siapa pun.
    .neq('submission_status', 'slot_cancelled')
    .select('id');

  if (error) throw error;
  if (!data || data.length === 0) {
    // Nol baris di PostgREST tidak memunculkan error — inilah cara "berhasil
    // palsu" lahir. Dilempar supaya UI tidak bisa menampilkan sukses semu.
    throw new Error(
      `Slot untuk ${submissionId} tidak bisa dikunci ulang — kemungkinan sudah lunas, ` +
      'jadwalnya dibatalkan tim Jakpat, atau ditolak RLS.'
    );
  }
  return true;
};

/**
 * Prepare a submission for reschedule by user.
 * This resets the slot and payment state while preserving the survey data.
 * Unlike releaseExpiredSlot, this keeps the submission active for editing.
 * 
 * Status is set to 'approved' because:
 * - The form has already been approved (either auto or by admin)
 * - The slot is now available for re-booking
 * - This is semantically correct: approved but not yet scheduled
 */
export const prepareForReschedule = async (submissionId: string) => {
  try {
    // 1. Clear slot data and reset payment status to pending
    // Status becomes 'approved' (form approved, slot cleared, ready for re-booking)
    const { data: subData, error: subError } = await supabase
      .from('form_submissions')
      .update({
        start_date: null,
        end_date: null,
        slot_booked_by: null,
        slot_reserved_at: null,
        submission_status: 'approved',
        payment_status: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', submissionId)
      // Penjaga yang sama dengan `rebookSlotForSubmission` (Track B2). Keduanya
      // pintu jadwal-ulang milik peneliti, jadi keduanya harus menolak hal yang
      // sama — kalau hanya satu yang dijaga, yang lain jadi jalan memutarnya.
      .neq('submission_status', 'slot_cancelled')
      .select('id');

    if (subError) throw subError;
    // ⚠️ Fungsi ini SEBELUMNYA tidak memeriksa apa pun sesudah update — nol
    // `.select()`, nol pemeriksaan baris. Jadi penolakan RLS maupun penjaga di
    // atas akan lewat sebagai sukses, dan peneliti dibawa ke wizard untuk
    // menjadwalkan ulang order yang tidak pernah benar-benar dilepas.
    if (!subData || subData.length === 0) {
      throw new Error(
        'Order ini tidak bisa dijadwalkan ulang — jadwalnya dibatalkan tim Jakpat, ' +
        'atau perubahannya ditolak. Hubungi Mimin kalau ini tidak sesuai harapan.'
      );
    }

    // 2. Matikan tagihan yang menggantung — HANYA milik jadwal yang dipindah.
    //
    // ⚠️ DULU BERLINGKUP SELURUH ORDER (`form_submission_id` saja). Itu benar
    // ketika satu order = satu jadwal; sejak Task 11 tidak lagi. Peneliti yang
    // memindahkan jadwal #1 ikut mematikan tagihan jadwal #2 yang tidak
    // disentuh sama sekali — dan admin tidak diberi tahu apa pun.
    //
    // Fungsi ini hanya memindahkan jadwal PERTAMA (ia mengosongkan tanggal di
    // `form_submissions`), jadi lingkupnya ordinal 1.
    //
    // DOKU payments auto-expire via payment_due_date — no manual link closure needed.
    const { data: firstSchedule } = await supabase
      .from('ad_schedules')
      .select('id')
      .eq('submission_id', submissionId)
      .eq('ordinal', 1)
      .maybeSingle();

    const { data: pendingTxs } = await supabase
      .from('transactions')
      .select('id, payment_id')
      .eq('form_submission_id', submissionId)
      .eq('schedule_id', firstSchedule?.id ?? '00000000-0000-0000-0000-000000000000')
      .eq('status', 'pending');

    if (pendingTxs && pendingTxs.length > 0) {
      const { error } = await supabase
        .from('transactions')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .in('id', pendingTxs.map(t => t.id));
      if (error) throw error;
    }

    // ⚠️ `invoices` IKUT DIMATIKAN — sebelumnya TIDAK.
    //
    // Terlihat di produksi pada order `W2XPPGF5` (2026-08-19): sesudah
    // dijadwalkan ulang, `transactions` berbunyi `expired` sementara
    // `invoices` untuk `payment_id` YANG SAMA masih `pending`. Peneliti
    // membuka halaman invoice dan melihat tagihan tertanggal kemarin yang
    // link bayarnya sudah mati — tanpa tanda apa pun bahwa ia kedaluwarsa.
    //
    // Menjadwalkan ulang TIDAK menerbitkan tagihan baru (dan memang tidak
    // seharusnya — harganya bisa berubah, dan itu keputusan admin). Yang
    // wajib terjadi adalah tagihan lamanya berhenti tampak hidup.
    const pendingPaymentIds = (pendingTxs || []).map((t: any) => t.payment_id).filter(Boolean);
    if (pendingPaymentIds.length > 0) {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'expired' })
        .in('payment_id', pendingPaymentIds)
        .eq('status', 'pending');
      if (error) throw error;
    }

    return true;
  } catch (error) {
    console.error("Failed to prepare submission for reschedule:", error);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────
// Papan Schedule (Phase 3) — pembaca PERTAMA ad_schedules
// ─────────────────────────────────────────────────────────────
// Sampai sql/46, tabel ini cermin satu arah tanpa satu pun pembaca. Fungsi di
// bawah ini yang mengubahnya. Konsekuensinya: ia hanya boleh MEMBACA. Menulis
// ke ad_schedules akan hilang diam-diam pada sync berikutnya — sumbernya tetap
// form_submissions dan form_submissions_extend.
//
// Kenapa cermin dan bukan kedua tabel sumber langsung: hanya di sini "satu
// baris = satu jendela tayang" benar untuk jadwal PERTAMA juga, tanggalnya
// sudah jadi instant (bukan campuran DATE dan TIMESTAMPTZ), dan sejak sql/46
// sumbu review terpisah dari sumbu tayang. Ketiganya syarat papan ini.

export interface AdScheduleEntry {
  id: string;
  submissionId: string;
  ordinal: number;
  isExtension: boolean;
  /**
   * Kode jadwal yang dikutip peneliti DAN admin — 8 karakter, alfabet tanpa
   * `0 O 1 I L U`, ditampilkan sebagai `#K3M9PQ7T`.
   *
   * ⚠️ Sebelum sql/51 kedua permukaan menyebut jadwal yang sama dengan kode
   * BERBEDA: peneliti melihat 8 hex pertama `sourceId`, admin melihat 8 hex
   * pertama `submissionId`. Untuk jadwal ke-2 dst. keduanya tidak pernah sama,
   * jadi kode yang dikutip peneliti ke support tidak bisa dicari admin sama
   * sekali (13 dari 13 gagal, tanpa error). Kolom ini yang menyatukannya —
   * jangan pernah menurunkan tampilan dari `id`/`sourceId`/`submissionId` lagi.
   *
   * ⚠️ JANGAN turunkan dari `ordinal`: `resync_ad_schedule_ordinals()` (sql/41)
   * menomori ulang jadwal lanjutan begitu ada yang disisipkan lebih awal.
   */
  bookingId: string;
  /**
   * Baris SUMBER-nya: id `form_submissions` untuk ordinal 1, id
   * `form_submissions_extend` untuk sisanya. Inilah kunci yang dipakai
   * `transactions.extend_id` / `invoices.extend_id`, jadi ia yang menautkan
   * sebuah jadwal ke pembayarannya sendiri.
   */
  sourceId: string;
  /** Instant ISO, atau null untuk order yang belum punya jendela tayang. */
  startDate: string | null;
  endDate: string | null;
  duration: number | null;
  /** Sumbu tayang (sql/46): unscheduled | requested | slot_reserved | … */
  status: string;
  /** Sumbu review (sql/46): in_review | approved | rejected | spam */
  reviewStatus: string;
  paymentStatus: string | null;
  distributionType: string | null;
  /** Gelombang push Kilat (8/11/14/17 WIB). NULL = regular ATAU Kilat belum ditugaskan. */
  kilatSlotHour: number | null;
  /** Yang BENAR-BENAR ditagih untuk jadwal ini. 981 dari 983 baris terisi. */
  totalCost: number;
  /**
   * DPP sebelum PPN. ⚠️ NULL pada 909 dari 983 baris — seluruh order pra-`sql/34`
   * (PPN belum ada saat itu). Jangan pernah menurunkan PPN dengan mengalikan
   * `totalCost`: untuk baris-baris itu `totalCost` SUDAH final tanpa PPN, dan
   * hasilnya angka yang tidak pernah ditagih ke siapa pun.
   */
  subtotal: number | null;
  ppnAmount: number | null;
  voucherCode: string | null;
  prizePerWinner: number;
  winnerCount: number;
  additionalPrizePerWinner: number;
  /** true = jadwal ini membuka pool hadiah baru, bukan menambah pool berjalan. */
  isNewPeriod: boolean;
  /**
   * Bulan pool hadiah (`YYYY-MM`). NULL untuk jadwal tanpa tanggal, dan NULL
   * untuk seluruh jadwal pertama — di sana pool-nya memang belum pernah
   * dinamai. ⚠️ Nama field kontrak publik (`period_batch`); jangan ikut
   * diganti saat istilah "extend" dibuang, lihat Global Constraints Phase 2.
   */
  periodBatch: string | null;
  slotBookedBy: string | null;
  slotReservedAt: string | null;
  title: string;
  researcherName: string;
  university: string | null;
  /** created_at ORDER-nya, bukan baris jadwalnya — dipakai deep-link ke drawer. */
  submissionCreatedAt: string;
  /**
   * created_at JADWAL ini. Untuk ordinal 1 ia identik dengan milik ordernya
   * (diverifikasi 2026-08-08: 0 dari 973 baris berbeda); untuk jadwal ke-2 dst.
   * ia tanggal jadwal itu dibuat, dan itulah yang tampil di kartu peneliti.
   */
  createdAt: string | null;
  /** Sumbu ketiga, diisi query kedua. 'kilat' = memang tidak pernah punya halaman. */
  pageStatus: 'none' | 'draft' | 'published' | 'kilat';
  /**
   * Iklan tambahan — kuotanya KOLAM SENDIRI (`MAX_EXTRA_ADS_PER_DAY`), terpisah
   * dari kuota reguler. Menggabungkannya ke satu kuota akan membuat hari dengan
   * 4 reguler + 2 tambahan terbaca "6/4" — panik yang tidak berdasar.
   *
   * Sejak sql/63 datang dari `ad_schedules.is_extra_ad`, PER JADWAL. Sebelumnya
   * dari `survey_pages.is_extra_ad`, satu baris per ORDER — yang berarti jadwal
   * ke-2 tidak pernah bisa berbeda kolam dari jadwal pertama, dan tidak ada
   * tempat menyimpan pilihan admin.
   *
   * Selalu `false` untuk Kilat: kolam tambahan adalah kolam di KALENDER iklan,
   * dan Kilat dijual lewat slot jam. Dijamin skema (CHECK + trigger), jadi
   * pemanggil tidak perlu menyaring kilat lagi sendiri.
   */
  isExtraAd: boolean;
  /**
   * Halamannya masih memakai banner bawaan.
   *
   * Auto-publish (sql/40) menaikkan SETIAP iklan lunas dengan
   * `/default-ad-banner.jpg`, jadi ini sisa pekerjaan manusia nomor satu — dan
   * sampai sekarang tidak ada satu layar pun yang menampilkannya bersebelahan
   * dengan tanggal tayang. Ikut dari query halaman yang memang sudah jalan,
   * jadi gratis seperti `isExtraAd`.
   *
   * ⚠️ BUKAN `requires_banner_update`. Flag itu berarti "info hadiah basi", dan
   * sql/40 sengaja menyetelnya FALSE untuk halaman baru — dua keadaan berbeda.
   * `false` untuk Kilat dan untuk order yang belum punya halaman: keduanya bukan
   * "banner belum diganti", melainkan "belum ada banner untuk diganti".
   */
  pageBannerIsPlaceholder: boolean;
}

/**
 * Batas panjang URL PostgREST — TERUKUR di produksi 2026-08-08, bukan ditebak:
 * `submission_id=in.(…)` dengan 600 UUID (≈22 KB) lolos, 700 UUID (≈26 KB)
 * ditolak gateway dengan **400 Bad Request**. Bukan 414, jadi pesannya tidak
 * menyebut panjang sama sekali dan mudah dikira query yang salah.
 *
 * Papan Schedule menanyakan 954 id sekaligus, jadi ia gagal memuat SEJAK HARI
 * PERTAMA. Tidak terlihat saat verifikasi karena seluruh pemeriksaan waktu itu
 * dijalankan lewat SQL langsung ke database — jalur REST tidak pernah dilewati.
 *
 * 200 memberi margin 3×. Potongannya dijalankan paralel, jadi ongkosnya tetap
 * satu putaran jaringan, bukan lima.
 */
const IN_FILTER_CHUNK = 200;

/**
 * `.in('submission_id', ids)` yang tidak bisa meledak karena jumlah id.
 *
 * Dipakai di mana pun daftar id-nya tumbuh seiring umur produk.
 *
 * ⚠️ KOREKSI 2026-08-19. Catatan sebelumnya di sini menyatakan pemanggil
 * `survey_pages` satunya (peta `is_extra_ad` di `fetchSlotAvailability`)
 * "masih aman — 317 id" karena disaring status aktif. Itu SALAH: 317 id sudah
 * cukup untuk menggantungkan permintaannya, dan akibatnya penguncian slot
 * berhenti total. "Menyusut lagi saat order selesai" bukan jaminan — ia hanya
 * menunda ambangnya. Kini pemanggil itu ikut lewat sini.
 */
const selectSurveyPagesByIds = async <T>(columns: string, ids: string[]): Promise<T[]> => {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_FILTER_CHUNK) {
    chunks.push(ids.slice(i, i + IN_FILTER_CHUNK));
  }
  const batches = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await supabase
        .from('survey_pages')
        .select(columns)
        .in('submission_id', chunk);
      if (error) throw error;
      return (data || []) as T[];
    })
  );
  return batches.flat();
};

/**
 * Seluruh isi cermin + status halamannya, dalam dua query.
 *
 * SENGAJA TANPA PAGINASI DAN TANPA FILTER TANGGAL. 985 baris per 2026-08-08 —
 * memuatnya sekali membuat navigasi periode, filter, dan hitungan chip berjalan
 * di klien tanpa bolak-balik ke server. Tinjau ulang di sekitar 5.000 baris;
 * saat itu batasi ke jendela yang tampil DITAMBAH semua baris tanpa tanggal
 * (yang terakhir tidak boleh pernah tersaring — justru order itu yang paling
 * perlu terlihat).
 */
/**
 * Diurutkan `ordinal ASC`, dan `ordinal = 1` sendirian sudah lebih dari 1.000
 * baris (2026-08-20) — batas baris bawaan PostgREST. Satu query tanpa
 * `.range()` karena itu mengisi penuh batasnya dengan `ordinal = 1` sebelum
 * sempat menyentuh satu pun baris `ordinal > 1`, dan SETIAP jadwal ke-2/3+
 * lenyap dari papan, bukan cuma yang barunya. Melompat per halaman lewat
 * `.range()` menutup itu — untuk target tunggal/kecil (drawer, dashboard
 * peneliti) putaran pertama langsung berhenti, jadi tidak ada tambahan biaya.
 */
const AD_SCHEDULES_PAGE_SIZE = 1000;

export const fetchAdSchedules = async (
  target?: string | string[]
): Promise<AdScheduleEntry[]> => {
  // Daftar kosong berarti "tidak ada yang ditanyakan", BUKAN "tanyakan
  // semuanya". Tanpa cabang ini `.in('submission_id', [])` dihilangkan dan
  // dashboard peneliti akan meminta seluruh isi tabel.
  if (Array.isArray(target) && target.length === 0) return [];

  const rows: any[] = [];
  let total: number | null = null;
  let offset = 0;

  for (;;) {
    let q = supabase
      .from('ad_schedules')
      .select(`
        id, submission_id, ordinal, source_table, source_id, booking_id,
        start_date, end_date, duration,
        status, review_status, payment_status,
        distribution_type, kilat_slot_hour, is_extra_ad,
        total_cost, subtotal, ppn_amount, voucher_code,
        prize_per_winner, winner_count, additional_prize_per_winner, is_new_period, period_batch,
        slot_booked_by, slot_reserved_at, created_at,
        form_submissions!ad_schedules_submission_id_fkey ( title, full_name, university, created_at )
      `, { count: 'exact' });

    // Dipakai tiga permukaan: papan admin (tanpa argumen, semuanya), drawer order
    // (satu submission), dan dashboard peneliti (daftar order miliknya sendiri).
    // Satu fungsi supaya ketiganya tidak bisa menurunkan "jadwal ke berapa" dan
    // "berapa ditagih" dengan aturan yang berbeda.
    if (Array.isArray(target)) q = q.in('submission_id', target);
    else if (target) q = q.eq('submission_id', target);

    const { data, error, count } = await q
      .order('ordinal', { ascending: true })
      .range(offset, offset + AD_SCHEDULES_PAGE_SIZE - 1);

    if (error) throw error;

    total = count;
    const page = (data || []) as any[];
    rows.push(...page);
    if (page.length < AD_SCHEDULES_PAGE_SIZE) break;
    offset += AD_SCHEDULES_PAGE_SIZE;
  }

  // Penjaga terakhir: kalau angkanya masih tidak cocok sesudah paginasi habis,
  // sesuatu yang lain sedang salah (bukan lagi batas baris) — lebih baik
  // berisik daripada papan diam-diam menampilkan data tidak lengkap.
  if (total != null && total !== rows.length) {
    console.warn(
      `fetchAdSchedules: mengambil ${rows.length} dari ${total} baris sesudah paginasi. ` +
      `Papan Schedule mungkin menampilkan data TIDAK LENGKAP.`
    );
  }

  // Sumbu halaman lewat SATU query untuk semua submission sekaligus, bukan per
  // baris. Kilat tidak pernah punya baris survey_pages (guard ensure_survey_page,
  // sql/42), jadi ia tidak ditanyakan sama sekali — 'belum dibuat' dan 'memang
  // tidak pernah punya' adalah dua hal yang berbeda di layar.
  const regularIds = Array.from(
    new Set(rows.filter((r) => r.distribution_type !== 'kilat').map((r) => r.submission_id))
  );

  // ⚠️ Lewat `selectSurveyPagesByIds`, BUKAN `.in()` langsung: daftar ini memuat
  // seluruh order regular sepanjang sejarah (954 per 2026-08-08) dan tumbuh terus.
  //
  // `banner_url` menumpang select yang sama — SATU kolom tambahan, nol query
  // tambahan. Query kedua di atas ~954 order regular adalah harga yang tidak
  // perlu dibayar untuk menjawab "banner mana yang masih bawaan".
  const pageBySubmission = new Map<
    string,
    { published: boolean; placeholderBanner: boolean }
  >();
  if (regularIds.length > 0) {
    const pages = await selectSurveyPagesByIds<{
      submission_id: string;
      is_published: boolean | null;
      banner_url: string | null;
    }>('submission_id, is_published, banner_url', regularIds);
    for (const p of pages) {
      pageBySubmission.set(p.submission_id, {
        published: !!p.is_published,
        placeholderBanner: isPlaceholderBannerUrl(p.banner_url),
      });
    }
  }

  return rows.map((row) => {
    const isKilat = row.distribution_type === 'kilat';
    const page = pageBySubmission.get(row.submission_id);
    const pageStatus: AdScheduleEntry['pageStatus'] = isKilat
      ? 'kilat'
      : page === undefined
        ? 'none'
        : page.published
          ? 'published'
          : 'draft';

    return {
      id: row.id,
      submissionId: row.submission_id,
      ordinal: row.ordinal,
      isExtension: row.source_table === 'form_submissions_extend',
      sourceId: row.source_id,
      bookingId: row.booking_id,
      startDate: row.start_date,
      endDate: row.end_date,
      duration: row.duration,
      status: row.status,
      reviewStatus: row.review_status,
      paymentStatus: row.payment_status,
      distributionType: row.distribution_type,
      kilatSlotHour: row.kilat_slot_hour == null ? null : Number(row.kilat_slot_hour),
      totalCost: Number(row.total_cost || 0),
      subtotal: row.subtotal == null ? null : Number(row.subtotal),
      ppnAmount: row.ppn_amount == null ? null : Number(row.ppn_amount),
      voucherCode: row.voucher_code,
      prizePerWinner: Number(row.prize_per_winner || 0),
      winnerCount: Number(row.winner_count || 0),
      additionalPrizePerWinner: Number(row.additional_prize_per_winner || 0),
      isNewPeriod: !!row.is_new_period,
      periodBatch: row.period_batch || null,
      slotBookedBy: row.slot_booked_by,
      slotReservedAt: row.slot_reserved_at,
      title: row.form_submissions?.title || 'Untitled',
      researcherName: row.form_submissions?.full_name || 'Unknown',
      university: row.form_submissions?.university || null,
      submissionCreatedAt: row.form_submissions?.created_at || new Date().toISOString(),
      createdAt: row.created_at || null,
      pageStatus,
      isExtraAd: !!row.is_extra_ad,
      // Hanya bermakna untuk halaman yang BENAR-BENAR ada. Kilat dan order tanpa
      // halaman keduanya false — lihat komentar di AdScheduleEntry.
      pageBannerIsPlaceholder: pageStatus === 'none' || pageStatus === 'kilat'
        ? false
        : (page?.placeholderBanner ?? false),
    };
  });
};

/** Satu PERISTIWA TAGIHAN — satu `payment_id`, bukan satu baris tabel. */
export interface ScheduleInvoice {
  paymentId: string | null;
  amount: number;
  status: string;
  paymentUrl: string | null;
  createdAt: string;
  /** `invoice` = admin menagih. `transaction` = orang membuka halaman bayar. */
  source: 'invoice' | 'transaction';
  voucherCode: string | null;
  /** Percobaan bayar untuk tagihan INI saja. */
  attempts: number;
  /**
   * Masih menggantung, tapi ada pembayaran lunas yang lebih baru di jadwal
   * yang sama — tanda ia diterbitkan ulang. Tetap ditampilkan (sejarah tidak
   * dihapus) tapi tidak dihitung sebagai piutang.
   */
  isSuperseded: boolean;
  paymentMethod: string | null;
  paymentChannel: string | null;
  isPaid: boolean;
  /** expired / failed / cancelled — sudah tidak bisa dibayar. */
  isDead: boolean;
  /**
   * Persis `pending`, bukan "bukan lunas dan bukan mati". Cerminan
   * `payment_status_rank(...) = 1` di sql/53 — status tak dikenal ber-rank 0
   * dan sengaja TIDAK masuk sini.
   */
  isPending: boolean;
  /** Jendela tayang yang ditagihkan baris ini saat ia terbit. */
  billedStartDate: string | null;
  /**
   * Kapan link DOKU-nya berhenti berlaku. NULL = tidak diketahui — baris
   * pra-Bagian 3 dan seluruh sisi `transactions` (yang tidak punya kolom ini).
   */
  expiresAt: string | null;
  /**
   * `expires_at` sudah lewat DAN uangnya belum masuk (sql/83).
   *
   * ⚠️ Dijawab DI DATABASE, bukan dihitung ulang di sini. Tidak ada cron yang
   * mengedaluwarsakan tagihan, jadi status `pending` bertahan selamanya sesudah
   * link-nya mati — 182 dari 183 baris produksi begitu per 2026-09-03. Kalau
   * klien menghitungnya sendiri, ia akan berbeda dari `live` di
   * schedule_billing_summary() dan angka di layar menyimpang tanpa satu pun error.
   */
  isExpired: boolean;
  /**
   * Jadwalnya sudah berpindah sejak tagihan ini terbit, jadi ia menagih
   * jendela yang tidak ada lagi. Uang yang SUDAH masuk tidak pernah basi.
   */
  isStale: boolean;
}

/** Ringkasan uang SATU jadwal. */
export interface ScheduleBilling {
  /**
   * Kunci yang dipakai dashboard peneliti (`airingPeriods.ts`): id
   * `form_submissions` untuk ordinal 1, id jadwal untuk sisanya. Datang dari
   * DB supaya aturan penurunannya tidak disalin lagi di klien.
   */
  sourceId: string;
  /** Terbaru dulu. Memuat SEMUA peristiwa, termasuk yang mati & tersusul. */
  invoices: ScheduleInvoice[];
  billed: number;
  paid: number;
  outstanding: number;
  /** Sudah ditagih dan lunas. Menggantikan `hasEverPaid` yang berbohong. */
  isSettled: boolean;
  /** Satu-satunya tagihan yang masih menunggu dibayar, kalau ada. */
  openInvoice: ScheduleInvoice | null;
  /** Dari pembayaran lunas terakhir — gerbang aksi "Tandai belum lunas". */
  paymentMethod: string | null;
  paymentChannel: string | null;
  /**
   * Tagihan basi TERBARU, kalau ada. Dipakai untuk menjelaskan kepada peneliti
   * kenapa tagihannya hilang — tanpa ini layar cuma berhenti menampilkan
   * tombol bayar dan orangnya tidak tahu harus menunggu apa.
   */
  staleInvoice: ScheduleInvoice | null;
}

const DEAD_PAYMENT_STATUSES = ['expired', 'failed', 'cancelled'];
const PAID_PAYMENT_STATUSES = ['paid', 'completed'];
/**
 * Cerminan `payment_status_rank(...) = 1` di sql/53 — status "menggantung".
 *
 * ⚠️ BUKAN sama dengan "bukan lunas dan bukan mati". Status yang TIDAK DIKENAL
 * ber-rank 0 di SQL dan karenanya bukan `live`; salinan TS di bawah dulu
 * memakai `!isDead` sehingga status tak dikenal ikut terhitung sebagai tagihan
 * hidup. Selisihnya nol baris hari ini karena kosakata status produksi masih
 * lengkap di kedua daftar — tapi status baru pertama yang lahir hanya di satu
 * sisi akan membuat angka uang di layar berbeda dari angka di database, tanpa
 * satu pun error.
 */
const PENDING_PAYMENT_STATUSES = ['pending'];

/**
 * Peta jadwal -> uangnya, untuk satu order. Satu round-trip, bukan N.
 *
 * ⚠️ SATU JADWAL BOLEH PUNYA BEBERAPA TAGIHAN — dan itu sudah terjadi di
 * lapangan sebelum fitur ini ada. `76XKVW5P` dibayar Rp 1.470.750 lalu
 * Rp 61.050; `43MG75Y5` Rp 1.000.000 lalu Rp 500.000. Pendahulu fungsi ini
 * (`fetchSchedulePayments`) melipat semuanya jadi SATU objek ber-`hasEverPaid`,
 * jadi 14 jadwal beruang sungguhan mengumumkan "Lunas" padahal bersisa.
 *
 * ⚠️ AGREGASINYA DI SQL, BUKAN DI SINI. `schedule_billing_bulk()` (sql/53)
 * menggabungkan `invoices` + `transactions` ber-kunci `payment_id`. Alasannya
 * bukan performa:
 *
 *   - `invoices` SENDIRIAN tidak cukup. 190 jadwal di produksi hanya punya
 *     `transactions` — 79 di antaranya lunas, senilai Rp 44.759.000. 185 dari
 *     sejarah (`create-payment.js` baru menulis `invoices` sejak 2026-07-01),
 *     5 sisanya karena sisipan invoice-nya boleh gagal diam-diam.
 *   - `transactions` SENDIRIAN juga tidak. Pending di sana adalah checkout
 *     yang ditinggalkan, bukan tagihan: 121 peristiwa senilai Rp 1,08 miliar.
 *
 * Aturan lengkapnya ada di kepala `sql/53_schedule_billing.sql`. Jangan
 * menyalinnya ke sini — ini pembaca, bukan pemilik aturan.
 */
export const fetchScheduleBilling = async (
  submissionId: string,
): Promise<Map<string, ScheduleBilling>> => {
  const { data, error } = await supabase
    .rpc('schedule_billing_bulk', { p_submission_id: submissionId });
  if (error) throw error;

  const rows = (data || []) as any[];
  const bySchedule = new Map<string, ScheduleInvoice[]>();
  const sourceIds = new Map<string, string>();

  for (const r of rows) {
    const status = String(r.status || '');
    const inv: ScheduleInvoice = {
      paymentId: r.payment_id ?? null,
      amount: Number(r.amount || 0),
      status,
      paymentUrl: r.payment_url ?? null,
      createdAt: r.created_at,
      source: r.source === 'invoice' ? 'invoice' : 'transaction',
      voucherCode: r.voucher_code ?? null,
      attempts: Number(r.attempts || 0),
      isSuperseded: !!r.is_superseded,
      paymentMethod: r.payment_method ?? null,
      paymentChannel: r.payment_channel ?? null,
      isPaid: PAID_PAYMENT_STATUSES.includes(status.toLowerCase()),
      isDead: DEAD_PAYMENT_STATUSES.includes(status.toLowerCase()),
      isPending: PENDING_PAYMENT_STATUSES.includes(status.toLowerCase()),
      billedStartDate: r.billed_start_date ?? null,
      isStale: !!r.is_stale,
      expiresAt: r.expires_at ?? null,
      isExpired: !!r.is_expired,
    };
    if (r.source_id) sourceIds.set(r.schedule_id, r.source_id);
    const list = bySchedule.get(r.schedule_id);
    if (list) list.push(inv);
    else bySchedule.set(r.schedule_id, [inv]);
  }

  const out = new Map<string, ScheduleBilling>();
  for (const [scheduleId, invoices] of bySchedule) {
    // Cerminan `live` di schedule_billing_summary() — kalau salah satu
    // berubah, ubah keduanya. Sengaja tidak dua round-trip demi satu angka.
    // Predikatnya tinggal di `billingCompare.ts` supaya pembandingan
    // tercatat-vs-ditagih memakai definisi yang SAMA, bukan salinannya.
    const live = invoices.filter(isLiveInvoice);
    const billed = live.reduce((sum, i) => sum + i.amount, 0);
    const paid = live.filter((i) => i.isPaid).reduce((sum, i) => sum + i.amount, 0);
    const lastPaid = invoices.find((i) => i.isPaid);

    out.set(scheduleId, {
      sourceId: sourceIds.get(scheduleId) ?? scheduleId,
      invoices,
      billed,
      paid,
      outstanding: billed - paid,
      isSettled: billed > 0 && billed - paid <= 0,
      openInvoice: live.find((i) => !i.isPaid) ?? null,
      paymentMethod: lastPaid?.paymentMethod ?? null,
      paymentChannel: lastPaid?.paymentChannel ?? null,
      staleInvoice: invoices.find((i) => i.isStale) ?? null,
    });
  }
  return out;
};
