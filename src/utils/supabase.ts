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
    console.log('Attempting to save form submission:', formData);

    // Coba koneksi ke Supabase terlebih dahulu
    try {
      const { data: pingData, error: pingError } = await supabase.from('form_submissions').select('count').limit(1);
      if (pingError) {
        console.warn('Supabase connection test failed:', pingError);
      } else {
        console.log('Supabase connection test successful');
      }
    } catch (pingErr) {
      console.error('Failed to ping Supabase:', pingErr);
    }

    // Coba simpan data
    const { data, error } = await supabase
      .from('form_submissions')
      .insert([formData])
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      throw error;
    }

    console.log('Form submission saved successfully:', data[0]);
    return data[0];
  } catch (error: any) {
    console.error('Error saving form submission:', error);

    // Jika error adalah masalah koneksi atau DNS, gunakan mode offline
    if (
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('Network Error') ||
      error.message?.includes('ERR_NAME_NOT_RESOLVED')
    ) {
      console.log('Using offline mode due to connection issues');

      // Buat ID simulasi
      const offlineId = `offline_${Date.now()}`;

      // Simpan data di localStorage untuk sinkronisasi nanti
      const offlineData = {
        ...formData,
        id: offlineId,
        created_at: new Date().toISOString(),
        status: 'pending',
        payment_status: 'offline'
      };

      try {
        // Simpan di localStorage
        const existingData = localStorage.getItem('offlineFormSubmissions');
        const offlineSubmissions = existingData ? JSON.parse(existingData) : [];
        offlineSubmissions.push(offlineData);
        localStorage.setItem('offlineFormSubmissions', JSON.stringify(offlineSubmissions));

        console.log('Data saved in offline mode:', offlineData);
        return offlineData;
      } catch (localStorageError) {
        console.error('Failed to save in offline mode:', localStorageError);
      }
    }

    throw error;
  }
};

// Fungsi untuk membuat transaksi
export const createTransaction = async (transaction: Transaction) => {
  try {
    console.log('Attempting to create transaction:', transaction);

    // Cek apakah form_submission_id adalah ID offline
    if (transaction.form_submission_id.startsWith('offline_')) {
      console.log('Detected offline form submission ID, using offline mode for transaction');

      // Buat ID transaksi offline
      const offlineTransactionId = `offline_tx_${Date.now()}`;

      // Buat data transaksi offline
      const offlineTransaction = {
        ...transaction,
        id: offlineTransactionId,
        status: 'offline',
        created_at: new Date().toISOString()
      };

      // Simpan di localStorage
      try {
        const existingDataStr = localStorage.getItem('offlineTransactions');
        const offlineTransactions = existingDataStr ? JSON.parse(existingDataStr) : [];
        offlineTransactions.push(offlineTransaction);
        localStorage.setItem('offlineTransactions', JSON.stringify(offlineTransactions));

        console.log('Transaction saved in offline mode:', offlineTransaction);
        return offlineTransaction;
      } catch (localStorageError) {
        console.error('Failed to save transaction in offline mode:', localStorageError);
        throw localStorageError;
      }
    }

    // Jika bukan ID offline, simpan di Supabase
    const { data, error } = await supabase
      .from('transactions')
      .insert([transaction])
      .select();

    if (error) {
      console.error('Supabase transaction insert error:', error);
      throw error;
    }

    console.log('Transaction created successfully:', data[0]);
    return data[0];
  } catch (error: any) {
    console.error('Error creating transaction:', error);

    // Jika error adalah masalah koneksi, gunakan mode offline
    if (
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('Network Error') ||
      error.message?.includes('ERR_NAME_NOT_RESOLVED')
    ) {
      console.log('Connection issue, using offline mode for transaction');

      // Buat ID transaksi offline
      const offlineTransactionId = `offline_tx_${Date.now()}`;

      // Buat data transaksi offline
      const offlineTransaction = {
        ...transaction,
        id: offlineTransactionId,
        status: 'offline',
        created_at: new Date().toISOString()
      };

      // Simpan di localStorage
      try {
        const existingDataStr = localStorage.getItem('offlineTransactions');
        const offlineTransactions = existingDataStr ? JSON.parse(existingDataStr) : [];
        offlineTransactions.push(offlineTransaction);
        localStorage.setItem('offlineTransactions', JSON.stringify(offlineTransactions));

        console.log('Transaction saved in offline mode due to connection error:', offlineTransaction);
        return offlineTransaction;
      } catch (localStorageError) {
        console.error('Failed to save transaction in offline mode:', localStorageError);
      }
    }

    throw error;
  }
};

