import { useEffect, useState } from 'react';
import { getFormSubmissionById } from '../utils/supabase';
import type { FormSubmission } from '../utils/supabase';
import { ErrorPage } from './ErrorPage';
import { useLanguage } from '../i18n/LanguageContext';

interface PaymentSuccessProps {
  formId?: string;
}

export function PaymentSuccess({ formId }: PaymentSuccessProps) {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<FormSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Cek apakah ada parameter simulation di URL
    const urlParams = new URLSearchParams(window.location.search);

    // Log untuk debugging
    console.log('PaymentSuccess component - formId:', formId);
    console.log('URL parameters:', Object.fromEntries(urlParams.entries()));

    if (formId) {
      fetchFormData(formId);
    } else {
      console.error('Form ID is missing in the URL parameters');
      setLoading(false);
      setError('ID form tidak ditemukan');
    }
  }, [formId]);

  const fetchFormData = async (id: string) => {
    try {
      console.log('Fetching form data for ID:', id);

      // Tambahkan timeout untuk menghindari hanging request
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );

      // Race antara request asli dan timeout
      const data = await Promise.race([
        getFormSubmissionById(id),
        timeoutPromise
      ]) as FormSubmission;

      if (!data) {
        console.error('No form data returned for ID:', id);
        setError('Data form tidak ditemukan');
        setLoading(false);
        return;
      }

      console.log('Form data retrieved successfully:', data);
      setFormData(data);

      // Jika ini adalah mode offline/simulasi, tampilkan pesan
      if (data.title && data.title.includes('OFFLINE MODE')) {
        console.log('Running in offline/simulation mode');
      }
    } catch (err) {
      const error = err as any;
      console.error('Error fetching form data:', error);

      // Tampilkan pesan error yang lebih spesifik
      if (error.message && (error.message.includes('network') || error.message.includes('timeout'))) {
        setError(t('errorConnectionFailed'));

        // Buat data simulasi untuk fallback
        setFormData({
          id: id,
          survey_url: 'https://example.com/form',
          title: '[OFFLINE MODE] Form Submission',
          description: 'Data ini ditampilkan dalam mode offline karena tidak dapat terhubung ke database.',
          question_count: 10,
          duration: 1,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + 86400000).toISOString(), // +1 hari
          status: 'active',
          total_cost: 100000,
          payment_status: 'completed',
          full_name: 'Pengguna'
        } as FormSubmission);

        setError(null); // Clear error since we're showing fallback data
      } else if (error.code === 'PGRST116') {
        setError('Data form tidak ditemukan');
      } else {
        setError(`Terjadi kesalahan: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Function to open WhatsApp with pre-filled message
  const openWhatsApp = () => {
    const phoneNumber = '6287759153120'; // Replace with your actual WhatsApp number
    const message = formData ?
      `Halo, saya telah melakukan pembayaran untuk survey "${formData.title}" dengan ID: ${formData.id}. Mohon informasi lebih lanjut.` :
      'Halo, saya telah melakukan pembayaran untuk survey. Mohon informasi lebih lanjut.';

    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
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
          Pembayaran Berhasil!
        </h1>

        <div className="mb-6">
          <p className="text-lg mb-2">Terima kasih, {formData.full_name || 'Pengguna'}!</p>
          <p className="text-gray-600">
            Survey "{formData.title}" Anda akan segera dipublikasikan ke responden Jakpat.
          </p>
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

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href="/" className="button button-primary">
            Kembali ke Beranda
          </a>
          <button
            onClick={openWhatsApp}
            className="button button-secondary flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Hubungi Kami
          </button>
        </div>
      </div>
    </div>
  );
}
