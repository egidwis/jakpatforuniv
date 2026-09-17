/**
 * Matikan link pembayaran DOKU — `POST /checkout/v3/cancellations`.
 *
 * Sampai sekarang "batalkan tagihan" hanya berarti mengubah satu kolom di
 * database kita. Link DOKU-nya tetap hidup dan tetap bisa dibayar dari sisi
 * bank — itulah yang terjadi pada order af004b84: jadwalnya dibatalkan 20 menit
 * sesudah tagihan terbit, dan peneliti membayarnya keesokan malamnya.
 *
 * ⚠️ GERBANG SESINYA DATANG DARI `functions/api/doku/_middleware.js`, bukan
 * dari berkas ini. Jangan menambahkan pemeriksaan sesi sendiri di sini — dua
 * gerbang berarti dua tempat untuk menyimpang, dan yang satu akan lebih longgar.
 *
 * ⚠️ SEJAK 2026-09-17 ENDPOINT INI TIDAK LAGI ADMIN-ONLY. Ia terdaftar di
 * `OWNER_ENDPOINTS`, jadi PEMILIK TAGIHAN boleh memanggilnya — itu yang membuat
 * pembatalan jadwal oleh peneliti (Phase 4) benar-benar mematikan link DOKU-nya.
 *
 * Konsekuensinya: middleware hanya menjamin "pemanggilnya siapa", TIDAK menjamin
 * "dia berhak atas tagihan ini". `invoice_number` datang dari BROWSER, jadi
 * tanpa penjaga di bawah, peneliti mana pun bisa mematikan link bayar milik
 * peneliti lain hanya dengan menebak nomor tagihan. Penjaga itu ada di
 * `assertCallerMayCancel()` dan ia WAJIB berjalan sebelum satu byte pun
 * dikirim ke DOKU.
 *
 * ⚠️ PENANDATANGANANNYA DISALIN DARI `checkout.js`, BUKAN DITULIS ULANG.
 * Tiap Pages Function di-bundle sendiri-sendiri, jadi tidak ada modul bersama
 * untuk diimpor; yang bisa dilakukan hanya menjaga langkahnya identik —
 * digest → component string → HMAC — dan menyebutnya di sini supaya perubahan
 * di satu tempat terlihat perlu diikuti di tempat lain.
 */

const REQUEST_TARGET = '/checkout/v3/cancellations';

/**
 * Terjemahkan penolakan DOKU jadi SEBAB — bukan pengulangan akibatnya.
 *
 * ⚠️ KALIMAT LAMANYA TAUTOLOGI. Ia berbunyi "DOKU tidak bisa menonaktifkan link
 * ini. Link lamanya mungkin masih bisa dibayar." — persis apa yang SUDAH
 * dikatakan toast di sekitarnya, jadi admin membaca akibat yang sama dua kali
 * dan tidak pernah membaca sebabnya sekali pun. Selama itu, "sudah dicoba
 * berkali-kali tanpa hasil" tidak punya jalan untuk berubah jadi tindakan.
 *
 * ⚠️ SEBAB PERTAMA YANG PERNAH TEREKAM (2026-09-10, tagihan
 * `JFU-INV-5b73a8-1789044625252`, lewat `doku_cancel_last_error` sql/87):
 *
 *     HTTP 400 · {"error":{"message":"Merchant not support cancel order,
 *                 please do activation through DOKU dashboard."}}
 *
 * Cancel Order TIDAK PERNAH AKTIF di akun ini. Itu menjelaskan kenapa
 * `invoices.doku_cancelled_at` masih nol baris seumur hidup — bukan tanda
 * tangan yang salah, bukan `request_id` yang hilang, melainkan sebuah setelan
 * akun. Sampai ia dinyalakan, SETIAP pembatalan akan pulang begini.
 *
 * Badan mentahnya TETAP dipulangkan di `details` dan disimpan apa adanya;
 * fungsi ini hanya memilih kalimat yang dibaca manusia.
 */
export function explainDokuRejection(httpStatus, body) {
  const text = String(body || '');
  const low = text.toLowerCase();

  if (low.includes('not support cancel order') || low.includes('do activation')) {
    return 'fitur Cancel Order belum aktif di akun DOKU — semua pembatalan akan gagal sampai diaktifkan lewat dashboard DOKU';
  }
  if (low.includes('already paid') || low.includes('has been paid') || low.includes('order is paid')) {
    return 'DOKU menganggap pesanan ini sudah dibayar';
  }
  if (low.includes('expired')) {
    return 'pesanannya sudah kedaluwarsa di DOKU';
  }
  if (low.includes('not found') || low.includes('invalid original_request_id')) {
    return 'DOKU tidak mengenali request_id tagihan ini';
  }

  // Tak dikenali: pulangkan pesan DOKU apa adanya, bukan kalimat kami yang
  // mengarang. Yang tidak bisa dijelaskan lebih baik dikutip.
  try {
    const parsed = JSON.parse(text);
    const msg = parsed?.error?.message || parsed?.message;
    if (msg) return `DOKU menolak (HTTP ${httpStatus}): ${String(msg).slice(0, 160)}`;
  } catch { /* bukan JSON — jatuh ke bawah */ }

  return text.trim()
    ? `DOKU menolak (HTTP ${httpStatus}): ${text.trim().slice(0, 160)}`
    : `DOKU menolak tanpa pesan (HTTP ${httpStatus})`;
}

