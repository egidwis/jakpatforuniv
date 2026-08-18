import { sendMail } from './_mail.js';

export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const { name, email } = await request.json();


        if (!email || !name) {
            return new Response(JSON.stringify({ error: 'Missing name or email' }), { status: 400 });
        }

        const result = await sendMail(env, {
            to: email,
            subject: 'Terima kasih telah submit Form Order Iklan di Jakpat for Universities 🙏',
            html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <p>Halo Kak <strong>${name}</strong>,</p>
            <p>Terima kasih telah submit Form Order Iklan di Jakpat for Universities 🙏</p>
            <p>Survei yang Kakak kirimkan akan kami review terlebih dahulu untuk memastikan sudah sesuai dengan ketentuan dan siap untuk diiklankan.</p>
            <p>Mohon kesediaannya untuk menunggu ya. Kami akan segera menghubungi Kakak kembali melalui e-mail setelah proses review selesai.</p>
            <p>Terima kasih atas kepercayaan Kakak kepada Jakpat for Universities.</p>
            <br>
            <p>Semoga kami bisa membantu kebutuhan riset Kakak dengan optimal 😊</p>
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
        console.error('Function Kind Error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
