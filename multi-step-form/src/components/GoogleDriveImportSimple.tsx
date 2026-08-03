import { useEffect, useState } from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { AlertCircle, AlertTriangle, Check, ChevronDown, Loader2, ShieldCheck } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { simpleGoogleAuth, type AuthResult } from '../utils/google-auth-simple';
import { googlePicker } from '../utils/google-picker-browser';
import { googleFormsApi } from '../utils/google-forms-api-browser';
import type { SurveyFormData } from '../types';
import { toast } from 'sonner';
import { useLanguage } from '../i18n/LanguageContext';

interface GoogleDriveImportSimpleProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  onFormDataLoaded: () => void;
  onCancel?: () => void;
}

const REVIEW_STEP_MS = 1800;

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
  onCancel
}: GoogleDriveImportSimpleProps) {
  const { t } = useLanguage();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewStepIndex, setReviewStepIndex] = useState(0);
  const [importedForm, setImportedForm] = useState<any>(null);
  const [failedFormTitle, setFailedFormTitle] = useState<string>('Google Form');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Checklist kosmetik: mencentang berurutan selama isReviewing. Reset begitu
  // review selesai/batal supaya siklus berikutnya mulai dari awal lagi.
  useEffect(() => {
    if (!isReviewing) {
      setReviewStepIndex(0);
      return;
    }
    const t1 = setTimeout(() => setReviewStepIndex(1), REVIEW_STEP_MS);
    const t2 = setTimeout(() => setReviewStepIndex(2), REVIEW_STEP_MS * 2);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
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

  // Select form using Google Picker
  const handleSelectForm = async () => {
    if (!isAuthenticated) {
      toast.error(t('errorConnectFirst'));
      return;
    }

    setIsSelecting(true);
    setImportError(null);
    let selectedFile: any = null;
    try {
      selectedFile = await googlePicker.showFormsPicker();

      if (!selectedFile) {
        setIsSelecting(false);
        return;
      }

      setFailedFormTitle(selectedFile.name || 'Google Form');

      // Momen auto-review terlihat mulai di sini — SETELAH file terbukti
      // dipilih, bukan sejak picker dibuka (lihat doc comment file).
      setIsReviewing(true);
      const startTime = Date.now();

      // Extract form data
      const result = await googleFormsApi.extractToSurveyInfo(selectedFile.id);

      // Ensure review loading state is at least 6 seconds (6000ms)
      const elapsedTime = Date.now() - startTime;
      const minDuration = 6000;
      if (elapsedTime < minDuration) {
        await new Promise((resolve) => setTimeout(resolve, minDuration - elapsedTime));
      }

      if (result) {
        // Google Drive file name (Picker) dan Google Forms internal title
        // (API info.title) adalah dua hal yang independen. User bisa rename
        // file di Drive tanpa mengubah judul form di editor — Picker
        // menampilkan file name, jadi kita pakai itu sebagai title agar
        // sesuai dengan apa yang user pilih dan lihat.
        const pickerName = selectedFile?.name;
        if (pickerName && result.title && pickerName !== result.title) {
          console.warn(
            `[Google Import] Title mismatch — Picker: "${pickerName}" vs API: "${result.title}". Using Picker name.`
          );
        }

        const extractedData = {
          surveyUrl: result.url,
          title: pickerName || result.title,
          description: result.description,
          questionCount: result.questionCount,
          isManualEntry: false,
          hasPersonalDataQuestions: result.hasPersonalDataQuestions || false,
          detectedKeywords: result.detectedKeywords || []
        };

        setImportedForm(extractedData);
        toast.success(t('reviewSuccess'));
      } else {
        throw new Error(t('errorExtractFormData'));
      }
    } catch (error: any) {
      console.error('Error selecting form:', error);

      // Toast notification sederhana
      toast.error(t('errorSelectForm'));

      // Detail error persisten di card
      const errMsg = error.message;
      if (errMsg === 'errorFormNotPublished' || errMsg === 'errorFormRestricted') {
        setImportError(t('technicalIssueReasonNote'));
      } else {
        setImportError(errMsg || t('technicalIssueReasonNote'));
      }
    } finally {
      setIsSelecting(false);
      setIsReviewing(false);
    }
  };

  const reviewChecklist = [
    t('autoReviewCheckQuestions'),
    t('autoReviewCheckPersonalData'),
    t('autoReviewCheckSummary'),
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Keamanan — ringkas + accordion (v6), di luar kartu Step 1 (permintaan
          user setelah melihat draft: aksesnya milik keseluruhan proses import,
          bukan cuma milik langkah "Hubungkan Google"). Dulu panel emerald
          raksasa (shield dekoratif + 3 sub-kartu ber-hover) yang jadi blok
          tertinggi di layar, mendorong tombol Hubungkan ke bawah fold. */}
      {!isAuthenticated && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-3 overflow-hidden">
          <Accordion type="single" collapsible>
            <AccordionItem value="safety" className="border-b-0">
              <AccordionPrimitive.Header className="flex">
                <AccordionPrimitive.Trigger className="flex flex-1 items-center gap-2 py-2.5 min-h-11 text-left [&[data-state=open]>svg]:rotate-180">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span className="flex-1 text-xs font-semibold text-emerald-900">{t('googleSafetyToggle')}</span>
                  <ChevronDown className="w-4 h-4 shrink-0 text-emerald-600/60 transition-transform duration-200" />
                </AccordionPrimitive.Trigger>
              </AccordionPrimitive.Header>
              <AccordionContent className="pb-2.5 pt-0">
                <div className="space-y-1 pl-6">
                  <p className="text-xs text-emerald-800/80">✓ {t('googleSafetyPoint1')}</p>
                  <p className="text-xs text-emerald-800/80">✓ {t('googleSafetyPoint2')}</p>
                  <p className="text-xs text-emerald-800/80">✓ {t('googleSafetyPoint3')}</p>
                  <p className="text-xs text-emerald-700/60 mt-1.5">· {t('permissionDrive')}</p>
                  <p className="text-xs text-emerald-700/60">· {t('permissionForms')}</p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}

      {!isAuthenticated ? (
        <>
          {/* Step 1: Connect to Google */}
          <div className="rounded-xl border border-gray-100 p-3 md:p-3.5">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-8 h-8 rounded-lg bg-jfu-primary/[0.08] text-jfu-primary font-bold text-sm inline-flex items-center justify-center shrink-0">1</span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[#1a1a1a]">{t('googleConnectTitle')}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{t('googleConnectDescription')}</p>
              </div>
            </div>

            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-11 font-semibold rounded-xl bg-white text-[#3c4043] border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t('connecting')}
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  {t('googleConnectButton')}
                </>
              )}
            </button>

            {connectError && (
              <div className="mt-3 p-3 rounded-xl border border-rose-200 bg-rose-50 flex gap-2.5 items-start">
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
          </div>

          {/* Step 2 preview — redup, sama treatment dengan baris coming-soon
              di kartu pintu-masuk (aria-disabled, tanpa tombol). */}
          <div aria-disabled="true" className="flex items-center gap-3 px-1">
            <span className="w-8 h-8 rounded-lg bg-gray-100 text-gray-400 font-bold text-sm inline-flex items-center justify-center shrink-0">2</span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-400">{t('titleSelectForm')}</h3>
              <p className="text-xs text-gray-400 mt-0.5">{t('descriptionSelectForm')}</p>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Step 1 success */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-3 md:p-3.5">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 inline-flex items-center justify-center shrink-0">
                <Check className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-[#1a1a1a]">{t('googleConnectedTitle')}</h3>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <p className="text-xs text-emerald-700 font-medium truncate">
                    {googleEmail ? t('connectedAsEmail').replace('{email}', googleEmail) : t('googleConnectedMessage')}
                  </p>
                  <button onClick={handleChangeAccount} className="text-xs font-semibold text-emerald-700 hover:underline shrink-0">
                    {t('changeGoogleAccount')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          {importedForm ? (
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
                {t('reviewingSystem')}
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
            <div className="rounded-xl border border-gray-100 p-3 md:p-3.5">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-lg bg-jfu-primary/[0.08] text-jfu-primary font-bold text-sm inline-flex items-center justify-center shrink-0">2</span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[#1a1a1a]">{t('titleSelectForm')}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{t('descriptionSelectForm')}</p>
                </div>
              </div>

              <button
                onClick={handleSelectForm}
                disabled={isSelecting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-11 text-white font-semibold rounded-xl bg-jfu-primary hover:bg-jfu-dark disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {isSelecting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )}
                {t('buttonSelectForm')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
