import { useState } from 'react';
import type { SurveyFormData } from '../types';
import { toast } from 'sonner';
import { CheckCircle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface StepThreeProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  nextStep: () => void;
  prevStep: () => void;
}

interface FormErrors {
  fullName?: string;
  email?: string;
  phoneNumber?: string;
  university?: string;
  department?: string;
  status?: string;
  referralSourceOther?: string;
}

export function StepThree({ formData, updateFormData, nextStep, prevStep }: StepThreeProps) {
  const { t } = useLanguage();
  const [errors, setErrors] = useState<FormErrors>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // Fungsi untuk validasi form
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.fullName || !formData.fullName.trim()) {
      newErrors.fullName = t('errorFullNameEmpty');
    }

    if (!formData.email || !formData.email.trim()) {
      newErrors.email = t('errorEmailEmpty');
    } else if (!isValidEmail(formData.email)) {
      newErrors.email = t('errorEmailInvalid');
    }

    if (!formData.phoneNumber || !formData.phoneNumber.trim()) {
      newErrors.phoneNumber = t('errorPhoneEmpty');
    } else if (formData.phoneNumber.length < 10) {
      newErrors.phoneNumber = t('errorPhoneMinLength');
    }

    if (!formData.university || !formData.university.trim()) {
      newErrors.university = t('errorUniversityEmpty');
    }

    if (!formData.department || !formData.department.trim()) {
      newErrors.department = t('errorDepartmentEmpty');
    }

    if (!formData.status) {
      newErrors.status = t('errorStatusRequired');
    }

    // Validasi untuk referralSource "Lainnya"
    if (formData.referralSource === 'Lainnya') {
      if (!formData.referralSourceOther || !formData.referralSourceOther.trim()) {
        newErrors.referralSourceOther = t('errorReferralSourceOther');
      }
    }

    setErrors(newErrors);

    // Show toast if there are errors
    if (Object.keys(newErrors).length > 0) {
      toast.error(t('errorCompleteAllFields'));
      return false;
    }

    return true;
  };

  // Fungsi untuk handle submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptedSubmit(true);

    if (validateForm()) {
      nextStep();
    }
  };

  // Helper untuk validasi email
  const isValidEmail = (email: string) => {
    return email.includes('@') && email.includes('.');
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">{t('personalData')}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>Lengkapi data diri Anda</p>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* SECTION: CONTACT INFORMATION */}
        <div className="section-card">
          <div className="section-header">
            <span className="section-icon">👤</span>
            <h3 className="section-title">CONTACT INFORMATION</h3>
            {formData.fullName && formData.email && formData.phoneNumber && (
              <span className="section-badge">✓</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="form-group">
              <label htmlFor="fullName" className="form-label">
                Nama lengkap <span className="text-red-500">*</span>
              </label>
              <div className="input-wrapper">
                <input
                  id="fullName"
                  type="text"
                  className={`form-input input-with-validation ${errors.fullName ? 'border-red-500' : ''}`}
                  placeholder="e.g., Budi Santoso"
                  value={formData.fullName}
                  onChange={(e) => {
                    updateFormData({ fullName: e.target.value });
                    if (attemptedSubmit && errors.fullName) {
                      setErrors({ ...errors, fullName: undefined });
                    }
                  }}
                />
                {formData.fullName && !errors.fullName && (
                  <CheckCircle className="validation-icon valid" />
                )}
              </div>
              {errors.fullName ? (
                <span className="helper-text error">⚠️ {errors.fullName}</span>
              ) : (
                <span className="helper-text">Masukkan nama lengkap sesuai KTP/identitas</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email <span className="text-red-500">*</span>
              </label>
              <div className="input-wrapper">
                <input
                  id="email"
                  type="email"
                  className={`form-input input-with-validation ${errors.email ? 'border-red-500' : ''}`}
                  placeholder="e.g., budi.santoso@university.ac.id"
                  value={formData.email}
                  onChange={(e) => {
                    updateFormData({ email: e.target.value });
                    if (attemptedSubmit && errors.email) {
                      setErrors({ ...errors, email: undefined });
                    }
                  }}
                />
                {formData.email && isValidEmail(formData.email) && !errors.email && (
                  <CheckCircle className="validation-icon valid" />
                )}
              </div>
              {errors.email ? (
                <span className="helper-text error">⚠️ {errors.email}</span>
              ) : (
                <span className="helper-text">Email aktif untuk notifikasi pembayaran</span>
              )}
            </div>

            <div className="form-group md:col-span-2">
              <label htmlFor="phoneNumber" className="form-label">
                No Telepon <span className="text-red-500">*</span>
              </label>
              <div className="input-wrapper">
                <input
                  id="phoneNumber"
                  type="tel"
                  className={`form-input input-with-validation ${errors.phoneNumber ? 'border-red-500' : ''}`}
                  placeholder="e.g., 081234567890"
                  value={formData.phoneNumber}
                  onChange={(e) => {
                    updateFormData({ phoneNumber: e.target.value });
                    if (attemptedSubmit && errors.phoneNumber) {
                      setErrors({ ...errors, phoneNumber: undefined });
                    }
                  }}
                />
                {formData.phoneNumber && formData.phoneNumber.length >= 10 && !errors.phoneNumber && (
                  <CheckCircle className="validation-icon valid" />
                )}
              </div>
              {errors.phoneNumber ? (
                <span className="helper-text error">⚠️ {errors.phoneNumber}</span>
              ) : (
                <span className="helper-text">Format: 08xxxxxxxxxx (tanpa spasi atau tanda hubung)</span>
              )}
            </div>
          </div>
        </div>

        {/* SECTION: ACADEMIC INFORMATION */}
        <div className="section-card">
          <div className="section-header">
            <span className="section-icon">🎓</span>
            <h3 className="section-title">ACADEMIC INFORMATION</h3>
            {formData.university && formData.department && formData.status && (
              <span className="section-badge">✓</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="form-group">
              <label htmlFor="university" className="form-label">
                Universitas <span className="text-red-500">*</span>
              </label>
              <div className="input-wrapper">
                <input
                  id="university"
                  type="text"
                  className={`form-input input-with-validation ${errors.university ? 'border-red-500' : ''}`}
                  placeholder="e.g., Universitas Indonesia"
                  value={formData.university}
                  onChange={(e) => {
                    updateFormData({ university: e.target.value });
                    if (attemptedSubmit && errors.university) {
                      setErrors({ ...errors, university: undefined });
                    }
                  }}
                />
                {formData.university && !errors.university && (
                  <CheckCircle className="validation-icon valid" />
                )}
              </div>
              {errors.university ? (
                <span className="helper-text error">⚠️ {errors.university}</span>
              ) : (
                <span className="helper-text">Nama universitas atau institusi pendidikan</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="department" className="form-label">
                Jurusan / Fakultas <span className="text-red-500">*</span>
              </label>
              <div className="input-wrapper">
                <input
                  id="department"
                  type="text"
                  className={`form-input input-with-validation ${errors.department ? 'border-red-500' : ''}`}
                  placeholder="e.g., Computer Science"
                  value={formData.department}
                  onChange={(e) => {
                    updateFormData({ department: e.target.value });
                    if (attemptedSubmit && errors.department) {
                      setErrors({ ...errors, department: undefined });
                    }
                  }}
                />
                {formData.department && !errors.department && (
                  <CheckCircle className="validation-icon valid" />
                )}
              </div>
              {errors.department ? (
                <span className="helper-text error">⚠️ {errors.department}</span>
              ) : (
                <span className="helper-text">Jurusan atau fakultas Anda</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="status" className="form-label">
                Status <span className="text-red-500">*</span>
              </label>
              <select
                id="status"
                className={`form-input ${errors.status && attemptedSubmit ? 'border-red-500' : ''}`}
                value={formData.status}
                onChange={(e) => {
                  updateFormData({ status: e.target.value });
                  if (attemptedSubmit && errors.status) {
                    setErrors({ ...errors, status: undefined });
                  }
                }}
              >
                <option value="">Pilih status akademik</option>
                <option value="Dosen">👨‍🏫 Dosen</option>
                <option value="Mahasiswa S3 (Doktor)">🎓 Mahasiswa S3 (Doktor)</option>
                <option value="Mahasiswa S2 (Master)">🎓 Mahasiswa S2 (Master)</option>
                <option value="Mahasiswa S1 (Sarjana)">🎓 Mahasiswa S1 (Sarjana)</option>
                <option value="Mahasiswa D3 (Diploma)">🎓 Mahasiswa D3 (Diploma)</option>
                <option value="Pelajar SMA/SMK">📚 Pelajar SMA/SMK</option>
              </select>
              {errors.status && attemptedSubmit ? (
                <span className="helper-text error">⚠️ {errors.status}</span>
              ) : (
                <span className="helper-text">Pilih status akademik Anda</span>
              )}
            </div>
          </div>
        </div>

        {/* SECTION: HOW DID YOU FIND US */}
        <div className="section-card">
          <div className="section-header">
            <span className="section-icon">📢</span>
            <h3 className="section-title">HOW DID YOU FIND US?</h3>
            {formData.referralSource && (
              <span className="section-badge">✓</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="referralSource" className="form-label">
              Tahu Jakpat for Universities dari mana?
            </label>
            <select
              id="referralSource"
              className="form-input"
              value={formData.referralSource}
              onChange={(e) => {
                const value = e.target.value;
                updateFormData({ referralSource: value });
                // Reset referralSourceOther jika bukan "Lainnya"
                if (value !== 'Lainnya') {
                  updateFormData({ referralSourceOther: '' });
                }
              }}
            >
              <option value="">Pilih sumber informasi</option>
              <option value="Tiktok">TikTok</option>
              <option value="Instagram">Instagram</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="Website Jakpat">Website Jakpat</option>
              <option value="Blog Jakpat">Blog Jakpat</option>
              <option value="Google Search">Google Search</option>
              <option value="Chat GPT">ChatGPT</option>
              <option value="Rekomendasi Dosen">Rekomendasi Dosen</option>
              <option value="Rekomendasi Teman">Rekomendasi Teman</option>
              <option value="Lainnya">Lainnya</option>
            </select>
            <span className="helper-text">Pilih dari mana Anda mengetahui Jakpat for Universities</span>
          </div>

          {/* Conditional text input for "Lainnya" */}
          {formData.referralSource === 'Lainnya' && (
            <div className="form-group mt-4">
              <label htmlFor="referralSourceOther" className="form-label">
                Sebutkan sumber informasi <span className="text-red-500">*</span>
              </label>
              <div className="input-wrapper">
                <input
                  id="referralSourceOther"
                  type="text"
                  className={`form-input input-with-validation ${errors.referralSourceOther ? 'border-red-500' : ''}`}
                  placeholder="Sebutkan sumber informasi"
                  value={formData.referralSourceOther || ''}
                  onChange={(e) => {
                    updateFormData({ referralSourceOther: e.target.value });
                    if (attemptedSubmit && errors.referralSourceOther) {
                      setErrors({ ...errors, referralSourceOther: undefined });
                    }
                  }}
                />
                {formData.referralSourceOther && formData.referralSourceOther.trim() && !errors.referralSourceOther && (
                  <CheckCircle className="validation-icon valid" />
                )}
              </div>
              {errors.referralSourceOther ? (
                <span className="helper-text error">⚠️ {errors.referralSourceOther}</span>
              ) : (
                <span className="helper-text">Wajib diisi jika memilih "Lainnya"</span>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between mt-8">
          <button
            type="button"
            className="button button-secondary"
            onClick={prevStep}
          >
            ← Kembali
          </button>
          <button type="submit" className="button button-primary">
            Berikutnya →
          </button>
        </div>
      </form>
    </div>
  );
}
