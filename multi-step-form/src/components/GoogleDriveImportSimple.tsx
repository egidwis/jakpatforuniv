import { useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, Check, ChevronDown, Loader2, ShieldCheck } from 'lucide-react';
import { InfoTooltip } from './status/InfoTooltip';
import { simpleGoogleAuth, type AuthResult } from '../utils/google-auth-simple';
import { googlePicker } from '../utils/google-picker-browser';
import { googleFormsApi } from '../utils/google-forms-api-browser';
import type { SurveyFormData } from '../types';
import { toast } from 'sonner';
import { useLanguage } from '../i18n/LanguageContext';

export interface ImportedGoogleForm {
  formId: string;
  surveyUrl: string;
  title: string;
  description: string;
  questionCount: number;
  isManualEntry: false;
  hasPersonalDataQuestions: boolean;
  detectedKeywords: string[];
}

interface GoogleDriveImportSimpleProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  onFormDataLoaded: () => void;
  onCancel?: () => void;
  /** Kalau diisi, pemilih file dilewati dan form ini langsung diekstrak. */
  autoFormId?: string | null;
  /**
   * Kalau diisi, hasil ekstraksi diserahkan ke induk dan tidak ditampilkan
   * sebagai kartu "lanjut" di dalam komponen ini.
   */
  onReviewed?: (data: ImportedGoogleForm) => void;
}

const REVIEW_TIMEOUT_MS = 45000;

function isGoogleAuthError(message: string): boolean {
  return /no access token|not authenticated|api error: 401|invalid authentication|login required/i.test(message);
}

/**
 * Import Google Form — restyle Soft DNA (v6), dirender di dalam body
 * `AdsFlowCard`. Dulu punya kartu `.google-step-card` (border 2px, padding
 * 2rem) dan biru `#0091ff` sendiri, beda dari kartu pintu masuk; sekarang
 * blok Tailwind ringan yang cocok duduk di dalamnya.
 *
 * `isReviewing` SENGAJA state terpisah dari `isSelecting`. `isSelecting`
 * sudah `true` sejak Google Picker dibuka dan baru `false` di `finally` —
 * memakai itu untuk panel "sedang direview" berarti panel muncul saat picker
 * MASIH terbuka dan tetap muncul kalau user membatalkannya: mengklaim
 * pemeriksaan yang belum terjadi. `isReviewing` baru jadi true setelah
 * `selectedFile` terbukti ada, tepat sebelum `extractToSurveyInfo`.
 *
 * Checklist di panel review TIDAK BOLEH memuat angka (mis. jumlah
 * pertanyaan) — itu baru diketahui setelah ekstraksi selesai. Timing
 * centangnya sendiri kosmetik (sama sifatnya dengan `minDuration` yang sudah
 * ada sebelum ini), tapi klaim datanya tidak boleh kosmetik.
 */
