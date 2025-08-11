// Cloudflare Function untuk menangani webhook dari Mayar
// Webhook ini akan menerima notifikasi pembayaran dari Mayar

import { createClient } from '@supabase/supabase-js';

export async function onRequest(context) {
  // Log untuk debugging
  console.log("Mayar webhook function called with method:", context.request.method);

  // Set CORS headers for all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Mayar-Signature',
    'Access-Control-Max-Age': '86400'
  };

  // Handle preflight request
  if (context.request.method === 'OPTIONS') {
    console.log("Handling OPTIONS preflight request for webhook");
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  // Hanya terima metode POST
  if (context.request.method !== 'POST') {
    console.log("Method not allowed for webhook:", context.request.method);
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
    // Ambil webhook token dari environment variables
    const webhookToken = context.env.VITE_MAYAR_WEBHOOK_TOKEN;
    
    if (!webhookToken) {
      console.error('Webhook token not found in environment variables');
      return new Response(JSON.stringify({
        success: false,
        message: 'Webhook token not configured'
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Ambil signature dari header
    const signature = context.request.headers.get('X-Mayar-Signature');
    console.log("Received signature:", signature);

    // Parse request body
    const requestText = await context.request.text();
    console.log("Webhook payload:", requestText);
    
    let requestData;
    try {
      requestData = JSON.parse(requestText);
      console.log("Parsed webhook data:", JSON.stringify(requestData));
    } catch (parseError) {
      console.error("Error parsing webhook JSON:", parseError);
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid JSON payload'
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Verifikasi signature jika ada
    if (signature) {
      // Untuk implementasi verifikasi signature yang lebih lengkap
      // Gunakan crypto API untuk memverifikasi HMAC
      console.log("Signature verification would happen here");
      // Untuk saat ini kita skip verifikasi
    }

    // Proses webhook berdasarkan tipe event
    const eventType = requestData.event || '';
    const transactionId = requestData.transaction_id || requestData.id || '';
    const status = requestData.status || '';
    
    console.log(`Processing webhook: Event=${eventType}, Transaction=${transactionId}, Status=${status}`);

    // Inisialisasi Supabase client
    const supabaseUrl = context.env.VITE_SUPABASE_URL;
    const supabaseKey = context.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase credentials not found in environment variables');
      return new Response(JSON.stringify({
        success: false,
        message: 'Database configuration missing'
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Update status transaksi di database
    if (transactionId && status) {
      try {
        // 1. Update status di tabel transactions
        const { data: transaction, error: transactionError } = await supabase
          .from('transactions')
          .update({ status: mapMayarStatus(status) })
          .eq('payment_id', transactionId)
          .select('form_submission_id');

        if (transactionError) {
          console.error('Error updating transaction:', transactionError);
          throw transactionError;
        }

        console.log('Transaction updated:', transaction);

        // 2. Update status di tabel form_submissions jika ada
        if (transaction && transaction.length > 0) {
          const formSubmissionId = transaction[0].form_submission_id;
          
          const { data: formSubmission, error: formError } = await supabase
            .from('form_submissions')
            .update({ payment_status: mapMayarStatus(status) })
            .eq('id', formSubmissionId)
            .select();

          if (formError) {
            console.error('Error updating form submission:', formError);
            throw formError;
          }

          console.log('Form submission updated:', formSubmission);
        }
      } catch (dbError) {
        console.error('Database error processing webhook:', dbError);
        // Tetap return success ke Mayar untuk menghindari retry yang tidak perlu
      }
    }

    // Return success response
    return new Response(JSON.stringify({
      message: "Webhook processed successfully",
      transaction_id: transactionId,
      status: "success"
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Error processing webhook:', error);

    return new Response(JSON.stringify({
      success: false,
      message: 'Error processing webhook: ' + error.message
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

// Helper function to map Mayar status to our internal status
function mapMayarStatus(mayarStatus) {
  switch (mayarStatus.toLowerCase()) {
    case 'paid':
    case 'completed':
    case 'success':
      return 'completed';
    case 'pending':
    case 'waiting':
      return 'pending';
    case 'failed':
    case 'expired':
    case 'canceled':
      return 'failed';
    default:
      return mayarStatus.toLowerCase();
  }
}
