import { useEffect, useState } from 'react';
import { getFormSubmissionById, FormSubmission } from '../utils/supabase';
import { ErrorPage } from './ErrorPage';

interface PaymentFailedProps {
  formId?: string;
}

export function PaymentFailed({ formId }: PaymentFailedProps) {
  const [formData, setFormData] = useState<FormSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  if (error) {
    return (
      <ErrorPage
        title="Terjadi Kesalahan"
        message={error}
        referenceId={formId}
        onRetry={formId ? () => fetchFormData(formId) : undefined}
      />
    );
  }

  return (
    <div className="py-8 max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </div>

        <h1 className="text-2xl font-bold mb-4">Pembayaran Gagal</h1>

        <div className="mb-6">
          <p className="text-lg mb-2">Maaf, pembayaran Anda tidak berhasil.</p>
          <p className="text-gray-600">
            {formData ? `Survey "${formData.title}" belum dapat diproses.` : 'Survey Anda belum dapat diproses.'}
          </p>
        </div>

        {formData && (
          <div className="bg-gray-50 p-4 rounded-lg mb-6 text-left">
            <h3 className="font-medium mb-2">Detail Survey:</h3>
            <ul className="space-y-1 text-sm text-gray-600">
              <li><span className="font-medium">Judul:</span> {formData.title}</li>
              <li><span className="font-medium">Durasi:</span> {formData.duration} hari</li>
              <li><span className="font-medium">Total Biaya:</span> Rp {new Intl.NumberFormat('id-ID').format(formData.total_cost)}</li>
            </ul>
          </div>
        )}

        <div className="space-y-4">
          <a href="/" className="button button-secondary">
            Kembali ke Beranda
          </a>

          <a href={`/payment-retry?id=${formId}`} className="button button-primary ml-4">
            Coba Bayar Lagi
          </a>
        </div>
      </div>
    </div>
  );
}
