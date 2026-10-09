import { Suspense } from 'react';
import PaymentFrame from '@/components/payment-frame';
import DemoPayment from '@/components/demo-payment';
export default function Pagamento() {
  return (
    <PaymentFrame>
      <Suspense fallback={<div className="demo-payment-card">Carregando simulação.</div>}>
        <DemoPayment />
      </Suspense>
    </PaymentFrame>
  );
}
