import type { SurveyFormData } from '../types';
import { calculateTotalCost } from '../utils/cost-calculator';
import { formatRupiah } from '../utils/currency';
import { useIlkomunyBlocked } from '../hooks/useIlkomunyBlocked';
import { useMemo, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { X, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';

interface UnifiedHeaderProps {
    formData: SurveyFormData;
    onCancelConfirmed: () => void;
}

export function UnifiedHeader({ formData, onCancelConfirmed }: UnifiedHeaderProps) {
    const { t } = useLanguage();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);

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

    return (
        <>
        {/* Kartu floating di bawah layar (desktop & mobile) — wrapper fixed
            pointer-events-none supaya area di kiri/kanan kartu tetap bisa
            di-scroll/diklik; safe-area untuk home indicator iOS. */}
        <div className="fixed bottom-0 inset-x-0 z-30 pointer-events-none pb-[env(safe-area-inset-bottom)]">
            <div className="max-w-4xl mx-auto px-4 md:px-6">
                <div className="pointer-events-auto w-full mb-3 md:mb-4 rounded-2xl border border-jfu-primary/[0.12] bg-white/95 backdrop-blur shadow-[0_8px_30px_rgba(25,118,210,0.18)] transition-all">
                    <div className="w-full px-4 md:px-6 py-3">
                        <div className="flex items-center justify-between">

                            {/* LEFT: Kembali + judul produk statis. */}
                            <div className="flex items-center gap-2 md:gap-3">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="mr-0 -ml-2 text-gray-500 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => setIsCancelDialogOpen(true)}
                                    title="Batalkan Pesanan"
                                >
                                    <X className="w-5 h-5" />
                                </Button>

                                <span className="text-sm md:text-base font-bold text-gray-900">
                                    {t('productAdsTitle')}
                                </span>
                            </div>

                            {/* RIGHT: Cost (Clickable Accordion Toggle) */}
                            <button
                                type="button"
                                onClick={() => setIsExpanded(prev => !prev)}
                                className="group text-right focus:outline-none flex items-center gap-2 -mr-2 p-1.5 md:p-2 rounded-xl hover:bg-gray-100/60 transition-colors"
                            >
                                <div>
                                    <div className="flex items-center justify-end gap-1">
                                        <p className="text-[9px] md:text-[10px] text-gray-500 font-bold uppercase tracking-wider hidden sm:block">
                                            Estimated Cost
                                        </p>
                                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider sm:hidden">
                                            Cost
                                        </p>
                                    </div>
                                    <p className="text-sm md:text-lg font-bold text-jfu-primary">
                                        Rp{formatRupiah(calculation.totalCost)}
                                    </p>
                                </div>
                                <span className="w-6 h-6 rounded-full bg-blue-50 text-jfu-primary flex items-center justify-center group-hover:bg-blue-100 transition-colors shrink-0">
                                    {isExpanded ? (
                                        <ChevronDown className="w-4 h-4" />
                                    ) : (
                                        <ChevronUp className="w-4 h-4" />
                                    )}
                                </span>
                            </button>

                        </div>
                    </div>

                    {/* ACCORDION BREAKDOWN PANEL */}
                    {isExpanded && (
                        <div className="border-t border-gray-100 px-4 md:px-6 py-3.5 bg-slate-50/70 rounded-b-2xl text-xs md:text-sm space-y-2">
                            <div className="flex justify-between items-center text-gray-600">
                                <span>
                                    Biaya Iklan ({formData.duration || 1} hari, {formData.questionCount || 0} pertanyaan)
                                </span>
                                <span className="font-semibold tabular-nums text-gray-900">
                                    Rp{formatRupiah(calculation.adCost)}
                                </span>
                            </div>

                            <div className="flex justify-between items-center text-gray-600">
                                <span>
                                    Total Reward ({formData.winnerCount || 0} pemenang × Rp{formatRupiah(formData.prizePerWinner || 0)})
                                </span>
                                <span className="font-semibold tabular-nums text-gray-900">
                                    Rp{formatRupiah(calculation.incentiveCost)}
                                </span>
                            </div>

                            {calculation.discount > 0 && (
                                <div className="flex justify-between items-center text-emerald-600">
                                    <span>Diskon Voucher</span>
                                    <span className="font-semibold tabular-nums">
                                        -Rp{formatRupiah(calculation.discount)}
                                    </span>
                                </div>
                            )}

                            {calculation.kilatAddonCost > 0 && (
                                <div className="flex justify-between items-center text-amber-700">
                                    <span>Layanan JFU Kilat</span>
                                    <span className="font-semibold tabular-nums">
                                        Rp{formatRupiah(calculation.kilatAddonCost)}
                                    </span>
                                </div>
                            )}

                            <div className="flex justify-between items-center text-gray-600">
                                <span>Subtotal</span>
                                <span className="font-semibold tabular-nums text-gray-900">
                                    Rp{formatRupiah(calculation.subtotal)}
                                </span>
                            </div>

                            <div className="flex justify-between items-center text-gray-500">
                                <span>PPN (11%)</span>
                                <span className="font-semibold tabular-nums text-gray-700">
                                    Rp{formatRupiah(calculation.ppn)}
                                </span>
                            </div>

                            <div className="pt-2 border-t border-gray-200/80 flex justify-between items-center font-bold text-gray-900">
                                <span>Total Biaya Estimasi</span>
                                <span className="text-sm md:text-base text-jfu-primary tabular-nums">
                                    Rp{formatRupiah(calculation.totalCost)}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Dialog konfirmasi Cancel — sengaja DI LUAR wrapper pointer-events-none
            di atas, dengan alasan yang sama seperti StepSurveyDetails.tsx:
            elemen bertumpuk yang mewarisi pointer-events-none jadi tidak bisa
            diklik sama sekali. */}
        {isCancelDialogOpen && (
            <div className="modal-overlay">
                <div className="modal-dialog">
                    <div className="modal-header">
                        <AlertTriangle size={24} className="modal-icon-warning" />
                        <h3 className="modal-title">Batalkan Pesanan?</h3>
                    </div>
                    <div className="modal-body">
                        <p>
                            Semua data yang sudah Anda isi akan hilang dan tidak bisa dikembalikan. Yakin ingin membatalkan pesanan ini dan kembali ke halaman utama?
                        </p>
                    </div>
                    <div className="modal-footer">
                        <button
                            onClick={() => setIsCancelDialogOpen(false)}
                            className="modal-button modal-button-cancel"
                        >
                            Tidak, Lanjutkan Mengisi
                        </button>
                        <button
                            onClick={onCancelConfirmed}
                            className="modal-button modal-button-confirm"
                        >
                            Ya, Batalkan Pesanan
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
