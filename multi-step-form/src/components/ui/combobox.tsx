import React, { useId, useMemo, useRef, useEffect, useState } from 'react';
import { ChevronDown, Check, Plus } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

export interface ComboboxProps {
    value: string;
    onChange: (value: string) => void;
    options: string[];
    placeholder?: string;
    id?: string;
    className?: string;
    error?: boolean;
    /**
     * - `dropdown`: input dengan tombol panah dropdown (tampil seluruh opsi saat fokus).
     * - `predictive`: input teks murni tanpa panah dropdown; saran hanya muncul saat mengetik
     *   (dibatasi agar ringkas) dan selalu menyediakan opsi menambahkan teks custom bila belum ada di daftar.
     */
    mode?: 'dropdown' | 'predictive';
    /** Jumlah maksimal saran pada mode `predictive` (default: 6). */
    maxSuggestions?: number;
}

/**
 * Mengurutkan saran prediktif berdasarkan relevansi:
 * 1. Diawali query (`startsWith`)
 * 2. Cocok di awal kata atau singkatan dalam tanda kurung (mis. "(UGM)", "(Polnes)")
 * 3. Cocok di bagian lain string
 */
export function rankSuggestions(options: string[], rawQuery: string, limit?: number): string[] {
    const q = rawQuery.trim().toLowerCase();
    if (!q) return typeof limit === 'number' ? options.slice(0, limit) : options;

    const startsWith: string[] = [];
    const wordOrAcronym: string[] = [];
    const includes: string[] = [];

    for (const opt of options) {
        const lower = opt.toLowerCase();
        const idx = lower.indexOf(q);
        if (idx === -1) continue;
        if (idx === 0) {
            startsWith.push(opt);
        } else if (/[\s(\-/]/.test(lower[idx - 1])) {
            wordOrAcronym.push(opt);
        } else {
            includes.push(opt);
        }
    }

    const ranked = [...startsWith, ...wordOrAcronym, ...includes];
    return typeof limit === 'number' ? ranked.slice(0, limit) : ranked;
}

function renderHighlighted(text: string, rawQuery: string): React.ReactNode {
    const q = rawQuery.trim();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
        <>
            {text.slice(0, idx)}
            <mark className="bg-transparent font-semibold text-slate-950">
                {text.slice(idx, idx + q.length)}
            </mark>
            {text.slice(idx + q.length)}
        </>
    );
}

