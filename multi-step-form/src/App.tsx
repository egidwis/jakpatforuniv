import { Toaster } from 'sonner';
import { MultiStepForm } from './components/MultiStepForm';
import './styles.css';

function App() {
  return (
    <div className="min-h-screen">
      <header className="header">
        <div className="container">
          <h1>Submit survey</h1>
          <p>Iklankan survey kamu ke 1.7Juta responden Jakpat</p>
        </div>
      </header>

      <main className="container py-8">
        <MultiStepForm />
      </main>

      <footer className="footer">
        <div className="container">
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

export default App;
