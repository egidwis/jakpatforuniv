import type { SurveyFormData } from '../types';
import { toast } from 'sonner';

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

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Data diri</h2>
      <p className="text-gray-600 mb-6">Lengkapi data diri Anda</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="form-group">
            <label htmlFor="fullName" className="form-label">Nama lengkap</label>
            <input
              id="fullName"
              type="text"
              className="form-input"
              placeholder="Masukkan nama lengkap anda"
              value={formData.fullName}
              onChange={(e) => updateFormData({ fullName: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="email" className="form-label">Email</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="Masukkan email"
              value={formData.email}
              onChange={(e) => updateFormData({ email: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="phoneNumber" className="form-label">No Telepon</label>
            <input
              id="phoneNumber"
              type="text"
              className="form-input"
              placeholder="08781234567"
              value={formData.phoneNumber}
              onChange={(e) => updateFormData({ phoneNumber: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="department" className="form-label">Jurusan</label>
            <input
              id="department"
              type="text"
              className="form-input"
              placeholder="Masukkan jurusan anda"
              value={formData.department}
              onChange={(e) => updateFormData({ department: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="university" className="form-label">Universitas</label>
            <input
              id="university"
              type="text"
              className="form-input"
              placeholder="Masukkan universitas atau instansi Anda"
              value={formData.university}
              onChange={(e) => updateFormData({ university: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="status" className="form-label">Status</label>
            <select
              id="status"
              className="form-input"
              value={formData.status}
              onChange={(e) => updateFormData({ status: e.target.value as SurveyFormData['status'] })}
            >
              <option value="Mahasiswa">Mahasiswa</option>
              <option value="Dosen">Dosen</option>
              <option value="Pelajar SMA/SMK">Pelajar SMA/SMK</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="referralSource" className="form-label">Tahu Jakpat for Univesities dari mana?</label>
            <select
              id="referralSource"
              className="form-input"
              value={formData.referralSource}
              onChange={(e) => updateFormData({ referralSource: e.target.value as SurveyFormData['referralSource'] })}
            >
              <option value="Tiktok">Tiktok</option>
              <option value="Instagram">Instagram</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="Website Jakpat">Website Jakpat</option>
              <option value="Chat GPT">Chat GPT</option>
              <option value="Rekomendasi Dosen">Rekomendasi Dosen</option>
              <option value="Rekomendasi Teman">Rekomendasi Teman</option>
            </select>
          </div>
        </div>



        <div className="flex justify-between mt-8">
          <button
            type="button"
            className="button button-secondary"
            onClick={prevStep}
          >
            Kembali
          </button>
          <button type="submit" className="button button-primary">
            Berikutnya
          </button>
        </div>
      </form>
    </div>
  );
}
