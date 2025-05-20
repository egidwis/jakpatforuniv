// Webhook handler untuk notifikasi pembayaran dari Mayar
const { createClient } = require('@supabase/supabase-js');

// Inisialisasi Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // Gunakan service key untuk akses penuh
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    // TODO: Implementasi verifikasi signature
    
    // Parse body
    const payload = JSON.parse(event.body);
    console.log('Webhook payload:', payload);
    
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
