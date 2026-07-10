import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  id?: string;
  className?: string;
  error?: boolean;
}

export function Combobox({ value, onChange, options, placeholder, id, className = '', error }: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  // Filter options based on input value
  const filteredOptions = options.filter(opt => 
    opt.toLowerCase().includes((value || '').toLowerCase())
  );

  // Close when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (isOpen && activeIndex >= 0 && listboxRef.current) {
      const activeElement = listboxRef.current.children[activeIndex] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) setIsOpen(true);
      setActiveIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      if (isOpen && activeIndex >= 0 && activeIndex < filteredOptions.length) {
        e.preventDefault();
        onChange(filteredOptions[activeIndex]);
        setIsOpen(false);
      } else {
        // Allow enter to just close it if they typed something custom
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      <div className="relative">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full px-4 py-2.5 pr-10 rounded-xl border transition-all duration-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 ${
            error 
              ? 'border-red-500 hover:border-red-600 focus:ring-red-500/20 focus:border-red-500' 
              : 'border-gray-200 hover:border-gray-300 focus:ring-blue-500/20 focus:border-blue-500'
          }`}
        />
        <div 
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer p-1"
          onClick={() => setIsOpen(!isOpen)}
        >
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-lg shadow-lg shadow-slate-200/50 overflow-hidden">
          <ul 
            ref={listboxRef}
            className="max-h-60 overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-slate-200"
          >
            {filteredOptions.length === 0 ? (
              <li className="px-4 py-3 text-sm text-slate-500 text-center">
                Gunakan "{value}"
              </li>
            ) : (
              filteredOptions.map((opt, idx) => (
                <li
                  key={opt}
                  className={`px-4 py-2.5 text-sm cursor-pointer flex items-center justify-between transition-colors ${
                    idx === activeIndex 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  onClick={() => {
                    onChange(opt);
                    setIsOpen(false);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                >
                  <span className="truncate">{opt}</span>
                  {value === opt && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
