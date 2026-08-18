import { createClient } from '@supabase/supabase-js';
import type { ReviewHistoryEntry } from '../components/submissions/types';
import { toAiringEndIso, toAiringStartIso, toWibYmd } from './airing-window';
import { isPlaceholderBannerUrl } from './page-banner';
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
    const { data: { user } } = await supabase.auth.getUser();
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

export const getOwnProfile = async (): Promise<ResearcherProfile | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
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
};

export const updateOwnProfile = async (updates: Partial<Omit<ResearcherProfile, 'id' | 'email'>>) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
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
  const { data: { user } } = await supabase.auth.getUser();
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
  const { data: { user } } = await supabase.auth.getUser();
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
    | 'scheduled' | 'live' | 'completed';
  referral_source?: string;
  winner_count?: number;
  prize_per_winner?: number;
  voucher_code?: string;
  total_cost: number;          // grand total, termasuk PPN
  subtotal?: number;           // DPP sebelum PPN (null utk submission pra-PPN)
  ppn_amount?: number;         // PPN 11% (null utk submission pra-PPN)
  payment_status?: string;
  submission_method?: string;
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
  created_at?: string;
  expires_at?: string;
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

// Ambil semua extend durasi untuk sekumpulan submission sekaligus (batch).
// Dipakai readonly di dashboard user (RLS mengizinkan user membaca extend miliknya).
export const getExtendsBySubmissionIds = async (
  submissionIds: string[]
): Promise<FormSubmissionExtend[]> => {
  if (!submissionIds.length) return [];
  try {
    const { data, error } = await supabase
      .from('form_submissions_extend')
      .select('*')
      .in('submission_id', submissionIds)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as FormSubmissionExtend[];
  } catch (error) {
    console.error('Error getting extends by submission ids:', error);
    return [];
  }
};

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
 * Tandai SATU jadwal lunas — pelunasan manual oleh admin.
 *
 * ⚠️ INI YANG MENGGANTIKAN `updatePaymentStatus` DI KARTU JADWAL, dan bedanya
 * bukan kosmetik. `updatePaymentStatus` menyaring `form_submission_id` saja,
 * jadi pada order berjadwal banyak ia melunasi tagihan jadwal LAIN sekaligus —
 * termasuk jadwal yang uangnya belum pernah diterima. Fungsi ini menyaring
 * `schedule_id` (sql/51), jadi cakupannya persis kartu yang diklik.
 *
 * Efek sampingnya sengaja dibuat IDENTIK dengan jalur webhook DOKU, supaya
 * pelunasan manual dan pelunasan otomatis tidak meninggalkan baris yang
 * berbeda bentuk:
 *
 *   ordinal 1  → form_submissions.payment_status='paid', submission_status='paid'
 *   ordinal ≥2 → form_submissions_extend.payment_status='paid',
 *                submission_status='scheduled'
 *
 * `'scheduled'` untuk perpanjangan BUKAN pilihan bebas: `cron_activate_extends()`
 * (sql/36) hanya mengangkat baris `scheduled` + `paid` jadi `live`. Menulis
 * `'paid'` ke sana membuat iklannya tidak pernah tayang.
 *
 * ⚠️ Penjaga kolom uang (`guard_extend_payment_columns`, sql/33) hanya
 * meloloskan `service_role` atau `product@jakpat.net`. Admin lain akan ditolak
 * DB — itu perilaku yang sudah ada sejak sql/33, bukan yang dibawa fungsi ini.
 */
