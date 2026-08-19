import { sendMail } from './_mail.js';

// Dipanggil oleh pg_cron/pg_net di Supabase saat jadwal iklan survei selesai tayang,
// wajib membawa ?k=<CRON_NOTIFY_SECRET> yang valid.

export async function onRequestPost(context) {
    const { request, env } = context;

    const requestUrl = new URL(request.url);
    const providedSecret = requestUrl.searchParams.get('k');
    const expectedSecret = env.CRON_NOTIFY_SECRET;
    if (!expectedSecret || providedSecret !== expectedSecret) {
        console.error('[notify-ad-completed] Rejected: missing/invalid ?k= secret');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    try {
        const { email, full_name, title } = await request.json();

        if (!email) {
            return new Response(JSON.stringify({ error: 'Missing email' }), { status: 400 });
        }

        const name = full_name || 'Kak';
        const surveyLine = title ? ` <strong>${title}</strong>` : '';

        const result = await sendMail(env, {
            to: email,
            subject: '[Jakpat for Univ] Survei Selesai! Waktunya Olah Data di JFU AI Analyzer 📊',
            html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
            <div style="margin-bottom: 24px;">
              <span style="font-size: 13px; font-weight: 700; color: #4f46e5; letter-spacing: 0.5px; text-transform: uppercase;">Jakpat for Universities</span>
              <h2 style="margin: 6px 0 0; font-size: 20px; font-weight: 800; color: #0f172a;">Survei Anda Telah Selesai Ditayangkan! 🎉</h2>
            </div>
            
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
              Halo Kak <strong>${name}</strong>,
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
              Periode penayangan iklan survei${surveyLine} telah <strong>resmi selesai</strong> dan responden Jakpat telah terkumpul.
            </p>

            <!-- Guide 3 Langkah -->
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0;">
              <h3 style="margin: 0 0 14px; font-size: 14px; font-weight: 700; color: #1e293b;">Olah Data Respon Anda dalam 3 Langkah Mudah:</h3>
              
              <div style="margin-bottom: 12px; display: flex; align-items: flex-start;">
                <span style="display: inline-block; width: 22px; height: 22px; line-height: 22px; background-color: #4f46e5; color: #ffffff; border-radius: 50%; text-align: center; font-size: 12px; font-weight: bold; margin-right: 10px; shrink-0;">1</span>
                <span style="font-size: 13px; color: #334155; line-height: 1.5;"><strong>Download file CSV</strong> respon dari Google Form / platform kuesioner Anda.</span>
              </div>
              
              <div style="margin-bottom: 12px; display: flex; align-items: flex-start;">
                <span style="display: inline-block; width: 22px; height: 22px; line-height: 22px; background-color: #4f46e5; color: #ffffff; border-radius: 50%; text-align: center; font-size: 12px; font-weight: bold; margin-right: 10px; shrink-0;">2</span>
                <span style="font-size: 13px; color: #334155; line-height: 1.5;"><strong>Upload ke JFU AI Analyzer</strong> untuk memetakan grafik & tabulasi silang secara instan.</span>
              </div>
              
              <div style="display: flex; align-items: flex-start;">
                <span style="display: inline-block; width: 22px; height: 22px; line-height: 22px; background-color: #4f46e5; color: #ffffff; border-radius: 50%; text-align: center; font-size: 12px; font-weight: bold; margin-right: 10px; shrink-0;">3</span>
                <span style="font-size: 13px; color: #334155; line-height: 1.5;"><strong>Copy gambar & narasi akademik</strong> langsung ke Word / Google Docs untuk laporan riset atau skripsi.</span>
              </div>
            </div>

            <!-- CTA Button -->
            <div style="margin: 28px 0; text-align: center;">
              <a href="https://jakpatforuniv.com/dashboard/analyzer/new" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 12px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);">
                🚀 Buka JFU AI Analyzer Sekarang &rarr;
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0 16px;" />
            <p style="font-size: 12px; color: #64748b; margin: 0; line-height: 1.5;">
              Terima kasih telah mempercayakan pengumpulan data responden kepada Jakpat for Universities.<br>
              <strong>Tim Jakpat for Universities</strong>
            </p>
          </div>
        `
        });

        if (!result.ok) {
            console.error(`[mail] gagal via ${result.provider}:`, result.error);
            return new Response(JSON.stringify({ error: result.error, provider: result.provider }), { status: 502 });
        }

        return new Response(JSON.stringify({ id: result.id, provider: result.provider }), { status: 200 });
    } catch (e) {
        console.error('notify-ad-completed error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
