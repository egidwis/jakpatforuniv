import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getFormSubmissionById, releaseExpiredSlot } from '../utils/supabase';
import type { FormSubmission } from '../utils/supabase';
import { createPayment, GroupBillError } from '../utils/payment';
import { ErrorPage } from '../components/ErrorPage';

export default function PaymentRetryPage() {
  const [formId, setFormId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  /**
   * Terisi kalau pesanan ini ternyata sudah ditanggung tagihan gabungan.
   * Selama ia terisi, tombol "bayar ulang" DICABUT — lihat catatan di `catch`.
   */
  const [groupBill, setGroupBill] = useState<GroupBillError | null>(null);

  useEffect(() => {
    // Ambil ID dari URL query parameter
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (id) {
      setFormId(id);
      fetchFormData(id);
    } else {
      setLoading(false);
      setError('ID form tidak ditemukan');
    }
  }, []);

  const fetchFormData = async (id: string) => {
    try {
      console.log('Fetching form data for ID:', id);
      const data = await getFormSubmissionById(id);

      if (!data) {
        console.error('No form data returned for ID:', id);
        setError('Data form tidak ditemukan');
        setLoading(false);
        return;
      }

      // Block if already paid
      if (data.payment_status === 'paid') {
        setError('Pembayaran untuk form ini sudah berhasil.');
        setLoading(false);
        return;
      }

      // Block if slot expired (either marked expired, or timer passed without PaymentCheckoutPage releasing it)
      const isSlotExpired =
        data.slot_booked_by === 'user' &&
        data.slot_reserved_at &&
        Date.now() > new Date(data.slot_reserved_at).getTime() + 3_600_000;

      if (data.payment_status === 'expired' || isSlotExpired) {
        // Release the slot if it hasn't been released yet (user came directly from email)
        if (isSlotExpired && data.payment_status !== 'expired') {
          try { await releaseExpiredSlot(id); } catch (_) { /* non-fatal */ }
        }
        setError('Slot waktu tayang sudah tidak tersedia karena melewati batas 1 jam pembayaran. Silakan lakukan booking ulang dari dashboard.');
        setLoading(false);
        return;
      }

      console.log('Form data retrieved successfully:', data);
      setFormData(data as FormSubmission);
    } catch (error) {
      console.error('Error fetching form data:', error);

      // Tampilkan pesan error yang lebih spesifik
      if (error.message && error.message.includes('network')) {
        setError('Gagal terhubung ke server. Periksa koneksi internet Anda.');
      } else if (error.code === 'PGRST116') {
        setError('Data form tidak ditemukan');
      } else {
        setError('Terjadi kesalahan saat mengambil data');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRetryPayment = async () => {
    if (!formData || !formId) {
      toast.error('Data form tidak ditemukan');
      return;
    }

    setIsProcessing(true);
    const loadingToast = toast.loading('Mempersiapkan pembayaran...');

    try {
      console.log('Memulai proses pembayaran ulang untuk form ID:', formId);

      const paymentUrl = await createPayment({
        formSubmissionId: formId,
        amount: formData.total_cost,
        customerInfo: {
          title: formData.title,
          fullName: formData.full_name || 'Pengguna',
          email: formData.email || 'user@example.com',
          phoneNumber: formData.phone_number || '-'
        }
      });

      console.log('Payment URL diterima:', paymentUrl);

      // Dismiss loading toast
      toast.dismiss(loadingToast);

      // Cek apakah ini adalah simulasi
      if (paymentUrl.includes('simulation=true')) {
        // Tampilkan success toast untuk simulasi
        toast.success('Simulasi pembayaran berhasil! Anda akan diarahkan ke halaman sukses.');
        console.log('Mode simulasi terdeteksi, akan redirect ke halaman sukses simulasi');
      } else {
        // Tampilkan success toast untuk pembayaran nyata
        toast.success('Berhasil! Anda akan diarahkan ke halaman pembayaran.');
        console.log('Mode produksi terdeteksi, akan redirect ke DOKU payment gateway');
      }

      // Tambahkan delay kecil agar toast terlihat
      setTimeout(() => {
        // Redirect ke halaman pembayaran
        console.log('Melakukan redirect ke:', paymentUrl);
        window.location.href = paymentUrl;
      }, 1500);
    } catch (error) {
      console.error('Error saat memproses pembayaran ulang:', error);
      toast.dismiss(loadingToast);

      /*
        ⚠️ TAGIHAN GABUNGAN: JANGAN TAWARKAN "COBA LAGI".
        Server sudah memutuskan tidak akan pernah mencetak tagihan kedua untuk
        pesanan ini (A3) — mengulang hanya menghasilkan 409 yang sama. Yang
        dibutuhkan peneliti justru link yang SUDAH ada, plus alasan kenapa
        nominalnya lebih besar daripada harga satu pesanan.

        Halaman ini publik & tanpa autentikasi (dibuka dari email), jadi
        tujuannya link DOKU-nya langsung — bukan `/invoices/<payment_id>` yang
        ada di balik PrivateRoute.
      */
      if (error instanceof GroupBillError) {
        setGroupBill(error);
        toast.warning(error.message, { duration: 10000 });
        return;
      }

      toast.error('Terjadi kesalahan saat memproses pembayaran. Silakan coba lagi.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorPage
        title="Terjadi Kesalahan"
        message={error}
        referenceId={formId || undefined}
        onRetry={formId ? () => fetchFormData(formId) : undefined}
      />
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">Coba Bayar Lagi</h1>

        {formData && (
          <div className="mb-8">
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <h3 className="font-medium mb-2">Detail Survey:</h3>
              <ul className="space-y-2 text-gray-600">
                <li><span className="font-medium">Judul:</span> {formData.title}</li>
                <li><span className="font-medium">Deskripsi:</span> {formData.description}</li>
                <li><span className="font-medium">Durasi:</span> {formData.duration} hari</li>
                <li><span className="font-medium">Tanggal:</span> {formData.start_date} - {formData.end_date}</li>
                <li><span className="font-medium">Total Biaya:</span> Rp {new Intl.NumberFormat('id-ID').format(formData.total_cost)}</li>
              </ul>
            </div>

            {groupBill ? (
              /*
                Nominal grup DISEBUT, dan itu syarat kejujurannya. Blok "Detail
                Survey" di atas memajang `total_cost` pesanan INI; tanpa kalimat
                di bawah, tombolnya membuka halaman DOKU bernominal lain tanpa
                satu pun penjelasan — cacat A1 yang sama, cuma pindah halaman.
              */
              <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
                <p className="font-semibold">Pesanan ini sudah termasuk tagihan gabungan.</p>
                <p className="leading-relaxed">
                  {groupBill.memberCount > 1
                    ? <>Satu tagihan menanggung <strong>{groupBill.memberCount} pesanan</strong> sekaligus
                        {groupBill.total > 0 && <>, total <strong>Rp {new Intl.NumberFormat('id-ID').format(groupBill.total)}</strong></>}.
                        Membayarnya sekali melunasi semuanya.</>
                    : <>Bayar lewat link tagihan yang sudah ada — jangan membuat tagihan baru.</>}
                </p>
                <p className="text-xs text-amber-800">
                  Kami tidak menerbitkan tagihan kedua untuk pesanan yang sama: dua link hidup berarti
                  keduanya bisa terbayar.
                </p>
              </div>
            ) : (
              <p className="text-gray-600 mb-6 text-center">
                Silakan klik tombol di bawah untuk mencoba pembayaran lagi.
              </p>
            )}

            <div className="flex justify-center space-x-4">
              <a href="/" className="button button-secondary">
                Kembali ke Beranda
              </a>

              {groupBill?.paymentUrl ? (
                <a
                  href={groupBill.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button button-primary"
                >
                  Buka Tagihan Gabungan
                </a>
              ) : (
                <button
                  onClick={handleRetryPayment}
                  /* Tombolnya dicabut, bukan sekadar gagal berulang: server sudah
                     memutuskan permintaan ini tidak akan pernah dikabulkan. */
                  disabled={isProcessing || !!groupBill}
                  className={`button ${isProcessing || groupBill ? 'button-disabled' : 'button-primary'}`}
                >
                  {isProcessing ? 'Memproses...' : 'Bayar Sekarang'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