export const markScheduleAsPaid = async (entry: AdScheduleEntry) => {
  const paidPatch = { status: 'paid', payment_method: 'manual' };

  const { error: invErr } = await supabase
    .from('invoices')
    .update(paidPatch)
    .eq('schedule_id', entry.id)
    .in('status', ['pending', 'expired']);
  if (invErr) throw invErr;

  const { error: txnErr } = await supabase
    .from('transactions')
    .update({ ...paidPatch, payment_channel: 'MANUAL_VERIFIED' })
    .eq('schedule_id', entry.id)
    .in('status', ['pending', 'expired']);
  if (txnErr) throw txnErr;

  if (entry.isExtension) {
    const { error } = await supabase
      .from('form_submissions_extend')
      .update({ payment_status: 'paid', submission_status: 'scheduled' })
      .eq('id', entry.sourceId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('form_submissions')
      .update({ payment_status: 'paid', submission_status: 'paid' })
      .eq('id', entry.sourceId);
    if (error) throw error;
  }
};

/**
 * Ubah status pembayaran seluruh ORDER.
 *
 * ⚠️ CAKUPANNYA ORDER, BUKAN JADWAL — ia melunasi/membatalkan setiap invoice
 * dan transaksi yang `form_submission_id`-nya cocok, apa pun jadwal pemiliknya.
 * Itu benar untuk dropdown status di tabel Submissions (yang memang berbicara
 * tentang order), dan SALAH untuk tombol di kartu jadwal. Untuk yang terakhir
 * pakai `markScheduleAsPaid()`.
 */
export const updatePaymentStatus = async (id: string, status: string) => {
  try {
    const { data, error } = await supabase
      .from('form_submissions')
      .update({ payment_status: status })
      .eq('id', id)
      .select();

    if (error) throw error;

    // If marked as paid, also update any pending invoices/transactions for this submission
    if (status === 'paid') {
      await supabase
        .from('invoices')
        .update({ status: 'paid', payment_method: 'manual' })
        .eq('form_submission_id', id)
        .in('status', ['pending', 'expired']);

      await supabase
        .from('transactions')
        .update({ status: 'paid', payment_method: 'manual', payment_channel: 'MANUAL_VERIFIED' })
        .eq('form_submission_id', id)
        .in('status', ['pending', 'expired']);
    }

    return data[0];
  } catch (error: any) {
    console.error('Error updating payment status:', error);
    throw error;
  }
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

    const { data, error } = await supabase
      .from('form_submissions')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) {
      const isMissingColumn = error.code === '42703' || error.message?.includes('review_history');
      if (isMissingColumn && reviewHistory !== undefined) {
        console.warn('review_history column does not exist. Retrying update without review_history...');
        const fallbackData: any = { submission_status: status };
        if (notes !== undefined) {
          fallbackData.admin_notes = notes;
        }
        console.log('Sending fallback update query with data:', fallbackData);
        const { data: retryData, error: retryError } = await supabase
          .from('form_submissions')
          .update(fallbackData)
          .eq('id', id)
          .select();
        
        console.log('Fallback retry result:', { retryData, retryError });
        if (retryError) throw retryError;
        return retryData[0];
      }
      throw error;
    }
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
 * Untuk menyingkirkan order dari daftar user, pakai `dismissRejectedSubmission()` —
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
 * Menyingkirkan order yang DITOLAK review dari daftar user, tanpa menghapus datanya.
 *
 * Dipakai tombol "Hapus" di kartu order (ReviewPhase hanya menampilkannya untuk
 * status `rejected`/`spam`). Soft-delete dipilih ketimbang DELETE sungguhan karena:
 *   - `survey_pages`, `invoices`, dan `transactions` TIDAK punya foreign key ke
 *     `form_submissions`, jadi penghapusan keras akan meninggalkan baris yatim;
 *   - riwayat order tetap perlu ada saat user menghubungi bantuan;
 *   - user memang cuma ingin membersihkan tampilan, bukan melenyapkan bukti.
 *
 * `submission_status = 'cancelled'` aman dipakai sebagai penanda di tabel ini: nol
 * baris `form_submissions` memakainya (dicek di produksi 2026-08-09) dan tidak ada
 * kode lain yang menulisnya — pembatalan oleh admin hidup di `form_submissions_extend`
 * (lihat SchedulePaymentTab). Trigger `guard_payment_columns()` juga sudah
 * mengizinkan transisi non-admin menuju `cancelled` selama order belum lunas.
 *
 * Penyaring `.in(...)` menjaga agar hanya order yang benar-benar ditolak bisa
 * disingkirkan — order berbayar tidak akan pernah ikut terbawa meski dipanggil keliru.
 */
export const dismissRejectedSubmission = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('form_submissions')
      .update({ submission_status: 'cancelled' })
      .eq('id', id)
      .in('submission_status', ['rejected', 'spam'])
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        `Order ${id} tidak bisa disingkirkan — statusnya bukan rejected/spam, atau ditolak RLS.`
      );
    }
    return true;
  } catch (error: any) {
    console.error('Error dismissing rejected submission:', error);
    throw error;
  }
};

