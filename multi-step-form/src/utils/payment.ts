import axios from 'axios';
import { supabase } from './supabase';
import { paymentCutoffInstant } from './airing-window';

interface PaymentData {
  formSubmissionId: string;
  amount: number;
  customerInfo: {
    title: string;
    fullName: string;
    email: string;
    phoneNumber: string;
  };
  expiredAt?: string;
}

export interface InvoiceData {
  formSubmissionId: string;
  amount: number;
  description?: string;
  customerInfo?: {
    fullName?: string;
    email?: string;
    phoneNumber?: string;
  };
  /**
   * Berapa pesanan yang ditanggung satu pembayaran ini. Default 1.
   *
   * Menentukan ke mana peneliti mendarat sesudah membayar — lihat
   * `createManualInvoice`. Tidak dikirim ke DOKU selain lewat `callback_url`.
   */
  bundleCount?: number;
  /**
   * Tanggal tayang (YYYY-MM-DD) jadwal yang ditagih — untuk bundel, yang
   * PALING AWAL. Link harus mati saat jadwal pertama yang dibiayainya
   * kehilangan haknya, bukan saat yang terakhir.
   *
   * Kalau tidak diisi, umur link jatuh ke 7 hari seperti sebelumnya. Itu jalur
   * warisan, bukan default yang diinginkan.
   */
  airingStartYmd?: string;
}

/**
 * Umur link DOKU (menit) untuk jadwal yang tayang `ymd`.
 *
 * ⚠️ 7 HARI MATI ADALAH KEABADIAN UNTUK JADWAL YANG BISA MATI DALAM 20 MENIT.
 * Order af004b84: tagihan terbit 10.25, jadwalnya dibatalkan 10.44, dan
 * link-nya masih menagih sampai 9 Sep. Peneliti membayarnya jam 20.10 keesokan
 * harinya — uang sah ke jadwal yang sudah tidak ada.
 *
 * Batas atasnya tetap 7 hari (tagihan jauh hari tidak perlu hidup lebih lama
 * dari itu), batas bawahnya 14.00 WIB di hari tayang — `paymentCutoffInstant`,
 * yang sadar-WIB. Jangan pernah menghitung offset ini dari jam device: mesin
 * admin tidak selalu di WIB, dan salah zona di sini berarti link mati beberapa
 * jam terlalu cepat atau terlalu lambat.
 *
 * Mengembalikan `null` kalau cutoff-nya kurang dari `MIN_INVOICE_MINUTES` lagi
 * — pemanggil WAJIB menolak menerbitkan, bukan meng-clamp. Link yang lahir
 * sekarat lebih buruk daripada penolakan yang jelas: peneliti terlanjur
 * menerima link, membayarnya gagal, dan tidak ada yang tahu kenapa.
 */
export const MAX_INVOICE_MINUTES = 60 * 24 * 7;
/** Sama dengan default `create-payment.js` (`dueDate … : 60`) — konvensi berkas ini. */
export const MIN_INVOICE_MINUTES = 60;

export function invoiceLifetimeMinutes(
  airingStartYmd: string | undefined,
  now: Date = new Date(),
): number | null {
  if (!airingStartYmd) return MAX_INVOICE_MINUTES;
  const cutoffMs = paymentCutoffInstant(airingStartYmd).getTime() - now.getTime();
  const minutes = Math.floor(cutoffMs / 60000);
  if (minutes < MIN_INVOICE_MINUTES) return null;
  return Math.min(minutes, MAX_INVOICE_MINUTES);
}

// -------------------------------------------------------------------------------- //
// Payment Gateway Provider — DOKU only
export const getPaymentGatewayProvider = () => 'doku';
// -------------------------------------------------------------------------------- //

export const checkPaymentGatewayStatus = async (): Promise<boolean> => {
  // DOKU doesn't need a frontend status check — webhook handles everything
  return true;
};

// ==============================================================================
// CREATE PAYMENT (Form User / Self-Service Checkout)
// ==============================================================================
export const createPayment = async (paymentData: PaymentData) => {
  try {
    const { formSubmissionId, expiredAt } = paymentData;
    const origin = window.location.origin || "https://submit.jakpatforuniv.com";

    // Payment + invoice/transaction rows are created SERVER-SIDE via
    // /api/doku/create-payment (service_role). The server derives the amount
    // from the DB, so the browser no longer inserts into invoices/transactions
    // and no longer needs write access to those tables. This is what makes RLS
    // on `invoices` safe to enable (see sql/24_secure_invoices_rls.sql).
    let payment_due_date = 60; // default 60 minutes
    if (expiredAt) {
      const diffMs = new Date(expiredAt).getTime() - Date.now();
      payment_due_date = Math.max(1, Math.round(diffMs / 60000));
    }

    const response = await axios.post(
      `${origin}/api/doku/create-payment`,
      { formSubmissionId, origin, paymentDueDate: payment_due_date },
      { timeout: 15000 }
    );

    const paymentUrl = response.data?.payment_url;
    if (!paymentUrl) {
      throw new Error('Invalid response from create-payment endpoint');
    }

    return paymentUrl;
  } catch (err: any) {
    /*
      ⚠️ JANGAN TELAN PESAN SERVERNYA.
      Versi sebelumnya membuang `err.response.data` dan melempar kalimat
      generik, jadi 409 ("slot sudah kedaluwarsa"), 502 ("tagihan tidak
      tercatat"), dan 500 ("kredensial DOKU") semuanya terbaca sama di konsol
      — mustahil didiagnosis tanpa membuka Network tab. Sejak tagihan terbit
      otomatis saat slot dikunci, kegagalannya juga tidak lagi punya layar
      untuk mengeluh; konsol adalah satu-satunya tempat.
    */
    const serverError = err?.response?.data?.error;
    const serverDetail = err?.response?.data?.detail;
    const status = err?.response?.status;
    console.error(
      '[create-payment] gagal'
      + (status ? ` (HTTP ${status})` : '')
      + (serverError ? `: ${serverError}` : '')
      + (serverDetail ? ` — ${serverDetail}` : ''),
      err,
    );
    throw new Error(serverError || 'Gagal membuat pembayaran DOKU.');
  }
};

