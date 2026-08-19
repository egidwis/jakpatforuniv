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
            subject: '[Jakpat for Univ] Iklan surveimu mulai tayang hari ini 🚀',
            html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
            <div style="margin-bottom: 24px;">
              <span style="font-size: 13px; font-weight: 700; color: #4f46e5; letter-spacing: 0.5px; text-transform: uppercase;">Jakpat for Universities</span>
              <h2 style="margin: 6px 0 0; font-size: 20px; font-weight: 800; color: #0f172a;">Iklan Survei Mulai Ditayangkan! 🚀</h2>
            </div>
            
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
              Halo Kak <strong>${name}</strong>,
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
              Kuesioner survei${surveyLine} sekarang sudah <strong>mulai aktif ditayangkan</strong> ke panel responden Jakpat.
            </p>
            
            ${windowLine ? `<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; border-radius: 8px; padding: 14px 16px; margin: 18px 0; font-size: 13px; color: #334155;">${windowLine}</div>` : ''}

            <!-- Teaser JFU AI Analyzer -->
            <div style="background: linear-gradient(135deg, #eef2ff 0%, #faf5ff 100%); border: 1px solid #c7d2fe; border-radius: 12px; padding: 18px; margin: 24px 0;">
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 16px; margin-right: 6px;">💡</span>
                <strong style="font-size: 13px; color: #3730a3;">Tips Riset & Olah Data:</strong>
              </div>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #4338ca;">
                Sambil menunggu respon terkumpul, ketahui bahwa setelah penayangan selesai nanti, Anda bisa langsung mengolah visualisasi grafik, tabulasi silang, dan draf narasi untuk <strong>skripsi, riset, maupun jurnal</strong> secara otomatis menggunakan <strong>JFU AI Analyzer</strong>.
              </p>
            </div>

            <div style="margin: 28px 0 20px; text-align: center;">
              <a href="https://jakpatforuniv.com/dashboard/orders" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-size: 13px; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 10px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2);">
                Pantau Status Penayangan &rarr;
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0 16px;" />
            <p style="font-size: 12px; color: #64748b; margin: 0; line-height: 1.5;">
              Semoga proses pengumpulan data berjalan lancar dan hasil riset optimal.<br>
              <strong>Tim Jakpat for Universities</strong>
            </p>
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
