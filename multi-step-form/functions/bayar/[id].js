/**
 * `/bayar/<ad_schedules.id>` — link perantara yang bisa dipanggil pulang.
 *
 * ── Kenapa ada ──────────────────────────────────────────────────────────────
 * Sampai sekarang yang keluar dari sistem (email, WhatsApp, salinan admin)
 * adalah URL DOKU MENTAH. Sekali terkirim ia tidak bisa ditarik: ia menagih
 * untuk keadaan saat ia dicetak, selamanya. Itulah yang terjadi pada order
 * af004b84 — admin membatalkan pesanan karena salah setup jadwal, menjadwalkan
 * tanggal baru, dan peneliti membayar lewat link invoice jadwal LAMA.
 *
 * Resolver ini menggantikannya. Yang beredar sekarang adalah URL milik kita,
 * dan pertanyaan "tagihan mana yang berwenang" dijawab SAAT DIKLIK, bukan saat
 * link dicetak. Link lama yang telanjur ada di inbox seseorang karena itu
 * berhenti jadi masalah permanen.
 *
 * ── Bentuk URL ──────────────────────────────────────────────────────────────
 * `https://submit.jakpatforuniv.com/bayar/<ad_schedules.id>` (UUID).
 *
 *  • UUID, BUKAN `booking_id`. `booking_id` cuma 8 karakter dari alfabet yang
 *    dipangkas (sql/51), jadi bisa ditebak berurutan. Link ini kapabilitas
 *    pembawa — setara URL DOKU yang hari ini dikirim mentah lewat email — jadi
 *    ambangnya tidak boleh turun.
 *  • `ad_schedules.id`, BUKAN `payment_id`. `payment_id` berubah setiap tagihan
 *    terbit ulang; memakainya membuat URL-nya ikut basi dan menghapus seluruh
 *    gunanya. UUID jadwal tetap sepanjang umur jadwal.
 *    ⚠️ Ia juga BUKAN `source_id`. Keduanya UUID dan bertetangga di kode yang
 *    sama (`invoices.extend_id` memakai `source_id`), tapi `schedule_billing()`
 *    menerima `ad_schedules.id`. Yang salah tidak error — ia cuma tidak
 *    menemukan tagihan apa pun.
 *
 * ── Kenapa di sini, bukan di /api/doku/ ─────────────────────────────────────
 * `/api/doku/*` admin-gated di `_middleware.js`. Halaman ini harus bisa dibuka
 * TANPA LOGIN: link email wajib bekerja saat sesi peneliti sudah mati, persis
 * seperti link DOKU yang digantikannya. Presedennya `functions/expand-shortlink.js`.
 *
 * ── SATU ATURAN, JANGAN DUA ─────────────────────────────────────────────────
 * "Tagihan mana yang hidup" TIDAK dihitung di berkas ini. Ia dijawab
 * `authoritative_payment_url()` (sql/85), yang dibangun di atas
 * `schedule_billing()` dan memakai predikat `live` yang sama dengan
 * `schedule_billing_summary()` (sql/83) — yang sendirinya dicerminkan
 * `isLiveInvoice()` di billingCompare.ts. Pages Function di-bundle
 * sendiri-sendiri sehingga impor lintas berkas gagal, jadi menuliskan
 * predikatnya di sini akan jadi definisi KETIGA. Resolver hanya menuruti.
 *
 * ── Yang tidak boleh bocor ──────────────────────────────────────────────────
 * Halaman ini terbuka tanpa login, jadi menebak UUID tidak boleh bisa memanen
 * data. 302 tidak membocorkan apa pun; halaman kalimatnya HANYA kalimat +
 * tombol dashboard — tanpa nominal, judul survei, nama, atau email.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DASHBOARD_PATH = '/dashboard';

/**
 * Kalimat per sebab, dua bahasa, TANPA bundel i18n.
 *
 * Halaman ini cuma beberapa baris dan hidup di luar SPA — menariknya ke
 * `translations.ts` berarti mem-bundle seluruh kamus ke dalam sebuah Pages
 * Function demi lima kalimat. Kalau daftar ini tumbuh melewati selusin,
 * keputusan itu layak ditinjau ulang.
 */
