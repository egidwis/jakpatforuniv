import type { SurveyFormData } from '../types';
import { calculateTotalCost } from '../utils/cost-calculator';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { X, Check } from 'lucide-react';
import { Button } from './ui/button';

interface UnifiedHeaderProps {
    currentStep: number;
    formData: SurveyFormData;
    onReset?: () => void;
}

export function UnifiedHeader({ currentStep, formData, onReset }: UnifiedHeaderProps) {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const calculation = useMemo(() => calculateTotalCost(formData), [
        formData.questionCount,
        formData.duration,
        formData.winnerCount,
        formData.prizePerWinner,
        formData.voucherCode
    ]);

    const formatRupiah = (amount: number) => {
        return new Intl.NumberFormat('id-ID').format(amount);
    };

    const isAutoApprovalPath = !formData.isManualEntry && !formData.hasPersonalDataQuestions && formData.surveyUrl.includes('docs.google.com/forms') && formData.voucherCode?.toUpperCase() !== 'JFUFEB';

    // Skema step tanpa biodata: 1 Detail Survei, 2 Jadwal (auto-approval saja),
    // 3 Review & Pembayaran. Step 4 = Jadwal Kilat, ditampilkan sebagai step 3.
    const steps = isAutoApprovalPath ? [
        { number: 1, title: t('step1') },
        { number: 2, title: 'Jadwal' },
        { number: 3, title: 'Bayar' }
    ] : [
        { number: 1, title: t('step1') },
        { number: 3, title: 'Review' }
    ];

    const displayStep = currentStep === 4 ? 3 : currentStep;

    return (
        // Kartu floating di bawah layar (desktop & mobile) — wrapper fixed
        // pointer-events-none supaya area di kiri/kanan kartu tetap bisa
        // di-scroll/diklik; safe-area untuk home indicator iOS.
        <div className="fixed bottom-0 inset-x-0 z-30 pointer-events-none pb-[env(safe-area-inset-bottom)]">
            <div className="pointer-events-auto max-w-5xl mx-3 md:mx-6 xl:mx-auto mb-3 md:mb-4 rounded-2xl border border-jfu-primary/[0.12] bg-white/95 backdrop-blur shadow-[0_8px_30px_rgba(25,118,210,0.18)]">
                <div className="w-full px-4 md:px-6 py-3">
                    <div className="flex items-center justify-between">

                        {/* LEFT: Menu & Mini Stepper */}
                        <div className="flex items-center gap-2 md:gap-4">
                            {/* X = batalkan submission (dengan konfirmasi di handleReset):
                                draft dihapus dan user mulai dari awal. Tanpa onReset
                                (tidak terjadi saat ini) fallback pulang ke Order Saya. */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="mr-0 -ml-2 text-gray-500 hover:text-red-600 hover:bg-red-50"
                                onClick={() => (onReset ? onReset() : navigate('/dashboard'))}
                                title={t('cancelSubmission')}
                            >
                                <X className="w-5 h-5" />
                            </Button>

                            <div className="flex items-center gap-0.5 md:gap-1">
                                {steps.map((step, idx) => {
                                    const isCompleted = displayStep > step.number;
                                    const isActive = displayStep === step.number;

                                    return (
                                        <div key={step.number} className="flex items-center">
                                            {/* Line Connector (except first) */}
                                            {idx > 0 && (
                                                <div className={`w-3 md:w-8 h-0.5 mx-0.5 md:mx-2 rounded-full transition-colors duration-300 ${isCompleted || isActive ? 'bg-jfu-primary' : 'bg-gray-200'}`} />
                                            )}

                                            {/* Circle */}
                                            <div
                                                className={`
                        w-4 h-4 md:w-5 md:h-5 rounded-full flex items-center justify-center font-bold text-[10px] ring-2 md:ring-4 ring-white transition-all duration-300
                        ${isActive ? 'bg-jfu-primary text-white shadow-md scale-110' : ''}
                        ${isCompleted ? 'bg-jfu-primary text-white' : ''}
                        ${!isActive && !isCompleted ? 'bg-gray-100 border border-gray-200' : ''}
                      `}
                                            >
                                                {isCompleted && <Check className="w-2.5 h-2.5 md:w-3 md:h-3" />}
                                                {isActive && <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-white rounded-full" />}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Step Title Indicator */}
                            <div className="h-8 w-px bg-gray-200 mx-2 md:mx-4 hidden sm:block" />
                            <div className="hidden sm:flex flex-col">
                                <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Current Step</span>
                                <span className="text-sm font-bold text-gray-900 line-clamp-1 max-w-[100px] md:max-w-none">
                                    {currentStep === 4 ? 'JFU Kilat' : (steps.find(s => s.number === currentStep)?.title || 'Survey')}
                                </span>
                            </div>
                        </div>

                        {/* RIGHT: Cost — tombol "Batal" dihapus; membatalkan
                            submission kini lewat tombol X di kiri. */}
                        <div className="text-right">
                            <p className="text-[9px] md:text-[10px] text-gray-500 font-bold uppercase tracking-wider hidden sm:block">Estimated Cost</p>
                            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider sm:hidden">Cost</p>
                            <p className="text-sm md:text-lg font-bold text-jfu-primary">Rp{formatRupiah(calculation.totalCost)}</p>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
