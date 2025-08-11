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

  // Cek apakah kita dalam mode offline (tidak ada koneksi internet)
  const isOfflineMode = localStorage.getItem('isOfflineMode') === 'true';
  if (isOfflineMode) {
    console.log('Running in offline mode - no internet connection');
    return true;
  }

  // Jika API key ada dan bukan nilai default, gunakan mode produksi
  return !apiKey || apiKey === 'your-mayar-api-key' || apiKey.trim() === '';

  // Untuk debugging, kita bisa memaksa mode simulasi dengan mengembalikan true
  // return true;
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

    console.log('Checking Mayar API status...');

    // Coba ping API Mayar melalui proxy untuk menghindari CORS
    const response = await axios.post('/api/mayar-proxy', {
      endpoint: 'https://api.mayar.id/v1/ping',
      method: 'GET',
      apiKey: apiKey // Kirim API key ke proxy
    }, {
      timeout: 5000 // 5 detik timeout
    });

    console.log('Mayar API status check response:', response.status);

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
        const { error } = await supabase
          .from('transactions')
          .insert([transactionData])
          .select();

        if (error) {
          console.error('Error saving simulation transaction to Supabase:', error);
        } else {
          // Dalam mode simulasi, langsung update status ke completed
          await updatePaymentStatus(simulatedPaymentId, 'completed');
        }
      } catch (dbError) {
        console.error('Database error in simulation mode:', dbError);
        // Continue even if there's a database error
      }

      // Return URL simulasi
      return `${window.location.origin}/payment-success?id=${formSubmissionId}&simulation=true`;
    }

    // Mode produksi - Buat invoice di Mayar
    console.log('Using production mode with Mayar API');

    // Gunakan hardcoded URL untuk menghindari masalah dengan window.location.origin
    const origin = "https://submit.jakpatforuniv.com";

    // Log request data untuk debugging - format sesuai dokumentasi Mayar
    const requestData = {
      name: customerInfo.fullName || 'Pengguna',
      email: customerInfo.email || 'user@example.com',
      amount: amount,
      mobile: customerInfo.phoneNumber || '08123456789',
      redirectUrl: `${origin}/payment-success?id=${formSubmissionId}`,
      failureUrl: `${origin}/payment-failed?id=${formSubmissionId}`,
      description: `Pembayaran Survey - ${customerInfo.title}`,
      expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 jam
      webhookUrl: `${origin}/webhook` // URL webhook untuk notifikasi pembayaran
    };

    console.log('Mayar request data:', requestData);

    // Ambil API key dan webhook token
    const apiKey = import.meta.env.VITE_MAYAR_API_KEY;
    const webhookToken = import.meta.env.VITE_MAYAR_WEBHOOK_TOKEN;

    // Gunakan Cloudflare Function sebagai proxy untuk mengatasi masalah CORS
    try {
      console.log('Using Cloudflare Function proxy for Mayar API');

      // Tambahkan endpoint, API key, dan webhook token ke request data
      const proxyRequestData = {
        ...requestData,
        endpoint: 'https://api.mayar.id/hl/v1/payment/create',
        apiKey: apiKey, // Kirim API key ke proxy
        webhookToken: webhookToken // Kirim webhook token ke proxy
      };

      console.log('Sending request to proxy with API key and webhook token included');

      // Panggil Cloudflare Function proxy dengan retry logic
      let retryCount = 0;
      const maxRetries = 2;
      let response;

      while (retryCount <= maxRetries) {
        try {
          response = await axios.post(
            '/api/mayar-proxy',
            proxyRequestData,
            {
              timeout: 15000 // 15 detik timeout
            }
          );
          console.log('Mayar API response received via proxy successfully');
          break; // Keluar dari loop jika berhasil
        } catch (retryError) {
          retryCount++;
          console.error(`Proxy attempt ${retryCount} failed:`, retryError);

          if (retryCount > maxRetries) {
            throw retryError; // Re-throw jika sudah mencapai batas retry
          }

          // Tunggu sebentar sebelum retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log('Mayar API response received via proxy successfully:', response.data);

      // Validasi response
      if (!response || !response.data) {
        console.error('Invalid response from Mayar API:', response?.data);
        throw new Error('Response dari Mayar API tidak valid');
      }

      // Coba ekstrak payment URL dan ID dari berbagai format response yang mungkin
      let paymentUrl = '';
      let transactionId = '';

      // Format 1: response.data.data.link (format dokumentasi)
      if (response.data.data && response.data.data.link) {
        paymentUrl = response.data.data.link;
        transactionId = response.data.data.id || response.data.data.transaction_id || '';
        console.log('Extracted payment URL using format 1 (data.data.link)');
      }
      // Format 2: response.data.payment_url (format lama)
      else if (response.data.payment_url) {
        paymentUrl = response.data.payment_url;
        transactionId = response.data.id || response.data.transaction_id || '';
        console.log('Extracted payment URL using format 2 (data.payment_url)');
      }
      // Format 3: response.data.url (format alternatif)
      else if (response.data.url) {
        paymentUrl = response.data.url;
        transactionId = response.data.id || response.data.transaction_id || '';
        console.log('Extracted payment URL using format 3 (data.url)');
      }
      // Format 4: response.data.data.url (format alternatif)
      else if (response.data.data && response.data.data.url) {
        paymentUrl = response.data.data.url;
        transactionId = response.data.data.id || response.data.data.transaction_id || '';
        console.log('Extracted payment URL using format 4 (data.data.url)');
      }

      // Jika tidak ada URL yang ditemukan, throw error
      if (!paymentUrl) {
        console.error('Could not extract payment URL from response:', response.data);
        throw new Error('Tidak dapat menemukan URL pembayaran dalam respons');
      }

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
        const { error } = await supabase
          .from('transactions')
          .insert([transactionData])
          .select();

        if (error) {
          console.error('Error saving transaction to Supabase:', error);
        }
      } catch (dbError) {
        console.error('Database error:', dbError);
      }

      // Return payment URL dari response Mayar
      return paymentUrl;
    } catch (error) {
      console.error('Error with Mayar API proxy:', error);
      throw error;
    }
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

    // Jika error, coba gunakan mode simulasi sebagai fallback
    console.log('Falling back to simulation mode due to error');
    const simulatedPaymentId = `sim_error_${Date.now()}`;
    const { formSubmissionId } = paymentData;

    // Simpan data transaksi simulasi ke Supabase
    try {
      const transactionData: Transaction = {
        form_submission_id: formSubmissionId,
        payment_id: simulatedPaymentId,
        payment_method: 'simulation_fallback',
        amount,
        status: 'pending',
        payment_url: `/payment-success?id=${formSubmissionId}&simulation=true`
      };

      const { error } = await supabase
        .from('transactions')
        .insert([transactionData])
        .select();

      if (error) {
        console.error('Error saving fallback transaction to Supabase:', error);
      } else {
        // Update status ke completed
        await updatePaymentStatus(simulatedPaymentId, 'completed');
      }
    } catch (dbError) {
      console.error('Database error in fallback mode:', dbError);
    }

    return `${window.location.origin}/payment-success?id=${formSubmissionId}&simulation=true`;
  }
};

// Fungsi untuk memverifikasi status pembayaran
export const verifyPayment = async (paymentId: string) => {
  try {
    // Ambil API key
    const apiKey = import.meta.env.VITE_MAYAR_API_KEY;

    // Gunakan Cloudflare Function proxy untuk verifikasi pembayaran
    const proxyRequestData = {
      endpoint: `https://api.mayar.id/hl/v1/payment/${paymentId}`,
      method: 'GET',
      apiKey: apiKey // Kirim API key ke proxy
    };

    console.log('Verifying payment with API key included');

    // Panggil proxy dengan metode POST tapi minta proxy melakukan GET request
    const response = await axios.post(
      '/api/mayar-verify',
      proxyRequestData,
      {
        timeout: 10000 // 10 detik timeout
      }
    );

    console.log('Verify payment response:', response.data);

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