export function GoogleDriveImportSimple({
  updateFormData,
  onFormDataLoaded,
  onCancel,
  autoFormId,
  onReviewed,
}: GoogleDriveImportSimpleProps) {
  const { t } = useLanguage();
  const [isAuthenticated, setIsAuthenticated] = useState(() => simpleGoogleAuth.isAuthenticated());
  const [googleEmail, setGoogleEmail] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewStepIndex, setReviewStepIndex] = useState(0);
  const [importedForm, setImportedForm] = useState<any>(null);
  const [failedFormTitle, setFailedFormTitle] = useState<string>('Google Form');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [reviewSlow, setReviewSlow] = useState(false);
  const requestSeq = useRef(0);
  const stepMsRef = useRef(1800);

  // Checklist kosmetik: mencentang berurutan selama isReviewing. Jaraknya
  // mengikuti durasi minimum putaran ini, supaya langkah terakhir tidak
  // berhenti lama. Reset begitu review selesai/batal.
  useEffect(() => {
    if (!isReviewing) {
      setReviewStepIndex(0);
      setReviewSlow(false);
      return;
    }
    const step = stepMsRef.current;
    const timers = [1, 2].map((i) => setTimeout(() => setReviewStepIndex(i), step * i));
    const slow = setTimeout(() => setReviewSlow(true), 10000);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(slow);
    };
  }, [isReviewing]);

  // Connect to Google
  const handleConnect = async () => {
    setIsConnecting(true);
    setConnectError(null);
    try {
      const authResult: AuthResult = await simpleGoogleAuth.requestAccessToken();

      if (!authResult.success) {
        throw new Error(authResult.error || 'Failed to connect');
      }

      if (authResult.user?.emailAddress) {
        setGoogleEmail(authResult.user.emailAddress);
      }

      setIsAuthenticated(true);
      toast.success(t('successConnectedGoogleDrive'));
    } catch (error: any) {
      console.error('Error connecting:', error);

      // Handle access_denied specifically (user cancelled via 'x' or 'cancel')
      if (error.message && (error.message.includes('access_denied') || error.message.includes('access_denied_timeout'))) {
        toast.info(t('cancel')); // Use existing 'Cancel' translation
        return;
      }

      // Show simple toast error
      toast.error(t('errorConnectGoogleDrive'));

      // Save detailed error inline
      if (error.message === 'insufficient_permissions') {
        setConnectError('insufficient_permissions');
      } else {
        setConnectError(error.message || t('errorConnectGoogleDrive'));
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // Change Account
  const handleChangeAccount = () => {
    simpleGoogleAuth.revoke();
    setIsAuthenticated(false);
    setGoogleEmail('');
    setImportedForm(null);
    setConnectError(null);
    setImportError(null);
  };

  // Change Form
  const handleChangeForm = () => {
    setImportedForm(null);
    setImportError(null);
  };

  // Proceed to Next Step
  const handleProceed = () => {
    if (importedForm) {
      updateFormData(importedForm);
      onFormDataLoaded();
      toast.success(t('successFormImported').replace('{title}', importedForm.title));
    }
  };

  // Select form using Google Picker, or re-extract a form the user already chose.
  const runExtract = async (formId: string, fileName: string) => {
    const seq = ++requestSeq.current;
    const stillCurrent = () => seq === requestSeq.current;

    setImportError(null);
    setNeedsReauth(false);
    setFailedFormTitle(fileName || 'Google Form');
    setIsReviewing(true);
    const minDuration = 6000 + Math.floor(Math.random() * 4001);
    stepMsRef.current = Math.floor(minDuration / 3);
    const startTime = Date.now();
    let timeoutId = 0;

    try {
      const extractPromise = googleFormsApi.extractToSurveyInfo(formId);
      void extractPromise.catch(() => undefined);
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('review-timeout')), REVIEW_TIMEOUT_MS);
      });
      const result = await Promise.race([extractPromise, timeoutPromise]);
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < minDuration) {
        await new Promise((resolve) => setTimeout(resolve, minDuration - elapsedTime));
      }
      if (!stillCurrent()) return;

      const extracted: ImportedGoogleForm = {
        formId,
        surveyUrl: result.url || `https://docs.google.com/forms/d/${formId}/viewform`,
        title: (fileName && fileName !== 'Google Form' ? fileName : result.title) || 'Google Form',
        description: result.description || '',
        questionCount: result.questionCount,
        isManualEntry: false,
        hasPersonalDataQuestions: result.hasPersonalDataQuestions || false,
        detectedKeywords: result.detectedKeywords || [],
      };

      if (onReviewed) {
        onReviewed(extracted);
        return;
      }

      setImportedForm(extracted);
      toast.success(t('reviewSuccess'));
    } catch (error: any) {
      if (!stillCurrent()) return;
      const errMsg = error?.message || '';
      if (errMsg === 'review-timeout') {
        setImportError(t('technicalIssueReasonNote'));
        toast.error(t('errorSelectForm'));
        return;
      }
      if (isGoogleAuthError(errMsg)) {
        setNeedsReauth(true);
        setIsAuthenticated(false);
        toast.error(t('googleReconnect'));
        return;
      }
      toast.error(t('errorSelectForm'));
      if (errMsg === 'errorFormNotPublished' || errMsg === 'errorFormRestricted') {
        setImportError(t('technicalIssueReasonNote'));
      } else {
        setImportError(errMsg || t('technicalIssueReasonNote'));
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (stillCurrent()) {
        setIsSelecting(false);
        setIsReviewing(false);
      }
    }
  };

  const handleSelectForm = async () => {
    if (!isAuthenticated) {
      toast.error(t('errorConnectFirst'));
      return;
    }

    setIsSelecting(true);
    setImportError(null);
    try {
      const selectedFile = await googlePicker.showFormsPicker();
      if (!selectedFile) {
        setIsSelecting(false);
        return;
      }
      await runExtract(selectedFile.id, selectedFile.name || 'Google Form');
    } catch (error: any) {
      console.error('Error selecting form:', error);
      toast.error(t('errorSelectForm'));
      setImportError(error?.message || t('technicalIssueReasonNote'));
      setIsSelecting(false);
      setIsReviewing(false);
    }
  };

  // Impor ulang form yang sama, tanpa membuka pemilih file lagi.
  useEffect(() => {
    if (!autoFormId || !isAuthenticated) return;
    void runExtract(autoFormId, failedFormTitle);
    // Hanya saat id atau status sambungan berubah. runExtract membaca state
    // lewat ref permintaan, jadi identitas fungsinya tidak perlu jadi dependensi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFormId, isAuthenticated]);

  // Pindah halaman atau batal di tengah review: hasil yang datang belakangan
  // tidak boleh mengubah kartu yang sudah ditinggalkan.
  useEffect(() => {
    return () => {
      requestSeq.current += 1;
    };
  }, []);

  const reviewChecklist = [
    t('autoReviewCheckQuestions'),
    t('autoReviewCheckPersonalData'),
    t('autoReviewCheckSummary'),
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Judul dan subjudul selalu terlihat. Rincian izin dibuka lewat chevron. */}
      {!isReviewing && (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
        <button
          type="button"
          onClick={() => setSafetyOpen((open) => !open)}
          aria-expanded={safetyOpen}
          className="flex w-full items-start gap-2.5 text-left cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-emerald-950">{t('googleSafetyToggle')}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-emerald-900">{t('googleSafetyLead')}</span>
          </span>
          <ChevronDown className={`w-4 h-4 shrink-0 mt-0.5 text-emerald-700 transition-transform ${safetyOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {safetyOpen && (
          <ul className="mt-2 space-y-1 pl-6 text-xs leading-relaxed text-emerald-900">
            <li>{t('googleSafetyPoint1')}</li>
            <li>{t('googleSafetyPoint2')}</li>
            <li>{t('googleSafetyPoint3')}</li>
          </ul>
        )}
      </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex items-center gap-2 truncate text-sm text-slate-800">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span className="truncate">
            {isAuthenticated
              ? (googleEmail ? googleEmail : t('googleConnectedMessage'))
              : needsReauth
                ? t('googleReconnect')
                : t('googleAccountLabel')}
          </span>
        </p>
        {isAuthenticated ? (
          <button
            type="button"
            onClick={handleChangeAccount}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {t('googleChangeShort')}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            disabled={isConnecting}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isConnecting && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            {isConnecting ? t('connecting') : t('googleConnectShort')}
          </button>
        )}
      </div>

      <p className="flex items-center gap-1 text-xs text-slate-500">
        {t('surveyEntryImportGoogleTag')}
        <InfoTooltip content={t('surveyEntryImportGoogleTip')} />
        <span aria-hidden="true">·</span>
        {t('surveyEntryImportGoogleSub')}
      </p>

      {connectError && (
        <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 flex gap-2.5 items-start">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <div>
            <h4 className="text-sm font-bold text-rose-900">
              {connectError === 'insufficient_permissions' ? t('errorInsufficientPermissionsTitle') : t('errorConnectGoogleDrive')}
            </h4>
            <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">
              {connectError === 'insufficient_permissions' ? t('errorInsufficientPermissionsDesc') : connectError}
            </p>
          </div>
        </div>
      )}

      {isAuthenticated && importedForm ? (
            <div>
              <div className={`rounded-xl border p-3 md:p-3.5 transition-all ${
                importedForm.hasPersonalDataQuestions
                  ? 'border-amber-200 bg-amber-50/40'
                  : 'border-emerald-100 bg-emerald-50/30'
              }`}>
                <div className="flex items-start gap-3">
                  <span className={`w-8 h-8 rounded-lg inline-flex items-center justify-center shrink-0 mt-0.5 ${
                    importedForm.hasPersonalDataQuestions
                      ? 'bg-amber-100 text-amber-600'
                      : 'bg-emerald-100 text-emerald-600'
                  }`}>
                    {importedForm.hasPersonalDataQuestions ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-[#1a1a1a]">{t('selectedSurveyTitle')}</h3>
                      {!importedForm.hasPersonalDataQuestions && (
                        <button
                          onClick={handleChangeForm}
                          className="text-xs font-semibold text-jfu-primary hover:underline shrink-0"
                        >
                          {t('changeSelectedForm')}
                        </button>
                      )}
                    </div>

                    <p
                      className="text-xs font-medium text-gray-700 truncate mt-0.5"
                      title={importedForm.title}
                    >
                      {importedForm.title}
                    </p>

                    <div className={`mt-2 pt-2 border-t ${importedForm.hasPersonalDataQuestions ? 'border-amber-200/60' : 'border-gray-200/60'}`}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className="font-semibold text-gray-700">
                          {importedForm.questionCount} {t('questionsCountSuffix')}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className={`font-semibold ${
                          importedForm.hasPersonalDataQuestions ? 'text-amber-700' : 'text-emerald-700'
                        }`}>
                          {importedForm.hasPersonalDataQuestions
                            ? t('statusDetectedSensitive')
                            : t('statusReadyToAdvertise')}
                        </span>
                      </div>

                      {importedForm.hasPersonalDataQuestions && (
                        <p className="text-xs text-amber-800 mt-1.5 leading-relaxed">
                          {t('personalDataReasonNote').replace('{keywords}', importedForm.detectedKeywords.join(', '))}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons below Card */}
              {importedForm.hasPersonalDataQuestions ? (
                <div className="flex flex-col sm:flex-row gap-2.5 mt-3">
                  <button
                    onClick={handleChangeForm}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 min-h-11 font-semibold rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {t('changeSelectedForm')}
                  </button>
                  <button
                    onClick={handleProceed}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 min-h-11 text-white font-semibold rounded-full bg-gradient-to-br from-amber-500 to-amber-600 shadow-glow hover:-translate-y-0.5 transition-all"
                  >
                    {t('personalDataContinueButton')}
                  </button>
                </div>
              ) : (
                <div className="mt-3">
                  <button
                    onClick={handleProceed}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-11 text-white font-semibold rounded-full bg-gradient-to-br from-jfu-primary to-jfu-light shadow-glow hover:-translate-y-0.5 transition-all"
                  >
                    {t('continue')}
                  </button>
                </div>
              )}
            </div>
          ) : isReviewing ? (
            <div className="rounded-xl border border-jfu-primary/15 bg-jfu-primary/[0.04] p-3 md:p-3.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-[#1a1a1a]">
                <Loader2 className="w-4 h-4 animate-spin text-jfu-primary shrink-0" />
                {reviewSlow ? t('reviewStillReading') : t('reviewingSystem')}
              </p>
              <div className="mt-2 space-y-1.5 pl-6">
                {reviewChecklist.map((label, i) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    {i < reviewStepIndex ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : i === reviewStepIndex ? (
                      <Loader2 className="w-3.5 h-3.5 text-jfu-primary shrink-0 animate-spin" />
                    ) : (
                      <span className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className={i <= reviewStepIndex ? 'text-[#1a1a1a]' : 'text-gray-400'}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : importError ? (
            <div>
              <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3 md:p-3.5">
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 inline-flex items-center justify-center shrink-0 mt-0.5">
                    <AlertCircle className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-[#1a1a1a]">{t('selectedSurveyTitle')}</h3>
                    </div>

                    <p
                      className="text-xs font-medium text-gray-700 truncate mt-0.5"
                      title={failedFormTitle}
                    >
                      {failedFormTitle}
                    </p>

                    <div className="mt-2 pt-2 border-t border-rose-200/60">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className="font-semibold text-gray-700">
                          0 {t('questionsCountSuffix')}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="font-semibold text-rose-700">
                          {t('statusDetectedIssue')}
                        </span>
                      </div>

                      <p className="text-xs text-rose-800 mt-1.5 leading-relaxed">
                        {importError}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons for Technical Issue Rejection */}
              <div className="flex flex-col sm:flex-row gap-2.5 mt-3">
                <button
                  onClick={handleSelectForm}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 min-h-11 font-semibold rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {t('changeSelectedForm')}
                </button>
                <button
                  onClick={() => {
                    if (onCancel) onCancel();
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 min-h-11 text-white font-semibold rounded-full bg-gradient-to-br from-jfu-primary to-jfu-light shadow-glow hover:-translate-y-0.5 transition-all"
                >
                  {t('personalDataContinueButton')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSelectForm}
              disabled={!isAuthenticated || isSelecting}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-11 text-white font-semibold rounded-xl bg-jfu-primary hover:bg-jfu-dark disabled:bg-slate-200 disabled:text-slate-500 disabled:hover:bg-slate-200 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              {isSelecting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : null}
              {t('googlePickQuestionnaire')}
            </button>
          )}
    </div>
  );
}
