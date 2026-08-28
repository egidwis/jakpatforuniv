import type { SurveyFormData } from '../types';
import { calculateTotalCost } from '../utils/cost-calculator';
import { formatRupiah } from '../utils/currency';
import { useIlkomunyBlocked } from '../hooks/useIlkomunyBlocked';
import { useMemo, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { X, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

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
        {/* Full-Width Bottom Bar (Gaya Stripe Checkout / Airbnb) — menempel di paling bawah layar */}
        <div className="fixed bottom-0 inset-x-0 z-40 w-full border-t border-slate-200/90 bg-white/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.04),0_-1px_2px_rgba(0,0,0,0.02)] pb-[env(safe-area-inset-bottom)] transition-all">
            <div className="relative max-w-5xl mx-auto h-14 md:h-16 px-4 md:px-6 flex items-center justify-between">

                {/* POPUP CARD RINCIAN BIAYA (Melayang rapi dan intim di atas tombol biaya) */}
                {isExpanded && (
                    <>
                        {/* Backdrop click to close */}
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => setIsExpanded(false)}
                            aria-hidden="true"
                        />

                        <div className="absolute bottom-full right-4 sm:right-6 mb-3 z-50 w-[calc(100vw-2rem)] max-w-sm sm:w-96 rounded-2xl border border-slate-200/80 bg-white/90 backdrop-blur-md shadow-[0_12px_40px_rgba(0,0,0,0.14),0_2px_10px_rgba(0,0,0,0.04)] p-4 text-xs md:text-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
                                <span className="font-bold text-slate-900 text-xs sm:text-sm">Rincian Estimasi Biaya</span>
                                <button
                                    type="button"
                                    onClick={() => setIsExpanded(false)}
                                    className="text-slate-400 hover:text-slate-600 p-0.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                                    aria-label="Tutup Rincian"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-slate-600">
                                    <span className="truncate pr-2">
                                        Biaya Iklan ({formData.duration || 1} hari, {formData.questionCount || 0} pertanyaan)
                                    </span>
                                    <span className="font-semibold tabular-nums text-slate-900 shrink-0">
                                        Rp{formatRupiah(calculation.adCost)}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center text-slate-600">
                                    <span className="truncate pr-2">
                                        Total Reward ({formData.winnerCount || 0} pemenang × Rp{formatRupiah(formData.prizePerWinner || 0)})
                                    </span>
                                    <span className="font-semibold tabular-nums text-slate-900 shrink-0">
                                        Rp{formatRupiah(calculation.incentiveCost)}
                                    </span>
                                </div>

                                {calculation.discount > 0 && (
                                    <div className="flex justify-between items-center text-emerald-600">
                                        <span>Diskon Voucher</span>
                                        <span className="font-semibold tabular-nums shrink-0">
                                            -Rp{formatRupiah(calculation.discount)}
                                        </span>
                                    </div>
                                )}

                                {calculation.kilatAddonCost > 0 && (
                                    <div className="flex justify-between items-center text-amber-700">
                                        <span>Layanan JFU Kilat</span>
                                        <span className="font-semibold tabular-nums shrink-0">
                                            Rp{formatRupiah(calculation.kilatAddonCost)}
                                        </span>
                                    </div>
                                )}

                                <div className="flex justify-between items-center text-slate-500 pt-1 border-t border-slate-100">
                                    <span>Subtotal</span>
                                    <span className="font-semibold tabular-nums text-slate-800 shrink-0">
                                        Rp{formatRupiah(calculation.subtotal)}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center text-slate-500">
                                    <span>PPN (11%)</span>
                                    <span className="font-semibold tabular-nums text-slate-700 shrink-0">
                                        Rp{formatRupiah(calculation.ppn)}
                                    </span>
                                </div>

                                <div className="pt-2 border-t border-slate-200/90 flex justify-between items-center font-bold text-slate-900">
                                    <span>Total Biaya Estimasi</span>
                                    <span className="text-sm md:text-base text-jfu-primary tabular-nums shrink-0">
                                        Rp{formatRupiah(calculation.totalCost)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                <div className="flex items-center justify-between w-full">

                    {/* LEFT: Kembali + judul produk statis. */}
                    <div className="flex items-center gap-2.5 md:gap-3">
                        <button
                            type="button"
                            onClick={() => setIsCancelDialogOpen(true)}
                            className="w-8 h-8 rounded-xl bg-slate-100/90 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200/90 hover:border-rose-200 flex items-center justify-center transition-all duration-150 cursor-pointer shrink-0 shadow-2xs"
                            title="Batalkan Pesanan"
                            aria-label="Batalkan Pesanan"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <span className="text-sm md:text-base font-bold text-gray-900">
                            {t('productAdsTitle')}
                        </span>
                    </div>

                    {/* RIGHT: Cost (Clickable Accordion Toggle) */}
                    <button
                        type="button"
                        onClick={() => setIsExpanded(prev => !prev)}
                        className="group text-right focus:outline-none flex items-center gap-2.5 -mr-1 p-1 md:p-1.5 rounded-xl hover:bg-slate-100/70 transition-colors cursor-pointer"
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
                            <p className="text-sm md:text-lg font-bold text-jfu-primary leading-tight">
                                Rp{formatRupiah(calculation.totalCost)}
                            </p>
                        </div>
                        <span className="w-8 h-8 rounded-xl bg-blue-50/80 text-jfu-primary border border-blue-100/90 group-hover:bg-blue-100/90 group-hover:border-blue-200 flex items-center justify-center transition-all shrink-0 shadow-2xs">
                            {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronUp className="w-4 h-4" />
                            )}
                        </span>
                    </button>

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
