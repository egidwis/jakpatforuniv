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
  /**
   * `ad_schedules.id` jadwal yang ditagih — BUKAN `source_id` (Phase 4).
   *
   * Absennya berarti "jadwal ordinal 1", persis perilaku sebelum Phase 4.
   * Dengan nilainya, `create-payment.js` mengalihkan ketiga penjaganya ke baris
   * jadwal itu, menulis atribusi `entity_type`/`extend_id`/`schedule_id`, dan
   * menghitung harga dari durasi JADWAL — bukan durasi order.
   *
   * ⚠️ Server tetap membuktikan kepemilikannya (403 kalau jadwal ini milik order
   * lain). Nilai ini tidak dipercaya hanya karena datang dari layar kita sendiri.
   */
  scheduleId?: string;
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
   * `ad_schedules.id` jadwal yang ditagih — HANYA untuk N=1.
   *
   * Dibawa ke `callback_url` supaya halaman sukses menyebut jendela tayang
   * yang benar-benar dibayar. Tanpa ini ia membaca `form_submissions`, yang
   * selalu jendela ordinal 1: tagihan jadwal ke-2 mengumumkan tanggal jadwal
   * ke-1. Untuk bundel (`bundleCount > 1`) parameter ini tidak relevan —
   * tujuannya `/invoices/` yang memang memuat seluruh jadwalnya.
   */
  scheduleId?: string;
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
/**
 * Sama dengan default `create-payment.js` (`dueDate … : 60`) — konvensi berkas ini.
 *
 * ⚠️ ANGKA INI TERIKAT PADA JARAK DUA CUTOFF DI `airing-window.ts`.
 * `PAYMENT_CUTOFF_HOUR_WIB (14) − BOOKING_CUTOFF_HOUR_WIB (13)` = 60 menit =
 * nilai ini. Kaitan itu yang membuat cabang `null` di bawah tidak pernah
 * mengenai peneliti. Menaikkannya ke 90 tanpa ikut menggeser cutoff pemesanan
 * akan mulai menolak pemesanan sah — dan tidak akan terlihat di layar mana pun.
 * Dijaga `invoiceLifetime.spec.ts` → describe "invarian cutoff".
 */
export const MIN_INVOICE_MINUTES = 60;

/**
 * Umur link, dalam menit — atau `null` kalau tagihannya TIDAK BOLEH TERBIT.
 *
 * ⚠️ CABANG `null` ADALAH GERBANG ADMIN, BUKAN GERBANG PENELITI — jangan
 * "memperbaikinya" untuk peneliti.
 *
 * Jalur peneliti tidak bisa mencapainya: `isBookingClosedForDate`
 * (ditegakkan di `submitOrder.ts`) menutup pemesanan hari-H pada 13.00 WIB,
 * jadi pemesanan paling akhir yang mungkin (12:59:59) selalu menyisakan lebih
 * dari `MIN_INVOICE_MINUTES` ke 14.00.
 *
 * Yang bisa mencapainya cuma admin, dan itu konsekuensi commit `920b3cb`
 * (1 Sep 2026): ia sengaja melonggarkan cutoff untuk admin di `ScheduleForm`
 * sementara `createManualInvoice` tidak ikut dilonggarkan. Jadi penolakan di
 * sini adalah satu-satunya yang menahan admin menerbitkan tagihan yang mati
 * sebelum sempat dipakai.
 *
 * ⚠️ KALAU PHASE 4 MEMBUKA PENJADWALAN SWALAYAN, ia menambah jalur peneliti
 * KEDUA yang tidak lewat `submitOrder.ts` — dan cutoff pemesanannya harus ikut
 * ditegakkan di sana (di RPC-nya), atau invarian ini patah.
 */
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
/**
 * Checkout ditolak karena pesanannya sudah masuk TAGIHAN GABUNGAN.
 *
 * ⚠️ KELASNYA SENDIRI, BUKAN `Error` POLOS — dan itu bukan kerapian. Pemanggil
 * harus bisa membedakan "gagal, coba lagi" dari "jangan coba lagi, bayar di
 * link ini": yang pertama pantas diberi tombol ulang, yang kedua justru harus
 * MENCABUT tombol itu. Tanpa pembedaan ini, tombol "coba lagi" akan menekan
 * endpoint yang sudah memutuskan tidak akan pernah mengabulkannya.
 */
export class GroupBillError extends Error {
  readonly paymentUrl: string | null;
  readonly paymentId: string | null;
  /** Berapa pesanan yang ditanggung link itu. 0 = tidak diketahui. */
  readonly memberCount: number;
  /** Total yang BENAR-BENAR akan ditagih halaman DOKU-nya. 0 = tidak diketahui. */
  readonly total: number;

  constructor(message: string, info: {
    paymentUrl?: string | null;
    paymentId?: string | null;
    memberCount?: number;
    total?: number;
  }) {
    super(message);
    this.name = 'GroupBillError';
    this.paymentUrl = info.paymentUrl ?? null;
    this.paymentId = info.paymentId ?? null;
    this.memberCount = info.memberCount ?? 0;
    this.total = info.total ?? 0;
  }
}

