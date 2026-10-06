import React, { useState } from 'react';
import {
  Zap,
  ShieldCheck,
  Info,
  CheckCircle2,
  CreditCard,
  ChevronDown,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import type { SurveyFormData, CostCalculation } from '../../types';
import { calculateTotalCost } from '../../utils/cost-calculator';
import { formatIDR } from '../../utils/currency';
import { orderMoneyLines } from '../../utils/orderMoneyLines';
import { CostBreakdown } from '../CostBreakdown';
import { RateTable } from '../RateNotice';
import { isAutoApprovalPath } from '../../utils/review-path';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

export interface OrderLiveCompanionProps {
  formData: SurveyFormData;
  step?: 1 | 2;
  costCalculation?: CostCalculation;
  voucherSlot?: React.ReactNode;
  onCancelOrder?: () => void;
  /** Belum ada isian konfigurasi. Jangan menagih hadiah bawaan. */
  quotePending?: boolean;
}


const getTierIndex = (count: number | undefined) => {
  if (!count || count <= 0) return -1;
  if (count <= 15) return 0;
  if (count <= 30) return 1;
  if (count <= 50) return 2;
  if (count <= 70) return 3;
  return 4;
};

export const OrderLiveCompanion: React.FC<OrderLiveCompanionProps> = ({
  formData,
  step = 1,
  costCalculation,
  voucherSlot,
  onCancelOrder,
  quotePending = false,
}) => {
  const { t } = useLanguage();
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isRateTooltipOpen, setIsRateTooltipOpen] = useState(false);

  const isAuto = isAutoApprovalPath(formData);
  // Order baru: instan tarif = sekarang (sama dengan `created_at` yang
  // dipaksakan sql/103 saat INSERT).
  const quotedForm = quotePending
    ? { ...formData, questionCount: 0, winnerCount: 0, prizePerWinner: 0, voucherCode: '' }
    : formData;
  const defaultCost = calculateTotalCost(quotedForm, Date.now());
  const cost = costCalculation || defaultCost;
  const activeTierIndex = getTierIndex(formData.questionCount);

  const getTierLabel = (count: number) => {
    const qSuffix = t('questionUnit') || 'Soal';
    if (!count || count <= 0) return t('notSpecified') || 'Belum ditentukan';
    if (count <= 15) return `≤ 15 ${qSuffix}`;
    if (count <= 30) return `16–30 ${qSuffix}`;
    if (count <= 50) return `31–50 ${qSuffix}`;
    if (count <= 70) return `51–70 ${qSuffix}`;
    return `> 70 ${qSuffix}`;
  };

  return (
    <>
      {/* ================= KARTU TUNGGAL ORDER COMPANION ================= */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_4px_20px_-2px_rgba(24,124,255,0.06),0_12px_32px_-4px_rgba(0,0,0,0.04)] overflow-hidden transition-all duration-200">
        {/* ================= BAR SATU BARIS UNTUK MOBILE (< lg) ================= */}
        <div
          onClick={() => setIsMobileExpanded((prev) => !prev)}
          className="lg:hidden p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer select-none bg-gradient-to-r from-blue-50/40 via-white to-slate-50/60 hover:bg-slate-50 transition-colors"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsMobileExpanded((prev) => !prev);
            }
          }}
          aria-expanded={isMobileExpanded}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-100/80 text-jfu-primary flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4 text-jfu-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-slate-500">
                  {step === 2 ? t('checkoutTotalLabel') : t('orderCompanionEstimate')}
                </span>
                <span className="text-sm font-bold text-slate-900 font-mono">
                  {cost.totalCost > 0 ? formatIDR(cost.totalCost) : 'Rp 0'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span>{formData.duration} {t('days')}</span>
                {step !== 1 && (
                  <>
                    <span>•</span>
                    <span
                      className={
                        isAuto ? 'text-emerald-700 font-semibold' : 'text-blue-700 font-semibold'
                      }
                    >
                      {isAuto ? '⚡ Auto-Approval' : t('reviewPathManualShort')}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-jfu-primary shrink-0 bg-blue-50/80 hover:bg-blue-100/70 px-2.5 py-1.5 rounded-lg border border-blue-100 transition-colors">
            <span>{isMobileExpanded ? t('orderCompanionClose') : t('orderCompanionDetails')}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${isMobileExpanded ? 'rotate-180' : ''
                }`}
            />
          </div>
        </div>

        {/* ================= KONTEN DETAIL (MOBILE EXPANDED + SELALU TAMPIL DI DESKTOP) ================= */}
        <div className={`${isMobileExpanded ? 'block' : 'hidden'} lg:block`}>
          {step !== 1 && (
          <div className="p-4 sm:p-5 border-b border-slate-100">
            <div
              className={`rounded-xl border p-3.5 sm:p-4 transition-all ${isAuto
                  ? 'border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/40'
                  : 'border-blue-200/80 bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/40'
                }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs mt-0.5 ${isAuto
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200/80'
                      : 'bg-blue-100 text-jfu-primary border border-blue-200/80'
                    }`}
                >
                  {isAuto ? (
                    <Zap className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-jfu-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                    {isAuto ? t('reviewPathAutoTitle') : t('reviewPathManualTitle')}
                  </span>

                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    {isAuto
                      ? t('reviewPathAutoDesc')
                      : formData.hasPersonalDataQuestions
                        ? t('reviewPathManualSensitiveDesc')
                        : t('reviewPathManualDefaultDesc')}
                  </p>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* 2. SEKSI TIPS DENGAN BOX HIJAU (URUTAN 2) */}
          <div className="p-4 sm:p-5 border-b border-slate-100">
            <div className="rounded-xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/70 via-emerald-50/30 to-white p-3.5 sm:p-4 shadow-2xs">
              <h5 className="mb-3 text-sm font-semibold text-slate-900 leading-snug">
                {step === 1 ? t('checklistReadinessTitle') : t('tipsVerificationTitle')}
              </h5>

              {step === 1 ? (
                <ul className="space-y-2.5 text-xs text-slate-600 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong className="font-semibold text-slate-800">{t('tipOpenAccessTitle')}</strong> {t('tipOpenAccessDesc')}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong className="font-semibold text-slate-800">{t('tipPrivacyEthicsTitle')}</strong> {t('tipPrivacyEthicsDesc')}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong className="font-semibold text-slate-800">{t('tipGeneralAudienceTitle')}</strong> {t('tipGeneralAudienceDesc')}
                    </span>
                  </li>
                </ul>
              ) : (
                <ul className="space-y-2.5 text-xs text-slate-600 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong className="font-semibold text-slate-800">{t('tipInvoiceContactTitle')}</strong> {t('tipInvoiceContactDesc')}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong className="font-semibold text-slate-800">{t('tipSlotCertaintyTitle')}</strong>{' '}
                      {isAuto ? t('tipSlotCertaintyAuto') : t('tipSlotCertaintyManual')}
                    </span>
                  </li>
                </ul>
              )}
            </div>
          </div>

          {/* VOUCHER SLOT KHUSUS STEP 2 (JIKA TERSEDIA) */}
          {voucherSlot && (
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/30">
              {voucherSlot}
            </div>
          )}

          {/* 3. SEKSI ESTIMASI / RINCIAN BIAYA (URUTAN 3) */}
          <div className={`p-4 sm:p-5 space-y-3.5 ${onCancelOrder ? 'border-b border-slate-100' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                {step === 2 ? t('totalPayment') : t('orderCompanionCostEstimate')}
              </span>
              <TooltipProvider delayDuration={150}>
                <Tooltip open={isRateTooltipOpen} onOpenChange={setIsRateTooltipOpen}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsRateTooltipOpen((prev) => !prev);
                      }}
                      className="group inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-blue-700 transition-colors cursor-pointer select-none"
                    >
                      <span className="border-b border-dashed border-slate-300 group-hover:border-blue-500">
                        {t('orderCompanionCategory')}: {getTierLabel(formData.questionCount)}
                      </span>
                      <Info className="w-3 h-3 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    align="end"
                    sideOffset={6}
                    className="w-[min(22rem,calc(100vw-2rem))] p-3.5 !bg-white !text-slate-800 border border-slate-200/90 shadow-xl rounded-xl z-50 animate-in fade-in zoom-in-95 space-y-2.5 pointer-events-auto"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div>
                        <h6 className="text-xs font-bold text-slate-900">{t('rateTableTooltipTitle')}</h6>
                        <p className="text-[10px] text-slate-500">{t('rateTableTooltipSubtitle')}</p>
                      </div>
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                        {t('rateTablePerDay')}
                      </span>
                    </div>

                    {/* Tabel yang SAMA dengan pengumuman tarif di modal pintu masuk —
                        dibaca dari AD_RATE_SCHEDULE: kolom tarif sekarang s/d
                        1 Jan 2027, harga normal dicoret. Dulu tooltip ini hanya
                        menampilkan tarif saat ini, jadi sampai 30 Nov peneliti
                        tidak pernah melihat harga baru. */}
                    <RateTable highlightTier={activeTierIndex} showNotes={false} />

                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      {t('rateTableTooltipNote')}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Rincian dirender `CostBreakdown` + `orderMoneyLines` — jalur yang
                SAMA dengan kartu jadwal & halaman bayar. Baris yang digambar
                tangan di sini dulu salah (add-on Kilat tertulis Rp100rb) dan
                tidak punya baris "Harga perkenalan". Modul ini TIDAK menghitung. */}
            <CostBreakdown
              total={cost.totalCost}
              lines={orderMoneyLines(cost, {
                questionCount: quotedForm.questionCount,
                duration: quotedForm.duration,
                isKilat: quotedForm.isKilatUpgrade,
                voucherCode: quotedForm.voucherCode,
              })}
              variant="full"
              totalLabel={step === 2 ? t('orderCompanionTotalPayment') : t('orderCompanionTotalEstimate')}
            />
            {step === 2 && (
              <p className="text-[10px] text-slate-400">
                {t('orderCompanionIncludesTax')}
              </p>
            )}
          </div>

          {/* 4. SEKSI TOMBOL BATALKAN PESANAN — di KEDUA langkah. Tombol batal
              di header dimatikan (`showCancel={false}`), jadi kartu ini satu-
              satunya jalan keluar; dulu hanya step 2, dan step 1 buntu. */}
          {onCancelOrder && (
            <div className="p-3.5 sm:p-4 bg-slate-50/70 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(true)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-slate-200/80 hover:border-rose-200 bg-white transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs group"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500 group-hover:text-rose-600 transition-colors" />
                <span>{t('cancelOrder')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ================= MODAL KONFIRMASI PEMBATALAN ================= */}
      {isCancelModalOpen && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <AlertTriangle size={24} className="modal-icon-warning" />
              <h3 className="modal-title">{t('cancelOrderTitle')}</h3>
            </div>
            <div className="modal-body">
              <p>{t('cancelOrderBody')}</p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="modal-button modal-button-cancel"
              >
                {t('cancelOrderKeep')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCancelModalOpen(false);
                  onCancelOrder?.();
                }}
                className="modal-button modal-button-confirm"
              >
                {t('cancelOrderConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
