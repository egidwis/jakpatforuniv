export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const { name, email } = await request.json();

        // API Key from environment or fallback (session specific)
        const API_KEY = env.RESEND_API_KEY || 're_eYASaUeS_nLHkV4RSgPCFc9tbSxYoZVn5';

        if (!email || !name) {
            return new Response(JSON.stringify({ error: 'Missing name or email' }), { status: 400 });
        }

        // Use Native Fetch instead of Resend SDK to avoid Node.js polyfill issues in Cloudflare Workers
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                from: 'Jakpat for Universities <noreply@jakpatforuniv.com>',
                to: [email],
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
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Resend API Error:', data);
            return new Response(JSON.stringify({ error: data }), { status: response.status });
        }

        return new Response(JSON.stringify(data), { status: 200 });
    } catch (e) {
        console.error('Function Kind Error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