// Fungsi untuk mendapatkan form submission berdasarkan ID
export const getFormSubmissionById = async (id: string) => {
  try {
    console.log('Fetching form submission with ID:', id);

    // Cek apakah ini ID offline
    if (id.startsWith('offline_')) {
      console.log('Detected offline ID, checking localStorage');

      // Cari di localStorage
      const offlineDataStr = localStorage.getItem('offlineFormSubmissions');
      if (offlineDataStr) {
        const offlineSubmissions = JSON.parse(offlineDataStr);
        const submission = offlineSubmissions.find((sub: any) => sub.id === id);

        if (submission) {
          console.log('Found offline submission:', submission);
          return submission;
        }
      }

      throw new Error('Offline submission not found');
    }

    // Jika bukan ID offline, cari di Supabase
    const { data, error } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Supabase query error:', error);
      throw error;
    }

    console.log('Form submission fetched successfully:', data);
    return data;
  } catch (error: any) {
    console.error('Error getting form submission:', error);

    // Jika error adalah masalah koneksi, coba cari di localStorage
    if (
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('Network Error') ||
      error.message?.includes('ERR_NAME_NOT_RESOLVED')
    ) {
      console.log('Connection issue, checking localStorage for any matching submission');

      // Coba cari di localStorage berdasarkan ID
      const offlineDataStr = localStorage.getItem('offlineFormSubmissions');
      if (offlineDataStr) {
        const offlineSubmissions = JSON.parse(offlineDataStr);
        const submission = offlineSubmissions.find((sub: any) => sub.id === id);

        if (submission) {
          console.log('Found matching submission in localStorage:', submission);
          return submission;
        }
      }
    }

    throw error;
  }
};

// Fungsi untuk update status pembayaran
export const updatePaymentStatus = async (id: string, status: string) => {
  try {
    console.log(`Attempting to update payment status for ID ${id} to ${status}`);

    // Cek apakah ini ID offline
    if (id.startsWith('offline_')) {
      console.log('Detected offline ID, updating in localStorage');

      // Update di localStorage untuk form submissions
      const offlineDataStr = localStorage.getItem('offlineFormSubmissions');
      if (offlineDataStr) {
        const offlineSubmissions = JSON.parse(offlineDataStr);
        const updatedSubmissions = offlineSubmissions.map((sub: any) => {
          if (sub.id === id) {
            return { ...sub, payment_status: status };
          }
          return sub;
        });

        localStorage.setItem('offlineFormSubmissions', JSON.stringify(updatedSubmissions));

        // Cari submission yang diupdate untuk dikembalikan
        const updatedSubmission = updatedSubmissions.find((sub: any) => sub.id === id);
        if (updatedSubmission) {
          console.log('Updated offline submission:', updatedSubmission);
          return updatedSubmission;
        }
      }

      throw new Error('Offline submission not found for status update');
    }

    // Jika bukan ID offline, update di Supabase
    const { data, error } = await supabase
      .from('form_submissions')
      .update({ payment_status: status })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Supabase update error:', error);
      throw error;
    }

    console.log('Payment status updated successfully:', data[0]);
    return data[0];
  } catch (error: any) {
    console.error('Error updating payment status:', error);

    // Jika error adalah masalah koneksi, coba update di localStorage
    if (
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('Network Error') ||
      error.message?.includes('ERR_NAME_NOT_RESOLVED')
    ) {
      console.log('Connection issue, trying to update in localStorage');

      // Coba update di localStorage
      const offlineDataStr = localStorage.getItem('offlineFormSubmissions');
      if (offlineDataStr) {
        const offlineSubmissions = JSON.parse(offlineDataStr);

        // Cari submission dengan ID yang sesuai
        const submission = offlineSubmissions.find((sub: any) => sub.id === id);

        if (submission) {
          // Update status
          const updatedSubmission = { ...submission, payment_status: status };

          // Update di array
          const updatedSubmissions = offlineSubmissions.map((sub: any) => {
            if (sub.id === id) {
              return updatedSubmission;
            }
            return sub;
          });

          // Simpan kembali ke localStorage
          localStorage.setItem('offlineFormSubmissions', JSON.stringify(updatedSubmissions));

          console.log('Updated submission in localStorage:', updatedSubmission);
          return updatedSubmission;
        }
      }
    }

    throw error;
  }
};
