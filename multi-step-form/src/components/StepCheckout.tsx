import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { SurveyFormData, CostCalculation } from '../types';
import { calculateTotalCost, getVoucherInfo, isManualVerificationVoucher } from '../utils/cost-calculator';
import { formatRupiah } from '../utils/currency';
import { getOwnProfile } from '../utils/supabase';
import { useIlkomunyBlocked } from '../hooks/useIlkomunyBlocked';
import { isAutoApprovalPath } from '../utils/review-path';
import { checkoutBlocker } from '../utils/orderReadiness';
import { orderSubmitErrorKeyForCode } from '../utils/submitOrder';
import { formatWaveHour } from '../utils/kilatWaves';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { SectionLabel, FieldRow } from './SurveyFieldRow';
import { Switch } from './ui/switch';
import {
  Ticket,
  CheckCircle,
  AlertTriangle,
  FileText,
  Gift,
  Target,
  Info,
  CreditCard,
  Send,
  ExternalLink,
  CalendarCheck,
  Zap,
  Lock,
  User,
  Mail,
  Phone,
  Pencil,
  Clock
} from 'lucide-react';

import { OrderLiveCompanion } from './order/OrderLiveCompanion';
import { ReviewPathNotice } from './order/ReviewPathNotice';

interface StepCheckoutProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  /** Lanjut ke langkah Jadwal — hanya jalur otomatis yang memakainya. */
  nextStep: () => void;
  /** Menulis order (jalur manual; jalur otomatis menulis di langkah Jadwal). */
  onSubmitOrder: (overrides?: Partial<SurveyFormData>) => Promise<boolean>;
  onBack: () => void;
  onCancelOrder?: () => void;
}

/**
 * Langkah 2 — Ringkasan. Dulu ia langkah terakhir ("Review & Pembayaran"),
 * sesudah Jadwal; sekarang ia mendahului Jadwal dan menjadi SATU-SATUNYA titik
 * percabangan otomatis vs manual. Layar ini murni klien: tidak ada baris
 * database yang lahir di sini kecuali pada jalur yang memang berakhir di sini
 * (manual). Kilat menempuh urutan yang SAMA (Phase 5 §5.6): jalur otomatis
 * lanjut ke Step 3 — pemilih gelombang — lalu mengunci & membayar di sana.
 */
