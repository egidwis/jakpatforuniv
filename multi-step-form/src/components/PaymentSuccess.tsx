import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, RefreshCcw, Loader2, MessageCircle, LayoutDashboard, ExternalLink } from 'lucide-react';
import { fetchAdSchedules, fetchScheduleBilling, getFormSubmissionById, supabase } from '../utils/supabase';
import type { FormSubmission } from '../utils/supabase';
import { payLinkPath } from '../utils/payLink';
import { pickSuccessBill, type SuccessBillEvent } from '../utils/paymentSuccessBill';
import { ErrorPage } from './ErrorPage';
import { airingDayCount } from '../pages/dashboard/schedule/scheduleModel';
import { useLanguage } from '../i18n/LanguageContext';

interface PaymentSuccessProps {
  formId?: string;
  /**
   * `ad_schedules.id` yang benar-benar dibayar, dari `?schedule=` di URL.
   *
   * ⚠️ TANPA INI HALAMAN MENYEBUT JADWAL YANG SALAH. `form_submissions.
   * start_date/end_date` selalu jendela ordinal 1, jadi pembayaran jadwal
   * ke-2 dst. diumumkan dengan tanggal jadwal ke-1 — terukur di produksi
   * pada 17 tagihan lunas, terburuk meleset ~4 bulan (`6a18c955…`: bayar
   * tayang 17 Sep, halaman menyebut 24 Mei).
   *
   * Opsional dengan sengaja: link lama yang sudah beredar tidak membawanya,
   * dan untuk mereka perilaku lama HARUS bertahan persis.
   */
  scheduleId?: string;
}

const fmtDate = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
      })
    : null;

/**
 * Penutup sesungguhnya dari seluruh perjalanan order — DOKU hanya mengarah ke
 * sini, `/payment-failed` tidak pernah jadi tujuan callback.
 *
 * Dulu layar ini menutup perjalanan panjang dengan perintah "silakan tutup
 * halaman ini", tidak pernah menyebut kapan iklannya tayang (satu-satunya hal
 * yang ingin dipastikan user), dan menampilkan judul "Menunggu Pembayaran"
 * tepat setelah user membayar hanya karena webhook belum masuk. Ketiganya
 * diperbaiki di sini; layarnya kini juga memperbarui dirinya sendiri.
 */
