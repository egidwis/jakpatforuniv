#!/usr/bin/env node
/**
 * LANGKAH 0 — buktikan Cancel Order DOKU benar-benar mematikan link.
 * ==========================================================================
 *
 * Kenapa naskah ini ada: `invoices.doku_cancelled_at` masih NOL BARIS seumur
 * hidup sistem ini. Seluruh strategi pencabutan (Rencana A Langkah 3) bertumpu
 * pada API yang belum pernah sekali pun terbukti bekerja. Sebelum ini hijau,
 * kode Rencana A tidak dideploy.
 *
 * ⚠️ HTTP 200 TIDAK MEMBUKTIKAN APA PUN. Yang membuktikan cuma satu hal:
 * MEMBUKA LINK-NYA DI BROWSER dan melihat DOKU menolaknya. Karena itu naskah
 * ini sengaja dipisah jadi dua perintah, dengan Anda di tengahnya.
 *
 * ── Cara pakai ────────────────────────────────────────────────────────────
 *
 *   1. Ambil kredensial SANDBOX dari dashboard sandbox DOKU
 *      (akun terpisah dari produksi — Client-Id & Secret-Key-nya BEDA).
 *
 *   2. export DOKU_CLIENT_ID='BRN-xxxx-sandbox'
 *      export DOKU_SECRET_KEY='SK-xxxx-sandbox'
 *      export DOKU_PROBE_CONFIRM_SANDBOX=1
 *
 *   3. node scripts/doku-cancel-order-probe.mjs create
 *      → cetak payment_url. BUKA DI BROWSER. Pastikan halamannya HIDUP.
 *
 *   4. node scripts/doku-cancel-order-probe.mjs cancel
 *      → panggil Cancel Order, cetak jawaban mentah DOKU.
 *
 *   5. BUKA LAGI URL YANG SAMA DI BROWSER. Inilah ujiannya:
 *        halaman menolak  → Langkah 0 HIJAU, Rencana A boleh dideploy
 *        halaman hidup    → Langkah 0 MERAH, dan itu temuan besar:
 *                           Langkah 3 tidak punya dasar, sementara Langkah 4–8
 *                           (link perantara) jadi SATU-SATUNYA pertahanan
 *
 *   6. node scripts/doku-cancel-order-probe.mjs cancel   ← ulangi sekali lagi
 *      → menguji penolakan "sudah dibatalkan/kedaluwarsa". Harus anggun
 *        (pesan jelas), bukan crash.
 *
 * ⚠️ JANGAN PERNAH DIJALANKAN DENGAN KREDENSIAL PRODUKSI. Ia akan mematikan
 * link pembayaran peneliti sungguhan. Penjaga di bawah menolak melakukannya,
 * tapi penjaga itu bukan pengganti kehati-hatian.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const crypto = globalThis.crypto ?? webcrypto;
const STATE_FILE = '.doku-probe-state.json';
const BASE = 'https://api-sandbox.doku.com';

const CLIENT_ID = process.env.DOKU_CLIENT_ID;
const SECRET_KEY = process.env.DOKU_SECRET_KEY;

// ── Penjaga ───────────────────────────────────────────────────────────────
function guard() {
  if (!CLIENT_ID || !SECRET_KEY) {
    die('DOKU_CLIENT_ID dan DOKU_SECRET_KEY wajib diisi (kredensial SANDBOX).');
  }
  if (process.env.DOKU_PROBE_CONFIRM_SANDBOX !== '1') {
    die(
      'Set DOKU_PROBE_CONFIRM_SANDBOX=1 untuk menegaskan ini kredensial SANDBOX.\n' +
      'Naskah ini mematikan link pembayaran — dengan kredensial produksi ia\n' +
      'akan mematikan link peneliti sungguhan.'
    );
  }
  if ((process.env.DOKU_ENV || process.env.VITE_DOKU_ENV) === 'production') {
    die('DOKU_ENV=production terdeteksi. Naskah ini menolak jalan.');
  }
  console.log(`[probe] endpoint : ${BASE}`);
  console.log(`[probe] client-id: ${CLIENT_ID.slice(0, 8)}…`);
}

const die = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

// ── Penandatanganan — LANGKAHNYA HARUS IDENTIK dengan cancel-order.js ─────
// digest → component string → HMAC. Kalau salah satu berkas berubah, ubah
// semuanya: checkout.js, create-payment.js, cancel-order.js, dan naskah ini.
async function signedHeaders(requestTarget, bodyString) {
  const enc = new TextEncoder();
  const requestId = crypto.randomUUID();
  const requestTimestamp = new Date().toISOString().slice(0, 19) + 'Z';

  const digestBuffer = await crypto.subtle.digest('SHA-256', enc.encode(bodyString));
  const digest = Buffer.from(new Uint8Array(digestBuffer)).toString('base64');

  const componentStringToSign =
    `Client-Id:${CLIENT_ID}\nRequest-Id:${requestId}\nRequest-Timestamp:${requestTimestamp}` +
    `\nRequest-Target:${requestTarget}\nDigest:${digest}`;

  const key = await crypto.subtle.importKey(
    'raw', enc.encode(SECRET_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(componentStringToSign));
  const signature = 'HMACSHA256=' + Buffer.from(new Uint8Array(sigBuffer)).toString('base64');

  return {
    headers: {
      'Content-Type': 'application/json',
      'Client-Id': CLIENT_ID,
      'Request-Id': requestId,
      'Request-Timestamp': requestTimestamp,
      Signature: signature,
    },
    requestId,
  };
}

async function call(requestTarget, payload) {
  const bodyString = JSON.stringify(payload);
  const { headers, requestId } = await signedHeaders(requestTarget, bodyString);
  const res = await fetch(BASE + requestTarget, { method: 'POST', headers, body: bodyString });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, json, requestId };
}

// ── create ────────────────────────────────────────────────────────────────
async function create() {
  const invoiceNumber = `PROBE-${Date.now()}`;
  /*
    `payment_due_date` sengaja 60 menit — sama dengan MIN_INVOICE_MINUTES dan
    dengan default create-payment.js. Cukup lama untuk diuji dengan tenang,
    cukup pendek untuk mati sendiri kalau naskah ini ditinggal.
  */
  const out = await call('/checkout/v1/payment', {
    order: {
      amount: 10000,
      invoice_number: invoiceNumber,
      currency: 'IDR',
      callback_url: 'https://submit.jakpatforuniv.com/payment-success?probe=1',
      auto_redirect: true,
    },
    payment: { payment_due_date: 60 },
    customer: { id: 'probe', name: 'Probe Langkah 0', email: 'probe@example.com' },
  });

  if (!out.ok) die(`Gagal menerbitkan tagihan sandbox (HTTP ${out.status}):\n${JSON.stringify(out.json, null, 2)}`);

  const url = out.json?.response?.payment?.url;
  if (!url) die(`DOKU membalas 200 tapi tanpa payment.url:\n${JSON.stringify(out.json, null, 2)}`);

  writeFileSync(STATE_FILE, JSON.stringify(
    { invoiceNumber, requestId: out.requestId, url, createdAt: new Date().toISOString() }, null, 2));

  console.log(`
✔ Tagihan sandbox terbit.

  invoice_number      : ${invoiceNumber}
  original_request_id : ${out.requestId}
  payment_url         : ${url}

  (disimpan di ${STATE_FILE})

──────────────────────────────────────────────────────────────────────────
  SEKARANG: buka payment_url di browser dan PASTIKAN HALAMANNYA HIDUP.
  Itu kondisi awal — tanpa memastikannya, "menolak" sesudah cancel tidak
  membuktikan apa-apa.

  Lalu jalankan:  node scripts/doku-cancel-order-probe.mjs cancel
──────────────────────────────────────────────────────────────────────────
`);
}

