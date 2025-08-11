import axios from 'axios';
import { supabase, Transaction } from './supabase';

// Interface for payment data
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

// Function to create payment with Mayar
export const createPayment = async (paymentData: PaymentData): Promise<string> => {
  try {
    const { formSubmissionId, amount, customerInfo } = paymentData;
    console.log('Creating payment for form submission:', formSubmissionId);

    // Check if we're in simulation mode (no API key)
    const apiKey = import.meta.env.VITE_MAYAR_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      console.log('No Mayar API key available, using simulation mode');
      
      // Create simulated payment ID
      const simulatedPaymentId = `sim_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      // Save transaction data to Supabase
      const transactionData: Transaction = {
        form_submission_id: formSubmissionId,
        payment_id: simulatedPaymentId,
        payment_method: 'simulation',
        amount,
        status: 'pending',
        payment_url: `/payment-success?id=${formSubmissionId}&simulation=true`
      };
      
      await supabase.from('transactions').insert([transactionData]);
      
      // Return simulation URL
      return `${window.location.origin}/payment-success?id=${formSubmissionId}&simulation=true`;
    }
    
    // Production mode - Create payment with Mayar
    console.log('Using production mode with Mayar API');
    
    // Use hardcoded URL to avoid issues with window.location.origin
    const origin = window.location.origin;
    
    // Prepare request data for Mayar API
    const requestData = {
      name: customerInfo.fullName || 'Pengguna',
      email: customerInfo.email || 'user@example.com',
      amount: amount,
      mobile: customerInfo.phoneNumber || '08123456789',
      redirectUrl: `${origin}/payment-success?id=${formSubmissionId}`,
      failureUrl: `${origin}/payment-failed?id=${formSubmissionId}`,
      description: `Pembayaran Survey - ${customerInfo.title}`,
      expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      webhookUrl: `${origin}/webhook` // Webhook URL for payment notifications
    };
    
    console.log('Mayar request data:', requestData);
    
    // Send request to Mayar API via our simplified proxy
    console.log('Sending request to Mayar API via proxy');
    const response = await axios.post('/api/simple-mayar-proxy', requestData, {
      timeout: 15000 // 15 seconds timeout
    });
    
    console.log('Mayar API response:', response.data);
    
    // Extract payment URL from response
    let paymentUrl = '';
    let transactionId = '';
    
    // Check for payment URL in different response formats
    if (response.data.data && response.data.data.link) {
      // Format 1: response.data.data.link (documentation format)
      paymentUrl = response.data.data.link;
      transactionId = response.data.data.id || '';
      console.log('Found payment URL in format 1 (data.data.link)');
    } else if (response.data.data && response.data.data.url) {
      // Format 2: response.data.data.url
      paymentUrl = response.data.data.url;
      transactionId = response.data.data.id || '';
      console.log('Found payment URL in format 2 (data.data.url)');
    } else if (response.data.url) {
      // Format 3: response.data.url
      paymentUrl = response.data.url;
      transactionId = response.data.id || '';
      console.log('Found payment URL in format 3 (data.url)');
    } else if (response.data.payment_url) {
      // Format 4: response.data.payment_url
      paymentUrl = response.data.payment_url;
      transactionId = response.data.id || '';
      console.log('Found payment URL in format 4 (data.payment_url)');
    }
    
    // If no payment URL found, throw error
    if (!paymentUrl) {
      console.error('Could not extract payment URL from response:', response.data);
      throw new Error('Could not find payment URL in response');
    }
    
    console.log('Payment URL:', paymentUrl);
    console.log('Transaction ID:', transactionId);
    
    // Save transaction data to Supabase
    const transactionData: Transaction = {
      form_submission_id: formSubmissionId,
      payment_id: transactionId,
      payment_method: 'mayar',
      amount,
      status: 'pending',
      payment_url: paymentUrl
    };
    
    try {
      await supabase.from('transactions').insert([transactionData]);
    } catch (dbError) {
      console.error('Error saving transaction to Supabase:', dbError);
      // Continue even if database error
    }
    
    // Return payment URL
    return paymentUrl;
    
  } catch (error: any) {
    console.error('Error creating payment:', error);
    
    // Log error details
    if (error.response) {
      console.error('Mayar API error response:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    
    // Fall back to simulation mode
    console.log('Falling back to simulation mode due to error');
    const simulatedPaymentId = `sim_error_${Date.now()}`;
    
    // Save fallback transaction to Supabase
    try {
      const transactionData: Transaction = {
        form_submission_id: paymentData.formSubmissionId,
        payment_id: simulatedPaymentId,
        payment_method: 'simulation_fallback',
        amount: paymentData.amount,
        status: 'pending',
        payment_url: `/payment-success?id=${paymentData.formSubmissionId}&simulation=true`
      };
      
      await supabase.from('transactions').insert([transactionData]);
    } catch (dbError) {
      console.error('Error saving fallback transaction to Supabase:', dbError);
    }
    
    // Return simulation URL
    return `${window.location.origin}/payment-success?id=${paymentData.formSubmissionId}&simulation=true`;
  }
};
