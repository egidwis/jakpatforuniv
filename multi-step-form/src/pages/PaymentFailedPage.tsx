import { useEffect, useState } from 'react';
import { PaymentFailed } from '../components/PaymentFailed';

export default function PaymentFailedPage() {
  const [formId, setFormId] = useState<string | null>(null);
  
  useEffect(() => {
    // Ambil ID dari URL query parameter
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    setFormId(id);
  }, []);
  
  return (
    <div className="container mx-auto px-4">
      <PaymentFailed formId={formId || undefined} />
    </div>
  );
}
