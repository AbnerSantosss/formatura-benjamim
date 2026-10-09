import { Suspense } from 'react';
import { Header, Footer } from '@/components/shared';
import DemoPayment from '@/components/demo-payment';
export default function Pagamento() {
  return <><Header checkout /><main id="conteudo" className="demo-payment-main"><Suspense fallback={<p>Carregando simulação…</p>}><DemoPayment /></Suspense></main><Footer /></>;
}
