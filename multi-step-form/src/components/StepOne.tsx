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
  const handleUrlChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    updateFormData({ surveyUrl: url });

    // Reset shortlink state when URL changes
    setShortlinkResult(null);

    if (!url.trim()) {
      setIsGoogleForm(true);
      setShowFormFields(false);
      return;
    }

    // Check if it's a shortlink
    if (isShortlink(url)) {
      setIsExpandingShortlink(true);
      try {
        const result = await expandShortlink(url);
        setShortlinkResult(result);
        
        if (result.expandedUrl && result.wasExpanded) {
          // Update the input with expanded URL
          updateFormData({ surveyUrl: result.expandedUrl });
          
          const isGoogle = result.expandedUrl.includes('docs.google.com/forms') || result.expandedUrl.includes('forms.google.com');
          setIsGoogleForm(isGoogle);
          
          // Show form fields for non-Google Forms
          if (!isGoogle) {
            setShowFormFields(true);
            updateFormData({ isManualEntry: true });
          }
          
          toast.success(
            <div className="flex items-start gap-2">
              <ExternalLink className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Shortlink berhasil di-expand</p>
                <p className="text-sm mt-1">URL telah diperbarui ke bentuk lengkap</p>
              </div>
            </div>
          );
        } else {
          // Shortlink detected but expansion failed, still treat as Google Form
          // forms.gle is always a Google Form shortlink
          const isGoogle = url.includes('forms.gle') || url.includes('goo.gl') || url.includes('g.co') || url.includes('docs.google.com/forms');
          setIsGoogleForm(isGoogle);
          
          // Show form fields for non-Google Forms
          if (!isGoogle) {
            setShowFormFields(true);
            updateFormData({ isManualEntry: true });
          }
          
          console.log('[DEBUG] Shortlink detected but not expanded, treating as Google Form:', isGoogle);
        }
      } catch (error) {
        console.warn('Failed to expand shortlink:', error);
        // forms.gle is always Google Forms, even if expansion fails
        const isGoogle = url.includes('forms.gle') || url.includes('goo.gl') || url.includes('g.co') || url.includes('docs.google.com/forms');
        setIsGoogleForm(isGoogle);
        
        // Show form fields for non-Google Forms
        if (!isGoogle) {
          setShowFormFields(true);
          updateFormData({ isManualEntry: true });
        }
        
        console.log('[DEBUG] Shortlink expansion failed, but still treating as Google Form:', isGoogle);
      } finally {
        setIsExpandingShortlink(false);
      }
    } else {
      // Regular URL handling - include all Google shortlink domains
      const isGoogle = url.includes('docs.google.com/forms') || 
                       url.includes('forms.gle') || 
                       url.includes('goo.gl') || 
                       url.includes('g.co');
      setIsGoogleForm(isGoogle);
      
      // Show form fields immediately for non-Google Forms
      if (!isGoogle) {
        setShowFormFields(true);
        updateFormData({ isManualEntry: true });
      }
      
      console.log('[DEBUG] Regular URL detected as Google Form:', isGoogle);
    }

    // Check final URL after shortlink processing
    const finalUrl = shortlinkResult?.expandedUrl || url;
    const finalIsGoogle = finalUrl.includes('docs.google.com/forms') || 
                          finalUrl.includes('forms.gle') || 
                          finalUrl.includes('goo.gl') || 
                          finalUrl.includes('g.co');
    
    if (!finalIsGoogle) {
      // Reset form fields jika bukan Google Form dan tampilkan form untuk manual entry
      updateFormData({
        title: '',
        description: '',
        questionCount: 0,
        isManualEntry: true
      });
      setShowFormFields(true);
    } else {
      // Jika URL adalah Google Form dan cukup panjang, coba ekstrak otomatis
      if (finalUrl.length > 30 && !isLoading) {
        // Tunggu sebentar sebelum ekstrak otomatis
        setTimeout(() => {
          extractInfo();
        }, 500);
      }
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

      console.log("Using safe extraction function");
      
      // Use expanded URL if shortlink was processed, otherwise use original URL
      const extractUrl = shortlinkResult?.expandedUrl || url;
      console.log("Extraction URL:", extractUrl);
      
      // Use our safe extraction function instead
      const info = await extractFormInfoFallback(extractUrl);
      
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

        // Cek apakah URL adalah Google Form
        setIsGoogleForm(info.platform === 'Google Forms');

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
          case 'NON_GOOGLE_FORM':
            toast.warning(
              <div>
                <p className="font-medium">Link ini bukan Google Form</p>
                <p className="text-sm mt-1">Pengisian otomatis hanya tersedia untuk Google Form. Silakan isi detail form secara manual di bawah.</p>
              </div>
            );
            // Reset isGoogleForm to false and show form fields for manual entry
            setIsGoogleForm(false);
            setShowFormFields(true);
            updateFormData({ isManualEntry: true });
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
          {!isGoogleForm && formData.surveyUrl && (
            <p className="text-sm text-orange-600 mt-1 font-medium">
              ⚠️ Link yang dimasukkan bukan Google Form. Silakan isi detail form secara manual.
            </p>
          )}

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
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-gray-200 text-gray-700 px-3 py-1 rounded-md text-sm font-medium">
              {formData.duration} hari
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="startDate" className="form-label text-sm">Tanggal Mulai</label>
              <div className="relative">
                <input
                  id="startDate"
                  type="date"
                  className="form-input"
                  onChange={(e) => {
                    updateFormData({ startDate: e.target.value });
                    // Hitung durasi jika tanggal akhir sudah diisi
                    if (formData.endDate) {
                      const start = new Date(e.target.value);
                      const end = new Date(formData.endDate);
                      const diffTime = Math.abs(end.getTime() - start.getTime());
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      updateFormData({ duration: diffDays });
                    }
                  }}
                  value={formData.startDate || ''}
                />
              </div>
            </div>

            <div>
              <label htmlFor="endDate" className="form-label text-sm">Tanggal Berakhir</label>
              <div className="relative">
                <input
                  id="endDate"
                  type="date"
                  className="form-input"
                  onChange={(e) => {
                    updateFormData({ endDate: e.target.value });
                    // Hitung durasi jika tanggal mulai sudah diisi
                    if (formData.startDate) {
                      const start = new Date(formData.startDate);
                      const end = new Date(e.target.value);
                      const diffTime = Math.abs(end.getTime() - start.getTime());
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      updateFormData({ duration: diffDays });
                    }
                  }}
                  value={formData.endDate || ''}
                  min={formData.startDate || ''}
                />
              </div>
            </div>
          </div>

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
