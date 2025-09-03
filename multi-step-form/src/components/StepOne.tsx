import { useState } from 'react';
import type { SurveyFormData } from '../types';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PersonalDataWarningDialog } from './ui/Dialog';
import { GoogleDriveImport } from './GoogleDriveImport';

interface StepOneProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  nextStep: () => void;
}

export function StepOne({ formData, updateFormData, nextStep }: StepOneProps) {
  const [surveySource, setSurveySource] = useState<'google' | 'other' | null>(null);
  const [showFormFields, setShowFormFields] = useState(false);
  const [showPersonalDataWarning, setShowPersonalDataWarning] = useState(false);
  const [detectedKeywords, setDetectedKeywords] = useState<string[]>([]);

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
      <h2 className="text-xl font-semibold mb-4">Detail Survey</h2>
      <p className="text-gray-600 mb-6">Pilih sumber survey Anda</p>

      {/* Source Selection */}
      {!surveySource && (
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Google Form Option */}
            <button
              type="button"
              onClick={() => handleSourceSelection('google')}
              className="p-6 border-2 border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-all duration-200 text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
                  <svg className="w-6 h-6 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-2">Google Form</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Import pertanyaan dari Google Forms dengan akurasi 100%. Data otomatis terisi dari form Anda.
                  </p>
                  <div className="flex items-center text-xs text-green-600">
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Akses ke Google Drive
                  </div>
                </div>
              </div>
            </button>

            {/* Other Source Option */}
            <button
              type="button"
              onClick={() => handleSourceSelection('other')}
              className="p-6 border-2 border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all duration-200 text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M16,11V13H8V11H16M16,15V17H11V15H16Z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-2">From other source</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Input manual untuk survey dari platform lain seperti Typeform, SurveyMonkey, atau platform custom.
                  </p>
                  <div className="flex items-center text-xs text-blue-600">
                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                    Input manual
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
            <h3 className="text-lg font-medium">Import Pertanyaan dari Google Forms</h3>
            <button
              type="button"
              onClick={() => setSurveySource(null)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← Kembali pilih sumber
            </button>
          </div>
          
          <GoogleDriveImport 
            formData={formData}
            updateFormData={updateFormData}
            onFormDataLoaded={handleGoogleDriveFormLoaded}
          />
        </div>
      )}

      {/* Manual Entry Section */}
      {surveySource === 'other' && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Survei dari Platform Lain</h3>
            <button
              type="button"
              onClick={() => setSurveySource(null)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← Kembali pilih sumber
            </button>
          </div>

          <div className="form-group">
            <label htmlFor="surveyUrl" className="form-label">Link Survey</label>
            <input
              id="surveyUrl"
              type="text"
              className="form-input"
              placeholder="https://typeform.com/... atau platform lainnya"
              value={formData.surveyUrl}
              onChange={handleUrlChange}
            />
            <p className="text-sm text-gray-500 mt-2">
              Masukan link survey dari platform manapun (Typeform, SurveyMonkey, dll)
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
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
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

            {/* Show Link Survey for Google Drive imports */}
            {surveySource === 'google' && formData.surveyUrl && (
              <div className="form-group mb-6">
                <label htmlFor="importedSurveyUrl" className="form-label">
                  Link Survey <span className="text-xs text-gray-500 ml-2">(dari Google Drive)</span>
                </label>
                <input
                  id="importedSurveyUrl"
                  type="text"
                  className="form-input bg-gray-50 text-gray-700"
                  value={formData.surveyUrl}
                  readOnly
                />
                <p className="text-sm text-gray-500 mt-2">
                  Link Google Form yang diimport dari Drive Anda
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="form-group">
                <label htmlFor="title" className="form-label">
                  Judul <span className="text-red-500">*</span>
                  {surveySource === 'google' && <span className="text-xs text-gray-500 ml-2">(dari Google Drive)</span>}
                </label>
                <input
                  id="title"
                  type="text"
                  className={`form-input ${surveySource === 'google' ? 'bg-gray-50 text-gray-700' : ''}`}
                  placeholder="Masukkan judul survey"
                  value={formData.title}
                  onChange={(e) => updateFormData({ title: e.target.value })}
                  readOnly={surveySource === 'google'}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="questionCount" className="form-label">
                  Jumlah Pertanyaan <span className="text-red-500">*</span>
                  {surveySource === 'google' && <span className="text-xs text-gray-500 ml-2">(dari Google Drive)</span>}
                </label>
                <input
                  id="questionCount"
                  type="number"
                  className={`form-input ${surveySource === 'google' ? 'bg-gray-50 text-gray-700' : ''}`}
                  placeholder="Masukkan jumlah pertanyaan"
                  value={formData.questionCount || ''}
                  onChange={(e) => updateFormData({ questionCount: parseInt(e.target.value) || 0 })}
                  readOnly={surveySource === 'google'}
                  min={1}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="description" className="form-label">
                Deskripsi Survey <span className="text-red-500">*</span>
                {surveySource === 'google' && <span className="text-xs text-gray-500 ml-2">(dari Google Drive)</span>}
              </label>
              <textarea
                id="description"
                className={`form-input ${surveySource === 'google' ? 'bg-gray-50 text-gray-700' : ''}`}
                placeholder="Masukkan deskripsi survey"
                value={formData.description}
                onChange={(e) => updateFormData({ description: e.target.value })}
                readOnly={surveySource === 'google'}
                rows={4}
                required
              />
            </div>

        <div className="form-group">
          <label htmlFor="criteriaResponden" className="form-label">Kriteria Responden</label>
          <textarea
            id="criteriaResponden"
            className="form-input"
            placeholder="Contoh : usia, pekerjaan, domisili"
            value={formData.criteriaResponden}
            onChange={(e) => updateFormData({ criteriaResponden: e.target.value })}
            rows={3}
          />
        </div>

        <div className="form-group">
          <label htmlFor="duration" className="form-label">Durasi survey iklan (hari)</label>
          <input
            id="duration"
            type="number"
            className="form-input"
            placeholder="Masukkan durasi dalam hari"
            value={formData.duration || ''}
            onChange={(e) => updateFormData({ duration: parseInt(e.target.value) || 1 })}
            min={1}
            max={30}
          />
          <p className="text-sm text-gray-500 mt-2">
            Pilih durasi iklan survey dari 1-30 hari
          </p>

          <div className="text-sm text-gray-500 mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="mb-2 font-medium">Harga berdasarkan jumlah pertanyaan:</p>
            <p>Max 15 pertanyaan = Rp 150.000/hari</p>
            <p>Max 30 pertanyaan = Rp 200.000/hari</p>
            <p>Max 50 pertanyaan = Rp 300.000/hari</p>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6 mt-8">
          <div className="rounded-lg border border-gray-200 overflow-hidden mb-6">
            <div className="p-6">
              <h3 className="text-lg font-medium mb-4">Insentif ke responden</h3>
              <p className="text-sm text-gray-600 mb-6">
                Total insentif nantinya akan dimasukkan ke link pembayaran beserta biaya iklan, dari pihak Jakpat akan mendistribusikan insentif ke responden secara otomatis.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="form-group">
                  <label htmlFor="winnerCount" className="form-label">Jumlah Pemenang</label>
                  <input
                    id="winnerCount"
                    type="number"
                    className="form-input"
                    placeholder="Min. 2"
                    value={formData.winnerCount}
                    onChange={(e) => updateFormData({ winnerCount: parseInt(e.target.value) || 0 })}
                    min={2}
                  />
                  <p className="text-sm text-gray-500 mt-2">Minimal 2 pemenang</p>
                </div>

                <div className="form-group">
                  <label htmlFor="prizePerWinner" className="form-label">Hadiah per-pemenang</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">Rp</span>
                    <input
                      id="prizePerWinner"
                      type="number"
                      className="form-input pl-10"
                      placeholder="Min. Rp 25.000"
                      value={formData.prizePerWinner}
                      onChange={(e) => updateFormData({ prizePerWinner: parseInt(e.target.value) || 0 })}
                      min={25000}
                      step={1000}
                    />
                  </div>
                  <p className="text-sm text-gray-500 mt-2">Minimal Rp 25.000 per pemenang</p>
                </div>
              </div>
            </div>
          </div>
        </div>
          </>
        )}

        {/* Show submit button when form data is ready */}
        {(surveySource === 'other' || (surveySource === 'google' && formData.title)) && (
          <div className="flex justify-end mt-8">
            <button type="submit" className="button button-primary">
              Berikutnya
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
