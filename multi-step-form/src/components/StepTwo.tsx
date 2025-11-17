import type { SurveyFormData } from '../types';
import { toast } from 'sonner';
import { CheckCircle } from 'lucide-react';

interface StepTwoProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  nextStep: () => void;
  prevStep: () => void;
}

export function StepTwo({ formData, updateFormData, nextStep, prevStep }: StepTwoProps) {
  // Fungsi untuk validasi form
  const validateForm = () => {
    if (!formData.fullName) {
      toast.error('Nama lengkap tidak boleh kosong');
      return false;
    }

    if (!formData.email) {
      toast.error('Email tidak boleh kosong');
      return false;
    }

    if (!formData.phoneNumber) {
      toast.error('Nomor telepon tidak boleh kosong');
      return false;
    }

    if (!formData.university) {
      toast.error('Universitas tidak boleh kosong');
      return false;
    }

    if (!formData.department) {
      toast.error('Jurusan tidak boleh kosong');
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

  // Helper untuk validasi email
  const isValidEmail = (email: string) => {
    return email.includes('@') && email.includes('.');
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">Data diri</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>Lengkapi data diri Anda</p>

      <form onSubmit={handleSubmit} className="space-y-6">
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
                  className="form-input input-with-validation"
                  placeholder="e.g., Budi Santoso"
                  value={formData.fullName}
                  onChange={(e) => updateFormData({ fullName: e.target.value })}
                />
                {formData.fullName && (
                  <CheckCircle className="validation-icon valid" />
                )}
              </div>
              <span className="helper-text">Masukkan nama lengkap sesuai KTP/identitas</span>
            </div>

            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email <span className="text-red-500">*</span>
              </label>
              <div className="input-wrapper">
                <input
                  id="email"
                  type="email"
                  className="form-input input-with-validation"
                  placeholder="e.g., budi.santoso@university.ac.id"
                  value={formData.email}
                  onChange={(e) => updateFormData({ email: e.target.value })}
                />
                {formData.email && isValidEmail(formData.email) && (
                  <CheckCircle className="validation-icon valid" />
                )}
              </div>
              <span className="helper-text">Email aktif untuk notifikasi pembayaran</span>
            </div>

            <div className="form-group md:col-span-2">
              <label htmlFor="phoneNumber" className="form-label">
                No Telepon <span className="text-red-500">*</span>
              </label>
              <div className="input-wrapper">
                <input
                  id="phoneNumber"
                  type="tel"
                  className="form-input input-with-validation"
                  placeholder="e.g., 081234567890"
                  value={formData.phoneNumber}
                  onChange={(e) => updateFormData({ phoneNumber: e.target.value })}
                />
                {formData.phoneNumber && formData.phoneNumber.length >= 10 && (
                  <CheckCircle className="validation-icon valid" />
                )}
              </div>
              <span className="helper-text">Format: 08xxxxxxxxxx (tanpa spasi atau tanda hubung)</span>
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
                  className="form-input input-with-validation"
                  placeholder="e.g., Universitas Indonesia"
                  value={formData.university}
                  onChange={(e) => updateFormData({ university: e.target.value })}
                />
                {formData.university && (
                  <CheckCircle className="validation-icon valid" />
                )}
              </div>
              <span className="helper-text">Nama universitas atau institusi pendidikan</span>
            </div>

            <div className="form-group">
              <label htmlFor="department" className="form-label">
                Jurusan / Fakultas <span className="text-red-500">*</span>
              </label>
              <div className="input-wrapper">
                <input
                  id="department"
                  type="text"
                  className="form-input input-with-validation"
                  placeholder="e.g., Computer Science"
                  value={formData.department}
                  onChange={(e) => updateFormData({ department: e.target.value })}
                />
                {formData.department && (
                  <CheckCircle className="validation-icon valid" />
                )}
              </div>
              <span className="helper-text">Jurusan atau fakultas Anda</span>
            </div>

            <div className="form-group md:col-span-2">
              <label htmlFor="status" className="form-label">
                Status <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  className={`option-button ${formData.status === 'Mahasiswa' ? 'selected' : ''}`}
                  onClick={() => updateFormData({ status: 'Mahasiswa' })}
                >
                  🎓 Mahasiswa
                </button>
                <button
                  type="button"
                  className={`option-button ${formData.status === 'Dosen' ? 'selected' : ''}`}
                  onClick={() => updateFormData({ status: 'Dosen' })}
                >
                  👨‍🏫 Dosen
                </button>
                <button
                  type="button"
                  className={`option-button ${formData.status === 'Pelajar SMA/SMK' ? 'selected' : ''}`}
                  onClick={() => updateFormData({ status: 'Pelajar SMA/SMK' })}
                >
                  📚 Pelajar SMA/SMK
                </button>
              </div>
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
            <label className="form-label">
              Tahu Jakpat for Universities dari mana?
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                type="button"
                className={`option-button ${formData.referralSource === 'Tiktok' ? 'selected' : ''}`}
                onClick={() => updateFormData({ referralSource: 'Tiktok' })}
              >
                TikTok
              </button>
              <button
                type="button"
                className={`option-button ${formData.referralSource === 'Instagram' ? 'selected' : ''}`}
                onClick={() => updateFormData({ referralSource: 'Instagram' })}
              >
                Instagram
              </button>
              <button
                type="button"
                className={`option-button ${formData.referralSource === 'LinkedIn' ? 'selected' : ''}`}
                onClick={() => updateFormData({ referralSource: 'LinkedIn' })}
              >
                LinkedIn
              </button>
              <button
                type="button"
                className={`option-button ${formData.referralSource === 'Website Jakpat' ? 'selected' : ''}`}
                onClick={() => updateFormData({ referralSource: 'Website Jakpat' })}
              >
                Website Jakpat
              </button>
              <button
                type="button"
                className={`option-button ${formData.referralSource === 'Chat GPT' ? 'selected' : ''}`}
                onClick={() => updateFormData({ referralSource: 'Chat GPT' })}
              >
                ChatGPT
              </button>
              <button
                type="button"
                className={`option-button ${formData.referralSource === 'Rekomendasi Dosen' ? 'selected' : ''}`}
                onClick={() => updateFormData({ referralSource: 'Rekomendasi Dosen' })}
              >
                Rekomendasi Dosen
              </button>
              <button
                type="button"
                className={`option-button ${formData.referralSource === 'Rekomendasi Teman' ? 'selected' : ''}`}
                onClick={() => updateFormData({ referralSource: 'Rekomendasi Teman' })}
              >
                Rekomendasi Teman
              </button>
            </div>
          </div>
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
