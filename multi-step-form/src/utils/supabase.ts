import { createClient } from '@supabase/supabase-js';

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

// Fungsi untuk memeriksa koneksi Supabase
export const checkSupabaseConnection = async (): Promise<boolean> => {
  try {
    // Jika menggunakan placeholder, langsung return false
    if (isPlaceholderUrl || isPlaceholderKey) {
      console.warn('Using placeholder Supabase credentials, running in offline mode');
      return false;
    }

    // Coba melakukan query sederhana dengan timeout
    const timeoutPromise = new Promise<{error: any}>((_, reject) =>
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
  } catch (error) {
    console.error('Error checking Supabase connection:', error);
    return false;
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
}

// Tipe data untuk transactions
export interface Transaction {
  id?: string;
  form_submission_id: string;
  payment_id?: string;
  payment_method?: string;
  amount: number;
  status: string;
  payment_url?: string;
  created_at?: string;
  updated_at?: string;
}

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
  } catch (error) {
    console.error('Error getting form submission:', error);

    // Tambahkan informasi tambahan ke error untuk debugging
    if (error.message) {
      error.message = `Error fetching form ID ${id}: ${error.message}`;
    }

    // Throw error dengan informasi yang lebih jelas
    throw new Error(`Gagal mengambil data form: ${error.message || 'Unknown error'}`);
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
