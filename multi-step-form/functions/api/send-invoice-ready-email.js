import { sendMail } from './_mail.js';

export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const { name, email, title, invoiceUrl, amount } = await request.json();


        if (!email || !name || !invoiceUrl) {
            return new Response(JSON.stringify({ error: 'Missing name, email, or invoiceUrl' }), { status: 400 });
        }

        const amountText = typeof amount === 'number'
            ? `Rp${amount.toLocaleString('id-ID')}`
            : null;
        const surveyLine = title ? ` untuk survei <strong>${title}</strong>` : '';

        const result = await sendMail(env, {
            to: email,
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
        });

        if (!result.ok) {
            console.error(`[mail] gagal via ${result.provider}:`, result.error);
            // 502, bukan 500: yang gagal penyedia email di hulu, bukan fungsi ini.
            return new Response(JSON.stringify({ error: result.error, provider: result.provider }), { status: 502 });
        }

        return new Response(JSON.stringify({ id: result.id, provider: result.provider }), { status: 200 });
    } catch (e) {
        console.error('send-invoice-ready-email error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
