import { sendMail } from '../_mail.js';
// Alert admin ketika notifikasi pembayaran DOKU tidak selesai diproses.
//
// Diawali `_` supaya Cloudflare Pages tidak merutekannya sebagai endpoint —
// sama seperti _helpers.js dan _middleware.js. Ini modul, bukan route.
//
// PENTING: jalur ini SENGAJA tidak menyentuh Supabase sama sekali. Kegagalan yang
// dilaporkannya sering kali adalah "Supabase tidak bisa ditulis", jadi pemberitahuan
// yang ikut bergantung pada Supabase akan ikut mati persis saat paling dibutuhkan.
// Resend adalah satu-satunya lapisan yang tetap hidup di skenario terburuk.
//
// Dipakai dari webhook.js lewat context.waitUntil() supaya tidak menambah latensi
// balasan ke DOKU.

const OUTCOME_LABELS = {
  write_failed: 'Gagal menulis ke database',
  amount_mismatch: 'Jumlah pembayaran tidak cocok',
  no_submission_found: 'Invoice tidak dikenali',
};

const OUTCOME_ADVICE = {
  write_failed: `
    <li>Buka dashboard DOKU → Notification Center → cari invoice ini → <strong>Kirim Ulang Notifikasi</strong>.
        Kalau database sudah pulih, sekali kirim ulang biasanya menyelesaikannya.</li>
    <li>Kalau kirim ulang tetap gagal, rekonsiliasi manual tiga tabel:
        <code>invoices</code>, <code>transactions</code>, <code>form_submissions</code>.</li>`,
  amount_mismatch: `
    <li>Jumlah yang dibayar di DOKU berbeda dari nilai invoice di database kita.
        <strong>Tidak ada yang ditulis</strong> — ini disengaja.</li>
    <li>Cocokkan angkanya manual sebelum menandai lunas apa pun. Selisih jumlah bisa berarti
        invoice diubah setelah link bayar dibuat, atau notifikasi ini bukan milik order tersebut.</li>`,
  no_submission_found: `
    <li>DOKU menerima pembayaran untuk invoice yang <strong>tidak ada</strong> di
        <code>transactions</code> maupun <code>invoices</code>. Kirim ulang notifikasi tidak akan menolong.</li>
    <li>Cari nomor invoice ini di dashboard DOKU untuk melihat siapa yang membayar, lalu telusuri
        order mana yang seharusnya dicocokkan.</li>`,
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {Record<string, string|undefined>} env  context.env
 * @param {{
 *   invoiceNumber?: string|null,
 *   outcome: string,
 *   errorMessage?: string|null,
 *   amount?: number|string|null,
 *   dokuStatus?: string|null,
 *   paymentChannel?: string|null,
 *   httpStatus?: number,
 *   attempt?: number,
 * }} details
 */
export async function sendWebhookAlert(env, details) {
  try {
    // ⚠️ TIDAK ADA LAGI GUARD KUNCI DI SINI. Sampai 2026-08-18 fungsi ini
    // memeriksa RESEND_API_KEY sendiri lalu `return` diam-diam saat kosong —
    // jadi alarm yang dibangun justru untuk kegagalan senyap ikut senyap.
    // Sekarang pemilihan provider dan kuncinya milik sendMail(), dan
    // kegagalannya SELALU tercatat di log sebelum ditelan.

    const recipients = (env.ADMIN_EMAILS || 'product@jakpat.net')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    if (recipients.length === 0) {
      console.error('[webhook-alert] ADMIN_EMAILS kosong — alert tidak terkirim');
      return;
    }

    const {
      invoiceNumber,
      outcome,
      errorMessage,
      amount,
      dokuStatus,
      paymentChannel,
      httpStatus,
      attempt,
    } = details;

    const label = OUTCOME_LABELS[outcome] || outcome;
    const invoiceText = invoiceNumber || '(tanpa nomor invoice)';
    const amountText =
      amount !== null && amount !== undefined && amount !== ''
        ? `Rp${Number(amount).toLocaleString('id-ID')}`
        : '—';

    const rows = [
      ['Nomor invoice', invoiceText],
      ['Masalah', label],
      ['Jumlah', amountText],
      ['Status dari DOKU', dokuStatus || '—'],
      ['Channel', paymentChannel || '—'],
      ['Kita balas ke DOKU', httpStatus ? `HTTP ${httpStatus}` : '—'],
      ['Percobaan ke', attempt ? String(attempt) : '—'],
      ['Waktu (WIB)', new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })],
    ]
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;">${escapeHtml(k)}</td>` +
          `<td style="padding:6px 0;font-weight:600;">${escapeHtml(v)}</td></tr>`
      )
      .join('');

    const errorBlock = errorMessage
      ? `<p style="margin:16px 0 8px;color:#666;">Pesan error:</p>
         <pre style="background:#f4f4f5;border-radius:6px;padding:12px;font-size:12px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(
           errorMessage
         )}</pre>`
      : '';

    const advice = OUTCOME_ADVICE[outcome] || '<li>Periksa detailnya di dashboard admin.</li>';

    const result = await sendMail(env, {
      to: recipients,
        subject: `⚠️ Webhook DOKU: ${label} — ${invoiceText}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height:1.6; color:#333; max-width:600px;">
            <p style="margin:0 0 16px;">
              Satu notifikasi pembayaran dari DOKU <strong>tidak selesai diproses</strong>.
              Pembayarannya kemungkinan sudah diterima DOKU, tapi status di dashboard admin
              belum tentu ikut berubah.
            </p>
            <table style="border-collapse:collapse;font-size:14px;">${rows}</table>
            ${errorBlock}
            <p style="margin:20px 0 8px;">Langkah pemulihan:</p>
            <ol style="margin:0;padding-left:20px;">${advice}
              <li>Setelah beres, buka <strong>Keuangan</strong> di dashboard admin dan klik
                  <strong>Tandai selesai</strong> pada baris ini supaya banner-nya hilang.</li>
            </ol>
            <p style="margin:20px 0 0;color:#888;font-size:12px;">
              Email otomatis dari webhook DOKU jakpatforuniv-submit.
              Riwayat lengkapnya ada di tabel <code>doku_webhook_events</code>.
            </p>
          </div>
        `,
    });

    if (!result.ok) {
      console.error(
        `[webhook-alert] provider ${result.provider} menolak (${result.status}):`,
        result.error
      );
      return;
    }

    console.log(`[webhook-alert] Alert "${outcome}" terkirim via ${result.provider} untuk ${invoiceText}`);
  } catch (err) {
    // Alert yang gagal tidak boleh menjatuhkan webhook. Baris audit di
    // doku_webhook_events tetap jadi catatan permanennya.
    console.error('[webhook-alert] Gagal mengirim alert:', err);
  }
}
