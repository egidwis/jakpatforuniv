import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Target,
  Sparkles,
  ShoppingBag,
  Smartphone,
  FlaskConical,
  Trophy,
  CheckCircle2,
  Calendar,
  Users,
  Link as LinkIcon,
  Loader2,
  Phone,
  ArrowRight,
  ClipboardList,
  FileText
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useMediaQuery } from '../lib/utils';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations';
import { toast } from 'sonner';

interface CustomMissionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: {
  id: string;
  icon: typeof ShoppingBag;
  titleKey: TranslationKey;
  tagKey: TranslationKey;
  descKey: TranslationKey;
}[] = [
  {
    id: 'mystery_shopper',
    icon: ShoppingBag,
    titleKey: 'cmCatMysteryTitle',
    tagKey: 'cmCatMysteryTag',
    descKey: 'cmCatMysteryDesc'
  },
  {
    id: 'app_testing',
    icon: Smartphone,
    titleKey: 'cmCatAppTitle',
    tagKey: 'cmCatAppTag',
    descKey: 'cmCatAppDesc'
  },
  {
    id: 'product_tasting',
    icon: FlaskConical,
    titleKey: 'cmCatTastingTitle',
    tagKey: 'cmCatTastingTag',
    descKey: 'cmCatTastingDesc'
  },
  {
    id: 'pitch_validation',
    icon: Trophy,
    titleKey: 'cmCatValidationTitle',
    tagKey: 'cmCatValidationTag',
    descKey: 'cmCatValidationDesc'
  },
  {
    id: 'other',
    icon: Sparkles,
    titleKey: 'cmCatOtherTitle',
    tagKey: 'cmCatOtherTag',
    descKey: 'cmCatOtherDesc'
  }
];

const getTomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

const getEndStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 6);
  return d.toISOString().split('T')[0];
};