// ── cancel ────────────────────────────────────────────────────────────────
async function cancel() {
  if (!existsSync(STATE_FILE)) die(`${STATE_FILE} tidak ada — jalankan "create" lebih dulu.`);
  const st = JSON.parse(readFileSync(STATE_FILE, 'utf8'));

  const out = await call('/checkout/v3/cancellations', {
    order: { invoice_number: st.invoiceNumber },
    payment: { original_request_id: st.requestId },
    note: 'Uji Langkah 0 — pembuktian Cancel Order',
  });

  console.log(`
  HTTP ${out.status}
${JSON.stringify(out.json, null, 2)}
`);

  if (out.ok) {
    console.log(`──────────────────────────────────────────────────────────────────────────
  ⚠️ HTTP 200 BELUM BERARTI APA-APA.

  BUKA LAGI DI BROWSER:  ${st.url}

    halaman MENOLAK  → Langkah 0 HIJAU. Rencana A boleh dideploy.
    halaman HIDUP    → Langkah 0 MERAH. Catat ini: Langkah 3 tak berdasar,
                       dan link perantara (Langkah 4–8) jadi satu-satunya
                       pertahanan yang kita punya.

  Lalu jalankan "cancel" SEKALI LAGI untuk melihat penolakan
  "sudah dibatalkan" — harus anggun, bukan crash.
──────────────────────────────────────────────────────────────────────────`);
  } else {
    console.log(`──────────────────────────────────────────────────────────────────────────
  DOKU MENOLAK. Itu belum tentu kegagalan — tiga penolakan berikut WAJAR
  dan sudah diantisipasi cancel-order.js:
      • tagihannya sudah dibayar
      • tagihannya sudah kedaluwarsa
      • kanal kartu (tidak didukung DOKU)

  Salin badan jawaban di atas apa adanya ke catatan Langkah 0: kode dan
  kalimat persisnya yang menentukan apakah cancel-order.js sudah
  menerjemahkannya dengan benar ke admin.
──────────────────────────────────────────────────────────────────────────`);
  }
}

const cmd = process.argv[2];
guard();
if (cmd === 'create') await create();
else if (cmd === 'cancel') await cancel();
else die('Perintah: create | cancel');
