import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { simpleGoogleAuth, type AuthResult } from '../utils/google-auth-simple';
import { googleDrive } from '../utils/google-drive-browser';
import { googleFormsApi } from '../utils/google-forms-api-browser';
import { googlePicker } from '../utils/google-picker-browser';
import type { SurveyFormData } from '../types';
import { Loader2, ExternalLink, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../i18n/LanguageContext';

interface GoogleDriveImportProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  onFormDataLoaded: () => void;
}

interface GoogleForm {
  id: string;
  name: string;
  webViewLink?: string;
  modifiedTime?: string;
}

export function GoogleDriveImport({ formData, updateFormData, onFormDataLoaded }: GoogleDriveImportProps) {
  const { t } = useLanguage();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [isExtractingForm, setIsExtractingForm] = useState(false);
  const [foundForms, setFoundForms] = useState<GoogleForm[]>([]);
  const [showFormSelection, setShowFormSelection] = useState(false);

  // Disable body scroll when modal is open and ensure full viewport coverage
  useEffect(() => {
    if (showFormSelection) {
      document.body.style.overflow = 'hidden';
      // Force full viewport coverage
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
      document.documentElement.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
      document.documentElement.style.overflow = 'unset';
    };
  }, [showFormSelection]);

  // Connect to Google Drive - Simplified version
  const connectToGoogle = async () => {
    if (!privacyAccepted) {
      toast.error(t('pleaseAcceptPrivacy'));
      return;
    }

    setIsConnecting(true);
    try {
      console.log('🔄 Initializing Google Authentication...');

      // Initialize and request access token
      const authResult: AuthResult = await simpleGoogleAuth.requestAccessToken();

      if (!authResult.success) {
        throw new Error(authResult.error || t('failedToConnect'));
      }

      console.log('✅ Google authentication successful');
      setIsAuthenticated(true);
      setUserInfo({ email: 'Authenticated User' }); // Simplified for testing

      toast.success(
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <div>
            <p className="font-medium">{t('connectedSuccessMessage')}</p>
            <p className="text-sm">{t('authenticationSuccessful')}</p>
          </div>
        </div>
      );
    } catch (error: any) {
      console.error('❌ Error connecting to Google:', error);
      toast.error(error.message || t('failedToConnect'));
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect from Google
  const disconnectGoogle = async () => {
    try {
      simpleGoogleAuth.revoke();
      setIsAuthenticated(false);
      setUserInfo(null);
      toast.success(t('disconnectedSuccess'));
    } catch (error) {
      console.error('Error disconnecting:', error);
      toast.error(t('failedToDisconnect'));
    }
  };

  // Search for forms in Google Drive using Google Picker
  const searchFormsInDrive = async () => {
    if (!isAuthenticated) {
      toast.error(t('pleaseAcceptPrivacy'));
      return;
    }

    setIsLoadingForms(true);
    try {
      console.log('🔍 Opening Google Picker to select forms...');

      // Use Google Picker API for file selection (works with drive.file scope)
      const selectedFile = await googlePicker.showFormsPicker();

      if (!selectedFile) {
        console.log('No file selected from picker');
        toast.info('No form selected');
        setIsLoadingForms(false);
        return;
      }

      console.log('Form selected from picker:', selectedFile.name);

      // Extract form data from selected file
      await extractFormFromFile(selectedFile.id, selectedFile.name);

    } catch (error: any) {
      console.error('Error with Google Picker:', error);
      
      if (error.message?.includes('API key')) {
        toast.error('API key tidak valid. Menggunakan mode fallback...');
        // Show a simple input for manual form ID entry
        const formId = prompt('Masukkan ID Google Form (dari URL form):');
        if (formId) {
          await extractFormFromFile(formId, 'Manual Entry');
        }
      } else {
        toast.error(error.message || 'Gagal mengakses Google Drive');
      }
    } finally {
      setIsLoadingForms(false);
    }
  };

  // Handle form selection
  const selectForm = async (form: GoogleForm) => {
    console.log('User selected form:', form.name);
    setShowFormSelection(false);
    toast.info(`Mengimpor form: ${form.name}`);
    await extractFormFromFile(form.id, form.name);
  };

  // Simple Modal without Portal first - let's debug
  const FormSelectionModal = () => {
    if (!showFormSelection || foundForms.length === 0) return null;

    return (
      <div 
        className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4"
        style={{ 
          zIndex: 99999,
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0
        }}
        onClick={() => setShowFormSelection(false)}
      >
        <div 
          className="rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden"
          style={{ 
            backgroundColor: '#ffffff',
            opacity: 1,
            background: 'white',
            zIndex: 100000
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200" style={{ backgroundColor: '#ffffff' }}>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Pilih Google Forms</h3>
              <p className="text-gray-600 mt-1">
                Ditemukan {foundForms.length} Google Forms di Drive Anda
              </p>
            </div>
            <button
              onClick={() => setShowFormSelection(false)}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100"
            >
              ✕
            </button>
          </div>
          
          {/* Content */}
          <div className="p-6 max-h-96 overflow-y-auto" style={{ backgroundColor: '#ffffff' }}>
            <div className="space-y-3">
              {foundForms.map((form) => (
                <div
                  key={form.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-blue-50 cursor-pointer transition-colors"
                  onClick={() => selectForm(form)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 mb-1 truncate">
                        {form.name}
                      </h4>
                      <p className="text-sm text-gray-500 truncate">
                        ID: {form.id}
                      </p>
                      {form.modifiedTime && (
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(form.modifiedTime).toLocaleDateString('id-ID')}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      {form.webViewLink && (
                        <a
                          href={form.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-blue-600 hover:text-blue-800 rounded"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <button 
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                        onClick={() => selectForm(form)}
                      >
                        Pilih
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Footer */}
          <div className="p-6 border-t border-gray-100" style={{ backgroundColor: '#f9fafb' }}>
            <div className="flex justify-end">
              <button
                onClick={() => setShowFormSelection(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 rounded-lg"
              >
                Batalkan
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Extract form data from selected file
  const extractFormFromFile = async (formId: string, formName: string) => {
    setIsExtractingForm(true);
    try {
      console.log('Extracting form data for:', formId);
      
      // Use Google Forms API for 100% accuracy
      const result = await googleFormsApi.extractToSurveyInfo(formId);
      
      if (result) {
        // Update form data with extracted information
        const extractedData = {
          surveyUrl: result.url,
          title: result.title,
          description: result.description,
          questionCount: result.questionCount,
          isManualEntry: false,
          hasPersonalDataQuestions: result.hasPersonalDataQuestions || false,
          detectedKeywords: result.detectedKeywords || []
        };

        updateFormData(extractedData);

        toast.success(
          <div>
            <p className="font-medium">Form berhasil diimpor dari Google Drive</p>
            <p className="text-sm">Judul: {result.title}</p>
            <p className="text-sm">Pertanyaan: {result.questionCount}</p>
          </div>
        );

        // Notify parent component that form data has been loaded
        onFormDataLoaded();
      } else {
        throw new Error('Gagal mengekstrak data form');
      }
    } catch (error: any) {
      console.error('Error extracting form:', error);
      
      // If API extraction fails, fall back to URL-based extraction
      try {
        const fallbackUrl = `https://docs.google.com/forms/d/${formId}/viewform`;
        updateFormData({ 
          surveyUrl: fallbackUrl,
          title: formName || 'Google Form',
          isManualEntry: true 
        });
        
        toast.warning(
          <div>
            <p className="font-medium">Form diimpor dengan informasi terbatas</p>
            <p className="text-sm">Silakan lengkapi detail form secara manual</p>
          </div>
        );
        
        onFormDataLoaded();
      } catch (fallbackError) {
        toast.error(error.message || 'Gagal mengimpor form');
      }
    } finally {
      setIsExtractingForm(false);
    }
  };

  // Simple error handling
  try {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-medium mb-4">Impor Pertanyaan dari Google Forms</h3>
      
      {!isAuthenticated ? (
        <>
          {/* Connect to Google Drive Section */}
          <div className="flex items-start gap-4 mb-6">
            {/* Google Drive Icon */}
            <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.3 3.7L8.6 10.3L7.7 8.8L12.3 3.7M9.9 13.5L7.1 8.8L4.3 13.5H9.9M14.2 13.5L16.5 9.7L19.3 13.5H14.2M11.4 14.5H4.9L4.2 15.5L11.4 14.5M12.6 14.5L11.4 14.5L12.6 14.5M13.8 14.5L11.4 14.5L19.8 15.5L13.8 14.5M12.3 20.3L7.7 13.5L16.9 13.5L12.3 20.3Z" />
              </svg>
            </div>
            
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 mb-2">{t('accessGoogleDriveTitle')}</h4>
              <p className="text-sm text-gray-600 mb-4">
                {t('connectGoogleMessage')}
              </p>

              {/* Privacy Policy Checkbox */}
              <div className="flex items-start gap-3 mb-4">
                <input
                  id="privacy-checkbox"
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={(e) => setPrivacyAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="privacy-checkbox" className="text-sm text-gray-600">
                  {t('agreeToGiveAccess')}{' '}
                  <a href="https://jakpatforuniv.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {t('privacyPolicy')}
                  </a>{' '}
                  Jakpat.
                </label>
              </div>

              {/* Connect Button */}
              <button
                onClick={connectToGoogle}
                disabled={isConnecting || !privacyAccepted}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('connecting')}
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4" />
                    {t('connect')}
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Connected State */}
          <div className="flex items-center justify-between mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <h4 className="font-medium text-green-800">Akses ke Google Drive</h4>
                <p className="text-sm text-green-700">
                  Google kamu berhasil terhubung {userInfo?.email || 'Google Drive'}
                </p>
              </div>
            </div>
            <button
              onClick={disconnectGoogle}
              className="text-sm text-red-600 hover:text-red-800 px-3 py-1 border border-red-300 rounded hover:bg-red-50"
            >
              Hapus Akses
            </button>
          </div>

          {/* Forms Search Section */}
          <div className="mb-6">
            <h4 className="font-medium text-gray-900 mb-2">{t('searchAndImportForms')}</h4>
            <button
              onClick={searchFormsInDrive}
              disabled={isLoadingForms || isExtractingForm}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingForms ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('searchingForms')}
                </>
              ) : isExtractingForm ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('importing')}
                </>
              ) : (
                <>
                  {t('selectGoogleForm')}
                  <span className="text-xs ml-1">{t('fromYourDrive')}</span>
                </>
              )}
            </button>
            <p className="text-sm text-gray-500 mt-2">
              {t('willOpenPicker')}
            </p>
          </div>

          {/* Form Data Preview (if loaded) */}
          {formData.title && formData.questionCount > 0 && (
            <div className="bg-gray-900 text-white p-6 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                <div>
                  <h5 className="text-sm font-medium text-gray-300 mb-2">Judul</h5>
                  <p className="text-white bg-gray-800 px-3 py-2 rounded">{formData.title}</p>
                </div>
                <div>
                  <h5 className="text-sm font-medium text-gray-300 mb-2">Jumlah Pertanyaan</h5>
                  <p className="text-white bg-gray-800 px-3 py-2 rounded">{formData.questionCount}</p>
                </div>
              </div>
              <div>
                <h5 className="text-sm font-medium text-gray-300 mb-2">Deskripsi Survey</h5>
                <p className="text-gray-200 bg-gray-800 px-3 py-2 rounded min-h-[80px]">
                  {formData.description || 'Form description not available'}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Render Modal using Portal */}
      <FormSelectionModal />

      {/* Warning for personal data */}
      {formData.hasPersonalDataQuestions && formData.detectedKeywords && formData.detectedKeywords.length > 0 && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800">Data Pribadi Terdeteksi</p>
              <p className="text-sm text-yellow-700 mt-1">
                Form ini mengandung pertanyaan yang meminta data pribadi: {formData.detectedKeywords.join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}
      </div>
    );
  } catch (error) {
    console.error('[GoogleDriveImport] Render error:', error);
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-medium mb-4 text-red-800">Google Drive Import Error</h3>
        <p className="text-sm text-red-600">
          There was an error loading the Google Drive import feature. Please try refreshing the page.
        </p>
      </div>
    );
  }
}