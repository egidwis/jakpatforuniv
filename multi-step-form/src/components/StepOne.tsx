import { useState } from 'react';
import type { SurveyFormData } from '../types';
import { extractSurveyInfo } from '../utils/survey-service';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface StepOneProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  nextStep: () => void;
}

export function StepOne({ formData, updateFormData, nextStep }: StepOneProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleForm, setIsGoogleForm] = useState(true);
  const [extractTimeout, setExtractTimeout] = useState<number | null>(null);

  // Fungsi untuk handle perubahan URL
  const handleUrlChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value.trim();
    updateFormData({ surveyUrl: url });

    // Cek apakah URL adalah Google Form
    const isGoogle = url.includes('docs.google.com/forms') || url.includes('forms.gle');
    setIsGoogleForm(isGoogle);

    if (!isGoogle) {
      // Reset form fields jika bukan Google Form
      updateFormData({
        title: '',
        description: '',
        questionCount: 0
      });
      return;
    }

    // Jika URL adalah Google Form dan memiliki panjang yang cukup, ekstrak otomatis
    if (isGoogle && url.length > 30) {
      // Pastikan URL valid
      try {
        // Validasi format URL
        new URL(url);

        // Gunakan debounce untuk menghindari terlalu banyak request
        if (extractTimeout) {
          clearTimeout(extractTimeout);
        }

        const timeout = window.setTimeout(() => {
          // Panggil fungsi ekstrak
          extractInfo();
        }, 1000); // Tunggu 1 detik setelah pengguna berhenti mengetik

        setExtractTimeout(timeout);
      } catch (error) {
        // URL tidak valid, tidak perlu melakukan apa-apa
        console.log("URL tidak valid:", error);
      }
    }
  };

  // Fungsi untuk mengekstrak informasi survei
  const extractInfo = async () => {
    if (!formData.surveyUrl) {
      toast.error('Masukkan URL survei terlebih dahulu');
      return;
    }

    // Validasi format URL
    try {
      new URL(formData.surveyUrl);
    } catch (error) {
      toast.error('URL tidak valid. Pastikan format URL benar');
      return;
    }

    setIsLoading(true);
    try {
      // Bersihkan URL dari whitespace
      const cleanUrl = formData.surveyUrl.trim();

      // Pastikan URL adalah Google Form
      if (!cleanUrl.includes('docs.google.com/forms') && !cleanUrl.includes('forms.gle')) {
        throw new Error('NON_GOOGLE_FORM');
      }

      const info = await extractSurveyInfo(cleanUrl);
      updateFormData({
        title: info.title,
        description: info.description,
        questionCount: info.questionCount
      });

      // Cek apakah URL adalah Google Form
      setIsGoogleForm(info.platform === 'Google Forms');

      toast.success('Informasi survei berhasil diekstrak');
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
            toast.error(
              <div>
                <p className="font-medium">Link ini bukan Google Form</p>
                <p className="text-sm mt-1">Saat ini kami hanya mendukung pengisian otomatis untuk Google Form. Silakan isi detail form secara manual.</p>
              </div>
            );
            // Reset isGoogleForm to false
            setIsGoogleForm(false);
            break;
          case 'URL_EMPTY':
            toast.error('Masukkan URL survei terlebih dahulu');
            break;
          default:
            toast.error(
              <div>
                <p className="font-medium">Gagal mengekstrak informasi survei</p>
                <p className="text-sm mt-1">Pastikan URL Google Form valid dan form sudah diatur sebagai "Public". Silakan coba lagi atau isi form dibawah secara manual.</p>
              </div>
            );
        }
      } else {
        toast.error('Gagal mengekstrak informasi survei');
      }
      console.error("Error extracting form info:", error);
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

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Detail Survey</h2>
      <p className="text-gray-600 mb-6">Lengkapi form dibawah ini</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="form-group">
          <label htmlFor="surveyUrl" className="form-label">Link Google Form</label>
          <div className="flex gap-4">
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
              className="button button-secondary"
              onClick={extractInfo}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Ekstrak'
              )}
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Masukan link Google Form dan field dibawah akan otomatis terisi. Anda juga bisa klik tombol "Ekstrak" jika data tidak terisi otomatis. Link selain Google Form bisa diisi secara manual.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="form-group">
            <label htmlFor="title" className="form-label">Judul</label>
            <input
              id="title"
              type="text"
              className="form-input"
              placeholder="Masukkan judul survey"
              value={formData.title}
              onChange={(e) => updateFormData({ title: e.target.value })}
              readOnly={isGoogleForm}
            />
          </div>

          <div className="form-group">
            <label htmlFor="questionCount" className="form-label">Jumlah Pertanyaan</label>
            <input
              id="questionCount"
              type="number"
              className="form-input"
              placeholder="Masukkan jumlah pertanyaan"
              value={formData.questionCount || ''}
              onChange={(e) => updateFormData({ questionCount: parseInt(e.target.value) || 0 })}
              readOnly={isGoogleForm}
              min={1}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="description" className="form-label">Deskripsi Survey</label>
          <textarea
            id="description"
            className="form-input"
            placeholder="Masukkan deskripsi survey"
            value={formData.description}
            onChange={(e) => updateFormData({ description: e.target.value })}
            readOnly={isGoogleForm}
            rows={4}
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

        <div className="flex justify-end mt-8">
          <button type="submit" className="button button-primary">
            Berikutnya
          </button>
        </div>
      </form>
    </div>
  );
}
