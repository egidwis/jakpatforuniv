import { useEffect, useState } from 'react';
import { PaymentSuccess } from '../components/PaymentSuccess';

export default function PaymentSuccessPage() {
  const [formId, setFormId] = useState<string | null>(null);

  useEffect(() => {
    // Ambil ID dari URL query parameter
    const params = new URLSearchParams(window.location.search);

    // Check for form_id first (new format)
    let id = params.get('form_id');

    // If form_id is not found, try the old 'id' parameter as fallback
    if (!id) {
      id = params.get('id');
    }

    // Get payment_id for logging
    const paymentId = params.get('payment_id');

    // Log untuk debugging
    console.log('PaymentSuccessPage - URL parameters:', {
      form_id: id,
      payment_id: paymentId,
      fullUrl: window.location.href,
      search: window.location.search,
      allParams: Object.fromEntries(params.entries())
    });

    if (id) {
      setFormId(id);
      console.log('Form ID set to:', id);
    } else {
      console.error('No form ID found in URL parameters');
    }
  }, []);

  return (
    <div className="container mx-auto px-4">
      <PaymentSuccess formId={formId || undefined} />
    </div>
  );
}
