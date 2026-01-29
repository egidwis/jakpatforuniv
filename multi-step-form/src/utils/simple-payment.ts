import { supabase } from './supabase';
import type { Transaction } from './supabase';

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

// Check if we're in simulation mode (no API key or development environment)
const isSimulationMode = () => {
  // Check if we're in development mode
  const isDevelopment = import.meta.env.DEV === true;

  // Always use simulation mode in development to avoid API connection issues
  if (isDevelopment) {
    console.log('Running in development mode - using simulation mode for payments');
    return true;
  }

  // In production, check for API key
  const apiKey = import.meta.env.VITE_MAYAR_API_KEY;
  return !apiKey || apiKey.trim() === '';
};

// Function to check Mayar API status
export const checkMayarApiStatus = async (): Promise<boolean> => {
  try {
    if (isSimulationMode()) {
      console.log('No Mayar API key available, skipping status check');
      return false;
    }

    console.log('Checking Mayar API status...');

    // Simple ping to check if API is available
    const response = await fetch('https://api.mayar.id/v1/ping', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    console.log('Mayar API status check response:', response.status);
    return response.status === 200;
  } catch (error) {
    console.error('Error checking Mayar API status:', error);
    return false;
  }
};

// Function to create payment with Mayar
export const createPayment = async (paymentData: PaymentData): Promise<string> => {
  try {
    const { formSubmissionId, amount, customerInfo } = paymentData;
    console.log('Creating payment for form submission:', formSubmissionId);

    // Check if we're in simulation mode
    if (isSimulationMode()) {
      console.log('Using simulation mode - no Mayar API key provided');

      // Ensure minimum amount is 500 (Mayar requirement)
      const minAmount = 500;
      const adjustedAmount = Math.max(amount, minAmount);

      if (adjustedAmount !== amount) {
        console.log(`Adjusting amount from ${amount} to minimum ${minAmount} as required by Mayar`);
      }

      // Create simulated payment ID
      const simulatedPaymentId = `sim_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      // Save transaction data to Supabase
      const transactionData: Transaction = {
        form_submission_id: formSubmissionId,
        payment_id: simulatedPaymentId,
        payment_method: 'simulation',
        amount: adjustedAmount, // Use adjusted amount
        status: 'pending',
        payment_url: `/payment-success.html`
      };

      try {
        await supabase.from('transactions').insert([transactionData]);
      } catch (dbError) {
        console.error('Error saving simulation transaction to Supabase:', dbError);
      }

      // Return simulation URL
      return `${window.location.origin}/dashboard/status?payment_status=paid`;
    }

    // Production mode - Create payment with Mayar
    console.log('Using production mode with Mayar API');

    // Use hardcoded URL to avoid issues with window.location.origin
    const origin = window.location.origin;

    // Ensure minimum amount is 500 (Mayar requirement)
    const minAmount = 500;
    const adjustedAmount = Math.max(amount, minAmount);

    if (adjustedAmount !== amount) {
      console.log(`Adjusting amount from ${amount} to minimum ${minAmount} as required by Mayar`);
    }

    // Prepare request data for Mayar API
    const requestData = {
      name: customerInfo.fullName || 'Pengguna',
      email: customerInfo.email || 'user@example.com',
      amount: adjustedAmount, // Use adjusted amount that meets minimum requirement
      mobile: customerInfo.phoneNumber || '08123456789',
      // Redirect to static success page instead of dynamic one
      redirectUrl: `${origin}/dashboard/status?payment_status=paid`,
      failureUrl: `${origin}/dashboard/status?payment_status=failed&form_id=${formSubmissionId}`,
      description: `Pembayaran Survey - ${customerInfo.title}`,
      expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      webhookUrl: `${origin}/webhook` // Webhook URL for payment notifications
    };

    console.log('Mayar request data:', requestData);

    // Send request to Mayar API via our simplified proxy
    console.log('Sending request to Mayar API via proxy');

    // Use the full URL to avoid path resolution issues
    const proxyUrl = `${origin}/api/simple-mayar-proxy`;
    console.log('Using proxy URL:', proxyUrl);

    // Use native fetch API instead of axios (matching the successful test page)
    const fetchResponse = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    // Get the response text first
    const responseText = await fetchResponse.text();
    console.log('Raw response text:', responseText);

    // Try to parse as JSON
    let responseData;
    try {
      responseData = JSON.parse(responseText);
      console.log('Mayar API response:', responseData);
    } catch (parseError) {
      console.error('Error parsing response JSON:', parseError);
      throw new Error(`Invalid JSON response: ${responseText}`);
    }

    // Check if the response was successful
    if (!fetchResponse.ok) {
      console.error('Mayar API error response:', {
        status: fetchResponse.status,
        data: responseData
      });
      throw new Error(`API error (${fetchResponse.status}): ${responseData?.message || 'Unknown error'}`);
    }

    // Extract payment URL from response
    let paymentUrl = '';
    let transactionId = '';

    // Check for payment URL in different response formats
    if (responseData.data && responseData.data.link) {
      // Format 1: responseData.data.link (documentation format)
      paymentUrl = responseData.data.link;
      transactionId = responseData.data.id || '';
      console.log('Found payment URL in format 1 (data.data.link)');
    } else if (responseData.data && responseData.data.url) {
      // Format 2: responseData.data.url
      paymentUrl = responseData.data.url;
      transactionId = responseData.data.id || '';
      console.log('Found payment URL in format 2 (data.data.url)');
    } else if (responseData.url) {
      // Format 3: responseData.url
      paymentUrl = responseData.url;
      transactionId = responseData.id || '';
      console.log('Found payment URL in format 3 (data.url)');
    } else if (responseData.payment_url) {
      // Format 4: responseData.payment_url
      paymentUrl = responseData.payment_url;
      transactionId = responseData.id || '';
      console.log('Found payment URL in format 4 (data.payment_url)');
    }

    // If no payment URL found, throw error
    if (!paymentUrl) {
      console.error('Could not extract payment URL from response:', responseData);
      throw new Error('Could not find payment URL in response');
    }

    console.log('Payment URL:', paymentUrl);
    console.log('Transaction ID:', transactionId);

    // Save transaction data to Supabase
    const transactionData: Transaction = {
      form_submission_id: formSubmissionId,
      payment_id: transactionId,
      payment_method: 'mayar',
      amount: adjustedAmount, // Use the adjusted amount
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

    // Instead of falling back to simulation mode, throw the error
    // This will allow the UI to show an error message
    throw new Error('Failed to create payment. Please try again or contact support.');
  }
};