// ==============================================================================
// CREATE MANUAL INVOICE (Admin Dashboard)
// ==============================================================================
export const createManualInvoice = async (invoiceData: InvoiceData) => {
  try {
    const { formSubmissionId, amount, description, customerInfo, bundleCount = 1, airingStartYmd } = invoiceData;

    // Umur link mengikuti batas bayar jadwal yang dibiayainya. `null` = cutoff
    // sudah kurang dari 60 menit lagi → TOLAK, jangan terbitkan link sekarat.
    const dueMinutes = invoiceLifetimeMinutes(airingStartYmd);
    if (dueMinutes === null) {
      throw new Error(
        'Tagihan tidak diterbitkan: batas pelunasan jadwal ini (14.00 WIB) kurang dari 60 menit lagi, '
        + 'jadi link bayarnya akan mati sebelum sempat dipakai. Jadwalkan ulang ke tanggal berikutnya '
        + 'atau tandai lunas secara manual.',
      );
    }
    const origin = window.location.origin || "https://submit.jakpatforuniv.com";

    // ⚠️ Memuat potongan SATU `formSubmissionId`, dan untuk tagihan gabungan itu
    // sekadar kosmetik. Sejak satu pembayaran boleh menaungi N pesanan,
    // `payment_id` BUKAN lagi kunci per-order — jangan ada kode baru yang
    // membacanya begitu.
    const invoiceNumber = `JFU-INV-${formSubmissionId.substring(0,6)}-${Date.now()}`;

    /**
     * Ke mana peneliti mendarat sesudah membayar.
     *
     * Halaman `/payment-success` menarik SATU submission dan menampilkan
     * detailnya; untuk pembayaran yang menanggung 4 survei, itu artinya
     * halaman sukses yang menyebut satu survei saja. Tagihan gabungan
     * diarahkan ke kuitansinya sendiri, yang memang memuat seluruh bundel.
     * N=1 tidak berubah sedikit pun.
     *
     * ⚠️ Rutenya `/invoices/` (jamak) dan berada di balik `PrivateRoute`.
     * Sesi peneliti hampir selalu masih hidup saat DOKU memantulkannya kembali;
     * kalau tidak, PrivateRoute menyimpan URL-nya dan memulangkannya ke sini
     * sesudah login.
     */
    const callbackUrl = bundleCount > 1
      ? `${origin}/invoices/${invoiceNumber}`
      : `${origin}/payment-success?id=${formSubmissionId}&source=gateway`;
    
    const requestData = {
      amount: amount,
      invoice_number: invoiceNumber,
      description: description,
      sac_id: import.meta.env.VITE_DOKU_SAC_JFU_ID || 'SAC-7926-1778565828595',
      customer: {
        name: customerInfo?.fullName || 'Client',
        email: customerInfo?.email || 'client@example.com',
        phone: customerInfo?.phoneNumber || ''
      },
      callback_url: callbackUrl,
      payment_due_date: dueMinutes
    };

    // /api/doku/checkout is admin-gated by functions/api/doku/_middleware.js;
    // satu-satunya pemanggil (InvoiceForm) hanya hidup di dashboard internal,
    // jadi sesi admin selalu ada di sini.
    const { data: { session } } = await supabase.auth.getSession();
    const fetchResponse = await fetch(`${origin}/api/doku/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(requestData),
      signal: AbortSignal.timeout(15000)
    });

    if (!fetchResponse.ok) {
      const errTxt = await fetchResponse.text();
      throw new Error(`Proxy error: ${errTxt}`);
    }

    const data = await fetchResponse.json();
    if (!data.response || !data.response.payment) {
      throw new Error('Invalid response from DOKU checkout');
    }

    return {
      payment_id: data.response.order.invoice_number,
      invoice_url: data.response.payment.url,
      // Kapan link ini berhenti berlaku. Dihitung dari menit yang BENAR-BENAR
      // dikirim ke DOKU, bukan dari aturan yang ditulis ulang di pemanggil —
      // dua perhitungan berarti dua kebenaran, dan yang di layar akan berbohong
      // begitu salah satunya berubah.
      expires_at: new Date(Date.now() + dueMinutes * 60000).toISOString(),
      /**
       * `Request-Id` yang dipakai saat memanggil DOKU — WAJIB disimpan.
       *
       * Cancel Order API menuntutnya sebagai `original_request_id`. Sampai
       * sql/84 nilainya cuma di-console.log lalu dibuang, jadi tidak satu pun
       * dari 183 tagihan `pending` produksi bisa dimatikan lagi. Nilai yang
       * pulang tapi tidak ditulis sama saja dengan tidak pernah ada.
       */
      doku_request_id: data.request_id ?? null,
    };
  } catch (err: any) {
    console.error('Error creating DOKU manual invoice:', err);
    throw new Error(err.message || 'Gagal membuat invoice manual DOKU');
  }
};
