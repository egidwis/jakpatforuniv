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
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { SectionLabel, FieldRow } from './SurveyFieldRow';
import { Switch } from './ui/switch';
import {
  Ticket,
  Wallet,
  CheckCircle,
  AlertTriangle,
  FileText,
  Gift,
  Target,
  Info,
  CreditCard,
  Send,
  ArrowLeft,
  ExternalLink,
  CalendarCheck,
  Zap,
  Lock,
  User,
  Mail,
  Phone,
  AlertCircle
} from 'lucide-react';

interface StepCheckoutProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  /** Lanjut ke langkah Jadwal — hanya jalur otomatis yang memakainya. */
  nextStep: () => void;
  /** Menulis order (jalur manual, dan jalur Kilat yang jadwalnya sudah dipilih). */
  onSubmitOrder: () => Promise<boolean>;
  onBack: () => void;
  onUpgradeKilat?: () => void;
  onUndoKilat?: () => void;
}

/**
 * Langkah 2 — Ringkasan. Dulu ia langkah terakhir ("Review & Pembayaran"),
 * sesudah Jadwal; sekarang ia mendahului Jadwal dan menjadi SATU-SATUNYA titik
 * percabangan otomatis vs manual. Layar ini murni klien: tidak ada baris
 * database yang lahir di sini kecuali pada jalur yang memang berakhir di sini
 * (manual, dan Kilat yang jadwalnya sudah terpilih di langkah tersendiri).
 */