export const CustomMissionModal: React.FC<CustomMissionModalProps> = ({
  isOpen,
  onClose
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 640px)');

  const [category, setCategory] = useState('mystery_shopper');
  const [customCategoryText, setCustomCategoryText] = useState('');
  const [targetRespondents, setTargetRespondents] = useState(50);
  const [startDate, setStartDate] = useState(getTomorrowStr);
  const [endDate, setEndDate] = useState(getEndStr);
  const [criteriaNotes, setCriteriaNotes] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [contactName, setContactName] = useState(user?.user_metadata?.full_name || '');
  const [contactWhatsapp, setContactWhatsapp] = useState(user?.user_metadata?.phone || '');
  
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleGoToSubmitSurvey = () => {
    handleResetAndClose();
    navigate('/dashboard/submit-iklan');
  };

  const calculateDays = () => {
    if (!startDate || !endDate) return 1;
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const diff = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
    return diff;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!contactName.trim()) {
      toast.error(t('errContactNameRequired'));
      return;
    }

    if (!contactWhatsapp.trim()) {
      toast.error(t('errContactWhatsappRequired'));
      return;
    }

    if (!targetRespondents || Number(targetRespondents) < 5) {
      toast.error(t('errMinRespondents'));
      return;
    }

    if (category === 'other' && !customCategoryText.trim()) {
      toast.error(t('errCustomCategoryRequired'));
      return;
    }

    setLoading(true);

    try {
      const durationDays = calculateDays();
      const targetDeadlineStr = `${startDate} s/d ${endDate} (${durationDays} ${t('cmDaysUnit')})`;

      const payload = {
        user_id: user?.id || null,
        category,
        category_custom: category === 'other' ? customCategoryText.trim() : null,
        target_respondents: targetRespondents,
        target_deadline: targetDeadlineStr,
        criteria_notes: criteriaNotes.trim() || null,
        reference_url: referenceUrl.trim() || null,
        contact_name: contactName.trim(),
        contact_whatsapp: contactWhatsapp.trim(),
        contact_email: user?.email || null,
        status: 'pending',
        created_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('custom_mission_requests')
        .insert(payload);

      if (error) throw error;

      setIsSuccess(true);
      toast.success(t('cmSubmitSuccessToast'));
    } catch (err: any) {
      console.error('[CustomMissionModal] Error submitting request:', err);
      toast.error(t('cmSubmitFailedToast') + ': ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetAndClose = () => {
    setIsSuccess(false);
    setCategory('mystery_shopper');
    setCustomCategoryText('');
    setStartDate(getTomorrowStr());
    setEndDate(getEndStr());
    setCriteriaNotes('');
    setReferenceUrl('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6 md:p-8 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl border border-gray-100 shadow-2xl w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[86vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
        
        {/* Mobile Drag Handle Indicator */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-white shrink-0">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 sm:px-8 py-4 sm:py-5 border-b border-gray-100 bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-jfu-primary text-white flex items-center justify-center shadow-md shadow-jfu-primary/25 shrink-0">
              <Target className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-gray-900 leading-tight truncate">
                {t('cmModalTitle')}
              </h2>
              <p className="text-[11px] sm:text-xs text-gray-500 truncate mt-0.5">
                {t('cmModalDesc')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetAndClose}
            aria-label={t('closePopup')}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors cursor-pointer shrink-0 ml-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        {isSuccess ? (
          <div className="p-6 sm:p-10 text-center space-y-4 flex-1 flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 animate-in zoom-in-75 duration-300">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="max-w-md space-y-2">
              <h3 className="text-lg sm:text-xl font-extrabold text-gray-900">
                {t('cmSuccessTitle')}
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                {t('cmSuccessMsgPart1')} <strong>{contactName}</strong>{t('cmSuccessMsgPart2')}
              </p>
              <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900 text-left mt-3">
                <span className="font-bold block mb-1">{t('cmNextStepTitle')}</span>
                {t('cmNextStepDescPart1')}<strong>{contactWhatsapp}</strong>{t('cmNextStepDescPart2')}
              </div>
            </div>

            <div className="pt-3">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="px-6 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                {t('cmBackToDashboard')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            {/* Scrollable Form Content */}
            <div className="overflow-y-auto p-5 sm:p-8 pb-8 sm:pb-8 space-y-5 sm:space-y-6 flex-1 text-xs overscroll-contain">
              {/* Guardrail Box: Ramping 1 baris dengan Text Link */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-blue-900">
                <div className="flex items-center gap-1.5 min-w-0">
                  <ClipboardList className="w-3.5 h-3.5 text-jfu-primary shrink-0" />
                  <span className="truncate">{t('cmGuardrailText')}</span>
                </div>
                <button
                  type="button"
                  onClick={handleGoToSubmitSurvey}
                  className="font-bold text-jfu-primary hover:text-jfu-dark hover:underline inline-flex items-center gap-0.5 cursor-pointer ml-auto sm:ml-0 whitespace-nowrap"
                >
                  <span>{t('cmGuardrailLink')}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* Jenis Aksi Responden */}
              <div>
                <label className="block font-bold text-gray-900 text-xs mb-2.5 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-jfu-primary" />
                  <span>{t('cmActionType')}</span>
                  <span className="text-red-500">*</span>
                </label>

                <div
                  className="w-full"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isDesktop ? 'repeat(2, minmax(0, 1fr))' : '1fr',
                    gap: isDesktop ? '0.75rem' : '0.625rem'
                  }}
                >
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = category === cat.id;
                    const isOther = cat.id === 'other';

                    return (
                      <div
                        key={cat.id}
                        onClick={() => setCategory(cat.id)}
                        style={{
                          gridColumn: isOther && isDesktop ? 'span 2 / span 2' : 'span 1 / span 1'
                        }}
                        className={`w-full p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 min-w-0 ${
                          isSelected
                            ? 'border-jfu-primary bg-indigo-50/40 shadow-xs ring-1 ring-jfu-primary/20'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-jfu-primary text-white' : 'bg-gray-100 text-gray-600'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>

                        <div className="w-full min-w-0 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="w-full flex items-center justify-between gap-2">
                              <span className={`font-bold text-xs leading-tight truncate ${isSelected ? 'text-jfu-primary' : 'text-gray-900'}`}>
                                {t(cat.titleKey)}
                              </span>
                              <input
                                type="radio"
                                name="category"
                                checked={isSelected}
                                onChange={() => setCategory(cat.id)}
                                className="w-3.5 h-3.5 text-jfu-primary shrink-0 cursor-pointer ml-auto"
                              />
                            </div>
                            <span className="block text-[10px] font-semibold text-slate-500 sm:hidden mt-0.5">
                              {t(cat.tagKey)}
                            </span>
                            <p className="text-gray-500 text-[11px] mt-1 leading-snug hidden sm:block">
                              {t(cat.descKey)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Free Text Input if 'other' is selected */}
                {category === 'other' && (
                  <div className="mt-2.5 p-3.5 rounded-xl bg-amber-50/60 border border-amber-200">
                    <label className="block font-bold text-amber-900 text-[11px] mb-1">
                      {t('cmCustomCatLabel')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={customCategoryText}
                      onChange={(e) => setCustomCategoryText(e.target.value)}
                      placeholder={t('cmCustomCatPlaceholder')}
                      className="w-full px-3.5 py-2.5 text-xs border border-amber-300 rounded-lg !bg-white !text-gray-900 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium placeholder:text-gray-400"
                      style={{ color: '#111827', backgroundColor: '#ffffff' }}
                      required
                    />
                  </div>
                )}
              </div>

              {/* Target Responden & Periode Pelaksanaan */}
              <div className="pt-5 sm:pt-6 border-t border-gray-100">
                <div
                  className="w-full"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isDesktop ? 'repeat(2, minmax(0, 1fr))' : '1fr',
                    gap: isDesktop ? '1.25rem' : '1rem'
                  }}
                >
                  <div>
                    <label className="h-6 flex items-center justify-between font-bold text-gray-900 text-xs mb-1.5">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="truncate">{t('cmTargetRespondents')}</span>
                        <span className="text-red-500 shrink-0">*</span>
                      </span>
                      <span className="text-[10px] text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                        {t('cmMinRespondents')}
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={5}
                        value={targetRespondents || ''}
                        onChange={(e) => setTargetRespondents(e.target.value === '' ? ('' as any) : Number(e.target.value))}
                        placeholder="50"
                        className="h-10 w-full pl-3.5 pr-20 text-xs font-semibold !text-gray-900 !bg-white border border-gray-300 rounded-xl focus:border-jfu-primary focus:outline-none"
                        style={{ color: '#111827', backgroundColor: '#ffffff' }}
                        required
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-semibold pointer-events-none">
                        {t('cmPersonUnit')}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="h-6 flex items-center justify-between font-bold text-gray-900 text-xs mb-1.5">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="truncate">{t('cmExecutionPeriod')}</span>
                        <span className="text-red-500 shrink-0">*</span>
                      </span>
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200 shrink-0">
                        {calculateDays()} {t('cmDaysUnit')}
                      </span>
                    </label>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: '0.5rem'
                      }}
                    >
                      <input
                        type="date"
                        value={startDate}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="h-10 w-full px-2.5 text-xs font-semibold !text-gray-900 !bg-white border border-gray-300 rounded-xl focus:border-jfu-primary focus:outline-none"
                        style={{ color: '#111827', backgroundColor: '#ffffff' }}
                        required
                      />
                      <input
                        type="date"
                        value={endDate}
                        min={startDate || new Date().toISOString().split('T')[0]}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="h-10 w-full px-2.5 text-xs font-semibold !text-gray-900 !bg-white border border-gray-300 rounded-xl focus:border-jfu-primary focus:outline-none"
                        style={{ color: '#111827', backgroundColor: '#ffffff' }}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Brief Tugas & Instruksi */}
              <div className="pt-5 sm:pt-6 border-t border-gray-100">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{t('cmBriefLabel')}</span>
                  </label>
                  <span className="text-[10px] text-gray-400 font-normal">
                    {t('cmBriefSubLabel')}
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={criteriaNotes}
                  onChange={(e) => setCriteriaNotes(e.target.value)}
                  placeholder={t('cmBriefPlaceholder')}
                  className="w-full p-3.5 text-xs leading-relaxed border border-gray-200 rounded-xl focus:border-jfu-primary focus:outline-none !bg-white !text-gray-900 transition-all font-medium placeholder:text-gray-400"
                  style={{ color: '#111827', backgroundColor: '#ffffff' }}
                />
              </div>

              {/* Tautan Prototipe / Website */}
              <div className="pt-5 sm:pt-6 border-t border-gray-100">
                <label className="block font-bold text-gray-900 text-xs mb-1.5 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{t('cmLinkLabel')}</span>
                </label>
                <input
                  type="url"
                  value={referenceUrl}
                  onChange={(e) => setReferenceUrl(e.target.value)}
                  placeholder={t('cmLinkPlaceholder')}
                  className="w-full px-3.5 py-2.5 text-xs border border-gray-200 rounded-xl !bg-white !text-gray-900 focus:border-jfu-primary focus:outline-none font-medium placeholder:text-gray-400"
                  style={{ color: '#111827', backgroundColor: '#ffffff' }}
                />
              </div>

              {/* Kontak Pemohon */}
              <div className="pt-5 sm:pt-6 border-t border-gray-100">
                <div className="mb-2.5">
                  <label className="block font-bold text-gray-900 text-xs flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{t('cmContactSectionTitle')}</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {t('cmContactSectionSubtitle')}
                  </p>
                </div>

                <div
                  className="w-full"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isDesktop ? 'repeat(2, minmax(0, 1fr))' : '1fr',
                    gap: isDesktop ? '1.25rem' : '0.875rem'
                  }}
                >
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1.5">
                      {t('cmContactName')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder={t('cmContactNamePlaceholder')}
                      className="h-10 w-full px-3.5 text-xs border border-gray-300 rounded-xl !bg-white !text-gray-900 focus:border-jfu-primary focus:outline-none font-semibold placeholder:text-gray-400"
                      style={{ color: '#111827', backgroundColor: '#ffffff' }}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1.5 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-emerald-600" />
                      <span>{t('cmContactWhatsapp')}</span>
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={contactWhatsapp}
                      onChange={(e) => setContactWhatsapp(e.target.value)}
                      placeholder={t('cmContactWhatsappPlaceholder')}
                      className="h-10 w-full px-3.5 text-xs border border-gray-300 rounded-xl !bg-white !text-gray-900 focus:border-jfu-primary focus:outline-none font-semibold font-mono placeholder:text-gray-400"
                      style={{ color: '#111827', backgroundColor: '#ffffff' }}
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Pinned Desktop & Mobile Footer */}
            <div className="px-5 sm:px-8 py-3.5 sm:py-4.5 border-t border-gray-100 bg-gray-50/80 flex flex-col-reverse sm:flex-row items-center justify-between gap-2 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white hover:bg-gray-100 text-gray-600 font-semibold text-xs border border-gray-200 transition-colors cursor-pointer text-center"
              >
                {t('cancel')}
              </button>

              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto px-6 py-2.5 sm:py-2.5 rounded-xl bg-jfu-primary hover:bg-jfu-dark text-white font-bold text-xs shadow-md shadow-jfu-primary/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('cmSubmitting')}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t('cmSubmitBtn')}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
