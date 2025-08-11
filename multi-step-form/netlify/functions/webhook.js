// Webhook handler untuk notifikasi pembayaran dari Mayar
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Inisialisasi Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // Gunakan service key untuk akses penuh
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Fungsi untuk memverifikasi signature dari Mayar
function verifySignature(payload, signature, webhookToken) {
  try {
    // Jika signature atau token tidak ada, verifikasi gagal
    if (!signature || !webhookToken) {
      console.warn('Missing signature or webhook token');
      return false;
    }

    // Buat HMAC dengan webhook token
    const hmac = crypto.createHmac('sha256', webhookToken);
    // Update HMAC dengan payload
    const calculatedSignature = hmac.update(payload).digest('hex');

    // Bandingkan signature yang dihitung dengan signature yang diterima
    // Gunakan timingSafeEqual untuk mencegah timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(calculatedSignature, 'hex'),
        Buffer.from(signature, 'hex')
      );
    } catch (e) {
      // Jika format signature tidak valid, verifikasi gagal
      console.error('Invalid signature format:', e);
      return false;
    }
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

exports.handler = async (event, context) => {
  // Hanya terima metode POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  try {
    // Verifikasi signature dari Mayar (penting untuk keamanan)
    const signature = event.headers['x-mayar-signature'];
    const webhookToken = process.env.VITE_MAYAR_WEBHOOK_TOKEN;

    console.log('Webhook received:', {
      hasSignature: !!signature,
      hasToken: !!webhookToken,
      headers: Object.keys(event.headers)
    });

    // Parse body
    const payload = JSON.parse(event.body);
    console.log('Webhook payload type:', payload.type);

    // Verifikasi signature jika webhook token tersedia
    if (webhookToken) {
      const isValid = verifySignature(event.body, signature, webhookToken);

      if (!isValid) {
        console.error('Invalid webhook signature');
        return {
          statusCode: 401,
          body: JSON.stringify({ message: 'Invalid signature' }),
        };
      }

      console.log('Webhook signature verified successfully');
    } else {
      console.warn('Webhook token not configured, skipping signature verification');
    }

    // Hanya proses event payment.success
    if (payload.type === 'payment.success') {
      const paymentId = payload.data.id;

      // Cari transaksi berdasarkan payment_id
      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .select('form_submission_id')
        .eq('payment_id', paymentId)
        .single();

      if (transactionError) {
        console.error('Error finding transaction:', transactionError);
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Transaction not found' }),
        };
      }

      // Update status transaksi
      const { error: updateTransactionError } = await supabase
        .from('transactions')
        .update({ status: 'completed' })
        .eq('payment_id', paymentId);

      if (updateTransactionError) {
        console.error('Error updating transaction:', updateTransactionError);
        return {
          statusCode: 500,
          body: JSON.stringify({ message: 'Error updating transaction' }),
        };
      }

      // Update status form submission
      const { data: formSubmission, error: formError } = await supabase
        .from('form_submissions')
        .update({ payment_status: 'completed' })
        .eq('id', transaction.form_submission_id)
        .select();

      if (formError) {
        console.error('Error updating form submission:', formError);
        return {
          statusCode: 500,
          body: JSON.stringify({ message: 'Error updating form submission' }),
        };
      }

      // Kirim email notifikasi (implementasi sebenarnya akan menggunakan layanan email)
      console.log('Sending payment success email to:', formSubmission[0].email);

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Webhook processed successfully' }),
      };
    }

    // Untuk event lain, hanya acknowledge
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event acknowledged' }),
    };

  } catch (error) {
    console.error('Webhook error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error' }),
    };
  }
};