export function Combobox({
    value,
    onChange,
    options,
    placeholder,
    id,
    className = '',
    error,
    mode = 'dropdown',
    maxSuggestions = 6,
}: ComboboxProps) {
    const { language } = useLanguage();
    const isEn = language === 'en';
    const isPredictive = mode === 'predictive';
    const listboxId = useId();

    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const listboxRef = useRef<HTMLUListElement>(null);

    const trimmed = (value || '').trim();
    const hasExactMatch = useMemo(
        () => trimmed.length > 0 && options.some((opt) => opt.toLowerCase() === trimmed.toLowerCase()),
        [options, trimmed],
    );

    const filteredOptions = useMemo(
        () => rankSuggestions(options, value || '', isPredictive ? maxSuggestions : undefined),
        [options, value, isPredictive, maxSuggestions],
    );

    // Opsi menambahkan input custom ketika belum ada kecocokan persis di daftar
    const showCustomOption = trimmed.length > 0 && !hasExactMatch;
    const totalItems = filteredOptions.length + (showCustomOption ? 1 : 0);
    const shouldRenderPopup = isOpen && (isPredictive ? trimmed.length > 0 && totalItems > 0 : true);

    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    useEffect(() => {
        if (shouldRenderPopup && activeIndex >= 0 && listboxRef.current) {
            const activeElement = listboxRef.current.children[activeIndex] as HTMLElement | undefined;
            activeElement?.scrollIntoView({ block: 'nearest' });
        }
    }, [activeIndex, shouldRenderPopup]);

    const commitValue = (next: string) => {
        onChange(next);
        setIsOpen(false);
        setActiveIndex(-1);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            if (!shouldRenderPopup && (!isPredictive || trimmed.length > 0)) {
                e.preventDefault();
                setIsOpen(true);
                setActiveIndex(0);
                return;
            }
            if (totalItems > 0) {
                e.preventDefault();
                setActiveIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
            }
        } else if (e.key === 'ArrowUp') {
            if (shouldRenderPopup && totalItems > 0) {
                e.preventDefault();
                setActiveIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
            }
        } else if (e.key === 'Enter') {
            if (shouldRenderPopup && activeIndex >= 0 && activeIndex < filteredOptions.length) {
                e.preventDefault();
                commitValue(filteredOptions[activeIndex]);
            } else if (shouldRenderPopup && showCustomOption && activeIndex === filteredOptions.length) {
                e.preventDefault();
                commitValue(trimmed);
            } else if (shouldRenderPopup) {
                e.preventDefault();
                setIsOpen(false);
            }
        } else if (e.key === 'Escape') {
            if (shouldRenderPopup) {
                e.preventDefault();
                e.stopPropagation();
            }
            setIsOpen(false);
            setActiveIndex(-1);
        }
    };

    return (
        <div className={`relative w-full ${className}`} ref={containerRef}>
            <div className="relative">
                <input
                    id={id}
                    type="text"
                    role="combobox"
                    aria-expanded={shouldRenderPopup}
                    aria-autocomplete="list"
                    aria-controls={shouldRenderPopup ? listboxId : undefined}
                    value={value}
                    onChange={(e) => {
                        const next = e.target.value;
                        onChange(next);
                        setIsOpen(isPredictive ? next.trim().length > 0 : true);
                        setActiveIndex(-1);
                    }}
                    onFocus={() => {
                        if (!isPredictive) {
                            setIsOpen(true);
                        } else if (trimmed.length > 0 && !hasExactMatch) {
                            setIsOpen(true);
                        }
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    autoComplete="off"
                    className={`w-full px-3.5 py-2.5 ${isPredictive ? '' : 'pr-10'} rounded-xl border transition-colors duration-150 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
                        error
                            ? 'border-red-500 hover:border-red-600 focus:ring-red-500/15 focus:border-red-500'
                            : 'border-slate-200 hover:border-slate-300 focus:ring-jfu-primary/15 focus:border-jfu-primary'
                    }`}
                />
                {!isPredictive && (
                    <button
                        type="button"
                        tabIndex={-1}
                        aria-label={isOpen ? (isEn ? 'Close options' : 'Tutup pilihan') : (isEn ? 'Open options' : 'Buka pilihan')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setIsOpen(!isOpen)}
                    >
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                )}
            </div>

            {shouldRenderPopup && (
                <div className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-900/10 overflow-hidden">
                    <ul
                        id={listboxId}
                        ref={listboxRef}
                        role="listbox"
                        className="max-h-60 overflow-y-auto py-1 [scrollbar-width:thin] [scrollbar-color:rgb(203_213_225)_transparent]"
                    >
                        {filteredOptions.map((opt, idx) => {
                            const isSelected = opt.toLowerCase() === trimmed.toLowerCase();
                            return (
                                <li
                                    key={opt}
                                    role="option"
                                    aria-selected={isSelected}
                                    className={`px-3.5 py-2 text-sm cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                                        idx === activeIndex
                                            ? 'bg-blue-50 text-jfu-primary'
                                            : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => commitValue(opt)}
                                    onMouseEnter={() => setActiveIndex(idx)}
                                >
                                    <span className="truncate">{renderHighlighted(opt, value)}</span>
                                    {isSelected && <Check className="w-4 h-4 text-jfu-primary shrink-0" />}
                                </li>
                            );
                        })}

                        {showCustomOption && (
                            <li
                                role="option"
                                aria-selected={false}
                                className={`px-3.5 py-2.5 text-sm cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                                    filteredOptions.length > 0 ? 'border-t border-slate-100 mt-1 pt-2.5' : ''
                                } ${
                                    activeIndex === filteredOptions.length
                                        ? 'bg-blue-50 text-jfu-primary'
                                        : 'text-slate-700 hover:bg-slate-50'
                                }`}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => commitValue(trimmed)}
                                onMouseEnter={() => setActiveIndex(filteredOptions.length)}
                            >
                                <span className="inline-flex items-center gap-2 min-w-0">
                                    <Plus className="w-3.5 h-3.5 text-jfu-primary shrink-0" aria-hidden="true" />
                                    <span className="truncate">
                                        {isEn ? 'Use' : 'Gunakan'}{' '}
                                        <strong className="font-semibold text-slate-900">"{trimmed}"</strong>
                                    </span>
                                </span>
                                <span className="text-[11px] text-slate-400 shrink-0">
                                    {isEn ? 'Custom' : 'Baru'}
                                </span>
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