export const updateSubmissionCriteria = async (id: string, criteria: string, prizePerWinner: number, winnerCount: number) => {
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
    return data;
  } catch (error: any) {
    console.error('Error updating submission criteria:', error);
    throw error;
  }
};

/**
 * ⚠️ KIRIM HANYA KOLOM YANG BENAR-BENAR DIUBAH.
 *
 * Keempat kolom ini disunting dari DUA sisi: admin lewat tab Info, peneliti
 * lewat "Ganti link" di dashboard-nya. Mengirim keempatnya padahal cuma satu
 * yang berubah membuat salinan lokal yang basi menimpa suntingan pihak lain —
 * dan `question_count`/`duration` adalah masukan harga, jadi yang tertimpa
 * bukan sekadar teks.
 */
export const updateFormDetails = async (
  id: string,
  updates: Partial<{
    title: string;
    survey_url: string;
    question_count: number;
    duration: number;
  }>
) => {
  try {
    const { data, error } = await supabase
      .from('form_submissions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
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

// Fungsi untuk mendapatkan form submissions dengan pagination
export const getFormSubmissionsPaginated = async (
  page: number,
  limit: number,
  searchQuery: string = '',
  startDate?: string,
  endDate?: string,
  ascending: boolean = false
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
    if (startDate && endDate && !isIdSearch) {
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
    const { data: otherSchedules, error: otherError } = await supabase
      .from('form_submissions_extend')
      .select('id')
      .eq('submission_id', submissionId)
      .in('submission_status', ['waiting_payment', 'paid', 'scheduled', 'live'])
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
    .from('form_submissions_extend')
    .update({
      start_date: toAiringStartIso(startYmd, hourWib, minuteWib),
      end_date: toAiringEndIso(startYmd, durationDays, hourWib, minuteWib),
      updated_at: new Date().toISOString(),
    })
    .eq('id', extendId);

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
 * Extend statuses that occupy a daily slot: everything except 'cancelled'
 * (never airs) and 'completed' (already aired). Kept as an allow-list rather
 * than a deny-list so a new status has to be classified deliberately.
 * Source of truth for the full set: sql/19_create_extend_table.sql.
 */
const SLOT_OCCUPYING_EXTEND_STATUSES = ['waiting_payment', 'paid', 'scheduled', 'live'];

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
  adminNotes: string | null;
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
 * here, so a date could be sold past MAX_REGULAR_ADS_PER_DAY. Extends carry no
 * distribution_type or is_extra_ad of their own — both are inherited from the
 * parent submission, so a kilat extend never eats a regular slot and an extra
 * ad's extend stays in extraCounts.
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
    const [submissionsResult, extendsResult] = await Promise.all([
      supabase
        .from('form_submissions')
        .select('id, title, start_date, end_date, submission_status, slot_booked_by, slot_reserved_at, payment_status, admin_notes, distribution_type')
        .not('start_date', 'is', null)
        .not('submission_status', 'in', '("rejected","spam","in_review","completed")')
        .eq('distribution_type', distributionType),
      supabase
        .from('form_submissions_extend')
        .select('id, submission_id, start_date, end_date, submission_status, payment_status, slot_booked_by, slot_reserved_at, form_submissions!inner(title, admin_notes, distribution_type)')
        .not('start_date', 'is', null)
        .not('end_date', 'is', null)
        .in('submission_status', SLOT_OCCUPYING_EXTEND_STATUSES)
        .eq('form_submissions.distribution_type', distributionType),
    ]);

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
      adminNotes: row.admin_notes,
    }));

    const fromExtends: SlotOccupancy[] = (extendsResult.data || []).map((row: any) => {
      // PostgREST returns the embedded parent as an object for a to-one
      // relationship, but older typings surface it as an array — accept both.
      const parent = Array.isArray(row.form_submissions) ? row.form_submissions[0] : row.form_submissions;
      return {
        id: row.id,
        submissionId: row.submission_id,
        title: parent?.title || 'Untitled Ad',
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.submission_status,
        paymentStatus: row.payment_status,
        slotBookedBy: row.slot_booked_by,
        slotReservedAt: row.slot_reserved_at,
        adminNotes: parent?.admin_notes ?? null,
      };
    });

    const activeSlots = [...fromSubmissions, ...fromExtends].filter(holdsSlot);

    // is_extra_ad lives on the page, so it is looked up per submission and
    // applies to that submission's extends too.
    const subIds = Array.from(new Set(activeSlots.map((s) => s.submissionId)));
    let extraAdMap: Record<string, boolean> = {};
    if (subIds.length > 0) {
      const { data: pages } = await supabase
        .from('survey_pages')
        .select('submission_id, is_extra_ad')
        .in('submission_id', subIds);
      if (pages) {
        pages.forEach((p: any) => { extraAdMap[p.submission_id] = !!p.is_extra_ad; });
      }
    }

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

        const isExtra = extraAdMap[slot.submissionId] || (slot.adminNotes || '').includes('[EXTRA_AD]');
        const targetCounts = isExtra ? extraCounts : regularCounts;

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
            isExtra,
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
      adminNotes: null,
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
 * Satu-satunya penolakan keras: halaman iklan yang MASIH published. Order itu
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
      adminNotes: null,
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
 * Lepaskan slot SATU jadwal atas keputusan admin — "Hapus dari list".
 *
 * Bedanya dengan `releaseExpiredSlot` bukan pada apa yang ditulis, melainkan
 * pada SIAPA yang dilepas: fungsi ini berlingkup satu baris jadwal, bukan satu
 * order. Untuk order berjadwal satu keduanya identik; untuk order berjadwal
 * banyak, `releaseExpiredSlot` akan ikut mematikan tagihan jadwal lain.
 *
 * ⚠️ FONDASI TASK 13 LANGKAH 3. Penautan jadwal→pembayaran di sini memakai
 * aturan yang sama persis dengan `fetchSchedulePayments`: `entity_type =
 * 'extend'` + `extend_id` untuk ordinal ≥2, sisanya milik ordinal 1. Itulah
 * satu-satunya sambungan yang perlu ditukar ke `schedule_id` begitu Task 11
 * mendarat — sisa fungsi ini tidak berubah.
 *
 * ⚠️ KENAPA TANGGALNYA DIKOSONGKAN, BUKAN DIBERI STATUS 'cancelled'.
 * Rancangan Task 13 mempertahankan tanggal dan menulis `status = 'cancelled'`.
 * Itu benar SESUDAH Task 11, tapi mustahil hari ini: `submission_status` masih
 * memikul dua sumbu sekaligus, jadi menulis 'cancelled' ke sana menghapus
 * informasi review ("dulu approved atau belum?"), dan `airing_status_of()`
 * (sql/46) tidak mengenal 'cancelled' sebagai MASUKAN — ia memetakannya jadi
 * 'requested', membuat jadwal yang dilepas tampak seperti permintaan aktif.
 * Mengosongkan tanggal mencapai tujuan yang sama tanpa migrasi: `isUnscheduled()`
 * jadi true → keluar dari antrean "perlu ditagih", dan `occupiesSlot()` jadi
 * false → kuota harinya bebas.
 */
export const releaseScheduleSlot = async (entry: {
  submissionId: string;
  sourceId: string;
  isExtension: boolean;
  paymentStatus: string | null;
}) => {
  // Penjaga yang sama dengan releaseExpiredSlot: yang sudah lunas tidak
  // pernah dilepas dari sini, apa pun yang diklik admin.
  if (['paid', 'completed'].includes(entry.paymentStatus || '')) {
    throw new Error('Jadwal yang sudah lunas tidak bisa dilepas dari sini.');
  }

  // ⚠️ Penjaga lunas diulang DI DALAM query, bukan cuma dari `entry` yang bisa
  // basi: pembayaran bisa mendarat lewat webhook DOKU tepat saat admin mengklik.
  // Nol baris terpengaruh = ada yang lebih dulu, dan kita berhenti tanpa
  // mematikan tagihan siapa pun. Pola yang sama dipakai `rebookSlotForSubmission`.
  const unpaidOnly = '("paid","completed")';

  if (entry.isExtension) {
    // ⚠️ `submission_status` TIDAK disentuh. CHECK di form_submissions_extend
    // hanya menerima waiting_payment|paid|scheduled|live|completed|cancelled —
    // 'slot_reserved' ditolak, dan 'cancelled' salah dipetakan (lihat atas).
    const { data, error } = await supabase
      .from('form_submissions_extend')
      .update({
        start_date: null,
        end_date: null,
        slot_booked_by: null,
        slot_reserved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entry.sourceId)
      .not('payment_status', 'in', unpaidOnly)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Jadwal ini sudah lunas atau sudah dilepas. Muat ulang dulu.');
    }
  } else {
    const { data, error } = await supabase
      .from('form_submissions')
      .update({
        start_date: null,
        end_date: null,
        slot_booked_by: null,
        slot_reserved_at: null,
        submission_status: 'slot_reserved',
        payment_status: 'expired',
        updated_at: new Date().toISOString(),
      })
      .eq('id', entry.submissionId)
      .not('payment_status', 'in', unpaidOnly)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Order ini sudah lunas atau sudah dilepas. Muat ulang dulu.');
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
    await supabase
      .from('transactions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .in('id', mine.map((t) => t.id));
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
    .select('id');

  if (error) throw error;
  if (!data || data.length === 0) {
    // Nol baris di PostgREST tidak memunculkan error — inilah cara "berhasil
    // palsu" lahir. Dilempar supaya UI tidak bisa menampilkan sukses semu.
    throw new Error(
      `Slot untuk ${submissionId} tidak bisa dikunci ulang — kemungkinan sudah lunas atau ditolak RLS.`
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
    const { error: subError } = await supabase
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
      .eq('id', submissionId);

    if (subError) throw subError;

    // 2. Mark all pending transactions as expired
    // DOKU payments auto-expire via payment_due_date — no manual link closure needed.
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
   * dari kuota reguler. Ikut dari `survey_pages.is_extra_ad`, jadi ia gratis:
   * query halaman memang sudah dijalankan untuk `pageStatus`.
   *
   * Menggabungkannya ke satu kuota akan membuat hari dengan 4 reguler + 2
   * tambahan terbaca "6/4" — panik yang tidak berdasar.
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
 * Dipakai di mana pun daftar id-nya tumbuh seiring umur produk. Satu-satunya
 * pemanggil `survey_pages` lain yang tersisa (peta `is_extra_ad` di
 * `fetchSlotAvailability`) hari ini masih aman — 317 id — karena ia disaring
 * status aktif, jadi daftarnya menyusut lagi saat order selesai. Yang tidak
 * pernah menyusut hanya pemanggil di bawah ini.
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
export const fetchAdSchedules = async (
  target?: string | string[]
): Promise<AdScheduleEntry[]> => {
  // Daftar kosong berarti "tidak ada yang ditanyakan", BUKAN "tanyakan
  // semuanya". Tanpa cabang ini `.in('submission_id', [])` dihilangkan dan
  // dashboard peneliti akan meminta seluruh isi tabel.
  if (Array.isArray(target) && target.length === 0) return [];

  let q = supabase
    .from('ad_schedules')
    .select(`
      id, submission_id, ordinal, source_table, source_id, booking_id,
      start_date, end_date, duration,
      status, review_status, payment_status,
      distribution_type, kilat_slot_hour,
      total_cost, subtotal, ppn_amount, voucher_code,
      prize_per_winner, winner_count, additional_prize_per_winner, is_new_period, period_batch,
      slot_booked_by, slot_reserved_at, created_at,
      form_submissions!ad_schedules_submission_id_fkey ( title, full_name, university, created_at )
    `, { count: 'exact' });

  // Dipakai tiga permukaan: papan admin (tanpa argumen, semuanya), drawer order
  // (satu submission), dan dashboard peneliti (daftar order miliknya sendiri).
  // Satu fungsi supaya ketiganya tidak bisa menurunkan "jadwal ke berapa" dan
  // "berapa ditagih" dengan aturan yang berbeda.
  //
  // Daftar peneliti tidak dipotong: RLS `Owner or admin can view ad_schedules`
  // sudah membatasinya ke order miliknya, dan order per peneliti dihitung
  // belasan — jauh di bawah ambang URL yang menjatuhkan papan admin (lihat
  // `IN_FILTER_CHUNK`). Kalau suatu saat ada akun dengan ratusan order, lewatkan
  // saja ke pola potongan yang sama.
  if (Array.isArray(target)) q = q.in('submission_id', target);
  else if (target) q = q.eq('submission_id', target);

  const { data, error, count } = await q.order('ordinal', { ascending: true });

  if (error) throw error;

  const rows = (data || []) as any[];

  // Kalau PostgREST memotong hasilnya (`db-max-rows`), papan akan tetap tampil
  // rapi sambil DIAM-DIAM kehilangan jadwal — dan yang paling mungkin hilang
  // adalah baris paling belakang, yaitu order terbaru. Lebih baik berisik.
  if (count != null && count > rows.length) {
    console.warn(
      `fetchAdSchedules: server hanya mengirim ${rows.length} dari ${count} baris. ` +
      `Papan Schedule sedang menampilkan data TIDAK LENGKAP — sudah waktunya query ini dipaginasi.`
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
    { published: boolean; isExtraAd: boolean; placeholderBanner: boolean }
  >();
  if (regularIds.length > 0) {
    const pages = await selectSurveyPagesByIds<{
      submission_id: string;
      is_published: boolean | null;
      is_extra_ad: boolean | null;
      banner_url: string | null;
    }>('submission_id, is_published, is_extra_ad, banner_url', regularIds);
    for (const p of pages) {
      pageBySubmission.set(p.submission_id, {
        published: !!p.is_published,
        isExtraAd: !!p.is_extra_ad,
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
      isExtraAd: page?.isExtraAd ?? false,
      // Hanya bermakna untuk halaman yang BENAR-BENAR ada. Kilat dan order tanpa
      // halaman keduanya false — lihat komentar di AdScheduleEntry.
      pageBannerIsPlaceholder: pageStatus === 'none' || pageStatus === 'kilat'
        ? false
        : (page?.placeholderBanner ?? false),
    };
  });
};

/** Pembayaran milik SATU jadwal, bukan satu order. */
export interface SchedulePayment {
  /** Status transaksi terbaru untuk jadwal ini. */
  status: string | null;
  paymentId: string | null;
  paymentUrl: string | null;
  amount: number;
  /** Berapa kali dicoba bayar. 76 jadwal di produksi punya lebih dari satu. */
  attempts: number;
  hasEverPaid: boolean;
  paymentMethod?: string | null;
  paymentChannel?: string | null;
}

/**
 * Peta jadwal -> pembayarannya, untuk satu order.
 *
 * ⚠️ INI YANG MEMBUAT PEMBAYARAN BOLEH MASUK KE DALAM KARTU JADWAL.
 * `transactions` sudah membedakan pemiliknya sejak lama lewat `entity_type` +
 * `extend_id` — 617 baris 'submission' dan 10 baris 'extend' per 2026-08-08,
 * `entity_type` konsisten 100%. Jadi menautkan pembayaran ke jadwal bukan
 * kemampuan baru; ia sudah ada dan belum pernah dipakai di layar admin.
 *
 * Kuncinya `sourceId`, bukan `submissionId`: sebuah order berjadwal banyak
 * punya beberapa transaksi, dan memakai `submissionId` akan menempelkan
 * pembayaran jadwal #2 ke kartu jadwal #1.
 *
 * Task 11 akan menggantikan pencocokan ini dengan kolom `schedule_id` yang
 * eksplisit; sampai saat itu bentuk lama inilah satu-satunya penautnya.
 *
 * ⚠️ SATU PEMBAYARAN PER JADWAL — JANGAN DIJADIKAN DAFTAR SEBELUM TASK 11.
 * Beberapa baris untuk satu `sourceId` di data hari ini adalah PERCOBAAN BAYAR
 * BERULANG, bukan tagihan terpisah: 82 sumber punya >1 baris, dan pada 33 di
 * antaranya menjumlahkan `amount` melebihi yang benar-benar dibayar (satu order
 * nyata: lunas Rp 1.150.000, jumlah semua baris Rp 3.450.000). Karena itu
 * `amount` di sini adalah nilai transaksi TERBARU dan `attempts` hanya
 * mencacah percobaan. Rancangan multi-invoice per jadwal ada di rencana
 * Task 13 dan butuh `schedule_id` dari Task 11 lebih dulu.
 */
export const fetchSchedulePayments = async (
  submissionId: string,
  schedules: AdScheduleEntry[],
): Promise<Map<string, SchedulePayment>> => {
  const { data, error } = await supabase
    .from('transactions')
    .select('payment_id, payment_url, amount, status, entity_type, extend_id, created_at, payment_method, payment_channel')
    .eq('form_submission_id', submissionId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const bySource = new Map<string, any[]>();
  for (const tx of data || []) {
    // entity_type 'extend' -> milik baris form_submissions_extend tertentu.
    // Selain itu -> jadwal pertama, yang source_id-nya adalah id submission.
    const key = tx.entity_type === 'extend' && tx.extend_id ? tx.extend_id : submissionId;
    const list = bySource.get(key);
    if (list) list.push(tx);
    else bySource.set(key, [tx]);
  }

  const out = new Map<string, SchedulePayment>();
  for (const s of schedules) {
    const txs = bySource.get(s.sourceId);
    if (!txs || txs.length === 0) continue;
    const unpaid = txs.find((t) => !['paid', 'completed'].includes(t.status));
    const paidTx = txs.find((t) => ['paid', 'completed'].includes(t.status)) || txs[0];
    out.set(s.id, {
      status: txs[0].status,
      paymentId: txs[0].payment_id || null,
      paymentUrl: unpaid?.payment_url || txs[0].payment_url || null,
      amount: Number(txs[0].amount || 0),
      attempts: txs.length,
      hasEverPaid: txs.some((t) => ['paid', 'completed'].includes(t.status)),
      paymentMethod: paidTx?.payment_method || null,
      paymentChannel: paidTx?.payment_channel || null,
    });
  }
  return out;
};
