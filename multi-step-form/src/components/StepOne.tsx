import { useState } from 'react';
import type { SurveyFormData } from '../types';
// import { extractSurveyInfo } from '../utils/survey-service';
import { extractFormInfoFallback } from '../utils/worker-service';
import { isShortlink, expandShortlink, type ShortlinkResult } from '../utils/shortlink-utils';
import { Loader2, ExternalLink, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { PersonalDataWarningDialog } from './ui/Dialog';

interface StepOneProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  nextStep: () => void;
}

export function StepOne({ formData, updateFormData, nextStep }: StepOneProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleForm, setIsGoogleForm] = useState(true);
  const [shortlinkResult, setShortlinkResult] = useState<ShortlinkResult | null>(null);
  const [isExpandingShortlink, setIsExpandingShortlink] = useState(false);
  const [showFormFields, setShowFormFields] = useState(false);
  const [showPersonalDataWarning, setShowPersonalDataWarning] = useState(false);
  const [detectedKeywords, setDetectedKeywords] = useState<string[]>([]);

  // Fungsi untuk handle perubahan URL
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    updateFormData({ surveyUrl: url });

    // Reset state when URL changes
    setShortlinkResult(null);
    setShowFormFields(false);
    setIsGoogleForm(true); // Default to Google Form assumption
    
    // Reset form fields when URL changes
    if (url.trim()) {
      updateFormData({
        title: '',
        description: '',
        questionCount: 0,
        isManualEntry: false
      });
    }
  };

  // Fungsi untuk mengekstrak informasi survei
  const extractInfo = async () => {
    if (!formData.surveyUrl) {
      toast.error('Masukkan URL survei terlebih dahulu');
      return;
    }

    setIsLoading(true);
    try {
      // Normalisasi URL
      let url = formData.surveyUrl.trim();

      // Tambahkan https:// jika tidak ada
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
        updateFormData({ surveyUrl: url });
      }

      // Check if it's a shortlink and expand it first
      let finalUrl = url;
      if (isShortlink(url)) {
        setIsExpandingShortlink(true);
        try {
          const result = await expandShortlink(url);
          setShortlinkResult(result);
          
          if (result.expandedUrl && result.wasExpanded) {
            finalUrl = result.expandedUrl;
            // Update the input with expanded URL immediately
            updateFormData({ surveyUrl: finalUrl });
            
            toast.success(
              <div className="flex items-start gap-2">
                <ExternalLink className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Shortlink berhasil di-expand</p>
                  <p className="text-sm mt-1">URL telah diperbarui ke bentuk lengkap</p>
                </div>
              </div>
            );
          }
        } catch (error) {
          console.warn('Failed to expand shortlink:', error);
          // Continue with original URL if shortlink expansion fails
        } finally {
          setIsExpandingShortlink(false);
        }
      }

      // Wait a bit for URL update to propagate if shortlink was expanded
      if (finalUrl !== url) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Detect if it's Google Form or not
      const isGoogle = finalUrl.includes('docs.google.com/forms') || 
                       finalUrl.includes('forms.gle') || 
                       finalUrl.includes('goo.gl') || 
                       finalUrl.includes('g.co') ||
                       finalUrl.includes('forms.google.com');
      
      setIsGoogleForm(isGoogle);

      // If it's not a Google Form, show manual entry fields immediately
      if (!isGoogle) {
        toast.warning(
          <div>
            <p className="font-medium">Link ini bukan Google Form</p>
            <p className="text-sm mt-1">Pengisian otomatis hanya tersedia untuk Google Form. Silakan isi detail form secara manual di bawah.</p>
          </div>
        );
        setShowFormFields(true);
        updateFormData({ isManualEntry: true });
        return;
      }

      console.log("Using safe extraction function for Google Form");
      console.log("Extraction URL:", finalUrl);
      
      // Use our safe extraction function for Google Forms
      const info = await extractFormInfoFallback(finalUrl);
      
      console.log("Safe extraction completed");

      // Jika berhasil diekstrak, update form data
      if (info && info.title) {
        // Ensure questionCount is a valid number
        const questionCount = typeof info.questionCount === 'number' ? info.questionCount :
                             (parseInt(String(info.questionCount)) || 0);

        const extractedData = {
          title: info.title,
          description: info.description,
          questionCount: questionCount,
          isManualEntry: false, // Reset flag karena ini ekstraksi otomatis
          hasPersonalDataQuestions: info.hasPersonalDataQuestions || false,
          detectedKeywords: info.detectedKeywords || []
        };

        updateFormData(extractedData);

        // Cek apakah ada deteksi keyword personal data
        console.log('[DEBUG] Checking personal data detection...');
        console.log('[DEBUG] info.hasPersonalDataQuestions:', info.hasPersonalDataQuestions);
        console.log('[DEBUG] info.detectedKeywords:', info.detectedKeywords);

        if (info.hasPersonalDataQuestions && info.detectedKeywords && info.detectedKeywords.length > 0) {
          console.log('[DEBUG] Personal data keywords detected:', info.detectedKeywords);
          setDetectedKeywords(info.detectedKeywords);
          setShowPersonalDataWarning(true);
          console.log('[DEBUG] Showing personal data warning modal');
        } else {
          // Show the form fields after successful extraction
          setShowFormFields(true);
          console.log('[DEBUG] No personal data detected, showing form fields directly');
        }

        toast.success('Informasi survei berhasil diekstrak');
      } else {
        // Jika tidak ada data yang diekstrak
        toast.warning(
          <div>
            <p className="font-medium">Informasi survei tidak lengkap</p>
            <p className="text-sm mt-1">Silakan lengkapi detail form secara manual.</p>
          </div>
        );
        // Show form fields for manual entry
        setShowFormFields(true);
        updateFormData({ isManualEntry: true });
      }
    } catch (error) {
      // Handle specific error codes with user-friendly messages
      if (error instanceof Error) {
        switch (error.message) {
          case 'FORM_NOT_PUBLIC':
            toast.error(
              <div>
                <p className="font-medium">Link Google Form tidak dapat diakses</p>
                <p className="text-sm mt-1">Pastikan form sudah diatur sebagai "Public" di pengaturan Google Form. Silakan ubah pengaturan akses form Anda.</p>
              </div>
            );
            break;
          case 'URL_EMPTY':
            toast.error('Masukkan URL survei terlebih dahulu');
            break;
          case 'EXTRACTION_FAILED':
            toast.warning(
              <div>
                <p className="font-medium">Gagal mengekstrak informasi survei</p>
                <p className="text-sm mt-1">Silakan coba lagi atau isi form dibawah secara manual.</p>
              </div>
            );
            // Show form fields for manual entry
            setShowFormFields(true);
            updateFormData({ isManualEntry: true });
            break;
          default:
            toast.error(
              <div>
                <p className="font-medium">Gagal mengekstrak informasi survei</p>
                <p className="text-sm mt-1">Pastikan form sudah diatur sebagai "Public" di pengaturan Google Form. Silakan coba lagi atau isi form dibawah secara manual.</p>
              </div>
            );
            // Show form fields for manual entry
            setShowFormFields(true);
            updateFormData({ isManualEntry: true });
        }
      } else {
        toast.error('Gagal mengekstrak informasi survei');
      }
      console.error("Error in extractInfo:", error);
    } finally {
      setIsLoading(false);
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

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Detail Survey</h2>
      <p className="text-gray-600 mb-6">Lengkapi form dibawah ini</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="form-group">
          <label htmlFor="surveyUrl" className="form-label">Link Google Form</label>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
            <input
              id="surveyUrl"
              type="text"
              className="form-input flex-1"
              placeholder="https://docs.google.com/forms/..."
              value={formData.surveyUrl}
              onChange={handleUrlChange}
            />
            <button
              type="button"
              className="button button-secondary w-full sm:w-auto"
              onClick={extractInfo}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Preview'
              )}
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Masukan link Google Form atau shortlink (forms.gle/abc) dan klik tombol "Preview" untuk mengisi field dibawah secara otomatis. Link selain Google Form bisa diisi secara manual.
          </p>

          {/* Shortlink Preview */}
          {shortlinkResult && shortlinkResult.isShortlink && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-start gap-2">
                <ExternalLink className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-blue-800">Shortlink terdeteksi</p>
                  {isExpandingShortlink ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                      <p className="text-xs text-blue-700">Mengexpand shortlink...</p>
                    </div>
                  ) : shortlinkResult.expandedUrl ? (
                    <div className="mt-1">
                      <p className="text-xs text-blue-700">URL lengkap:</p>
                      <p className="text-xs font-mono text-blue-600 break-all bg-white px-2 py-1 rounded border mt-1">
                        {shortlinkResult.expandedUrl}
                      </p>
                      {shortlinkResult.platform && (
                        <p className="text-xs text-blue-700 mt-1">
                          Platform: {shortlinkResult.platform}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-blue-700 mt-1">
                      Shortlink siap untuk ekstraksi: {shortlinkResult.platform || 'Google Forms'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {showFormFields && (
          <>
            {!isGoogleForm && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-yellow-800">Link bukan Google Form terdeteksi</p>
                    <p className="text-xs text-yellow-700 mt-1">
                      Silakan isi detail form secara manual di bawah ini. Pastikan informasi yang diisi sesuai dengan survey Anda.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="form-group">
            <label htmlFor="title" className="form-label">Judul {!isGoogleForm && <span className="text-red-500">*</span>}</label>
            <input
              id="title"
              type="text"
              className="form-input"
              placeholder="Masukkan judul survey"
              value={formData.title}
              onChange={(e) => updateFormData({ title: e.target.value })}
              readOnly={isGoogleForm && formData.title !== ''}
              required={!isGoogleForm}
            />
          </div>

          <div className="form-group">
            <label htmlFor="questionCount" className="form-label">Jumlah Pertanyaan {!isGoogleForm && <span className="text-red-500">*</span>}</label>
            <input
              id="questionCount"
              type="number"
              className="form-input"
              placeholder="Masukkan jumlah pertanyaan"
              value={formData.questionCount || ''}
              onChange={(e) => updateFormData({ questionCount: parseInt(e.target.value) || 0 })}
              readOnly={isGoogleForm && formData.questionCount > 0}
              min={1}
              required={!isGoogleForm}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="description" className="form-label">Deskripsi Survey {!isGoogleForm && <span className="text-red-500">*</span>}</label>
          <textarea
            id="description"
            className="form-input"
            placeholder="Masukkan deskripsi survey"
            value={formData.description}
            onChange={(e) => updateFormData({ description: e.target.value })}
            readOnly={isGoogleForm && formData.description !== ''}
            rows={4}
            required={!isGoogleForm}
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

        {showFormFields && (
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
