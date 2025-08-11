// Cloudflare Function untuk update status pembayaran
// Digunakan untuk manual update status pembayaran jika webhook tidak berfungsi

import { createClient } from '@supabase/supabase-js';

export async function onRequest(context) {
  // Set CORS headers for all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400'
  };

  // Handle preflight request
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  // Hanya terima metode POST
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST, OPTIONS',
        ...corsHeaders
      }
    });
  }

  try {
    // Parse request body
    const requestData = await context.request.json();
    const { formId, status = 'completed' } = requestData;

    if (!formId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Form ID is required'
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Ambil Supabase credentials dari environment variables
    const supabaseUrl = context.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = context.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Supabase credentials not found in environment variables');
      return new Response(JSON.stringify({
        success: false,
        message: 'Supabase credentials not configured'
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Inisialisasi Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Update status form submission
    const { data: formSubmission, error: formError } = await supabase
      .from('form_submissions')
      .update({ payment_status: status })
      .eq('id', formId)
      .select();

    if (formError) {
      console.error('Error updating form submission:', formError);
      return new Response(JSON.stringify({
        success: false,
        message: 'Error updating form submission',
        error: formError.message
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Update status transaksi jika ada
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .update({ status })
      .eq('form_submission_id', formId)
      .select();

    if (transactionError) {
      console.warn('Error updating transaction:', transactionError);
      // Continue even if transaction update fails
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Payment status updated successfully',
      formSubmission: formSubmission[0],
      transaction: transaction || null
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Error updating payment status:', error);
    
    return new Response(JSON.stringify({
      success: false,
      message: 'Error updating payment status: ' + error.message,
      error: error.toString(),
      stack: error.stack
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}
