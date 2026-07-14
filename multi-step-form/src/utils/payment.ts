import axios from 'axios';
import { supabase } from './supabase';

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

export const checkPaymentGatewayStatus = async (): Promise<boolean> => {
  // DOKU doesn't need a frontend status check — webhook handles everything
  return true;
};

// ==============================================================================
// CREATE PAYMENT (Form User / Self-Service Checkout)
// ==============================================================================
export const createPayment = async (paymentData: PaymentData) => {
  try {
    const { formSubmissionId, expiredAt } = paymentData;
    const origin = window.location.origin || "https://submit.jakpatforuniv.com";

    // Payment + invoice/transaction rows are created SERVER-SIDE via
    // /api/doku/create-payment (service_role). The server derives the amount
    // from the DB, so the browser no longer inserts into invoices/transactions
    // and no longer needs write access to those tables. This is what makes RLS
    // on `invoices` safe to enable (see sql/24_secure_invoices_rls.sql).
    let payment_due_date = 60; // default 60 minutes
    if (expiredAt) {
      const diffMs = new Date(expiredAt).getTime() - Date.now();
      payment_due_date = Math.max(1, Math.round(diffMs / 60000));
    }

    const response = await axios.post(
      `${origin}/api/doku/create-payment`,
      { formSubmissionId, origin, paymentDueDate: payment_due_date },
      { timeout: 15000 }
    );

    const paymentUrl = response.data?.payment_url;
    if (!paymentUrl) {
      throw new Error('Invalid response from create-payment endpoint');
    }

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

    // /api/doku/checkout is admin-gated by functions/api/doku/_middleware.js;
    // callers (SchedulePaymentView, ExtendSection) only exist in the internal
    // dashboard, so an admin session is always present here.
    const { data: { session } } = await supabase.auth.getSession();
    const fetchResponse = await fetch(`${origin}/api/doku/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
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
