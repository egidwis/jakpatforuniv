import { useState } from 'react';
import { simpleGoogleAuth, type AuthResult } from '../utils/google-auth-simple';
import { googlePicker } from '../utils/google-picker-browser';
import { googleFormsApi } from '../utils/google-forms-api-browser';
import type { SurveyFormData } from '../types';
import { Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../i18n/LanguageContext';
import { PersonalDataWarningModal } from './PersonalDataWarningModal';

interface GoogleDriveImportSimpleProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  onFormDataLoaded: () => void;
}

export function GoogleDriveImportSimple({
  updateFormData,
  onFormDataLoaded
}: GoogleDriveImportSimpleProps) {
  const { t } = useLanguage();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [showPersonalDataWarning, setShowPersonalDataWarning] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<any>(null);

  // Connect to Google
  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const authResult: AuthResult = await simpleGoogleAuth.requestAccessToken();

      if (!authResult.success) {
        throw new Error(authResult.error || 'Failed to connect');
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

      toast.error(error.message || t('errorConnectGoogleDrive'));
    } finally {
      setIsConnecting(false);
    }
  };

  // Select form using Google Picker
  const handleSelectForm = async () => {
    if (!isAuthenticated) {
      toast.error(t('errorConnectFirst'));
      return;
    }

    setIsSelecting(true);
    try {
      const selectedFile = await googlePicker.showFormsPicker();

      if (!selectedFile) {
        setIsSelecting(false);
        return;
      }

      // Extract form data
      const result = await googleFormsApi.extractToSurveyInfo(selectedFile.id);

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

        // Check if form contains personal data
        if (result.hasPersonalDataQuestions && result.detectedKeywords && result.detectedKeywords.length > 0) {
          // Show warning modal instead of directly updating
          setPendingFormData(extractedData);
          setShowPersonalDataWarning(true);
          setIsSelecting(false);
        } else {
          // No personal data detected, proceed normally
          updateFormData(extractedData);
          toast.success(t('successFormImported').replace('{title}', result.title));
          onFormDataLoaded();
        }
      } else {
        throw new Error(t('errorExtractFormData'));
      }
    } catch (error: any) {
      console.error('Error selecting form:', error);
      toast.error(error.message || t('errorSelectForm'));
    } finally {
      setIsSelecting(false);
    }
  };

  // Handle user decision on personal data warning
  const handleWarningContinue = () => {
    if (pendingFormData) {
      updateFormData(pendingFormData);
      toast.success(t('successFormImported').replace('{title}', pendingFormData.title));
      setShowPersonalDataWarning(false);
      setPendingFormData(null);
      onFormDataLoaded();
    }
  };

  const handleWarningCancel = () => {
    setShowPersonalDataWarning(false);
    setPendingFormData(null);
    toast.info('Silakan edit Google Form Anda dan hapus pertanyaan data pribadi, kemudian import ulang.');
  };

  return (
    <div className="google-drive-simple-container">
      {/* Personal Data Warning Modal */}
      {showPersonalDataWarning && pendingFormData && (
        <PersonalDataWarningModal
          detectedKeywords={pendingFormData.detectedKeywords || []}
          onContinue={handleWarningContinue}
          onCancel={handleWarningCancel}
        />
      )}
      {!isAuthenticated ? (
        /* Step 1: Connect to Google */
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

          <div className="google-permissions-list">
            <div className="permission-item">
              <CheckCircle className="permission-icon" size={18} />
              <span>{t('permissionDrive')}</span>
            </div>
            <div className="permission-item">
              <CheckCircle className="permission-icon" size={18} />
              <span>{t('permissionForms')}</span>
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
        </div>
      ) : (
        /* Step 2: Select Form */
        <div className="google-step-card google-step-success">
          <div className="google-step-header">
            <div className="google-step-number google-step-number-success">
              <CheckCircle size={20} />
            </div>
            <div className="google-step-content">
              <h3 className="google-step-title">{t('googleConnectedTitle')}</h3>
              <p className="google-step-description google-step-description-success">
                {t('googleConnectedMessage')}
              </p>
            </div>
          </div>

          <div className="google-step-divider"></div>

          <div className="google-step-header" style={{ marginTop: '1.5rem' }}>
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
            className="google-select-button"
          >
            {isSelecting ? (
              <>
                <Loader2 className="button-spinner" size={20} />
                {t('loading')}
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
        </div>
      )}
    </div>
  );
}
