import type { SurveyFormData } from '../types';
import { calculateTotalCost } from '../utils/cost-calculator';
import { useIlkomunyBlocked } from '../hooks/useIlkomunyBlocked';
import { useMemo } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';

interface UnifiedHeaderProps {
    formData: SurveyFormData;
    onBack?: () => void;
}

export function UnifiedHeader({ formData, onBack }: UnifiedHeaderProps) {
    const { t } = useLanguage();
    // ILKOMUNY yang sudah dipakai akun ini → jangan tampilkan harga diskon.
    const ilkomunyBlocked = useIlkomunyBlocked(formData.voucherCode);
    const calculation = useMemo(
        () => calculateTotalCost(ilkomunyBlocked ? { ...formData, voucherCode: '' } : formData),
        [
            formData.questionCount,
            formData.duration,
            formData.winnerCount,
            formData.prizePerWinner,
            formData.voucherCode,
            ilkomunyBlocked
        ]
    );

    const formatRupiah = (amount: number) => {
        return new Intl.NumberFormat('id-ID').format(amount);
    };

    return (
        // Kartu floating di bawah layar (desktop & mobile) — wrapper fixed
        // pointer-events-none supaya area di kiri/kanan kartu tetap bisa
        // di-scroll/diklik; safe-area untuk home indicator iOS.
        <div className="fixed bottom-0 inset-x-0 z-30 pointer-events-none pb-[env(safe-area-inset-bottom)]">
            <div className="pointer-events-auto max-w-5xl mx-3 md:mx-6 xl:mx-auto mb-3 md:mb-4 rounded-2xl border border-jfu-primary/[0.12] bg-white/95 backdrop-blur shadow-[0_8px_30px_rgba(25,118,210,0.18)]">
                <div className="w-full px-4 md:px-6 py-3">
                    <div className="flex items-center justify-between">

                        {/* LEFT: Kembali + judul produk statis. Handler yang tepat untuk
                            step aktif (sub-state pilih-metode, step sebelumnya, atau undo
                            Kilat) sudah dihitung oleh pemanggil (MultiStepForm). */}
                        <div className="flex items-center gap-2 md:gap-3">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="mr-0 -ml-2 text-gray-500 hover:text-jfu-primary hover:bg-jfu-primary/5"
                                onClick={() => onBack?.()}
                                title={t('backButton')}
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Button>

                            <span className="text-sm md:text-base font-bold text-gray-900">
                                {t('productAdsTitle')}
                            </span>
                        </div>

                        {/* RIGHT: Cost */}
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
