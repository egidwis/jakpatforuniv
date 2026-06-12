
import { useState } from 'react';
import { simpleGoogleAuth, type AuthResult } from '../utils/google-auth-simple';
import { googlePicker } from '../utils/google-picker-browser';
import { googleFormsApi } from '../utils/google-forms-api-browser';
import type { SurveyFormData } from '../types';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../i18n/LanguageContext';
import { PersonalDataWarningModal } from './PersonalDataWarningModal';

interface GoogleDriveImportSimpleProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  onFormDataLoaded: () => void;
  onCancel?: () => void;
}

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
  const [importedForm, setImportedForm] = useState<any>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

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
    try {
      const selectedFile = await googlePicker.showFormsPicker();

      if (!selectedFile) {
        setIsSelecting(false);
        return;
      }

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
        const extractedData = {
          surveyUrl: result.url,
          title: result.title,
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
        setImportError(t(errMsg));
      } else {
        setImportError(errMsg || t('errorExtractFormData'));
      }
    } finally {
      setIsSelecting(false);
    }
  };

  return (
    <div className="google-drive-simple-container">
      {!isAuthenticated ? (
        <div className="flex flex-col gap-4">
          {/* Step 1: Connect to Google */}
          <div className="google-step-card">
            <div className="google-step-header">
              <div className="google-step-number">1</div>
              <div className="google-step-content">
                <h3 className="google-step-title">{t('googleConnectTitle')}</h3>
                <p className="google-step-description">
                  {t('googleConnectDescription')}
                </p>
              </div>
            </div>



            {/* Safety Note Redesigned */}
            <div className="mb-6 relative overflow-hidden rounded-xl border bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm" style={{ borderColor: '#a7f3d0' }}>
              {/* Decorative background element */}
              <div className="absolute -right-6 -top-6 opacity-[0.07]">
                <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>

              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4 border-b border-emerald-100 pb-3">
                  <div className="p-2 bg-emerald-100 rounded-lg shrink-0 text-emerald-600 shadow-sm">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-900 text-base">Jaminan Keamanan 100%</h4>
                    <p className="text-xs text-emerald-700 font-medium">Privasi data Anda adalah prioritas kami</p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 mt-1">
                  {/* Item 1 */}
                  <div className="flex items-start gap-3 p-2.5 rounded-lg bg-emerald-50/50 hover:bg-emerald-100/50 transition-colors border border-transparent hover:border-emerald-100">
                    <div className="bg-emerald-100/80 p-1.5 rounded-md text-emerald-600 shrink-0 mt-0.5">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <line x1="2" x2="22" y1="2" y2="22" />
                      </svg>
                    </div>
                    <div>
                      <h5 className="font-semibold text-emerald-900 text-[11px] uppercase tracking-wide mb-0.5">Tanpa Akses Penuh</h5>
                      <p className="text-[11px] text-emerald-700 leading-relaxed">
                        Kami <strong className="font-bold text-emerald-800">TIDAK BISA</strong> melihat atau mengakses seluruh file di Google Drive Anda.
                      </p>
                    </div>
                  </div>

                  {/* Item 2 */}
                  <div className="flex items-start gap-3 p-2.5 rounded-lg bg-emerald-50/50 hover:bg-emerald-100/50 transition-colors border border-transparent hover:border-emerald-100">
                    <div className="bg-emerald-100/80 p-1.5 rounded-md text-emerald-600 shrink-0 mt-0.5">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15.08 9.59 12 4.5 8.92 9.59a1 1 0 0 0 .16 1.21l1.52 1.52a2 2 0 0 1 .59 1.41V21h1.62v-7.27a2 2 0 0 1 .59-1.41l1.52-1.52a1 1 0 0 0 .16-1.21Z" />
                        <path d="M12 4.5V2" />
                        <path d="m8.92 9.59-1.92-1.92" />
                        <path d="m15.08 9.59 1.92-1.92" />
                      </svg>
                    </div>
                    <div>
                      <h5 className="font-semibold text-emerald-900 text-[11px] uppercase tracking-wide mb-0.5">Akses Terpilih</h5>
                      <p className="text-[11px] text-emerald-700 leading-relaxed">
                        Sistem hanya membaca <strong className="font-bold text-emerald-800">satu file spesifik</strong> yang Anda klik secara manual.
                      </p>
                    </div>
                  </div>

                  {/* Item 3 */}
                  <div className="flex items-start gap-3 p-2.5 rounded-lg bg-emerald-50/50 hover:bg-emerald-100/50 transition-colors border border-transparent hover:border-emerald-100">
                    <div className="bg-emerald-100/80 p-1.5 rounded-md text-emerald-600 shrink-0 mt-0.5">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </div>
                    <div>
                      <h5 className="font-semibold text-emerald-900 text-[11px] uppercase tracking-wide mb-0.5">Hanya Metadata</h5>
                      <p className="text-[11px] text-emerald-700 leading-relaxed">
                        Izin hanya untuk <strong className="font-bold text-emerald-800">menghitung respon</strong>, bukan merekam isinya.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="google-connect-button"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="button-spinner" size={20} />
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
              <div className="mt-4 p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm flex gap-3 items-start animate-fade-in shadow-sm w-full">
                <div className="p-1 bg-red-100 text-red-600 rounded-lg shrink-0 mt-0.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-red-900 mb-0.5">
                    {connectError === 'insufficient_permissions' ? t('errorInsufficientPermissionsTitle') : t('errorConnectGoogleDrive')}
                  </h4>
                  <p className="text-xs text-red-700 leading-relaxed font-medium">
                    {connectError === 'insufficient_permissions' 
                      ? t('errorInsufficientPermissionsDesc') 
                      : connectError}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Step 2 Preview (Disabled) */}
          <div className="google-step-card" style={{ opacity: 0.6, pointerEvents: 'none' }}>
            <div className="google-step-header" style={{ marginBottom: '1.5rem' }}>
              <div className="google-step-number" style={{ background: '#e2e8f0', color: '#94a3b8', boxShadow: 'none' }}>2</div>
              <div className="google-step-content">
                <h3 className="google-step-title" style={{ color: '#64748b' }}>{t('titleSelectForm')}</h3>
                <p className="google-step-description" style={{ color: '#94a3b8' }}>
                  {t('descriptionSelectForm')}
                </p>
              </div>
            </div>

            <div className="w-full flex items-center justify-center gap-2 px-4 py-3 font-medium rounded-xl bg-gray-100 text-gray-400 border border-gray-200">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {t('buttonSelectForm')}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Step 1 Success */}
          <div className="google-step-card google-step-success">
            <div className="google-step-header" style={{ marginBottom: 0 }}>
              <div className="google-step-number google-step-number-success">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="google-step-content flex-1">
                <h3 className="google-step-title text-gray-900 m-0">{t('googleConnectedTitle')}</h3>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <p className="google-step-description text-green-600 font-medium m-0">
                    {googleEmail ? `Terhubung dengan ${googleEmail}` : t('googleConnectedMessage')}
                  </p>
                  {googleEmail && <span className="text-emerald-300/60 font-bold">•</span>}
                  <button
                    onClick={handleChangeAccount}
                    className="text-sm font-semibold text-emerald-600 hover:text-emerald-800 underline decoration-emerald-600/30 hover:decoration-emerald-800 transition-colors focus:outline-none"
                  >
                    Ganti Akun
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 Success (if importedForm) or Active (if !importedForm) */}
          {importedForm ? (
            <div className={`google-step-card ${importedForm.hasPersonalDataQuestions ? 'border-amber-200 bg-amber-50/30' : 'google-step-success'}`}>
              <div className="google-step-header" style={{ marginBottom: importedForm.hasPersonalDataQuestions ? '1rem' : 0 }}>
                <div
                  className={`google-step-number ${importedForm.hasPersonalDataQuestions ? 'shadow-md shadow-amber-500/20 text-white' : 'google-step-number-success'}`}
                  style={importedForm.hasPersonalDataQuestions ? { background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' } : {}}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="google-step-content flex-1">
                  <h3 className="google-step-title text-gray-900 m-0">Survey Terpilih</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <p className={`google-step-description font-medium m-0 truncate max-w-[200px] sm:max-w-[300px] ${importedForm.hasPersonalDataQuestions ? 'text-amber-700' : 'text-green-600'}`} title={importedForm.title}>
                      {importedForm.title}
                    </p>
                    <span className={`${importedForm.hasPersonalDataQuestions ? 'text-amber-300' : 'text-emerald-300/60'} font-bold`}>•</span>
                    <button
                      onClick={handleChangeForm}
                      className={`text-sm font-semibold hover:underline transition-colors focus:outline-none ${importedForm.hasPersonalDataQuestions ? 'text-amber-600 hover:text-amber-800 decoration-amber-600/30 hover:decoration-amber-800' : 'text-emerald-600 hover:text-emerald-800 decoration-emerald-600/30 hover:decoration-emerald-800'}`}
                    >
                      Ganti Form
                    </button>
                  </div>
                </div>
              </div>

              {importedForm.hasPersonalDataQuestions && (
                <div className="pt-2 border-t border-amber-100 mt-2">
                  <div className="p-3.5 rounded-xl bg-amber-100/50 border border-amber-200/60 flex flex-col gap-2">
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-amber-200 text-amber-700 rounded-lg shrink-0">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                          <path d="M12 9v4" />
                          <path d="M12 17h.01" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-bold text-amber-900 text-sm">Terdeteksi Pertanyaan Data Pribadi</h4>
                        <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                          Sistem mendeteksi form ini menanyakan: <strong className="bg-amber-200/60 px-1 py-0.5 rounded">{importedForm.detectedKeywords.join(', ')}</strong>.
                          Sesuai <a href="/terms-conditions.html" target="_blank" rel="noopener noreferrer" className="font-bold underline decoration-amber-700/30 hover:text-amber-900 transition-colors">Syarat dan Ketentuan</a>, form ini akan memerlukan <strong>Review Manual</strong> oleh tim admin.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="google-step-card">
              <div className="google-step-header">
                <div className="google-step-number">2</div>
                <div className="google-step-content">
                  <h3 className="google-step-title">{t('titleSelectForm')}</h3>
                  <p className="google-step-description">
                    {t('descriptionSelectForm')}
                  </p>
                </div>
              </div>
 
              <button
                onClick={handleSelectForm}
                disabled={isSelecting}
                className="w-full mt-6 flex items-center justify-center gap-2 px-4 py-3 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)',
                  boxShadow: '0 4px 12px rgba(0, 145, 255, 0.3)'
                }}
              >
                {isSelecting ? (
                  <>
                    <Loader2 className="button-spinner" size={20} />
                    {t('reviewingSystem')}
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {t('buttonSelectForm')}
                  </>
                )}
              </button>

              {importError && (
                <div className="mt-4 p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm flex gap-3 items-start animate-fade-in shadow-sm w-full">
                  <div className="p-1 bg-red-100 text-red-600 rounded-lg shrink-0 mt-0.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-red-900 mb-0.5">
                      {t('errorSelectForm')}
                    </h4>
                    <p className="text-xs text-red-700 leading-relaxed font-medium">
                      {importError}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Proceed Buttons */}
          {importedForm && (
            <div className="flex flex-col gap-3 mt-4">
              <button
                onClick={handleProceed}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-white font-medium rounded-xl transition-all hover:shadow-lg hover:-translate-y-0.5"
                style={{
                  background: importedForm.hasPersonalDataQuestions
                    ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' // amber
                    : 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)', // blue
                  boxShadow: importedForm.hasPersonalDataQuestions
                    ? '0 4px 12px rgba(245, 158, 11, 0.3)'
                    : '0 4px 12px rgba(0, 145, 255, 0.3)'
                }}
              >
                {importedForm.hasPersonalDataQuestions ? 'Lanjut ke Review Admin' : 'Import'}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>

              {importedForm.hasPersonalDataQuestions && (
                <button
                  onClick={() => {
                    toast.info('Silakan hapus pertanyaan data pribadi di Google Form Anda, lalu import ulang.', { duration: 5000 });
                    if (onCancel) onCancel();
                    else handleChangeForm();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3.5 font-bold rounded-xl transition-all border-2 border-amber-400 text-amber-600 bg-white hover:bg-amber-50 hover:border-amber-500 shadow-sm hover:shadow active:scale-[0.98]"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  Batal & Edit Form
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
