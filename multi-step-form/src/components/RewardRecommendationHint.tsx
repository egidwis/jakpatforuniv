import { useMemo } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { getRecommendedPrize, MIN_PRIZE_PER_WINNER } from '../utils/prizeRecommendation';

export interface RewardRecommendationHintProps {
  value: number;
  onChange: (val: number) => void;
  questionCount?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Microcopy interaktif rekomendasi hadiah (Opsi 1).
 * Mengintegrasikan rekomendasi nominal dan edukasi daya tarik
 * ke dalam 1 baris teks tenang di bawah field input.
 *
 * Filosofi Desain:
 * - Tidak ada tombol "kembalikan ke minimal" agar tidak mendorong (nudge)
 *   peneliti untuk menurunkan hadiah yang sudah direkomendasikan sistem.
 * - Peneliti bebas mengubah nominal manual lewat input jika berkehendak.
 * - Tombol preset saran [ ⭐ Pasang Rp ... ] HANYA muncul jika nominal saat ini di bawah saran.
 */
export function RewardRecommendationHint({
  value,
  onChange,
  questionCount = 0,
  disabled = false,
  className = '',
}: RewardRecommendationHintProps) {
  const { t } = useLanguage();

  const recommendedPrize = useMemo(
    () => getRecommendedPrize(questionCount),
    [questionCount]
  );

  const formattedMin = `Rp ${MIN_PRIZE_PER_WINNER.toLocaleString('id-ID')}`;
  const formattedRec = `Rp ${recommendedPrize.toLocaleString('id-ID')}`;

  // 1. Nilai pas dengan rekomendasi (baik survei pendek Rp 25.000 maupun panjang Rp 50.000)
  if (value === recommendedPrize) {
    return (
      <span className={`text-xs text-emerald-700 font-medium ${className}`}>
        {questionCount > 0
          ? t('rewardRecommendationMatches', { count: questionCount, minAmount: formattedMin })
          : t('rewardRecommendationDefault', { minAmount: formattedMin })}
      </span>
    );
  }

  // 2. Nilai di atas rekomendasi (misal diisi lebih tinggi agar lebih menarik)
  if (value > recommendedPrize) {
    return (
      <span className={`text-xs text-emerald-700 font-medium ${className}`}>
        {questionCount > 0
          ? t('rewardAboveRecommendation', { count: questionCount })
          : t('rewardAboveDefault', { minAmount: formattedMin })}
      </span>
    );
  }

  // 3. Nilai di bawah rekomendasi (misal survei panjang 68 pertanyaan tapi nominal < 50.000)
  // Tampilkan dorongan upgrade [ ⭐ Pasang Rp 50.000 ] tanpa tombol downgrade
  return (
    <span className={`inline-flex items-center gap-1.5 flex-wrap text-slate-500 text-xs ${className}`}>
      <span>{t('rewardSuggestionPrefix')}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(recommendedPrize)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[11px] text-jfu-primary bg-indigo-50 hover:bg-indigo-100/90 border border-indigo-200/80 transition-colors cursor-pointer select-none"
      >
        <span>{t('rewardApplyRecommendation', { amount: formattedRec })}</span>
      </button>
      <span className="text-slate-300">·</span>
      <span>{t('rewardAttractivenessNote')}</span>
    </span>
  );
}
