/**
 * Satu pintu keluar untuk seluruh email transaksional.
 *
 * KENAPA BERKAS INI ADA
 * ---------------------
 * Sampai 2026-08-18 panggilan `fetch('https://api.resend.com/emails')` disalin
 * di EMPAT berkas dengan `from` dan bentuk payload yang identik. Akibatnya dua
 * hal yang sama-sama mahal:
 *
 *   1. Satu akun Resend di-suspend = empat jalur mati sekaligus, dan tidak ada
 *      satu tempat pun untuk memindahkannya.
 *   2. Tiga dari empat penyalin lupa memberi fallback, jadi kegagalannya
 *      berbeda-beda: satu memakai kunci hardcoded, satu balas 500, satu
 *      `return` diam-diam. Alarm webhook DOKU termasuk yang diam.
 *
 * Sekarang provider dipilih lewat env, jadi berpindah — atau kembali ke Resend
 * saat akunnya pulih — adalah perubahan variabel, bukan perubahan kode.
 *
 * KONTRAK
 * -------
 * `sendMail()` TIDAK PERNAH melempar. Ia mengembalikan hasil bernorma, karena
 * keempat pemanggil menangani kegagalan dengan cara yang sah-sah saja berbeda:
 * endpoint HTTP menerjemahkannya jadi status, sementara alarm webhook harus
 * menelannya (kegagalan mengirim alarm tidak boleh membuat pembayaran yang
 * sudah tercatat lunas ikut dianggap gagal lalu di-retry DOKU).
 *
 *   { ok: true,  provider, id }
 *   { ok: false, provider, status, error }
 *
 * ENV
 * ---
 *   MAIL_PROVIDER           'resend' | 'brevo' | 'cloudflare'
 *                           Boleh dikosongkan KALAU hanya satu provider yang
 *                           punya kredensial — lihat resolveProvider().
 *   MAIL_PROVIDER_FALLBACK  sama, opsional — dicoba HANYA kalau yang utama gagal
 *   MAIL_FROM               'Nama <alamat@domain>'  (default: alamat lama)
 *
 *   resend      -> RESEND_API_KEY
 *   brevo       -> BREVO_API_KEY
 *   cloudflare  -> CF_EMAIL_API_TOKEN + CF_ACCOUNT_ID
 *
 * ⚠️ `MAIL_FROM` ada supaya alamat pengirim bisa ikut berpindah tanpa menyentuh
 * kode. Cloudflare Email Sending mewajibkan SUBDOMAIN terverifikasi
 * (mis. noreply@mail.jakpatforuniv.com); Resend dan Brevo menerima apex. Kalau
 * provider diganti tanpa menyesuaikan variabel ini, kirimannya ditolak provider.
 */

const DEFAULT_FROM = 'Jakpat for Universities <noreply@jakpatforuniv.com>';

/** Pecah 'Nama <alamat@domain>' jadi { name, address }. Tanpa '<>' dianggap alamat polos. */
function parseFrom(raw) {
  const value = (raw || DEFAULT_FROM).trim();
  const m = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, '') || undefined, address: m[2].trim() };
  return { name: undefined, address: value };
}

const toList = (to) => (Array.isArray(to) ? to : [to]).filter(Boolean);

async function readBody(response) {
  try { return await response.json(); }
  catch { return { raw: await response.text().catch(() => '') }; }
}

// ── Provider: Resend ─────────────────────────────────────────────────────────
async function sendViaResend(env, msg, from) {
  const key = env.RESEND_API_KEY;
  if (!key) return { ok: false, provider: 'resend', status: 0, error: 'RESEND_API_KEY tidak diset' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: from.name ? `${from.name} <${from.address}>` : from.address,
      to: toList(msg.to),
      subject: msg.subject,
      html: msg.html,
      ...(msg.text ? { text: msg.text } : {}),
      ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
    }),
  });

  const body = await readBody(res);
  if (!res.ok) return { ok: false, provider: 'resend', status: res.status, error: body };
  return { ok: true, provider: 'resend', id: body?.id || null };
}

// ── Provider: Brevo ──────────────────────────────────────────────────────────
async function sendViaBrevo(env, msg, from) {
  const key = env.BREVO_API_KEY;
  if (!key) return { ok: false, provider: 'brevo', status: 0, error: 'BREVO_API_KEY tidak diset' };

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json', 'api-key': key },
    body: JSON.stringify({
      sender: { email: from.address, ...(from.name ? { name: from.name } : {}) },
      to: toList(msg.to).map((email) => ({ email })),
      subject: msg.subject,
      htmlContent: msg.html,
      ...(msg.text ? { textContent: msg.text } : {}),
      ...(msg.replyTo ? { replyTo: { email: msg.replyTo } } : {}),
    }),
  });

  const body = await readBody(res);
  if (!res.ok) return { ok: false, provider: 'brevo', status: res.status, error: body };
  return { ok: true, provider: 'brevo', id: body?.messageId || null };
}

