import { useEffect, useState } from 'react';
import { PaymentSuccess } from '../components/PaymentSuccess';

export default function PaymentSuccessPage() {
  const [formId, setFormId] = useState<string | null>(null);
  const [isSimulation, setIsSimulation] = useState<boolean>(false);

  useEffect(() => {
    // Ambil ID dan simulation dari URL query parameter
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const simulation = params.get('simulation');

    setFormId(id);
    setIsSimulation(simulation === 'true');
  }, []);

  return (
    <div className="container mx-auto px-4">
      <PaymentSuccess formId={formId || undefined} isSimulation={isSimulation} />
    </div>
  );
}
