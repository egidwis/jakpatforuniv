import { useState, useEffect } from 'react';
import { MoonIcon, SunIcon } from '@radix-ui/react-icons';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [mounted, setMounted] = useState(false);

  // Fungsi untuk mengubah tema
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.classList.remove(`${theme}-theme`);
    document.documentElement.classList.add(`${newTheme}-theme`);
    localStorage.setItem('theme', newTheme);
  };

  // Efek untuk mendeteksi tema dari localStorage atau preferensi sistem
  useEffect(() => {
    setMounted(true);
    
    // Cek tema dari localStorage
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    
    // Jika ada tema tersimpan, gunakan itu
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.add(`${savedTheme}-theme`);
    } 
    // Jika tidak, gunakan preferensi sistem
    else {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(isDark ? 'dark' : 'light');
      document.documentElement.classList.add(`${isDark ? 'dark' : 'light'}-theme`);
    }
  }, []);

  // Jika belum mounted, jangan render apa-apa untuk menghindari flash
  if (!mounted) return null;

  return (
    <button 
      onClick={toggleTheme}
      className="button button-outline button-icon"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? (
        <SunIcon className="w-4 h-4" />
      ) : (
        <MoonIcon className="w-4 h-4" />
      )}
    </button>
  );
}
