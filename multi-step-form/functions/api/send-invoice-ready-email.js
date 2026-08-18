export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const { name, email, title, invoiceUrl, amount } = await request.json();

        const API_KEY = env.RESEND_API_KEY;
        if (!API_KEY) {
            console.error('RESEND_API_KEY not configured');
            return new Response(JSON.stringify({ error: 'Email service not configured' }), { status: 500 });
        }

        if (!email || !name || !invoiceUrl) {
            return new Response(JSON.stringify({ error: 'Missing name, email, or invoiceUrl' }), { status: 400 });
        }

        const amountText = typeof amount === 'number'
            ? `Rp${amount.toLocaleString('id-ID')}`
            : null;
        const surveyLine = title ? ` untuk survei <strong>${title}</strong>` : '';

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                from: 'Jakpat for Universities <noreply@jakpatforuniv.com>',
                to: [email],
                subject: 'Pesananmu disetujui, tagihan siap dibayar — Jakpat for Universities',
                html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <p>Halo Kak <strong>${name}</strong>,</p>
            <p>Kabar baik! Pesananmu${surveyLine} sudah kami periksa dan disetujui.</p>
            <p>Tagihannya sudah siap${amountText ? ` senilai <strong>${amountText}</strong>` : ''}. Setelah dibayar, kamu akan diarahkan memilih jadwal tayang iklanmu.</p>
            <p style="margin: 24px 0;">
              <a href="${invoiceUrl}" style="background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                Bayar Sekarang
              </a>
            </p>
            <p>Kalau tombolnya tidak muncul, salin tautan ini: <br><a href="${invoiceUrl}">${invoiceUrl}</a></p>
            <br>
            <p>Terima kasih atas kepercayaan Kakak kepada Jakpat for Universities.</p>
            <p>Salam,</p>
            <p><strong>Tim Jakpat for Universities</strong></p>
          </div>
        `
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Resend API Error:', data);
            return new Response(JSON.stringify({ error: data }), { status: response.status });
        }

        return new Response(JSON.stringify(data), { status: 200 });
    } catch (e) {
        console.error('send-invoice-ready-email error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
