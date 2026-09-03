import { createClient } from '@supabase/supabase-js';
import { sendMail } from './_mail.js';

/**
 * Mengabari peneliti kalau JADWAL TAYANGNYA berubah — dibatalkan tim, atau
 * digeser ke tanggal lain.
 *
 * Fase ① baru saja mendapat notifikasinya (`notify-review-result`). Fase ②
 * sampai sekarang hanya punya email saat tagihan terbit, dan itu pun hanya
 * untuk jadwal pertama — jadi dua peristiwa yang paling mengubah rencana orang
 * (tanggalnya batal, tanggalnya pindah) sama sekali tidak berkabar. Peneliti
 * baru tahu kalau kebetulan membuka dashboard.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * KENAPA BODY-NYA TIDAK DIPERCAYA
 * ─────────────────────────────────────────────────────────────────────────
 * Sama seperti `notify-review-result`: endpoint ini dipanggil dari SPA admin DI
 * BROWSER, jadi rahasia `?k=` gaya `notify-ad-live` tidak berlaku — apa pun
 * yang dikirim klien bisa dikarang siapa saja yang membuka devtools.
 *
 * Jadi body hanya membawa `scheduleId` + `event` sebagai KLAIM. Alamat, nama,
 * judul, tanggal, dan status dibaca ULANG dari `ad_schedules` + `form_submissions`
 * dengan service key, dan emailnya cuma dikirim kalau keadaan di DB benar-benar
 * cocok dengan peristiwa yang diklaim. Pemanggil tidak bisa mengarahkan email
 * ke alamat sembarangan, dan tidak bisa mengabarkan tanggal yang tidak ada.
 *
 * SATU-SATUNYA nilai yang diterima apa adanya adalah `previousStart`, dan ia
 * dibatasi sesempit mungkin: hanya dirender kalau BERBEDA dari `start_date`
 * yang sekarang, dan ia tidak menentukan apakah email dikirim maupun ke siapa.
 * Skenario terburuknya adalah menyebut tanggal lama yang keliru kepada orang
 * yang tanggal barunya justru sedang ia baca di email yang sama.
 */

const WIB = 'Asia/Jakarta';
const DASHBOARD_URL = 'https://jakpatforuniversities.com/dashboard/status';

const fmtDate = (iso) =>
    iso
        ? new Date(iso).toLocaleDateString('id-ID', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: WIB,
        })
        : null;

/** Uang jadwal ini sudah masuk? Cerminan `isSchedulePaid` di klien. */
export function schedulePaid(sched) {
    const airing = (sched.status || '').toLowerCase();
    return sched.payment_status === 'paid'
        || ['paid', 'scheduled', 'live', 'completed'].includes(airing);
}

/**
 * Peristiwa yang diklaim BENAR-BENAR terjadi menurut cerminnya?
 *
 * Diekspor supaya bisa diuji sendiri — dan ia memang perlu diuji, karena aturan
 * di dalamnya terlihat seperti sesuatu yang "bisa disederhanakan" oleh
 * pembaca berikutnya, padahal penyederhanaan itu mengirim 136 email salah.
 *
 * @returns `{ send: true }` atau `{ send: false, reason, ... }`
 */
