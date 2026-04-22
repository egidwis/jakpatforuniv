import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFormSubmissionById, releaseExpiredSlot, prepareForReschedule } from '../utils/supabase';
import { createPayment } from '../utils/simple-payment';
import { toast } from 'sonner';
import { CreditCard, AlertTriangle, Clock, ArrowRight, RefreshCcw, CheckCircle } from 'lucide-react';
import type { FormSubmission } from '../utils/supabase';
import { useLanguage } from '../i18n/LanguageContext';

export function PaymentCheckoutPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [submission, setSubmission] = useState<FormSubmission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number>(3600); // 1 hour default
  const [isExpired, setIsExpired] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);

  useEffect(() => {
    loadSubmission();
  }, [submissionId]);

  const loadSubmission = async () => {
    if (!submissionId) return;
    setIsLoading(true);
    try {
      const data = await getFormSubmissionById(submissionId);
      if (!data) {
        toast.error('Data pengajuan tidak ditemukan');
        navigate('/dashboard');
        return;
      }

      setSubmission(data);

      if (data.payment_status === 'paid') {
        navigate('/dashboard/status?payment_status=paid');
        return;
      }

      if (data.slot_reserved_at) {
        const reservedAt = new Date(data.slot_reserved_at).getTime();
        const oneHourAfter = reservedAt + 3600 * 1000; // 1 hour (3,600,000 ms)
        const now = Date.now();

        if (now > oneHourAfter) {
          handleExpired(data.id);
        } else {
          setTimeLeft(Math.floor((oneHourAfter - now) / 1000));
          setIsExpired(false);
        }
      } else {
        handleExpired(data.id);
      }
    } catch (error) {
      console.error('Failed to load submission:', error);
      toast.error('Gagal memuat data pembayaran');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExpired = async (id: string) => {
    setIsExpired(true);
    setTimeLeft(0);
    try {
      await releaseExpiredSlot(id);
    } catch (e) {
      console.error('Failed to release expired slot:', e);
    }
  };

  // Timer countdown
  useEffect(() => {
    if (isLoading || isExpired || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          if (submission) handleExpired(submission.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLoading, isExpired, timeLeft, submission]);

  // Polling for payment status (in case they pay in new tab)
  useEffect(() => {
    if (isExpired || !submissionId || isLoading) return;

    const poll = setInterval(async () => {
      try {
        const data = await getFormSubmissionById(submissionId);
        if (data && data.payment_status === 'paid') {
          clearInterval(poll);
          navigate('/dashboard/status?payment_status=paid');
        }
      } catch (e) {
        // silent
      }
    }, 5000);

    return () => clearInterval(poll);
  }, [isExpired, submissionId, isLoading, navigate]);

  const handleProceedPayment = async () => {
    if (!submission || isExpired) return;
    setIsProcessingPayment(true);

    try {
      const reservedAt = new Date(submission.slot_reserved_at!).getTime();
      const expirationDate = new Date(reservedAt + 60 * 60 * 1000);

      const paymentUrl = await createPayment({
        formSubmissionId: submission.id,
        amount: submission.total_cost || 0,
        customerInfo: {
          title: submission.title || 'Survey',
          fullName: submission.full_name || 'Pengguna',
          email: submission.email || 'user@example.com',
          phoneNumber: submission.phone_number || '-'
        },
        expiredAt: expirationDate.toISOString()
      });

      // Open in new tab so this page stays alive for status checking
      window.open(paymentUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
      toast.error(t('checkoutPaymentError'));
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleCheckPayment = async () => {
    if (!submissionId) return;
    setIsCheckingPayment(true);
    try {
      const data = await getFormSubmissionById(submissionId);
      if (data && data.payment_status === 'paid') {
        toast.success(t('checkoutPaidSuccess'));
        setTimeout(() => navigate('/dashboard/status?payment_status=paid'), 1000);
      } else {
        toast.info(t('checkoutNotPaidYet'));
      }
    } catch (e) {
      toast.error(t('checkoutCheckError'));
    } finally {
      setIsCheckingPayment(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="pt-24 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!submission) return null;

  return (
    <div className="pt-24 min-h-screen bg-gray-50/50 pb-12">
      <div className="max-w-xl mx-auto px-6">

        {/* Expired State */}
        {isExpired ? (
          <div className="bg-red-50 rounded-2xl border border-red-100 p-8 text-center animate-in zoom-in-95 duration-500 shadow-sm">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-bold text-red-900 mb-2">{t('checkoutExpiredTitle')}</h2>
            <p className="text-sm text-red-700 leading-relaxed max-w-md mx-auto mb-8">
              {t('checkoutExpiredDesc')} (<strong>{submission.start_date?.split('T')[0]}</strong>)
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate('/dashboard/status')}
                className="px-6 py-3 bg-white text-gray-700 border border-gray-300 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                {t('checkoutBackDashboard')}
              </button>
              <button
                onClick={async () => {
                  if (!submission) return;
                  
                  // Show loading toast
                  const loadingToast = toast.loading('Mempersiapkan jadwal ulang...');
                  
                  try {
                    // Prepare submission for reschedule
                    await prepareForReschedule(submission.id);
                    
                    const recoveredData = {
                      surveyUrl: submission.survey_url || '',
                      title: submission.title || '',
                      description: submission.description || '',
                      questionCount: submission.question_count || 0,
                      criteriaResponden: submission.criteria_responden || '',
                      duration: submission.duration || 1,
                      startDate: '',
                      endDate: '',
                      fullName: submission.full_name || '',
                      email: submission.email || '',
                      phoneNumber: submission.phone_number || '',
                      university: submission.university || '',
                      department: submission.department || '',
                      status: submission.status || '',
                      referralSource: submission.referral_source && submission.referral_source.startsWith('Lainnya: ') ? 'Lainnya' : (submission.referral_source || ''),
                      referralSourceOther: submission.referral_source && submission.referral_source.startsWith('Lainnya: ') ? submission.referral_source.replace('Lainnya: ', '') : '',
                      winnerCount: submission.winner_count || 0,
                      prizePerWinner: submission.prize_per_winner || 0,
                      voucherCode: submission.voucher_code || '',
                      detectedKeywords: submission.detected_keywords || [],
                      isManualEntry: submission.submission_method === 'manual',
                      isReschedule: true,
                      submissionIdToReplace: submission.id,
                    };
                    localStorage.setItem('survey_form_draft', JSON.stringify({
                      formData: recoveredData,
                      currentStep: 3
                    }));
                    
                    toast.dismiss(loadingToast);
                    toast.success('Silakan pilih slot baru untuk jadwal ulang');
                    navigate('/dashboard/submit');
                  } catch (error) {
                    console.error('Error preparing for reschedule:', error);
                    toast.dismiss(loadingToast);
                    toast.error('Gagal mempersiapkan jadwal ulang. Silakan coba lagi.');
                  }
                }}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-md flex justify-center items-center gap-2"
              >
                <RefreshCcw size={18} />
                {t('checkoutPickAgain')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('checkoutTitle')}</h1>
              <p className="text-gray-500 text-sm max-w-md mx-auto">
                {t('checkoutSubtitle')}
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
              {/* Timer Banner */}
              <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 opacity-80" />
                  <span className="font-medium text-sm">{t('checkoutTimerLabel')}</span>
                </div>
                <div className="text-2xl font-mono font-bold tracking-wider bg-black/20 px-3 py-1 rounded-lg shadow-inner">
                  {formatTime(timeLeft)}
                </div>
              </div>

              <div className="p-6 md:p-8 space-y-4">
                {/* Summary */}
                <div className="space-y-4 bg-gray-50 p-5 rounded-xl border border-gray-100">
                  <div className="flex justify-between items-start pb-4 border-b border-gray-200 border-dashed">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">{submission.title}</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {t('checkoutSchedule')}: {submission.start_date ? new Date(submission.start_date).toLocaleDateString('id-ID') : '-'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block mb-0.5">{t('checkoutTotalLabel')}</span>
                      <span className="text-lg font-bold text-blue-600">Rp {new Intl.NumberFormat('id-ID').format(submission.total_cost || 0)}</span>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 leading-relaxed text-center">
                    {t('checkoutPaymentInfo')}
                  </p>
                </div>

                {/* Pay Now — opens Mayar in new tab */}
                <button
                  onClick={handleProceedPayment}
                  disabled={isProcessingPayment}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  {isProcessingPayment ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      {t('checkoutProcessing')}
                    </>
                  ) : (
                    <>
                      <CreditCard size={20} />
                      {t('checkoutPayNow')}
                      <ArrowRight size={20} className="ml-1 opacity-80" />
                    </>
                  )}
                </button>

                {/* Manual check payment status */}
                <button
                  onClick={handleCheckPayment}
                  disabled={isCheckingPayment}
                  className="w-full py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isCheckingPayment ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
                      {t('checkoutCheckingStatus')}
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} className="text-gray-400" />
                      {t('checkoutAlreadyPaid')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
