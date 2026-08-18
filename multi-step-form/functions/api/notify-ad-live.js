import { sendMail } from './_mail.js';

// Dipanggil oleh pg_cron/pg_net di Supabase (lihat sql/48_ad_live_notifications.sql),
// bukan dari frontend — karena itu wajib membawa ?k=<CRON_NOTIFY_SECRET> yang valid.
// Pola sama dengan gerbang webhook DOKU di functions/api/doku/webhook.js.

const WIB_DATE_FORMATTER = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
});
// sql/49: notify_primary_ads_live() sekarang mengirim start_date/end_date sebagai
// instant sebenarnya (jam kustom admin atau gelombang Kilat), bukan selalu 15.00 —
// formatter jam ini menggantikan teks "pukul 15.00 WIB" yang dulu di-hardcode.
const WIB_TIME_FORMATTER = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta',
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


        if (!email) {
            return new Response(JSON.stringify({ error: 'Missing email' }), { status: 400 });
        }

        const name = full_name || 'Kak';
        const surveyLine = title ? ` <strong>${title}</strong>` : ' kamu';
        const startInstant = start_date ? new Date(start_date) : null;
        const endInstant = end_date ? new Date(end_date) : null;
        const startText = startInstant ? WIB_DATE_FORMATTER.format(startInstant) : null;
        const endText = endInstant ? WIB_DATE_FORMATTER.format(endInstant) : null;
        const startTimeText = startInstant ? WIB_TIME_FORMATTER.format(startInstant) : null;
        const windowLine = startText && endText
            ? `<p>Iklan tayang mulai <strong>${startText}</strong> pukul ${startTimeText} WIB sampai <strong>${endText}</strong>.</p>`
            : '';

        const result = await sendMail(env, {
            to: email,
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
        });

        if (!result.ok) {
            console.error(`[mail] gagal via ${result.provider}:`, result.error);
            // 502, bukan 500: yang gagal penyedia email di hulu, bukan fungsi ini.
            return new Response(JSON.stringify({ error: result.error, provider: result.provider }), { status: 502 });
        }

        return new Response(JSON.stringify({ id: result.id, provider: result.provider }), { status: 200 });
    } catch (e) {
        console.error('notify-ad-live error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
