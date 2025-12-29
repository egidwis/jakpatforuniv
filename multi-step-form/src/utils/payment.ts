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

// Interface untuk data invoice (untuk admin manual invoice creation)
export interface InvoiceData {
  formSubmissionId: string;
  amount: number;
  description?: string;
  customerInfo?: {
    fullName?: string;
    email?: string;
    phoneNumber?: string;
  };
}

// Cek apakah dalam mode simulasi (tidak ada API key Mayar)
const isSimulationMode = () => {
  const apiKey = import.meta.env.VITE_MAYAR_API_KEY;

  console.log('Checking API key:', apiKey ? 'API key exists' : 'No API key');

  // Jika API key ada dan bukan nilai default, gunakan mode produksi
  const isSimulation = !apiKey || apiKey === 'your-mayar-api-key' || apiKey.trim() === '';

  console.log('Is simulation mode:', isSimulation);

  // Untuk debugging, uncomment baris di bawah ini untuk memaksa mode produksi
  return false; // Paksa mode produksi untuk testing
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

    // Coba ping API Mayar melalui proxy untuk menghindari CORS
    console.log('Checking Mayar API status via proxy');
    const response = await axios.post('/api/mayar-proxy', {
      endpoint: 'https://api.mayar.id/v1/ping',
      apiKey: apiKey,
      method: 'GET'
    }, {
      timeout: 5000 // 5 detik timeout
    });

    // Jika response OK, API tersedia
    console.log('Mayar API status check response:', response.status);
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
          // Tetap lanjutkan meskipun ada error dengan Supabase
        }
      } catch (dbError) {
        console.error('Database error in simulation mode:', dbError);
        // Tetap lanjutkan meskipun ada error dengan database
      }

      // Gunakan window.location.origin untuk mendapatkan URL dasar
      const origin = window.location.origin || "https://submit.jakpatforuniv.com";

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
      console.warn('Mayar API key is missing, empty, or using placeholder - but continuing with production mode');
      // Tetap lanjutkan dengan mode produksi meskipun API key tidak valid
      // Ini akan menghasilkan error yang lebih jelas dari Mayar API
    }

    // Ambil webhook token dari environment variables
    const webhookToken = import.meta.env.VITE_MAYAR_WEBHOOK_TOKEN;
    console.log('Webhook token available:', webhookToken ? 'Yes' : 'No');

    // Gunakan window.location.origin untuk mendapatkan URL dasar
    const origin = window.location.origin || "https://submit.jakpatforuniv.com";

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
      webhookUrl: `${origin}/api/webhook` // URL webhook untuk notifikasi pembayaran
    };

    // Log the redirect URLs for debugging
    console.log('Redirect URLs:', {
      success: `${origin}/payment-success?id=${formSubmissionId}`,
      failure: `${origin}/payment-failed?id=${formSubmissionId}`,
      webhook: `${origin}/api/webhook`
    });

    console.log('Mayar request data:', requestData);

    // Buat invoice di Mayar
    console.log('Sending request to Mayar API with API key:', apiKey.substring(0, 10) + '...');

    let response;

    // Coba dengan format header yang benar sesuai dokumentasi Mayar
    try {
      // Persiapkan header untuk request - format sesuai dokumentasi Mayar
      const headers: Record<string, string> = {
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
      } catch (error) {
        const proxyError = error as Error;
        console.error('Error with primary API endpoint:', proxyError.message);

        // Jika proxy gagal, coba endpoint standar melalui proxy
        console.log('Trying standard API endpoint via proxy');

        // Tambahkan endpoint standar, API key, dan webhook token ke request data
        const proxyRequestData = {
          ...requestData,
          endpoint: 'https://api.mayar.id/v1/invoices',
          apiKey: apiKey, // Kirim API key ke proxy
          webhookToken: webhookToken // Kirim webhook token ke proxy
        };

        console.log('Trying standard endpoint with API key and webhook token included');

        response = await axios.post(
          '/api/mayar-proxy',
          proxyRequestData,
          {
            timeout: 15000 // 15 detik timeout
          }
        );

        console.log('Mayar standard API response received via proxy successfully');
      }
    } catch (error) {
      const apiError = error as any;
      console.error('All API endpoints failed:', apiError.message);

      // Log error details untuk debugging
      if (apiError.response) {
        console.error('API error response:', {
          status: apiError.response.status,
          data: apiError.response.data,
          headers: apiError.response.headers
        });
      }

      throw apiError; // Re-throw untuk ditangkap oleh catch di luar
    }

    // Validasi response
    if (!response || !response.data) {
      console.error('Invalid response from Mayar API:', response?.data);
      throw new Error('Response dari Mayar API tidak valid');
    }

    // Log response untuk debugging
    console.log('Mayar API response:', response.data);

    // Log response untuk debugging
    console.log('Raw Mayar API response:', response.data);

    // Validasi response sesuai format Mayar
    if (!response.data) {
      console.error('Empty response from Mayar API');
      throw new Error('Response dari gateway pembayaran kosong');
    }

    // Coba ekstrak payment URL dan ID dari berbagai format response yang mungkin
    let paymentUrl = '';
    let transactionId = '';

    // Format 1: response.data.data.link (format dokumentasi)
    if (response.data.data && response.data.data.link) {
      paymentUrl = response.data.data.link;
      // PRIORITASKAN transactionId karena itu yang dikirim di webhook!
      transactionId = response.data.data.transactionId || response.data.data.transaction_id || response.data.data.id || '';
      console.log('Extracted payment URL using format 1 (data.data.link)');
      console.log('transactionId:', response.data.data.transactionId, 'id:', response.data.data.id);
    }
    // Format 2: response.data.payment_url (format lama)
    else if (response.data.payment_url) {
      paymentUrl = response.data.payment_url;
      transactionId = response.data.transactionId || response.data.transaction_id || response.data.id || '';
      console.log('Extracted payment URL using format 2 (data.payment_url)');
      console.log('transactionId:', response.data.transactionId, 'id:', response.data.id);
    }
    // Format 3: response.data.url (format alternatif)
    else if (response.data.url) {
      paymentUrl = response.data.url;
      transactionId = response.data.transactionId || response.data.transaction_id || response.data.id || '';
      console.log('Extracted payment URL using format 3 (data.url)');
      console.log('transactionId:', response.data.transactionId, 'id:', response.data.id);
    }
    // Format 4: response.data.data.url (format alternatif)
    else if (response.data.data && response.data.data.url) {
      paymentUrl = response.data.data.url;
      transactionId = response.data.data.transactionId || response.data.data.transaction_id || response.data.data.id || '';
      console.log('Extracted payment URL using format 4 (data.data.url)');
      console.log('transactionId:', response.data.data.transactionId, 'id:', response.data.data.id);
    }
    // Format 5: response.data.redirect_url (format alternatif)
    else if (response.data.redirect_url) {
      paymentUrl = response.data.redirect_url;
      transactionId = response.data.transactionId || response.data.transaction_id || response.data.id || '';
      console.log('Extracted payment URL using format 5 (data.redirect_url)');
      console.log('transactionId:', response.data.transactionId, 'id:', response.data.id);
    }
    // Format 6: response.data langsung berisi URL (format paling sederhana)
    else if (typeof response.data === 'string' && response.data.startsWith('http')) {
      paymentUrl = response.data;
      transactionId = `mayar_${Date.now()}`; // Buat ID jika tidak ada
      console.log('Extracted payment URL using format 6 (data is URL string)');
    }

    // Jika tidak ada URL yang ditemukan, throw error
    if (!paymentUrl) {
      console.error('Could not extract payment URL from response:', response.data);
      throw new Error('Tidak dapat menemukan URL pembayaran dalam respons');
    }

    console.log('Payment URL received:', paymentUrl);
    console.log('Transaction ID (will be saved to database):', transactionId);

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
        // Tetap lanjutkan meskipun ada error dengan Supabase
      }
    } catch (dbError) {
      console.error('Database error:', dbError);
      // Tetap lanjutkan meskipun ada error dengan database
    }

    // Return payment URL dari response Mayar
    return paymentUrl;
  } catch (err) {
    const error = err as any;
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

    // Jika error, tampilkan error yang lebih jelas dan tidak menggunakan mode simulasi
    console.error('Error creating payment with Mayar API. Please check your API key and try again.');

    // Throw error untuk ditangani oleh catch di komponen yang memanggil
    throw new Error('Gagal membuat pembayaran dengan Mayar. Silakan periksa API key dan coba lagi.');
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
      proxyRequestData
    );

    console.log('Verify payment response:', response.data);

    // Validasi response sesuai format Mayar
    if (!response.data || response.data.statusCode !== 200) {
      throw new Error('Invalid response from Mayar verification API');
    }

    return response.data;
  } catch (err) {
    const error = err as Error;
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

// ============= ADMIN INVOICE CREATION =============

/**
 * Fungsi untuk membuat invoice manual (untuk admin)
 * Reusable function yang bisa dipanggil dari InternalDashboard
 *
 * @param invoiceData - Data invoice yang akan dibuat
 * @returns Object berisi invoice_id dan payment_url
 */
export const createManualInvoice = async (invoiceData: InvoiceData) => {
  try {
    const { formSubmissionId, amount, description, customerInfo } = invoiceData;

    // Validasi API key
    const apiKey = import.meta.env.VITE_MAYAR_API_KEY;
    const isPlaceholderApiKey = !apiKey || apiKey.trim() === '' || apiKey.includes('your-mayar-api-key');

    if (isPlaceholderApiKey) {
      throw new Error('Mayar API key tidak tersedia atau tidak valid');
    }

    // Ambil webhook token dari environment variables
    const webhookToken = import.meta.env.VITE_MAYAR_WEBHOOK_TOKEN;

    // Gunakan window.location.origin untuk mendapatkan URL dasar
    const origin = window.location.origin || "https://submit.jakpatforuniv.com";

    // Buat request data untuk Mayar API
    const requestData = {
      name: customerInfo?.fullName || 'Pelanggan',
      email: customerInfo?.email || 'customer@example.com',
      amount: amount,
      mobile: customerInfo?.phoneNumber || '08123456789',
      redirectUrl: `${origin}/payment-success?form_id=${formSubmissionId}`,
      failureUrl: `${origin}/payment-failed?form_id=${formSubmissionId}`,
      description: description || 'Invoice Manual',
      expiredAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 hari
      webhookUrl: `${origin}/api/webhook`
    };

    console.log('Creating manual invoice with data:', requestData);

    // Panggil Mayar API melalui proxy
    const proxyRequestData = {
      ...requestData,
      endpoint: 'https://api.mayar.id/hl/v1/payment/create',
      apiKey: apiKey,
      webhookToken: webhookToken
    };

    const response = await axios.post(
      '/api/mayar-proxy',
      proxyRequestData,
      {
        timeout: 15000 // 15 detik timeout
      }
    );

    console.log('Mayar API response:', response.data);
    console.log('Full Mayar response for debugging:', JSON.stringify(response.data, null, 2));

    // Ekstrak payment URL dan ID dari response
    let paymentUrl = '';
    let invoiceId = '';

    // Coba berbagai format response
    // PRIORITASKAN transactionId karena itu yang dikirim di webhook!
    if (response.data.data && response.data.data.link) {
      paymentUrl = response.data.data.link;
      // Coba transactionId dulu, baru id, baru transaction_id
      invoiceId = response.data.data.transactionId || response.data.data.transaction_id || response.data.data.id || '';
      console.log('Extracted from data.data.link - transactionId:', response.data.data.transactionId, 'id:', response.data.data.id);
    } else if (response.data.payment_url) {
      paymentUrl = response.data.payment_url;
      invoiceId = response.data.transactionId || response.data.transaction_id || response.data.id || '';
      console.log('Extracted from payment_url - transactionId:', response.data.transactionId, 'id:', response.data.id);
    } else if (response.data.url) {
      paymentUrl = response.data.url;
      invoiceId = response.data.transactionId || response.data.transaction_id || response.data.id || '';
      console.log('Extracted from url - transactionId:', response.data.transactionId, 'id:', response.data.id);
    } else if (response.data.data && response.data.data.url) {
      paymentUrl = response.data.data.url;
      invoiceId = response.data.data.transactionId || response.data.data.transaction_id || response.data.data.id || '';
      console.log('Extracted from data.data.url - transactionId:', response.data.data.transactionId, 'id:', response.data.data.id);
    }

    // Jika tidak ada URL yang ditemukan, throw error
    if (!paymentUrl || !invoiceId) {
      console.error('Could not extract payment URL or invoice ID from response:', response.data);
      throw new Error('Tidak dapat menemukan URL pembayaran atau ID invoice dalam respons');
    }

    console.log('Manual invoice created successfully:', { invoiceId, paymentUrl });
    console.log('IMPORTANT: Saving payment_id to database:', invoiceId);

    // Return payment ID dan invoice URL
    return {
      payment_id: invoiceId,
      invoice_url: paymentUrl
    };
  } catch (err) {
    const error = err as any;
    console.error('Error creating manual invoice:', error);

    // Log error details untuk debugging
    if (error.response) {
      console.error('Mayar API error response:', {
        status: error.response.status,
        data: error.response.data
      });
    }

    throw new Error(error.message || 'Gagal membuat invoice manual');
  }
};
