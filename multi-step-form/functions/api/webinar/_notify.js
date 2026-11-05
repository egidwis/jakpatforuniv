// Pengirim antrean email otomatis webinar (sql/135). Dipanggil:
// - cron tiap menit lewat /api/notify-webinar (webinar_notify_tick),
// - aksi admin simpan-jadwal / batalkan acara / kirim ulang yang gagal, lewat
//   waitUntil supaya batch pertama berangkat seketika.
//
// Satu panggilan = satu batch (default 20) supaya aman dari batas subrequest
// Workers Free (50): 1 claim + 20 email + 1 catat. Sisanya diambil tick berikutnya.
// Klaim memakai SKIP LOCKED + claim_token, jadi cron dan aksi admin yang berjalan
// bersamaan tidak pernah mengirim baris yang sama.

import { sendMail } from '../_mail.js';
import { buildWebinarNotifyEmail } from './_notify-email.js';

const CONCURRENCY = 4; // Workers: maks. 6 koneksi keluar bersamaan per permintaan

async function rpc(sb, fn, args) {
  const res = await fetch(`${sb.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...sb.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`RPC ${fn} gagal — HTTP ${res.status}: ${raw.slice(0, 300)}`);
  return raw ? JSON.parse(raw) : null;
}

function describeError(mail) {
  const detail = typeof mail?.error === 'string' ? mail.error : JSON.stringify(mail?.error ?? null);
  return `${mail?.provider ?? '?'} HTTP ${mail?.status ?? 0}: ${detail}`.slice(0, 500);
}

async function sendOne(env, row) {
  const base = { broadcast_id: row.broadcast_id, order_id: row.order_id };
  let message;
  try {
    message = buildWebinarNotifyEmail({ kind: row.kind, event: row.event, recipient: row });
  } catch (err) {
    // Data tidak bisa dirender: mengulang tidak akan menolong.
    return { ...base, ok: false, permanent: true, error: `Templat gagal: ${err?.message || err}`.slice(0, 500) };
  }
  const mail = await sendMail(env, { to: [row.email], subject: message.subject, html: message.html });
  if (mail?.ok) return { ...base, ok: true };
  const permanent = Array.isArray(mail?.error?.permanent_bounces) && mail.error.permanent_bounces.length > 0;
  return { ...base, ok: false, permanent, error: describeError(mail) };
}

/** @returns {Promise<{claimed: number, sent: number, failed: number}>} Melempar bila database gagal. */
export async function dispatchWebinarNotifications({ env, sb, limit = 20 }) {
  const claim = await rpc(sb, 'webinar_claim_deliveries', { p_limit: limit });
  const rows = Array.isArray(claim?.rows) ? claim.rows : [];
  if (rows.length === 0) return { claimed: 0, sent: 0, failed: 0 };

  const results = new Array(rows.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
    while (next < rows.length) {
      const i = next++;
      results[i] = await sendOne(env, rows[i]);
    }
  }));

  // Gagal mencatat = baris tetap `sending`, lalu basi 10 menit dan dicoba lagi.
  // Lebih baik dobel daripada peserta tidak dikabari; tetap dicatat di log.
  try {
    await rpc(sb, 'webinar_record_deliveries', { p_token: claim.token, p_results: results });
  } catch (err) {
    console.error('[webinar/notify] hasil kirim gagal dicatat:', err?.message || err);
  }

  const sent = results.filter((r) => r.ok).length;
  return { claimed: rows.length, sent, failed: rows.length - sent };
}
