'use client';
import { useSearchParams } from 'next/navigation';
import Checkout from './checkout';
import { resolveAmount } from '@/lib/campaign';
export default function CheckoutEntry() {
  const params = useSearchParams();
  const amount = resolveAmount(params.get('valor') ?? undefined);
  const mode = params.get('modalidade') === 'avulsa' ? 'extra' : 'numbers';
  return <Checkout key={`${amount}-${mode}`} initialAmount={amount} initialMode={mode} />;
}
