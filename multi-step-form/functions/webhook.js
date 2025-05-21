import { createClient } from '@supabase/supabase-js';

// Fungsi untuk memverifikasi signature dari Mayar menggunakan Web Crypto API
async function verifySignature(payload, signature, webhookToken) {
  try {
    // Jika signature atau token tidak ada, verifikasi gagal
    if (!signature || !webhookToken) {
      console.warn('Missing signature or webhook token');
      return false;
    }

    // Encode payload dan token
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const key = encoder.encode(webhookToken);

    // Buat HMAC key
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Hitung signature
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, data);

    // Konversi ke hex string
    const calculatedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Bandingkan signature yang dihitung dengan signature yang diterima
    return calculatedSignature === signature;
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

export async function onRequest(context) {
  // Hanya terima metode POST
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST'
      }
    });
  }

  try {
    // Ambil environment variables
    const supabaseUrl = context.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = context.env.VITE_SUPABASE_ANON_KEY;
    const webhookToken = context.env.VITE_MAYAR_WEBHOOK_TOKEN;

    // Log untuk debugging
    console.log('Webhook received:', {
      method: context.request.method,
      url: context.request.url,
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseAnonKey,
      hasWebhookToken: !!webhookToken
    });

    // Verifikasi signature dari Mayar
    const signature = context.request.headers.get('x-mayar-signature');
    const payload = await context.request.text();

    console.log('Webhook details:', {
      hasSignature: !!signature,
      payloadLength: payload.length
    });

    // Verifikasi signature jika webhook token tersedia
    if (webhookToken) {
      const isValid = await verifySignature(payload, signature, webhookToken);

      if (!isValid) {
        console.error('Invalid webhook signature');
        return new Response(JSON.stringify({ message: 'Invalid signature' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      console.log('Webhook signature verified successfully');
    } else {
      console.warn('Webhook token not configured, skipping signature verification');
    }

    // Parse payload
    const payloadData = JSON.parse(payload);
    console.log('Webhook payload type:', payloadData.type);

    // Inisialisasi Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Hanya proses event payment.success
    if (payloadData.type === 'payment.success') {
      const paymentId = payloadData.data.id;

      // Cek apakah ini adalah test webhook
      if (paymentId.startsWith('pay_test_')) {
        console.log('Test webhook detected:', paymentId);
        return new Response(JSON.stringify({
          message: 'Test webhook processed successfully',
          transaction_id: paymentId,
          status: 'test_success'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Cari transaksi berdasarkan payment_id
      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .select('form_submission_id')
        .eq('payment_id', paymentId)
        .single();

      if (transactionError) {
        console.error('Error finding transaction:', transactionError);
        return new Response(JSON.stringify({ message: 'Transaction not found' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Update status transaksi
      const { error: updateTransactionError } = await supabase
        .from('transactions')
        .update({ status: 'completed' })
        .eq('payment_id', paymentId);

      if (updateTransactionError) {
        console.error('Error updating transaction:', updateTransactionError);
        return new Response(JSON.stringify({ message: 'Error updating transaction' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Update status form submission
      const { data: formSubmission, error: formError } = await supabase
        .from('form_submissions')
        .update({ payment_status: 'completed' })
        .eq('id', transaction.form_submission_id)
        .select();

      if (formError) {
        console.error('Error updating form submission:', formError);
        return new Response(JSON.stringify({ message: 'Error updating form submission' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Kirim email notifikasi
      try {
        const emailResponse = await fetch(`${new URL(context.request.url).origin}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: formSubmission[0].email,
            subject: 'Pembayaran Berhasil',
            html:
              '<h1>Pembayaran Berhasil</h1>' +
              '<p>Halo ' + (formSubmission[0].name || 'Responden') + ',</p>' +
              '<p>Pembayaran Anda dengan ID <strong>' + paymentId + '</strong> telah berhasil diproses.</p>' +
              '<p>Detail Pembayaran:</p>' +
              '<ul>' +
                '<li>Jumlah: Rp ' + (payloadData.data.amount / 100).toLocaleString('id-ID') + '</li>' +
                '<li>Tanggal: ' + new Date(payloadData.data.created_at).toLocaleString('id-ID') + '</li>' +
                '<li>Status: Selesai</li>' +
              '</ul>' +
              '<p>Terima kasih atas partisipasi Anda.</p>'
          })
        });

        const emailResult = await emailResponse.json();
        console.log('Email notification result:', emailResult);
      } catch (emailError) {
        console.error('Error sending email notification:', emailError);
      }

      return new Response(JSON.stringify({
        message: 'Webhook processed successfully',
        transaction_id: paymentId,
        form_id: transaction.form_submission_id,
        status: 'completed'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Untuk event lain, cek apakah ini test webhook
    const paymentId = payloadData.data?.id || '';
    if (paymentId.startsWith('pay_test_')) {
      console.log('Test webhook detected for event:', payloadData.type);
      return new Response(JSON.stringify({
        message: 'Test webhook processed successfully',
        transaction_id: paymentId,
        type: payloadData.type,
        status: 'test_success'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Untuk event lain, hanya acknowledge
    return new Response(JSON.stringify({
      message: 'Event acknowledged',
      type: payloadData.type
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({
      message: 'Internal Server Error',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
