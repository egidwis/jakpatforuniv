import { createClient } from '@supabase/supabase-js';

// Supabase URL dan anon key akan diambil dari environment variables
// Anda perlu menambahkan variabel ini di file .env.local
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Buat Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Tipe data untuk form submissions
export type FormSubmission = {
  id?: string;
  survey_url: string;
  title: string;
  description: string;
  question_count: number;
  criteria_responden?: string;
  duration: number;
  start_date: string;
  end_date: string;
  full_name?: string;
  email?: string;
  phone_number?: string;
  university?: string;
  department?: string;
  status?: string;
  winner_count?: number;
  prize_per_winner?: number;
  voucher_code?: string;
  total_cost: number;
  payment_status?: string;
  created_at?: string;
  updated_at?: string;
};

// Tipe data untuk transactions
export type Transaction = {
  id?: string;
  form_submission_id: string;
  payment_id?: string;
  payment_method?: string;
  amount: number;
  status: string;
  payment_url?: string;
  created_at?: string;
  updated_at?: string;
};

// Fungsi untuk menyimpan form submission
export const saveFormSubmission = async (formData: FormSubmission) => {
  try {
    const { data, error } = await supabase
      .from('form_submissions')
      .insert([formData])
      .select();

    if (error) throw error;
    return data[0];
  } catch (error) {
    console.error('Error saving form submission:', error);
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
  } catch (error) {
    console.error('Error creating transaction:', error);
    throw error;
  }
};

// Fungsi untuk mendapatkan form submission berdasarkan ID
export const getFormSubmissionById = async (id: string) => {
  try {
    console.log('Fetching form submission with ID:', id);

    // Cek koneksi ke Supabase terlebih dahulu
    try {
      const { error: pingError } = await supabase.from('form_submissions').select('count').limit(1);
      if (pingError) {
        console.warn('Supabase connection test failed:', pingError);
      }
    } catch (pingError) {
      console.error('Failed to ping Supabase:', pingError);
    }

    // Lanjutkan dengan query utama
    const { data, error } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Supabase error when fetching form submission:', error);
      throw error;
    }

    if (!data) {
      console.warn('No data found for form submission ID:', id);
      return null;
    }

    console.log('Form submission data retrieved successfully');
    return data;
  } catch (error) {
    console.error('Error getting form submission:', error);

    // Tambahkan informasi tambahan ke error untuk debugging
    if (error.message) {
      error.message = `Error fetching form ID ${id}: ${error.message}`;
    }

    throw error;
  }
};

// Fungsi untuk update status pembayaran
export const updatePaymentStatus = async (id: string, status: string) => {
  try {
    const { data, error } = await supabase
      .from('form_submissions')
      .update({ payment_status: status })
      .eq('id', id)
      .select();

    if (error) throw error;
    return data[0];
  } catch (error) {
    console.error('Error updating payment status:', error);
    throw error;
  }
};
