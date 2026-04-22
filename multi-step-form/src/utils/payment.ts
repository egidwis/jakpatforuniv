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
// FEATURE FLAG: MAYAR vs DOKU
export const getPaymentGatewayProvider = () => {
  // Toggle dinamis berdasarkan environment variable
  return import.meta.env.VITE_PAYMENT_GATEWAY === 'doku' ? 'doku' : 'mayar';
};
// -------------------------------------------------------------------------------- //

// Doku Simulation detection
const isDokuSimulationMode = () => {
  const clientId = import.meta.env.VITE_DOKU_CLIENT_ID;
  return !clientId || clientId.trim() === '' || clientId.includes('your');
};

// Mayar Simulation detection
const isMayarSimulationMode = () => {
  const apiKey = import.meta.env.VITE_MAYAR_API_KEY;
  const isOfflineMode = localStorage.getItem('isOfflineMode') === 'true';
  if (isOfflineMode) return true;
  return !apiKey || apiKey === 'your-mayar-api-key' || apiKey.trim() === '';
};

export const checkMayarApiStatus = async (): Promise<boolean> => {
  if (getPaymentGatewayProvider() === 'doku') return true;

  try {
    const apiKey = import.meta.env.VITE_MAYAR_API_KEY;
    if (!apiKey || apiKey.trim() === '') return false;
    const response = await axios.post('/api/mayar-proxy', {
      endpoint: 'https://api.mayar.id/v1/ping',
      method: 'GET',
      apiKey: apiKey
    }, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    console.error('Error checking Mayar API status:', error);
    return false;
  }
};

// ==============================================================================
// CREATE PAYMENT (Form User)
// ==============================================================================
export const createPayment = async (paymentData: PaymentData) => {
  const provider = getPaymentGatewayProvider();
  
  if (provider === 'doku') {
     return await createDokuPayment(paymentData);
  } else {
     return await createMayarPayment(paymentData);
  }
};

const createDokuPayment = async (paymentData: PaymentData) => {
  try {
    const { formSubmissionId, amount, customerInfo } = paymentData;
    const origin = window.location.origin || "https://submit.jakpatforuniv.com";

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
      customer: {
        name: customerInfo.fullName || 'User',
        email: customerInfo.email || 'user@example.com',
        phone: customerInfo.phoneNumber || ''
      },
      callback_url: `${origin}/dashboard/status`
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

    return paymentUrl;
  } catch (err) {
    console.error('Error creating DOKU payment:', err);
    throw new Error('Gagal membuat pembayaran DOKU.');
  }
};

const createMayarPayment = async (paymentData: PaymentData) => {
  try {
    const { formSubmissionId, amount, customerInfo } = paymentData;
    const origin = window.location.origin || "https://submit.jakpatforuniv.com";

    if (isMayarSimulationMode()) {
      const simulatedPaymentId = `sim_mayar_${Date.now()}`;
      const transactionData: Transaction = {
        form_submission_id: formSubmissionId,
        payment_id: simulatedPaymentId,
        payment_method: 'simulation',
        amount,
        status: 'pending',
        payment_url: `${origin}/payment-success?id=${formSubmissionId}&simulation=true`
      };
      await supabase.from('transactions').insert([transactionData]);
      await updatePaymentStatus(simulatedPaymentId, 'completed');
      return transactionData.payment_url;
    }

    const requestData = {
      name: customerInfo.fullName || 'Pengguna',
      email: customerInfo.email || 'user@example.com',
      amount: amount,
      mobile: customerInfo.phoneNumber || '08123456789',
      redirectUrl: `${origin}/payment-success?id=${formSubmissionId}`,
      failureUrl: `${origin}/payment-failed?id=${formSubmissionId}`,
      description: `Pembayaran Survey - ${customerInfo.title}`,
      expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      webhookUrl: `${origin}/api/webhook`
    };

    const apiKey = import.meta.env.VITE_MAYAR_API_KEY;
    const webhookToken = import.meta.env.VITE_MAYAR_WEBHOOK_TOKEN;

    const proxyRequestData = {
      ...requestData,
      endpoint: 'https://api.mayar.id/hl/v1/payment/create',
      apiKey,
      webhookToken
    };

    // Retry logic
    let retryCount = 0;
    const maxRetries = 2;
    let response;

    while (retryCount <= maxRetries) {
      try {
        response = await axios.post('/api/mayar-proxy', proxyRequestData, { timeout: 15000 });
        break;
      } catch (retryError) {
        retryCount++;
        if (retryCount > maxRetries) throw retryError;
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!response || !response.data) throw new Error('Response dari Mayar API tidak valid');

    let paymentUrl = '';
    let transactionId = '';

    if (response.data.data && response.data.data.link) {
      paymentUrl = response.data.data.link;
      transactionId = response.data.data.id || response.data.data.transaction_id || '';
    } else if (response.data.payment_url) {
      paymentUrl = response.data.payment_url;
      transactionId = response.data.id || response.data.transaction_id || '';
    } else if (response.data.url) {
      paymentUrl = response.data.url;
      transactionId = response.data.id || response.data.transaction_id || '';
    } else if (response.data.data && response.data.data.url) {
      paymentUrl = response.data.data.url;
      transactionId = response.data.data.id || response.data.data.transaction_id || '';
    }

    if (!paymentUrl) throw new Error('Could not extract payment URL');

    const transactionData: Transaction = {
      form_submission_id: formSubmissionId,
      payment_id: transactionId,
      payment_method: 'mayar',
      amount,
      status: 'pending',
      payment_url: paymentUrl
    };

    await supabase.from('transactions').insert([transactionData]);

    return paymentUrl;
  } catch (err: any) {
    console.error('Error creating Mayar payment:', err);
    throw new Error('Gagal membuat pembayaran Mayar.');
  }
}

// ==============================================================================
// CREATE MANUAL INVOICE (Admin Dashboard)
// ==============================================================================
export const createManualInvoice = async (invoiceData: InvoiceData) => {
  const provider = getPaymentGatewayProvider();
  
  if (provider === 'doku') {
     return await createDokuManualInvoice(invoiceData);
  } else {
     return await createMayarManualInvoice(invoiceData);
  }
};

const createDokuManualInvoice = async (invoiceData: InvoiceData) => {
  try {
    const { formSubmissionId, amount, description, customerInfo } = invoiceData;
    const origin = window.location.origin || "https://submit.jakpatforuniv.com";

    const invoiceNumber = `JFU-INV-${formSubmissionId.substring(0,6)}-${Date.now()}`;
    
    const requestData = {
      amount: amount,
      invoice_number: invoiceNumber,
      description: description,
      customer: {
        name: customerInfo?.fullName || 'Client',
        email: customerInfo?.email || 'client@example.com',
        phone: customerInfo?.phoneNumber || ''
      },
      callback_url: `${origin}/dashboard/status`,
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

const createMayarManualInvoice = async (invoiceData: InvoiceData) => {
  try {
    const { formSubmissionId, amount, description, customerInfo } = invoiceData;
    const origin = window.location.origin || "https://submit.jakpatforuniv.com";

    const requestData = {
       name: customerInfo?.fullName || 'Client Admin',
       email: customerInfo?.email || 'client@example.com',
       amount: amount,
       mobile: customerInfo?.phoneNumber || '08123456789',
       redirectUrl: `${origin}/payment-success?form_id=${formSubmissionId}`,
       failureUrl: `${origin}/payment-failed?form_id=${formSubmissionId}`,
       description: description || `Manual Invoice - ${formSubmissionId}`,
       expiredAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
       webhookUrl: `${origin}/api/webhook`
    };

    const apiKey = import.meta.env.VITE_MAYAR_API_KEY;
    const webhookToken = import.meta.env.VITE_MAYAR_WEBHOOK_TOKEN;

    const proxyRequestData = {
      ...requestData,
      endpoint: 'https://api.mayar.id/hl/v1/payment/create',
      apiKey,
      webhookToken
    };

    const response = await axios.post('/api/mayar-proxy', proxyRequestData, { timeout: 15000 });
    
    if (!response || !response.data) throw new Error('Response dari Mayar API tidak valid');

    let paymentUrl = '';
    let transactionId = '';

    if (response.data.data && response.data.data.link) {
      paymentUrl = response.data.data.link;
      transactionId = response.data.data.id || response.data.data.transaction_id || '';
    } else if (response.data.url) {
      paymentUrl = response.data.url;
      transactionId = response.data.id || response.data.transaction_id || '';
    }

    if (!paymentUrl) throw new Error('Could not extract payment URL');

    return {
      payment_id: transactionId,
      invoice_url: paymentUrl
    };
  } catch (err: any) {
    console.error('Error creating Mayar manual invoice:', err);
    throw new Error(err.message || 'Gagal membuat invoice manual Mayar');
  }
};

// ==============================================================================
// VERIFY PAYMENT & STATUS
// ==============================================================================
export const verifyPayment = async (paymentId: string) => {
  if (getPaymentGatewayProvider() === 'doku') {
    // DOKU doesn't poll frontend yet
    return { statusCode: 200, status: 'pending' };
  }

  try {
    const apiKey = import.meta.env.VITE_MAYAR_API_KEY;
    const proxyRequestData = {
      endpoint: `https://api.mayar.id/hl/v1/payment/${paymentId}`,
      method: 'GET',
      apiKey: apiKey
    };

    const response = await axios.post('/api/mayar-verify', proxyRequestData, { timeout: 10000 });
    return response.data;
  } catch (error) {
    console.error('Error verifying Mayar payment:', error);
    throw error;
  }
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
