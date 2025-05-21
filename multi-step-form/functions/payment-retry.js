import { createClient } from '@supabase/supabase-js';

export async function onRequest(context) {
  // Ambil parameter dari URL
  const url = new URL(context.request.url);
  const formId = url.searchParams.get('id');
  
  // Jika tidak ada form_id, tampilkan halaman error
  if (!formId) {
    return renderRetryPage({
      title: 'Coba Bayar Lagi',
      message: 'ID form tidak ditemukan. Silakan kembali ke halaman beranda.',
      formData: null
    });
  }
  
  try {
    // Inisialisasi Supabase client
    const supabaseUrl = context.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = context.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return renderRetryPage({
        title: 'Coba Bayar Lagi',
        message: 'Terjadi kesalahan saat memuat data. Silakan coba lagi nanti.',
        formData: null
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // Ambil data form submission
    const { data: formData, error: formError } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('id', formId)
      .single();
    
    if (formError) {
      console.error('Error finding form submission:', formError);
      return renderRetryPage({
        title: 'Coba Bayar Lagi',
        message: 'Form tidak ditemukan. Silakan kembali ke halaman beranda.',
        formData: null
      });
    }
    
    // Tampilkan halaman retry dengan data form
    return renderRetryPage({
      title: 'Coba Bayar Lagi',
      message: `Silakan coba lagi pembayaran untuk form "${formData.form_title}"`,
      formData
    });
    
  } catch (error) {
    console.error('Error processing retry page:', error);
    return renderRetryPage({
      title: 'Coba Bayar Lagi',
      message: 'Terjadi kesalahan saat memuat data. Silakan coba lagi nanti.',
      formData: null
    });
  }
}

function renderRetryPage({ title, message, formData }) {
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
    .retry-container {
      text-align: center;
      padding: 40px 20px;
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
      text-align: left;
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
      margin-right: 10px;
    }
    button:hover {
      background-color: #2d3748;
    }
    .button-primary {
      background-color: #3b82f6;
    }
    .button-primary:hover {
      background-color: #2563eb;
    }
    .button-disabled {
      background-color: #6b7280;
      cursor: not-allowed;
    }
    a {
      color: #60a5fa;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    #payment-result {
      margin-top: 20px;
      padding: 15px;
      border-radius: 5px;
      display: none;
    }
    .result-success {
      background-color: #064e3b;
      color: #d1fae5;
    }
    .result-error {
      background-color: #7f1d1d;
      color: #fee2e2;
    }
    .loading {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 3px solid rgba(255,255,255,.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 1s ease-in-out infinite;
      margin-right: 10px;
      vertical-align: middle;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="retry-container">
    <h1>${title}</h1>
    <p>${message}</p>
    
    ${formData ? `
    <div class="card">
      <h2>Detail Form</h2>
      <div class="details-item">
        <span class="details-label">Judul:</span>
        <span class="details-value">${formData.form_title}</span>
      </div>
      <div class="details-item">
        <span class="details-label">Jumlah Responden:</span>
        <span class="details-value">${formData.respondent_count}</span>
      </div>
      <div class="details-item">
        <span class="details-label">Durasi:</span>
        <span class="details-value">${formData.duration} hari</span>
      </div>
      <div class="details-item">
        <span class="details-label">Total Biaya:</span>
        <span class="details-value">Rp ${(formData.total_cost).toLocaleString('id-ID')}</span>
      </div>
    </div>
    ` : ''}
    
    <div id="payment-result"></div>
    
    <div>
      <a href="/" style="display: inline-block;">
        <button>Kembali ke Beranda</button>
      </a>
      
      ${formData ? `
      <button id="retry-payment-btn" class="button-primary" onclick="retryPayment('${formData.id}', ${formData.total_cost})">
        Bayar Sekarang
      </button>
      ` : ''}
    </div>
  </div>
  
  <script>
    async function retryPayment(formId, amount) {
      const resultDiv = document.getElementById('payment-result');
      const retryButton = document.getElementById('retry-payment-btn');
      
      // Tampilkan loading
      retryButton.innerHTML = '<span class="loading"></span> Memproses...';
      retryButton.disabled = true;
      retryButton.classList.add('button-disabled');
      retryButton.classList.remove('button-primary');
      
      resultDiv.style.display = 'block';
      resultDiv.className = '';
      resultDiv.textContent = 'Mempersiapkan pembayaran...';
      
      try {
        // Ambil data form dari API
        const formResponse = await fetch(\`/api/form-data?id=\${formId}\`);
        const formData = await formResponse.json();
        
        if (!formResponse.ok) {
          throw new Error(formData.message || 'Gagal mengambil data form');
        }
        
        // Buat pembayaran baru
        const paymentResponse = await fetch('/api/create-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: amount,
            title: \`Pembayaran untuk \${formData.form_title}\`,
            description: \`Pembayaran untuk \${formData.respondent_count} responden\`,
            customer: {
              name: formData.name,
              email: formData.email,
              phone: formData.phone
            },
            transaction_id: formId,
            success_redirect_url: \`\${window.location.origin}/success?payment_id={id}\`,
            failure_redirect_url: \`\${window.location.origin}/payment-failed?payment_id={id}\`
          }),
        });
        
        const paymentData = await paymentResponse.json();
        
        if (!paymentResponse.ok) {
          throw new Error(paymentData.message || 'Gagal membuat pembayaran');
        }
        
        // Tampilkan pesan sukses
        resultDiv.className = 'result-success';
        resultDiv.textContent = 'Berhasil! Anda akan diarahkan ke halaman pembayaran...';
        
        // Redirect ke halaman pembayaran
        setTimeout(() => {
          window.location.href = paymentData.payment_url;
        }, 1500);
        
      } catch (error) {
        console.error('Error:', error);
        
        // Tampilkan pesan error
        resultDiv.className = 'result-error';
        resultDiv.textContent = \`Error: \${error.message}\`;
        
        // Reset button
        retryButton.innerHTML = 'Bayar Sekarang';
        retryButton.disabled = false;
        retryButton.classList.remove('button-disabled');
        retryButton.classList.add('button-primary');
      }
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
    },
  });
}
