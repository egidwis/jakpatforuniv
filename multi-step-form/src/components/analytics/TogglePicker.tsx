import { useRef } from 'react';
import type { ComponentType } from 'react';
import { CHART, INK } from './palette';

/**
 * Segmented control dashboard Analytics — dua semantik, satu tampilan.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  KENAPA ADA DUA MODE, DAN KENAPA TIDAK BOLEH DISATUKAN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kontrol ini terlihat sama di dua tempat, tapi ARTINYA berbeda bagi pembaca layar:
 *
 *   • `mode="toggle"` — sekumpulan tombol yang mengubah tampilan mark yang sama
 *     (Batang/Garis, Grafik/Tabel). ARIA-nya `role="group"` + `aria-pressed`.
 *
 *   • `mode="tabs"` — kontrol yang MENUKAR PANEL KONTEN (Universitas/Jurusan/
 *     Customer). ARIA-nya `role="tablist"` + `role="tab"` + `aria-selected` +
 *     `aria-controls`, dan WAJIB bisa dinavigasi tombol panah.
 *
 * Memakai `aria-pressed` untuk yang kedua adalah kesalahan yang gampang lolos review
 * visual: layarnya benar, tapi pembaca layar mengumumkan "tombol, ditekan" dan tidak
 * pernah menyebut bahwa ada tiga panel yang bisa ditukar, atau panel mana yang sedang
 * tampil. Karena itu modenya eksplisit, bukan ditebak dari jumlah opsi.
 *
 * Navigasi keyboard mode `tabs` mengikuti pola APG: satu tab stop untuk seluruh
 * tablist (roving `tabIndex`), lalu ←/→ berpindah dan Home/End melompat ke ujung.
 * Tanpa roving tabIndex, tablist berisi enam tab memaksa enam kali Tab hanya untuk
 * melewatinya.
 */

export interface TogglePickerOption<T extends string> {
    value: T;
    label: string;
    icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
    disabled?: boolean;
    title?: string;
}

export interface TogglePickerProps<T extends string> {
    value: T;
    options: Array<TogglePickerOption<T>>;
    onChange: (value: T) => void;
    ariaLabel: string;
    /** `toggle` (bawaan) untuk tombol tampilan; `tabs` saat kontrolnya menukar panel. */
    mode?: 'toggle' | 'tabs';
    /**
     * Hanya mode `tabs`. Dipakai membentuk `id` tab dan `aria-controls` ke panelnya.
     * Panel yang bersangkutan harus memakai `id={`${idBase}-panel`}` dan
     * `aria-labelledby={`${idBase}-tab-${value}`}`.
     */
    idBase?: string;
    className?: string;
}

export function TogglePicker<T extends string>({
    value,
    options,
    onChange,
    ariaLabel,
    mode = 'toggle',
    idBase,
    className = '',
}: TogglePickerProps<T>) {
    const isTabs = mode === 'tabs';
    const listRef = useRef<HTMLDivElement | null>(null);

    /** ←/→/Home/End berpindah tab. Hanya relevan di mode `tabs`. */
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!isTabs) return;
        const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!keys.includes(event.key)) return;

        const enabled = options.filter((o) => !o.disabled);
        if (enabled.length === 0) return;
        const current = enabled.findIndex((o) => o.value === value);

        let nextIndex: number;
        if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = enabled.length - 1;
        else {
            const step = event.key === 'ArrowRight' ? 1 : -1;
            nextIndex = (current + step + enabled.length) % enabled.length;
        }

        const next = enabled[nextIndex];
        if (!next || next.value === value) return;
        event.preventDefault();
        onChange(next.value);
        // Fokus mengikuti seleksi — itu yang membuat pengumuman panelnya benar.
        listRef.current
            ?.querySelector<HTMLButtonElement>(`[data-toggle-value="${next.value}"]`)
            ?.focus();
    };

    return (
        <div
            ref={listRef}
            role={isTabs ? 'tablist' : 'group'}
            aria-label={ariaLabel}
            onKeyDown={handleKeyDown}
            className={`inline-flex rounded-md border p-0.5 ${className}`}
            style={{ borderColor: CHART.grid }}
        >
            {options.map((option) => {
                const Icon = option.icon;
                const isActive = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        data-toggle-value={option.value}
                        id={isTabs && idBase ? `${idBase}-tab-${option.value}` : undefined}
                        role={isTabs ? 'tab' : undefined}
                        aria-selected={isTabs ? isActive : undefined}
                        aria-controls={isTabs && idBase ? `${idBase}-panel` : undefined}
                        aria-pressed={isTabs ? undefined : isActive}
                        // Roving tabIndex: satu tab stop untuk seluruh tablist.
                        tabIndex={isTabs ? (isActive ? 0 : -1) : undefined}
                        disabled={option.disabled}
                        title={option.title}
                        onClick={() => onChange(option.value)}
                        className="inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[12px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40"
                        style={{
                            backgroundColor: isActive ? CHART.contextSoft : 'transparent',
                            color: isActive ? INK.primary : INK.muted,
                        }}
                    >
                        {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

export default TogglePicker;
