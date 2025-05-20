import type { SurveyFormData } from '../../lib/types';
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
      <h2 className="text-xl font-semibold mb-4">Data diri & Insentif</h2>

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
              placeholder="Masukkan judul survey"
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
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
          <h3 className="text-lg font-medium mb-4">Insentif ke responden</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
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
            </div>
          </div>
        </div>

        <div className="flex justify-between">
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
