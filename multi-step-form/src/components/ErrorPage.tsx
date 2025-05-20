import { useEffect, useState } from 'react';

interface ErrorPageProps {
  title?: string;
  message?: string;
  errorCode?: string;
  referenceId?: string;
  onRetry?: () => void;
}

export function ErrorPage({
  title = 'Terjadi Kesalahan',
  message = 'Terjadi kesalahan saat mengambil data',
  errorCode,
  referenceId,
  onRetry
}: ErrorPageProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  // Reset retrying state after 3 seconds
  useEffect(() => {
    let timer: number;
    if (isRetrying) {
      timer = window.setTimeout(() => {
        setIsRetrying(false);
      }, 3000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isRetrying]);

  const handleRetry = () => {
    setIsRetrying(true);
    if (onRetry) {
      onRetry();
    }
  };

  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </div>
      
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <p className="text-gray-600 mb-6">{message}</p>
      
      <div className="space-y-4">
        <a href="/" className="button button-primary">
          Kembali ke Beranda
        </a>
        
        {onRetry && (
          <div className="mt-4">
            <button 
              onClick={handleRetry}
              disabled={isRetrying}
              className={`button ${isRetrying ? 'button-disabled' : 'button-secondary'}`}
            >
              {isRetrying ? 'Mencoba Ulang...' : 'Coba Lagi'}
            </button>
          </div>
        )}
      </div>
      
      {(errorCode || referenceId) && (
        <div className="mt-6 text-sm text-gray-500">
          {errorCode && <p>Kode Error: {errorCode}</p>}
          {referenceId && <p className="mt-2">ID Referensi: {referenceId}</p>}
        </div>
      )}
    </div>
  );
}
