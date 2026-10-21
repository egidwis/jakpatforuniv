import { sendMail } from './_mail.js';

// Mode libur (sql/120): status libur dibaca dengan anon key — tabelnya memang
// boleh dibaca anon (4 kolom). Batas 3 detik; gagal/lambat = email biasa.
// Email konfirmasi TIDAK PERNAH gagal karena status libur.
const HOLIDAYS_TABLE = 'JFU_operational_holidays';
const AWAY_TIMEOUT_MS = 3000;

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** `{ label }` bila tim admin sedang libur, `null` bila tidak / tak terbaca. */
export async function fetchAdminAway(env, fetchImpl = fetch) {
    const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
    const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
    if (!url || !anonKey) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AWAY_TIMEOUT_MS);
    try {
        const res = await fetchImpl(
            `${url}/rest/v1/${HOLIDAYS_TABLE}?select=holiday_date,label&is_active=eq.true&order=holiday_date.desc&limit=1`,
            { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }, signal: controller.signal },
        );
        if (!res.ok) return null;
        const rows = await res.json();
        return Array.isArray(rows) && rows.length > 0 ? { label: rows[0].label || '' } : null;
    } catch (e) {
        console.warn('[send-submission-email] status libur tak terbaca:', e?.message || e);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/** Kotak pemberitahuan libur — pesan admin di-escape (teks bebas dari admin). */
export function awayNoticeHtml(away) {
    if (!away) return '';
    const quoted = away.label ? `: "${escapeHtml(away.label)}"` : '';
    return `
            <div style="border:1px solid #fcd34d; background:#fffbeb; border-radius:8px; padding:12px 14px; margin:12px 0; color:#78350f;">
              Saat ini tim admin sedang libur${quoted}. Review akan kami kerjakan setelah tim kembali,
              jadi balasan kami sedikit lebih lama dari biasanya. Iklan yang sudah terjadwal tetap tayang otomatis.
            </div>`;
}

export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const { name, email } = await request.json();


        if (!email || !name) {
            return new Response(JSON.stringify({ error: 'Missing name or email' }), { status: 400 });
        }

        const away = await fetchAdminAway(env);

        const result = await sendMail(env, {
            to: email,
            subject: 'Terima kasih telah submit Form Order Iklan di Jakpat for Universities 🙏',
            html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <p>Halo Kak <strong>${escapeHtml(name)}</strong>,</p>
            <p>Terima kasih telah submit Form Order Iklan di Jakpat for Universities 🙏</p>${awayNoticeHtml(away)}
            <p>Survei yang Kakak kirimkan akan kami review terlebih dahulu untuk memastikan sudah sesuai dengan ketentuan dan siap untuk diiklankan.</p>
            <p>Mohon kesediaannya untuk menunggu ya. ${away
                ? 'Kami akan menghubungi Kakak kembali melalui e-mail setelah tim kembali dan proses review selesai.'
                : 'Kami akan segera menghubungi Kakak kembali melalui e-mail setelah proses review selesai.'}</p>
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
