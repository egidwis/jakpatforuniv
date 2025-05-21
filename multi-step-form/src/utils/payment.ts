import axios from 'axios';
import { supabase } from './supabase';
import type { FormSubmission, Transaction } from './supabase';

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

  console.log('Checking API key:', apiKey ? 'API key exists' : 'No API key');

  // Jika API key ada dan bukan nilai default, gunakan mode produksi
  const isSimulation = !apiKey || apiKey === 'your-mayar-api-key' || apiKey.trim() === '';

  console.log('Is simulation mode:', isSimulation);

  return isSimulation;

  // Untuk debugging, uncomment baris di bawah ini untuk memaksa mode produksi
  // return false;
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

      // Gunakan hardcoded URL untuk menghindari masalah dengan window.location.origin
      const origin = "https://submit.jakpatforuniv.com";

      // Return URL simulasi
      return `${origin}/payment-success?id=${formSubmissionId}&simulation=true`;
    }

    // Mode produksi - Buat invoice di Mayar
    console.log('Using production mode with Mayar API');

    // Validasi API key
    const apiKey = import.meta.env.VITE_MAYAR_API_KEY;

    // Deteksi placeholder API key
    const isPlaceholderApiKey = !apiKey || apiKey.trim() === '' || apiKey.includes('your-mayar-api-key');

    if (isPlaceholderApiKey) {
      console.warn('Mayar API key is missing, empty, or using placeholder - using simulation mode');
      // Gunakan hardcoded URL untuk menghindari masalah dengan window.location.origin
      const origin = "https://submit.jakpatforuniv.com";

      // Langsung return URL simulasi jika API key tidak ada atau placeholder
      return `${origin}/payment-success?id=${formSubmissionId}&simulation=true`;
    }

    // Ambil webhook token dari environment variables
    const webhookToken = import.meta.env.VITE_MAYAR_WEBHOOK_TOKEN;
    console.log('Webhook token available:', webhookToken ? 'Yes' : 'No');

    // Gunakan hardcoded URL untuk menghindari masalah dengan window.location.origin
    const origin = "https://submit.jakpatforuniv.com";

    // Log request data untuk debugging - format sesuai dokumentasi Mayar
    const requestData = {
      name: customerInfo.fullName || 'Pengguna',
      email: customerInfo.email || 'user@example.com',
      amount: amount,
      mobile: customerInfo.phoneNumber || '08123456789',
      redirectUrl: `${origin}/payment-success?id=${formSubmissionId}`,
      description: `Pembayaran Survey - ${customerInfo.title}`,
      expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 jam
      webhookUrl: `${origin}/webhook` // URL webhook untuk notifikasi pembayaran
    };

    console.log('Mayar request data:', requestData);

    // Buat invoice di Mayar
    console.log('Sending request to Mayar API with API key:', apiKey.substring(0, 10) + '...');

    let response;

    // Coba beberapa format header Authorization yang berbeda
    try {
      // Persiapkan header untuk request - format sesuai dokumentasi Mayar
      const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };

      // Tambahkan webhook token ke header jika tersedia
      const webhookToken = import.meta.env.VITE_MAYAR_WEBHOOK_TOKEN;
      if (webhookToken) {
        headers['X-Webhook-Token'] = webhookToken;
      }

      console.log('Using headers:', {
        Authorization: 'Bearer ' + apiKey.substring(0, 10) + '...',
        'Content-Type': 'application/json',
        ...(webhookToken ? { 'X-Webhook-Token': 'configured' } : {})
      });

      response = await axios.post(
        'https://api.mayar.id/hl/v1/payment/create',
        requestData,
        {
          headers,
          timeout: 15000 // 15 detik timeout
        }
      );

      console.log('Mayar API response received successfully with Bearer token');
    } catch (apiError) {
      console.error('Error with Bearer token format, trying alternative format:', apiError.message);

      try {
        // Jika format Bearer gagal, coba format tanpa Bearer
        console.log('Trying alternative authorization format');

        // Persiapkan header alternatif
        const altHeaders = {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey // Tambahkan X-API-KEY sebagai alternatif
        };

        // Tambahkan webhook token ke header jika tersedia
        const webhookToken = import.meta.env.VITE_MAYAR_WEBHOOK_TOKEN;
        if (webhookToken) {
          altHeaders['X-Webhook-Token'] = webhookToken;
        }

        console.log('Using alternative headers:', {
          Authorization: apiKey.substring(0, 10) + '...',
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey.substring(0, 10) + '...',
          ...(webhookToken ? { 'X-Webhook-Token': 'configured' } : {})
        });

        response = await axios.post(
          'https://api.mayar.id/hl/v1/payment/create',
          requestData,
          {
            headers: altHeaders,
            timeout: 15000 // 15 detik timeout
          }
        );

        console.log('Mayar API response received with alternative auth format');
      } catch (altError) {
        console.error('Alternative authorization format failed:', altError.message);

        // Coba format ketiga - menggunakan header Basic Auth
        try {
          console.log('Trying Basic Auth format as last resort');

          // Encode API key untuk Basic Auth
          const encodedAuth = btoa(apiKey + ':');

          const basicAuthHeaders = {
            'Authorization': `Basic ${encodedAuth}`,
            'Content-Type': 'application/json'
          };

          console.log('Using Basic Auth headers');

          response = await axios.post(
            'https://api.mayar.id/hl/v1/payment/create',
            requestData,
            {
              headers: basicAuthHeaders,
              timeout: 15000 // 15 detik timeout
            }
          );

          console.log('Mayar API response received with Basic Auth format');
        } catch (basicAuthError) {
          console.error('All authorization formats failed:', basicAuthError.message);
          throw basicAuthError; // Re-throw untuk ditangkap oleh catch di luar
        }
      }
    }

    // Validasi response
    if (!response || !response.data || !response.data.payment_url) {
      console.error('Invalid response from Mayar API:', response?.data);
      throw new Error('Response dari Mayar API tidak valid');
    }

    // Log response untuk debugging
    console.log('Mayar API response:', response.data);

    // Validasi response sesuai format Mayar
    if (!response.data || response.data.statusCode !== 200 || !response.data.data || !response.data.data.link) {
      console.error('Invalid response format from Mayar API:', response.data);
      throw new Error('Format respons dari gateway pembayaran tidak valid');
    }

    // Ekstrak data dari response sesuai format Mayar
    const paymentUrl = response.data.data.link;
    const transactionId = response.data.data.id || response.data.data.transaction_id;

    console.log('Payment URL received:', paymentUrl);
    console.log('Transaction ID:', transactionId);

    // Simpan data transaksi ke Supabase
    const transactionData: Transaction = {
      form_submission_id: formSubmissionId,
      payment_id: transactionId,
      payment_method: 'mayar',
      amount,
      status: 'pending',
      payment_url: paymentUrl
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

    // Return payment URL dari response Mayar
    return paymentUrl;
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

    // Gunakan hardcoded URL untuk menghindari masalah dengan window.location.origin
    const origin = "https://submit.jakpatforuniv.com";

    // Return URL simulasi sebagai fallback
    return `${origin}/payment-success?id=${formSubmissionId}&simulation=true`;
  }
};

// Fungsi untuk memverifikasi status pembayaran
export const verifyPayment = async (paymentId: string) => {
  try {
    // Gunakan endpoint yang benar sesuai dokumentasi Mayar
    const response = await axios.get(
      `https://api.mayar.id/hl/v1/payment/${paymentId}`,
      {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_MAYAR_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Verify payment response:', response.data);

    // Validasi response sesuai format Mayar
    if (!response.data || response.data.statusCode !== 200) {
      throw new Error('Invalid response from Mayar verification API');
    }

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
