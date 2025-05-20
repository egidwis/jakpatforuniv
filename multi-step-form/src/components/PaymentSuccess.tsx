import { useEffect, useState } from 'react';
import { getFormSubmissionById, FormSubmission } from '../utils/supabase';
import { ErrorPage } from './ErrorPage';

interface PaymentSuccessProps {
  formId?: string;
  isSimulation?: boolean;
}

export function PaymentSuccess({ formId, isSimulation = false }: PaymentSuccessProps) {
  const [formData, setFormData] = useState<FormSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSimulatedPayment, setIsSimulatedPayment] = useState(isSimulation);

  useEffect(() => {
    // Cek apakah ada parameter simulation di URL
    const urlParams = new URLSearchParams(window.location.search);
    const simulationParam = urlParams.get('simulation');
    if (simulationParam === 'true') {
      setIsSimulatedPayment(true);
    }

    if (formId) {
      fetchFormData(formId);
    } else {
      setLoading(false);
      setError('ID form tidak ditemukan');
    }
  }, [formId]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error || !formData) {
    return (
      <ErrorPage
        title="Terjadi Kesalahan"
        message={error || 'Data tidak ditemukan'}
        referenceId={formId}
        onRetry={formId ? () => fetchFormData(formId) : undefined}
      />
    );
  }

  return (
    <div className="py-8 max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>

        <h1 className="text-2xl font-bold mb-4">
          {isSimulatedPayment ? 'Simulasi Pembayaran Berhasil!' : 'Pembayaran Berhasil!'}
        </h1>

        <div className="mb-6">
          <p className="text-lg mb-2">Terima kasih, {formData.full_name || 'Pengguna'}!</p>
          <p className="text-gray-600">
            Survey "{formData.title}" Anda akan segera dipublikasikan ke responden Jakpat.
          </p>
          {isSimulatedPayment && (
            <div className="mt-2 p-2 bg-blue-50 text-blue-700 rounded-md text-sm">
              <p><strong>Catatan:</strong> Ini adalah simulasi pembayaran. Dalam produksi, Anda akan diarahkan ke gateway pembayaran Mayar.</p>
            </div>
          )}
        </div>

        <div className="bg-gray-50 p-4 rounded-lg mb-6 text-left">
          <h3 className="font-medium mb-2">Detail Survey:</h3>
          <ul className="space-y-1 text-sm text-gray-600">
            <li><span className="font-medium">Judul:</span> {formData.title}</li>
            <li><span className="font-medium">Durasi:</span> {formData.duration} hari</li>
            <li><span className="font-medium">Tanggal:</span> {formData.start_date} - {formData.end_date}</li>
            <li><span className="font-medium">Total Biaya:</span> Rp {new Intl.NumberFormat('id-ID').format(formData.total_cost)}</li>
          </ul>
        </div>

        <p className="text-sm text-gray-500 mb-6">
          Email konfirmasi telah dikirim ke alamat email Anda.
        </p>

        <a href="/" className="button button-primary">
          Kembali ke Beranda
        </a>
      </div>
    </div>
  );
}