/**
 * Berapa menit link DOKU ini boleh hidup?
 *
 * ⚠️ SATUANNYA MENIT SEJAK LINK DIBUAT, bukan sebuah instant. Itu yang membuat
 * fungsi ini ada: DOKU tidak menerima "mati pada jam sekian", ia hanya menerima
 * "hidup sekian menit". Jadi tenggat yang kita punya (`expiredAt`) harus
 * diterjemahkan jadi SISA waktu, dan terjemahan itu bergantung pada kapan
 * fungsi ini dipanggil — itulah sebabnya `now` bisa disuntik dan tidak dibaca
 * dari jam device di tengah perhitungan.
 *
 * ⚠️ TANPA `expiredAt` JAWABANNYA 60 MENIT TETAP — dan itu hanya benar kalau
 * link lahir bersamaan dengan hold-nya. Pemanggil yang menagih reservasi yang
 * SUDAH berjalan wajib mengirim `expiredAt`; kalau tidak, link-nya hidup
 * sampai 59 menit melewati tenggat slot, dan peneliti bisa membayar tanggal
 * yang sudah dilepas ke orang lain. Itu cacat yang hidup di `JadwalBaruPage`
 * dan `PaymentRetryPage` sampai 2026-09-17.
 *
 * ⚠️ LANTAI 1 MENIT, BUKAN 0. `payment_due_date: 0` TIDAK berarti "mati
 * seketika" di DOKU — ia berarti "pakai setelan dashboard", dan dashboard kami
 * sengaja dikosongkan selamanya (`docs/langkah-0-dan-9-doku.md`). Jadi nol akan
 * menghasilkan justru kebalikan dari maksudnya: link yang tidak pernah mati.
 */
export function dokuLifetimeMinutes(
  expiredAt: string | undefined,
  now: number = Date.now(),
): number {
  if (!expiredAt) return 60;
  const deadline = new Date(expiredAt).getTime();
  // Tanggal yang tidak terbaca jatuh ke perilaku default, bukan ke NaN yang
  // diam-diam dikirim ke DOKU sebagai `payment_due_date`.
  if (Number.isNaN(deadline)) return 60;
  return Math.max(1, Math.round((deadline - now) / 60000));
}

export const createPayment = async (paymentData: PaymentData) => {
  try {
    const { formSubmissionId, expiredAt, scheduleId } = paymentData;
    const origin = window.location.origin || "https://submit.jakpatforuniv.com";

    // Payment + invoice/transaction rows are created SERVER-SIDE via
    // /api/doku/create-payment (service_role). The server derives the amount
    // from the DB, so the browser no longer inserts into invoices/transactions
    // and no longer needs write access to those tables. This is what makes RLS
    // on `invoices` safe to enable (see sql/24_secure_invoices_rls.sql).
    const payment_due_date = dokuLifetimeMinutes(expiredAt);

    const response = await axios.post(
      `${origin}/api/doku/create-payment`,
      // `scheduleId` hanya dikirim kalau ada — mengirim `undefined` eksplisit
      // membuat JSON-nya memuat kuncinya dengan nilai null di sebagian klien,
      // dan endpoint membedakan "tidak dikirim" dari "dikirim kosong".
      { formSubmissionId, origin, paymentDueDate: payment_due_date, ...(scheduleId ? { scheduleId } : {}) },
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

    /*
      409 + `group_bill` = pesanan ini sudah ditanggung tagihan gabungan.
      Bukan kegagalan yang bisa diulang: endpoint-nya sengaja MENOLAK mencetak
      tagihan kedua (lihat catatan A3 di `create-payment.js`), karena dua link
      hidup untuk satu jadwal berarti dua-duanya bisa dibayar.
    */
    if (status === 409 && err?.response?.data?.group_bill) {
      const data = err.response.data;
      throw new GroupBillError(
        serverError || 'Pesanan ini sudah termasuk tagihan gabungan.',
        {
          paymentUrl: data.payment_url ?? null,
          paymentId: data.payment_id ?? null,
          memberCount: Number(data.group_count || 0),
          total: Number(data.group_total || 0),
        },
      );
    }

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
    const { formSubmissionId, amount, description, customerInfo, bundleCount = 1, airingStartYmd, scheduleId } = invoiceData;

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
    /*
     * ⚠️ `schedule` hanya ikut di cabang N=1, dan hanya kalau diketahui.
     * Halaman sukses berlingkup ORDER sementara tagihan berlingkup JADWAL;
     * tanpa parameter ini tagihan jadwal ke-2 mengumumkan jendela jadwal
     * ke-1. Cabang bundel tidak memerlukannya — `/invoices/` sudah memuat
     * tiap jadwal per bundelnya.
     */
    const callbackUrl = bundleCount > 1
      ? `${origin}/invoices/${invoiceNumber}`
      : `${origin}/payment-success?id=${formSubmissionId}`
        + (scheduleId ? `&schedule=${encodeURIComponent(scheduleId)}` : '')
        + `&source=gateway`;
    
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

    /*
      ⚠️ TAGIHAN TANPA `request_id` LAHIR SUDAH TIDAK BISA DICABUT.

      Cancel Order menuntutnya sebagai `original_request_id`; tanpa itu link
      DOKU-nya tidak bisa dimatikan lewat API SELAMANYA — yang tersisa cuma
      menunggu `expires_at` lewat.

      Terjadi sungguhan 8 Sep 2026 pada tagihan uji Rp 1.110: satu-satunya
      baris tanpa `request_id` sejak sql/84 dideploy (3 Sep 09.15), dan
      ketiadaannya baru ketahuan saat pembatalannya dicoba — berjam-jam
      kemudian, lewat pesan galat yang tidak menyebut sebabnya.

      Tidak melempar: menolak menerbitkan tagihan gara-gara ini akan menahan
      penagihan yang sah demi masalah yang jauh lebih ringan. Tapi ia TIDAK
      boleh sunyi — pemanggil memeriksa `doku_request_id` pada nilai balik dan
      memperingatkan admin di layar.
    */
    if (!data.request_id) {
      console.error(
        `[createManualInvoice] DOKU tidak memulangkan request_id untuk ${data.response.order.invoice_number} — ` +
        'link ini TIDAK akan bisa dimatikan lewat Cancel Order.'
      );
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
