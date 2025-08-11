import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getFormSubmissionById } from '../utils/supabase';
import type { FormSubmission } from '../utils/supabase';
import { createPayment } from '../utils/simple-payment';
import { ErrorPage } from '../components/ErrorPage';

export default function PaymentRetryPage() {
  const [formId, setFormId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

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
        console.log('Mode produksi terdeteksi, akan redirect ke Mayar payment gateway');
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

            <p className="text-gray-600 mb-6 text-center">
              Silakan klik tombol di bawah untuk mencoba pembayaran lagi.
            </p>

            <div className="flex justify-center space-x-4">
              <a href="/" className="button button-secondary">
                Kembali ke Beranda
              </a>

              <button
                onClick={handleRetryPayment}
                disabled={isProcessing}
                className={`button ${isProcessing ? 'button-disabled' : 'button-primary'}`}
              >
                {isProcessing ? 'Memproses...' : 'Bayar Sekarang'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
