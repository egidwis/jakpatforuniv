import { sendMail } from './_mail.js';

/*
  ═══════════════════════════════════════════════════════════════════════════
  TIGA VARIAN EMAIL TAGIHAN SIAP DIBAYAR
  ═══════════════════════════════════════════════════════════════════════════

  `order`     — Jadwal PERTAMA. Kuesioner disetujui, admin telah membantu
                mereservasikan jadwal tayang di kalender, dan tagihan terbit
                dengan rincian pesanan & jadwal tayang yang sudah dipesan.
  `extension` — Jadwal KE-2 dst. Tidak ada review, tanggal sudah dipilih
                dan ditahan sampai pembayaran masuk.
  `bulk`      — Tagihan GABUNGAN (Bulk Invoice) untuk beberapa survei/jadwal
                sekaligus yang telah direservasikan oleh admin. Memuat tabel
                rincian survei dan jadwal yang digabung.

  Semua varian menyertakan catatan: "Jika kamu sudah melakukan pembayaran,
  silakan abaikan email ini."
*/

/** Tanggal tayang dalam WIB — email dibaca di zona peneliti, bukan zona server. */
const wibDate = (iso) => {
    try {
        return new Date(iso).toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
        });
    } catch {
        return null;
    }
};

export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const {
            name,
            email,
            title,
            invoiceUrl,
            amount,
            variant,
            airingStart,
            airingEnd,
            bookingId,
            items,
        } = await request.json();

        if (!email || !name || !invoiceUrl) {
            return new Response(JSON.stringify({ error: 'Missing name, email, or invoiceUrl' }), { status: 400 });
        }

        const isExtension = variant === 'extension';
        const isBulk = variant === 'bulk';
        const amountText = typeof amount === 'number'
            ? `Rp${amount.toLocaleString('id-ID')}`
            : null;
        const surveyLine = title ? ` untuk survei <strong>${title}</strong>` : '';
        const airingStartText = airingStart ? wibDate(airingStart) : null;
        const airingEndText = airingEnd ? wibDate(airingEnd) : null;
        const bookingText = bookingId ? `#${bookingId}` : null;

        let subject;
        let introHtml;
        let detailsHtml = '';

        if (isBulk) {
            subject = 'Tagihan gabungan jadwal iklanmu siap dibayar — Jakpat for Universities';
            introHtml = `
                <p>Halo Kak <strong>${name}</strong>,</p>
                <p>Tagihan gabungan untuk beberapa jadwal iklan survei yang telah direservasikan oleh tim kami sudah siap dibayar.</p>
                <p>Silakan selesaikan pembayaran untuk mengonfirmasi seluruh jadwal penayangan iklan surveimu.</p>
            `;

            const itemList = Array.isArray(items) ? items : [];
            const rows = itemList.map((it) => {
                const startStr = it.startDate ? wibDate(it.startDate) : '—';
                const endStr = it.endDate ? ` s.d. ${wibDate(it.endDate)}` : '';
                const bId = it.bookingId ? `#${it.bookingId}` : '—';
                const itAmount = typeof it.amount === 'number' ? `Rp${it.amount.toLocaleString('id-ID')}` : '';
                return `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 10px 8px 10px 0; font-weight: 600; color: #1e293b;">${it.title || 'Survei'}</td>
                        <td style="padding: 10px 8px; color: #334155;">${startStr}${endStr}</td>
                        <td style="padding: 10px 8px; color: #64748b; font-family: monospace;">${bId}</td>
                        ${itAmount ? `<td style="padding: 10px 0 10px 8px; text-align: right; font-weight: 600; color: #0f172a;">${itAmount}</td>` : ''}
                    </tr>
                `;
            }).join('');

            detailsHtml = `
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 20px 0;">
                    <h3 style="margin: 0 0 12px; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">
                        Daftar Jadwal yang Direservasi
                    </h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="border-bottom: 2px solid #cbd5e1; text-align: left; color: #64748b; font-size: 12px;">
                                <th style="padding: 6px 8px 6px 0;">Survei</th>
                                <th style="padding: 6px 8px;">Jadwal Tayang</th>
                                <th style="padding: 6px 8px;">Booking ID</th>
                                ${itemList.some((i) => typeof i.amount === 'number') ? '<th style="padding: 6px 0 6px 8px; text-align: right;">Subtotal</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                    <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; font-size: 14px;">
                        <span style="color: #64748b; font-weight: 600;">Total Tagihan Gabungan:</span>
                        <span style="color: #0284c7; font-weight: 800; font-size: 16px;">${amountText || '—'}</span>
                    </div>
                </div>
            `;
        } else if (isExtension) {
            subject = 'Tagihan jadwal iklan barumu siap dibayar — Jakpat for Universities';
            introHtml = `
                <p>Halo Kak <strong>${name}</strong>,</p>
                <p>Jadwal iklan tambahan${surveyLine}${airingStartText ? ` untuk tayang mulai <strong>${airingStartText}</strong>` : ''} sudah kami siapkan.</p>
                <p>Tagihannya siap dibayar${amountText ? ` senilai <strong>${amountText}</strong>` : ''}. Tanggal itu kami tahan untukmu sampai pembayarannya masuk — kalau lewat batas waktu, slotnya kembali terbuka untuk peneliti lain.</p>
            `;

            detailsHtml = `
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 20px 0;">
                    <h3 style="margin: 0 0 12px; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">
                        Rincian Jadwal Tambahan (Extension)
                    </h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        ${title ? `<tr><td style="padding: 6px 0; color: #64748b; width: 140px;">Survei:</td><td style="padding: 6px 0; font-weight: 600; color: #1e293b;">${title}</td></tr>` : ''}
                        ${airingStartText ? `<tr><td style="padding: 6px 0; color: #64748b;">Jadwal Mulai:</td><td style="padding: 6px 0; font-weight: 600; color: #1e293b;">${airingStartText}${airingEndText ? ` s.d. ${airingEndText}` : ''}</td></tr>` : ''}
                        ${bookingText ? `<tr><td style="padding: 6px 0; color: #64748b;">Booking ID:</td><td style="padding: 6px 0; font-weight: 600; color: #1e293b; font-family: monospace;">${bookingText}</td></tr>` : ''}
                        ${amountText ? `<tr><td style="padding: 6px 0; color: #64748b;">Total Tagihan:</td><td style="padding: 6px 0; font-weight: 700; color: #0284c7; font-size: 15px;">${amountText}</td></tr>` : ''}
                    </table>
                </div>
            `;
        } else {
            // Varian order (jadwal pertama / utama)
            subject = 'Pesananmu disetujui, tagihan siap dibayar — Jakpat for Universities';
            introHtml = `
                <p>Halo Kak <strong>${name}</strong>,</p>
                <p>Kabar baik! Pesananmu${surveyLine} sudah kami periksa dan <strong>disetujui</strong>.</p>
                <p>Tim kami telah membantu mereservasikan jadwal tayang iklan surveimu. Tagihan sudah siap untuk diselesaikan agar penayangan dapat berjalan sesuai jadwal yang telah ditentukan.</p>
            `;

            detailsHtml = `
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 20px 0;">
                    <h3 style="margin: 0 0 12px; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">
                        Rincian Pesanan & Jadwal Reservasi
                    </h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        ${title ? `<tr><td style="padding: 6px 0; color: #64748b; width: 140px;">Survei:</td><td style="padding: 6px 0; font-weight: 600; color: #1e293b;">${title}</td></tr>` : ''}
                        ${airingStartText ? `<tr><td style="padding: 6px 0; color: #64748b;">Jadwal Tayang:</td><td style="padding: 6px 0; font-weight: 600; color: #1e293b;">${airingStartText}${airingEndText ? ` s.d. ${airingEndText}` : ''}</td></tr>` : ''}
                        ${bookingText ? `<tr><td style="padding: 6px 0; color: #64748b;">Booking ID:</td><td style="padding: 6px 0; font-weight: 600; color: #1e293b; font-family: monospace;">${bookingText}</td></tr>` : ''}
                        ${amountText ? `<tr><td style="padding: 6px 0; color: #64748b;">Total Tagihan:</td><td style="padding: 6px 0; font-weight: 700; color: #0284c7; font-size: 15px;">${amountText}</td></tr>` : ''}
                    </table>
                </div>
            `;
        }

        const paymentDisclaimerHtml = `
            <div style="background: #f1f5f9; border-left: 4px solid #94a3b8; border-radius: 4px; padding: 10px 14px; margin: 20px 0; font-size: 12px; color: #475569; line-height: 1.5;">
              💡 <strong>Catatan:</strong> Jika Kakak sudah menyelesaikan pembayaran untuk tagihan ini, silakan abaikan email ini. Status pembayaran dan jadwal tayang Kakak akan terverifikasi secara otomatis oleh sistem.
            </div>
        `;

        const result = await sendMail(env, {
            to: email,
            subject,
            html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
            ${introHtml}
            ${detailsHtml}
            <p style="margin: 24px 0 16px;">
              <a href="${invoiceUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
                Bayar Sekarang &rarr;
              </a>
            </p>
            <p style="font-size: 12px; color: #64748b; margin: 0 0 16px;">Kalau tombolnya tidak muncul, salin tautan ini: <br><a href="${invoiceUrl}" style="color: #2563eb; word-break: break-all;">${invoiceUrl}</a></p>
            ${paymentDisclaimerHtml}
            <br>
            <p style="font-size: 13px; color: #475569;">Terima kasih atas kepercayaan Kakak kepada Jakpat for Universities.</p>
            <p style="font-size: 13px; color: #475569; margin-top: 4px;">Salam,<br><strong>Tim Jakpat for Universities</strong></p>
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
        console.error('send-invoice-ready-email error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