export function shouldSend(sched, event) {
    const airing = (sched.status || '').toLowerCase();

    if (event === 'cancelled') {
        /*
          ⚠️ GERBANGNYA BUKAN `status = 'cancelled'` SAJA — NILAI ITU KELEBIHAN
          MUATAN. Terukur di produksi 2026-08-26: dari 136 baris ber-`status =
          'cancelled'`, 110 sebenarnya **spam**, 15 **ditolak**, 9 **order
          dibatalkan**, dan hanya 1 yang benar-benar "tim membatalkan tanggal
          tayang".

          Ketiga yang pertama sudah punya emailnya sendiri lewat
          `notify-review-result`; mengirim dari sini juga berarti peneliti
          menerima dua email untuk satu peristiwa, salah satunya menjanjikan
          kuesionernya masih lolos review padahal justru ditolak.

          Pembedanya kontrak sql/62: membatalkan SLOT tidak mencabut kelulusan
          review. Jadi `slot_cancelled` adalah satu-satunya keadaan yang sumbu
          tayangnya `cancelled` sementara sumbu review-nya tetap `approved` —
          persis predikat `isSlotCancelledSchedule` di klien.
        */
        if (airing !== 'cancelled' || sched.review_status !== 'approved') {
            return {
                send: false,
                reason: 'not_slot_cancelled',
                actual: { status: sched.status, review_status: sched.review_status },
            };
        }
        return { send: true };
    }

    // 'moved' — jadwal yang sudah batal tidak "pindah"; ia sudah tidak punya
    // tanggal yang berarti apa pun bagi peneliti.
    if (airing === 'cancelled' || !sched.start_date) {
        return { send: false, reason: 'no_live_date' };
    }

    /*
      Peneliti yang menjadwalkan ulang SENDIRI tidak dikabari — ia baru saja
      memilih tanggalnya dan sedang melihat hasilnya di layar. Pola yang sama
      dipakai `notify-review-result` lewat `review_history.actor`.

      Di sini penandanya `slot_booked_by`: reservasi mandiri menulis 'user',
      pemindahan oleh admin menulis 'admin'. Hanya berlaku untuk jadwal yang
      BELUM lunas — `prepareForReschedule` menolak order lunas, jadi jadwal
      lunas yang berpindah pasti admin pelakunya, betapapun kolom itu masih
      menyimpan 'user' dari reservasi awalnya.
    */
    if (!schedulePaid(sched) && sched.slot_booked_by === 'user') {
        return { send: false, reason: 'self_rescheduled' };
    }

    return { send: true };
}