export function PaymentSuccess({ formId, scheduleId }: PaymentSuccessProps) {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<FormSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  /*
    ⚠️ `isFromGateway` DIBUANG BERSAMA TOMBOL "Tutup halaman ini".
    Ia satu-satunya pembacanya, dan tombol itu sendiri mati: `window.close()`
    hanya bekerja untuk tab yang dibuka skrip, sementara halaman ini datang
    dari redirect DOKU. Parameter `?source=gateway` tetap dikirim
    `create-payment` — kalau suatu saat ada yang benar-benar membutuhkannya,
    bacalah di sana, jangan hidupkan tombolnya lagi.
  */

  /*
    ⚠️ NOMINAL DIBACA DARI TAGIHAN, BUKAN DARI ORDER.

    Halaman ini dulu mencetak `form_submissions.total_cost / subtotal /
    ppn_amount` di bawah judul "Total Pembayaran" — biaya ORDER. Terukur di
    produksi: layar kami Rp 277.500, DOKU menagih Rp 1.110. Normalnya sama,
    dan itulah yang membuatnya berbahaya: ia benar cukup lama untuk dipercaya,
    lalu berbohong tepat pada tagihan susulan / top-up hadiah / harga yang
    di-reprice.

    `null` berarti **sembunyikan blok nominal**. Tidak ada jalan mundur ke
    angka order: angka yang salah lebih buruk daripada angka yang tidak ada.
  */
  const [bill, setBill] = useState<
    { paymentId: string | null; amount: number; subtotal: number | null; ppn: number | null } | null
  >(null);
  /** Jadwal yang ditunjuk tombol "Lanjutkan Pembayaran" — lihat `pickSuccessBill`. */
  const [payScheduleId, setPayScheduleId] = useState<string | null>(null);
  /**
   * Jendela tayang + nomor jadwal YANG DIBAYAR, saat `?schedule=` ada.
   *
   * `null` berarti "pakai kolom order seperti dulu" — bukan kegagalan. Link
   * lama tidak membawa `?schedule=`, dan bentuk lamanya wajib bertahan.
   */
  const [paidSchedule, setPaidSchedule] = useState<
    { startDate: string | null; endDate: string | null; ordinal: number | null } | null
  >(null);
  /**
   * Status lunas TAGIHAN yang dibayar. `null` = tidak diketahui → pakai
   * bendera order seperti dulu (link lama tanpa `?schedule=`).
   */
  const [billIsPaid, setBillIsPaid] = useState<boolean | null>(null);

  // Dibaca oleh polling supaya interval-nya tidak perlu dibuat ulang tiap kali
  // datanya berubah (dan tidak menutup nilai `formData` yang basi).
  const isPaidRef = useRef(false);

  const fetchFormData = async (id: string, isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    else setLoading(true);
    // Bersihkan error dari percobaan sebelumnya. Tanpa ini, error yang ditulis
    // pada render pertama (saat formId masih undefined) tetap tersangkut di
    // state, sehingga guard `error || !formData` di bawah terus menampilkan
    // ErrorPage walau fetch-nya sudah berhasil.
    setError(null);
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );

      const data = (await Promise.race([getFormSubmissionById(id), timeoutPromise])) as FormSubmission;

      if (!data) {
        setError(t('successNotFound'));
        return;
      }

      setFormData(data);
      // ⚠️ Bendera ORDER hanya boleh menulis `isPaidRef` kalau jadwalnya TIDAK
      // diketahui. Untuk `?schedule=`, `loadBill` yang berwenang — kalau tidak,
      // ia menimpa status tagihan jadwal ke-2 dengan status jadwal ke-1.
      if (!scheduleId) {
        isPaidRef.current = data.payment_status === 'paid' || data.payment_status === 'completed';
      }
    } catch (err: any) {
      console.error('Error fetching form data:', err);
      if (err.message && (err.message.includes('network') || err.message.includes('timeout'))) {
        setError(t('errorConnectionFailed'));
      } else if (err.code === 'PGRST116') {
        setError(t('successNotFound'));
      } else {
        setError(err.message || t('successLoadError'));
      }
    } finally {
      setLoading(false);
      if (isManualRefresh) setIsRefreshing(false);
    }
  };

  /**
   * Tagihan yang sedang dilihat orang ini — dan berapa persisnya DOKU menagih.
   *
   * ⚠️ GAGAL LUNAK, SELALU. Kalau apa pun di sini meleset, blok nominalnya
   * disembunyikan dan halaman tetap utuh: judulnya, jadwal tayangnya, dan
   * tombolnya jauh lebih penting daripada tiga baris angka. Yang TIDAK boleh
   * terjadi adalah jatuh kembali ke biaya order.
   */
  const loadBill = async (id: string) => {
    try {
      const billing = await fetchScheduleBilling(id);

      const events: SuccessBillEvent[] = [];
      billing.forEach((b, scheduleId) => {
        for (const inv of b.invoices) {
          events.push({
            scheduleId,
            paymentId: inv.paymentId,
            amount: inv.amount,
            createdAt: inv.createdAt ?? null,
            isPaid: inv.isPaid,
            isOpen: b.openInvoice?.paymentId === inv.paymentId,
          });
        }
      });

      // Cadangan jadwal: ordinal 1 dikunci `sourceId === id` (aturan yang sama
      // dengan `payMap` di StatusPage). Dipakai supaya tombolnya tetap ada
      // walau tak ada tagihan berarti — keputusan pemilik produk.
      let ordinalOne: string | null = null;
      billing.forEach((b, scheduleId) => { if (b.sourceId === id) ordinalOne = scheduleId; });

      /*
        ⚠️ SAAT `?schedule=` DIKETAHUI, HANYA PERISTIWA JADWAL ITU YANG DIHITUNG.

        Tanpa penyaringan ini `pickSuccessBill` memilih peristiwa TERBARU dari
        SELURUH jadwal order — jadi membayar jadwal ke-2 bisa menampilkan
        nominal jadwal ke-3 yang tagihannya terbit belakangan. Untuk link lama
        (tanpa `?schedule=`) perilakunya tidak berubah sedikit pun.
      */
      const scoped = scheduleId ? events.filter((e) => e.scheduleId === scheduleId) : events;
      const picked = pickSuccessBill(scoped.length > 0 ? scoped : events, ordinalOne);
      setPayScheduleId(picked.scheduleId);
      /*
        ⚠️ LUNAS DITURUNKAN DARI TAGIHAN, BUKAN DARI BENDERA ORDER.

        `form_submissions.payment_status` berlingkup ORDER: ia sudah `paid`
        begitu jadwal ke-1 lunas, jadi pembayaran jadwal ke-2 yang webhooknya
        belum masuk langsung tampil "Lunas". Sebaliknya order yang dibayar di
        luar sistem macet "menunggu" selamanya (memo
        `payment-status-not-proof-of-payment`).

        Hanya dipakai saat jadwalnya diketahui — untuk link lama benderanya
        tetap satu-satunya sumber, persis seperti sebelumnya.
      */
      if (scheduleId && picked.bill) {
        setBillIsPaid(picked.bill.isPaid);
        isPaidRef.current = picked.bill.isPaid;
      }

      if (!picked.bill?.paymentId) { setBill(null); return; }

      /*
        `schedule_billing_bulk` tidak memulangkan `subtotal`/`ppn_amount`, jadi
        rinciannya diambil langsung dari barisnya. Peneliti boleh membacanya:
        policy "Users Select Invoices" mengizinkan lewat `form_submission_id`.
        Kalau baris itu tak terbaca, `amount` dari RPC tetap dipakai — total
        yang benar tanpa rincian lebih baik daripada rincian yang mengarang.
      */
      const { data: row } = await supabase
        .from('invoices')
        .select('subtotal, ppn_amount, amount')
        .eq('payment_id', picked.bill.paymentId)
        .maybeSingle();

      setBill({
        paymentId: picked.bill.paymentId,
        amount: Number(row?.amount ?? picked.bill.amount) || picked.bill.amount,
        subtotal: row?.subtotal != null ? Number(row.subtotal) : null,
        ppn: row?.ppn_amount != null ? Number(row.ppn_amount) : null,
      });
    } catch (e) {
      console.warn('Rincian tagihan tidak terbaca; blok nominal disembunyikan:', e);
      setBill(null);
    }
  };

  /**
   * Jendela tayang jadwal yang dibayar — hanya dipanggil saat `?schedule=` ada.
   *
   * ⚠️ GAGAL LUNAK. Kalau jadwalnya tak terbaca (RLS, jadwal terhapus, id
   * ngawur di URL), `paidSchedule` tetap `null` dan halaman jatuh ke kolom
   * order seperti sebelumnya. Itu bisa berarti tanggal ordinal 1 yang salah —
   * tapi halaman yang menyebut tanggal lama tetap lebih baik daripada halaman
   * yang gagal total sesudah uangnya masuk.
   *
   * Lewat `fetchAdSchedules(orderId)`, bukan kueri baru: fungsi itu disaring
   * `submission_id` dan sudah dipakai dashboard peneliti, jadi jalur RLS-nya
   * sudah terbukti. Efek sampingnya jadi penjaga: jadwal milik order LAIN
   * tidak akan ada di hasilnya, jadi `?schedule=` yang ngawur diabaikan.
   */
  const loadPaidSchedule = async (orderId: string, schedId: string) => {
    try {
      const list = await fetchAdSchedules(orderId);
      const match = list.find((s) => s.id === schedId);
      if (!match) {
        console.warn(`[payment-success] Jadwal ${schedId} bukan milik order ${orderId}; memakai jendela order.`);
        return;
      }
      setPaidSchedule({
        startDate: match.startDate ?? null,
        endDate: match.endDate ?? null,
        ordinal: match.ordinal ?? null,
      });
    } catch (e) {
      console.warn('Jendela jadwal yang dibayar tidak terbaca; memakai jendela order:', e);
    }
  };

  useEffect(() => {
    if (formId) {
      fetchFormData(formId);
      void loadBill(formId);
      if (scheduleId) void loadPaidSchedule(formId, scheduleId);
    } else {
      setLoading(false);
      setError(t('successNotFound'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, scheduleId]);

  /**
   * Webhook DOKU kerap menyusul beberapa menit setelah user kembali ke sini.
   * Halaman ini dulu tidak pernah memeriksa sendiri, jadi user diminta menekan
   * tombol untuk melihat pembayaran yang sebenarnya sudah selesai. Polling
   * dipakai persis seperti di halaman countdown, dan berhenti begitu lunas.
   */
  useEffect(() => {
    if (!formId) return;

    const poll = setInterval(async () => {
      if (isPaidRef.current) {
        clearInterval(poll);
        return;
      }
      try {
        const data = await getFormSubmissionById(formId);
        if (data) {
          setFormData(data);
          /*
            ⚠️ SAAT `?schedule=` ADA, BENDERA ORDER TIDAK BOLEH MENGHENTIKAN POLL.

            Ia sudah `paid` sejak jadwal ke-1 lunas, jadi pembayaran jadwal
            ke-2 akan berhenti memeriksa SEBELUM webhooknya masuk — layarnya
            membeku di "menunggu" sampai peneliti memuat ulang sendiri.
            `loadBill` yang memutuskan: ia membaca baris jadwal ini, dan
            menulis `isPaidRef` saat benar-benar lunas.
          */
          if (scheduleId) {
            await loadBill(formId);
            if (isPaidRef.current) clearInterval(poll);
          } else if (data.payment_status === 'paid' || data.payment_status === 'completed') {
            isPaidRef.current = true;
            clearInterval(poll);
            // Sekali saja, saat statusnya berbalik: tagihannya berpindah dari
            // "terbuka" ke "lunas", dan blok nominalnya harus ikut menyebut
            // baris yang sama — bukan tertinggal di keadaan sebelumnya.
            void loadBill(formId);
          }
        }
      } catch (e) {
        // Jaringan sesekali gagal itu wajar di sini; dicatat, tidak dibisukan.
        console.warn('Payment status poll failed, will retry:', e);
      }
    }, 5000);

    return () => clearInterval(poll);
  }, [formId]);

  const openWhatsApp = () => {
    const phoneNumber = '6287759153120';
    const message = formData
      ? `Halo, saya ingin menanyakan status pembayaran untuk survey "${formData.title}" dengan ID: ${formData.id}.`
      : 'Halo, saya ingin menanyakan status pembayaran untuk akun saya.';
    window.open(`https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`, '_blank');
  };

  if (loading && !isRefreshing) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error || !formData) {
    return (
      <ErrorPage
        title={t('successLoadErrorTitle')}
        message={error || t('successNotFound')}
        referenceId={formId}
        onRetry={formId ? () => fetchFormData(formId) : undefined}
      />
    );
  }

  // `billIsPaid` menang saat diketahui — lihat catatannya di `loadBill`.
  const isPaid = billIsPaid ?? (formData.payment_status === 'paid' || formData.payment_status === 'completed');
  /*
    ⚠️ JENDELA TAYANG DARI JADWAL YANG DIBAYAR, BUKAN DARI ORDER.

    `form_submissions.start_date/end_date` SELALU jendela ordinal 1. Selama
    hanya ada satu jadwal per order keduanya sama, dan itulah yang membuatnya
    berbahaya: ia benar cukup lama untuk dipercaya, lalu berbohong begitu
    jadwal ke-2 dirilis. Terukur di produksi pada 17 tagihan lunas ordinal >=2.

    `paidSchedule` hanya terisi saat `?schedule=` ada DAN jadwalnya milik order
    ini. Selain itu → kolom order, persis perilaku lama untuk link lama.
  */
  const airingStart = paidSchedule?.startDate ?? formData.start_date;
  const airingEnd = paidSchedule?.endDate ?? formData.end_date;
  // Panjang tayang diturunkan dari jendela tanggalnya; kolom `duration` hanya
  // cadangan, karena ia terbukti bisa meleset dari rentang sebenarnya.
  // ⚠️ `duration` cadangannya HANYA sah untuk jendela order — untuk jadwal
  // ke-2 ia kolom milik ordinal 1 dan tidak boleh ikut.
  const airingDays = airingDayCount(airingStart, airingEnd)
    ?? (paidSchedule ? null : formData.duration ?? null);
  const startText = fmtDate(airingStart);
  const endText = fmtDate(airingEnd);
  /** Penanda "Jadwal ke-N" — hanya untuk ordinal >=2, sama seperti kuitansi. */
  const scheduleLabel = paidSchedule?.ordinal != null && paidSchedule.ordinal > 1
    ? `Jadwal ke-${paidSchedule.ordinal}`
    : null;

  return (
    <div className="py-8 px-4 max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 md:p-8 text-center">
        {isPaid ? (
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
        ) : (
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        )}

        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          {isPaid ? t('successPaidTitle') : t('successPendingTitle')}
        </h1>

        <div className="mb-6 space-y-2">
          {isPaid ? (
            <>
              <p className="text-gray-600 leading-relaxed">
                {startText && airingDays
                  ? t('successPaidBody', {
                      title: formData.title || '—',
                      start: startText,
                      days: `${airingDays} ${t('days')}`,
                      end: endText || '—',
                    })
                  : t('successPaidBodyNoSchedule', { title: formData.title || '—' })}
              </p>
              <p className="text-gray-500 text-sm">{t('successFollowUp')}</p>
            </>
          ) : (
            <p className="text-gray-600 leading-relaxed">{t('successPendingBody')}</p>
          )}
        </div>

        <div className="bg-gray-50 p-4 md:p-5 rounded-xl mb-6 text-left border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('successTxDetails')}</h3>
            <span
              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
              }`}
            >
              {isPaid ? t('successBadgePaid') : t('successBadgePending')}
            </span>
          </div>

          <dl className="space-y-2 text-sm">
            {/* Jadwal tayang paling atas — inilah yang benar-benar ingin
                dipastikan user setelah membayar, dan dulu tidak disebut sama sekali. */}
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 flex items-center gap-2 flex-wrap">
                {t('successAiringLabel')}
                {/* Jadwal ke-2 dst.: tanpa penanda ini, dua pembayaran pada
                    order yang sama menghasilkan halaman yang tak terbedakan. */}
                {scheduleLabel && (
                  <span className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 text-[10px] font-bold">
                    {scheduleLabel}
                  </span>
                )}
              </dt>
              <dd className="font-semibold text-gray-900 text-right">
                {startText && airingDays
                  ? `${startText}, 15.00 WIB · ${airingDays} ${t('days')}`
                  : t('successNoScheduleYet')}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">{t('successOrderIdLabel')}</dt>
              <dd className="font-mono text-xs text-gray-700 text-right break-all">{formData.id}</dd>
            </div>
            {/*
                ⚠️ SELURUH BLOK NOMINAL BERSUMBER DARI `bill` (baris `invoices`),
                BUKAN DARI `formData` (biaya order). Kalau `bill` null, blok ini
                TIDAK ADA sama sekali — tidak ada jalan mundur ke angka order.
                Lihat catatan lengkapnya di `paymentSuccessBill.ts`.
            */}
            {bill && bill.paymentId && (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">{t('successInvoiceLabel')}</dt>
                <dd className="font-mono text-xs text-gray-700 text-right break-all">{bill.paymentId}</dd>
              </div>
            )}
            {bill && bill.subtotal != null && bill.ppn != null && (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">{t('subtotal')}</dt>
                  <dd className="text-gray-700">Rp {new Intl.NumberFormat('id-ID').format(bill.subtotal)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">{t('ppn')}</dt>
                  <dd className="text-gray-700">Rp {new Intl.NumberFormat('id-ID').format(bill.ppn)}</dd>
                </div>
              </>
            )}
            {bill ? (
              <div className="flex justify-between gap-4 pt-2 border-t border-gray-200">
                <dt className="font-bold text-gray-900">{t('totalPayment')}</dt>
                <dd className="font-bold text-gray-900">
                  Rp {new Intl.NumberFormat('id-ID').format(bill.amount)}
                </dd>
              </div>
            ) : (
              <div className="pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-400 leading-relaxed">{t('successBillUnreadable')}</p>
              </div>
            )}
          </dl>
        </div>

        {/*
            ⚠️ CTA BERTINGKAT, BUKAN EMPAT TOMBOL SEJAJAR.

            Layar ini dulu memajang empat aksi dengan bobot yang hampir sama —
            dashboard, refresh, WhatsApp, "tutup halaman" — jadi tidak satu pun
            di antaranya terbaca sebagai langkah berikutnya. Untuk orang yang
            pembayarannya BELUM selesai, langkah berikutnya cuma satu:
            kembali membayar.

            Susunannya karena itu berbeda menurut keadaan:
              MENUNGGU → [Lanjutkan Pembayaran] · [Cek status] · teks kecil
              LUNAS    → [Lihat My Order]       · teks kecil
        */}
        <div className="flex flex-col gap-3">
          {!isPaid && payScheduleId && (
            <>
              {/*
                ⚠️ `/bayar/<schedule_id>`, BUKAN URL DOKU. Halaman ini bisa
                dibiarkan terbuka berjam-jam; membiarkan resolver yang menjawab
                berarti satu sumber kebenaran, dan tagihan yang telanjur
                dibatalkan mendapat kalimat sebab — bukan halaman DOKU basi.

                Tombolnya TETAP ADA walau tagihannya sudah batal (keputusan
                pemilik produk). Halaman ini sengaja tidak ikut menghitung
                "tagihan mana yang berwenang": itu akan jadi salinan kedua dari
                aturan yang sudah hidup di `authoritative_payment_url()`.
              */}
              <a
                href={payLinkPath(payScheduleId)}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
              >
                {t('successContinuePayment')}
                <ExternalLink size={16} />
              </a>
              <p className="text-[11px] text-gray-400 -mt-1">{t('successBackToPaymentHint')}</p>
            </>
          )}

          {isPaid ? (
            <a
              href="/dashboard"
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
            >
              <LayoutDashboard size={18} />
              {t('successViewOrders')}
            </a>
          ) : (
            <button
              onClick={() => { void fetchFormData(formId!, true); void loadBill(formId!); }}
              disabled={isRefreshing}
              className="w-full py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
              {isRefreshing ? t('successChecking') : t('successCheckNow')}
            </button>
          )}

          {/*
            Baris ketiga: teks, bukan tombol. Keduanya jalan keluar yang sah,
            tapi tidak satu pun langkah berikutnya — dan tombol yang bobotnya
            setara dengan tombol bayar justru menariknya menjauh dari bayar.

            ⚠️ "Tutup halaman ini" DIBUANG. `window.close()` hanya bekerja
            untuk tab yang dibuka skrip; datang dari redirect DOKU ia diam
            saja — tombol mati yang mengajari orang bahwa tombol di layar ini
            tidak selalu berfungsi.
          */}
          <div className="flex items-center justify-center gap-3 text-xs text-gray-400 pt-1">
            {!isPaid && (
              <>
                <a href="/dashboard" className="hover:text-gray-600 transition-colors underline underline-offset-2">
                  {t('successViewOrders')}
                </a>
                <span aria-hidden="true">·</span>
              </>
            )}
            <button
              onClick={openWhatsApp}
              className="hover:text-gray-600 transition-colors underline underline-offset-2 inline-flex items-center gap-1"
            >
              <MessageCircle size={12} />
              {t('successContactSupport')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
