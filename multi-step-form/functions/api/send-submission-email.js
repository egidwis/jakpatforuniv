import { sendMail } from './_mail.js';

// Mode libur (sql/122): status libur dibaca dengan anon key — tabelnya memang
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

/**
 * Kosakata per produk. Kilat Survei bukan iklan yang tayang per hari — ia satu
 * gelombang push, dan gelombangnya ditugaskan tim untuk order jalur manual.
 * `product` dikirim wizard; nilai tak dikenal = Iklan (perilaku lama).
 */
export function productCopy(product) {
    return product === 'kilat'
        ? {
            orderName: 'Kilat Survei',
            readyFor: 'siap dikirim lewat push Kilat Survei',
            teamAssigns: 'menugaskan gelombang push',
            subjectAssigns: 'tim kami menugaskan gelombang',
            awayAfter: 'Gelombang Kilat Survei kami tugaskan setelah tim kembali.',
        }
        : {
            orderName: 'Iklan',
            readyFor: 'siap untuk diiklankan',
            teamAssigns: 'menetapkan tanggal tayang',
            subjectAssigns: 'tim kami menjadwalkan',
            awayAfter: 'Iklan yang sudah terjadwal tetap tayang otomatis.',
        };
}

/** Kotak pemberitahuan libur — pesan admin di-escape (teks bebas dari admin). */
export function awayNoticeHtml(away, product) {
    if (!away) return '';
    const quoted = away.label ? `: "${escapeHtml(away.label)}"` : '';
    return `
            <div style="border:1px solid #fcd34d; background:#fffbeb; border-radius:8px; padding:12px 14px; margin:12px 0; color:#78350f;">
              Saat ini tim admin sedang libur${quoted}. Review akan kami kerjakan setelah tim kembali,
              jadi balasan kami sedikit lebih lama dari biasanya. ${productCopy(product).awayAfter}
            </div>`;
}

/**
 * Varian tutup reservasi mandiri (sql/125): order jalur otomatis yang lahir
 * saat saklar ditutup. Review-nya SUDAH lolos — yang menunggu tim hanya
 * tanggal tayang & tagihan, jadi kalimat "akan kami review" salah di sini.
 *
 * `reason === 'full'` (27 Okt 2026): pintu yang sama dipakai saat kuota
 * penuh — peneliti tidak punya pilihan sendiri, tim yang mencarikan jadwal
 * terdekat. Nilai lain = teks reservasi ditutup seperti dulu.
 */
function adminScheduleMail(name, away, product, reason) {
    const copy = productCopy(product);
    const awayBox = away
        ? `
            <div style="border:1px solid #fcd34d; background:#fffbeb; border-radius:8px; padding:12px 14px; margin:12px 0; color:#78350f;">
              Saat ini tim admin sedang libur${away.label ? `: "${escapeHtml(away.label)}"` : ''}. Penjadwalan dan tagihan kami kirim setelah tim kembali.
            </div>`
        : '';
    return {
        subject: `Pesanan ${copy.orderName} diterima — ${copy.subjectAssigns} 🗓️`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <p>Halo Kak <strong>${escapeHtml(name)}</strong>,</p>
            <p>Terima kasih, pesanan ${copy.orderName} Kakak di Jakpat for Universities sudah kami terima dan kuesionernya lolos review otomatis 🙏</p>${awayBox}
            <p>${reason === 'full'
                ? `Saat ini jadwal yang bisa Kakak pesan sendiri sudah penuh, jadi tim kami yang ${copy.teamAssigns} terdekat`
                : `Saat ini reservasi mandiri sedang ditutup sementara, jadi tim kami yang ${copy.teamAssigns}`} dan menyiapkan tagihannya — ${away
                ? 'setelah tim kembali.'
                : 'maksimal 1 hari kerja.'}</p>
            <p>Kakak tidak perlu memilih jadwal sendiri. Tagihannya akan muncul di halaman Order Saya dan kami kabari lewat e-mail.</p>
            <p>Terima kasih atas kepercayaan Kakak kepada Jakpat for Universities.</p>
            <br>
            <p>Salam,</p>
            <p><strong>Tim Jakpat for Universities</strong></p>
          </div>
        `,
    };
}

export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const { name, email, kind, product, reason } = await request.json();
        const copy = productCopy(product);


        if (!email || !name) {
            return new Response(JSON.stringify({ error: 'Missing name or email' }), { status: 400 });
        }

        const away = await fetchAdminAway(env);

        const result = await sendMail(env, kind === 'admin_schedule' ? { to: email, ...adminScheduleMail(name, away, product, reason) } : {
            to: email,
            subject: `Terima kasih telah submit Form Order ${copy.orderName} di Jakpat for Universities 🙏`,
            html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <p>Halo Kak <strong>${escapeHtml(name)}</strong>,</p>
            <p>Terima kasih telah submit Form Order ${copy.orderName} di Jakpat for Universities 🙏</p>${awayNoticeHtml(away, product)}
            <p>Survei yang Kakak kirimkan akan kami review terlebih dahulu untuk memastikan sudah sesuai dengan ketentuan dan ${copy.readyFor}.</p>
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
