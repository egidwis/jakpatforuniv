import { sendMail } from './_mail.js';

/*
  ═══════════════════════════════════════════════════════════════════════════
  DUA KABAR YANG BERBEDA, SATU ENDPOINT
  ═══════════════════════════════════════════════════════════════════════════

  `order`     — jadwal PERTAMA. Kabarnya "pesananmu lolos review, tagihan siap",
                dan sesudah bayar peneliti memilih tanggal tayang.
  `extension` — jadwal KE-2 dst. Tidak ada review, dan TANGGALNYA SUDAH DIPILIH.
                Memakai kalimat `order` di sini menyuruh orang memilih tanggal
                yang sudah dipegangnya, dan menyebut "disetujui" untuk sesuatu
                yang tidak pernah ditinjau.

  ⚠️ VARIAN `extension` LAHIR KARENA JALURNYA DULU BISU SAMA SEKALI.
  `InvoiceForm` menggerbang email ini dengan `!entry.isExtension`, jadi setiap
  tagihan perpanjangan satuan terbit tanpa satu pun pemberitahuan dari kami —
  satu-satunya yang sampai ke peneliti adalah email "Pesanan Baru" dari DOKU,
  yang membawa URL DOKU MENTAH (tidak bisa ditarik, menagih keadaan saat
  dicetak). Selama kebisuan itu ada, mematikan notifikasi DOKU berarti
  menerbitkan tagihan yang tidak diketahui siapa pun.

  `variant` OPSIONAL dan defaultnya `order`: pemanggil lama tidak berubah.
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
        const { name, email, title, invoiceUrl, amount, variant, airingStart } = await request.json();


        if (!email || !name || !invoiceUrl) {
            return new Response(JSON.stringify({ error: 'Missing name, email, or invoiceUrl' }), { status: 400 });
        }

        const isExtension = variant === 'extension';
        const amountText = typeof amount === 'number'
            ? `Rp${amount.toLocaleString('id-ID')}`
            : null;
        const surveyLine = title ? ` untuk survei <strong>${title}</strong>` : '';
        const airingText = airingStart ? wibDate(airingStart) : null;

        const subject = isExtension
            ? 'Tagihan jadwal iklan barumu siap dibayar — Jakpat for Universities'
            : 'Pesananmu disetujui, tagihan siap dibayar — Jakpat for Universities';

        /*
          ⚠️ Kalimat `extension` sengaja TIDAK menjanjikan "pilih jadwal setelah
          bayar" dan TIDAK menyebut "disetujui". Yang perlu diketahui peneliti
          justru sebaliknya: tanggalnya sudah dipegang, dan yang menahannya
          adalah pembayaran ini.
        */
        const intro = isExtension
            ? `<p>Jadwal iklan tambahan${surveyLine}${airingText ? ` untuk tayang mulai <strong>${airingText}</strong>` : ''} sudah kami siapkan.</p>
               <p>Tagihannya siap dibayar${amountText ? ` senilai <strong>${amountText}</strong>` : ''}. Tanggal itu kami tahan untukmu sampai pembayarannya masuk — kalau lewat batas waktu, slotnya kembali terbuka untuk peneliti lain.</p>`
            : `<p>Kabar baik! Pesananmu${surveyLine} sudah kami periksa dan disetujui.</p>
               <p>Tagihannya sudah siap${amountText ? ` senilai <strong>${amountText}</strong>` : ''}. Setelah dibayar, kamu akan diarahkan memilih jadwal tayang iklanmu.</p>`;

        const result = await sendMail(env, {
            to: email,
            subject,
            html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <p>Halo Kak <strong>${name}</strong>,</p>
            ${intro}
            <p style="margin: 24px 0;">
              <a href="${invoiceUrl}" style="background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                Bayar Sekarang
              </a>
            </p>
            <p>Kalau tombolnya tidak muncul, salin tautan ini: <br><a href="${invoiceUrl}">${invoiceUrl}</a></p>
            <br>
            <p>Terima kasih atas kepercayaan Kakak kepada Jakpat for Universities.</p>
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
        console.error('send-invoice-ready-email error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
