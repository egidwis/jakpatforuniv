import { useState } from 'react';
import type { SurveyFormData } from '../../lib/types';
import { extractSurveyInfo } from '../../lib/survey-service';
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

  // Fungsi untuk handle perubahan URL
  const handleUrlChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
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
      const info = await extractSurveyInfo(formData.surveyUrl);
      updateFormData({
        title: info.title,
        description: info.description,
        questionCount: info.questionCount
      });

      // Cek apakah URL adalah Google Form
      setIsGoogleForm(info.platform === 'Google Forms');

      toast.success('Informasi survei berhasil diekstrak');
    } catch (error) {
      toast.error('Gagal mengekstrak informasi survei');
      console.error(error);
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
      <p className="text-gray-600 dark:text-gray-400 mb-6">Lengkapi form dibawah ini</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="form-group">
          <label htmlFor="surveyUrl" className="form-label">Link Google Form</label>
          <div className="flex gap-2">
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
                'Preview'
              )}
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Masukan link google form dan field dibawah akan otomatis terisi. Link selain google form akan bisa dimasukan manual.
          </p>
        </div>

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
          <div className="flex items-center gap-4">
            <input
              id="duration"
              type="number"
              className="form-input w-24"
              value={formData.duration}
              onChange={(e) => updateFormData({ duration: parseInt(e.target.value) || 0 })}
              min={1}
            />
            <span className="text-sm text-gray-500">hari</span>
          </div>
          <div className="text-sm text-gray-500 mt-2">
            <p>Max 15 pertanyaan = Rp 150.000/hari</p>
            <p>max 30 pertanyaan = Rp 200.000/hari</p>
            <p>max 50 pertanyaan = Rp 300.000/hari</p>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="button button-primary">
            Berikutnya
          </button>
        </div>
      </form>
    </div>
  );
}
