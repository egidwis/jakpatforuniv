import { createClient } from '@supabase/supabase-js';

export async function onRequest(context) {
  // Ambil parameter dari URL
  const url = new URL(context.request.url);
  const paymentId = url.searchParams.get('payment_id');
  
  // Jika tidak ada payment_id, tampilkan halaman sukses generik
  if (!paymentId) {
    return renderSuccessPage({
      title: 'Pembayaran Berhasil',
      message: 'Terima kasih atas pembayaran Anda.',
      details: null
    });
  }
  
  try {
    // Inisialisasi Supabase client
    const supabaseUrl = context.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = context.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return renderSuccessPage({
        title: 'Pembayaran Berhasil',
        message: 'Terima kasih atas pembayaran Anda.',
        details: { payment_id: paymentId }
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // Cari transaksi berdasarkan payment_id
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .select('*, form_submissions(*)')
      .eq('payment_id', paymentId)
      .single();
    
    if (transactionError) {
      console.error('Error finding transaction:', transactionError);
      return renderSuccessPage({
        title: 'Pembayaran Berhasil',
        message: 'Terima kasih atas pembayaran Anda. Namun, kami tidak dapat menemukan detail transaksi Anda.',
        details: { payment_id: paymentId }
      });
    }
    
    // Tampilkan halaman sukses dengan detail transaksi
    return renderSuccessPage({
      title: 'Pembayaran Berhasil',
      message: `Terima kasih, ${transaction.form_submissions?.name || 'Responden'}! Pembayaran Anda telah berhasil diproses.`,
      details: {
        payment_id: paymentId,
        amount: transaction.amount,
        created_at: transaction.created_at,
        form_title: transaction.form_submissions?.form_title,
        email: transaction.form_submissions?.email
      }
    });
    
  } catch (error) {
    console.error('Error processing success page:', error);
    return renderSuccessPage({
      title: 'Pembayaran Berhasil',
      message: 'Terima kasih atas pembayaran Anda. Terjadi kesalahan saat memuat detail transaksi.',
      details: { payment_id: paymentId }
    });
  }
}

function renderSuccessPage({ title, message, details }) {
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
      background-color: #1a1a1a;
      color: #e0e0e0;
    }
    .success-container {
      text-align: center;
      padding: 40px 20px;
    }
    .success-icon {
      font-size: 80px;
      color: #4ade80;
      margin-bottom: 20px;
    }
    h1 {
      color: #ffffff;
      margin-bottom: 20px;
    }
    .card {
      background-color: #2a2a2a;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    .details-item {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #3a3a3a;
    }
    .details-item:last-child {
      border-bottom: none;
    }
    .details-label {
      font-weight: 500;
    }
    .details-value {
      font-family: monospace;
    }
    button {
      background-color: #4a5568;
      color: white;
      border: none;
      padding: 10px 15px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 16px;
      margin-top: 20px;
    }
    button:hover {
      background-color: #2d3748;
    }
    a {
      color: #60a5fa;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="success-container">
    <div class="success-icon">✓</div>
    <h1>${title}</h1>
    <p>${message}</p>
    
    ${details ? `
    <div class="card">
      <h2>Detail Transaksi</h2>
      ${details.payment_id ? `
      <div class="details-item">
        <span class="details-label">ID Pembayaran:</span>
        <span class="details-value">${details.payment_id}</span>
      </div>` : ''}
      
      ${details.amount ? `
      <div class="details-item">
        <span class="details-label">Jumlah:</span>
        <span class="details-value">Rp ${(details.amount / 100).toLocaleString('id-ID')}</span>
      </div>` : ''}
      
      ${details.created_at ? `
      <div class="details-item">
        <span class="details-label">Tanggal:</span>
        <span class="details-value">${new Date(details.created_at).toLocaleString('id-ID')}</span>
      </div>` : ''}
      
      ${details.form_title ? `
      <div class="details-item">
        <span class="details-label">Formulir:</span>
        <span class="details-value">${details.form_title}</span>
      </div>` : ''}
      
      ${details.email ? `
      <div class="details-item">
        <span class="details-label">Email:</span>
        <span class="details-value">${details.email}</span>
      </div>` : ''}
    </div>
    ` : ''}
    
    <p>Email konfirmasi telah dikirim ke alamat email Anda.</p>
    <button onclick="window.location.href='/'">Kembali ke Beranda</button>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
    },
  });
}
