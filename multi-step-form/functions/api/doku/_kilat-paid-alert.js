import { sendMail } from '../_mail.js';

/**
 * Email ke admin saat gelombang JFU Kilat LUNAS (keputusan 26 Okt 2026,
 * sebelum Push B).
 *
 * Sejak pintu swalayan terbuka, order Kilat lahir dan dibayar tanpa admin.
 * Halamannya live OTOMATIS 60 menit sebelum gelombang (sql/130) dan tetap
 * live sampai admin mematikannya. Email ini memberi tahu gelombang mana yang
 * harus di-push dan kapan halamannya terbuka; tugas admin tinggal mengirim
 * push lalu mematikan siaran sesudah selesai.
 *
 * Diawali `_` supaya Cloudflare Pages tidak merutekannya. Dipanggil webhook
 * lewat context.waitUntil() — TIDAK PERNAH melempar: kegagalan mengirim email
 * tidak boleh membuat pembayaran yang sudah tercatat ikut gagal lalu di-retry.
 */

const ADMIN_DASHBOARD = 'https://submit.jakpatforuniv.com/internal-dash';

/**
 * Penerima TAMBAHAN selain admin. ⚠️ Jangan dimasukkan ke `ADMIN_EMAILS`:
 * env itu juga gerbang akses admin (`_middleware.js`, `functions/api/admin/*`),
 * jadi menambah penerima email di sana sekaligus memberi akses tulis admin.
 * Env `KILAT_ALERT_EMAILS` (comma-separated) menggantikan daftar ini.
 */
const KILAT_ALERT_EXTRA_RECIPIENTS = ['nandabrilianto@jakpat.net'];

