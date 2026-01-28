import { useState } from 'react';
import type { SurveyFormData } from '../types';
import { toast } from 'sonner';
import { CheckCircle, User, Mail, Phone, GraduationCap, AlertCircle, Building, BookOpen, UserCircle, Megaphone } from 'lucide-react';
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
      // toast.error(t('errorCompleteAllFields')); // Optional, sometimes intrusive
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
    <div className="max-w-3xl mx-auto">
      {/* Title & Subtitle removed to avoid duplication with Header, or kept minimal */}

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>

        {/* SECTION: CONTACT INFORMATION */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                <User size={18} />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">{t('contactInformation')}</h3>
            </div>
            {formData.fullName && formData.email && formData.phoneNumber && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                <CheckCircle size={12} />
                <span>Complete</span>
              </div>
            )}
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Full Name */}
            <div className="space-y-2">
              <label htmlFor="fullName" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                {t('fullNameLabel')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="fullName"
                  type="text"
                  className={`
                    w-full px-4 py-2.5 rounded-xl border outline-none transition-all duration-200
                    ${errors.fullName && attemptedSubmit
                      ? 'border-red-300 focus:ring-red-200 bg-red-50/30 ring-4 ring-transparent'
                      : 'border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-white hover:border-gray-300'
                    }
                  `}
                  placeholder={t('fullNamePlaceholder')}
                  value={formData.fullName}
                  onChange={(e) => {
                    updateFormData({ fullName: e.target.value });
                    if (attemptedSubmit && errors.fullName) {
                      setErrors({ ...errors, fullName: undefined });
                    }
                  }}
                />
                {formData.fullName && !errors.fullName && (
                  <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 w-4 h-4" />
                )}
              </div>
              {errors.fullName && attemptedSubmit ? (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> {errors.fullName}
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">{t('fullNameHelp')}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                {t('emailLabel')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  className={`
                    w-full px-4 py-2.5 rounded-xl border outline-none transition-all duration-200
                    ${errors.email && attemptedSubmit
                      ? 'border-red-300 focus:ring-red-200 bg-red-50/30'
                      : 'border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-white hover:border-gray-300'
                    }
                  `}
                  placeholder={t('emailPlaceholder')}
                  value={formData.email}
                  onChange={(e) => {
                    updateFormData({ email: e.target.value });
                    if (attemptedSubmit && errors.email) {
                      setErrors({ ...errors, email: undefined });
                    }
                  }}
                />
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
              </div>
              {errors.email && attemptedSubmit ? (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> {errors.email}
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">{t('emailHelp')}</p>
              )}
            </div>

            {/* Phone Number */}
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="phoneNumber" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                {t('phoneNumberLabel')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="phoneNumber"
                  type="tel"
                  className={`
                    w-full px-4 py-2.5 rounded-xl border outline-none transition-all duration-200
                    ${errors.phoneNumber && attemptedSubmit
                      ? 'border-red-300 focus:ring-red-200 bg-red-50/30'
                      : 'border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-white hover:border-gray-300'
                    }
                  `}
                  placeholder={t('phoneNumberPlaceholder')}
                  value={formData.phoneNumber}
                  onChange={(e) => {
                    updateFormData({ phoneNumber: e.target.value });
                    if (attemptedSubmit && errors.phoneNumber) {
                      setErrors({ ...errors, phoneNumber: undefined });
                    }
                  }}
                />
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
              </div>
              {errors.phoneNumber && attemptedSubmit ? (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> {errors.phoneNumber}
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">{t('phoneNumberHelp')}</p>
              )}
            </div>
          </div>
        </div>

        {/* SECTION: ACADEMIC INFORMATION */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                <GraduationCap size={18} />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">{t('academicInformation')}</h3>
            </div>
            {formData.university && formData.department && formData.status && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                <CheckCircle size={12} />
                <span>Complete</span>
              </div>
            )}
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* University */}
            <div className="space-y-2">
              <label htmlFor="university" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                {t('universityLabel')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="university"
                  type="text"
                  className={`
                    w-full px-4 py-2.5 rounded-xl border outline-none transition-all duration-200
                    ${errors.university && attemptedSubmit
                      ? 'border-red-300 focus:ring-red-200 bg-red-50/30'
                      : 'border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-white hover:border-gray-300'
                    }
                  `}
                  placeholder={t('universityPlaceholder')}
                  value={formData.university}
                  onChange={(e) => {
                    updateFormData({ university: e.target.value });
                    if (attemptedSubmit && errors.university) {
                      setErrors({ ...errors, university: undefined });
                    }
                  }}
                />
                <Building className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
              </div>
              {errors.university && attemptedSubmit ? (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> {errors.university}
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">{t('universityHelp')}</p>
              )}
            </div>

            {/* Department */}
            <div className="space-y-2">
              <label htmlFor="department" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                {t('departmentLabel')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="department"
                  type="text"
                  className={`
                    w-full px-4 py-2.5 rounded-xl border outline-none transition-all duration-200
                    ${errors.department && attemptedSubmit
                      ? 'border-red-300 focus:ring-red-200 bg-red-50/30'
                      : 'border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-white hover:border-gray-300'
                    }
                  `}
                  placeholder={t('departmentPlaceholder')}
                  value={formData.department}
                  onChange={(e) => {
                    updateFormData({ department: e.target.value });
                    if (attemptedSubmit && errors.department) {
                      setErrors({ ...errors, department: undefined });
                    }
                  }}
                />
                <BookOpen className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
              </div>
              {errors.department && attemptedSubmit ? (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> {errors.department}
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">{t('departmentHelp')}</p>
              )}
            </div>

            {/* Status (Select) */}
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="status" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                {t('statusLabel')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  id="status"
                  className={`
                    w-full px-4 py-2.5 rounded-xl border outline-none transition-all duration-200 appearance-none bg-white
                    ${errors.status && attemptedSubmit
                      ? 'border-red-300 focus:ring-red-200 bg-red-50/30'
                      : 'border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 hover:border-gray-300'
                    }
                  `}
                  value={formData.status}
                  onChange={(e) => {
                    updateFormData({ status: e.target.value });
                    if (attemptedSubmit && errors.status) {
                      setErrors({ ...errors, status: undefined });
                    }
                  }}
                >
                  <option value="">{t('statusPlaceholder')}</option>
                  <option value="Dosen">👨‍🏫 Dosen</option>
                  <option value="Mahasiswa S3 (Doktor)">🎓 Mahasiswa S3 (Doktor)</option>
                  <option value="Mahasiswa S2 (Master)">🎓 Mahasiswa S2 (Master)</option>
                  <option value="Mahasiswa S1 (Sarjana)">🎓 Mahasiswa S1 (Sarjana)</option>
                  <option value="Mahasiswa D3 (Diploma)">🎓 Mahasiswa D3 (Diploma)</option>
                  <option value="Pelajar SMA/SMK">📚 Pelajar SMA/SMK</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <UserCircle size={18} />
                </div>
              </div>
              {errors.status && attemptedSubmit ? (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> {errors.status}
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">{t('statusHelp')}</p>
              )}
            </div>
          </div>
        </div>

        {/* SECTION: HOW DID YOU FIND US */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
                <Megaphone size={18} />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">{t('referralSourceTitle')}</h3>
            </div>
            {formData.referralSource && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                <CheckCircle size={12} />
                <span>Complete</span>
              </div>
            )}
          </div>

          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <label htmlFor="referralSource" className="text-sm font-medium text-gray-700">
                {t('referralSourceLabel')}
              </label>
              <div className="relative">
                <select
                  id="referralSource"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-white appearance-none outline-none transition-all duration-200 hover:border-gray-300"
                  value={formData.referralSource}
                  onChange={(e) => {
                    const value = e.target.value;
                    updateFormData({ referralSource: value });
                    if (value !== 'Lainnya') {
                      updateFormData({ referralSourceOther: '' });
                    }
                  }}
                >
                  <option value="">{t('referralSourcePlaceholder')}</option>
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
                {/* Custom arrow if needed, usually browser default is okay or use background-image in CSS */}
              </div>
              <p className="text-xs text-gray-400 mt-1">{t('referralSourceHelp')}</p>
            </div>

            {/* Conditional text input for "Lainnya" */}
            {formData.referralSource === 'Lainnya' && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <label htmlFor="referralSourceOther" className="text-sm font-medium text-gray-700">
                  {t('referralSourceOtherLabel')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="referralSourceOther"
                    type="text"
                    className={`
                      w-full px-4 py-2.5 rounded-xl border outline-none transition-all duration-200
                      ${errors.referralSourceOther && attemptedSubmit
                        ? 'border-red-300 focus:ring-red-200 bg-red-50/30'
                        : 'border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-white hover:border-gray-300'
                      }
                    `}
                    placeholder={t('referralSourceOtherPlaceholder')}
                    value={formData.referralSourceOther || ''}
                    onChange={(e) => {
                      updateFormData({ referralSourceOther: e.target.value });
                      if (attemptedSubmit && errors.referralSourceOther) {
                        setErrors({ ...errors, referralSourceOther: undefined });
                      }
                    }}
                  />
                  {formData.referralSourceOther && formData.referralSourceOther.trim() && !errors.referralSourceOther && (
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 w-4 h-4" />
                  )}
                </div>
                {errors.referralSourceOther && attemptedSubmit ? (
                  <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" /> {errors.referralSourceOther}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">{t('referralSourceOtherHelp')}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-between items-center pt-4">
          <button
            type="button"
            className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 flex items-center gap-2"
            onClick={prevStep}
          >
            ← {t('backButton')}
          </button>
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2"
          >
            {t('continue')} →
          </button>
        </div>
      </form>
    </div>
  );
}
