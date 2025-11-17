import { useState } from 'react';
import type { SurveyFormData } from '../types';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PersonalDataWarningDialog } from './ui/Dialog';
import { GoogleDriveImport } from './GoogleDriveImport';
import { extractFormInfoWithWorker, extractFormInfoFallback, isWorkerSupported } from '../utils/worker-service';
import { useLanguage } from '../i18n/LanguageContext';

interface StepOneProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  nextStep: () => void;
}

export function StepOne({ formData, updateFormData, nextStep }: StepOneProps) {
  const { t } = useLanguage();
  const [surveySource, setSurveySource] = useState<'google' | 'other' | null>(null);
  const [showFormFields, setShowFormFields] = useState(false);
  const [showPersonalDataWarning, setShowPersonalDataWarning] = useState(false);
  const [detectedKeywords, setDetectedKeywords] = useState<string[]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Handle source selection
  const handleSourceSelection = (source: 'google' | 'other') => {
    setSurveySource(source);
    
    if (source === 'other') {
      // Reset form data for manual entry
      updateFormData({ 
        surveyUrl: '',
        title: '',
        description: '',
        questionCount: 0,
        isManualEntry: true 
      });
      setShowFormFields(true);
    } else {
      // Reset form data for Google import
      updateFormData({ 
        surveyUrl: '',
        title: '',
        description: '',
        questionCount: 0,
        isManualEntry: false 
      });
      setShowFormFields(false);
    }
  };

  // Handle URL change for other sources
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    updateFormData({ surveyUrl: url, isManualEntry: true });
  };

  // Handle preview button click
  const handlePreview = async () => {
    if (!formData.surveyUrl) {
      toast.error('Masukkan URL survei terlebih dahulu');
      return;
    }

    setIsPreviewLoading(true);

    try {
      // Clean up URL first - convert preview/edit URLs to viewform
      let cleanUrl = formData.surveyUrl;

      // Convert /preview to /viewform
      if (cleanUrl.includes('/preview')) {
        cleanUrl = cleanUrl.replace('/preview', '/viewform');
      }

      // Convert /edit to /viewform
      if (cleanUrl.includes('/edit')) {
        cleanUrl = cleanUrl.replace('/edit', '/viewform');
      }

      console.log('Starting form extraction for cleaned URL:', cleanUrl);

      let surveyInfo;

      // Always use fallback method for better reliability with Google Forms
      console.log('Using fallback method for Google Forms extraction');
      surveyInfo = await extractFormInfoFallback(cleanUrl);

      console.log('Form extraction completed:', surveyInfo);

      // Update form data with extracted info
      updateFormData({
        surveyUrl: cleanUrl, // Use cleaned URL
        title: surveyInfo.title || '',
        description: surveyInfo.description || '',
        questionCount: surveyInfo.questionCount || 0,
        hasPersonalDataQuestions: surveyInfo.hasPersonalDataQuestions || false,
        detectedKeywords: surveyInfo.detectedKeywords || [],
        isManualEntry: false // Mark as auto-filled
      });

      // Show success message
      toast.success('Data survei berhasil diambil!');

      // Check for personal data warnings
      if (surveyInfo.hasPersonalDataQuestions && surveyInfo.detectedKeywords && surveyInfo.detectedKeywords.length > 0) {
        setDetectedKeywords(surveyInfo.detectedKeywords);
        setShowPersonalDataWarning(true);
      }

    } catch (error: any) {
      console.error('Error extracting form info:', error);

      // Handle specific error types
      if (error.message === 'FORM_NOT_PUBLIC') {
        toast.error('Form tidak dapat diakses. Pastikan form bersifat publik dan dapat diakses oleh semua orang.');
      } else if (error.message === 'WORKER_TIMEOUT' || error.message === 'REQUEST_TIMEOUT') {
        toast.error('Waktu tunggu habis. Coba lagi atau isi data secara manual.');
      } else if (error.message === 'NON_GOOGLE_FORM') {
        toast.error('Saat ini hanya mendukung Google Forms. Untuk platform lain, silakan isi data secara manual.');
      } else {
        toast.error('Gagal mengambil data survei. Silakan isi data secara manual.');
      }
    } finally {
      setIsPreviewLoading(false);
    }
  };


  // Fungsi untuk validasi form
  const validateForm = () => {
    if (!formData.surveyUrl) {
      toast.error('Masukkan URL survei terlebih dahulu');
      return false;
    }

    if (!formData.title) {
      toast.error('Judul survei tidak boleh kosong');
      return false;
    }

    if (!formData.description) {
      toast.error('Deskripsi survei tidak boleh kosong');
      return false;
    }

    if (formData.questionCount <= 0) {
      toast.error('Jumlah pertanyaan harus lebih dari 0');
      return false;
    }

    if (!formData.criteriaResponden) {
      toast.error('Kriteria responden tidak boleh kosong');
      return false;
    }

    if (formData.duration <= 0) {
      toast.error('Durasi survei harus lebih dari 0 hari');
      return false;
    }

    if (formData.winnerCount < 2) {
      toast.error('Jumlah pemenang minimal 2 orang');
      return false;
    }

    if (formData.prizePerWinner < 25000) {
      toast.error('Hadiah per pemenang minimal Rp 25.000');
      return false;
    }

    return true;
  };

  // Fungsi untuk handle submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (validateForm()) {
      nextStep();
    }
  };

  // Fungsi untuk handle modal warning
  const handlePersonalDataWarningClose = () => {
    console.log("[DEBUG] Closing personal data warning modal");
    setShowPersonalDataWarning(false);
    setShowFormFields(true);
  };

  // Handle form data loaded from Google Drive
  const handleGoogleDriveFormLoaded = () => {
    console.log("[DEBUG] Form loaded from Google Drive");
    // Show form fields after Google Drive import
    setShowFormFields(true);
    
    // Check for personal data detection
    if (formData.hasPersonalDataQuestions && formData.detectedKeywords && formData.detectedKeywords.length > 0) {
      console.log('[DEBUG] Personal data detected from Google Drive import:', formData.detectedKeywords);
      setDetectedKeywords(formData.detectedKeywords);
      setShowPersonalDataWarning(true);
      setShowFormFields(false); // Hide form fields until warning is dismissed
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">{t('surveyDetails')}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>{t('chooseSurveySource')}</p>

      {/* Source Selection - Google Forms API Hidden for now */}
      {!surveySource && (
        <div className="mb-8 max-w-3xl mx-auto">
          <div className="grid grid-cols-1 gap-4">
            {/* Google Form Option */}
            <div>
              <button
                type="button"
                onClick={() => handleSourceSelection('google')}
                className="option-button w-full p-6 border-2 rounded-lg transition-all duration-200 text-left group"
                style={{
                  borderColor: 'var(--border)',
                  backgroundColor: 'var(--card)',
                }}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center group-hover:bg-green-200 dark:group-hover:bg-green-900/50 transition-colors">
                    <svg className="w-6 h-6 text-green-600 dark:text-green-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--foreground)' }}>{t('googleFormOption')}</h3>
                    <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>
                      {t('googleFormDescription')}
                    </p>
                    <div className="flex items-center text-xs text-green-600 dark:text-green-400">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      {t('googleDriveAccess')}
                    </div>
                  </div>
                </div>
              </button>
            </div>

            {/* From other source Option */}
            <button
              type="button"
              onClick={() => handleSourceSelection('other')}
              className="option-button w-full p-6 border-2 rounded-lg transition-all duration-200 text-left group"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--card)',
              }}
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-2" style={{ color: 'var(--foreground)' }}>{t('otherSourceOption')}</h3>
                  <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>
                    {t('otherSourceDescription')}
                  </p>
                  <div className="flex items-center text-xs text-blue-600 dark:text-blue-400">
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    {t('manualInputRequired')}
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Google Drive Import Section */}
      {surveySource === 'google' && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">{t('importFromGoogleForms')}</h3>
            <button
              type="button"
              onClick={() => setSurveySource(null)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {t('backToSourceSelection')}
            </button>
          </div>
          
          <GoogleDriveImport 
            formData={formData}
            updateFormData={updateFormData}
            onFormDataLoaded={handleGoogleDriveFormLoaded}
          />
        </div>
      )}

      {/* URL Input Section - Now Primary Flow */}
      {surveySource === 'other' && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-4">{t('completeFormBelow')}</h3>

          <div className="form-group">
            <label htmlFor="surveyUrl" className="form-label">{t('googleFormLink')}</label>
            <div className="flex gap-2">
              <input
                id="surveyUrl"
                type="text"
                className="form-input flex-1"
                placeholder={t('googleFormLinkPlaceholder')}
                value={formData.surveyUrl}
                onChange={handleUrlChange}
              />
              <button
                type="button"
                onClick={handlePreview}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                disabled={!formData.surveyUrl || isPreviewLoading}
              >
                {isPreviewLoading ? t('loading') : t('preview')}
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {t('googleFormLinkHelp')}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Form Fields - Show when survey source is selected and data is available */}
        {(surveySource === 'other' || (surveySource === 'google' && formData.title && !formData.isManualEntry)) && (
          <>
            {/* Show success info for Google Drive imports */}
            {surveySource === 'google' && !formData.isManualEntry && formData.title && (
              <div className="info-box success mb-4">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-800">Data berhasil diimport dari Google Drive</p>
                    <p className="text-xs text-green-700 mt-1">
                      Judul, deskripsi, dan jumlah pertanyaan telah diisi otomatis berdasarkan form Google Anda.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION: SURVEY INFORMATION */}
            <div className="section-card">
              <div className="section-header">
                <span className="section-icon">📝</span>
                <h3 className="section-title">SURVEY INFORMATION</h3>
                {formData.title && formData.description && formData.questionCount > 0 && (
                  <span className="section-badge">✓</span>
                )}
              </div>

              {/* Show Link Survey for Google Drive imports */}
              {surveySource === 'google' && formData.surveyUrl && (
                <div className="form-group mb-6">
                  <label htmlFor="importedSurveyUrl" className="form-label">
                    Link Survey <span className="text-xs text-gray-500 ml-2">(dari Google Drive)</span>
                  </label>
                  <div className="input-wrapper">
                    <input
                      id="importedSurveyUrl"
                      type="text"
                      className="form-input bg-gray-50 text-gray-700 input-with-validation"
                      value={formData.surveyUrl}
                      readOnly
                    />
                    <CheckCircle className="validation-icon valid" />
                  </div>
                  <span className="helper-text">Link Google Form yang diimport dari Drive Anda</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="form-group">
                  <label htmlFor="title" className="form-label">
                    {t('surveyTitle')} <span className="text-red-500">*</span>
                    {surveySource === 'google' && <span className="text-xs text-gray-500 ml-2">{t('surveyTitleFromGoogleDrive')}</span>}
                  </label>
                  <div className="input-wrapper">
                    <input
                      id="title"
                      type="text"
                      className={`form-input input-with-validation ${surveySource === 'google' ? 'bg-gray-50 text-gray-700' : ''}`}
                      placeholder={t('surveyTitlePlaceholder')}
                      value={formData.title}
                      onChange={(e) => updateFormData({ title: e.target.value })}
                      readOnly={surveySource === 'google'}
                      required
                    />
                    {formData.title && (
                      <CheckCircle className="validation-icon valid" />
                    )}
                  </div>
                  <span className="helper-text">e.g., Customer Satisfaction Survey</span>
                </div>

                <div className="form-group">
                  <label htmlFor="questionCount" className="form-label">
                    {t('questionCount')} <span className="text-red-500">*</span>
                    {surveySource === 'google' && <span className="text-xs text-gray-500 ml-2">{t('surveyTitleFromGoogleDrive')}</span>}
                  </label>
                  <div className="input-wrapper">
                    <input
                      id="questionCount"
                      type="number"
                      className={`form-input input-with-validation ${surveySource === 'google' ? 'bg-gray-50 text-gray-700' : ''}`}
                      placeholder={t('questionCountPlaceholder')}
                      value={formData.questionCount || ''}
                      onChange={(e) => updateFormData({ questionCount: parseInt(e.target.value) || 0 })}
                      readOnly={surveySource === 'google'}
                      min={1}
                      required
                    />
                    {formData.questionCount > 0 && (
                      <CheckCircle className="validation-icon valid" />
                    )}
                  </div>
                  {formData.questionCount > 0 && (
                    <span className="helper-text">
                      💰 Rp {formData.questionCount <= 15 ? '150.000' : formData.questionCount <= 30 ? '200.000' : formData.questionCount <= 50 ? '300.000' : formData.questionCount <= 70 ? '400.000' : '500.000'}/hari
                    </span>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="description" className="form-label">
                  {t('surveyDescription')} <span className="text-red-500">*</span>
                  {surveySource === 'google' && <span className="text-xs text-gray-500 ml-2">{t('surveyTitleFromGoogleDrive')}</span>}
                </label>
                <textarea
                  id="description"
                  className={`form-input ${surveySource === 'google' ? 'bg-gray-50 text-gray-700' : ''}`}
                  placeholder={t('surveyDescriptionPlaceholder')}
                  value={formData.description}
                  onChange={(e) => updateFormData({ description: e.target.value })}
                  readOnly={surveySource === 'google'}
                  rows={4}
                  required
                />
                <div className="char-counter">
                  {formData.description.length}/500 characters
                </div>
              </div>
            </div>

            {/* SECTION: SURVEY CONFIGURATION */}
            <div className="section-card">
              <div className="section-header">
                <span className="section-icon">⚙️</span>
                <h3 className="section-title">SURVEY CONFIGURATION</h3>
                {formData.criteriaResponden && formData.duration > 0 && (
                  <span className="section-badge">✓</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="criteriaResponden" className="form-label">
                  Kriteria Responden <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="criteriaResponden"
                  className="form-input"
                  placeholder="Contoh: Usia 18-35 tahun, Domisili Jakarta, Mahasiswa aktif"
                  value={formData.criteriaResponden}
                  onChange={(e) => updateFormData({ criteriaResponden: e.target.value })}
                  rows={3}
                />
                <div className="char-counter">
                  {formData.criteriaResponden.length}/200 characters
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="duration" className="form-label">
                  Durasi survey iklan (hari) <span className="text-red-500">*</span>
                </label>
                <div className="input-wrapper">
                  <input
                    id="duration"
                    type="number"
                    className="form-input input-with-validation"
                    placeholder="Masukkan durasi dalam hari (1-30)"
                    value={formData.duration || ''}
                    onChange={(e) => updateFormData({ duration: parseInt(e.target.value) || 1 })}
                    min={1}
                    max={30}
                  />
                  {formData.duration > 0 && formData.duration <= 30 && (
                    <CheckCircle className="validation-icon valid" />
                  )}
                </div>
                <span className="helper-text">
                  Pilih durasi iklan survey dari 1-30 hari
                </span>

                {formData.duration > 0 && formData.startDate && (
                  <div className="info-box info mt-3">
                    <p className="text-sm">
                      📅 <strong>Campaign Period:</strong> {formData.startDate} → {formData.endDate || 'calculating...'}
                    </p>
                  </div>
                )}

                <div className="info-box mt-4">
                  <p className="mb-2 font-medium text-sm">💰 Harga berdasarkan jumlah pertanyaan:</p>
                  <div className="text-sm space-y-1">
                    <p>• Max 15 pertanyaan = Rp 150.000/hari</p>
                    <p>• Max 30 pertanyaan = Rp 200.000/hari</p>
                    <p>• Max 50 pertanyaan = Rp 300.000/hari</p>
                    <p>• Max 70 pertanyaan = Rp 400.000/hari</p>
                    <p>• Lebih dari 70 = Rp 500.000/hari</p>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION: INCENTIVE SETTINGS */}
            <div className="section-card">
              <div className="section-header">
                <span className="section-icon">🎁</span>
                <h3 className="section-title">INCENTIVE SETTINGS</h3>
                {formData.winnerCount >= 2 && formData.prizePerWinner >= 25000 && (
                  <span className="section-badge">✓</span>
                )}
              </div>

              <div className="info-box warning mb-6">
                <p className="text-sm">
                  <strong>ℹ️ Info:</strong> Total insentif nantinya akan dimasukkan ke link pembayaran beserta biaya iklan.
                  Pihak Jakpat akan mendistribusikan insentif ke responden secara otomatis.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="form-group">
                  <label htmlFor="winnerCount" className="form-label">
                    Jumlah Pemenang <span className="text-red-500">*</span>
                  </label>
                  <div className="input-wrapper">
                    <input
                      id="winnerCount"
                      type="number"
                      className="form-input input-with-validation"
                      placeholder="Minimal 2 pemenang"
                      value={formData.winnerCount}
                      onChange={(e) => updateFormData({ winnerCount: parseInt(e.target.value) || 0 })}
                      min={2}
                    />
                    {formData.winnerCount >= 2 && (
                      <CheckCircle className="validation-icon valid" />
                    )}
                  </div>
                  <span className="helper-text">Minimal 2 pemenang</span>
                </div>

                <div className="form-group">
                  <label htmlFor="prizePerWinner" className="form-label">
                    Hadiah per-pemenang <span className="text-red-500">*</span>
                  </label>
                  <div className="input-wrapper">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">Rp</span>
                      <input
                        id="prizePerWinner"
                        type="number"
                        className="form-input pl-10 input-with-validation"
                        placeholder="Min. Rp 25.000"
                        value={formData.prizePerWinner}
                        onChange={(e) => updateFormData({ prizePerWinner: parseInt(e.target.value) || 0 })}
                        min={25000}
                        step={1000}
                      />
                      {formData.prizePerWinner >= 25000 && (
                        <CheckCircle className="validation-icon valid" style={{ right: '2.75rem' }} />
                      )}
                    </div>
                  </div>
                  <span className="helper-text">Minimal Rp 25.000 per pemenang</span>
                </div>
              </div>

              {formData.winnerCount >= 2 && formData.prizePerWinner >= 25000 && (
                <div className="info-box success mt-4">
                  <p className="text-sm font-medium">
                    💰 Total Incentive: Rp {(formData.winnerCount * formData.prizePerWinner).toLocaleString('id-ID')}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Show submit button when form data is ready */}
        {(surveySource === 'other' || (surveySource === 'google' && formData.title)) && (
          <div className="flex justify-end mt-8">
            <button type="submit" className="button button-primary">
              {t('continue')}
            </button>
          </div>
        )}
      </form>

      {/* Personal Data Warning Dialog */}
      <PersonalDataWarningDialog
        open={showPersonalDataWarning}
        onOpenChange={(open) => {
          if (!open) {
            handlePersonalDataWarningClose();
          }
        }}
        detectedKeywords={detectedKeywords}
        onContinue={handlePersonalDataWarningClose}
      />
    </div>
  );
}
