import { useEffect, useRef, useState } from 'react';
import type { SurveyFormData } from '../types';
import { CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../i18n/LanguageContext';

// Helper function to get recommended prize based on question count
const getRecommendedPrize = (questionCount: number): number => {
  if (questionCount <= 15) return 25000;
  if (questionCount <= 30) return 30000;
  if (questionCount <= 50) return 35000;
  if (questionCount <= 70) return 50000;
  return 80000;
};

// All possible recommended values
const RECOMMENDED_VALUES = [25000, 30000, 35000, 50000, 80000];

interface StepTwoConfigProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  onSubmit: () => void;
  onBack: () => void;
}

interface FormErrors {
  criteriaResponden?: string;
  duration?: string;
  winnerCount?: string;
  prizePerWinner?: string;
}

export function StepTwoConfig({
  formData,
  updateFormData,
  onSubmit,
  onBack
}: StepTwoConfigProps) {
  const { t } = useLanguage();
  const prevQuestionCountRef = useRef(formData.questionCount);
  const hasInitializedRef = useRef(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // Auto-update prizePerWinner when component mounts or questionCount changes
  useEffect(() => {
    const prevQuestionCount = prevQuestionCountRef.current;
    const currentQuestionCount = formData.questionCount;
    const currentPrize = formData.prizePerWinner;
    const currentWinnerCount = formData.winnerCount;

    // On initial mount, set defaults if not set
    if (!hasInitializedRef.current) {
      const updates: Partial<SurveyFormData> = {};

      // Set default winner count if 0
      if (currentWinnerCount === 0) {
        updates.winnerCount = 2;
      }

      // Set recommended prize if questionCount is valid and prize is 0 or recommended value
      if (currentQuestionCount > 0 && (currentPrize === 0 || RECOMMENDED_VALUES.includes(currentPrize))) {
        updates.prizePerWinner = getRecommendedPrize(currentQuestionCount);
      }

      if (Object.keys(updates).length > 0) {
        updateFormData(updates);
      }

      hasInitializedRef.current = true;
    }
    // On subsequent changes, update if questionCount changed
    else if (currentQuestionCount > 0 && currentQuestionCount !== prevQuestionCount) {
      const newRecommended = getRecommendedPrize(currentQuestionCount);
      // Only auto-update if current value is one of the recommended values
      // This preserves custom values set by the user
      if (RECOMMENDED_VALUES.includes(currentPrize)) {
        updateFormData({ prizePerWinner: newRecommended });
      }
    }

    prevQuestionCountRef.current = currentQuestionCount;
  }, [formData.questionCount, formData.prizePerWinner, updateFormData]);

  // Validation function with error tracking
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.criteriaResponden || !formData.criteriaResponden.trim()) {
      newErrors.criteriaResponden = t('errorRespondentCriteriaRequired');
    }

    if (formData.duration <= 0) {
      newErrors.duration = t('errorDurationZero');
    } else if (formData.duration > 30) {
      newErrors.duration = t('errorDurationMax');
    }

    if (formData.winnerCount < 2) {
      newErrors.winnerCount = t('errorMinWinners');
    } else if (formData.winnerCount > 5) {
      newErrors.winnerCount = t('errorMaxWinners');
    }

    if (formData.prizePerWinner < 25000) {
      newErrors.prizePerWinner = t('errorMinPrize');
    }

    setErrors(newErrors);

    // Show toast if there are errors
    if (Object.keys(newErrors).length > 0) {
      toast.error(t('errorFixFields'));
      return false;
    }

    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptedSubmit(true);

    if (validateForm()) {
      onSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
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
            className={`form-input ${errors.criteriaResponden && attemptedSubmit ? 'border-red-500' : ''}`}
            placeholder="Contoh: Usia 18-35 tahun, Domisili Jakarta, Mahasiswa aktif"
            value={formData.criteriaResponden}
            onChange={(e) => {
              updateFormData({ criteriaResponden: e.target.value });
              if (attemptedSubmit && errors.criteriaResponden) {
                setErrors({ ...errors, criteriaResponden: undefined });
              }
            }}
            rows={3}
          />
          <div className="char-counter">
            {formData.criteriaResponden.length}/200 characters
          </div>
          {errors.criteriaResponden && attemptedSubmit ? (
            <span className="helper-text error mt-2">⚠️ {errors.criteriaResponden}</span>
          ) : (
            <div className="info-box info mt-3">
              <p className="text-sm">
                ℹ️ Kriteria ini akan ditampilkan di postingan iklan
              </p>
            </div>
          )}
        </div>

        {/* Separator */}
        <div style={{ marginTop: '2rem', marginBottom: '2rem', borderTop: '1px solid rgba(0, 0, 0, 0.1)' }}></div>

        <div className="form-group">
          <label htmlFor="duration" className="form-label">
            Durasi survey iklan (hari) <span className="text-red-500">*</span>
          </label>
          <div className="input-wrapper">
            <input
              id="duration"
              type="number"
              className={`form-input input-with-validation ${errors.duration && attemptedSubmit ? 'border-red-500' : ''}`}
              placeholder="Masukkan durasi dalam hari (1-30)"
              value={formData.duration || ''}
              onChange={(e) => {
                updateFormData({ duration: parseInt(e.target.value) || 1 });
                if (attemptedSubmit && errors.duration) {
                  setErrors({ ...errors, duration: undefined });
                }
              }}
              min={1}
              max={30}
            />
            {formData.duration > 0 && formData.duration <= 30 && !errors.duration && (
              <CheckCircle className="validation-icon valid" />
            )}
          </div>
          {errors.duration && attemptedSubmit ? (
            <span className="helper-text error">⚠️ {errors.duration}</span>
          ) : (
            <>
              <span className="helper-text">
                Pilih durasi iklan survey dari 1-30 hari
              </span>
              <div className="info-box info mt-3">
                <p className="text-sm">
                  ℹ️ Periode iklan akan dikonfirmasi oleh admin via WhatsApp setelah pembayaran
                </p>
              </div>
            </>
          )}
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

        <div className="info-box info mb-6">
          <p className="text-sm">
            ℹ️ Jakpat akan mendistribusikan insentif ke responden secara otomatis
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="form-group">
            <label htmlFor="prizePerWinner" className="form-label">
              Hadiah per-pemenang <span className="text-red-500">*</span>
            </label>
            <div className="input-wrapper">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">Rp</span>
              <input
                id="prizePerWinner"
                type="number"
                className={`form-input pl-10 input-with-validation ${errors.prizePerWinner ? 'border-red-500' : ''}`}
                placeholder="Min. Rp 25.000"
                value={formData.prizePerWinner}
                onChange={(e) => {
                  updateFormData({ prizePerWinner: parseInt(e.target.value) || 0 });
                  if (attemptedSubmit && errors.prizePerWinner) {
                    setErrors({ ...errors, prizePerWinner: undefined });
                  }
                }}
                min={25000}
                step={1000}
              />
              {formData.prizePerWinner >= 25000 && !errors.prizePerWinner && (
                <CheckCircle className="validation-icon valid" />
              )}
            </div>
            {formData.prizePerWinner > 0 && formData.prizePerWinner < 25000 ? (
              <span className="helper-text error">⚠️ Minimal Rp 25.000 per pemenang</span>
            ) : (
              <>
                {formData.prizePerWinner >= 25000 && formData.questionCount > 0 && (
                  <span className="helper-text">
                    💡 Rekomendasi: Rp {getRecommendedPrize(formData.questionCount).toLocaleString('id-ID')}/pemenang untuk {formData.questionCount} pertanyaan
                  </span>
                )}
              </>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="winnerCount" className="form-label">
              Jumlah Pemenang <span className="text-red-500">*</span>
            </label>
            <div className="input-wrapper">
              <input
                id="winnerCount"
                type="number"
                className={`form-input input-with-validation ${errors.winnerCount ? 'border-red-500' : ''}`}
                placeholder="2-5 pemenang"
                value={formData.winnerCount}
                onChange={(e) => {
                  updateFormData({ winnerCount: parseInt(e.target.value) || 0 });
                  if (attemptedSubmit && errors.winnerCount) {
                    setErrors({ ...errors, winnerCount: undefined });
                  }
                }}
                min={2}
                max={5}
              />
              {formData.winnerCount >= 2 && formData.winnerCount <= 5 && !errors.winnerCount && (
                <CheckCircle className="validation-icon valid" />
              )}
            </div>
            {formData.winnerCount > 0 && formData.winnerCount < 2 ? (
              <span className="helper-text error">⚠️ Minimal 2 pemenang</span>
            ) : formData.winnerCount > 5 ? (
              <span className="helper-text error">⚠️ Maksimal 5 pemenang</span>
            ) : null}
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

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-8">
        <button
          type="button"
          className="button button-secondary"
          onClick={onBack}
        >
          ← Kembali
        </button>
        <button
          type="submit"
          className="button button-primary"
        >
          Berikutnya →
        </button>
      </div>
    </form>
  );
}