export function StepCheckout({ formData, updateFormData, nextStep, onSubmitOrder, onBack, onUpgradeKilat, onUndoKilat }: StepCheckoutProps) {
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

  const [voucherInfo, setVoucherInfo] = useState<{ isValid: boolean; message?: string; discount?: number; isError?: boolean; isKilatEligible?: boolean }>({ isValid: false });
  // ILKOMUNY sudah pernah dipakai akun ini (redemption lunas ATAU submission aktif)
  // → voucher tak berlaku (diskon tak diterapkan, pesan ditampilkan).
  const ilkomunyBlocked = useIlkomunyBlocked(formData.voucherCode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // Persetujuan S&K ikut di formData, bukan state lokal: pada jalur otomatis
  // order baru ditulis satu langkah kemudian, setelah layar ini unmount.
  const isTermsAccepted = formData.termsAccepted === true;

  // Detail Invoice: default diambil dari data akun (profil + auth); toggle OFF
  // untuk mengisi kontak invoice custom khusus order ini (tidak mengubah profil).
  const [useAccountData, setUseAccountData] = useState(false);
  const [accountDefaults, setAccountDefaults] = useState<{ fullName: string; email: string; phoneNumber: string } | null>(null);

  // Predikat yang SAMA dengan yang dipakai MultiStepForm untuk merutekan step —
  // sengaja bukan salinan lokal, karena keduanya kini menentukan hal yang sama.
  const isAutoApproval = isAutoApprovalPath(formData);

  /*
   * Yang menentukan tujuan tombol bukan jenis produknya, melainkan apakah
   * tanggalnya SUDAH ADA.
   *
   * Kilat memilih tanggal di langkah tersendiri, jadi biasanya ia sampai ke
   * sini sudah bertanggal dan langsung mengunci. Tapi tanggal juga bisa hilang
   * belakangan — draft yang dibuka lagi keesokan harinya kehilangan tanggal
   * yang sudah lewat batas. Kalau syaratnya ditulis sebagai "bukan Kilat",
   * order Kilat tanpa tanggal akan menekan tombol bayar dan selalu ditolak,
   * tanpa jalan kembali ke pemilih Kilat.
   */
  const hasSchedule = !!formData.startDate;
  const needsSchedule = isAutoApproval && !hasSchedule;

  // Email invoice berbeda dari email login → invoice terkirim ke email custom
  const isEmailMismatch = user?.email && formData.email && formData.email.trim().toLowerCase() !== user.email.toLowerCase();

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
    setCostCalculation(calculateTotalCost(effectiveForm));

    if (ilkomunyBlocked) {
      setVoucherInfo({ isValid: false, isError: true, message: 'Kode voucher ini sudah pernah digunakan (berlaku satu kali per akun).' });
    } else {
      setVoucherInfo(getVoucherInfo(formData.voucherCode, formData.duration));
    }
  }, [formData.questionCount, formData.duration, formData.winnerCount, formData.prizePerWinner, formData.voucherCode, ilkomunyBlocked]);

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
    const blocker = checkoutBlocker(formData);
    if (!blocker) return true;
    toast.error(t(orderSubmitErrorKeyForCode(blocker)));
    return false;
  };

  const handlePrimaryAction = async () => {
    setAttemptedSubmit(true);
    // Guard double-submit lewat ref (sinkron, kebal batching React)
    if (isSubmittingRef.current) return;
    if (!validateBeforeLeaving()) return;

    // Jalur otomatis tanpa tanggal: belum ada apa pun yang ditulis — lanjut
    // memilih jadwal, dan order baru lahir saat slot dikunci di sana. Kilat
    // dikembalikan ke pemilihnya sendiri, bukan ke kalender reguler, karena
    // kuota keduanya terpisah.
    if (needsSchedule) {
      if (formData.isKilatUpgrade) onUpgradeKilat?.();
      else nextStep();
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    const ok = await onSubmitOrder();
    if (!ok) {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-3.5">
      <div className="space-y-3.5">
        {/* Warning Banner for Personal Data Detection */}
        {formData.hasPersonalDataQuestions && formData.detectedKeywords && formData.detectedKeywords.length > 0 && (
          <div className="p-4 rounded-xl bg-amber-100/50 border border-amber-200/60 flex flex-col gap-2 mb-6">
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-amber-200 text-amber-700 rounded-lg shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
              <div>
                <h4 className="font-bold text-amber-900 text-sm">Terdeteksi Pertanyaan Data Pribadi</h4>
                <p className="text-sm text-amber-700 mt-1 leading-relaxed">
                  Sistem mendeteksi form ini menanyakan: <strong className="bg-amber-200/60 px-1.5 py-0.5 rounded capitalize">{formData.detectedKeywords.join(', ')}</strong>.
                  Sesuai <a href="/homepage/terms-conditions.html" target="_blank" rel="noopener noreferrer" className="font-bold underline decoration-amber-700/30 hover:text-amber-900 transition-colors">Syarat dan Ketentuan</a>, form ini akan memerlukan <strong>Review Manual</strong> oleh tim admin sebelum dilanjutkan ke tahap pembayaran.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Warning Banner for manual-verification vouchers (JFUFEB / ILKOMUNY) */}
        {isManualVerificationVoucher(formData.voucherCode) && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
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
          <div className="flex items-center justify-between">
            <SectionLabel>{t('orderOverviewTitle')}</SectionLabel>
            {formData.isKilatUpgrade && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs">
                <Zap size={11} className="fill-white" />
                JFU KILAT
              </span>
            )}
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

            {/* Spec & Reward Bar (Compact Inline Meta) */}
            <div className="flex flex-wrap items-center gap-y-1.5 gap-x-2 text-xs font-medium text-gray-700 bg-white/90 px-3.5 py-2.5 rounded-xl border border-blue-100 shadow-2xs">
              <span className="flex items-center gap-1">
                <FileText size={13} className="text-gray-400 shrink-0" />
                <span>{formData.questionCount} Qs</span>
              </span>
              <span className="text-gray-300">•</span>
              <span className="flex items-center gap-1">
                <span>{formData.isKilatUpgrade ? t('kilatDuration') : `${formData.duration} ${t('days')}`}</span>
              </span>
              <span className="text-gray-300">•</span>
              <span className="flex items-center gap-1">
                <Gift size={13} className="text-gray-400 shrink-0" />
                <span>{formData.winnerCount} {t('winner')}</span>
              </span>
              <span className="text-gray-300">•</span>
              <span className="font-semibold text-gray-800">@ Rp {formatRupiah(formData.prizePerWinner)}</span>
            </div>

            {/* Release Schedule (If Auto Approval) */}
            {isAutoApproval && formData.startDate && (
              <div className="flex items-center gap-2 text-xs text-blue-800 bg-white/90 px-3.5 py-2 rounded-xl border border-blue-100">
                <CalendarCheck size={14} className="text-blue-500 shrink-0" />
                <div>
                  <span className="font-semibold">{t('releaseSchedule')}: </span>
                  <span>
                    {new Date(formData.startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - {
                      (() => {
                        const ed = new Date(formData.startDate);
                        ed.setDate(ed.getDate() + (formData.duration || 1));
                        return ed.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                      })()
                    } (15:00 WIB)
                  </span>
                </div>
              </div>
            )}

            {/* Kriteria Responden */}
            {formData.criteriaResponden && (
              <div className="flex items-start gap-2 text-xs text-gray-700 bg-white/90 p-3 rounded-xl border border-blue-100 shadow-2xs">
                <Target size={14} className="text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-gray-900">Kriteria Responden: </span>
                  <span className="text-gray-600 leading-relaxed">{formData.criteriaResponden}</span>
                </div>
              </div>
            )}

            {/* Mode JFU Kilat Active Banner */}
            {formData.isKilatUpgrade && (
              <div className="border-t border-dashed border-blue-200/60 pt-3 mt-2 w-full flex flex-col gap-1">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 text-xs text-amber-800 font-bold">
                    <Zap size={14} className="fill-amber-500 text-amber-500 shrink-0" />
                    <span>{t('kilatModeActive')}</span>
                  </div>
                  {onUndoKilat && (
                    <button
                      onClick={onUndoKilat}
                      className="text-xs font-semibold text-gray-400 hover:text-gray-600 hover:underline transition-all whitespace-nowrap"
                    >
                      {t('kilatUndoButton')}
                    </button>
                  )}
                </div>
                <div className="pl-[22px] text-[11px] text-amber-600 leading-relaxed">
                  {t('kilatBenefitFast')} &bull; {t('kilatBenefitNoPage')}
                </div>
              </div>
            )}
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

            {/* Divider line */}
            <div className="border-t border-slate-100/90 my-5" />

            {/* SECTION: PROMO / REFERRAL CODE INLINE */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <SectionLabel>{t('voucherTitle')}</SectionLabel>
                  <span className="text-xs text-slate-400 font-normal mb-2.5">({t('optional') || 'opsional'})</span>
                </div>
                {voucherInfo.isValid && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/80 mb-2.5">
                    <CheckCircle size={12} />
                    <span>{t('voucherApplied')}</span>
                  </div>
                )}
              </div>

              <FieldRow
                icon={Ticket}
                label={t('voucherTitle')}
                htmlFor="voucherCode"
                compact
                error={voucherInfo.isError ? voucherInfo.message : undefined}
                hint={
                  voucherInfo.isValid && voucherInfo.message ? (
                    <span className="text-xs text-emerald-600 flex items-center gap-1 font-medium">
                      <CheckCircle className="w-3.5 h-3.5" /> {voucherInfo.message}
                    </span>
                  ) : undefined
                }
              >
                <input
                  id="voucherCode"
                  type="text"
                  className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none uppercase"
                  placeholder={t('voucherPlaceholder')}
                  value={formData.voucherCode || ''}
                  onChange={handleVoucherChange}
                />
              </FieldRow>
              
              {voucherInfo.isValid && voucherInfo.message && (
                <p className="text-xs text-emerald-600 flex items-center gap-1 mt-2 font-medium animate-in slide-in-from-left-2">
                  <CheckCircle className="w-3 h-3" /> {voucherInfo.message}
                </p>
              )}
              {!voucherInfo.isValid && voucherInfo.message && (
                <p className={`text-xs flex items-center gap-1 mt-2 font-medium animate-in slide-in-from-left-2 ${voucherInfo.isError ? 'text-rose-600' : 'text-slate-500'}`}>
                  {voucherInfo.isError ? <AlertTriangle className="w-3 h-3" /> : <Info className="w-3 h-3" />} {voucherInfo.message}
                </p>
              )}

              {/* Upgrade CTA */}
              {voucherInfo.isValid && voucherInfo.isKilatEligible && !formData.isKilatUpgrade && onUpgradeKilat && (
                <div className="mt-4 p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Zap size={16} className="fill-amber-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-amber-900">{t('kilatUpgradeTitle')}</h4>
                      <p className="text-xs text-amber-800 mt-0.5">{t('kilatUpgradeTagline')}</p>
                      <ul className="text-[11px] text-amber-700 mt-2 space-y-1 font-medium">
                        <li className="flex items-center gap-1.5"><CheckCircle size={10} className="text-amber-500" /> {t('kilatBenefitFast')}</li>
                        <li className="flex items-center gap-1.5"><CheckCircle size={10} className="text-amber-500" /> {t('kilatBenefitNoPage')}</li>
                        <li className="flex items-center gap-1.5"><CheckCircle size={10} className="text-amber-500" /> {t('kilatBenefitPrice')}</li>
                      </ul>
                      <button
                        onClick={onUpgradeKilat}
                        className="mt-3 w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5"
                      >
                        {t('kilatUpgradeButton')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SECTION: COST BREAKDOWN */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_4px_20px_-2px_rgba(24,124,255,0.06),0_12px_32px_-4px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                <Wallet size={18} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">{t('costBreakdown')}</h3>
            </div>
          </div>

          <div className="p-6">
            <div className="space-y-4">
              {/* Ad Cost */}
              <div className="flex justify-between items-start pb-3.5 border-b border-dashed border-slate-200">
                <div>
                  <div className="text-sm font-medium text-slate-900">{formData.isKilatUpgrade ? 'Base Rate Iklan' : t('adCampaignCost')}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{formData.questionCount} {t('questions').toLowerCase()} {formData.isKilatUpgrade ? '' : `× ${formData.duration} hari`}</div>
                </div>
                <div className="text-sm font-semibold text-slate-900">Rp {formatRupiah(costCalculation.adCost)}</div>
              </div>

              {/* JFU Kilat Add-on */}
              {formData.isKilatUpgrade && costCalculation.kilatAddonCost && (
                <div className="flex justify-between items-start pb-3.5 border-b border-dashed border-slate-200">
                  <div>
                    <div className="text-sm font-bold text-amber-600 flex items-center gap-1.5"><Zap size={14} className="fill-amber-600" /> {t('kilatAddonLabel')}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Prioritas distribusi super cepat</div>
                  </div>
                  <div className="text-sm font-bold text-amber-600">Rp {formatRupiah(costCalculation.kilatAddonCost)}</div>
                </div>
              )}

              {/* Incentive Cost */}
              <div className="flex justify-between items-start pb-3.5 border-b border-dashed border-slate-200">
                <div>
                  <div className="text-sm font-medium text-slate-900">{t('respondentIncentive')}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{formData.winnerCount} winners × Rp {formatRupiah(formData.prizePerWinner)}</div>
                </div>
                <div className="text-sm font-semibold text-slate-900">Rp {formatRupiah(costCalculation.incentiveCost)}</div>
              </div>

              {/* Discount (if applicable) */}
              {costCalculation.discount > 0 && (
                <div className="flex justify-between items-center text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200/80 mb-2">
                  <div className="text-sm font-medium flex items-center gap-1">
                    <Ticket size={14} /> {t('discount')}
                  </div>
                  <div className="text-sm font-bold">- Rp {formatRupiah(costCalculation.discount)}</div>
                </div>
              )}

              {/* Subtotal (DPP) */}
              <div className="flex justify-between items-center text-sm">
                <div className="text-slate-500">{t('subtotal')}</div>
                <div className="text-slate-700 font-medium">Rp {formatRupiah(costCalculation.subtotal)}</div>
              </div>

              {/* PPN 11% */}
              <div className="flex justify-between items-center text-sm">
                <div className="text-slate-500">{t('ppn')}</div>
                <div className="text-slate-700 font-medium">Rp {formatRupiah(costCalculation.ppn)}</div>
              </div>

              {/* Total */}
              <div className="flex justify-between items-end pt-4 border-t border-dashed border-slate-200">
                <div className="text-base font-bold text-slate-900">{t('totalPayment')}</div>
                <div className="text-2xl font-bold text-jfu-primary">Rp {formatRupiah(costCalculation.totalCost)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Terms Agreement Checkbox - Soft Highlight Strip (Solusi 3) */}
        <div
          className={`rounded-2xl p-4 transition-all duration-200 ${
            attemptedSubmit && !isTermsAccepted
              ? 'border border-rose-300 bg-rose-50/80 shadow-xs ring-2 ring-rose-400/20'
              : 'border border-sky-200/80 bg-sky-50/60 shadow-2xs hover:bg-sky-50/90 hover:border-sky-300'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-5 items-center mt-0.5">
              <input
                id="terms-checkbox"
                type="checkbox"
                checked={isTermsAccepted}
                onChange={(e) => updateFormData({ termsAccepted: e.target.checked })}
                className={`h-4 w-4 rounded cursor-pointer transition-all ${
                  attemptedSubmit && !isTermsAccepted
                    ? 'border-rose-400 text-rose-600 focus:ring-rose-500 accent-rose-600 ring-2 ring-rose-400/30'
                    : 'border-sky-300 text-jfu-primary focus:ring-sky-400 accent-jfu-primary'
                }`}
              />
            </div>
            <div className="flex-1">
              <label
                htmlFor="terms-checkbox"
                className={`text-xs md:text-sm leading-relaxed cursor-pointer select-none font-medium ${
                  attemptedSubmit && !isTermsAccepted ? 'text-rose-950' : 'text-slate-700'
                }`}
              >
                {t('byContinuingAgree')}{' '}
                <a
                  href="/homepage/privacy-policy.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-jfu-primary hover:text-jfu-dark underline decoration-blue-300 hover:decoration-blue-500 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t('privacyPolicy')}
                </a>
                {' '}{t('andText')}{' '}
                <a
                  href="/homepage/terms-conditions.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-jfu-primary hover:text-jfu-dark underline decoration-blue-300 hover:decoration-blue-500 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t('termsConditions')}
                </a>
              </label>

              {attemptedSubmit && !isTermsAccepted && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-rose-600 animate-in slide-in-from-top-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('errorTermsRequired') || 'Mohon setujui Syarat & Ketentuan serta Kebijakan Privasi'}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ACTION — satu tombol, tiga takdir. */}
        <div className="pt-2 pb-12 space-y-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              disabled={isSubmitting}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 shadow-xs cursor-pointer disabled:opacity-60 disabled:pointer-events-none"
            >
              <ArrowLeft className="w-4 h-4 text-slate-500" />
              {t('backButton')}
            </button>
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={isSubmitting}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition-all shadow-xs cursor-pointer ${
                !isAutoApproval
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-jfu-primary hover:bg-jfu-dark'
              } disabled:cursor-not-allowed disabled:opacity-50`}
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
          </div>
        </div>
      </div>
    </div >
  );
}
