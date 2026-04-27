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
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    console.log('PaymentStatus component - formId:', formId);
    
    if (formId) {
      fetchFormData(formId);
    } else {
      console.error('Form ID is missing in the URL parameters');
      setLoading(false);
      setError('ID form tidak ditemukan');
    }
  }, [formId]);

  const fetchFormData = async (id: string, isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    try {
      // Race antara request asli dan timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );

      const data = await Promise.race([
        getFormSubmissionById(id),
        timeoutPromise
      ]) as FormSubmission;

      if (!data) {
        setError('Data form tidak ditemukan');
        setLoading(false);
        if (isManualRefresh) setIsRefreshing(false);
        return;
      }

      setFormData(data);
      if (data.title && data.title.includes('OFFLINE MODE')) {
        console.log('Running in offline/simulation mode');
      }
    } catch (err: any) {
      console.error('Error fetching form data:', err);
      if (err.message && (err.message.includes('network') || err.message.includes('timeout'))) {
        setError(t('errorConnectionFailed'));
      } else if (err.code === 'PGRST116') {
        setError('Data form tidak ditemukan');
      } else {
        setError(`Terjadi kesalahan: ${err.message || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
      if (isManualRefresh) setIsRefreshing(false);
    }
  };

  const openWhatsApp = () => {
    const phoneNumber = '6287759153120'; 
    const message = formData ?
      `Halo, saya ingin menanyakan status pembayaran untuk survey "${formData.title}" dengan ID: ${formData.id}.` :
      'Halo, saya ingin menanyakan status pembayaran untuk akun saya.';

    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  if (loading && !isRefreshing) {
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

  // Cek apakah sudah dibayar murni dari database (bukan asumsi statis)
  const isPaid = formData.payment_status === 'paid' || formData.payment_status === 'completed';

  return (
    <div className="py-8 max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        {/* ICON DINAMIS */}
        {isPaid ? (
           <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
             <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
             </svg>
           </div>
        ) : (
           <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
             <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
             </svg>
           </div>
        )}

        <h1 className="text-2xl font-bold mb-4">
          {isPaid ? 'Pembayaran Berhasil / Lunas!' : 'Menunggu Pembayaran'}
        </h1>

        <div className="mb-6">
          <p className="text-lg mb-2">Halo, {formData.full_name || 'Pengguna'}!</p>
          {isPaid ? (
             <p className="text-gray-600">
               Survey "{formData.title}" Anda akan segera dipublikasikan ke responden Jakpat.
             </p>
          ) : (
             <p className="text-gray-600">
               Sistem kami sedang memantau pembayaran Anda untuk transaksi "{formData.title}". Jika Anda sudah membayar, status di bawah ini akan otomatis berubah menjadi Lunas dalam hitungan menit (bergantung pada verifikasi pihak Bank/DOKU).
             </p>
          )}
        </div>

        <div className="bg-gray-50 p-4 rounded-lg mb-6 text-left border border-gray-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3">
             <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isPaid ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                {isPaid ? 'PAID' : 'PENDING'}
             </span>
          </div>
          <h3 className="font-medium mb-2 pr-20">Detail Transaksi:</h3>
          <ul className="space-y-1 text-sm text-gray-600 relative z-10">
            <li><span className="font-medium">Form ID:</span> <span className="font-mono text-xs">{formData.id}</span></li>
            <li><span className="font-medium">Durasi:</span> {formData.duration} hari</li>
            <li><span className="font-medium">Total Tagihan:</span> Rp {new Intl.NumberFormat('id-ID').format(formData.total_cost)}</li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {!isPaid && (
            <button 
              onClick={() => fetchFormData(formId!, true)}
              disabled={isRefreshing}
              className="button bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 transition-colors flex items-center justify-center gap-2"
            >
              {isRefreshing ? (
                 <span className="animate-spin h-5 w-5 border-2 border-orange-500 border-t-transparent rounded-full" />
              ) : (
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              )}
              {isRefreshing ? 'Mengecek...' : 'Cek Status Sekarang'}
            </button>
          )}

          <a href="/dashboard/status" className="button button-primary">
            Lihat Dashboard
          </a>

          <button
            onClick={openWhatsApp}
            className="button button-secondary flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Hubungi Bantuan
          </button>
        </div>
      </div>
    </div>
  );
}
