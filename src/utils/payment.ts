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

      const { data, error } = await supabase
        .from('transactions')
        .insert([transactionData])
        .select();

      if (error) throw error;

      // Dalam mode simulasi, langsung update status ke completed
      await updatePaymentStatus(simulatedPaymentId, 'completed');

      // Return URL simulasi
      return `${window.location.origin}/payment-success?id=${formSubmissionId}&simulation=true`;
    }

    // Mode produksi - Buat invoice di Mayar
    console.log('Using production mode with Mayar API');

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

    const response = await axios.post(
      'https://api.mayar.id/v1/invoices',
      requestData,
      {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_MAYAR_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

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

    const { data, error } = await supabase
      .from('transactions')
      .insert([transactionData])
      .select();

    if (error) throw error;

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

    // Jika error dan dalam mode simulasi, gunakan fallback
    if (isSimulationMode() || error.message?.includes('Network Error')) {
      console.log('Falling back to simulation mode due to error');
      const simulatedPaymentId = `sim_error_${Date.now()}`;
      const { formSubmissionId } = paymentData;

      return `${window.location.origin}/payment-success?id=${formSubmissionId}&simulation=true`;
    }

    throw error;
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
