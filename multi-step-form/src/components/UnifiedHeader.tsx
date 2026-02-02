import type { SurveyFormData } from '../types';
import { calculateTotalCost } from '../utils/cost-calculator';
import { useMemo } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { Menu, Check } from 'lucide-react';
import { Button } from './ui/button';

interface UnifiedHeaderProps {
    currentStep: number;
    formData: SurveyFormData;
    onToggleSidebar: () => void;
    onReset?: () => void;
}

export function UnifiedHeader({ currentStep, formData, onToggleSidebar, onReset }: UnifiedHeaderProps) {
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

    const steps = [
        { number: 1, title: t('step1') },
        { number: 2, title: t('step2') },
        { number: 3, title: t('step3') },
        { number: 4, title: t('step4') }
    ];

    return (
        <div className="fixed top-4 right-4 left-4 md:left-[17rem] md:right-8 z-40">
            <div className="backdrop-blur-md bg-white/80 border border-gray-100 shadow-sm rounded-2xl transition-all duration-200">
                <div className="w-full max-w-5xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">

                        {/* LEFT: Menu & Mini Stepper */}
                        <div className="flex items-center gap-4">
                            {/* Hamburger Menu (Mobile Only) */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="md:hidden mr-2 -ml-2"
                                onClick={onToggleSidebar}
                            >
                                <Menu className="w-6 h-6 text-gray-700" />
                            </Button>

                            <div className="flex items-center gap-1">
                                {steps.map((step, idx) => {
                                    const isCompleted = currentStep > step.number;
                                    const isActive = currentStep === step.number;

                                    return (
                                        <div key={step.number} className="flex items-center">
                                            {/* Line Connector (except first) */}
                                            {idx > 0 && (
                                                <div className={`w-8 h-0.5 mx-2 rounded-full transition-colors duration-300`} style={{ backgroundColor: isCompleted || isActive ? '#0091ff' : '#e5e7eb' }} />
                                            )}

                                            {/* Circle */}
                                            <div
                                                className={`
                        w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ring-4 ring-white transition-all duration-300
                        ${isActive ? 'text-white shadow-md scale-110' : ''}
                        ${isCompleted ? 'text-white' : ''}
                        ${!isActive && !isCompleted ? 'bg-gray-100 text-gray-400 border border-gray-200' : ''}
                      `}
                                                style={isActive || isCompleted ? { backgroundColor: '#0091ff' } : {}}
                                            >
                                                {isCompleted ? <Check className="w-4 h-4" /> : step.number}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Step Title Indicator */}
                            <div className="h-8 w-px bg-gray-200 mx-4 hidden md:block" />
                            <div className="hidden md:flex flex-col">
                                <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Current Step</span>
                                <span className="text-sm font-bold text-gray-900">{steps[currentStep - 1]?.title || 'Survey'}</span>
                            </div>
                        </div>

                        {/* RIGHT: Cost & Info */}
                        <div className="flex items-center gap-6">
                            <div className="text-right">
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Estimated Cost</p>
                                <p className="text-lg font-bold" style={{ color: '#0091ff' }}>Rp{formatRupiah(calculation.totalCost)}</p>
                            </div>

                            {onReset && (
                                <div className="border-l border-gray-200 pl-6 hidden md:block">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={onReset}
                                        className="text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
                                    >
                                        {t('cancelSubmission')}
                                    </Button>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
