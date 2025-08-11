// Cloudflare Function untuk webhook Mayar
// Menerima notifikasi pembayaran dari Mayar dan memperbarui status di database

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
    // Parse request body
    const requestData = await context.request.json();
    
    console.log('Webhook received:', JSON.stringify(requestData));

    // Validasi webhook token jika ada
    const webhookToken = context.env.VITE_MAYAR_WEBHOOK_TOKEN;
    const requestToken = context.request.headers.get('X-Webhook-Token');

    if (webhookToken && requestToken !== webhookToken) {
      console.error('Invalid webhook token');
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid webhook token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Ekstrak data pembayaran dari webhook
    // Format webhook Mayar bisa bervariasi, jadi kita perlu menangani beberapa kemungkinan
    
    let paymentId = '';
    let status = '';
    
    // Format 1: data.id dan data.status
    if (requestData.data && requestData.data.id) {
      paymentId = requestData.data.id;
      status = requestData.data.status || '';
    }
    // Format 2: id dan status langsung di root
    else if (requestData.id) {
      paymentId = requestData.id;
      status = requestData.status || '';
    }
    // Format 3: transaction_id dan status
    else if (requestData.transaction_id) {
      paymentId = requestData.transaction_id;
      status = requestData.status || '';
    }
    
    if (!paymentId) {
      console.error('Payment ID not found in webhook data');
      return new Response(JSON.stringify({
        success: false,
        message: 'Payment ID not found in webhook data'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Map status Mayar ke status aplikasi
    let appStatus = 'pending';
    
    if (status === 'PAID' || status === 'paid' || status === 'COMPLETED' || status === 'completed') {
      appStatus = 'completed';
    } else if (status === 'FAILED' || status === 'failed' || status === 'EXPIRED' || status === 'expired') {
      appStatus = 'failed';
    }
    
    console.log(`Payment ${paymentId} status updated to ${appStatus}`);
    
    // TODO: Perbarui status di database
    // Ini memerlukan akses ke Supabase, yang mungkin perlu diimplementasikan
    // dengan cara lain karena keterbatasan Cloudflare Functions
    
    // Untuk saat ini, kita hanya mengembalikan respons sukses
    return new Response(JSON.stringify({
      success: true,
      message: 'Webhook received successfully',
      paymentId,
      status: appStatus
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    
    return new Response(JSON.stringify({
      success: false,
      message: 'Error processing webhook: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
