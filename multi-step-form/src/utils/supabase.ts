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
        redirectTo: redirectTo || `${window.location.origin}`,
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

export const signUp = async (email: string, password: string, fullName: string) => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
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
  submission_status?: string;
  referral_source?: string;
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
  note?: string;
  created_at?: string;
  updated_at?: string;
}

// Tipe data untuk invoices
export interface Invoice {
  id?: string;
  form_submission_id: string;
  payment_id: string;
  invoice_url: string;
  amount: number;
  status: string;
  created_at?: string;
  expires_at?: string;
  paid_at?: string;
}

export interface ScheduledAd {
  id?: string;
  form_submission_id: string;
  start_date: string;
  end_date: string;
  ad_link: string;
  notes?: string;
  google_calendar_event_id?: string;
  created_at?: string;
  created_by?: string;
  // Joins
  form_title?: string; // from form_submissions
  researcher_name?: string; // from form_submissions
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
  } catch (error: any) {
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
  } catch (error: any) {
    console.error('Error updating payment status:', error);
    throw error;
  }
};

// Fungsi untuk update status form
export const updateFormStatus = async (id: string, status: string) => {
  try {
    const { data, error } = await supabase
      .from('form_submissions')
      .update({ submission_status: status })
      .eq('id', id)
      .select();

    if (error) throw error;
    return data[0];
  } catch (error: any) {
    console.error('Error updating form status:', error);
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

// Fungsi untuk mendapatkan form submissions dengan pagination
export const getFormSubmissionsPaginated = async (page: number, limit: number, searchQuery: string = '') => {
  try {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('form_submissions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (searchQuery) {
      // Simple search on title or researcher name if needed, but usually search is client side in simple apps.
      // However, for proper pagination search should be server side.
      // Let's implement basic server side search for title and full_name
      query = query.or(`title.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;
    return { data, count };
  } catch (error: any) {
    console.error('Error getting paginated submissions:', error);
    throw error;
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

// Fungsi untuk mendapatkan submissions berdasarkan email user
export const getFormSubmissionsByEmail = async (email: string) => {
  try {
    const { data, error } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('email', email) // Match by email only (user_id column doesn't exist)
      .order('created_at', { ascending: false });

    // Fallback simple query if OR fails or for simplicity (User asked for email match)
    // const { data, error } = await supabase
    //   .from('form_submissions')
    //   .select('*')
    //   .eq('email', email)
    //   .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('Error getting user submissions:', error);
    // Return empty array instead of throwing to prevent page crash
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
    const { data: existingSession, error: fetchError } = await supabase
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

export const createScheduledAd = async (adData: ScheduledAd) => {
  try {
    const { data, error } = await supabase
      .from('scheduled_ads')
      .insert([adData])
      .select();

    if (error) throw error;
    return data[0];
  } catch (error: any) {
    console.error('Error creating scheduled ad:', error);
    throw error;
  }
};

export const getScheduledAds = async () => {
  try {
    // Join with form_submissions to get details
    const { data, error } = await supabase
      .from('scheduled_ads')
      .select(`
        *,
        form_submissions (
          title,
          full_name
        )
      `)
      .order('start_date', { ascending: true });

    if (error) throw error;

    // Flatten logic if needed, but for now return as is or map
    return data.map((item: any) => ({
      ...item,
      form_title: item.form_submissions?.title || 'Unknown Title',
      researcher_name: item.form_submissions?.full_name || 'Unknown Researcher'
    }));
  } catch (error: any) {
    console.error('Error fetching scheduled ads:', error);
    return [];
  }
};
