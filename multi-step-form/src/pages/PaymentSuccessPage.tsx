import { useEffect, useState } from 'react';
import { PaymentSuccess } from '../components/PaymentSuccess';

export default function PaymentSuccessPage() {
  // Resolve the id synchronously on the first render so the child never receives
  // `undefined` first. Previously the id was set from an effect, so the child
  // mounted with no id, latched an "ID form tidak ditemukan" error, and kept
  // showing it even after the id arrived. Supports the new `form_id` param and
  // the legacy `id` param (DOKU redirects / older links).
  const [formId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('form_id') || params.get('id');
  });
  /**
   * `?schedule=` — jadwal yang benar-benar dibayar.
   *
   * Dibaca sekali bersama `formId`, dengan alasan yang sama. Kosong untuk
   * SEMUA link yang terbit sebelum ini; halaman jatuh ke perilaku lama.
   */
  const [scheduleId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('schedule');
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Log untuk debugging
    console.log('PaymentSuccessPage - URL parameters:', {
      form_id: formId,
      payment_id: params.get('payment_id'),
      fullUrl: window.location.href,
      search: window.location.search,
      allParams: Object.fromEntries(params.entries()),
    });
    if (!formId) {
      console.error('No form ID found in URL parameters');
    }
  }, [formId]);

  return (
    <div className="container mx-auto px-4">
      <PaymentSuccess formId={formId || undefined} scheduleId={scheduleId || undefined} />
    </div>
  );
}