export function StepCheckout({
  formData,
  updateFormData,
  nextStep,
  onSubmitOrder,
  onBack,
  onCancelOrder,
}: StepCheckoutProps) {
  const { t } = useLanguage();
  const { user } = useAuth();

  const [costCalculation, setCostCalculation] = useState<CostCalculation>({
    adCost: 0,
    incentiveCost: 0,
    subtotal: 0,
    ppn: 0,
    discount: 0,
    totalCost: 0
  });

  const [voucherInfo, setVoucherInfo] = useState<{ isValid: boolean; message?: string; discount?: number; isError?: boolean }>({ isValid: false });
  const isKilat = !!formData.isKilatUpgrade;
  // ILKOMUNY sudah pernah dipakai akun ini (redemption lunas ATAU submission aktif)
  // → voucher tak berlaku (diskon tak diterapkan, pesan ditampilkan).
  const ilkomunyBlocked = useIlkomunyBlocked(formData.voucherCode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  /*
    Persetujuan S&K TERSIRAT: menekan tombol utama = menyetujui (kalimat
    "Dengan melanjutkan…" di bawah tombol). Keputusan produk 30 Sep 2026.

    ⚠️ Dicatat HANYA saat tombol ditekan — bukan saat layar dibuka. Versi awal
    redesign menyetelnya lewat useEffect ketika mount, jadi draf sudah
    "menyetujui" sebelum peneliti menekan apa pun.
  */

  // Detail Invoice: default diambil dari data akun (profil + auth); toggle OFF
  // untuk mengisi kontak invoice custom khusus order ini (tidak mengubah profil).
  const [useAccountData, setUseAccountData] = useState(false);
  const [accountDefaults, setAccountDefaults] = useState<{ fullName: string; email: string; phoneNumber: string } | null>(null);

  // Predikat yang SAMA dengan yang dipakai MultiStepForm untuk merutekan step —
  // sengaja bukan salinan lokal, karena keduanya kini menentukan hal yang sama.
  const isAutoApproval = isAutoApprovalPath(formData);

  /*
   * Yang menentukan tujuan tombol bukan jenis produknya, melainkan apakah
   * tanggalnya SUDAH ADA — sama untuk Iklan dan Kilat. Tanggal di Ringkasan
   * hanya mungkin dari draft; draft yang dibuka lagi keesokan harinya
   * kehilangan tanggal yang sudah lewat batas.
   */
  const hasSchedule = !!formData.startDate;
  const needsSchedule = isAutoApproval && !hasSchedule;

  // Email invoice berbeda dari email login → invoice terkirim ke email custom
  const isEmailMismatch = user?.email && formData.email && formData.email.trim().toLowerCase() !== user.email.toLowerCase();

  const getQuestionTier = (count: number) => {
    if (!count || count <= 0) return t('notSpecified');
    if (count <= 15) return `${t('orderCompanionCategory')}: ≤ 15 ${t('questionCount') || 'Soal'}`;
    if (count <= 30) return `${t('orderCompanionCategory')}: 16–30 ${t('questionCount') || 'Soal'}`;
    if (count <= 50) return `${t('orderCompanionCategory')}: 31–50 ${t('questionCount') || 'Soal'}`;
    if (count <= 70) return `${t('orderCompanionCategory')}: 51–70 ${t('questionCount') || 'Soal'}`;
    return `${t('orderCompanionCategory')}: > 70 ${t('questionCount') || 'Soal'}`;
  };

  useEffect(() => {
    let cancelled = false;
    getOwnProfile().then(profile => {
      if (cancelled) return;
      const defaults = {
        fullName: profile?.full_name || user?.user_metadata?.full_name || '',
        email: user?.email || profile?.email || '',
        phoneNumber: profile?.phone_number || '',
      };
      setAccountDefaults(defaults);
      // Cocokkan data hanya jika data formulir tidak kosong
      const matchesAccount =
        formData.fullName === defaults.fullName &&
        formData.email === defaults.email &&
        formData.phoneNumber === defaults.phoneNumber &&
        formData.fullName !== '';
      if (matchesAccount) {
        setUseAccountData(true);
      } else {
        setUseAccountData(false);
      }
    });
    return () => { cancelled = true; };
  }, [user, formData.fullName, formData.email, formData.phoneNumber]);

  const handleUseAccountDataChange = (checked: boolean) => {
    setUseAccountData(checked);
    if (checked && accountDefaults) {
      updateFormData({
        fullName: accountDefaults.fullName,
        email: accountDefaults.email,
        phoneNumber: accountDefaults.phoneNumber
      });
    } else {
      updateFormData({
        fullName: '',
        email: '',
        phoneNumber: ''
      });
    }
  };

  // Hitung biaya + info voucher saat form data (atau status pakai ILKOMUNY) berubah.
  // ILKOMUNY yang sudah dipakai → voucher di-strip: diskon TIDAK diterapkan & pesan
  // "sudah pernah digunakan" tampil, tanpa memblokir submit (order lanjut harga normal).
  useEffect(() => {
    const effectiveForm = ilkomunyBlocked ? { ...formData, voucherCode: '' } : formData;
    setCostCalculation(calculateTotalCost(effectiveForm, Date.now()));

    if (ilkomunyBlocked) {
      setVoucherInfo({ isValid: false, isError: true, message: t('voucherUsedOncePerAccount') });
    } else {
      // Sadar produk (Phase 5 §5.1): di form Kilat kode yang tidak berlaku
      // ditolak dengan pesannya sendiri — dan tidak disimpan (`submitOrder`).
      setVoucherInfo(getVoucherInfo(formData.voucherCode, formData.duration, Date.now(), isKilat ? 'kilat' : 'regular'));
    }
  }, [formData.questionCount, formData.duration, formData.winnerCount, formData.prizePerWinner, formData.voucherCode, ilkomunyBlocked, isKilat]);

  // Fungsi untuk handle perubahan kode voucher
  const handleVoucherChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateFormData({ voucherCode: e.target.value });
  };

  /**
   * Validasi yang harus dijawab SEBELUM user beranjak dari layar ini.
   *
   * `submitOrder()` memeriksa hal yang sama sekali lagi sebelum menulis, tapi
   * pemeriksaan di sini yang menyelamatkan pengalaman: tanpanya, jalur otomatis
   * baru menyadari nomor telepon kosong setelah user memilih tanggal — di layar
   * yang bahkan tidak punya kolom itu.
   */
  const validateBeforeLeaving = (): boolean => {
    const blocker = checkoutBlocker({ ...formData, termsAccepted: true });
    if (!blocker) return true;
    toast.error(t(orderSubmitErrorKeyForCode(blocker)));
    return false;
  };

  const handlePrimaryAction = async () => {
    if (!formData.termsAccepted) {
      updateFormData({ termsAccepted: true });
    }
    // Guard double-submit lewat ref (sinkron, kebal batching React)
    if (isSubmittingRef.current) return;
    if (!validateBeforeLeaving()) return;

    // Jalur otomatis tanpa tanggal: belum ada apa pun yang ditulis — lanjut
    // memilih jadwal (Iklan: kalender, Kilat: gelombang), dan order baru lahir
    // saat slot dikunci di sana.
    if (needsSchedule) {
      nextStep();
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    // ⚠️ Diteruskan eksplisit: `updateFormData` di atas baru mendarat di render
    // berikutnya, sedangkan `submitOrderAndRoute` membaca `formData` render
    // INI — tanpa override, `submitOrder()` menolak dengan kode 'terms'.
    const ok = await onSubmitOrder({ termsAccepted: true });
    if (!ok) {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* KOLOM KIRI: Survey Overview & Invoice Details (~58-60% / 7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Warning Banner for manual-verification vouchers (JFUFEB / ILKOMUNY) */}
          {/* Kilat: kodenya ditolak di kolom voucher, bukan dibelokkan ke review. */}
          {!isKilat && isManualVerificationVoucher(formData.voucherCode) && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 mt-0.5">
                  <Info className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-blue-900 mb-2 flex items-center gap-2">
                    {t('voucherManualVerifyTitle')}
                  </h4>
                  <p className="text-sm text-blue-800 leading-relaxed">
                    {t('voucherManualVerifyBody1')} <strong>{formData.voucherCode?.toUpperCase()}</strong>{' '}
                    {t('voucherManualVerifyBody2')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SECTION: SURVEY OVERVIEW (HIGHLIGHT CARD - MODERN GRADIENT) */}
          <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-100/50 via-sky-50/60 to-indigo-100/40 p-5 md:p-6 shadow-sm overflow-hidden space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <SectionLabel>{t('orderOverviewTitle')}</SectionLabel>
              <div className="flex items-center gap-2">
                {formData.isKilatUpgrade && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs">
                    <Zap size={11} className="fill-white" />
                    JFU KILAT
                  </span>
                )}
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-700 bg-white/90 hover:bg-white hover:text-blue-800 border border-blue-200/80 shadow-2xs transition-all cursor-pointer hover:shadow-xs active:scale-98"
                  title={t('editOrder') || 'Edit Order'}
                >
                  <Pencil size={13} className="text-blue-600" />
                  <span>{t('editOrder') || 'Edit Order'}</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {/* Title & Link */}
              <div>
                <div className="text-base md:text-lg font-bold text-gray-900 leading-snug">{formData.title}</div>
                {formData.surveyUrl && (
                  <div className="mt-1 flex items-center gap-1.5 max-w-full">
                    <ExternalLink size={12} className="text-blue-600 shrink-0" />
                    <a 
                      href={formData.surveyUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-blue-600 hover:text-blue-700 hover:underline text-xs truncate max-w-full block"
                      title={formData.surveyUrl}
                    >
                      {formData.surveyUrl}
                    </a>
                  </div>
                )}
              </div>

              {/* 3 Metric Stat Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* 1. Jumlah Pertanyaan */}
                <div className="bg-white/95 rounded-xl p-3.5 border border-blue-100/90 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <FileText size={13} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {t('questionCountLabel')}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                      {formData.questionCount} {t('questionCount') || 'Pertanyaan'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 font-medium truncate">
                      {getQuestionTier(formData.questionCount)}
                    </div>
                  </div>
                </div>

                {/* 2. Durasi Tayang */}
                <div className="bg-white/95 rounded-xl p-3.5 border border-blue-100/90 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                      formData.isKilatUpgrade ? 'bg-amber-100 text-amber-600' : 'bg-indigo-50 text-indigo-600'
                    }`}>
                      {formData.isKilatUpgrade ? <Zap size={13} className="fill-amber-600" /> : <Clock size={13} />}
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {isKilat ? t('kilatSummaryLabel') : t('surveyDurationLabel') || 'Durasi Tayang'}
                    </span>
                  </div>
                  {/* Kilat tanpa durasi (keputusan 7 Okt): satu pesanan = satu gelombang. */}
                  <div>
                    <div className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                      {isKilat ? t('kilatSummaryValue') : `${formData.duration} ${t('days')}`}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 font-medium truncate">
                      {!isKilat
                        ? t('regularStandardAiring')
                        : formData.kilatSlotHour != null
                          ? t('kilatWaveLabel', { hour: formatWaveHour(formData.kilatSlotHour) })
                          : isAutoApproval ? t('kilatSummaryPickNext') : t('kilatSummaryAssigned')}
                    </div>
                  </div>
                </div>

                {/* 3. Reward Responden */}
                <div className="bg-white/95 rounded-xl p-3.5 border border-blue-100/90 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <Gift size={13} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {t('prizePerWinnerLabel') || 'Reward Responden'}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm sm:text-base font-bold text-slate-900 leading-tight font-mono">
                      {formData.prizePerWinner && formData.winnerCount
                        ? `Rp ${formatRupiah(formData.winnerCount * formData.prizePerWinner)}`
                        : t('noPrize')}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 font-medium truncate">
                      {formData.prizePerWinner && formData.winnerCount
                        ? `${formData.winnerCount} ${t('winnerCountUnit') || 'pemenang'} @ Rp ${formatRupiah(formData.prizePerWinner)}`
                        : t('noPrizeDraw')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Release Schedule (If Auto Approval) */}
              {isAutoApproval && formData.startDate && (
                <div className="bg-white/95 p-3.5 rounded-xl border border-blue-100/90 shadow-2xs flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <CalendarCheck size={15} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      {t('releaseSchedule') || 'Jadwal Tayang'}
                    </span>
                    <span className="text-xs font-bold text-blue-900 mt-0.5 block">
                      {isKilat ? (
                        `${new Date(`${String(formData.startDate).slice(0, 10)}T12:00:00+07:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })} · ${
                          formData.kilatSlotHour != null ? t('kilatWaveLabel', { hour: formatWaveHour(formData.kilatSlotHour) }) : t('kilatWaveNotPicked')
                        }`
                      ) : <>
                      {new Date(formData.startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – {
                        (() => {
                          const ed = new Date(formData.startDate);
                          ed.setDate(ed.getDate() + (formData.duration || 1));
                          return ed.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                        })()
                      } (15:00 WIB)
                      </>}
                    </span>
                  </div>
                </div>
              )}

              {/* Kriteria Responden */}
              {formData.criteriaResponden && (
                <div className="bg-white/95 p-3.5 rounded-xl border border-blue-100/90 shadow-2xs space-y-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-md bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                      <Target size={12} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {t('criteriaRespondentLabel') || 'Kriteria Responden'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-800 pl-6 leading-relaxed font-medium">
                    {formData.criteriaResponden}
                  </p>
                </div>
              )}

              {/* Jalur review — satu-satunya tempat di Ringkasan yang menjawab
                  "jalur apa, kenapa, berapa lama". Dulu dibelah tiga: banner
                  amber PII di sini, blok di kolom kanan, dan tips Kepastian Slot. */}
              <ReviewPathNotice formData={formData} />

            </div>
          </div>

          {/* SECTION: INVOICE DETAILS */}
          <div className="rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-xs p-5 md:p-6 shadow-[0_4px_20px_-2px_rgba(24,124,255,0.06),0_12px_32px_-4px_rgba(0,0,0,0.04)] overflow-hidden space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionLabel>{t('invoiceDetailTitle')}</SectionLabel>
              <div className="flex items-center gap-2.5 select-none">
                <span className="text-xs font-medium text-slate-600">{t('sameAsAccount')}</span>
                <Switch
                  checked={useAccountData}
                  onCheckedChange={handleUseAccountDataChange}
                  className="data-[state=unchecked]:!bg-slate-200 data-[state=checked]:!bg-jfu-primary"
                />
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-500 -mt-1 leading-relaxed">{t('invoiceContactHelp')}</p>

              <div className="space-y-2.5">
                <FieldRow
                  icon={User}
                  label={t('invoiceNameLabel')}
                  htmlFor="invoiceFullName"
                  required
                  compact
                  readOnly={useAccountData}
                >
                  <input
                    id="invoiceFullName"
                    type="text"
                    disabled={useAccountData}
                    readOnly={useAccountData}
                    className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    placeholder={t('invoiceNamePlaceholder')}
                    value={formData.fullName}
                    onChange={(e) => updateFormData({ fullName: e.target.value })}
                  />
                  {useAccountData && (
                    <span className="shrink-0 text-slate-400 ml-2" title="Terkunci dari data akun">
                      <Lock size={14} />
                    </span>
                  )}
                </FieldRow>

                <FieldRow
                  icon={Mail}
                  label={t('invoiceEmailLabel')}
                  htmlFor="invoiceEmail"
                  required
                  compact
                  readOnly={useAccountData}
                  hint={
                    !useAccountData && isEmailMismatch ? (
                      <span className="flex items-start gap-1.5 text-amber-700 bg-amber-50/80 p-2 rounded-lg border border-amber-200/70 mt-1">
                        <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                        <span>
                          {t('emailMismatchNotice1')} (<strong>{user?.email}</strong>). {t('emailMismatchNotice2')}
                        </span>
                      </span>
                    ) : undefined
                  }
                >
                  <input
                    id="invoiceEmail"
                    type="email"
                    disabled={useAccountData}
                    readOnly={useAccountData}
                    className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    placeholder={t('invoiceEmailPlaceholder')}
                    value={formData.email}
                    onChange={(e) => updateFormData({ email: e.target.value })}
                  />
                  {useAccountData && (
                    <span className="shrink-0 text-slate-400 ml-2" title="Terkunci dari data akun">
                      <Lock size={14} />
                    </span>
                  )}
                </FieldRow>

                <FieldRow
                  icon={Phone}
                  label={t('invoicePhoneLabel')}
                  htmlFor="invoicePhoneNumber"
                  required
                  compact
                  readOnly={useAccountData}
                >
                  <input
                    id="invoicePhoneNumber"
                    type="tel"
                    disabled={useAccountData}
                    readOnly={useAccountData}
                    className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    placeholder={t('invoicePhonePlaceholder')}
                    value={formData.phoneNumber}
                    onChange={(e) => updateFormData({ phoneNumber: e.target.value })}
                  />
                  {useAccountData && (
                    <span className="shrink-0 text-slate-400 ml-2" title="Terkunci dari data akun">
                      <Lock size={14} />
                    </span>
                  )}
                </FieldRow>
              </div>
            </div>

            {/* SEKSI 2: VOUCHER / REFERRAL CODE (SEKSI BERBEDA DALAM SATU KARTU) */}
            <div className="pt-5 border-t border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SectionLabel>{t('voucherTitle')}</SectionLabel>
                  <span className="text-xs text-slate-400 font-normal mb-2.5">({t('optional') || 'opsional'})</span>
                </div>
              {voucherInfo.isValid && (
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/80 mb-2.5">
                  <CheckCircle size={12} />
                  <span>{t('voucherApplied')}</span>
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              <FieldRow
                icon={Ticket}
                label={t('voucherCodeRowLabel') || 'Kode Voucher'}
                htmlFor="voucherCode"
                compact
                hint={
                  voucherInfo.message ? (
                    <span className={`flex items-center gap-1.5 text-xs font-medium ${
                      voucherInfo.isValid
                        ? 'text-emerald-600'
                        : voucherInfo.isError
                          ? 'text-rose-600'
                          : 'text-slate-500'
                    }`}>
                      {voucherInfo.isValid ? (
                        <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                      ) : voucherInfo.isError ? (
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <Info className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{voucherInfo.message}</span>
                    </span>
                  ) : undefined
                }
              >
                <div className="flex items-center justify-between w-full">
                  <input
                    id="voucherCode"
                    type="text"
                    className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none uppercase font-mono tracking-wider"
                    placeholder={t('voucherPlaceholder')}
                    value={formData.voucherCode || ''}
                    onChange={handleVoucherChange}
                  />
                </div>
              </FieldRow>

            </div>
          </div>
        </div>
        </div>

        {/* KOLOM KANAN: Order Live Companion (Step 2), Terms Agreement & CTA (~40-42% / 5 cols, Sticky) */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-24">
          <OrderLiveCompanion
            formData={formData}
            step={2}
            costCalculation={costCalculation}
            onCancelOrder={onCancelOrder}
          />

          {/* Agreement Box with Primary Action & Implicit Consent */}
          <div className="rounded-2xl border border-sky-200/80 bg-sky-50/60 p-4 sm:p-5 shadow-xs space-y-3.5">
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-white transition-all shadow-sm cursor-pointer bg-jfu-primary hover:bg-jfu-dark active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t('processing')}
                </>
              ) : !isAutoApproval ? (
                <>
                  <Send size={15} />
                  {t('summaryCtaReview')}
                </>
              ) : needsSchedule ? (
                <>
                  <CalendarCheck size={15} />
                  {t('summaryCtaSchedule')}
                  <span aria-hidden="true">→</span>
                </>
              ) : (
                <>
                  <CreditCard size={15} />
                  {t('summaryCtaPay')}
                </>
              )}
            </button>

            <p className="text-center text-xs text-slate-600 leading-relaxed px-1">
              {t('byContinuingAgree')}{' '}
              <a
                href="/homepage/privacy-policy.html"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-jfu-primary hover:text-jfu-dark underline decoration-blue-300 hover:decoration-blue-500 transition-colors"
              >
                {t('privacyPolicy')}
              </a>
              {' '}{t('andText')}{' '}
              <a
                href="/homepage/terms-conditions.html"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-jfu-primary hover:text-jfu-dark underline decoration-blue-300 hover:decoration-blue-500 transition-colors"
              >
                {t('termsConditions')}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
