// Dipanggil oleh pg_cron/pg_net di Supabase (lihat sql/48_ad_live_notifications.sql),
// bukan dari frontend — karena itu wajib membawa ?k=<CRON_NOTIFY_SECRET> yang valid.
// Pola sama dengan gerbang webhook DOKU di functions/api/doku/webhook.js.

const WIB_FORMATTER = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
});

export async function onRequestPost(context) {
    const { request, env } = context;

    const requestUrl = new URL(request.url);
    const providedSecret = requestUrl.searchParams.get('k');
    const expectedSecret = env.CRON_NOTIFY_SECRET;
    if (!expectedSecret || providedSecret !== expectedSecret) {
        console.error('[notify-ad-live] Rejected: missing/invalid ?k= secret');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    try {
        const { email, full_name, title, start_date, end_date } = await request.json();

        const API_KEY = env.RESEND_API_KEY;
        if (!API_KEY) {
            console.error('RESEND_API_KEY not configured');
            return new Response(JSON.stringify({ error: 'Email service not configured' }), { status: 500 });
        }

        if (!email) {
            return new Response(JSON.stringify({ error: 'Missing email' }), { status: 400 });
        }

        const name = full_name || 'Kak';
        const surveyLine = title ? ` <strong>${title}</strong>` : ' kamu';
        const startText = start_date ? WIB_FORMATTER.format(new Date(start_date)) : null;
        const endText = end_date ? WIB_FORMATTER.format(new Date(end_date)) : null;
        const windowLine = startText && endText
            ? `<p>Iklan tayang mulai <strong>${startText}</strong> pukul 15.00 WIB sampai <strong>${endText}</strong>.</p>`
            : '';

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                from: 'Jakpat for Universities <noreply@jakpatforuniv.com>',
                to: [email],
                subject: 'Iklan surveimu mulai tayang hari ini 🎉',
                html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <p>Halo Kak <strong>${name}</strong>,</p>
            <p>Survei${surveyLine} sekarang sudah mulai tayang di Jakpat for Universities.</p>
            ${windowLine}
            <p>Kamu bisa memantau perkembangan respondennya kapan saja lewat Order Saya.</p>
            <br>
            <p>Semoga hasil risetmu optimal 😊</p>
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
        console.error('notify-ad-live error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
