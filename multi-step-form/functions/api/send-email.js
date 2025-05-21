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
    const { to, subject, html, text } = requestData;
    
    // Validasi input
    if (!to || !subject || (!html && !text)) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Missing required fields: to, subject, and either html or text' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Untuk saat ini, hanya log email yang akan dikirim
    // Implementasi sebenarnya akan menggunakan layanan email seperti Resend
    console.log('Email would be sent:', {
      to,
      subject,
      html: html ? html.substring(0, 100) + '...' : undefined,
      text: text ? text.substring(0, 100) + '...' : undefined
    });
    
    // Simulasi pengiriman email berhasil
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Email sent successfully (simulated)',
      id: 'email_' + Date.now()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error sending email:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: 'Error sending email: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