/** Admin + penerima tambahan, tanpa duplikat (huruf besar/kecil diabaikan). */
export function kilatAlertRecipients(env) {
  const split = (v) => String(v).split(',').map((e) => e.trim()).filter(Boolean);
  const admins = split(env.ADMIN_EMAILS || 'product@jakpat.net');
  const extra = env.KILAT_ALERT_EMAILS != null ? split(env.KILAT_ALERT_EMAILS) : KILAT_ALERT_EXTRA_RECIPIENTS;
  const seen = new Set();
  return [...admins, ...extra].filter((e) => {
    const k = e.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const formatRupiah = (amount) => 'Rp ' + Number(amount || 0).toLocaleString('id-ID');
const waveLabel = (hour) => `Gelombang ${String(hour).padStart(2, '0')}.00 WIB`;
const shortId = (id) => `#${String(id || '').slice(0, 8)}`;
/** ⚠️ Cermin `kilat_lead()` sql/130: halaman live 60 menit sebelum gelombang. */
const liveHourLabel = (hour) => `${String((hour + 23) % 24).padStart(2, '0')}.00 WIB`;

/** Tanggal kalender WIB dari DATE ('2026-10-27') atau TIMESTAMPTZ. */
function wibYmd(value) {
  if (!value) return null;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

function formatYmd(ymd) {
  if (!ymd) return 'tanggal belum ada';
  return new Date(`${ymd}T12:00:00+07:00`).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta',
  });
}

/**
 * @param {{ invoiceNumber: string, amount: number|string,
 *   waves: { orderId: string, title: string, researcher: string, ymd: string|null, hour: number|null }[] }} p
 */
export function buildKilatPaidAlert({ invoiceNumber, amount, waves }) {
  const first = waves[0];
  const when = first.hour == null ? formatYmd(first.ymd) : `${waveLabel(first.hour)}, ${formatYmd(first.ymd)}`;
  const more = waves.length > 1 ? ` +${waves.length - 1} gelombang` : '';
  const subject = `Kilat lunas — ${when}${more} (${shortId(first.orderId)})`;

  const rows = waves.map((w) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9"><strong>${escapeHtml(w.hour == null ? 'Gelombang belum ditetapkan' : waveLabel(w.hour))}</strong><br>${escapeHtml(formatYmd(w.ymd))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9">${escapeHtml(w.title || 'Tanpa judul')}<br><span style="color:#64748b">${escapeHtml(shortId(w.orderId))} · ${escapeHtml(w.researcher || '-')}</span></td>
      </tr>`).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.5">
      <p><strong>Gelombang JFU Kilat sudah lunas</strong> — tagihan ${escapeHtml(invoiceNumber)} (${escapeHtml(formatRupiah(amount))}).</p>
      <table style="border-collapse:collapse;width:100%;max-width:560px">${rows}</table>
      <ol>
        ${first.hour == null ? '' : `<li>Halaman survei <strong>live otomatis ${escapeHtml(liveHourLabel(first.hour))}</strong> (60 menit sebelum gelombang) — tidak perlu dinyalakan.</li>`}
        <li>Kirim push notification Jakpat pada jam gelombangnya.</li>
        <li>Sesudah push selesai, <strong>Matikan siaran</strong> di Submissions → tab Kilat → order ${escapeHtml(shortId(first.orderId))} → Page. Siaran tetap live sampai dimatikan; salah matikan masih bisa dinyalakan lagi dalam 60 menit.</li>
      </ol>
      <p><a href="${ADMIN_DASHBOARD}">Buka dashboard admin</a></p>
    </div>`;

  return { subject, html };
}

/**
 * @param {Record<string, string|undefined>} env
 * @param {{ invoiceNumber: string, amount: number|string }} payload
 */
export async function sendKilatPaidAlert(env, { invoiceNumber, amount }) {
  try {
    const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!invoiceNumber || !url || !key) return { ok: false, error: 'invoice/kredensial kosong' };
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const encoded = encodeURIComponent(invoiceNumber);
    const select = 'select=form_submission_id,extend_id,form_submissions(id,title,email,distribution_type,kilat_slot_hour,start_date)';

    // Sama dengan kwitansi: transactions dulu, invoices sebagai cadangan.
    const txRes = await fetch(`${url}/rest/v1/transactions?payment_id=eq.${encoded}&${select}`, { headers });
    let rows = txRes.ok ? await txRes.json() : [];
    if (!Array.isArray(rows) || rows.length === 0) {
      const invRes = await fetch(`${url}/rest/v1/invoices?payment_id=eq.${encoded}&${select}`, { headers });
      rows = invRes.ok ? await invRes.json() : [];
    }
    if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'tagihan tidak ditemukan' };

    const sourceIds = rows.map((r) => r.extend_id || r.form_submission_id).filter(Boolean);
    const schedRes = await fetch(
      `${url}/rest/v1/ad_schedules?source_id=in.(${sourceIds.map((s) => `"${encodeURIComponent(s)}"`).join(',')})&select=source_id,distribution_type,kilat_slot_hour,start_date`,
      { headers },
    );
    const scheds = schedRes.ok ? await schedRes.json() : [];
    const bySource = new Map((Array.isArray(scheds) ? scheds : []).map((s) => [s.source_id, s]));

    const waves = rows
      .map((r) => {
        const sub = r.form_submissions || {};
        const sched = bySource.get(r.extend_id || r.form_submission_id);
        const dist = sched?.distribution_type || sub.distribution_type;
        if (dist !== 'kilat') return null;
        return {
          orderId: sub.id || r.form_submission_id,
          title: sub.title,
          researcher: sub.email,
          ymd: wibYmd(sched?.start_date || sub.start_date),
          hour: sched?.kilat_slot_hour ?? sub.kilat_slot_hour ?? null,
        };
      })
      .filter(Boolean);
    if (waves.length === 0) return { ok: true, skipped: true };

    const recipients = kilatAlertRecipients(env);
    const msg = buildKilatPaidAlert({ invoiceNumber, amount, waves });
    const result = await sendMail(env, { to: recipients, ...msg });
    if (!result.ok) console.error('[kilat-paid-alert] gagal mengirim', invoiceNumber, result.error);
    return result;
  } catch (err) {
    console.error('[kilat-paid-alert]', invoiceNumber, err);
    return { ok: false, error: String(err?.message || err) };
  }
}
