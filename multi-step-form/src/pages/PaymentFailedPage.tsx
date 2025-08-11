import { useEffect, useState } from 'react';
import { PaymentFailed } from '../components/PaymentFailed';

export default function PaymentFailedPage() {
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
    console.log('PaymentFailedPage - URL parameters:', {
      form_id: id,
      payment_id: paymentId,
      allParams: Object.fromEntries(params.entries())
    });

    setFormId(id);
  }, []);

  return (
    <div className="container mx-auto px-4">
      <PaymentFailed formId={formId || undefined} />
    </div>
  );
}
