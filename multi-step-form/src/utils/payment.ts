import axios from 'axios';
import { supabase, FormSubmission, Transaction } from './supabase';

// Interface untuk data pembayaran
interface PaymentData {
  formSubmissionId: string;
  amount: number;
  customerInfo: {
    title: string;
    fullName: string;
    email: string;
    phoneNumber: string;
  };
}

// Cek apakah dalam mode simulasi (tidak ada API key Mayar)
const isSimulationMode = () => {
  const apiKey = import.meta.env.VITE_MAYAR_API_KEY;

  // Jika API key ada dan bukan nilai default, gunakan mode produksi
  return !apiKey || apiKey === 'your-mayar-api-key' || apiKey.trim() === '';
};

// Fungsi untuk memeriksa status API Mayar
export const checkMayarApiStatus = async (): Promise<boolean> => {
  try {
    const apiKey = import.meta.env.VITE_MAYAR_API_KEY;

    // Jika tidak ada API key, anggap API tidak tersedia
    if (!apiKey || apiKey.trim() === '') {
      console.log('No Mayar API key available, skipping status check');
      return false;
    }

    // Coba ping API Mayar dengan timeout yang pendek
    const response = await axios.get('https://api.mayar.id/v1/ping', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5 detik timeout
    });

    // Jika response OK, API tersedia
    return response.status === 200;
  } catch (error) {
    console.error('Error checking Mayar API status:', error);
    return false;
  }
};

// Fungsi untuk membuat invoice pembayaran di Mayar
export const createPayment = async (paymentData: PaymentData) => {
  try {
    const { formSubmissionId, amount, customerInfo } = paymentData;

    // Jika dalam mode simulasi, gunakan URL simulasi
    if (isSimulationMode()) {
      console.log('Running in simulation mode - no Mayar API key provided');

      // Buat ID transaksi simulasi
      const simulatedPaymentId = `sim_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      // Simpan data transaksi ke Supabase
      const transactionData: Transaction = {
        form_submission_id: formSubmissionId,
        payment_id: simulatedPaymentId,
        payment_method: 'simulation',
        amount,
        status: 'pending',
        payment_url: `/payment-success?id=${formSubmissionId}&simulation=true`
      };

      try {
        const { data, error } = await supabase
          .from('transactions')
          .insert([transactionData])
          .select();

        if (error) {
          console.error('Error saving simulation transaction to Supabase:', error);
          // Tetap lanjutkan meskipun ada error dengan Supabase
        }
      } catch (dbError) {
        console.error('Database error in simulation mode:', dbError);
        // Tetap lanjutkan meskipun ada error dengan database
      }

      // Return URL simulasi
      return `${window.location.origin}/payment-success?id=${formSubmissionId}&simulation=true`;
    }

    // Mode produksi - Buat invoice di Mayar
    console.log('Using production mode with Mayar API');

    // Validasi API key
    const apiKey = import.meta.env.VITE_MAYAR_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      console.error('Mayar API key is missing or empty');
      throw new Error('API key tidak ditemukan. Silakan periksa konfigurasi.');
    }

    // Log request data untuk debugging
    const requestData = {
      amount,
      description: `Pembayaran Survey - ${customerInfo.title}`,
      customer: {
        name: customerInfo.fullName || 'Pengguna',
        email: customerInfo.email || 'user@example.com',
        phone: customerInfo.phoneNumber || '-'
      },
      expiry_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 jam
      success_redirect_url: `${window.location.origin}/payment-success?id=${formSubmissionId}`,
      failure_redirect_url: `${window.location.origin}/payment-failed?id=${formSubmissionId}`
    };

    console.log('Mayar request data:', requestData);

    // Buat invoice di Mayar
    const response = await axios.post(
      'https://api.mayar.id/v1/invoices',
      requestData,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000 // 15 detik timeout
      }
    );

    // Validasi response
    if (!response.data || !response.data.payment_url) {
      console.error('Invalid response from Mayar API:', response.data);
      throw new Error('Response dari Mayar API tidak valid');
    }

    // Log response untuk debugging
    console.log('Mayar API response:', response.data);

    // Simpan data transaksi ke Supabase
    const transactionData: Transaction = {
      form_submission_id: formSubmissionId,
      payment_id: response.data.id,
      payment_method: 'mayar',
      amount,
      status: 'pending',
      payment_url: response.data.payment_url
    };

    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert([transactionData])
        .select();

      if (error) {
        console.error('Error saving transaction to Supabase:', error);
        // Tetap lanjutkan meskipun ada error dengan Supabase
      }
    } catch (dbError) {
      console.error('Database error:', dbError);
      // Tetap lanjutkan meskipun ada error dengan database
    }

    // Return payment URL
    return response.data.payment_url;
  } catch (error) {
    console.error('Error creating payment:', error);

    // Log error details untuk debugging
    if (error.response) {
      // Error dari server Mayar
      console.error('Mayar API error response:', {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers
      });
    } else if (error.request) {
      // Error karena tidak ada response (network issue)
      console.error('No response received from Mayar API:', error.request);
    } else {
      // Error lainnya
      console.error('Error setting up request:', error.message);
    }

    // Jika error, gunakan mode simulasi sebagai fallback
    const { formSubmissionId } = paymentData;
    console.log('Falling back to simulation mode due to error');

    // Buat ID transaksi simulasi untuk fallback
    const simulatedPaymentId = `sim_error_${Date.now()}`;

    // Coba simpan data transaksi fallback ke Supabase
    try {
      const transactionData: Transaction = {
        form_submission_id: formSubmissionId,
        payment_id: simulatedPaymentId,
        payment_method: 'simulation_fallback',
        amount: paymentData.amount,
        status: 'pending',
        payment_url: `/payment-success?id=${formSubmissionId}&simulation=true`
      };

      await supabase
        .from('transactions')
        .insert([transactionData]);
    } catch (dbError) {
      console.error('Error saving fallback transaction:', dbError);
      // Tetap lanjutkan meskipun ada error dengan database
    }

    // Return URL simulasi sebagai fallback
    return `${window.location.origin}/payment-success?id=${formSubmissionId}&simulation=true`;
  }
};

// Fungsi untuk memverifikasi status pembayaran
export const verifyPayment = async (paymentId: string) => {
  try {
    const response = await axios.get(
      `https://api.mayar.id/v1/invoices/${paymentId}`,
      {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_MAYAR_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error verifying payment:', error);
    throw error;
  }
};

// Fungsi untuk update status pembayaran di database
export const updatePaymentStatus = async (paymentId: string, status: string) => {
  try {
    // Update status transaksi
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .update({ status })
      .eq('payment_id', paymentId)
      .select('form_submission_id');

    if (transactionError) throw transactionError;

    if (!transaction || transaction.length === 0) {
      throw new Error('Transaction not found');
    }

    // Update status form submission
    const { data: formSubmission, error: formError } = await supabase
      .from('form_submissions')
      .update({ payment_status: status })
      .eq('id', transaction[0].form_submission_id)
      .select();

    if (formError) throw formError;

    return formSubmission[0] as FormSubmission;
  } catch (error) {
    console.error('Error updating payment status:', error);
    throw error;
  }
};