const COPY = {
  paid: {
    id: ['Tagihan ini sudah lunas.', 'Tidak ada yang perlu dibayar lagi untuk jadwal ini.'],
    en: ['This invoice is already paid.', 'Nothing further is due for this schedule.'],
  },
  cancelled: {
    id: ['Jadwal ini sudah dibatalkan.', 'Link pembayarannya ikut berhenti berlaku. Kalau ini di luar dugaan, hubungi tim kami.'],
    en: ['This schedule has been cancelled.', 'Its payment link is no longer valid. If this is unexpected, please contact our team.'],
  },
  stale: {
    id: ['Tanggal tayang jadwal ini sudah berpindah.', 'Tagihan lama tidak berlaku lagi. Tagihan untuk tanggal yang baru akan dikirimkan — jangan membayar lewat link lama.'],
    en: ['This schedule has moved to a different airing date.', 'The old invoice no longer applies. A new one will follow — please do not pay via the old link.'],
  },
  expired: {
    id: ['Batas waktu pembayaran jadwal ini sudah lewat.', 'Silakan buka dashboard untuk menjadwalkan ulang atau meminta tagihan baru.'],
    en: ['The payment deadline for this schedule has passed.', 'Please open your dashboard to reschedule or request a new invoice.'],
  },
  none: {
    id: ['Tagihan untuk jadwal ini belum terbit.', 'Kami akan mengirimkannya begitu siap. Statusnya bisa dilihat di dashboard.'],
    en: ['No invoice has been issued for this schedule yet.', 'We will send it once it is ready. You can follow the status on your dashboard.'],
  },
  no_url: {
    id: ['Tagihan ini tidak menyimpan link pembayaran.', 'Hubungi tim kami dan sebutkan halaman ini — kami akan menerbitkan link baru.'],
    en: ['This invoice has no payment link on file.', 'Please contact our team and mention this page — we will issue a new link.'],
  },
  not_found: {
    id: ['Tautan pembayaran ini tidak dikenali.', 'Mungkin tautannya terpotong saat disalin. Buka dashboard untuk menemukan tagihan Anda.'],
    en: ['This payment link is not recognised.', 'It may have been truncated when copied. Open your dashboard to find your invoice.'],
  },
  error: {
    id: ['Kami sedang tidak bisa memeriksa tagihan ini.', 'Coba lagi beberapa saat lagi, atau buka dashboard Anda.'],
    en: ['We cannot check this invoice right now.', 'Please try again shortly, or open your dashboard.'],
  },
};

function page(reason, status = 200) {
  const c = COPY[reason] || COPY.error;
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Jakpat for Universities</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#f8fafc; color:#0f172a;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; padding:24px; }
  .card { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:28px;
          max-width:26rem; width:100%; box-shadow:0 1px 3px rgba(15,23,42,.06); }
  h1 { font-size:1rem; margin:0 0 10px; font-weight:700; line-height:1.45; }
  p  { font-size:.8125rem; line-height:1.6; color:#475569; margin:0 0 8px; }
  .en { color:#94a3b8; font-size:.75rem; border-top:1px solid #f1f5f9; margin-top:14px; padding-top:12px; }
  a.btn { display:inline-block; margin-top:16px; background:#1976D2; color:#fff; text-decoration:none;
          font-size:.8125rem; font-weight:600; padding:9px 18px; border-radius:8px; }
</style>
</head>
<body>
  <div class="card">
    <h1>${c.id[0]}</h1>
    <p>${c.id[1]}</p>
    <div class="en"><strong>${c.en[0]}</strong><br>${c.en[1]}</div>
    <a class="btn" href="${DASHBOARD_PATH}">Buka Dashboard</a>
  </div>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Jawabannya berubah seiring keadaan tagihan — tidak boleh ada satu pun
      // lapisan yang menyimpannya. Itu akan mengembalikan persis masalah yang
      // resolver ini tutup: jawaban lama yang bertahan sesudah keadaannya
      // berubah.
      'Cache-Control': 'no-store, must-revalidate',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Cache-Control': 'no-store, must-revalidate',
      // ⚠️ Tanpa ini, URL `/bayar/<uuid>` ikut terkirim ke DOKU sebagai
      // Referer — dan UUID jadwal bocor ke pihak ketiga di setiap pembayaran.
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export async function onRequest(context) {
  const { params, env } = context;
  const id = String(params?.id || '').trim();

  if (!UUID_RE.test(id)) return page('not_found', 404);

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[bayar] Supabase env tidak lengkap; tidak bisa memutuskan.');
    return page('error', 500);
  }

  let row;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/authoritative_payment_url`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_schedule_id: id }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const rows = await res.json();
    row = Array.isArray(rows) ? rows[0] : rows;
  } catch (e) {
    /*
      ⚠️ KEGAGALANNYA TIDAK BOLEH SUNYI. Resolver ini menambah satu lompatan di
      depan DOKU: kalau ia mati, pembayaran berhenti — dan tidak ada satu pun
      lapisan lain yang akan melaporkannya. `console.error` di sini adalah
      satu-satunya jejaknya sampai ada sink yang khusus untuknya.
    */
    console.error(`[bayar] RPC authoritative_payment_url gagal untuk ${id}:`, e);
    return page('error', 502);
  }

  if (!row) return page('error', 502);

  const reason = String(row.reason || 'error');

  if (reason !== 'live') return page(reason, reason === 'not_found' ? 404 : 200);

  /*
    ⚠️ ANGGOTA GRUP YANG BUKAN LEAD TIDAK BOLEH DILEMPAR KE DOKU.

    Link DOKU tagihan gabungan menagih TOTAL SELURUH GRUP. Melempar follower ke
    sana menyodorkan tagihan N pesanan kepada orang yang mengira sedang membayar
    satu. Aturannya bukan aturan baru: `SchedulePhase` sudah memakainya untuk
    memutuskan siapa yang memegang tombol bayar, dan urutan lead-nya dihitung
    dengan rumus yang sama di `authoritative_payment_url()`.

    Tujuannya `/invoices/<payment_id>` — dokumen grupnya memuat seluruh bundel
    beserta link bayarnya, jadi angkanya bisa dijelaskan sebelum dibayar.
    Halaman itu di balik `PrivateRoute`, dan itu memang benar di sini: yang
    perlu memahami tagihan grup adalah pemiliknya.
  */
  if (row.is_group && !row.is_lead) {
    if (!row.payment_id) return page('no_url');
    return redirect(`/invoices/${encodeURIComponent(row.payment_id)}`);
  }

  if (!row.payment_url) return page('no_url');

  return redirect(row.payment_url);
}