export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const { scheduleId, event, previousStart } = await request.json();

        if (!scheduleId || !event) {
            return new Response(JSON.stringify({ error: 'Missing scheduleId or event' }), { status: 400 });
        }
        if (!['cancelled', 'moved'].includes(event)) {
            return new Response(JSON.stringify({ error: 'Unknown event' }), { status: 400 });
        }

        const supabaseUrl = env.VITE_SUPABASE_URL;
        const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
            return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500 });
        }
        const supabase = createClient(supabaseUrl, serviceKey);

        // `ad_schedules` adalah cermin yang dilihat KEDUA layar — admin di papan
        // Schedule, peneliti di Fase ②. Membaca dari sini berarti email tidak
        // bisa menceritakan keadaan yang tidak ada di layar mana pun.
        const { data: sched, error: schedErr } = await supabase
            .from('ad_schedules')
            .select('id, submission_id, ordinal, booking_id, start_date, end_date, status, review_status, payment_status, slot_booked_by')
            .eq('id', scheduleId)
            .single();

        if (schedErr || !sched) {
            return new Response(JSON.stringify({ error: 'Schedule not found' }), { status: 404 });
        }

        const airing = (sched.status || '').toLowerCase();
        const isPaid = schedulePaid(sched);

        const gate = shouldSend(sched, event);
        if (!gate.send) {
            const { send, ...rest } = gate;
            return new Response(JSON.stringify({ skipped: true, ...rest }), { status: 200 });
        }

        const { data: order, error: orderErr } = await supabase
            .from('form_submissions')
            .select('email, full_name, title')
            .eq('id', sched.submission_id)
            .single();

        if (orderErr || !order) {
            return new Response(JSON.stringify({ error: 'Submission not found' }), { status: 404 });
        }
        if (!order.email) {
            return new Response(JSON.stringify({ skipped: true, reason: 'no_email_on_record' }), { status: 200 });
        }

        const name = order.full_name || 'Peneliti';
        const surveyLine = order.title ? ` untuk survei <strong>${order.title}</strong>` : '';
        const bookingLine = `<p style="color:#6b7280;font-size:12px;">Booking ID: <strong>#${sched.booking_id}</strong></p>`;
        const cta = `
            <p style="margin:24px 0;">
              <a href="${DASHBOARD_URL}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Buka Dashboard</a>
            </p>`;

        let subject;
        let bodyHtml;

        if (event === 'cancelled') {
            const when = fmtDate(sched.start_date);
            // Tanggalnya SENGAJA tetap disebut kalau ada — `cancelSchedule()`
            // tidak menghapusnya, dan tanpa itu peneliti tidak tahu jadwal mana
            // yang dimaksud pada order berjadwal banyak. Kalau memang tidak ada,
            // barisnya hilang; aturan emas berlaku di email juga.
            /*
              ⚠️ CABANG INI TIDAK PERNAH MENYEBUT TAGIHAN — DAN INSIDEN
              af004b84 LEWAT PERSIS DI SINI.

              Cabang `moved` di bawah sudah benar sejak lama: "tagihan itu tidak
              berlaku lagi … jangan bayar link yang lama". §00P menyebutnya
              satu-satunya kalimat yang benar-benar mencegah kehilangan uang.
              Pembatalan jadwal punya risiko yang SAMA PERSIS — link DOKU-nya
              tetap hidup di sisi bank — tapi tidak punya kalimatnya.

              Gerbangnya sama seperti `moved`: hanya untuk order yang BELUM
              lunas. Order yang sudah dibayar tidak punya link menggantung untuk
              dibayar keliru, dan memperingatkannya cuma menimbulkan cemas.
            */
            const unpaidNote = isPaid
                ? ''
                : `<p style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;">Kalau tagihan untuk tanggal ini sudah terlanjur Kakak terima, <strong>tagihan itu tidak berlaku lagi</strong> — <strong>jangan bayar link yang lama</strong>. Link pembayaran lama bisa saja masih terbuka, tapi uang yang masuk ke sana tidak otomatis menghidupkan jadwal yang sudah dibatalkan.</p>`;

            subject = 'Jadwal tayang iklanmu dibatalkan — Jakpat for Universities';
            bodyHtml = `
                <p>Halo Kak <strong>${name}</strong>,</p>
                <p>Kami mengabari bahwa <strong>tim Jakpat membatalkan jadwal tayang</strong>${surveyLine}${when ? ` yang dijadwalkan <strong>${when}</strong>` : ''}.</p>
                <p>Kuota tanggal itu sudah kami bebaskan. <strong>Kuesionermu tetap lolos review</strong> — yang batal hanya tanggalnya, bukan pesanannya, dan Kakak tidak perlu mengajukan ulang apa pun.</p>
                ${unpaidNote}
                <p>Tim kami akan menghubungi Kakak untuk menetapkan tanggal penggantinya. Kalau butuh penjelasan lebih dulu, balas email ini atau chat Mimin lewat dashboard.</p>
                ${bookingLine}
                ${cta}
            `;
        } else {
            const to = fmtDate(sched.start_date);
            // `previousStart` satu-satunya klaim yang diterima — dan hanya
            // dirender kalau benar-benar berbeda dari tanggal yang sekarang.
            const fromRaw = previousStart && String(previousStart);
            const from = fromRaw && new Date(fromRaw).getTime() !== new Date(sched.start_date).getTime()
                ? fmtDate(fromRaw)
                : null;

            const paidNote = isPaid
                ? `<p>Pesanan ini <strong>sudah dibayar</strong>, jadi tidak ada tagihan baru yang perlu Kakak selesaikan — jadwalnya saja yang bergeser.</p>`
                : `<p>Kalau tagihan untuk tanggal lama sudah terlanjur Kakak terima, <strong>tagihan itu tidak berlaku lagi</strong>. Tunggu tagihan pengganti dari kami — jangan bayar link yang lama.</p>`;

            const liveNote = airing === 'live'
                ? `<p style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;"><strong>Catatan:</strong> iklan ini sedang tayang saat jadwalnya kami ubah, jadi periode tayangnya ikut menyesuaikan.</p>`
                : '';

            subject = 'Jadwal tayang iklanmu berubah — Jakpat for Universities';
            bodyHtml = `
                <p>Halo Kak <strong>${name}</strong>,</p>
                <p>Jadwal tayang iklan${surveyLine} baru saja <strong>kami ubah</strong>.</p>
                ${from
                    ? `<p>Dari <strong>${from}</strong> menjadi <strong>${to}</strong>.</p>`
                    : `<p>Tanggal tayangnya sekarang <strong>${to}</strong>.</p>`}
                ${liveNote}
                ${paidNote}
                ${bookingLine}
                ${cta}
            `;
        }

        const result = await sendMail(env, {
            to: order.email,
            subject,
            html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            ${bodyHtml}
            <br>
            <p>Kalau ada yang ingin ditanyakan, balas email ini atau hubungi tim kami lewat dashboard.</p>
            <p>Salam,</p>
            <p><strong>Tim Jakpat for Universities</strong></p>
          </div>
        `,
        });

        if (!result.ok) {
            console.error(`[mail] gagal via ${result.provider}:`, result.error);
            // 502, bukan 500: yang gagal penyedia email di hulu, bukan fungsi ini.
            return new Response(JSON.stringify({ error: result.error, provider: result.provider }), { status: 502 });
        }

        return new Response(JSON.stringify({ id: result.id, provider: result.provider }), { status: 200 });
    } catch (e) {
        console.error('notify-schedule-change error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
