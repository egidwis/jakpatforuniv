import { Minus, Plus } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export const DURATION_PRESETS = [1, 2, 5, 7, 14];

export interface DurationPickerProps {
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  presets?: number[];
  unitLabel?: string;
  id?: string;
  className?: string;
}

/**
 * Pemilih durasi tayang (1–30 hari) yang konsisten di seluruh aplikasi:
 * chip preset cepat (1, 2, 5, 7, 14 hari) + stepper numerik (+ / -).
 */
export function DurationPicker({
  value,
  onChange,
  disabled = false,
  min = 1,
  max = 30,
  presets = DURATION_PRESETS,
  unitLabel,
  id = 'duration',
  className = '',
}: DurationPickerProps) {
  const { t } = useLanguage();
  const unit = unitLabel ?? t('scheduleAgainDays');
  const safeVal = Math.max(min, Math.min(max, value || min));

  const handleStep = (delta: number) => {
    if (disabled) return;
    const next = Math.max(min, Math.min(max, safeVal + delta));
    onChange(next);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const raw = e.target.value.replace(/[^0-9]/g, '');
    if (!raw) {
      onChange(min);
      return;
    }
    const parsed = parseInt(raw, 10);
    onChange(Math.max(min, Math.min(max, parsed)));
  };

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${className}`}>
      {/* Preset Chips */}
      <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
        {presets.map((preset) => {
          const isSelected = safeVal === preset;
          return (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              onClick={() => onChange(preset)}
              className={`h-7 sm:h-7.5 px-2.5 rounded-lg text-xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 disabled:opacity-50 ${
                isSelected
                  ? 'bg-jfu-primary text-white font-semibold shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium'
              }`}
            >
              {preset} {unit}
            </button>
          );
        })}
      </div>

      {/* Stepper Input */}
      <div className="h-7 sm:h-7.5 flex items-center gap-0.5 sm:gap-1 bg-slate-100 border border-slate-200 rounded-lg p-0.5 shrink-0">
        <button
          type="button"
          disabled={disabled || safeVal <= min}
          onClick={() => handleStep(-1)}
          aria-label={t('scheduleAgainDurationLess')}
          className="w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-md bg-white hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary disabled:opacity-40 cursor-pointer"
        >
          <Minus className="w-3 h-3" />
        </button>
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          value={safeVal}
          onChange={handleInputChange}
          disabled={disabled}
          aria-label={t('adDuration')}
          className="w-7 sm:w-8 h-6 sm:h-6.5 text-center font-semibold text-slate-800 bg-transparent text-xs rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary"
        />
        <button
          type="button"
          disabled={disabled || safeVal >= max}
          onClick={() => handleStep(1)}
          aria-label={t('scheduleAgainDurationMore')}
          className="w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-md bg-white hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary disabled:opacity-40 cursor-pointer"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
