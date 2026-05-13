import axios from 'axios';
import { supabase } from './supabase';
import type { FormSubmission, Transaction } from './supabase';

interface PaymentData {
  formSubmissionId: string;
  amount: number;
  customerInfo: {
    title: string;
    fullName: string;
    email: string;
    phoneNumber: string;
  };
  expiredAt?: string;
}

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

// -------------------------------------------------------------------------------- //
// Payment Gateway Provider — DOKU only
export const getPaymentGatewayProvider = () => 'doku';
// -------------------------------------------------------------------------------- //

// Doku Simulation detection
const isDokuSimulationMode = () => {
  const clientId = import.meta.env.VITE_DOKU_CLIENT_ID;
  return !clientId || clientId.trim() === '' || clientId.includes('your');
};

export const checkPaymentGatewayStatus = async (): Promise<boolean> => {
  // DOKU doesn't need a frontend status check — webhook handles everything
  return true;
};

// ==============================================================================
// CREATE PAYMENT (Form User / Self-Service Checkout)
// ==============================================================================
export const createPayment = async (paymentData: PaymentData) => {
  try {
    const { formSubmissionId, amount, customerInfo, expiredAt } = paymentData;
    const origin = window.location.origin || "https://submit.jakpatforuniv.com";

    let payment_due_date = 60; // default 60 minutes
    if (expiredAt) {
      const diffMs = new Date(expiredAt).getTime() - Date.now();
      payment_due_date = Math.max(1, Math.round(diffMs / 60000));
    }

    if (isDokuSimulationMode()) {
      const simulatedPaymentId = `sim_doku_${Date.now()}`;
      const transactionData: Transaction = {
        form_submission_id: formSubmissionId,
        payment_id: simulatedPaymentId,
        payment_method: 'simulation',
        amount,
        status: 'pending',
        payment_url: `${origin}/payment-success?id=${formSubmissionId}&simulation=true`
      };
      await supabase.from('transactions').insert([transactionData]);
      return transactionData.payment_url;
    }

    const invoiceNumber = `JFU-${formSubmissionId.substring(0,8)}-${Date.now()}`;
    const requestData = {
      amount,
      invoice_number: invoiceNumber,
      sac_id: import.meta.env.VITE_DOKU_SAC_JFU_ID || 'SAC-7926-1778565828595',
      customer: {
        name: customerInfo.fullName || 'User',
        email: customerInfo.email || 'user@example.com',
        phone: customerInfo.phoneNumber || ''
      },
      callback_url: `${origin}/payment-success?id=${formSubmissionId}&source=gateway`,
      payment_due_date
    };

    const response = await axios.post(`${origin}/api/doku/checkout`, requestData, { timeout: 15000 });

    if (!response.data?.response?.payment) {
      throw new Error('Invalid response from DOKU API proxy');
    }

    const paymentUrl = response.data.response.payment.url;
    const transactionId = response.data.response.order.invoice_number; 

    // Simpan ke db
    const transactionData: Transaction = {
      form_submission_id: formSubmissionId,
      payment_id: transactionId,
      payment_method: 'doku',
      amount,
      status: 'pending',
      payment_url: paymentUrl
    };
    await supabase.from('transactions').insert([transactionData]);

    const invoiceData: Invoice = {
      form_submission_id: formSubmissionId,
      payment_id: transactionId,
      invoice_url: paymentUrl,
      amount,
      status: 'pending'
    };
    await supabase.from('invoices').insert([invoiceData]);

    return paymentUrl;
  } catch (err) {
    console.error('Error creating DOKU payment:', err);
    throw new Error('Gagal membuat pembayaran DOKU.');
  }
};

// ==============================================================================
// CREATE MANUAL INVOICE (Admin Dashboard)
// ==============================================================================
export const createManualInvoice = async (invoiceData: InvoiceData) => {
  try {
    const { formSubmissionId, amount, description, customerInfo } = invoiceData;
    const origin = window.location.origin || "https://submit.jakpatforuniv.com";

    const invoiceNumber = `JFU-INV-${formSubmissionId.substring(0,6)}-${Date.now()}`;
    
    const requestData = {
      amount: amount,
      invoice_number: invoiceNumber,
      description: description,
      sac_id: import.meta.env.VITE_DOKU_SAC_JFU_ID || 'SAC-7926-1778565828595',
      customer: {
        name: customerInfo?.fullName || 'Client',
        email: customerInfo?.email || 'client@example.com',
        phone: customerInfo?.phoneNumber || ''
      },
      callback_url: `${origin}/payment-success?id=${formSubmissionId}&source=gateway`,
      payment_due_date: 60 * 24 * 7 // 7 Hari
    };

    const fetchResponse = await fetch(`${origin}/api/doku/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
      signal: AbortSignal.timeout(15000)
    });

    if (!fetchResponse.ok) {
      const errTxt = await fetchResponse.text();
      throw new Error(`Proxy error: ${errTxt}`);
    }

    const data = await fetchResponse.json();
    if (!data.response || !data.response.payment) {
      throw new Error('Invalid response from DOKU checkout');
    }

    return {
      payment_id: data.response.order.invoice_number,
      invoice_url: data.response.payment.url
    };
  } catch (err: any) {
    console.error('Error creating DOKU manual invoice:', err);
    throw new Error(err.message || 'Gagal membuat invoice manual DOKU');
  }
};

// ==============================================================================
// VERIFY PAYMENT & STATUS
// ==============================================================================
export const verifyPayment = async (paymentId: string) => {
  // DOKU uses webhook-based verification — no frontend polling needed
  return { statusCode: 200, status: 'pending' };
};

export const updatePaymentStatus = async (paymentId: string, status: string) => {
  try {
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .update({ status })
      .eq('payment_id', paymentId)
      .select('form_submission_id');

    if (transactionError) throw transactionError;

    if (!transaction || transaction.length === 0) {
      throw new Error('Transaction not found');
    }

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
