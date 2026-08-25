import { createClient } from '@supabase/supabase-js';
import { sendMail } from './_mail.js';

/**
 * Mengabari peneliti hasil review kuesionernya.
 *
 * Email saat submit sudah lama MENJANJIKAN kabar ini ("hasilnya kami kabari
 * via email"), tapi tidak pernah ada endpoint yang mengirimnya: approve =
 * keheningan total, dan "minta perbaikan" cuma sampai kalau admin ingat
 * menekan tombol WA kedua. Janji itu ditepati di sini.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * KENAPA BODY-NYA TIDAK DIPERCAYA
 * ─────────────────────────────────────────────────────────────────────────
 * Endpoint ini dipanggil dari SPA admin DI BROWSER, jadi rahasia `?k=` seperti
 * `notify-ad-live` tidak berlaku — apa pun yang dikirim klien bisa dikarang
 * siapa saja yang membuka devtools.
 *
 * Karena itu body hanya membawa `submissionId` + `status` sebagai KLAIM.
 * Alamat, nama, judul, dan catatan dibaca ULANG dari database dengan service
 * key, dan emailnya cuma dikirim kalau `submission_status` di DB benar-benar
 * sama dengan status yang diklaim. Pemanggil tidak bisa mengarahkan email ke
 * alamat sembarangan, dan tidak bisa mengabarkan keputusan yang tidak terjadi.
 */
export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const { submissionId, status } = await request.json();

        if (!submissionId || !status) {
            return new Response(JSON.stringify({ error: 'Missing submissionId or status' }), { status: 400 });
        }

        // `spam` (Tidak Valid) sengaja TIDAK punya email. Ia bukan keputusan
        // yang ditujukan ke peneliti — ordernya bahkan tidak tampil lagi di
        // dashboardnya. Mengabarinya cuma mengundang balasan yang tidak
        // punya jawaban.
        if (!['approved', 'rejected', 'cancelled'].includes(status)) {
            return new Response(JSON.stringify({ skipped: true, reason: 'no_email_for_status' }), { status: 200 });
        }

        const supabaseUrl = env.VITE_SUPABASE_URL;
        const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
            return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500 });
        }
        const supabase = createClient(supabaseUrl, serviceKey);

        const { data: row, error } = await supabase
            .from('form_submissions')
            .select('email, full_name, title, admin_notes, question_count, submission_status, review_history')
            .eq('id', submissionId)
            .single();

        if (error || !row) {
            return new Response(JSON.stringify({ error: 'Submission not found' }), { status: 404 });
        }

        // Gerbangnya: keadaan DB, bukan klaim pemanggil.
        if (row.submission_status !== status) {
            return new Response(
                JSON.stringify({ skipped: true, reason: 'status_mismatch', actual: row.submission_status }),
                { status: 200 }
            );
        }

        if (!row.email) {
            return new Response(JSON.stringify({ skipped: true, reason: 'no_email_on_record' }), { status: 200 });
        }

        // Pembatalan oleh peneliti SENDIRI tidak perlu dikabari — ia baru saja
        // menekan tombolnya dan sudah melihat hasilnya di layar. Yang perlu
        // email adalah pembatalan oleh admin, yang datang tanpa ia minta.
        if (status === 'cancelled') {
            const entries = Array.isArray(row.review_history) ? row.review_history : [];
            const lastCancel = [...entries].reverse().find((h) => h && h.action === 'cancelled');
            if (lastCancel?.actor === 'researcher') {
                return new Response(JSON.stringify({ skipped: true, reason: 'self_cancelled' }), { status: 200 });
            }
        }

        const name = row.full_name || 'Peneliti';
        const surveyLine = row.title ? ` untuk survei <strong>${row.title}</strong>` : '';
        const dashboardUrl = 'https://jakpatforuniversities.com/dashboard/status';
        const notesBlock = row.admin_notes
            ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:16px 0;">
                 <strong style="display:block;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#92400e;margin-bottom:4px;">Catatan dari Tim Reviewer</strong>
                 <span style="white-space:pre-line;">${row.admin_notes}</span>
               </div>`
            : '';

        let subject;
        let bodyHtml;

        if (status === 'approved') {
            // Sesuai keputusan produk 2026-08-25: sesudah approval MANUAL, tim
            // Jakpat yang menetapkan jadwal lalu menerbitkan tagihan. Jadi email
            // ini TIDAK menyuruh peneliti memilih jadwal — menyuruhnya memilih
            // sesuatu yang bukan haknya adalah cara tercepat membuat dua pihak
            // sama-sama mengira giliran yang lain.
            subject = 'Kuesionermu disetujui — Jakpat for Universities';
            bodyHtml = `
                <p>Halo Kak <strong>${name}</strong>,</p>
                <p>Kabar baik! Kuesionermu${surveyLine} sudah selesai kami review dan <strong>disetujui</strong>.</p>
                <p>Jumlah pertanyaan yang kami catat: <strong>${row.question_count || 0} pertanyaan</strong>.</p>
                <p>Berikutnya, <strong>tim kami yang akan menetapkan jadwal tayang</strong> lalu menerbitkan tagihannya. Kakak tidak perlu memilih jadwal sendiri — kami kabari lagi begitu tagihannya siap dibayar.</p>
                ${notesBlock}
            `;
        } else if (status === 'rejected') {
            // Bunyinya "menunggu perbaikan", bukan penolakan: statusnya belum
            // final dan admin masih bisa meloloskannya. Kalimatnya sengaja
            // sejajar dengan pesan WA di drawer supaya dua kanal tidak berbeda.
            subject = 'Kuesionermu menunggu perbaikan — Jakpat for Universities';
            bodyHtml = `
                <p>Halo Kak <strong>${name}</strong>,</p>
                <p>Terima kasih sudah mengajukan kuesioner${surveyLine} di Jakpat for Universities.</p>
                <p>Saat proses review, kami menemukan beberapa hal yang perlu diperbaiki lebih dulu. <strong>Ini bukan penolakan</strong> — begitu Kakak selesai memperbaikinya, kami review lagi.</p>
                ${notesBlock}
                <p>Silakan perbaiki kuesionernya, lalu buka dashboard dan klik tombol <strong>&ldquo;Saya Sudah Perbaiki Kuesioner&rdquo;</strong> agar dapat kami proses kembali.</p>
                <p style="margin:24px 0;">
                  <a href="${dashboardUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Buka Dashboard</a>
                </p>
            `;
        } else {
            subject = 'Pesananmu dibatalkan — Jakpat for Universities';
            bodyHtml = `
                <p>Halo Kak <strong>${name}</strong>,</p>
                <p>Kami mengabari bahwa pesanan${surveyLine} telah <strong>dibatalkan</strong> dan tidak akan tayang.</p>
                ${notesBlock}
                <p>Tagihan yang mungkin sempat terbit untuk pesanan ini <strong>sudah tidak berlaku</strong> — mohon jangan membayar tautan pembayaran lama yang mungkin sudah Kakak terima.</p>
                <p>Kalau Kakak masih ingin mengiklankan survei ini, silakan buat pesanan baru dari dashboard.</p>
                <p style="margin:24px 0;">
                  <a href="${dashboardUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Buka Dashboard</a>
                </p>
            `;
        }

        const result = await sendMail(env, {
            to: row.email,
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
        console.error('notify-review-result error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
