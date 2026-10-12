import { ShieldCheck, Zap, ExternalLink } from 'lucide-react';
import type { SurveyFormData } from '../../types';
import { isAutoApprovalPath } from '../../utils/review-path';
import { PII_KEYWORD_KEY } from '../../utils/piiKeywordLabel';
import { useLanguage } from '../../i18n/LanguageContext';

/**
 * Jalur review order ini — otomatis atau manual, dan kenapa.
 *
 * ⚠️ SATU PEMILIK. Dulu tiga tempat di Ringkasan mengatakan hal yang sama:
 * banner amber "Terdeteksi Pertanyaan Data Pribadi" di kepala kolom kiri, blok
 * jalur review di kolom kanan (terlipat di ponsel), dan tips "Kepastian Slot".
 * Sekarang hanya blok ini, di kartu Ringkasan Pesanan, yang menjawab "jalur
 * apa, kenapa, berapa lama". Modal sukses menjawab "apa yang terjadi
 * sekarang" — jangan menyalin kalimat di sini ke sana.
 */
export function ReviewPathNotice({ formData }: { formData: SurveyFormData }) {
  const { t } = useLanguage();
  const isAuto = isAutoApprovalPath(formData);
  const sensitive = !isAuto && !!formData.hasPersonalDataQuestions;
  const keywords = sensitive ? formData.detectedKeywords ?? [] : [];

  return (
    <div
      className={`rounded-xl border p-3.5 sm:p-4 ${isAuto
        ? 'border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/40'
        : 'border-blue-200/80 bg-white/95'
        }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs mt-0.5 ${isAuto
            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200/80'
            : 'bg-blue-100 text-jfu-primary border border-blue-200/80'
            }`}
        >
          {isAuto ? (
            <Zap className="w-4 h-4 text-emerald-600" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-jfu-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs sm:text-sm font-bold text-slate-900 block">
            {isAuto ? t('reviewPathAutoTitle') : t('reviewPathManualTitle')}
          </span>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            {isAuto
              ? t('reviewPathAutoDesc')
              : sensitive
                ? t('reviewPathManualSensitiveDesc')
                : t('reviewPathManualDefaultDesc')}
          </p>
          {sensitive && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-900"
                >
                  {PII_KEYWORD_KEY[keyword] ? t(PII_KEYWORD_KEY[keyword]) : keyword}
                </span>
              ))}
              <a
                href="/homepage/terms-conditions.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-jfu-primary hover:underline"
              >
                {t('reviewPathSeeTerms')}
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