/**
 * Bolehkah pemanggil ini mematikan link tagihan `invoiceNumber`?
 *
 * ⚠️ KEPEMILIKANNYA HARUS PENUH, BUKAN SEBAGIAN. Satu `payment_id` bisa
 * menaungi BEBERAPA order (tagihan gabungan — terukur 3 di produksi, yang
 * terbesar menaungi 7 order). Mematikan link-nya mematikannya untuk SELURUH
 * bundel, jadi memeriksa "apakah peneliti memiliki SALAH SATU order di bawahnya"
 * akan membiarkan satu anggota mematikan tagihan yang juga menagih survei orang
 * lain.
 *
 * Hari ini ketiga bundel itu satu pemilik, jadi bahayanya LATEN — tapi tidak ada
 * yang mencegah bundel lintas pemilik lahir besok, dan penjaga yang benar hari
 * ini jauh lebih murah daripada insiden yang menemukannya nanti.
 *
 * ⚠️ MEMBACA PAKAI SERVICE ROLE, DAN ITU DISENGAJA. Kita justru perlu melihat
 * SELURUH baris di bawah `payment_id` ini — termasuk yang BUKAN milik pemanggil.
 * Membaca dengan token peneliti akan menyembunyikan baris milik orang lain
 * lewat RLS, dan "tidak terlihat" akan terbaca sebagai "tidak ada": penjaga
 * yang justru meloloskan kasus yang harus ia tolak.
 *
 * Memulangkan `null` kalau boleh; string alasan kalau tidak.
 */
export async function assertCallerMayCancel(env, caller, invoiceNumber) {
  if (caller?.isAdmin) return null;

  const email = String(caller?.authEmail || '').toLowerCase();
  const userId = caller?.authUserId || null;
  if (!email && !userId) return 'Sesi tidak dikenali.';

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  /*
    ⚠️ GAGAL-TERTUTUP, tanpa cadangan ke anon key. Rantai
    `SERVICE_ROLE || ANON` sudah pernah menyamarkan penolakan izin jadi "data
    tidak ada" di `create-payment.js` (insiden 2026-08-10). Di sini akibatnya
    lebih buruk: "tidak ada baris" akan terbaca sebagai "tidak ada yang perlu
    dilindungi".
  */
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[cancel-order] SUPABASE_SERVICE_ROLE_KEY tidak ada — kepemilikan tidak bisa dibuktikan.');
    return 'Server tidak dapat memverifikasi kepemilikan tagihan.';
  }

  const url = `${supabaseUrl}/rest/v1/invoices`
    + `?payment_id=eq.${encodeURIComponent(invoiceNumber)}`
    + '&select=form_submission_id,form_submissions(auth_user_id,email)';

  let rows;
  try {
    const res = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '?');
      console.error(`[cancel-order] gagal membaca invoices ${invoiceNumber} (HTTP ${res.status}): ${detail}`);
      return 'Server tidak dapat memverifikasi kepemilikan tagihan.';
    }
    rows = await res.json();
  } catch (err) {
    console.error('[cancel-order] galat jaringan saat memverifikasi kepemilikan:', err);
    return 'Server tidak dapat memverifikasi kepemilikan tagihan.';
  }

  /*
    Nol baris = tagihannya tidak kita kenal. Ditolak, dan pesannya sengaja TIDAK
    membedakan "tidak ada" dari "bukan milikmu" — membedakannya mengubah
    endpoint ini jadi alat menebak nomor tagihan yang sah.
  */
  if (!Array.isArray(rows) || rows.length === 0) {
    return 'Tagihan ini tidak ditemukan atau bukan milikmu.';
  }

  const ownsAll = rows.every((r) => {
    const fs = r?.form_submissions;
    if (!fs) return false;
    if (fs.auth_user_id) return userId && fs.auth_user_id === userId;
    // Order lama tanpa `auth_user_id` dicocokkan lewat email, pola yang sama
    // dengan policy RLS `Users Select Invoices`.
    return !!email && String(fs.email || '').toLowerCase() === email;
  });

  if (!ownsAll) {
    console.warn(`[cancel-order] ${email || userId} mencoba membatalkan ${invoiceNumber} yang bukan (sepenuhnya) miliknya.`);
    return 'Tagihan ini tidak ditemukan atau bukan milikmu.';
  }

  return null;
}

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
      ⚠️ KEPEMILIKAN DIBUKTIKAN SEBELUM APA PUN, dan sebelum cabang
      `no_request_id` di bawah. Cabang itu memulangkan 200 dengan pesan yang
      menyatakan tagihannya ADA tapi tak bisa dimatikan — informasi yang tidak
      boleh keluar untuk tagihan milik orang lain.

      `context.data` diisi `_middleware.js` yang sudah memvalidasi tokennya.
      Admin lolos tanpa pemeriksaan tambahan; peneliti wajib memiliki SELURUH
      order di bawah `payment_id` ini.
    */
    const denial = await assertCallerMayCancel(context.env, context.data || {}, invoiceNumber);
    if (denial) {
      return json({ cancelled: false, reason: 'forbidden', message: denial }, 403);
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
      // Catatan yang JUJUR soal siapa pembatalnya — sejak peneliti boleh
      // memanggil endpoint ini, "admin" tidak lagi selalu benar, dan catatan
      // ini ikut terbaca di dashboard DOKU saat menelusuri sebuah pembatalan.
      note: (note || (context.data?.isAdmin
        ? 'Dibatalkan oleh admin Jakpat for Universities'
        : 'Dibatalkan oleh peneliti lewat dashboard')).substring(0, 255),
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
        // SEBAB, bukan akibat — akibatnya sudah dikatakan pemanggil. Lihat
        // catatan di `explainDokuRejection`.
        message: explainDokuRejection(dokuResponse.status, resultText),
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
