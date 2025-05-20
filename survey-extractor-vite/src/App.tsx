import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { ThemeToggle } from './components/ThemeToggle';
import { MultiStepForm } from './components/MultiStepForm';
import './styles/form.css';

function App() {
  // Efek untuk menerapkan tema saat aplikasi dimuat
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const isDark = savedTheme === 'dark' ||
      (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);

    document.documentElement.classList.add(`${isDark ? 'dark' : 'light'}-theme`);
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto py-6 px-4">
          <div className="flex justify-end mb-4">
            <ThemeToggle />
          </div>
          <h1 className="text-3xl font-bold text-center">
            Submit survey
          </h1>
          <p className="text-center text-muted mt-2">
            Iklankan survey kamu ke 1.7Juta responden Jakpat
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto py-8 px-4">
        <MultiStepForm />
      </main>

      <footer className="border-t border-border py-6">
        <div className="max-w-6xl mx-auto text-center text-sm text-muted px-4">
          <p>
            Jakpat for Universities | Dibuat dengan{" "}
            <a
              href="https://vite.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Vite
            </a>
          </p>
        </div>
      </footer>

      <Toaster position="top-center" />
    </div>
  );
}

export default App
