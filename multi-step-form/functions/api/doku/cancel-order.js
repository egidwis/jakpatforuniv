/**
 * Matikan link pembayaran DOKU — `POST /checkout/v3/cancellations`.
 *
 * Sampai sekarang "batalkan tagihan" hanya berarti mengubah satu kolom di
 * database kita. Link DOKU-nya tetap hidup dan tetap bisa dibayar dari sisi
 * bank — itulah yang terjadi pada order af004b84: jadwalnya dibatalkan 20 menit
 * sesudah tagihan terbit, dan peneliti membayarnya keesokan malamnya.
 *
 * ⚠️ GERBANG ADMINNYA DATANG DARI `functions/api/doku/_middleware.js`, bukan
 * dari berkas ini. Jangan menambahkan pemeriksaan sesi sendiri di sini — dua
 * gerbang berarti dua tempat untuk menyimpang, dan yang satu akan lebih longgar.
 *
 * ⚠️ PENANDATANGANANNYA DISALIN DARI `checkout.js`, BUKAN DITULIS ULANG.
 * Tiap Pages Function di-bundle sendiri-sendiri, jadi tidak ada modul bersama
 * untuk diimpor; yang bisa dilakukan hanya menjaga langkahnya identik —
 * digest → component string → HMAC — dan menyebutnya di sini supaya perubahan
 * di satu tempat terlihat perlu diikuti di tempat lain.
 */

const REQUEST_TARGET = '/checkout/v3/cancellations';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405);
  }

  try {
    const { invoice_number: invoiceNumber, original_request_id: originalRequestId, note } =
      await context.request.json();

    if (!invoiceNumber) {
      return json({ error: 'invoice_number wajib diisi' }, 400);
    }

    /*
      ⚠️ TANPA `original_request_id`, JANGAN PANGGIL API-NYA SAMA SEKALI.

      Semua tagihan yang terbit sebelum sql/84 tidak menyimpannya, dan nilainya
      tidak bisa dipulihkan dari mana pun. Menembak API tanpa nilai itu hanya
      menghasilkan 400 dari DOKU yang terbaca seperti kerusakan — padahal ini
      keadaan yang sudah diketahui dan punya jawabannya sendiri: link itu akan
      mati saat `payment_due_date`-nya lewat, dan sampai itu penjaga webhook
      `paid_on_dead_bill` (sql/80) yang menanggungnya.

      200, bukan error: dari sisi pemanggil ini BUKAN kegagalan — pembatalan di
      database kita tetap harus berjalan.
    */
    if (!originalRequestId) {
      return json({
        cancelled: false,
        reason: 'no_request_id',
        message: 'Tagihan ini terbit sebelum request_id disimpan (sql/84), jadi link DOKU-nya tidak bisa dimatikan lewat API. Ia berhenti berlaku sendiri saat masa bayarnya habis.',
      });
    }

    const clientId = context.env.DOKU_CLIENT_ID || context.env.VITE_DOKU_CLIENT_ID;
    const secretKey = context.env.DOKU_SECRET_KEY;
    if (!clientId || !secretKey) {
      return json({ error: 'DOKU credentials missing in environment' }, 500);
    }

    const bodyString = JSON.stringify({
      order: { invoice_number: invoiceNumber },
      payment: { original_request_id: originalRequestId },
      note: (note || 'Dibatalkan oleh admin Jakpat for Universities').substring(0, 255),
    });

    const requestId = crypto.randomUUID();
    const requestTimestamp = new Date().toISOString().slice(0, 19) + 'Z';

    const enc = new TextEncoder();
    const digestBuffer = await crypto.subtle.digest('SHA-256', enc.encode(bodyString));
    const digest = btoa(String.fromCharCode(...new Uint8Array(digestBuffer)));

    const componentStringToSign = `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${requestTimestamp}\nRequest-Target:${REQUEST_TARGET}\nDigest:${digest}`;

    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(componentStringToSign));
    const signature = 'HMACSHA256=' + btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    // Sandbox by default — sama seperti checkout.js. Membuktikan pembatalan di
    // produksi berarti mematikan link peneliti sungguhan.
    const base = (context.env.DOKU_ENV === 'production' || context.env.VITE_DOKU_ENV === 'production')
      ? 'https://api.doku.com'
      : 'https://api-sandbox.doku.com';

    const dokuResponse = await fetch(base + REQUEST_TARGET, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Id': clientId,
        'Request-Id': requestId,
        'Request-Timestamp': requestTimestamp,
        'Signature': signature,
      },
      body: bodyString,
    });

    const resultText = await dokuResponse.text();

    if (!dokuResponse.ok) {
      /*
        ⚠️ PENOLAKAN DOKU BUKAN KEGAGALAN KITA, DAN TIDAK BOLEH MENAHAN
        PEMBATALAN DI DATABASE.

        Tiga penolakan yang WAJAR dan harus ditangani anggun, bukan crash:
        tagihan yang sudah dibayar, yang sudah kedaluwarsa, dan kanal kartu
        (tidak didukung DOKU). Ketiganya berarti hal yang sama bagi pemanggil:
        "link-nya tidak bisa dimatikan, katakan apa adanya ke admin".

        Membiarkan tagihan tetap hidup di sistem KITA gara-gara HTTP gagal jauh
        lebih buruk — kontrak yang sama dengan `notifyScheduleChange`.
      */
      console.error(`[cancel-order] DOKU menolak untuk ${invoiceNumber} (HTTP ${dokuResponse.status}): ${resultText}`);
      return json({
        cancelled: false,
        reason: 'doku_rejected',
        httpStatus: dokuResponse.status,
        message: 'DOKU tidak bisa menonaktifkan link ini. Link lamanya mungkin masih bisa dibayar.',
        details: resultText,
      });
    }

    console.log(`[cancel-order] ${invoiceNumber} dinonaktifkan di DOKU.`);
    return json({ cancelled: true, cancelledAt: new Date().toISOString(), details: resultText });
  } catch (error) {
    console.error('[cancel-order] gagal:', error);
    // Tetap 200 dengan cancelled:false — lihat alasannya di blok !ok di atas.
    return json({
      cancelled: false,
      reason: 'exception',
      message: error?.message || 'Gagal memanggil Cancel Order DOKU.',
    });
  }
}