// ── Provider: Cloudflare Email Sending ───────────────────────────────────────
// ⚠️ REST, bukan binding `send_email`. Binding itu milik Workers; berkas ini
// hidup di Pages Functions, jadi jalurnya token + fetch.
// ⚠️ Bentuk fieldnya BEDA dari Workers binding: `from.address` (bukan `.email`)
// dan `reply_to` (bukan `replyTo`) — salah satu dari keduanya menghasilkan 400
// yang pesannya tidak jelas.
async function sendViaCloudflare(env, msg, from) {
  const token = env.CF_EMAIL_API_TOKEN;
  const account = env.CF_ACCOUNT_ID;
  if (!token || !account) {
    return {
      ok: false, provider: 'cloudflare', status: 0,
      error: 'CF_EMAIL_API_TOKEN / CF_ACCOUNT_ID tidak diset',
    };
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/email/sending/send`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        from: { address: from.address, ...(from.name ? { name: from.name } : {}) },
        to: toList(msg.to).map((address) => ({ address })),
        subject: msg.subject,
        html: msg.html,
        ...(msg.text ? { text: msg.text } : {}),
        ...(msg.replyTo ? { reply_to: { address: msg.replyTo } } : {}),
      }),
    }
  );

  const body = await readBody(res);
  if (!res.ok || body?.success === false) {
    return { ok: false, provider: 'cloudflare', status: res.status, error: body?.errors || body };
  }
  return { ok: true, provider: 'cloudflare', id: body?.result?.queued?.[0] || null };
}

const PROVIDERS = {
  resend: sendViaResend,
  brevo: sendViaBrevo,
  cloudflare: sendViaCloudflare,
};

/**
 * Kirim satu email.
 *
 * @param {Record<string, string|undefined>} env  context.env dari Pages Function
 * @param {{ to: string|string[], subject: string, html: string,
 *           text?: string, replyTo?: string }} msg
 * @returns {Promise<{ ok: boolean, provider: string, id?: string|null,
 *                     status?: number, error?: unknown }>}
 */
/** Provider mana yang punya kredensial lengkap di env ini. */
function credentialledProviders(env) {
  const has = [];
  if (env.RESEND_API_KEY) has.push('resend');
  if (env.BREVO_API_KEY) has.push('brevo');
  if (env.CF_EMAIL_API_TOKEN && env.CF_ACCOUNT_ID) has.push('cloudflare');
  return has;
}

/**
 * Tentukan provider utama.
 *
 * `MAIL_PROVIDER` selalu menang kalau diisi — konfigurasi eksplisit tidak boleh
 * ditebak-tebak. Yang ditangani di sini adalah kasus SETENGAH TERKONFIGURASI:
 * kunci provider sudah dipasang tapi sakelarnya lupa.
 *
 * ⚠️ Ini bukan kenyamanan, ini pencegahan insiden. Pemasangan Brevo 2026-08-18
 * berhenti tepat di sini: BREVO_API_KEY terpasang, MAIL_PROVIDER tidak, dan
 * default lama ('resend') membuat SELURUH email gagal dengan pesan yang menuduh
 * kunci yang memang sengaja sudah dicabut. Kegagalan yang menunjuk ke arah yang
 * salah persis penyakit yang berkas ini ada untuk menyembuhkan.
 *
 * Ditebak HANYA kalau tidak ambigu — tepat satu provider berkredensial. Kalau
 * ada dua atau lebih (mis. Resend pulih di sebelah Brevo), diamnya konfigurasi
 * jadi kesalahan yang harus dilaporkan, bukan koin yang dilempar.
 */
function resolveProvider(env) {
  const explicit = (env.MAIL_PROVIDER || '').toLowerCase().trim();
  if (explicit) return explicit;

  const available = credentialledProviders(env);
  if (available.length === 1) {
    console.warn(
      `[mail] MAIL_PROVIDER tidak diset — memakai '${available[0]}' karena hanya ` +
      `itu yang punya kredensial. Set MAIL_PROVIDER supaya tidak bergantung tebakan.`
    );
    return available[0];
  }
  if (available.length > 1) {
    console.error(
      `[mail] MAIL_PROVIDER tidak diset dan ADA ${available.length} provider ` +
      `berkredensial (${available.join(', ')}). Menolak menebak — set MAIL_PROVIDER.`
    );
  }
  return 'resend';
}

export async function sendMail(env, msg) {
  const from = parseFrom(env.MAIL_FROM);
  const primary = resolveProvider(env);
  const fallback = (env.MAIL_PROVIDER_FALLBACK || '').toLowerCase();

  const run = async (name) => {
    const fn = PROVIDERS[name];
    if (!fn) return { ok: false, provider: name, status: 0, error: `Provider '${name}' tidak dikenal` };
    try {
      return await fn(env, msg, from);
    } catch (e) {
      // Jaringan putus / DNS gagal. Dibungkus supaya fallback tetap kebagian
      // giliran alih-alih seluruh permintaan ikut runtuh.
      return { ok: false, provider: name, status: 0, error: e?.message || String(e) };
    }
  };

  const first = await run(primary);
  if (first.ok || !fallback || fallback === primary) return first;

  console.error(`[mail] provider '${primary}' gagal, mencoba '${fallback}':`, first.error);
  const second = await run(fallback);
  if (second.ok) return { ...second, recoveredFrom: primary };

  // Dua-duanya gagal: yang dilaporkan yang UTAMA, karena itu yang seharusnya
  // jalan. Kegagalan cadangan ikut dicatat supaya tidak hilang dari log.
  console.error(`[mail] provider cadangan '${fallback}' ikut gagal:`, second.error);
  return first;
}
